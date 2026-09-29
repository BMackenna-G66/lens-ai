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


# ════════════════════════════════════════════════════════════════════════════
# EP-2 · Estado (Fase 3)
# ════════════════════════════════════════════════════════════════════════════

def consultar(company_id="ACME-1", ambiente="prod", metodo="GET", query=None):
    ruta = f"/v1/companies/{company_id}/analysis/status"
    ev = {
        "rawPath": ruta,
        "requestContext": {"http": {"method": metodo}},
        "headers": {"x-api-secret": SECRETO},
        "queryStringParameters": {"environment": ambiente} if query is None else query,
    }
    r = co.manejar(ev, ruta, metodo, analizar=analizar_falso)
    return r["statusCode"], json.loads(r["body"])


# ── EL criterio de terminado ────────────────────────────────────────────────

def test_una_empresa_sin_corridas_responde_200_not_started():
    """El criterio de terminado del plan. Un `404` haría «todavía no hay
    análisis» indistinguible de «esa ruta no existe» o «te equivocaste de
    companyId», y el consumidor consulta en un bucle mientras espera."""
    codigo, cuerpo = consultar(company_id="NUNCA-ANALIZADA")
    assert codigo == 200
    assert cuerpo["status"] == corridas.NOT_STARTED
    assert cuerpo["analysisId"] is None


def test_nunca_devuelve_404(s3_falso):
    """Ni sin corridas, ni con una fallida, ni con una terminada."""
    assert consultar(company_id="NUNCA")[0] == 200
    correr([PRINCIPAL], s3_falso)
    assert consultar()[0] == 200


def test_el_estado_se_lee_sin_reprocesar(s3_falso):
    """«Latencia por debajo de 1 s: se lee de la persistencia, sin reprocesar».
    Si tocara el análisis, la consulta costaría lo mismo que la corrida."""
    correr([PRINCIPAL], s3_falso)

    def no_debe_llamarse(*_, **__):
        raise AssertionError("EP-2 no puede analizar nada")

    ruta = "/v1/companies/ACME-1/analysis/status"
    r = co.manejar({
        "rawPath": ruta, "requestContext": {"http": {"method": "GET"}},
        "headers": {}, "queryStringParameters": {"environment": "prod"},
    }, ruta, "GET", analizar=no_debe_llamarse)
    assert r["statusCode"] == 200


# ── La forma de la respuesta ────────────────────────────────────────────────

def test_el_cuerpo_trae_siempre_las_mismas_claves(s3_falso):
    """El consumidor no tiene que defenderse de campos ausentes."""
    correr([PRINCIPAL], s3_falso)
    _, con = consultar()
    _, sin = consultar(company_id="NUNCA")
    esperadas = {"companyId", "analysisId", "status", "startedAt", "finishedAt",
                 "warnings", "schemaVersion"}
    assert esperadas <= set(con) and esperadas <= set(sin)


def test_el_error_va_solo_en_failed(s3_falso):
    """En INCOMPLETE el análisis SIRVE, y lo degradado se dice en `warnings`.
    Mandar un `error` ahí haría que Onboarding descarte un resultado utilizable
    — el error caro que describe `errores.py`."""
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("CONSTITUTION",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    correr([PRINCIPAL, ANEXO], s3_falso)
    monkeypatch.undo()

    _, cuerpo = consultar()
    assert cuerpo["status"] == corridas.INCOMPLETE
    assert "error" not in cuerpo, "INCOMPLETE no lleva error"
    assert cuerpo["warnings"], "lo degradado se dice en warnings"


def test_failed_trae_reason_y_message(s3_falso):
    def revienta(*_, **__):
        raise RuntimeError("Gemini se cayó")

    correr([PRINCIPAL], s3_falso, analizar=revienta)
    _, cuerpo = consultar()
    assert cuerpo["status"] == corridas.FAILED
    assert cuerpo["error"]["reason"] == "LENS_EXTRACTION_FAILED"
    assert cuerpo["error"]["message"]


def test_los_avisos_traen_las_tres_claves_del_contrato(s3_falso):
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("CONSTITUTION",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    correr([PRINCIPAL, ANEXO], s3_falso)
    monkeypatch.undo()

    _, cuerpo = consultar()
    for a in cuerpo["warnings"]:
        assert {"reason", "objectKey", "message"} <= set(a)


def test_una_corrida_muerta_se_reporta_failed_y_no_in_progress():
    """Decir que sigue procesando algo que murió deja al consumidor esperando un
    resultado que no va a llegar nunca."""
    import time
    corridas.registrar_inicio("prod", "ACME-1", "a1",
                              ahora=time.time() - corridas.TOPE_EN_CURSO_S - 10)
    _, cuerpo = consultar()
    assert cuerpo["status"] == corridas.FAILED
    assert "dejó de reportar" in cuerpo["error"]["message"]


def test_una_corrida_muerta_no_inventa_un_reason_nuevo():
    """Cada `reason` nuevo es un pedido a Arquitectura que bloquea. Se reusa el
    motivo de respaldo del canal y se distingue por el mensaje."""
    import time
    corridas.registrar_inicio("prod", "ACME-1", "a1",
                              ahora=time.time() - corridas.TOPE_EN_CURSO_S - 10)
    _, cuerpo = consultar()
    assert cuerpo["error"]["reason"] in co.errores.FALLO


# ── Entrada ─────────────────────────────────────────────────────────────────

def test_sin_environment_es_400():
    """Es parte de la clave. Adivinarlo leería el estado de otro ambiente sobre
    la misma empresa, que es peor que no responder."""
    codigo, cuerpo = consultar(query={})
    assert codigo == 400
    assert "environment" in cuerpo["error"]["message"]


def test_el_estado_es_por_ambiente(s3_falso):
    correr([PRINCIPAL], s3_falso, ambiente="dev")
    assert consultar(ambiente="dev")[1]["status"] == corridas.COMPLETED
    assert consultar(ambiente="prod")[1]["status"] == corridas.NOT_STARTED


def test_metodo_no_permitido_en_status():
    assert consultar(metodo="POST")[0] == 400


def test_si_no_se_puede_leer_no_se_hace_pasar_por_not_started(monkeypatch):
    """Un NOT_STARTED acá haría que el consumidor vuelva a mandar el análisis de
    una empresa que ya se analizó, y a pagarlo de nuevo."""
    def rota(*_, **__):
        raise RuntimeError("AccessDenied")

    monkeypatch.setattr(corridas, "ultima", rota)
    codigo, cuerpo = consultar()
    assert codigo == 503
    assert cuerpo["error"]["reason"] == "SERVICE_UNAVAILABLE"


def test_status_y_ep3_son_dos_endpoints_distintos():
    """Comparten prefijo y no comparten reglas: sobre una empresa sin corridas,
    `/analysis/status` responde 200 NOT_STARTED y `/analysis` responde 404."""
    assert consultar(company_id="NUNCA")[0] == 200
    assert pedir_resultado(company_id="NUNCA")[0] == 404


def test_el_estado_no_toca_el_almacen_analitico():
    """«A cualquier hora del día»: el cluster analítico se pausa de 18:30 a
    04:00 y Onboarding pide 24/7. Si EP-2 lo consultara, de noche no
    respondería."""
    import inspect

    fuente = inspect.getsource(co) + inspect.getsource(corridas)
    for prohibido in ("redshift", "Redshift", "lens.analisis", "execute_statement"):
        assert prohibido not in fuente, f"EP-2 no puede depender de {prohibido}"


def test_el_estado_responde_por_el_handler_real(monkeypatch, s3_falso):
    """Lo anterior prueba el módulo; esto prueba que la ruta llega hasta él."""
    import app

    monkeypatch.setattr(app, "API_SECRET", SECRETO)
    correr([PRINCIPAL], s3_falso)
    r = app.lambda_handler({
        "rawPath": "/v1/companies/ACME-1/analysis/status",
        "requestContext": {"http": {"method": "GET"}},
        "headers": {"x-api-secret": SECRETO},
        "queryStringParameters": {"environment": "prod"},
    })
    assert r["statusCode"] == 200
    assert json.loads(r["body"])["status"] == corridas.COMPLETED


def test_el_ciclo_completo_ep1_luego_ep2(s3_falso, monkeypatch):
    """Lo que de verdad va a hacer Onboarding: mandar el análisis y consultar."""
    import app

    monkeypatch.setattr(app, "API_SECRET", SECRETO)
    post = app.lambda_handler(evento("ACME-9", {
        "environment": "prod", "country": "chile",
        "documents": [{"s3Uri": "s3://b/b2b/escritura.pdf", "documentType": "CONSTITUTION"}],
    }))
    assert post["statusCode"] == 202
    analysis_id = json.loads(post["body"])["analysisId"]

    get = app.lambda_handler({
        "rawPath": "/v1/companies/ACME-9/analysis/status",
        "requestContext": {"http": {"method": "GET"}},
        "headers": {"x-api-secret": SECRETO},
        "queryStringParameters": {"environment": "prod"},
    })
    cuerpo = json.loads(get["body"])
    assert cuerpo["analysisId"] == analysis_id, "la consulta devuelve LA corrida que se disparó"
    assert cuerpo["status"] != corridas.NOT_STARTED


# ════════════════════════════════════════════════════════════════════════════
# EP-3 · El resultado (Fase 4)
# ════════════════════════════════════════════════════════════════════════════

def pedir_resultado(company_id="ACME-1", ambiente="prod", metodo="GET", query=None):
    ruta = f"/v1/companies/{company_id}/analysis"
    ev = {
        "rawPath": ruta,
        "requestContext": {"http": {"method": metodo}},
        "headers": {"x-api-secret": SECRETO},
        "queryStringParameters": {"environment": ambiente} if query is None else query,
    }
    r = co.manejar(ev, ruta, metodo, analizar=analizar_falso)
    return r["statusCode"], json.loads(r["body"])


def analizar_completo(documentos, incluir_texto, pais=""):
    return {
        "campos": [
            {"field": "Razón Social", "value": "COMERCIAL TRIFOLIO SpA"},
            {"field": "RUT de la sociedad", "value": "77.111.222-1"},
            {"field": "Fecha de Constitución", "value": "12 de marzo de 2019"},
            {"field": "Objeto Social", "value": "Inversiones y rentas de toda clase de bienes"},
            {"field": "Domicilio Legal", "value": "Av. Providencia 1234, Of 302, Santiago, Región Metropolitana"},
        ],
        "documentos": [{"nombre": "escritura.pdf", "ok": True, "metodo": "capa_texto",
                        "paginas_totales": 12, "paginas_leidas": 12, "paginas_por_ocr": 0}],
        "pais_detectado": "chile",
        "avisos": [],
    }


def socios_falsos(descargados, t0):
    return {
        "legalRepresentatives": [{
            "personType": "NATURAL",
            "shareholderName": "MARTINEZ SOTO CLAUDIA ANDREA",
            "shareholderId": "10.203.040-5",
            "countryOfOrigin": "Chile",
            "position": "Gerente General",
        }],
        "directOwnership": [],
        "indirectShareholders": [],
    }, []


def correr_completo(s3, company_id="ACME-1"):
    corridas.registrar_inicio("prod", company_id, "a1", documentos=[PRINCIPAL])
    co.procesar({
        "ambiente": "prod", "companyId": company_id, "analysisId": "a1",
        "country": "chile", "documents": [PRINCIPAL],
    }, analizar=analizar_completo, extraer_socios=socios_falsos)


# ── La regla del 404 ────────────────────────────────────────────────────────

def test_sin_corridas_es_404():
    """EP-2 pregunta «¿en qué anda?» y «todavía nada» es respuesta. EP-3 pide el
    resultado, y cuando no hay resultado no hay nada que devolver."""
    codigo, cuerpo = pedir_resultado(company_id="NUNCA")
    assert codigo == 404
    assert cuerpo["error"]["reason"] == "NOT_FOUND"


def test_una_corrida_en_curso_es_404():
    corridas.registrar_inicio("prod", "ACME-1", "a1")
    assert pedir_resultado()[0] == 404


def test_una_corrida_fallida_es_404(s3_falso):
    def revienta(*_, **__):
        raise RuntimeError("Gemini se cayó")

    correr([PRINCIPAL], s3_falso, analizar=revienta)
    assert pedir_resultado()[0] == 404


def test_el_404_mira_solo_la_ultima_aunque_haya_una_buena_atras(s3_falso):
    """Del plan: «404 si la corrida más reciente no está en COMPLETED ni
    INCOMPLETE, AUNQUE EXISTA UNA ANTERIOR UTILIZABLE». Devolver la vieja sería
    contestar con datos de un análisis ya reemplazado, sin que quien pregunta
    pueda notarlo."""
    correr_completo(s3_falso)
    assert pedir_resultado()[0] == 200

    corridas.registrar_inicio("prod", "ACME-1", "a2")   # una nueva, en curso
    assert pedir_resultado()[0] == 404, "la vieja ya no cuenta"


@pytest.mark.parametrize("estado", [corridas.COMPLETED, corridas.INCOMPLETE])
def test_completed_e_incomplete_si_devuelven_resultado(s3_falso, estado, monkeypatch):
    correr_completo(s3_falso)
    reg = corridas.buscar("prod", "ACME-1", "a1")
    corridas.cerrar("prod", "ACME-1", "a1", estado, resultado=reg["result"])
    assert pedir_resultado()[0] == 200


# ── La forma de la respuesta ────────────────────────────────────────────────

def test_el_resultado_trae_los_bloques_del_contrato(s3_falso):
    correr_completo(s3_falso)
    _, cuerpo = pedir_resultado()
    for clave in ("company", "legalRepresentatives", "fields", "documents", "warnings"):
        assert clave in cuerpo, f"EP-3 define {clave}"


def test_los_18_campos_siguen_saliendo_como_estaban(s3_falso):
    """Los 18 campos no se modifican: están fuera de alcance por acuerdo y de
    ellos depende la cola KYB de Compliance."""
    correr_completo(s3_falso)
    _, cuerpo = pedir_resultado()
    campos = {c["field"] for c in cuerpo["fields"]}
    assert "Razón Social" in campos and "RUT de la sociedad" in campos


def test_el_detalle_por_documento_suma_las_cuatro_claves(s3_falso):
    """Lo que el plan pide agregar: objectKey, documentType, pagesTotal,
    pagesRead. Sin `objectKey` quien integra no puede relacionar un documento de
    la respuesta con el que mandó."""
    correr_completo(s3_falso)
    _, cuerpo = pedir_resultado()
    d = cuerpo["documents"][0]
    assert d["objectKey"] == "b2b/escritura.pdf"
    assert d["documentType"] == "CONSTITUTION"
    assert d["pagesTotal"] == 12
    assert d["pagesRead"] == 12


def test_el_bloque_company_deriva_lo_que_tiene_que_derivar(s3_falso):
    correr_completo(s3_falso)
    _, cuerpo = pedir_resultado()
    c = cuerpo["company"]
    assert c["legalName"] == "COMERCIAL TRIFOLIO SpA"
    assert c["taxId"] == "77.111.222-1"
    assert c["taxIdType"] == "RUT", "derivado del país"
    assert c["constitutionDate"] == "2019-03-12", "convertido a YYYY-MM-DD"
    assert c["legalForm"] == "Sociedad por Acciones", "derivado del sufijo"
    assert len(c["activity"]) <= 30, "el contrato lo topea en 30"


def test_el_domicilio_se_parte_en_sus_cuatro_partes(s3_falso):
    correr_completo(s3_falso)
    _, cuerpo = pedir_resultado()
    a = cuerpo["company"]["address"]
    assert a["street"] == "Av. Providencia 1234"
    assert a["apt"] == "Of 302"
    assert a["city"] == "Santiago"
    assert a["state"] == "Región Metropolitana"


def test_los_representantes_salen_con_la_forma_de_ep4(s3_falso):
    correr_completo(s3_falso)
    _, cuerpo = pedir_resultado()
    r = cuerpo["legalRepresentatives"][0]
    assert set(r) == {"fullName", "name", "lastName", "personType",
                      "identificationType", "identificationNumber", "role"}
    assert r["fullName"] == "MARTINEZ SOTO CLAUDIA ANDREA", "el texto original, sin reordenar"
    assert r["identificationNumber"] == "10.203.040-5", "tal como figura, no solo dígitos"


def test_los_representantes_se_guardan_crudos_y_se_serializan_al_responder(s3_falso):
    """Guardarlos ya serializados congelaría el formato del día en que se corrió
    el análisis, y un arreglo del contrato no alcanzaría a las corridas viejas.
    """
    correr_completo(s3_falso)
    guardado = corridas.buscar("prod", "ACME-1", "a1")["result"]["legalRepresentatives"][0]
    assert "shareholderName" in guardado, "crudo, con las claves de la extracción"
    assert "fullName" not in guardado, "la forma de EP-4 la pone la respuesta"


def test_sin_environment_es_400_tambien_en_ep3():
    assert pedir_resultado(query={})[0] == 400


def test_metodo_no_permitido_en_ep3():
    assert pedir_resultado(metodo="POST")[0] == 400


# ════════════════════════════════════════════════════════════════════════════
# EP-4, EP-5 y EP-6 · Las vistas filtradas (Fase 7)
# ════════════════════════════════════════════════════════════════════════════

def pedir_seccion(nombre, company_id="ACME-1", ambiente="prod", metodo="GET", query=None):
    ruta = f"/v1/companies/{company_id}/analysis/{nombre}"
    ev = {
        "rawPath": ruta,
        "requestContext": {"http": {"method": metodo}},
        "headers": {"x-api-secret": SECRETO},
        "queryStringParameters": {"environment": ambiente} if query is None else query,
    }
    r = co.manejar(ev, ruta, metodo, analizar=analizar_falso)
    return r["statusCode"], json.loads(r["body"])


def socios_completos(descargados, t0):
    return {
        "legalRepresentatives": [{
            "personType": "NATURAL", "shareholderName": "MARTINEZ SOTO CLAUDIA ANDREA",
            "shareholderId": "10.203.040-5", "countryOfOrigin": "Chile",
            "position": "Gerente General",
        }],
        "directOwnership": [{
            "personType": "NATURAL", "shareholderName": "MARTINEZ SOTO CLAUDIA ANDREA",
            "shareholderId": "10.203.040-5", "countryOfOrigin": "Chile",
            "ownershipPercentage": 40.0,
        }],
        "indirectShareholders": [{
            "personType": "LEGAL", "shareholderName": "INVERSIONES AURORA LIMITADA",
            "shareholderId": "77.999.888-7", "countryOfOrigin": "Chile",
            "ownershipPercentage": 60.0, "indirectShareholders": [],
        }],
    }, []


def correr_con_socios(company_id="ACME-1"):
    corridas.registrar_inicio("prod", company_id, "a1", documentos=[PRINCIPAL])
    co.procesar({
        "ambiente": "prod", "companyId": company_id, "analysisId": "a1",
        "country": "chile", "documents": [PRINCIPAL],
    }, analizar=analizar_completo, extraer_socios=socios_completos)


# ── Las tres son ventanas del MISMO resultado ───────────────────────────────

@pytest.mark.parametrize("nombre,clave", [
    ("legal-representatives", "legalRepresentatives"),
    ("company", "company"),
    ("shareholders", "businessShareholders"),
])
def test_cada_seccion_entrega_su_bloque_y_nada_mas(s3_falso, nombre, clave):
    correr_con_socios()
    codigo, cuerpo = pedir_seccion(nombre)
    assert codigo == 200
    assert set(cuerpo) == {"companyId", "analysisId", clave, "schemaVersion"}


def test_ep5_devuelve_exactamente_el_company_de_ep3(s3_falso):
    """La especificación dice literal, en EP-3: «`company`: mismo contenido que
    EP-5». Si cada endpoint armara su bloque, podrían empezar a diferir sin que
    nadie lo note, y el consumidor vería una empresa distinta según por dónde
    preguntara."""
    correr_con_socios()
    assert pedir_seccion("company")[1]["company"] == pedir_resultado()[1]["company"]


def test_ep4_devuelve_exactamente_los_representantes_de_ep3(s3_falso):
    correr_con_socios()
    de_ep4 = pedir_seccion("legal-representatives")[1]["legalRepresentatives"]
    assert de_ep4 == pedir_resultado()[1]["legalRepresentatives"]


@pytest.mark.parametrize("nombre", ["legal-representatives", "company", "shareholders"])
def test_las_tres_dan_el_mismo_404_que_ep3(s3_falso, nombre):
    """Son el mismo resultado por distintas ventanas: una sección no puede
    responder 200 mientras otra responde 404 sobre la misma empresa."""
    assert pedir_seccion(nombre, company_id="NUNCA")[0] == 404
    corridas.registrar_inicio("prod", "EN-CURSO", "x")
    assert pedir_seccion(nombre, company_id="EN-CURSO")[0] == 404


@pytest.mark.parametrize("nombre", ["legal-representatives", "company", "shareholders"])
def test_las_tres_piden_environment(nombre):
    assert pedir_seccion(nombre, query={})[0] == 400


@pytest.mark.parametrize("nombre", ["legal-representatives", "company", "shareholders"])
def test_las_tres_rechazan_metodos_que_no_son_get(nombre):
    assert pedir_seccion(nombre, metodo="POST")[0] == 400


# ── EP-6 · la estructura que Onboarding ya usa ──────────────────────────────

def test_ep6_devuelve_el_objeto_raiz_de_cuatro_campos(s3_falso):
    """Respetar la estructura del procesador que se retira es el punto del
    endpoint: permite apagarlo sin que Onboarding toque su persistencia."""
    correr_con_socios()
    b = pedir_seccion("shareholders")[1]["businessShareholders"]
    assert set(b) == {"businessName", "businessId", "directOwnership", "indirectShareholders"}
    assert b["businessName"] == "COMERCIAL TRIFOLIO SpA"
    assert b["businessId"] == "77.111.222-1"


def test_ep6_usa_la_forma_de_accionista_y_no_la_de_representante(s3_falso):
    """Las dos hacen «una persona» y no son lo mismo: acá el identificador va
    SOLO CON DÍGITOS y el vocabulario de `identificationType` es el otro. Reusar
    la forma de EP-4 emitiría las claves equivocadas con los valores
    equivocados."""
    correr_con_socios()
    d = pedir_seccion("shareholders")[1]["businessShareholders"]["directOwnership"][0]
    assert "shareholderId" in d and "identificationNumber" not in d
    assert d["shareholderId"] == "102030405", "solo dígitos"
    assert d["ownershipPercentage"] == 40.0


def test_ep6_conserva_la_cadena_de_indirectos(s3_falso):
    correr_con_socios()
    b = pedir_seccion("shareholders")[1]["businessShareholders"]
    ind = b["indirectShareholders"][0]
    assert ind["personType"] == "LEGAL"
    assert ind["lastName"] is None, "una jurídica no tiene apellido"
    assert ind["name"] == "INVERSIONES AURORA LIMITADA", "la razón social va en `name`"
    assert "indirectShareholders" in ind, "la cadena se puede anidar"


# ── Correcciones de lo ya mergeado ──────────────────────────────────────────

def test_el_schema_version_es_el_del_esquema_no_el_del_documento():
    """La especificación lo fija en `1.0.0` en los seis endpoints. Decir `1.2`
    —la versión del documento— le haría creer al consumidor que el formato
    cambió cuando no cambió."""
    assert co.SCHEMA_VERSION == "1.0.0"


def test_ep3_trae_el_country_de_la_corrida(s3_falso):
    """Le dice al consumidor bajo qué reglas se leyó el documento."""
    correr_con_socios()
    assert pedir_resultado()[1]["country"] == "chile"


def test_el_company_id_numerico_viaja_como_numero():
    """La especificación lo declara `number` y sus ejemplos lo muestran así."""
    assert co.identificador("48213") == 48213
    assert co.identificador(48213) == 48213


def test_un_company_id_no_numerico_se_refleja_como_vino():
    """No se rechaza: la v1.2 cambió la clave de persistencia y no está en el
    repo para confirmar si el tipo siguió igual. Rechazar de más cortaría
    tráfico legítimo; reflejarlo no rompe a nadie."""
    assert co.identificador("ACME-1") == "ACME-1"
