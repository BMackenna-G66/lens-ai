"""Persistencia operacional de corridas — Fase 1.

El criterio de terminado del plan es concreto: *«consultar por ambiente y
empresa devuelve la última corrida y su historial, con el cluster analítico
pausado»*. Eso se prueba acá contra el modo memoria, que tiene la misma
semántica que DynamoDB — y es lo que permite construir las Fases 2 a 4 sin
esperar a que se destrabe el despliegue.

Lo que estos tests protegen de verdad son tres silencios:

  · una corrida que no aparece porque el ambiente venía escrito distinto
  · una empresa bloqueada para siempre por una corrida que murió a mitad
  · un `NOT_STARTED` sobre una corrida que sí ocurrió
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import corridas as co  # noqa: E402


@pytest.fixture(autouse=True)
def memoria_limpia():
    co._reiniciar_memoria()
    yield
    co._reiniciar_memoria()


T0 = 1_759_000_000.0   # un instante cualquiera, fijo para que nada dependa del reloj


# ════════════════════════════════════════════════════════════════════════════
# El criterio de terminado del plan
# ════════════════════════════════════════════════════════════════════════════

def test_consultar_por_ambiente_y_empresa_devuelve_la_ultima_y_el_historial():
    for i, t in enumerate([T0, T0 + 60, T0 + 120]):
        co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=t)
        co.cerrar("prod", "ACME-1", f"a{i}", co.COMPLETED, ahora=t + 1)

    u = co.ultima("prod", "ACME-1")
    assert u is not None and u["analysisId"] == "a2", "la última tiene que ser la más reciente"

    h = co.historial("prod", "ACME-1")
    assert [f["analysisId"] for f in h] == ["a2", "a1", "a0"], "de la más reciente a la más vieja"


def test_una_empresa_sin_corridas_es_not_started():
    """`NOT_STARTED` es la AUSENCIA de registro, no un valor guardado."""
    assert co.estado("prod", "NUNCA-ANALIZADA") == co.NOT_STARTED
    assert co.ultima("prod", "NUNCA-ANALIZADA") is None
    assert co.historial("prod", "NUNCA-ANALIZADA") == []


def test_not_started_no_se_guarda_nunca():
    """Guardarlo produciría una fila que dice «no pasó nada», indistinguible de
    una escritura que se perdió."""
    assert co.NOT_STARTED not in co.GUARDABLES
    assert co.GUARDABLES == {co.IN_PROGRESS, co.COMPLETED, co.INCOMPLETE, co.FAILED}


# ════════════════════════════════════════════════════════════════════════════
# El ambiente es parte de la clave, y es el punto de la fase
# ════════════════════════════════════════════════════════════════════════════

def test_el_mismo_company_id_en_dos_ambientes_no_se_pisa():
    """LA razón por la que el ambiente está en la clave: sin esto, una prueba de
    desarrollo pisa la lectura de una empresa real, y en silencio."""
    co.registrar_inicio("dev", "ACME-1", "de-dev", ahora=T0)
    co.registrar_inicio("prod", "ACME-1", "de-prod", ahora=T0)

    assert co.ultima("dev", "ACME-1")["analysisId"] == "de-dev"
    assert co.ultima("prod", "ACME-1")["analysisId"] == "de-prod"
    assert len(co.historial("prod", "ACME-1")) == 1, "la corrida de dev no puede aparecer acá"


@pytest.mark.parametrize("escrito", ["PROD", " prod ", "Prod"])
def test_el_ambiente_se_normaliza(escrito):
    """`PROD` y `prod` son el mismo ambiente. Que no lo fueran daría
    `NOT_STARTED` sobre una corrida que sí ocurrió."""
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert co.estado(escrito, "ACME-1", ahora=T0 + 1) == co.IN_PROGRESS


def test_el_company_id_no_se_normaliza():
    """Es un identificador opaco de ms-company. Bajarlo a minúsculas podría unir
    dos empresas distintas, que es un error peor que separarlas de más."""
    co.registrar_inicio("prod", "ACME", "mayus", ahora=T0)
    assert co.estado("prod", "acme") == co.NOT_STARTED


def test_la_clave_no_es_ambigua():
    """El ambiente normalizado no puede contener el separador, así que no hay dos
    pares distintos que produzcan la misma clave."""
    assert co.SEP not in co.normalizar_ambiente("pro#d")
    assert co.clave("prod", "b#c") != co.clave("prod#b", "c")


def test_la_lista_de_ambientes_vacia_acepta_cualquiera():
    """Queda abierta por defecto porque los tres nombres no están confirmados y
    adivinarlos bloquearía tráfico legítimo el primer día."""
    assert co.AMBIENTES == ()
    assert co.ambiente_admitido("cualquier-cosa")
    assert not co.ambiente_admitido(""), "vacío no es un ambiente"


def test_con_lista_configurada_se_rechaza_lo_que_no_esta(monkeypatch):
    """Cuando Onboarding confirme los nombres, setear la variable cierra la
    trampa del `prod` contra `production` sin tocar código."""
    monkeypatch.setattr(co, "AMBIENTES", ("dev", "staging", "prod"))
    assert co.ambiente_admitido("prod")
    assert not co.ambiente_admitido("production")


# ════════════════════════════════════════════════════════════════════════════
# Los cinco estados
# ════════════════════════════════════════════════════════════════════════════

def test_registrar_inicio_deja_en_progreso():
    reg = co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert reg["status"] == co.IN_PROGRESS
    assert reg["finishedAt"] is None
    assert co.estado("prod", "ACME-1", ahora=T0 + 1) == co.IN_PROGRESS


@pytest.mark.parametrize("final", [co.COMPLETED, co.INCOMPLETE, co.FAILED])
def test_cerrar_lleva_al_estado_terminal(final):
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    reg = co.cerrar("prod", "ACME-1", "a1", final, ahora=T0 + 10)
    assert reg["status"] == final
    assert reg["finishedAt"] is not None
    assert co.estado("prod", "ACME-1", ahora=T0 + 11) == final


def test_un_estado_que_el_contrato_no_define_se_cierra_como_failed():
    """El consumidor tiene una lista cerrada: un valor nuevo lo deja sin manejar.
    Mismo criterio que `contrato.error` y `errores.error_http`."""
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    reg = co.cerrar("prod", "ACME-1", "a1", "CASI_LISTO", ahora=T0 + 10)
    assert reg["status"] == co.FAILED


def test_cerrar_algo_que_no_se_registro_devuelve_none():
    """No inventa la fila: que no esté significa que el inicio no se escribió, y
    eso es justamente lo que el orden de la Fase 2 existe para no hacer."""
    assert co.cerrar("prod", "ACME-1", "fantasma", co.COMPLETED) is None


def test_cerrar_no_crea_una_corrida_nueva():
    co.cerrar("prod", "ACME-1", "fantasma", co.COMPLETED)
    assert co.historial("prod", "ACME-1") == []


def test_cerrar_actualiza_la_fila_en_vez_de_agregar_otra():
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 10)
    assert len(co.historial("prod", "ACME-1")) == 1


# ════════════════════════════════════════════════════════════════════════════
# La corrida en curso: lo que decide el 409
# ════════════════════════════════════════════════════════════════════════════

def test_hay_corrida_en_curso_mientras_no_cierre():
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert co.en_curso("prod", "ACME-1", ahora=T0 + 5) is not None


def test_no_hay_corrida_en_curso_despues_de_cerrar():
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 10)
    assert co.en_curso("prod", "ACME-1", ahora=T0 + 11) is None


def test_una_corrida_de_otra_empresa_no_bloquea():
    co.registrar_inicio("prod", "OTRA", "a1", ahora=T0)
    assert co.en_curso("prod", "ACME-1", ahora=T0 + 5) is None


def test_una_corrida_muerta_no_bloquea_a_la_empresa_para_siempre():
    """El bloqueo permanente que el plan no menciona y aparece al construirlo.

    Si el proceso muere a mitad —timeout de Lambda, falta de memoria, un
    deploy— la corrida queda `IN_PROGRESS`. Sin tope, EP-1 devolvería `409`
    sobre esa empresa hasta que alguien borre la fila a mano.
    """
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert co.en_curso("prod", "ACME-1", ahora=T0 + co.TOPE_EN_CURSO_S - 1) is not None
    assert co.en_curso("prod", "ACME-1", ahora=T0 + co.TOPE_EN_CURSO_S + 1) is None


def test_una_corrida_caducada_se_lee_como_failed():
    """Decir que sigue procesando algo que murió deja al consumidor esperando un
    resultado que no va a llegar nunca."""
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert co.estado("prod", "ACME-1", ahora=T0 + 1) == co.IN_PROGRESS
    assert co.estado("prod", "ACME-1", ahora=T0 + co.TOPE_EN_CURSO_S + 1) == co.FAILED


def test_la_caducidad_no_reescribe_la_fila():
    """El estado guardado es lo que pasó; la caducidad es cómo se lee hoy.
    Reescribir haría que el historial mienta sobre lo que el proceso reportó."""
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.estado("prod", "ACME-1", ahora=T0 + co.TOPE_EN_CURSO_S + 1)
    assert co.ultima("prod", "ACME-1")["status"] == co.IN_PROGRESS


def test_una_corrida_cerrada_nunca_esta_caducada():
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 10)
    assert not co.caducada(co.ultima("prod", "ACME-1"), ahora=T0 + 10**6)


# ════════════════════════════════════════════════════════════════════════════
# El registro, que es lo que la Fase 3 va a serializar
# ════════════════════════════════════════════════════════════════════════════

def test_el_registro_trae_lo_que_ep1_tiene_que_devolver():
    reg = co.registrar_inicio(
        "prod", "ACME-1", "a1", country="chile", schema_version="1.2", ahora=T0,
    )
    for campo in ("companyId", "analysisId", "status", "startedAt", "schemaVersion"):
        assert campo in reg, f"EP-1 devuelve {campo} y el registro no lo tiene"
    assert reg["companyId"] == "ACME-1"
    assert reg["startedAt"].endswith("Z"), "la fecha viaja en UTC explícito"


def test_los_documentos_y_avisos_sobreviven_al_cierre():
    docs = [{"objectKey": "a/b.pdf", "documentType": "company_deeds_document"}]
    co.registrar_inicio("prod", "ACME-1", "a1", documentos=docs, ahora=T0)
    reg = co.cerrar(
        "prod", "ACME-1", "a1", co.INCOMPLETE,
        avisos=[{"reason": "PARTIALLY_ILLEGIBLE", "objectKey": "a/b.pdf"}],
        ahora=T0 + 10,
    )
    assert reg["documents"] == docs
    assert reg["warnings"][0]["reason"] == "PARTIALLY_ILLEGIBLE"


def test_el_historial_no_mezcla_empresas():
    co.registrar_inicio("prod", "A", "a1", ahora=T0)
    co.registrar_inicio("prod", "B", "b1", ahora=T0)
    assert [f["analysisId"] for f in co.historial("prod", "A")] == ["a1"]


def test_buscar_encuentra_una_corrida_vieja():
    """Buscar por id recorre el historial en vez de exigir el `sk`: si el `sk` se
    perdiera en el camino de una invocación asíncrona, la corrida quedaría
    colgada en `IN_PROGRESS`."""
    for i in range(5):
        co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=T0 + i * 10)
        co.cerrar("prod", "ACME-1", f"a{i}", co.COMPLETED, ahora=T0 + i * 10 + 5)
    assert co.buscar("prod", "ACME-1", "a0")["analysisId"] == "a0"
    assert co.buscar("prod", "ACME-1", "no-existe") is None


def test_una_corrida_caducada_no_se_cierra_ni_toca_la_nueva():
    """Dos corridas de la misma empresa solo conviven si la vieja caducó. Para
    entonces EP-2 ya la informó `FAILED`, así que un proceso rezagado que quiera
    cerrarla no puede: ni la cambia a ella, ni toca la nueva."""
    co.registrar_inicio("prod", "ACME-1", "vieja", ahora=T0)
    nueva_t = T0 + co.TOPE_EN_CURSO_S + 1
    co.registrar_inicio("prod", "ACME-1", "nueva", ahora=nueva_t)
    assert co.cerrar("prod", "ACME-1", "vieja", co.COMPLETED, ahora=nueva_t + 10) is None
    assert co.buscar("prod", "ACME-1", "vieja")["status"] == co.IN_PROGRESS, "la fila no se tocó"
    assert co.buscar("prod", "ACME-1", "nueva")["status"] == co.IN_PROGRESS


# ════════════════════════════════════════════════════════════════════════════
# El modo memoria dice lo que es
# ════════════════════════════════════════════════════════════════════════════

def test_sin_tabla_no_promete_persistencia():
    """Una persistencia que se pierde en silencio es peor que no tenerla. Mismo
    criterio que `almacen.disponible`."""
    assert co.TABLA == ""
    assert co.disponible() is False


def test_este_almacen_no_reemplaza_al_de_idempotencia():
    """Son dos cosas distintas: `almacen` guarda por `analysisId` para no
    re-analizar; este indexa por empresa para responder EP-2 y EP-3."""
    import inspect

    import almacen

    # Tablas distintas: una por `analysisId`, otra por ambiente+empresa. Compartir
    # la configuración las juntaría en una sola, y la clave no es la misma.
    fuente = inspect.getsource(almacen) + inspect.getsource(co)
    assert "ALMACEN_TABLA" in fuente and "CORRIDAS_TABLA" in fuente
    assert not hasattr(almacen, "registrar_inicio")
    assert not hasattr(co, "guardar")


# ════════════════════════════════════════════════════════════════════════════
# El camino de DynamoDB
# ════════════════════════════════════════════════════════════════════════════
# El modo memoria no ejercita la serialización ni la consulta ordenada, y hoy
# nadie puede desplegar para descubrirlo: los stacks están trabados desde el
# 31-08 y el 12-09. Así que se prueba contra una tabla falsa, que es lo único
# que separa «está escrito» de «funciona».


#: Las condiciones que usa `corridas`, en Python. Van indexadas por la MISMA
#: constante: si el código cambia una expresión sin cambiar esto, el test revienta
#: con KeyError en vez de probar una condición que ya no existe. Que la sintaxis
#: sea la que DynamoDB entiende lo prueba `test_corridas_dynamodb_real.py`.
CONDICIONES = {
    co.COND_CANDADO_LIBRE: lambda it, v: it is None or it["status"] != v[":en_curso"]
                                         or it["startedTs"] < v[":limite"],
    co.COND_FILA_NUEVA: lambda it, v: it is None,
    co.COND_CORRIDA_VIVA: lambda it, v: it is not None and it["status"] == v[":en_curso"]
                                        and it["startedTs"] >= v[":limite"],
    co.COND_CANDADO_PROPIO: lambda it, v: it is None or it.get("analysisId") == v[":aid"],
    co.COND_ANULABLE: lambda it, v: it is not None and it["status"] == v[":en_curso"]
                                    and it.get("analysisId") == v[":aid"],
}


class TablaFalsa:
    """Lo justo de DynamoDB para `corridas`: `query` ordenado por `sk`, con
    `ScanIndexForward` y `Limit`, y `transact_write_items` TODO O NADA, con las
    condiciones evaluadas antes de escribir y bajo un cerrojo —que es lo que hace
    que dos transacciones simultáneas se excluyan, como en DynamoDB—.

    Recibe los ítems en el formato de bajo nivel (`{"S": …}`) y los guarda en
    tipos de Python, que es lo que devuelve `query` a través del recurso.
    """

    def __init__(self):
        import threading
        from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
        self.items: dict[tuple, dict] = {}
        self.consultas = 0
        self.transacciones = 0
        self.conflictos_pendientes = 0
        self._cerrojo = threading.Lock()
        self._des = TypeDeserializer()
        self._ser = TypeSerializer()

    def _py(self, bajo: dict | None) -> dict:
        return {k: self._des.deserialize(v) for k, v in (bajo or {}).items()}

    def query(self, KeyConditionExpression, ScanIndexForward=True, Limit=None):
        self.consultas += 1
        pk = KeyConditionExpression._values[1]
        filas = sorted(
            (dict(v) for (p, _), v in self.items.items() if p == pk),
            key=lambda f: f["sk"], reverse=not ScanIndexForward,
        )
        return {"Items": filas[: Limit or len(filas)]}

    def get_item(self, Key, ConsistentRead=False):
        assert ConsistentRead, "el candado se lee con lectura fuerte"
        it = self.items.get((Key["pk"], Key["sk"]))
        return {"Item": dict(it)} if it else {}

    def transact_write_items(self, TransactItems):
        from botocore.exceptions import ClientError
        with self._cerrojo:
            self.transacciones += 1
            if self.conflictos_pendientes:
                self.conflictos_pendientes -= 1
                raise ClientError({"Error": {"Code": "TransactionCanceledException"},
                                   "CancellationReasons": [{"Code": "TransactionConflict"}]
                                   * len(TransactItems)}, "TransactWriteItems")
            pasos = []
            for t in TransactItems:
                (op, c), = t.items()
                assert c["TableName"] == co.TABLA
                clave = self._py(c.get("Item") or c.get("Key"))
                pasos.append((op, c, (clave["pk"], clave["sk"])))
            razones, fallo = [], False
            for op, c, k in pasos:
                actual = self.items.get(k)
                cond = c.get("ConditionExpression")
                ok = cond is None or CONDICIONES[cond](actual, self._py(c.get("ExpressionAttributeValues")))
                razon = {"Code": "None" if ok else "ConditionalCheckFailed"}
                if not ok and actual is not None and c.get("ReturnValuesOnConditionCheckFailure") == "ALL_OLD":
                    razon["Item"] = {kk: self._ser.serialize(vv) for kk, vv in actual.items()}
                razones.append(razon)
                fallo = fallo or not ok
            if fallo:
                raise ClientError({"Error": {"Code": "TransactionCanceledException"},
                                   "CancellationReasons": razones}, "TransactWriteItems")
            for op, c, k in pasos:
                if op == "Put":
                    self.items[k] = self._py(c["Item"])
                elif op == "Delete":
                    self.items.pop(k, None)

    def corridas(self) -> list[dict]:
        return [v for (p, _), v in self.items.items() if not p.startswith(co.SEP)]

    def candados(self) -> list[dict]:
        return [v for (p, _), v in self.items.items() if p.startswith(co.SEP)]


@pytest.fixture
def dynamo(monkeypatch):
    t = TablaFalsa()
    monkeypatch.setattr(co, "TABLA", "lens-corridas")
    monkeypatch.setattr(co, "_tabla", lambda: t)
    monkeypatch.setattr(co, "_cliente", lambda: t)
    return t


def test_con_tabla_el_ciclo_completo_funciona(dynamo):
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 10)
    u = co.ultima("prod", "ACME-1")
    assert u["status"] == co.COMPLETED and u["analysisId"] == "a1"
    assert co.disponible() is True


def test_los_campos_compuestos_vuelven_como_objetos(dynamo):
    """Viajan serializados porque DynamoDB no acepta floats y los porcentajes lo
    son. Si no se deserializan, EP-3 devolvería un string donde promete una lista.
    """
    docs = [{"objectKey": "a/b.pdf", "documentType": "company_deeds_document"}]
    co.registrar_inicio("prod", "ACME-1", "a1", documentos=docs, ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.INCOMPLETE,
              avisos=[{"reason": "PARTIALLY_ILLEGIBLE", "objectKey": "a/b.pdf"}],
              error=None, ahora=T0 + 10)
    u = co.ultima("prod", "ACME-1")
    assert u["documents"] == docs
    assert isinstance(u["warnings"], list) and u["warnings"][0]["reason"] == "PARTIALLY_ILLEGIBLE"
    assert u["error"] is None


def test_un_porcentaje_no_rompe_la_escritura(dynamo):
    """El caso concreto: `ownershipPercentage` es float y DynamoDB lo rechaza.
    Va adentro del JSON serializado, no como atributo suelto."""
    co.registrar_inicio("prod", "ACME-1", "a1",
                        documentos=[{"objectKey": "a.pdf", "pct": 33.3}], ahora=T0)
    assert co.ultima("prod", "ACME-1")["documents"][0]["pct"] == 33.3


def test_el_historial_viene_ordenado_de_la_tabla(dynamo):
    for i in range(3):
        co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=T0 + i * 60)
        co.cerrar("prod", "ACME-1", f"a{i}", co.COMPLETED, ahora=T0 + i * 60 + 30)
    assert [f["analysisId"] for f in co.historial("prod", "ACME-1")] == ["a2", "a1", "a0"]


def test_la_ultima_pide_una_sola_fila(dynamo):
    """`ultima` no se trae el historial entero para descartarlo: con muchas
    corridas por empresa eso se paga en cada consulta de estado."""
    for i in range(10):
        co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=T0 + i * 10)
        co.cerrar("prod", "ACME-1", f"a{i}", co.COMPLETED, ahora=T0 + i * 10 + 5)
    dynamo.consultas = 0
    co.ultima("prod", "ACME-1")
    assert dynamo.consultas == 1


def test_si_la_lectura_falla_no_se_hace_pasar_por_not_started(monkeypatch):
    """Devolver vacío ante un error haría pasar por `NOT_STARTED` una corrida que
    existe, y el consumidor volvería a analizar y a cobrar. Se propaga para que
    quien llama responda `SERVICE_UNAVAILABLE` y no una mentira."""
    class Rota:
        def query(self, **_):
            raise RuntimeError("AccessDenied")

    monkeypatch.setattr(co, "TABLA", "lens-corridas")
    monkeypatch.setattr(co, "_tabla", lambda: Rota())
    with pytest.raises(RuntimeError):
        co.estado("prod", "ACME-1")


def test_si_el_registro_falla_se_propaga(monkeypatch):
    """Antes era best-effort, y un inicio que no se guardaba dejaba salir un
    `202` que ninguna consulta de estado podía confirmar. Ahora se propaga, y
    EP-1 responde `503`: sin registro no hay corrida."""
    class Rota:
        def transact_write_items(self, **_):
            raise RuntimeError("ThrottlingException")

    monkeypatch.setattr(co, "TABLA", "lens-corridas")
    monkeypatch.setattr(co, "_cliente", lambda: Rota())
    with pytest.raises(RuntimeError):
        co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)


# ════════════════════════════════════════════════════════════════════════════
# Una sola corrida por ambiente + empresa: el candado
# ════════════════════════════════════════════════════════════════════════════

def test_con_tabla_una_segunda_corrida_viva_es_en_curso_con_los_datos_de_la_primera(dynamo):
    co.registrar_inicio("prod", "ACME-1", "primera", ahora=T0)
    with pytest.raises(co.EnCurso) as e:
        co.registrar_inicio("prod", "ACME-1", "segunda", ahora=T0 + 5)
    assert e.value.viva["analysisId"] == "primera"
    assert e.value.viva["startedAt"] == co._ahora_iso(T0)
    assert [f["analysisId"] for f in dynamo.corridas()] == ["primera"], "la segunda no se registró"


def test_el_candado_no_aparece_como_corrida(dynamo):
    """Vive en otra partición: ni `ultima` ni el historial lo ven."""
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert len(dynamo.candados()) == 1
    assert co.ultima("prod", "ACME-1")["analysisId"] == "a1"
    assert [f["analysisId"] for f in co.historial("prod", "ACME-1")] == ["a1"]
    assert co.ultima("#candado#prod", "ACME-1") is None


def test_cerrar_suelta_el_candado(dynamo):
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 30)
    co.registrar_inicio("prod", "ACME-1", "a2", ahora=T0 + 31)
    assert co.ultima("prod", "ACME-1")["analysisId"] == "a2"


def test_la_caducidad_sigue_liberando_a_la_empresa(dynamo):
    """Una corrida que murió sin cerrar deja el candado tomado. Pasado el tope,
    EP-1 tiene que aceptar otra: si no, la empresa queda bloqueada para siempre."""
    co.registrar_inicio("prod", "ACME-1", "muerta", ahora=T0)
    with pytest.raises(co.EnCurso):
        co.registrar_inicio("prod", "ACME-1", "antes-del-tope", ahora=T0 + co.TOPE_EN_CURSO_S)
    co.registrar_inicio("prod", "ACME-1", "despues", ahora=T0 + co.TOPE_EN_CURSO_S + 1)
    assert co.ultima("prod", "ACME-1")["analysisId"] == "despues"


def test_una_corrida_informada_failed_no_cambia_mas(dynamo):
    """Pasado el tope, EP-2 la informa `FAILED` y Onboarding cobra el intento. Un
    proceso rezagado que después la quiera cerrar `COMPLETED` no puede."""
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    tarde = T0 + co.TOPE_EN_CURSO_S + 1
    assert co.estado("prod", "ACME-1", ahora=tarde) == co.FAILED
    assert co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=tarde) is None
    assert co.estado("prod", "ACME-1", ahora=tarde + 60) == co.FAILED


def test_una_corrida_cerrada_no_se_cierra_dos_veces(dynamo):
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert co.cerrar("prod", "ACME-1", "a1", co.FAILED, ahora=T0 + 10) is not None
    assert co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 20) is None
    assert co.ultima("prod", "ACME-1")["status"] == co.FAILED


def test_una_corrida_de_antes_de_los_candados_se_sigue_cerrando(dynamo):
    """Una corrida registrada antes del despliegue no tiene candado, y otra puede
    haberlo tomado. Igual se tiene que poder cerrar."""
    vieja = {"pk": co.clave("prod", "ACME-1"), "sk": f"{co._ahora_iso(T0)}#vieja",
             "analysisId": "vieja", "status": co.IN_PROGRESS, "startedAt": co._ahora_iso(T0),
             "startedTs": int(T0), "documents": "[]", "warnings": "[]", "error": "null", "result": "null"}
    dynamo.items[(vieja["pk"], vieja["sk"])] = vieja
    co.registrar_inicio("prod", "ACME-1", "nueva", ahora=T0 + 5)   # sin candado previo: entra
    assert co.cerrar("prod", "ACME-1", "vieja", co.COMPLETED, ahora=T0 + 10) is not None
    assert co.buscar("prod", "ACME-1", "vieja")["status"] == co.COMPLETED
    assert co.buscar("prod", "ACME-1", "nueva")["status"] == co.IN_PROGRESS


def test_un_choque_de_transacciones_se_reintenta(dynamo):
    """`TransactionConflict` = otra transacción tocaba el mismo ítem. Al
    reintentar, o se toma el candado o se ve quién lo tiene."""
    dynamo.conflictos_pendientes = 1
    co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert dynamo.transacciones == 2
    assert co.ultima("prod", "ACME-1")["analysisId"] == "a1"


def test_si_los_choques_no_ceden_se_lee_quien_tiene_el_candado(dynamo, monkeypatch):
    """Probado contra DynamoDB de verdad: con ocho registros simultáneos, dos
    seguían chocando después de los reintentos y habrían salido 503. Si alguno
    ya tomó el candado, la respuesta es el 409 con sus datos."""
    monkeypatch.setattr(co.time, "sleep", lambda _: None)
    co.registrar_inicio("prod", "ACME-1", "la-que-gano", ahora=T0)
    dynamo.conflictos_pendientes = co.INTENTOS_TRANSACCION
    with pytest.raises(co.EnCurso) as e:
        co.registrar_inicio("prod", "ACME-1", "otra", ahora=T0 + 1)
    assert e.value.viva["analysisId"] == "la-que-gano"


def test_si_los_choques_no_ceden_y_nadie_tiene_el_candado_se_propaga(dynamo, monkeypatch):
    """Sin nadie con el candado no hay a quién señalar: EP-1 responde 503 y
    ms-company reintenta sin cobrar."""
    monkeypatch.setattr(co.time, "sleep", lambda _: None)
    dynamo.conflictos_pendientes = co.INTENTOS_TRANSACCION
    with pytest.raises(co._Cancelada):
        co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)


def _carrera(n: int) -> tuple[list[str], list[co.EnCurso], list[Exception]]:
    """`n` registros simultáneos de la misma empresa, todos soltados a la vez."""
    import threading
    largada = threading.Barrier(n)
    ok, en_curso, otros = [], [], []

    def uno(i):
        largada.wait()
        try:
            co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=T0 + i * 0.001)
            ok.append(f"a{i}")
        except co.EnCurso as e:
            en_curso.append(e)
        except Exception as e:  # noqa: BLE001
            otros.append(e)

    hilos = [threading.Thread(target=uno, args=(i,)) for i in range(n)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    return ok, en_curso, otros


@pytest.mark.parametrize("modo", ["memoria", "tabla"])
def test_de_registros_simultaneos_gana_uno_y_los_demas_ven_cual(modo, request):
    """La carrera que abría dos corridas: dos EP-1 a la vez pasaban los dos por
    «¿hay una en curso?» antes de que el otro registrara."""
    if modo == "tabla":
        request.getfixturevalue("dynamo")
    ok, en_curso, otros = _carrera(8)
    assert not otros
    assert len(ok) == 1, f"tienen que registrar exactamente una, registraron {ok}"
    assert len(en_curso) == 7
    assert {e.viva["analysisId"] for e in en_curso} == set(ok), "el 409 dice cuál es la que corre"
    assert [f["analysisId"] for f in co.historial("prod", "ACME-1")] == ok


@pytest.mark.parametrize("modo", ["memoria", "tabla"])
def test_anular_deja_a_la_empresa_como_antes(modo, request):
    if modo == "tabla":
        request.getfixturevalue("dynamo")
    reg = co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert co.anular(reg) is True
    assert co.ultima("prod", "ACME-1") is None, "la corrida no queda IN_PROGRESS"
    co.registrar_inicio("prod", "ACME-1", "a2", ahora=T0 + 1)   # y el candado quedó libre


@pytest.mark.parametrize("modo", ["memoria", "tabla"])
def test_anular_no_toca_una_corrida_que_ya_cerro(modo, request):
    if modo == "tabla":
        request.getfixturevalue("dynamo")
    reg = co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    co.cerrar("prod", "ACME-1", "a1", co.COMPLETED, ahora=T0 + 10)
    assert co.anular(reg) is False
    assert co.ultima("prod", "ACME-1")["status"] == co.COMPLETED


def test_si_no_se_puede_leer_para_cerrar_no_revienta_el_worker(monkeypatch, caplog):
    """Asimetría deliberada con la lectura de estado: acá el análisis YA terminó,
    y dejar reventar al worker no cierra la corrida ni recupera nada. Queda
    `IN_PROGRESS` y la libera el tope de caducidad."""
    class Rota:
        def query(self, **_):
            raise RuntimeError("AccessDenied")

    monkeypatch.setattr(co, "TABLA", "lens-corridas")
    monkeypatch.setattr(co, "_tabla", lambda: Rota())
    with caplog.at_level("WARNING"):
        assert co.cerrar("prod", "ACME-1", "a1", co.COMPLETED) is None
    assert "para cerrarla" in caplog.text


# ════════════════════════════════════════════════════════════════════════════
# Lo que /salud tiene que decir
# ════════════════════════════════════════════════════════════════════════════

def test_salud_avisa_si_el_historial_no_persiste():
    """En `false`, EP-2 respondería `NOT_STARTED` sobre corridas que sí
    ocurrieron. Se expone para no tener que adivinarlo, igual que ya se hace con
    la idempotencia."""
    import json

    import app

    r = app.lambda_handler({
        "rawPath": "/salud",
        "requestContext": {"http": {"method": "GET"}},
        "headers": {},
    })
    cuerpo = json.loads(r["body"])
    assert cuerpo["corridas_persistentes"] is False
    assert cuerpo["corridas_ambientes"] == [], "vacío significa que se acepta cualquiera"
