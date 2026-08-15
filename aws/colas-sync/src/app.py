"""
Sincronización diaria Firestore → Redshift (schema `colas_trabajo`).

Corre sola todos los días: lee los casos de la Bandeja y su auditoría desde
Firestore y los escribe en Redshift. Existe porque el cluster se pausa de noche
(22:30–08:00 UTC) y lo que la app manda en esa ventana se pierde: este job lo
recupera sin que nadie tenga que apretar un botón.

Es INDEPENDIENTE de las otras dos Lambdas (casos-receptor y colas-logger): stack
propio, función propia, rol propio y código propio. Está inspirado en el receptor
para el acceso a Firestore (google-auth, wheels puros → `sam build` sin Docker),
pero no comparte código con él.

Idempotente: cada tabla se reescribe por clave natural (DELETE + INSERT), así que
correrlo de más nunca duplica.
"""

import base64
import json
import logging
import os
import time
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", "lens-ai-9da63")
FIRESTORE_COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "casos_sf")
CLUSTER = os.environ.get("REDSHIFT_CLUSTER", "compliance-redshift-cluster")
DATABASE = os.environ.get("REDSHIFT_DATABASE", "dev")
DB_USER = os.environ.get("REDSHIFT_DB_USER", "awsuser")
SCHEMA = os.environ.get("REDSHIFT_SCHEMA", "colas_trabajo")
FILAS_POR_LOTE = int(os.environ.get("FILAS_POR_LOTE", "40"))

# Tablas destino: (clave natural, {columna: tipo}). Mismo contrato que el logger.
TABLAS = {
    "caso": ("numero_caso", {
        "numero_caso": "", "caso_id": "", "cola": "", "asunto": "", "nombre_cuenta": "",
        "pais": "", "pais_codigo": "", "id_interno_usuario": "int", "origen": "",
        "recibido_en": "ts", "actualizado_en": "ts"}),
    "cierre": ("cierre_id", {
        "cierre_id": "", "numero_caso": "", "canal": "", "resultado_ok": "bool",
        "automatico": "bool", "tipologia": "", "actor_id": "", "actor_nombre": "",
        "actor_tipo": "", "ocurrido_en": "ts"}),
    "screening": ("screening_id", {
        "screening_id": "", "numero_caso": "", "fuente": "", "estado": "", "decision": "",
        "delitos_unicos": "int", "es_pep": "bool", "screened_en": "ts"}),
    "evento_auditoria": ("event_id", {
        "event_id": "", "numero_caso": "", "tipo": "", "actor_id": "", "actor_tipo": "",
        "ocurrido_en": "ts", "correlation_id": "", "version_caso": "int",
        "cambios": "json", "metadata": "json"}),
}


# ── Firestore ────────────────────────────────────────────────────────────────
def _access_token() -> str:
    """Token de la service account (mismo mecanismo que el receptor)."""
    from google.oauth2 import service_account
    import google.auth.transport.requests as gtr

    crudo = os.environ.get("FIREBASE_SA_JSON", "")
    if not crudo:
        raise RuntimeError("Falta FIREBASE_SA_JSON")
    try:
        info = json.loads(base64.b64decode(crudo))
    except Exception:                                   # noqa: BLE001 — puede venir sin base64
        info = json.loads(crudo)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/datastore"])
    creds.refresh(gtr.Request())
    return creds.token


def _val(v):
    """Valor de la REST de Firestore → valor Python."""
    if v is None:
        return None
    for k in ("stringValue", "booleanValue", "timestampValue"):
        if k in v:
            return v[k]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return v["doubleValue"]
    if "mapValue" in v:
        return {k2: _val(v2) for k2, v2 in (v["mapValue"].get("fields") or {}).items()}
    if "arrayValue" in v:
        return [_val(x) for x in (v["arrayValue"].get("values") or [])]
    return None


def _listar(tok: str, path: str) -> list:
    docs, nxt = [], None
    while True:
        url = (f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}"
               f"/databases/(default)/documents/{path}?pageSize=300")
        if nxt:
            url += f"&pageToken={nxt}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.loads(r.read())
        docs.extend(d.get("documents", []))
        nxt = d.get("nextPageToken")
        if not nxt:
            return docs


# ── Armado de filas ──────────────────────────────────────────────────────────
def _ts(v):
    return str(v).replace("T", " ").replace("Z", "").strip()[:23] if v else None


def _cola(asunto: str) -> str:
    a = (asunto or "").strip()
    if a.lower() == "coincidencia ofac":
        return "ofac"
    return "remesa" if "DETIENE TX" in a.upper() else "otros"


def _filas_de_caso(doc: dict, eventos: list) -> dict:
    f = {k: _val(v) for k, v in (doc.get("fields") or {}).items()}
    cid = doc["name"].split("/")[-1]
    datos = f.get("datos") or {}
    numero = str(f.get("numeroCaso") or datos.get("Número del caso") or cid).strip()
    if numero.isdigit() and len(numero) < 8:       # Salesforce usa 8 dígitos con ceros
        numero = numero.zfill(8)
    pais = str(f.get("pais") or datos.get("País") or "")
    asunto = str(f.get("asunto") or datos.get("Asunto") or "")
    idi = datos.get("Id interno del usuario")

    out = {t: [] for t in TABLAS}
    out["caso"].append({
        "numero_caso": numero, "caso_id": cid, "cola": _cola(asunto), "asunto": asunto,
        "nombre_cuenta": f.get("nombreCuenta"), "pais": pais,
        "pais_codigo": "CO" if "colombia" in pais.lower() else ("CL" if "chile" in pais.lower() else None),
        "id_interno_usuario": idi if str(idi or "").strip().isdigit() else None,
        "origen": f.get("origen") or "salesforce",
        "recibido_en": _ts(f.get("recibidoEn")), "actualizado_en": _ts(f.get("actualizadoEn"))})

    # Screening cacheado en el propio caso.
    sc = f.get("screening") or {}
    if sc:
        en = _ts(sc.get("screenedAt")) or _ts(f.get("recibidoEn"))
        if en:
            out["screening"].append({
                "screening_id": f"{numero}|{en}", "numero_caso": numero,
                "fuente": sc.get("fuente"), "estado": sc.get("estado"),
                "decision": sc.get("decision"), "delitos_unicos": sc.get("delitosUnicos"),
                "es_pep": sc.get("pep"), "screened_en": en})

    # Auditoría completa del caso.
    auto = False
    for ev in eventos:
        e = {k: _val(v) for k, v in (ev.get("fields") or {}).items()}
        if e.get("tipo") == "CIERRE_AUTOMATICO":
            auto = True
        if not e.get("eventId"):
            continue
        out["evento_auditoria"].append({
            "event_id": e["eventId"], "numero_caso": e.get("numeroCaso") or numero,
            "tipo": e.get("tipo") or "DESCONOCIDO", "actor_id": e.get("actorId"),
            "actor_tipo": e.get("actorTipo"), "ocurrido_en": _ts(e.get("timestamp")),
            "correlation_id": e.get("correlationId"), "version_caso": e.get("versionCaso"),
            "cambios": e.get("cambios"), "metadata": e.get("metadata")})

    # Cierres por canal. Si hubo CIERRE_AUTOMATICO, el actor es el flujo; si no,
    # se deja en NULL (no se inventa quién cerró).
    for canal in ("sf", "admin"):
        c = (f.get("cierres") or {}).get(canal) or {}
        if c.get("ok") is True:
            en = _ts(c.get("en")) or _ts(f.get("recibidoEn")) or "1970-01-01 00:00:00"
            out["cierre"].append({
                "cierre_id": f"{numero}|{canal.upper()}|{en}", "numero_caso": numero,
                "canal": canal.upper(), "resultado_ok": True,
                "automatico": True if auto else None, "tipologia": c.get("tipologia"),
                "actor_id": "system" if auto else None,
                "actor_nombre": "Flujo automático" if auto else None,
                "actor_tipo": "SYSTEM" if auto else None, "ocurrido_en": en})
    return out


# ── Redshift ─────────────────────────────────────────────────────────────────
def _lit(v, tipo: str) -> str:
    """Valor → literal SQL. Las comillas simples se duplican (escape estándar)."""
    if v is None or v == "":
        return "NULL"
    if tipo == "bool":
        return "TRUE" if v else "FALSE"
    if tipo == "int":
        try:
            return str(int(v))
        except (TypeError, ValueError):
            return "NULL"
    if tipo == "json":
        txt = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
        return "JSON_PARSE('" + txt.replace("'", "''") + "')"
    s = str(v).replace("'", "''")
    return f"'{s}'::TIMESTAMP" if tipo == "ts" else f"'{s}'"


def _ejecutar(client, sql: str, intentos: int = 6):
    """Ejecuta esperando a que termine. Esperar acota los statements ACTIVOS, que
    es la cuota que revienta (500 por cuenta) si se lanzan todos de golpe."""
    import random
    for n in range(intentos):
        try:
            sid = client.execute_statement(
                ClusterIdentifier=CLUSTER, Database=DATABASE, DbUser=DB_USER, Sql=sql)["Id"]
            break
        except Exception as e:                                       # noqa: BLE001
            if ("ActiveStatementsExceeded" in str(e) or "Throttling" in str(e)) and n < intentos - 1:
                time.sleep(min(2 ** n, 16) + random.random())
                continue
            raise
    for _ in range(120):
        d = client.describe_statement(Id=sid)
        if d["Status"] in ("FINISHED", "FAILED", "ABORTED"):
            if d["Status"] != "FINISHED":
                raise RuntimeError(f"{d['Status']}: {d.get('Error', '')[:300]}")
            return
        time.sleep(0.5)
    raise RuntimeError("timeout esperando el statement")


def _escribir(filas: dict) -> dict:
    import boto3

    client = boto3.client("redshift-data")
    resumen = {}
    for tabla, (pk, cols) in TABLAS.items():
        rows = filas.get(tabla) or []
        if not rows:
            continue
        columnas = ", ".join(cols)
        escritas = 0
        for i in range(0, len(rows), FILAS_POR_LOTE):
            lote = rows[i:i + FILAS_POR_LOTE]
            claves = ", ".join(_lit(r.get(pk), "") for r in lote)
            tuplas = ", ".join(
                "(" + ", ".join(_lit(r.get(c), t) for c, t in cols.items()) + ")" for r in lote)
            _ejecutar(client, f"DELETE FROM {SCHEMA}.{tabla} WHERE {pk} IN ({claves})")
            _ejecutar(client, f"INSERT INTO {SCHEMA}.{tabla} ({columnas}) VALUES {tuplas}")
            escritas += len(lote)
        resumen[tabla] = escritas
        logger.info("%s: %s filas", tabla, escritas)
    return resumen


def lambda_handler(event, _context):
    inicio = time.time()
    tok = _access_token()
    casos = _listar(tok, FIRESTORE_COLLECTION)
    logger.info("casos en Firestore: %s", len(casos))

    filas = {t: [] for t in TABLAS}
    for doc in casos:
        cid = doc["name"].split("/")[-1]
        try:
            eventos = _listar(tok, f"{FIRESTORE_COLLECTION}/{cid}/auditoria")
        except Exception:                                            # noqa: BLE001
            eventos = []
        for tabla, rows in _filas_de_caso(doc, eventos).items():
            filas[tabla].extend(rows)

    resumen = _escribir(filas)
    salida = {"ok": True, "casos": len(casos), "escritas": resumen,
              "segundos": round(time.time() - inicio, 1)}
    logger.info("sincronización lista: %s", json.dumps(salida))
    return salida
