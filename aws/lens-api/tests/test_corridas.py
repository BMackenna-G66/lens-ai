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
        co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=T0 + i)
    assert co.buscar("prod", "ACME-1", "a0")["analysisId"] == "a0"
    assert co.buscar("prod", "ACME-1", "no-existe") is None


def test_se_puede_cerrar_una_corrida_que_no_es_la_ultima():
    """Dos corridas de la misma empresa pueden solaparse si el `409` no las
    frenó. Cerrar la vieja no puede tocar la nueva."""
    co.registrar_inicio("prod", "ACME-1", "vieja", ahora=T0)
    co.registrar_inicio("prod", "ACME-1", "nueva", ahora=T0 + 60)
    co.cerrar("prod", "ACME-1", "vieja", co.COMPLETED, ahora=T0 + 70)
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


class TablaFalsa:
    """Lo justo de DynamoDB: `put_item` reemplaza por (pk, sk) y `query` devuelve
    ordenado por `sk`, con `ScanIndexForward` y `Limit`."""

    def __init__(self):
        self.items: dict[tuple, dict] = {}
        self.consultas = 0

    def put_item(self, Item):
        for k, v in Item.items():
            assert not isinstance(v, float), f"DynamoDB no acepta floats y `{k}` es uno"
        self.items[(Item["pk"], Item["sk"])] = dict(Item)

    def query(self, KeyConditionExpression, ScanIndexForward=True, Limit=None):
        self.consultas += 1
        pk = KeyConditionExpression._values[1]
        filas = sorted(
            (v for (p, _), v in self.items.items() if p == pk),
            key=lambda f: f["sk"], reverse=not ScanIndexForward,
        )
        return {"Items": filas[: Limit or len(filas)]}


@pytest.fixture
def dynamo(monkeypatch):
    t = TablaFalsa()
    monkeypatch.setattr(co, "TABLA", "lens-corridas")
    monkeypatch.setattr(co, "_tabla", lambda: t)
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
    assert [f["analysisId"] for f in co.historial("prod", "ACME-1")] == ["a2", "a1", "a0"]


def test_la_ultima_pide_una_sola_fila(dynamo):
    """`ultima` no se trae el historial entero para descartarlo: con muchas
    corridas por empresa eso se paga en cada consulta de estado."""
    for i in range(10):
        co.registrar_inicio("prod", "ACME-1", f"a{i}", ahora=T0 + i)
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


def test_si_la_escritura_falla_no_rompe_pero_queda_en_el_log(monkeypatch, caplog):
    """Best-effort igual que `almacen.guardar`: el análisis ya está hecho. Pero
    tiene que quedar dicho, porque un inicio que no se guardó significa que el
    `409` no protege."""
    class Rota:
        def put_item(self, **_):
            raise RuntimeError("ThrottlingException")

    monkeypatch.setattr(co, "TABLA", "lens-corridas")
    monkeypatch.setattr(co, "_tabla", lambda: Rota())
    with caplog.at_level("WARNING"):
        co.registrar_inicio("prod", "ACME-1", "a1", ahora=T0)
    assert "no se pudo guardar la corrida" in caplog.text


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
