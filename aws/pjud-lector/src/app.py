"""
lens-pjud-lector: lo que la ficha de la Bandeja necesita del scraper de PJUD.

Contrato «Integración Scraper PJUD ↔ LENS» (Bautista, oct-2026), §4.2. El
navegador NUNCA lee `scraper_casos`: la ficha le pide al Worker
`GET /pjud/caso/{id}`, el Worker verifica el ID token de Firebase del analista
y reenvía acá con un secreto de servidor. Este Lambda es el único que lee esa
colección para la SPA.

── Por qué un Lambda propio y no un modo de lens-flujo-autonomo ───────────────
lens-flujo-autonomo tiene concurrencia reservada 1, porque las corridas no se
pueden pisar. Una lectura que llegara durante una corrida —que dura hasta
minutos— rebotaría. Además, así este Lambda solo puede LEER `scraper_casos/{id}`:
no tiene ni el secreto del disparador ni código que escriba.

── Qué devuelve ──────────────────────────────────────────────────────────────
Lo mínimo para el área «Análisis de causa (IA)»: `en_proceso`, el estado de la
documentación con sus errores, avisos y causas sin verificar, el texto y la
fecha del análisis, y `resuelto_en`. NO la lista de folios: su `descripcion`
puede traer nombres de terceros. Ni siquiera se pide a Firestore: la lectura va
con máscara de campos.

Sin RUT, RUC ni nombres en los logs.
"""

import base64
import hmac
import json
import logging
import os
import re
import urllib.error
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PROYECTO = os.environ.get("FIRESTORE_PROJECT", "lens-ai-9da63")
# La base aparte de PJUD. Sus reglas niegan todo acceso de cliente.
BASE = os.environ.get("FIRESTORE_DATABASE", "pjud")
SECRETO = os.environ.get("LECTOR_SECRET", "")

#: Los únicos campos que se le piden a Firestore.
CAMPOS = [
    "en_proceso",
    "documentacion.estado", "documentacion.error", "documentacion.ultimo_error",
    "documentacion.causas_sin_verificar", "documentacion.avisos_pjud",
    "documentacion.documentos_borrados_en",
    "analisis.texto", "analisis.generado",
    "resuelto_en",
]

#: Un número de caso de Salesforce: solo dígitos. Cualquier otra cosa no llega a Firestore.
CASO = re.compile(r"^\d{6,12}$")

_creds = None


def _token() -> str:
    """Token de la service account, renovado solo cuando vence."""
    global _creds
    from google.oauth2 import service_account
    import google.auth.transport.requests as gtr

    if _creds is None:
        crudo = os.environ.get("FIREBASE_SA_JSON", "")
        try:
            info = json.loads(base64.b64decode(crudo))
        except Exception:                                   # noqa: BLE001 — puede venir sin base64
            info = json.loads(crudo)
        _creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/datastore"])
    if not _creds.valid:
        _creds.refresh(gtr.Request())
    return _creds.token


def _leer(case_id: str) -> dict | None:
    """El documento con la máscara de campos, o None si no existe."""
    q = "&".join(f"mask.fieldPaths={c}" for c in CAMPOS)
    url = (f"https://firestore.googleapis.com/v1/projects/{PROYECTO}/databases/{BASE}"
           f"/documents/scraper_casos/{case_id}?{q}")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {_token()}"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def _val(v):
    """Valor de la REST de Firestore → valor Python (los timestamps quedan en ISO)."""
    if v is None:
        return None
    for k in ("stringValue", "booleanValue", "timestampValue"):
        if k in v:
            return v[k]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return v["doubleValue"]
    if "nullValue" in v:
        return None
    if "mapValue" in v:
        return {k2: _val(v2) for k2, v2 in (v["mapValue"].get("fields") or {}).items()}
    if "arrayValue" in v:
        return [_val(x) for x in (v["arrayValue"].get("values") or [])]
    return None


def _causa(x):
    """Una causa sin verificar: el RUC y el motivo, nada más."""
    if isinstance(x, dict):
        return {"ruc": x.get("ruc"), "motivo": x.get("motivo")}
    return x


def minimo(doc: dict) -> dict:
    """Lo que entrega la ruta, armado campo por campo. Puro."""
    f = {k: _val(v) for k, v in (doc.get("fields") or {}).items()}
    d = f.get("documentacion") or {}
    a = f.get("analisis") or {}
    en = f.get("en_proceso")
    return {
        "existe": True,
        "en_proceso": ({"tipo": en.get("tipo"), "estado": en.get("estado"), "job_id": en.get("job_id")}
                       if isinstance(en, dict) else None),
        "documentacion": {
            "estado": d.get("estado"),
            "error": d.get("error"),
            "ultimo_error": d.get("ultimo_error"),
            "causas_sin_verificar": [_causa(x) for x in (d.get("causas_sin_verificar") or [])],
            "avisos_pjud": list(d.get("avisos_pjud") or []),
            "documentos_borrados_en": d.get("documentos_borrados_en"),
        } if d else None,
        "analisis": {"texto": a.get("texto"), "generado": a.get("generado")} if a else None,
        "resuelto_en": f.get("resuelto_en"),
    }


def _resp(codigo: int, cuerpo: dict) -> dict:
    return {"statusCode": codigo, "headers": {"content-type": "application/json; charset=utf-8"},
            "body": json.dumps(cuerpo, ensure_ascii=False)}


def lambda_handler(event, _context):
    headers = {k.lower(): v for k, v in ((event or {}).get("headers") or {}).items()}
    dado = headers.get("x-pjud-lector", "")
    # Sin secreto configurado no se atiende a nadie: falla cerrado.
    if not SECRETO or not hmac.compare_digest(dado.encode(), SECRETO.encode()):
        return _resp(401, {"error": "no autorizado"})
    try:
        cuerpo = json.loads(event.get("body") or "{}")
        if event.get("isBase64Encoded"):
            cuerpo = json.loads(base64.b64decode(event["body"]))
    except Exception:                                       # noqa: BLE001
        return _resp(400, {"error": "cuerpo inválido"})
    case_id = str(cuerpo.get("caseId") or "").strip()
    if not CASO.match(case_id):
        return _resp(400, {"error": "caseId inválido"})
    try:
        doc = _leer(case_id)
    except Exception as e:                                  # noqa: BLE001
        logger.warning("lectura fallida para el caso %s: %s", case_id, type(e).__name__)
        return _resp(503, {"error": "no se pudo leer el análisis"})
    if doc is None:
        return _resp(200, {"existe": False})
    return _resp(200, minimo(doc))
