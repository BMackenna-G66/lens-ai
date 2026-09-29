"""EP-1 · `POST /v1/companies/{companyId}/analyses` — Fase 2.

El criterio de terminado del plan es una sola frase: *«una consulta de estado
inmediatamente posterior al `202` devuelve `IN_PROGRESS`, nunca
`NOT_STARTED`»*. Es el primer test del archivo y es el que importa.

Lo demás protege tres cosas que no se ven mirando una respuesta:

  · que los dos contratos no se mezclen — esta familia usa códigos HTTP de
    verdad y `/v1/analyses` responde 200 siempre
  · que un documento perdido cierre la corrida con el estado que corresponde,
    caiga donde caiga
  · que las rutas viejas sigan exactamente igual
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

import companies as co  # noqa: E402
import corridas  # noqa: E402
import disparador  # noqa: E402


SECRETO = "secreto-de-prueba"


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    corridas._reiniciar_memoria()
    monkeypatch.setattr(disparador, "ASINCRONO", False)
    yield
    corridas._reiniciar_memoria()


def evento(company_id: str = "ACME-1", cuerpo: dict | None = None, metodo: str = "POST",
           headers: dict | None = None) -> dict:
    return {
        "rawPath": f"/v1/companies/{company_id}/analyses",
        "requestContext": {"http": {"method": metodo}},
        "headers": {"x-api-secret": SECRETO} if headers is None else headers,
        "body": json.dumps(cuerpo or {}),
    }


CUERPO_OK = {
    "environment": "prod",
    "country": "chile",
    "documents": [{"s3Uri": "s3://un-bucket/b2b/escritura.pdf", "documentType": "CONSTITUTION"}],
}


def analizar_falso(documentos, incluir_texto, pais=""):
    return {
        "campos": [
            {"field": "Razón Social", "value": "COMERCIAL TRIFOLIO SpA"},
            {"field": "RUT de la sociedad", "value": "77.111.222-1"},
        ],
        "avisos": [],
        "documentos": [],
    }


def llamar(cuerpo=None, company_id="ACME-1", metodo="POST", headers=None, analizar=analizar_falso):
    ev = evento(company_id, cuerpo if cuerpo is not None else CUERPO_OK, metodo, headers)
    r = co.manejar(ev, ev["rawPath"], metodo, analizar=analizar)
    return r["statusCode"], json.loads(r["body"])


# ════════════════════════════════════════════════════════════════════════════
# EL criterio de terminado
# ════════════════════════════════════════════════════════════════════════════

def test_una_consulta_inmediata_al_202_nunca_ve_not_started(s3_falso):
    """La corrida se registra ANTES de responder. Si el `202` saliera primero, la
    primera consulta del front podría ver `NOT_STARTED`, volver a mostrar la
    pantalla de carga y disparar un segundo procesamiento del mismo lote."""
    codigo, cuerpo = llamar()
    assert codigo == 202
    assert corridas.estado("prod", "ACME-1") != corridas.NOT_STARTED


def test_el_202_trae_los_cinco_campos_del_contrato(s3_falso):
    codigo, cuerpo = llamar()
    assert codigo == 202
    for campo in ("companyId", "analysisId", "status", "startedAt", "schemaVersion"):
        assert campo in cuerpo, f"el 202 tiene que traer {campo}"
    assert cuerpo["companyId"] == "ACME-1"
    assert cuerpo["status"] == corridas.IN_PROGRESS


def test_el_company_id_sale_del_path_y_no_del_cuerpo(s3_falso):
    """Si saliera del cuerpo, dos peticiones a rutas distintas podrían escribir
    sobre la misma empresa."""
    _, cuerpo = llamar({**CUERPO_OK, "companyId": "OTRA-COSA"}, company_id="ACME-1")
    assert cuerpo["companyId"] == "ACME-1"


# ════════════════════════════════════════════════════════════════════════════
# Los dos contratos no se mezclan
# ════════════════════════════════════════════════════════════════════════════

def test_esta_familia_usa_codigos_http_de_verdad(s3_falso):
    """`/v1/analyses` responde 200 siempre con el código adentro del cuerpo.
    Esta NO: la especificación v1.2 define 202, 400, 409 y 429 de verdad."""
    codigo, cuerpo = llamar({"country": "chile"})
    assert codigo == 400
    assert "statusCode" not in cuerpo, "ese es el contrato del bot, no este"
    assert cuerpo["error"]["reason"] == "BAD_REQUEST"


def test_una_ruta_que_no_es_de_esta_familia_devuelve_none():
    """Devolver `None` —y no un 404— es lo que deja que el handler siga
    probando las rutas viejas. Un 404 acá se comería `/v1/analisis`."""
    ev = evento()
    ev["rawPath"] = "/v1/analisis"
    assert co.manejar(ev, "/v1/analisis", "POST", analizar=analizar_falso) is None


# ════════════════════════════════════════════════════════════════════════════
# La forma de la petición: lo que es un 400
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("cuerpo,que", [
    ({"country": "chile", "documents": [{"s3Uri": "s3://b/x.pdf"}]}, "sin environment"),
    ({"environment": "prod", "country": "chile"}, "sin documents"),
    ({"environment": "prod", "documents": []}, "documents vacío"),
    ({"environment": "prod", "documents": [{}]}, "documento sin s3Uri ni objectKey"),
    ({"environment": "prod", "documents": [{"s3Uri": "no-es-s3"}]}, "s3Uri inválido"),
])
def test_la_forma_de_la_peticion_es_400(cuerpo, que):
    codigo, r = llamar(cuerpo)
    assert codigo == 400, que
    assert r["error"]["reason"] == "BAD_REQUEST"


def test_un_s3uri_impresentable_no_espera_al_trabajo_de_fondo():
    """Un `s3Uri` que ni se puede partir es un error de contrato, no un documento
    que no se pudo bajar. Decirlo ahora ahorra que el consumidor lo descubra tres
    minutos después por una consulta de estado."""
    codigo, _ = llamar({"environment": "prod", "documents": [{"s3Uri": "s3://sin-clave"}]})
    assert codigo == 400
    assert corridas.estado("prod", "ACME-1") == corridas.NOT_STARTED, "no se registró nada"


def test_el_lote_tiene_su_propio_tope():
    """La v1.2 bajó el lote a 2. Es el tope de ESTE contrato: `/v1/analisis`
    sigue con el suyo."""
    assert co.MAX_DOCUMENTOS_LOTE == 2
    codigo, r = llamar({
        "environment": "prod",
        "documents": [{"s3Uri": f"s3://b/{i}.pdf"} for i in range(3)],
    })
    assert codigo == 400
    assert "máximo" in r["error"]["message"]


def test_un_ambiente_fuera_de_la_lista_es_400(monkeypatch):
    monkeypatch.setattr(corridas, "AMBIENTES", ("dev", "staging", "prod"))
    codigo, r = llamar({**CUERPO_OK, "environment": "production"})
    assert codigo == 400
    assert "production" in r["error"]["message"]


def test_metodo_no_permitido(s3_falso):
    codigo, r = llamar(metodo="DELETE")
    assert codigo == 400


# ════════════════════════════════════════════════════════════════════════════
# Una corrida por empresa a la vez
# ════════════════════════════════════════════════════════════════════════════

def test_una_segunda_corrida_de_la_misma_empresa_es_409(s3_falso, monkeypatch):
    """Se fuerza que la primera quede viva: en modo en línea el trabajo termina
    antes de responder, así que la corrida ya cerró."""
    corridas.registrar_inicio("prod", "ACME-1", "la-que-esta-corriendo")
    codigo, r = llamar()
    assert codigo == 409
    assert r["error"]["reason"] == "CONFLICT"
    # El dato viaja DENTRO de `error`, que es la forma que define el catálogo.
    assert r["error"]["analysisId"] == "la-que-esta-corriendo", "dice cuál es la que está corriendo"


def test_una_corrida_viva_de_otra_empresa_no_bloquea(s3_falso):
    corridas.registrar_inicio("prod", "OTRA", "la-de-otra")
    codigo, _ = llamar()
    assert codigo == 202


def test_una_corrida_viva_en_otro_ambiente_no_bloquea(s3_falso):
    corridas.registrar_inicio("dev", "ACME-1", "la-de-dev")
    codigo, _ = llamar()
    assert codigo == 202


def test_si_no_se_puede_leer_el_estado_no_se_arranca_igual(monkeypatch):
    """Arrancar sin saber si hay una corrida viva podría duplicar el trabajo y el
    gasto. Se pide reintentar en vez de adivinar."""
    def rota(*_, **__):
        raise RuntimeError("AccessDenied")

    monkeypatch.setattr(corridas, "en_curso", rota)
    codigo, r = llamar()
    assert codigo == 503
    assert r["error"]["reason"] == "SERVICE_UNAVAILABLE"


# ════════════════════════════════════════════════════════════════════════════
# El trabajo de fondo
# ════════════════════════════════════════════════════════════════════════════

class S3Falso:
    """`head_object` y `get_object` sobre un juego de claves que sí existen."""

    def __init__(self, claves=(), falla_head=(), falla_get=()):
        self.claves = set(claves)
        self.falla_head = set(falla_head)
        self.falla_get = set(falla_get)

    def head_object(self, Bucket, Key):
        if Key in self.falla_head or Key not in self.claves:
            raise RuntimeError("NoSuchKey")
        return {"ContentLength": 1024}

    def get_object(self, Bucket, Key):
        if Key in self.falla_get:
            raise RuntimeError("AccessDenied")
        return {"Body": _Cuerpo(b"%PDF-1.4 contenido")}


class _Cuerpo:
    def __init__(self, b):
        self.b = b

    def read(self):
        return self.b


@pytest.fixture
def s3_falso(monkeypatch):
    """Por defecto, todo lo que se pida existe y se baja bien."""
    cliente = S3Falso(claves={"b2b/escritura.pdf", "b2b/anexo.pdf"})

    class BotoFalso:
        @staticmethod
        def client(_servicio):
            return cliente

    monkeypatch.setitem(sys.modules, "boto3", BotoFalso)
    return cliente


def correr(documentos, s3, analizar=analizar_falso, ambiente="prod", company_id="ACME-1"):
    """Registra la corrida y la procesa, como lo haría el disparo."""
    corridas.registrar_inicio(ambiente, company_id, "a1", documentos=documentos)
    co.procesar({
        "ambiente": ambiente, "companyId": company_id, "analysisId": "a1",
        "country": "chile", "documents": documentos,
    }, analizar=analizar)
    return corridas.buscar(ambiente, company_id, "a1")


PRINCIPAL = {"s3Uri": "s3://b/b2b/escritura.pdf", "documentType": "CONSTITUTION"}
ANEXO = {"s3Uri": "s3://b/b2b/anexo.pdf", "documentType": "ANNEX"}


def test_una_corrida_que_sale_bien_queda_completed(s3_falso):
    assert correr([PRINCIPAL], s3_falso)["status"] == corridas.COMPLETED


def test_si_no_se_puede_bajar_el_principal_la_corrida_falla(s3_falso, monkeypatch):
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("CONSTITUTION",))
    s3_falso.falla_get.add("b2b/escritura.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_DOCUMENT_DOWNLOAD_FAILED"


def test_el_principal_que_falla_AL_BAJAR_no_se_cuela_como_aviso(s3_falso, monkeypatch):
    """El caso peor, y el que el primer intento de este código dejaba pasar: un
    documento se puede caer al resolverlo, al filtrarlo o al descargarlo, y
    mirar solo lo primero hacía que la escritura cayera al bajar, el anexo
    bajara bien, y la corrida terminara analizando el anexo sola."""
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("CONSTITUTION",))
    s3_falso.falla_get.add("b2b/escritura.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    assert reg["status"] != corridas.COMPLETED
    assert reg["status"] != corridas.INCOMPLETE


def test_si_falla_un_complementario_la_corrida_queda_incompleta(s3_falso, monkeypatch):
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("CONSTITUTION",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    assert reg["status"] == corridas.INCOMPLETE
    assert any(a["reason"] == "EXPECTED_DATA_MISSING" for a in reg["warnings"])


def test_el_aviso_del_complementario_dice_cual_fue(s3_falso, monkeypatch):
    """El contrato define `objectKey` en cada aviso. Sin él, quien integra tiene
    que adivinar a qué documento se refiere."""
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("CONSTITUTION",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    faltante = [a for a in reg["warnings"] if a["reason"] == "EXPECTED_DATA_MISSING"][0]
    assert "anexo" in faltante["objectKey"]


def test_sin_vocabulario_configurado_todos_son_principales(s3_falso):
    """El default conservador: tratar un documento desconocido como
    complementario dejaría que la corrida termine «bien» sin haber leído la
    escritura. Terminar en FAILED de más es visible; en COMPLETED de menos, no.
    """
    assert co.TIPOS_PRINCIPALES == ()
    s3_falso.falla_get.add("b2b/anexo.pdf")
    assert correr([PRINCIPAL, ANEXO], s3_falso)["status"] == corridas.FAILED


def test_sin_razon_social_ni_rut_la_corrida_falla(s3_falso):
    """Sin ninguno de los dos el análisis no sirve aguas abajo: es un fallo, no
    un resultado degradado."""
    def vacio(*_, **__):
        return {"campos": [
            {"field": "Razón Social", "value": "No especificado"},
            {"field": "RUT de la sociedad", "value": ""},
        ], "avisos": []}

    reg = correr([PRINCIPAL], s3_falso, analizar=vacio)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_REQUIRED_DATA_MISSING"


def test_con_solo_el_rut_alcanza(s3_falso):
    def solo_rut(*_, **__):
        return {"campos": [
            {"field": "Razón Social", "value": "No especificado"},
            {"field": "RUT de la sociedad", "value": "77.111.222-1"},
        ], "avisos": []}

    assert correr([PRINCIPAL], s3_falso, analizar=solo_rut)["status"] == corridas.COMPLETED


def test_si_el_analisis_revienta_la_corrida_no_queda_colgada(s3_falso):
    """Una excepción que escapara dejaría la corrida en `IN_PROGRESS` hasta que
    la libere el tope de caducidad, y al consumidor esperando."""
    def revienta(*_, **__):
        raise RuntimeError("Gemini se cayó")

    reg = correr([PRINCIPAL], s3_falso, analizar=revienta)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_EXTRACTION_FAILED"


def test_el_filtro_por_nombre_no_aplica_a_documentos_nombrados(s3_falso):
    """Onboarding nombra sus propios archivos. Exigirles además el prefijo del
    barrido descartaría `escritura.pdf` entero — y con un aviso, no con un
    error: la corrida terminaría «bien» sin haber leído nada."""
    assert correr([PRINCIPAL], s3_falso)["status"] == corridas.COMPLETED


# ════════════════════════════════════════════════════════════════════════════
# El disparo
# ════════════════════════════════════════════════════════════════════════════

def test_sin_permiso_se_procesa_en_linea():
    """No hay `lambda:InvokeFunction`, así que el 202 sale después del trabajo.
    Es peor, pero es correcto — y permite construir las Fases 3 y 4 sin esperar
    a que se destrabe el despliegue."""
    hecho = []
    assert disparador.disparar({"x": 1}, hecho.append) == "en_linea"
    assert hecho == [{"x": 1}]


def test_con_permiso_se_manda_al_fondo_y_no_se_procesa_acá(monkeypatch):
    invocaciones = []

    class LambdaFalso:
        def invoke(self, **kw):
            invocaciones.append(kw)

    class BotoFalso:
        @staticmethod
        def client(_):
            return LambdaFalso()

    monkeypatch.setitem(sys.modules, "boto3", BotoFalso)
    monkeypatch.setattr(disparador, "ASINCRONO", True)
    monkeypatch.setattr(disparador, "FUNCION", "lens-analisis")

    hecho = []
    assert disparador.disparar({"x": 1}, hecho.append) == "asincrono"
    assert hecho == [], "no tiene que procesarse acá"
    assert invocaciones[0]["InvocationType"] == "Event", "sin esto es síncrono y no sirve de nada"


def test_si_el_disparo_falla_se_procesa_en_linea(monkeypatch):
    """Ante la duda, hacer el trabajo: tarda, pero responde. Mismo criterio que
    `almacen.leer` cuando no puede leer."""
    class BotoFalso:
        @staticmethod
        def client(_):
            raise RuntimeError("AccessDenied")

    monkeypatch.setitem(sys.modules, "boto3", BotoFalso)
    monkeypatch.setattr(disparador, "ASINCRONO", True)
    monkeypatch.setattr(disparador, "FUNCION", "lens-analisis")

    hecho = []
    assert disparador.disparar({"x": 1}, hecho.append) == "en_linea"
    assert hecho == [{"x": 1}], "la corrida no se da por perdida"


def test_un_evento_http_no_es_trabajo_de_fondo():
    assert disparador.es_trabajo_de_fondo(evento()) is None
    assert disparador.es_trabajo_de_fondo({}) is None


def test_el_trabajo_de_fondo_se_reconoce_por_su_marca():
    ev = {disparador.MARCA: True, "carga": {"analysisId": "a1"}}
    assert disparador.es_trabajo_de_fondo(ev) == {"analysisId": "a1"}


# ════════════════════════════════════════════════════════════════════════════
# Lo que NO se puede romper
# ════════════════════════════════════════════════════════════════════════════

def test_las_rutas_viejas_siguen_igual(monkeypatch):
    """`/v1/analisis` está viva y en uso. Es la restricción del plan y lo que
    permite migrar sin ventana de corte."""
    import app

    r = app.lambda_handler({
        "rawPath": "/salud", "requestContext": {"http": {"method": "GET"}}, "headers": {},
    })
    assert r["statusCode"] == 200

    # Una ruta desconocida sigue enumerando las de siempre.
    r = app.lambda_handler({
        "rawPath": "/v1/no-existe", "requestContext": {"http": {"method": "GET"}},
        "headers": {"x-api-secret": "x"},
    })
    assert r["statusCode"] == 404
    assert "/v1/analisis" in json.loads(r["body"])["error"]


def test_el_trabajo_de_fondo_no_se_confunde_con_una_peticion(monkeypatch):
    """Un disparo asíncrono no trae `requestContext`. Tratarlo como HTTP lo
    mandaría a `/`, que responde `/salud`, y el análisis no se haría nunca."""
    import app

    visto = []
    monkeypatch.setattr(app.companies, "procesar", lambda c, **kw: visto.append(c) or {"ok": True})
    app.lambda_handler({disparador.MARCA: True, "carga": {"analysisId": "a1"}})
    assert visto == [{"analysisId": "a1"}], "no llegó al trabajo de fondo"


def test_la_familia_nueva_pide_el_secreto(monkeypatch):
    import app

    monkeypatch.setattr(app, "API_SECRET", SECRETO)
    r = app.lambda_handler(evento(headers={}))
    assert r["statusCode"] == 401
    assert json.loads(r["body"])["error"]["reason"] == "UNAUTHORIZED"


def test_salud_dice_si_el_202_es_de_verdad_inmediato():
    """Una promesa de 202 inmediato que en realidad tarda tres minutos no se
    puede descubrir mirando la respuesta."""
    import app

    r = app.lambda_handler({
        "rawPath": "/salud", "requestContext": {"http": {"method": "GET"}}, "headers": {},
    })
    cuerpo = json.loads(r["body"])
    assert cuerpo["disparo_asincrono"] is False
    assert cuerpo["tipos_principales"] == [], "vacío significa que todos son principales"
    assert cuerpo["max_documentos_lote"] == 2
