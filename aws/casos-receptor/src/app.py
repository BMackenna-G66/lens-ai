"""
Receptor de casos OFAC/PEP + Transacciones Bot.

Endpoint HTTP (API Gateway HTTP API) al que Salesforce hace POST con casos de
compliance. Autentica por header `x-api-secret`, acepta un objeto o un array de
objetos (todos los campos opcionales) y PERSISTE cada caso en Firestore
(proyecto lens-ai-9da63, colección `casos_sf`), que la app Lens lee en vivo.

Privacidad: el payload trae DNI y datos personales. NUNCA se loguea el body
completo; solo el número de caso y el asunto.

Secretos (idealmente en SSM Parameter Store, SecureString):
  - API secret            → param cuyo nombre viene en SSM_API_SECRET_PARAM
  - Service account JSON  → param cuyo nombre viene en SSM_FIREBASE_SA_PARAM
Fallback para pruebas locales: variables de entorno API_SECRET / FIREBASE_SA_JSON.
"""

import json
import logging
import os
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Config (nombres de parámetros / entorno) ────────────────────────────────
SSM_API_SECRET_PARAM = os.environ.get("SSM_API_SECRET_PARAM", "")
SSM_FIREBASE_SA_PARAM = os.environ.get("SSM_FIREBASE_SA_PARAM", "")
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", "lens-ai-9da63")
FIRESTORE_COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "casos_sf")

# Campos "conocidos" que se promueven a nivel superior para listar en Lens.
# El resto del payload se guarda completo bajo `datos`.
_CAMPO_NUMERO = "Número del caso"
_CAMPO_ASUNTO = "Asunto"
_CAMPO_CUENTA = "Nombre de la cuenta"
_CAMPO_PAIS = "País"

_cache: dict = {}


# ── Secretos ────────────────────────────────────────────────────────────────
def _ssm_value(param_name: str) -> str:
    import boto3  # disponible en el runtime de Lambda; lazy para tests

    ssm = boto3.client("ssm")
    return ssm.get_parameter(Name=param_name, WithDecryption=True)["Parameter"]["Value"]


def _api_secret() -> str:
    if "api_secret" not in _cache:
        if SSM_API_SECRET_PARAM:
            _cache["api_secret"] = _ssm_value(SSM_API_SECRET_PARAM)
        else:
            _cache["api_secret"] = os.environ.get("API_SECRET", "")
    return _cache["api_secret"]


def _service_account_info() -> dict:
    if "sa_info" not in _cache:
        raw = _ssm_value(SSM_FIREBASE_SA_PARAM) if SSM_FIREBASE_SA_PARAM else os.environ.get("FIREBASE_SA_JSON", "")
        raw = (raw or "").strip()
        # Acepta el JSON directo o codificado en base64 (evita problemas de
        # escapado al pasarlo como variable de entorno / parámetro CFN).
        if raw and not raw.startswith("{"):
            import base64

            raw = base64.b64decode(raw).decode("utf-8")
        _cache["sa_info"] = json.loads(raw)
    return _cache["sa_info"]


def _access_token() -> str:
    """Token OAuth de la service account para escribir en Firestore (REST)."""
    from google.oauth2 import service_account  # lazy: no requerido para importar el módulo
    import google.auth.transport.requests as gtr

    if "creds" not in _cache:
        _cache["creds"] = service_account.Credentials.from_service_account_info(
            _service_account_info(),
            scopes=["https://www.googleapis.com/auth/datastore"],
        )
    creds = _cache["creds"]
    creds.refresh(gtr.Request())
    return creds.token


# ── Firestore REST ───────────────────────────────────────────────────────────
def _to_fs_value(v):
    """Convierte un valor Python al formato Value de la API REST de Firestore."""
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, (list, tuple)):
        return {"arrayValue": {"values": [_to_fs_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {str(k): _to_fs_value(x) for k, x in v.items()}}}
    return {"stringValue": str(v)}


def _doc_id(caso: dict) -> str:
    numero = str(caso.get(_CAMPO_NUMERO, "") or "").strip()
    if numero:
        # Los IDs de Firestore no admiten '/'. Normalizamos por las dudas.
        return numero.replace("/", "-")
    return f"auto-{uuid.uuid4().hex}"


# Campos que ESCRIBE la ingesta. El resto del documento (screening, investigacion,
# decisionCompliance, asignacion, sla, respuestaSalesforce, versionCaso y la
# subcolección de auditoría) lo maneja Lens y NO debe tocarse al reingestar.
_CAMPOS_INGESTA = ["numeroCaso", "asunto", "nombreCuenta", "pais", "recibidoEn", "origen", "datos"]


def _build_patch_url(doc_id: str, campos: list) -> str:
    """URL de PATCH con updateMask: Firestore escribe SOLO `campos` y preserva el resto.
    Así una reingesta de Salesforce no pisa el trabajo del analista (screening, etc.)."""
    base = (
        f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}"
        f"/databases/(default)/documents/{FIRESTORE_COLLECTION}/{urllib.request.quote(doc_id)}"
    )
    mask = "&".join(f"updateMask.fieldPaths={c}" for c in campos)
    return f"{base}?{mask}"


def _guardar_en_firestore(caso: dict) -> None:
    """UPSERT del caso en Firestore vía PATCH con updateMask (crea o actualiza por
    número de caso, preservando el estado operacional agregado por Lens)."""
    doc_id = _doc_id(caso)
    fields = {
        "numeroCaso": str(caso.get(_CAMPO_NUMERO, "") or ""),
        "asunto": str(caso.get(_CAMPO_ASUNTO, "") or ""),
        "nombreCuenta": str(caso.get(_CAMPO_CUENTA, "") or ""),
        "pais": str(caso.get(_CAMPO_PAIS, "") or ""),
        "recibidoEn": datetime.now(timezone.utc).isoformat(),
        "origen": "salesforce",
        "datos": caso,  # payload completo, tal cual llegó
    }
    body = json.dumps({"fields": {k: _to_fs_value(v) for k, v in fields.items()}}).encode("utf-8")
    url = _build_patch_url(doc_id, list(fields.keys()))
    req = urllib.request.Request(url, data=body, method="PATCH")
    req.add_header("Authorization", f"Bearer {_access_token()}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=8) as resp:
        resp.read()


def procesar_caso(caso: dict) -> bool:
    """Persiste el caso. Devuelve True si se guardó. NUNCA loguea el payload completo."""
    numero = caso.get(_CAMPO_NUMERO, "(sin número)")
    asunto = caso.get(_CAMPO_ASUNTO, "(sin asunto)")
    try:
        _guardar_en_firestore(caso)
        logger.info("Caso guardado: numero=%s asunto=%s", numero, asunto)
        return True
    except Exception as error:  # noqa: BLE001
        logger.error("No se pudo guardar el caso numero=%s: %s", numero, type(error).__name__)
        return False


# ── Handler ───────────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    headers = {k.lower().strip(): v for k, v in (event.get("headers") or {}).items()}
    secret = (_api_secret() or "").strip()
    recibido = (headers.get("x-api-secret") or "").strip()
    if not secret or recibido != secret:
        return _respuesta(401, {"error": "No autorizado"})

    try:
        casos = json.loads(event.get("body") or "")
    except (json.JSONDecodeError, TypeError):
        return _respuesta(400, {"error": "JSON inválido"})

    if isinstance(casos, dict):
        casos = [casos]
    if not isinstance(casos, list) or not casos:
        return _respuesta(400, {"error": "Se espera un objeto o array de casos no vacío"})

    for i, caso in enumerate(casos):
        if not isinstance(caso, dict):
            return _respuesta(422, {"error": f"El elemento {i} no es un objeto JSON"})

    guardados = sum(1 for caso in casos if procesar_caso(caso))
    return _respuesta(200, {"ok": True, "recibidos": len(casos), "guardados": guardados})


def _respuesta(status: int, body: dict):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
