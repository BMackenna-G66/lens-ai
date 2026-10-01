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
    "documents": [{"s3Uri": "s3://un-bucket/b2b/escritura.pdf",
                   "documentType": "company_deeds_document"}],
}


# ── Las fixtures por defecto: una escritura COMPLETA según §10 ──────────────
# Todo lo requerido y todo lo esperado está: razón social, un representante con
# nombre, tipo, documento y cargo, RUT, forma legal, fecha y domicilio. Con esto
# una corrida sale COMPLETED; cada test que prueba un fallo la DEGRADA a mano,
# así lo que se está probando se lee en el test y no en la fixture.
#
# Los datos son INVENTADOS: el repo es público, y los RUT tienen el dígito
# verificador mal a propósito.

def _leidos(documentos) -> list[dict]:
    return [{"nombre": n, "ok": True, "metodo": "capa_texto", "paginas_totales": 12,
             "paginas_leidas": 12, "paginas_por_ocr": 0} for n, _ in documentos]


CAMPOS_COMPLETOS = [
    {"field": "Razón Social", "value": "COMERCIAL TRIFOLIO SpA"},
    {"field": "RUT de la sociedad", "value": "77.111.222-1"},
    {"field": "Fecha de Constitución", "value": "12 de marzo de 2019"},
    {"field": "Objeto Social", "value": "Inversiones y rentas de toda clase de bienes"},
    {"field": "Domicilio Legal", "value": "Av. Providencia 1234, Of 302, Santiago, Región Metropolitana"},
]


def analizar_falso(documentos, incluir_texto, pais="", campos=None):
    return {
        "ok": True,
        "campos": campos if campos is not None else CAMPOS_COMPLETOS,
        "documentos": _leidos(documentos),
        "pais_detectado": "chile",
        "avisos": [],
    }


def analizar_con(**cambios):
    """`analizar_falso` con algunos campos cambiados. `None` = el campo falta."""
    campos = [c for c in CAMPOS_COMPLETOS if c["field"] not in cambios]
    campos += [{"field": k, "value": v} for k, v in cambios.items() if v is not None]
    return lambda docs, inc, pais="": analizar_falso(docs, inc, pais, campos=campos)


REPRESENTANTE = {
    "personType": "NATURAL",
    "shareholderName": "MARTINEZ SOTO CLAUDIA ANDREA",
    # Partido, como lo devuelve el modelo. Sin partir, la serialización tiene
    # que adivinar el orden y lo avisa (NAME_SPLIT_INFERRED) — con razón.
    "name": "CLAUDIA ANDREA",
    "lastName": "MARTINEZ SOTO",
    "shareholderId": "10.203.040-5",
    "countryOfOrigin": "Chile",
    "position": "Gerente General",
}


def socios_falsos(descargados, t0):
    return {"legalRepresentatives": [dict(REPRESENTANTE)],
            "directOwnership": [], "indirectShareholders": []}, []


def identidad_falsa(descargado, t0):
    return {"esConstitutivo": "SI", "tipoDetectado": "escritura de constitución",
            "activity": "Inversiones", "legalForm": "SPA"}


def llamar(cuerpo=None, company_id="ACME-1", metodo="POST", headers=None, analizar=analizar_falso):
    ev = evento(company_id, cuerpo if cuerpo is not None else CUERPO_OK, metodo, headers)
    r = co.manejar(ev, ev["rawPath"], metodo, analizar=analizar,
                   extraer_socios=socios_falsos, leer_identidad=identidad_falsa)
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


def correr(documentos, s3, analizar=analizar_falso, ambiente="prod", company_id="ACME-1",
           socios=socios_falsos, identidad=identidad_falsa, admin=None, pais="chile"):
    """Registra la corrida y la procesa, como lo haría el disparo."""
    corridas.registrar_inicio(ambiente, company_id, "a1", documentos=documentos)
    co.procesar({
        "ambiente": ambiente, "companyId": company_id, "analysisId": "a1",
        "country": pais, "documents": documentos,
    }, analizar=analizar, extraer_socios=socios, leer_identidad=identidad,
       extraer_administracion=admin)
    return corridas.buscar(ambiente, company_id, "a1")


#: Los `documentType` son los de §5.2, no inventados: la escritura es el
#: principal y el de identidad fiscal es complementario.
PRINCIPAL = {"s3Uri": "s3://b/b2b/escritura.pdf", "documentType": "company_deeds_document"}
ANEXO = {"s3Uri": "s3://b/b2b/anexo.pdf", "documentType": "company_id_document"}


def test_una_corrida_que_sale_bien_queda_completed(s3_falso):
    assert correr([PRINCIPAL], s3_falso)["status"] == corridas.COMPLETED


def test_si_no_se_puede_bajar_el_principal_la_corrida_falla(s3_falso, monkeypatch):
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("COMPANY_DEEDS_DOCUMENT",))
    s3_falso.falla_get.add("b2b/escritura.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_DOCUMENT_DOWNLOAD_FAILED"


def test_el_principal_que_falla_AL_BAJAR_no_se_cuela_como_aviso(s3_falso, monkeypatch):
    """El caso peor, y el que el primer intento de este código dejaba pasar: un
    documento se puede caer al resolverlo, al filtrarlo o al descargarlo, y
    mirar solo lo primero hacía que la escritura cayera al bajar, el anexo
    bajara bien, y la corrida terminara analizando el anexo sola."""
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("COMPANY_DEEDS_DOCUMENT",))
    s3_falso.falla_get.add("b2b/escritura.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    assert reg["status"] != corridas.COMPLETED
    assert reg["status"] != corridas.INCOMPLETE


def test_si_falla_un_complementario_la_corrida_queda_incompleta(s3_falso, monkeypatch):
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("COMPANY_DEEDS_DOCUMENT",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    assert reg["status"] == corridas.INCOMPLETE
    assert any(a["reason"] == "EXPECTED_DATA_MISSING" for a in reg["warnings"])


def test_el_aviso_del_complementario_dice_cual_fue(s3_falso, monkeypatch):
    """El contrato define `objectKey` en cada aviso. Sin él, quien integra tiene
    que adivinar a qué documento se refiere."""
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("COMPANY_DEEDS_DOCUMENT",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    faltante = [a for a in reg["warnings"] if a["reason"] == "EXPECTED_DATA_MISSING"][0]
    assert "anexo" in faltante["objectKey"]


def test_la_escritura_es_el_documento_principal(s3_falso):
    """§5.2 fija tres `documentType` y el principal es la escritura.

    Este default arrancó vacío —«todos principales»— por elegir el lado
    conservador sin la especificación a mano. Con el dato, el lado conservador
    es el otro: §8 dice que FAILED consume uno de los 3 intentos del usuario e
    INCOMPLETE no, así que marcar todo como principal le quema un intento cada
    vez que falla un complementario.
    """
    assert co.TIPOS_PRINCIPALES == ("COMPANY_DEEDS_DOCUMENT",)
    s3_falso.falla_get.add("b2b/escritura.pdf")
    assert correr([PRINCIPAL, ANEXO], s3_falso)["status"] == corridas.FAILED


def test_un_complementario_que_falla_no_quema_un_intento(s3_falso):
    """La rama INCOMPLETE de §5.2, que con el default vacío no se disparaba
    nunca. Un cliente chileno sin credenciales del SII cuyo `company_id_document`
    falle tiene que terminar en INCOMPLETE, no en FAILED."""
    s3_falso.falla_get.add("b2b/anexo.pdf")
    assert correr([PRINCIPAL, ANEXO], s3_falso)["status"] == corridas.INCOMPLETE


def test_sin_documentType_declarado_todos_siguen_siendo_principales(s3_falso, monkeypatch):
    """Vacío sigue significando «todos principales». Y con varios principales
    alcanza con que UNO se pueda usar: perder el otro deja la corrida INCOMPLETE,
    no FAILED. Es la regla que hace falta en Colombia, donde el lote puede traer
    la escritura Y el certificado de la Cámara de Comercio."""
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ())
    s3_falso.falla_get.add("b2b/anexo.pdf")
    assert correr([PRINCIPAL, ANEXO], s3_falso)["status"] == corridas.INCOMPLETE
    s3_falso.falla_get.add("b2b/escritura.pdf")
    corridas._reiniciar_memoria()
    assert correr([PRINCIPAL, ANEXO], s3_falso)["status"] == corridas.FAILED


# ── §10 · Requeridos y esperados ────────────────────────────────────────────
# Estos tests REEMPLAZAN a los que había. Aquellos fijaban la regla «sin razón
# social NI RUT, FAILED; con solo el RUT, alcanza», que §10 contradice: el RUT es
# ESPERADO, no requerido, y lo requerido es la razón social y un representante.

def test_sin_razon_social_la_corrida_falla_aunque_haya_rut(s3_falso):
    reg = correr([PRINCIPAL], s3_falso, analizar=analizar_con(**{"Razón Social": "No especificado"}))
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_REQUIRED_DATA_MISSING"
    assert "razón social" in reg["error"]["message"]


def test_sin_ningun_representante_la_corrida_falla(s3_falso):
    """§10: «al menos un representante con nombre y tipo de persona». Sin esto
    una empresa salía COMPLETED sin nadie que pudiera operarla."""
    def sin_nadie(descargados, t0):
        return {"legalRepresentatives": [], "directOwnership": [], "indirectShareholders": []}, []

    reg = correr([PRINCIPAL], s3_falso, socios=sin_nadie)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_REQUIRED_DATA_MISSING"
    assert "representante" in reg["error"]["message"]


def test_un_representante_sin_tipo_de_persona_no_cuenta(s3_falso):
    """El tipo de persona es parte de lo requerido: sin él, la serialización
    omite a la persona, y un representante omitido no cuenta."""
    def sin_tipo(descargados, t0):
        r = {k: v for k, v in REPRESENTANTE.items() if k != "personType"}
        return {"legalRepresentatives": [r], "directOwnership": [], "indirectShareholders": []}, []

    assert correr([PRINCIPAL], s3_falso, socios=sin_tipo)["status"] == corridas.FAILED


def test_sin_rut_la_corrida_queda_incompleta_no_fallida(s3_falso):
    """El RUT es ESPERADO: si falta, INCOMPLETE — el usuario lo completa en el
    formulario — y no FAILED, que le quemaría un intento."""
    reg = correr([PRINCIPAL], s3_falso, analizar=analizar_con(**{"RUT de la sociedad": None}))
    assert reg["status"] == corridas.INCOMPLETE
    assert any("identificador tributario" in a["message"] for a in reg["warnings"])


@pytest.mark.parametrize("campo,pista", [
    ("Fecha de Constitución", "fecha de constitución"),
    ("Domicilio Legal", "domicilio"),
])
def test_cada_esperado_que_falta_deja_la_corrida_incompleta_y_lo_dice(s3_falso, campo, pista):
    reg = correr([PRINCIPAL], s3_falso, analizar=analizar_con(**{campo: "No especificado"}))
    assert reg["status"] == corridas.INCOMPLETE
    assert any(pista in a["message"] for a in reg["warnings"]), "warnings tiene que decir QUÉ falta"


def test_el_representante_sin_documento_ni_cargo_se_nombra(s3_falso):
    """Esperados por persona: documento y cargo. El aviso dice de quién."""
    def incompleto(descargados, t0):
        r = {k: v for k, v in REPRESENTANTE.items() if k not in ("shareholderId", "position")}
        return {"legalRepresentatives": [r], "directOwnership": [], "indirectShareholders": []}, []

    reg = correr([PRINCIPAL], s3_falso, socios=incompleto)
    assert reg["status"] == corridas.INCOMPLETE
    mensajes = " ".join(a["message"] for a in reg["warnings"])
    assert "documento de identidad" in mensajes and "cargo" in mensajes
    assert "MARTINEZ SOTO CLAUDIA ANDREA" in mensajes


def test_un_esperado_que_ya_se_aviso_no_se_duplica(s3_falso):
    """Una fecha que existe pero no se entiende ya tiene su aviso propio
    (DATE_FORMAT_UNPARSEABLE); sumarle «falta la fecha» diría lo mismo dos
    veces."""
    reg = correr([PRINCIPAL], s3_falso,
                 analizar=analizar_con(**{"Fecha de Constitución": "el día que se firmó"}))
    sobre_fecha = [a for a in reg["warnings"] if "fecha" in a["message"].lower()]
    assert len(sobre_fecha) == 1
    assert sobre_fecha[0]["reason"] == "DATE_FORMAT_UNPARSEABLE"


def test_en_colombia_el_nit_sin_digito_verificador_es_esperado(s3_falso):
    """§10: en Colombia, «el NIT con su dígito verificador»."""
    reg = correr([PRINCIPAL], s3_falso, pais="colombia",
                 analizar=analizar_con(**{"RUT de la sociedad": "900123456"}))
    assert reg["status"] == corridas.INCOMPLETE
    assert any("dígito verificador" in a["message"] for a in reg["warnings"])


@pytest.mark.parametrize("nit", ["900123456-7", "900123456 7", "9001234567"])
def test_en_colombia_el_nit_con_digito_verificador_no_se_marca(s3_falso, nit):
    reg = correr([PRINCIPAL], s3_falso, pais="colombia",
                 analizar=analizar_con(**{"RUT de la sociedad": nit}))
    assert not any("dígito verificador" in a["message"] for a in reg["warnings"])


def test_fuera_de_chile_y_colombia_el_identificador_no_es_esperado(s3_falso):
    """§10: en el resto de los orígenes «el identificador tributario puede no
    existir». Marcarlo como faltante le pediría al usuario algo que no tiene."""
    reg = correr([PRINCIPAL], s3_falso, pais="peru",
                 analizar=analizar_con(**{"RUT de la sociedad": None}))
    assert not any("identificador tributario" in a["message"] for a in reg["warnings"])


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
    assert cuerpo["tipos_principales"] == ["COMPANY_DEEDS_DOCUMENT"]
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


def test_el_error_va_en_null_pero_la_clave_viaja(s3_falso):
    """Dos reglas distintas que este test confundía, y por eso escondía un bug.

    Que en INCOMPLETE el `error` vaya VACÍO es correcto: ahí el análisis sirve y
    lo degradado se dice en `warnings`; mandar un error haría que Onboarding
    descarte un resultado utilizable. Pero omitir la CLAVE es otra cosa — §6.2
    pide los mismos campos en cualquier estado, y en Java un campo ausente no es
    lo mismo que uno nulo. La versión anterior de este test pedía que la clave
    NO estuviera.
    """
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("COMPANY_DEEDS_DOCUMENT",))
    s3_falso.falla_get.add("b2b/anexo.pdf")
    correr([PRINCIPAL, ANEXO], s3_falso)
    monkeypatch.undo()

    _, cuerpo = consultar()
    assert cuerpo["status"] == corridas.INCOMPLETE
    assert "error" in cuerpo, "la clave viaja en cualquier estado"
    assert cuerpo["error"] is None, "INCOMPLETE no lleva error con contenido"
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
    monkeypatch.setattr(co, "TIPOS_PRINCIPALES", ("COMPANY_DEEDS_DOCUMENT",))
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
        "documents": [{"s3Uri": "s3://b/b2b/escritura.pdf", "documentType": "company_deeds_document"}],
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


analizar_completo = analizar_falso


def correr_completo(s3, company_id="ACME-1"):
    return correr([PRINCIPAL], s3, company_id=company_id)


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
    assert d["documentType"] == "company_deeds_document"
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
    }, analizar=analizar_completo, extraer_socios=socios_completos,
       leer_identidad=identidad_falsa)


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


# ════════════════════════════════════════════════════════════════════════════
# `jointAdministration` — §11
# ════════════════════════════════════════════════════════════════════════════

def admin_falso(valor=True, **extra):
    def _f(descargados, t0):
        return {"jointAdministration": valor, "minimumSignatures": None,
                "administrators": [], **extra}
    return _f


def correr_con_admin(s3, admin, company_id="ACME-1"):
    corridas.registrar_inicio("prod", company_id, "a1", documentos=[PRINCIPAL])
    co.procesar({
        "ambiente": "prod", "companyId": company_id, "analysisId": "a1",
        "country": "chile", "documents": [PRINCIPAL],
    }, analizar=analizar_completo, extraer_socios=socios_completos,
       extraer_administracion=admin, leer_identidad=identidad_falsa)


@pytest.mark.parametrize("valor", [True, False])
def test_la_administracion_conjunta_llega_a_ep5(s3_falso, valor):
    """§11: el campo va en EP-5, que comparte bloque con EP-3."""
    correr_con_admin(s3_falso, admin_falso(valor))
    assert pedir_seccion("company")[1]["company"]["jointAdministration"] is valor
    assert pedir_resultado()[1]["company"]["jointAdministration"] is valor


def test_si_el_documento_no_lo_dice_va_en_null(s3_falso):
    """§11 lo define `boolean | null`: «`null` si el documento no permite
    determinarlo»."""
    correr_con_admin(s3_falso, admin_falso(None))
    assert pedir_seccion("company")[1]["company"]["jointAdministration"] is None


@pytest.mark.parametrize("basura", ["true", "sí", 1, "CONJUNTA", {}])
def test_solo_un_booleano_de_verdad_pasa(s3_falso, basura):
    """De este valor depende cuántas aprobaciones necesita una empresa para
    operar. Un `"true"` de texto o un 1 son «no lo dijo», no un sí."""
    correr_con_admin(s3_falso, admin_falso(basura))
    assert pedir_seccion("company")[1]["company"]["jointAdministration"] is None


def test_sin_la_pasada_el_campo_sigue_viajando(s3_falso):
    """La clave va siempre, como el resto del bloque: el consumidor no se
    defiende de campos ausentes."""
    correr_completo(s3_falso)
    c = pedir_seccion("company")[1]["company"]
    assert "jointAdministration" in c and c["jointAdministration"] is None


def test_si_la_pasada_revienta_la_corrida_igual_termina(s3_falso):
    """El resto del análisis ya está listo. Perderlo por esto sería peor que
    devolverlo sin el campo."""
    def revienta(descargados, t0):
        raise RuntimeError("Gemini se cayó")

    correr_con_admin(s3_falso, revienta)
    reg = corridas.buscar("prod", "ACME-1", "a1")
    # Termina, no falla. E INCOMPLETE y no COMPLETED: hay un aviso, y §8.1 dice
    # que COMPLETED es «sin avisos».
    assert reg["status"] == corridas.INCOMPLETE
    assert any("régimen de administración" in a["message"] for a in reg["warnings"])
    assert pedir_seccion("company")[1]["company"]["jointAdministration"] is None


def test_el_detalle_se_guarda_aunque_no_viaje(s3_falso):
    """Solo el booleano va en EP-5. Lo demás sale de la misma lectura y queda
    guardado para cuando Compliance defina la marca por persona, que §11 deja
    como pregunta abierta."""
    correr_con_admin(s3_falso, admin_falso(
        True, minimumSignatures=2,
        administrators=[{"name": "CLAUDIA MARTINEZ", "mode": "CONJUNTA", "amountLimit": None}]))
    guardado = corridas.buscar("prod", "ACME-1", "a1")["result"]["administration"]
    assert guardado["minimumSignatures"] == 2
    assert guardado["administrators"][0]["mode"] == "CONJUNTA"
    assert "minimumSignatures" not in pedir_seccion("company")[1]["company"]


def test_la_pasada_no_toca_el_prompt_que_comparte_la_spa():
    """El prompt de administración es PROPIO de la API y está escrito a mano.
    `PROMPT_SHAREHOLDERS` sale de la SPA vía `generar_prompts.py`, y ampliarlo
    para que devuelva esto además rompería el verificador de sincronía."""
    import gemini
    import prompts_generado

    assert not hasattr(prompts_generado, "PROMPT_ADMINISTRACION")
    assert "jointAdministration" not in prompts_generado.PROMPT_SHAREHOLDERS
    assert "jointAdministration" in gemini.PROMPT_ADMINISTRACION


def test_el_campo_no_entro_a_los_18():
    """Agregarlo ahí tocaría `constants.ts`, que comparte la SPA, y metería la
    cola KYB de Compliance en el alcance."""
    import prompts_generado

    assert len(prompts_generado.CAMPOS_PREDEFINIDOS) == 18
    assert not any("dministra" in c for c in prompts_generado.CAMPOS_PREDEFINIDOS)


# ════════════════════════════════════════════════════════════════════════════
# Los 11 errores de la prueba con documentos reales (30-09-2026)
# ════════════════════════════════════════════════════════════════════════════
# Uno o más tests por error, con el número del informe. Los datos son
# inventados: los documentos de la prueba eran de clientes y no entran al repo.

# ── #1 y #10 · COMPLETED es «sin avisos» (§8.1) ─────────────────────────────

def test_1_una_corrida_sana_sin_avisos_es_completed(s3_falso):
    reg = correr([PRINCIPAL], s3_falso)
    assert reg["status"] == corridas.COMPLETED
    assert reg["warnings"] == []


def test_1_cualquier_aviso_deja_la_corrida_incompleta(s3_falso):
    """Las seis empresas del lote de prueba tenían avisos y salieron COMPLETED:
    Onboarding muestra INCOMPLETE como «qué no se pudo leer», así que con
    COMPLETED el usuario nunca se enteraba."""
    def con_aviso(docs, inc, pais=""):
        r = analizar_falso(docs, inc, pais)
        r["avisos"] = ["escritura.pdf: OCR falló en la página 7: timeout"]
        return r

    reg = correr([PRINCIPAL], s3_falso, analizar=con_aviso)
    assert reg["status"] == corridas.INCOMPLETE
    assert reg["warnings"][0]["reason"] == "PARTIALLY_ILLEGIBLE"


def test_1_el_tope_de_ocr_tiene_su_propio_motivo(s3_falso):
    def con_tope(docs, inc, pais=""):
        r = analizar_falso(docs, inc, pais)
        r["avisos"] = ["escritura.pdf: 40 páginas sin capa de texto y el tope de OCR es 15: "
                       "se leyeron las primeras 15."]
        return r

    reg = correr([PRINCIPAL], s3_falso, analizar=con_tope)
    assert reg["warnings"][0]["reason"] == "OCR_PAGE_LIMIT_REACHED"


def test_1_ep2_y_ep3_muestran_los_mismos_avisos(s3_falso):
    """§6.7: EP-3 lleva «los mismos avisos de EP-2». Antes EP-3 sumaba al
    responder avisos que EP-2 no tenía."""
    correr([PRINCIPAL], s3_falso, analizar=analizar_con(**{"Domicilio Legal": None}))
    assert consultar()[1]["warnings"] == pedir_resultado()[1]["warnings"]


def test_1_todo_aviso_tiene_exactamente_las_tres_claves(s3_falso):
    """§6.6. Los avisos de forma traían claves de más —alguno el objeto social
    entero—, y otros no traían `objectKey`."""
    correr([PRINCIPAL], s3_falso, analizar=analizar_con(**{"Fecha de Constitución": "cuando sea"}))
    for a in consultar()[1]["warnings"]:
        assert set(a) == {"reason", "objectKey", "message"}


# ── #3 · PDF cifrado ────────────────────────────────────────────────────────

def test_3_un_pdf_con_cifrado_aes_se_puede_leer():
    """En producción: «cryptography>=3.1 is required for AES algorithm». Los
    documentos oficiales suelen venir protegidos aunque se abran con contraseña
    vacía. Se prueba con un PDF cifrado de verdad, armado acá."""
    pypdf = pytest.importorskip("pypdf")
    pytest.importorskip("cryptography")
    import io

    import extraccion

    w = pypdf.PdfWriter()
    w.add_blank_page(width=200, height=200)
    w.encrypt(user_password="", owner_password="otra", algorithm="AES-256")
    buf = io.BytesIO()
    w.write(buf)

    r = extraccion.extraer_texto("cifrado.pdf", buf.getvalue(), extraccion.Presupuesto(limite_s=30))
    assert not any("cryptography" in a for a in r.avisos), r.avisos
    assert r.paginas_totales == 1


def test_3_cryptography_esta_en_las_dependencias():
    req = (RAIZ / "src" / "requirements.txt").read_text(encoding="utf-8")
    assert any(l.strip().startswith("cryptography") for l in req.splitlines())


def test_3_el_build_trae_cryptography_para_linux_arm():
    """`cryptography` es NATIVA: compila en un Mac y puede fallar en Lambda. Si
    hay un build, el binario tiene que ser ELF aarch64 y no Mach-O."""
    so = list((RAIZ / ".aws-sam" / "build").glob("*/cryptography/hazmat/bindings/_rust*.so"))
    if not so:
        pytest.skip("no hay un `sam build` para revisar")
    cabecera = so[0].read_bytes()[:20]
    assert cabecera[:4] == b"\x7fELF", "no es un binario de Linux"
    assert int.from_bytes(cabecera[18:20], "little") == 183, "no es aarch64 (EM_AARCH64=183)"


# ── #4 · La razón de un fallo de descarga ───────────────────────────────────

def test_4_si_el_objeto_no_esta_en_s3_es_download_failed(s3_falso):
    """Antes salía LENS_DOCUMENT_NOT_READABLE, que le dice al usuario «suba otro
    documento» cuando el documento estaba bien y la falla era de Lens."""
    s3_falso.claves.discard("b2b/escritura.pdf")
    reg = correr([PRINCIPAL], s3_falso)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_DOCUMENT_DOWNLOAD_FAILED"


def test_4_si_falla_la_descarga_tambien_es_download_failed(s3_falso):
    s3_falso.falla_get.add("b2b/escritura.pdf")
    assert correr([PRINCIPAL], s3_falso)["error"]["reason"] == "LENS_DOCUMENT_DOWNLOAD_FAILED"


def test_4_un_principal_sin_texto_recuperable_es_not_readable(s3_falso):
    """Este SÍ es del documento: se bajó y no hay nada que leer."""
    def ilegible(docs, inc, pais=""):
        r = analizar_falso(docs, inc, pais)
        r["documentos"] = [{**d, "ok": False} for d in r["documentos"]]
        return r

    reg = correr([PRINCIPAL], s3_falso, analizar=ilegible)
    assert reg["error"]["reason"] == "LENS_DOCUMENT_NOT_READABLE"


def test_4_si_la_escritura_es_ilegible_no_se_analiza_el_anexo_solo(s3_falso):
    """El mismo caso peor que el de la descarga, un paso más adelante: la
    escritura se baja pero no tiene texto, el anexo sí, y la corrida no puede
    terminar extrayendo la empresa del anexo."""
    def escritura_ilegible(docs, inc, pais=""):
        r = analizar_falso(docs, inc, pais)
        r["documentos"] = [{**d, "ok": d["nombre"] != "escritura.pdf"} for d in r["documentos"]]
        return r

    reg = correr([PRINCIPAL, ANEXO], s3_falso, analizar=escritura_ilegible)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "LENS_DOCUMENT_NOT_READABLE"


# ── #5 · Un documento que no es la escritura ────────────────────────────────

def no_es_escritura(descargado, t0):
    return {"esConstitutivo": "NO", "tipoDetectado": "certificado tributario",
            "activity": None, "legalForm": None}


def test_5_un_documento_que_no_es_escritura_falla_con_document_type_not_match(s3_falso):
    """§5.2. Antes salía COMPLETED y tomaba «USUARIO CEDULA» como cargo."""
    reg = correr([PRINCIPAL], s3_falso, identidad=no_es_escritura)
    assert reg["status"] == corridas.FAILED
    assert reg["error"]["reason"] == "DOCUMENT_TYPE_NOT_MATCH"
    assert "certificado tributario" in reg["error"]["message"]


def test_5_si_no_es_la_escritura_no_se_gasta_nada_mas_en_ella(s3_falso):
    """La verificación va ANTES de los 18 campos."""
    def no_llamar(*_, **__):
        raise AssertionError("no se tiene que analizar un documento equivocado")

    correr([PRINCIPAL], s3_falso, identidad=no_es_escritura, analizar=no_llamar, socios=no_llamar)


def test_5_la_duda_no_falla_la_corrida(s3_falso):
    """Tirar una escritura buena por un error de clasificación nuestro le quema
    al usuario un intento. Solo un «NO» explícito falla."""
    def duda(descargado, t0):
        return {**identidad_falsa(descargado, t0), "esConstitutivo": "DUDA"}

    assert correr([PRINCIPAL], s3_falso, identidad=duda)["status"] == corridas.COMPLETED


def test_5_si_no_se_puede_verificar_la_corrida_sigue_y_lo_dice(s3_falso):
    def revienta(descargado, t0):
        raise RuntimeError("timeout")

    reg = correr([PRINCIPAL], s3_falso, identidad=revienta)
    assert reg["status"] == corridas.INCOMPLETE
    assert any("verificar el tipo" in a["message"] for a in reg["warnings"])


def test_5_el_complementario_de_identidad_fiscal_no_se_verifica(s3_falso):
    """`company_id_document` ES un documento tributario. Descartarlo por eso
    sería descartar justo lo que §5.2 le pide."""
    vistos = []

    def registra(descargado, t0):
        vistos.append(descargado.clave)
        return identidad_falsa(descargado, t0)

    correr([PRINCIPAL, ANEXO], s3_falso, identidad=registra)
    assert vistos == ["b2b/escritura.pdf"]


# ── #6 · La actividad se resume, no se recorta ──────────────────────────────

def test_6_la_actividad_sale_del_resumen_y_no_del_objeto_social(s3_falso):
    correr([PRINCIPAL], s3_falso)
    assert pedir_seccion("company")[1]["company"]["activity"] == "Inversiones"


def test_6_si_el_resumen_no_cabe_va_null_con_aviso_nunca_cortado(s3_falso):
    """«Comercialización,» o «Compra, venta, importación,»: un fragmento con la
    coma colgando es peor que un campo vacío, porque parece un dato."""
    def largo(descargado, t0):
        return {**identidad_falsa(descargado, t0),
                "activity": "Compra, venta, importación y exportación de toda clase de bienes"}

    reg = correr([PRINCIPAL], s3_falso, identidad=largo)
    assert pedir_seccion("company")[1]["company"]["activity"] is None
    assert reg["status"] == corridas.INCOMPLETE


# ── #7 · La forma legal se nombra ───────────────────────────────────────────

def test_7_una_limitada_conserva_la_palabra_que_la_define(s3_falso):
    """«Sociedad de Responsabilidad Limitada» recortada a 30 quedaba «Sociedad
    de Responsabilidad». Le pasaba a todas las limitadas de Chile."""
    correr([PRINCIPAL], s3_falso, analizar=analizar_con(**{"Razón Social": "VIÑEDOS DEL SUR LIMITADA"}))
    forma = pedir_seccion("company")[1]["company"]["legalForm"]
    assert "Limitada" in forma and len(forma) <= 30


def test_7_una_sas_cuya_razon_social_perdio_el_sufijo(s3_falso):
    """La extracción dejó una SAS como «… S A». El sufijo débil cede ante lo que
    dice el documento."""
    def dice_sas(descargado, t0):
        return {**identidad_falsa(descargado, t0), "legalForm": "SAS"}

    correr([PRINCIPAL], s3_falso, identidad=dice_sas,
           analizar=analizar_con(**{"Razón Social": "ANDINA DIGITAL S A"}))
    assert pedir_seccion("company")[1]["company"]["legalForm"] == "S.A.S."


# ── #8 · El companyId como número en EP-1 ───────────────────────────────────

def test_8_ep1_devuelve_el_company_id_como_numero(s3_falso):
    _, cuerpo = llamar(company_id="999999101")
    assert cuerpo["companyId"] == 999999101
    assert isinstance(cuerpo["companyId"], int)


# ── #9 · Colombia, y el lote sin principal ──────────────────────────────────

CAMARA = {"s3Uri": "s3://b/b2b/camara.pdf", "documentType": "company_trade_chamber_sedpe_document"}
COMPOSICION = {"s3Uri": "s3://b/b2b/composicion.pdf", "documentType": "company_shareholders_document"}


def test_9_en_colombia_la_camara_de_comercio_es_principal():
    assert co.es_principal(CAMARA, "colombia")
    assert co.es_principal(CAMARA, "CO")
    assert not co.es_principal(CAMARA, "chile"), "solo en Colombia"


def test_9_un_lote_colombiano_con_camara_se_acepta(s3_falso):
    s3_falso.claves |= {"b2b/camara.pdf", "b2b/composicion.pdf"}
    codigo, _ = llamar({"environment": "prod", "country": "colombia",
                        "documents": [COMPOSICION, CAMARA]})
    assert codigo == 202


def test_9_si_falla_la_camara_en_colombia_la_corrida_falla(s3_falso):
    """Es el principal: si no se puede usar, FAILED. Antes el lote no tenía
    principal y la regla no protegía nada."""
    s3_falso.claves |= {"b2b/camara.pdf", "b2b/composicion.pdf"}
    s3_falso.falla_get.add("b2b/camara.pdf")
    reg = correr([COMPOSICION, CAMARA], s3_falso, pais="colombia")
    assert reg["status"] == corridas.FAILED


def test_9_un_lote_sin_ningun_principal_es_400():
    """Se sabe antes de leer nada, así que es un error de la petición y no de la
    corrida — y no le consume un intento al usuario."""
    codigo, cuerpo = llamar({"environment": "prod", "country": "chile",
                             "documents": [{"s3Uri": "s3://b/b2b/id.pdf",
                                            "documentType": "company_id_document"}]})
    assert codigo == 400
    assert "company_deeds_document" in cuerpo["error"]["message"]
    assert corridas.estado("prod", "ACME-1") == corridas.NOT_STARTED


def test_9_el_400_dice_cuales_son_los_principales_de_ese_pais():
    _, cuerpo = llamar({"environment": "prod", "country": "colombia",
                        "documents": [COMPOSICION]})
    assert "company_trade_chamber_sedpe_document" in cuerpo["error"]["message"]


def test_9_country_es_obligatorio():
    codigo, cuerpo = llamar({"environment": "prod", "documents": CUERPO_OK["documents"]})
    assert codigo == 400 and "country" in cuerpo["error"]["message"]


# ── #11 · El aviso dice qué archivo falló ───────────────────────────────────

def test_11_el_aviso_de_un_documento_que_no_se_pudo_obtener_trae_su_object_key(s3_falso):
    s3_falso.claves.discard("b2b/anexo.pdf")
    reg = correr([PRINCIPAL, ANEXO], s3_falso)
    perdido = [a for a in reg["warnings"] if "anexo" in a["message"]]
    assert perdido and perdido[0]["objectKey"] == "b2b/anexo.pdf"


def test_11_los_avisos_de_lectura_traen_el_object_key_de_su_documento(s3_falso):
    def con_aviso(docs, inc, pais=""):
        r = analizar_falso(docs, inc, pais)
        r["avisos"] = ["anexo.pdf: OCR falló en la página 2: timeout"]
        return r

    reg = correr([PRINCIPAL, ANEXO], s3_falso, analizar=con_aviso)
    assert reg["warnings"][0]["objectKey"] == "b2b/anexo.pdf"


def test_11_documents_lista_tambien_el_que_se_perdio(s3_falso):
    """§6.7: «`ok: false` indica un documento complementario que no se pudo usar
    mientras la corrida siguió con los demás». Si no apareciera, Onboarding no
    sabría cuál de sus archivos falló."""
    s3_falso.falla_get.add("b2b/anexo.pdf")
    correr([PRINCIPAL, ANEXO], s3_falso)
    docs = {d["objectKey"]: d for d in pedir_resultado()[1]["documents"]}
    assert docs["b2b/escritura.pdf"]["ok"] is True
    assert docs["b2b/anexo.pdf"]["ok"] is False


def test_11_documents_lleva_las_seis_claves_del_contrato(s3_falso):
    correr([PRINCIPAL], s3_falso)
    for d in pedir_resultado()[1]["documents"]:
        assert set(d) == {"objectKey", "fileName", "documentType", "ok", "pagesTotal", "pagesRead"}
