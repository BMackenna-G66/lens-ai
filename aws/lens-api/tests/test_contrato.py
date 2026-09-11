"""Tests del contrato `BusinessShareholders` — Fase 5.

El hito de la fase son dos cosas: que un POST repetido con el mismo
`analysisId` no analice de nuevo, y que los cuatro códigos de error respondan
como el bot que se reemplaza.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

os.environ.setdefault("API_SECRET", "prueba")

import almacen  # noqa: E402
import app  # noqa: E402
import contrato  # noqa: E402

# `app.API_SECRET` se fija al IMPORTAR el módulo, y para cuando corre este
# archivo ya lo importó `test_app.py` con su propio valor. Se lee de ahí en vez
# de asumir el nuestro: si no, todo responde 401 y los tests miden otra cosa.
SECRETO = app.API_SECRET


def _evento(cuerpo=None, ruta="/v1/analyses", metodo="POST", secreto=None):
    return {
        "rawPath": ruta,
        "requestContext": {"http": {"method": metodo, "path": ruta}},
        "headers": {"x-api-secret": SECRETO if secreto is None else secreto},
        "body": json.dumps(cuerpo) if cuerpo is not None else None,
    }


def _cuerpo(resp):
    return json.loads(resp["body"])


# ── Los cuatro códigos del bot ──────────────────────────────────────────────

def test_los_cuatro_codigos_tienen_su_statuscode():
    assert contrato.error("MISSING_FOLDER_PATH")["statusCode"] == 400
    assert contrato.error("NO_DOCUMENTS_FOUND")["statusCode"] == 404
    assert contrato.error("NO_VALID_FILES")["statusCode"] == 400
    assert contrato.error("AWS_ERROR")["statusCode"] == 500


def test_aws_error_no_lleva_msg_type():
    """No es un olvido: el bot no lo manda y el consumidor distingue por su
    ausencia."""
    assert "msg_type" not in contrato.error("AWS_ERROR")
    for r in ("MISSING_FOLDER_PATH", "NO_DOCUMENTS_FOUND", "NO_VALID_FILES"):
        assert contrato.error(r)["msg_type"] == "SHAREHOLDERS_DOCS_ERROR"


def test_un_reason_desconocido_cae_en_aws_error():
    """El consumidor tiene una lista cerrada: inventarle un código lo dejaría
    sin manejar."""
    e = contrato.error("ALGO_QUE_NO_EXISTE")
    assert e["reason"] == "AWS_ERROR"
    assert e["statusCode"] == 500


def test_los_errores_viajan_con_http_200():
    """El statusCode real va en el CUERPO. Devolver un 400 de verdad rompería a
    quien ya está integrado contra el bot."""
    r = app.lambda_handler(_evento({}))
    assert r["statusCode"] == 200
    assert _cuerpo(r)["statusCode"] == 400
    assert _cuerpo(r)["reason"] == "MISSING_FOLDER_PATH"
    assert _cuerpo(r)["success"] is False


def test_falta_folder_path():
    assert _cuerpo(app.lambda_handler(_evento({})))["reason"] == "MISSING_FOLDER_PATH"
    assert _cuerpo(app.lambda_handler(_evento({"folderPath": "  "})))["reason"] == "MISSING_FOLDER_PATH"


def test_files_explicito_tambien_sirve():
    """El bot acepta las dos formas: prefijo o lista de archivos."""
    assert contrato.validar_entrada({"files": ["a/b.pdf"]}) is None
    assert contrato.validar_entrada({"folder_path": "a/"}) is None


# ── session_id ──────────────────────────────────────────────────────────────

def test_session_id_vuelve_sin_interpretarse():
    raro = "  WS::abc-123 | con espacios  "
    r = _cuerpo(app.lambda_handler(_evento({"session_id": raro})))
    assert r["session_id"] == raro


def test_sin_session_id_no_aparece_la_clave():
    assert "session_id" not in _cuerpo(app.lambda_handler(_evento({})))


# ── Idempotencia ────────────────────────────────────────────────────────────

def test_el_segundo_post_devuelve_lo_guardado_y_no_reanaliza():
    almacen._reiniciar_memoria()
    guardada = contrato.respuesta(analysis_id="id-1", company={"companyName": "AD ASTRA"})
    almacen.guardar("id-1", guardada)

    # Sin folderPath: si NO fuera idempotente, esto daría MISSING_FOLDER_PATH.
    r = _cuerpo(app.lambda_handler(_evento({"analysisId": "id-1"})))
    assert r["success"] is True
    assert r["analysisId"] == "id-1"
    assert r["company"]["companyName"] == "AD ASTRA"


def test_el_segundo_post_refresca_el_session_id():
    """La segunda llamada puede venir de otra sesión del consumidor: el cuerpo
    es el mismo pero el session_id tiene que ser el nuevo."""
    almacen._reiniciar_memoria()
    almacen.guardar("id-2", contrato.respuesta(analysis_id="id-2", session_id="vieja"))
    r = _cuerpo(app.lambda_handler(_evento({"analysisId": "id-2", "session_id": "nueva"})))
    assert r["session_id"] == "nueva"


def test_sin_analysis_id_no_hay_idempotencia():
    """Sin id no hay con qué deduplicar: tiene que seguir el camino normal."""
    almacen._reiniciar_memoria()
    r = _cuerpo(app.lambda_handler(_evento({})))
    assert r["reason"] == "MISSING_FOLDER_PATH"


# ── GET /v1/analyses/{id} ───────────────────────────────────────────────────

def test_get_devuelve_lo_mismo_que_el_post():
    almacen._reiniciar_memoria()
    guardada = contrato.respuesta(analysis_id="id-3", company={"companyName": "X"})
    almacen.guardar("id-3", guardada)
    r = _cuerpo(app.lambda_handler(_evento(ruta="/v1/analyses/id-3", metodo="GET")))
    assert r == guardada


def test_get_de_un_id_que_no_existe():
    almacen._reiniciar_memoria()
    r = _cuerpo(app.lambda_handler(_evento(ruta="/v1/analyses/no-existe", metodo="GET")))
    assert r["reason"] == "NO_DOCUMENTS_FOUND"
    assert r["statusCode"] == 404


def test_el_get_nunca_analiza():
    """Aunque no esté guardado, un GET no dispara un análisis."""
    almacen._reiniciar_memoria()
    r = _cuerpo(app.lambda_handler(_evento(ruta="/v1/analyses/otro", metodo="GET")))
    assert r["success"] is False


# ── La forma de la respuesta ────────────────────────────────────────────────

def test_las_dos_claves_de_shareholders_aparecen_siempre():
    """Es la regla de oro del contrato: el consumidor cuenta con las dos aunque
    una quede vacía."""
    r = contrato.respuesta(analysis_id="x")
    assert r["shareholders"]["directOwnership"] == []
    assert r["shareholders"]["indirectShareholders"] == []


def test_raw_text_solo_si_se_pide():
    assert "rawText" not in contrato.respuesta(analysis_id="x")
    assert contrato.respuesta(analysis_id="x", raw_text=["hola"])["rawText"] == ["hola"]


def test_las_personas_traen_todas_las_claves():
    """El consumidor no tiene que defenderse de campos ausentes."""
    r = contrato.respuesta(analysis_id="x", direct_ownership=[{"shareholderName": "JUAN"}])
    p = r["shareholders"]["directOwnership"][0]
    for k in ("personType", "shareholderName", "name", "lastName", "shareholderId",
              "identificationType", "countryOfOrigin", "ownershipPercentage", "isPEP"):
        assert k in p


def test_la_cadena_anidada_se_conserva():
    r = contrato.respuesta(analysis_id="x", indirect_shareholders=[
        {"shareholderName": "INV SpA", "personType": "JURIDICA",
         "indirectShareholders": [{"shareholderName": "ANA", "personType": "NATURAL"}]}])
    anidados = r["shareholders"]["indirectShareholders"][0]["indirectShareholders"]
    assert len(anidados) == 1 and anidados[0]["shareholderName"] == "ANA"


# ── Que /v1/analisis NO se haya roto ────────────────────────────────────────

def test_la_ruta_vieja_sigue_existiendo():
    """Lo que permite migrar sin ventana de corte es que convivan."""
    r = app.lambda_handler(_evento({}, ruta="/v1/analisis"))
    # Responde 400 por falta de documentos, no 404 por ruta desconocida.
    assert r["statusCode"] == 400
    assert "Ruta no encontrada" not in _cuerpo(r).get("error", "")


def test_una_ruta_inexistente_sigue_dando_404():
    r = app.lambda_handler(_evento({}, ruta="/v1/otra"))
    assert r["statusCode"] == 404


def test_analyses_exige_el_secreto():
    r = app.lambda_handler(_evento({}, secreto="mal"))
    assert r["statusCode"] == 401
