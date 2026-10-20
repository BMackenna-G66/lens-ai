"""
Sincronización diaria Firestore → Redshift (schema `colas_trabajo`).

Corre sola todos los días: lee los casos de la Bandeja y su auditoría desde
Firestore y los escribe en Redshift. Existe porque el cluster se pausa de noche
(22:30–08:00 UTC) y los fines de semana, y lo que se manda en esa ventana se
pierde: este job lo recupera sin que nadie tenga que apretar un botón.

Es INDEPENDIENTE de las otras dos Lambdas (casos-receptor y colas-logger): stack
propio, función propia, rol propio y código propio. Está inspirado en el receptor
para el acceso a Firestore (google-auth, wheels puros → `sam build` sin Docker),
pero no comparte código con él.

Idempotente: cada tabla se reescribe por clave natural (DELETE + INSERT), así que
correrlo de más nunca duplica.

── Por qué es INCREMENTAL (15-10-2026) ──────────────────────────────────────
La primera versión leía TODO —cada caso y la subcolección `auditoria` de cada
uno, en serie— a memoria, y recién después escribía. Con 1.491 casos entraba;
con ~8.600 dejó de entrar: timeout de 600 s todos los días hábiles desde el
06-09-2026 y, desde el 10-10, además sin memoria (512 MB). No escribió una fila
en 39 días y nadie se enteró, porque no había alarma.

Ahora:
  · Marca de agua en Firestore (`config/colasSyncDiario`): solo se procesa lo
    que cambió desde la última corrida buena —los casos por su `updateTime`,
    los eventos por su `timestamp`—, con una hora de solape.
  · Se escribe POR TANDAS mientras se lee, y la marca avanza tanda por tanda: si
    la corrida se queda sin tiempo, la siguiente sigue desde ahí. Un atraso de
    semanas se recupera solo en unas pocas corridas.
  · La auditoría se lee de UNA consulta collection group, no caso por caso.
  · Cluster no disponible (pausa de noche o de fin de semana) NO es un error:
    se registra y la marca no se mueve. Sí lo es si dura más de
    `DIAS_TOLERANCIA`: ahí la alarma tiene que sonar.
  · Cualquier otra falla termina en excepción → métrica Errors → alarma
    (`template.yaml`).

── Cierres automáticos ──────────────────────────────────────────────────────
Un cierre es automático si su canal dice `por: 'flujo-autonomo'` (lo escribe el
Lambda lens-flujo-autonomo en cada cierre) o si el caso tiene un evento
`CIERRE_AUTOMATICO` (lo escribe el motor del navegador). Antes se miraba solo el
evento, y el Lambda no lo escribía: sus ~7.000 cierres habrían quedado con
`automatico` en NULL.

Los cierres NUNCA se borran desde acá (ver `_sql_insertar_cierres`): la fila que
manda el camino en vivo trae columnas que este job no conoce —el status enviado
a Admin, el flag OFAC, el last step— y un DELETE + INSERT las perdería. El job
solo inserta los cierres que faltan y completa `automatico` donde está en NULL.
"""

import base64
import json
import logging
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", "lens-ai-9da63")
FIRESTORE_COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "casos_sf")
CLUSTER = os.environ.get("REDSHIFT_CLUSTER", "compliance-redshift-cluster")
DATABASE = os.environ.get("REDSHIFT_DATABASE", "dev")
DB_USER = os.environ.get("REDSHIFT_DB_USER", "awsuser")
SCHEMA = os.environ.get("REDSHIFT_SCHEMA", "colas_trabajo")

# Documento de estado: la marca de agua y el resultado de la última corrida.
# Lo escribe SOLO este job.
ESTADO_DOC = os.environ.get("ESTADO_DOC", "config/colasSyncDiario")
# Primera corrida sin marca: cuántos días hacia atrás.
DIAS_SIN_MARCA = int(os.environ.get("DIAS_SIN_MARCA", "7"))
# Solape con la corrida anterior. Reescribir de más es gratis (idempotente);
# perder lo que cambió en el borde, no.
SOLAPE = timedelta(minutes=int(os.environ.get("SOLAPE_MIN", "60")))
# Cuántos días puede no haber cluster antes de que eso pase a ser un error. Un
# fin de semana largo son 3: con 4 no suena por una pausa normal.
DIAS_TOLERANCIA = int(os.environ.get("DIAS_TOLERANCIA", "4"))

# La Data API acepta hasta 100 KB por statement: se arma por TAMAÑO, no por
# cantidad de filas (un evento con metadata pesa diez veces lo que un caso).
MAX_SQL_BYTES = int(os.environ.get("MAX_SQL_BYTES", "60000"))
# El paralelismo es ENTRE TABLAS, nunca dentro de una: ver `_escribir`.
CASOS_POR_TANDA = int(os.environ.get("CASOS_POR_TANDA", "400"))
EVENTOS_POR_TANDA = int(os.environ.get("EVENTOS_POR_TANDA", "1500"))
# Lo que se deja libre al final para guardar el estado y salir prolijo, además
# de una tanda y media de las más lentas medidas en la corrida.
RESERVA_S = int(os.environ.get("RESERVA_S", "60"))

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

POR_FLUJO = "flujo-autonomo"
ACTOR_SISTEMA = ("system", "Flujo automático")


class ClusterNoDisponible(Exception):
    """El cluster está pausado o reanudándose. No es una falla del job."""


# ── Firestore ────────────────────────────────────────────────────────────────
_BASE = (f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT}"
         f"/databases/(default)/documents")


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


def _http(tok: str, metodo: str, url: str, cuerpo=None):
    data = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=data, method=metodo, headers={
        "Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


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


def _cabeceras_casos(tok: str) -> list:
    """(nombre completo, updateTime) de TODOS los casos, sin traer los datos.

    La máscara deja un solo campo: lo que interesa es el `updateTime` del
    documento, que Firestore cambia con CUALQUIER escritura —screening, cierre,
    estado—. Es la forma de saber qué cambió sin depender de que cada camino de
    escritura se acuerde de tocar un campo `actualizadoEn`."""
    out, nxt = [], None
    while True:
        url = f"{_BASE}/{FIRESTORE_COLLECTION}?pageSize=500&mask.fieldPaths=numeroCaso"
        if nxt:
            url += f"&pageToken={nxt}"
        d = _http(tok, "GET", url)
        out.extend((doc["name"], doc.get("updateTime", "")) for doc in d.get("documents", []))
        nxt = d.get("nextPageToken")
        if not nxt:
            return out


def _traer_casos(tok: str, nombres: list) -> list:
    """Documentos completos, de a 100 por pedido. Los borrados se saltean."""
    docs = []
    for i in range(0, len(nombres), 100):
        r = _http(tok, "POST", f"{_BASE}:batchGet", {"documents": nombres[i:i + 100]})
        docs.extend(x["found"] for x in (r or []) if x.get("found"))
    return docs


def _eventos(tok: str):
    """TODA la auditoría, en una consulta collection group paginada por nombre.

    Sin filtro a propósito: filtrar por `timestamp` en collection group exige un
    índice que no existe (y que no vive en el repo). Ordenar por `__name__` no
    necesita ninguno. Son ~12.500 documentos chicos: ~13 páginas."""
    ultimo = None
    while True:
        q = {"from": [{"collectionId": "auditoria", "allDescendants": True}],
             "orderBy": [{"field": {"fieldPath": "__name__"}, "direction": "ASCENDING"}],
             "limit": 1000}
        if ultimo:
            q["startAt"] = {"values": [{"referenceValue": ultimo}], "before": False}
        filas = [x["document"] for x in (_http(tok, "POST", f"{_BASE}:runQuery",
                                              {"structuredQuery": q}) or []) if x.get("document")]
        if not filas:
            return
        yield from filas
        ultimo = filas[-1]["name"]
        if len(filas) < 1000:
            return


def _leer_estado(tok: str) -> dict:
    try:
        d = _http(tok, "GET", f"{_BASE}/{ESTADO_DOC}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise
    return {k: _val(v) for k, v in (d.get("fields") or {}).items()}


def _guardar_estado(tok: str, estado: dict) -> None:
    """Pisa el documento entero: es una foto, no un acumulado (como el latido
    del flujo autónomo). Solo strings, enteros y booleanos."""
    def a_valor(v):
        if isinstance(v, bool):
            return {"booleanValue": v}
        if isinstance(v, int):
            return {"integerValue": str(v)}
        if v is None:
            return {"nullValue": None}
        return {"stringValue": str(v)[:1500]}
    _http(tok, "PATCH", f"{_BASE}/{ESTADO_DOC}",
          {"fields": {k: a_valor(v) for k, v in estado.items()}})


# ── Armado de filas ──────────────────────────────────────────────────────────
def _ts(v):
    return str(v).replace("T", " ").replace("Z", "").strip()[:23] if v else None


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:23] + "Z"


def _parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _cola(asunto: str) -> str:
    a = (asunto or "").strip()
    if a.lower() == "coincidencia ofac":
        return "ofac"
    return "remesa" if "DETIENE TX" in a.upper() else "otros"


def _caso_de_evento(nombre: str) -> str:
    # .../documents/casos_sf/{caso}/auditoria/{evento}
    partes = nombre.split("/")
    return partes[-3] if len(partes) >= 3 else ""


def _filas_de_caso(doc: dict, auto_por_evento=frozenset()) -> dict:
    """Filas de caso, screening y cierre de UN caso. Puro.

    `auto_por_evento`: los canales ('sf', 'admin') que un evento CIERRE_AUTOMATICO
    del caso dice que cerró bien. Por CANAL y no por caso: si el flujo cerró
    Admin y después un analista cerró Salesforce a mano, el de Salesforce no es
    automático."""
    f = {k: _val(v) for k, v in (doc.get("fields") or {}).items()}
    cid = doc["name"].split("/")[-1]
    datos = f.get("datos") or {}
    numero = str(f.get("numeroCaso") or datos.get("Número del caso") or cid).strip()
    if numero.isdigit() and len(numero) < 8:       # Salesforce usa 8 dígitos con ceros
        numero = numero.zfill(8)
    pais = str(f.get("pais") or datos.get("País") or "")
    asunto = str(f.get("asunto") or datos.get("Asunto") or "")
    idi = datos.get("Id interno del usuario")

    out = {t: [] for t in ("caso", "screening", "cierre")}
    # Un documento sin datos del caso (p. ej. el que recreó un `set(merge)` sobre
    # un caso ya borrado) no es un caso: no se espeja.
    if not f.get("numeroCaso") and not f.get("asunto") and not datos:
        return out

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

    # Cierres por canal. Automático = lo dice el canal (`por`) o un evento
    # CIERRE_AUTOMATICO del caso. Si no, el actor queda en NULL: no se inventa
    # quién cerró.
    for canal in ("sf", "admin"):
        c = (f.get("cierres") or {}).get(canal) or {}
        if c.get("ok") is not True:
            continue
        auto = c.get("por") == POR_FLUJO or canal in auto_por_evento
        en = _ts(c.get("en")) or _ts(f.get("recibidoEn")) or "1970-01-01 00:00:00"
        out["cierre"].append({
            "cierre_id": f"{numero}|{canal.upper()}|{en}", "numero_caso": numero,
            "canal": canal.upper(), "resultado_ok": True,
            "automatico": True if auto else None, "tipologia": c.get("tipologia"),
            "actor_id": ACTOR_SISTEMA[0] if auto else None,
            "actor_nombre": ACTOR_SISTEMA[1] if auto else None,
            "actor_tipo": "SYSTEM" if auto else None, "ocurrido_en": en})
    return out


def _fila_evento(ev: dict) -> dict | None:
    e = {k: _val(v) for k, v in (ev.get("fields") or {}).items()}
    if not e.get("eventId"):
        return None
    return {
        "event_id": e["eventId"], "numero_caso": e.get("numeroCaso") or _caso_de_evento(ev["name"]),
        "tipo": e.get("tipo") or "DESCONOCIDO", "actor_id": e.get("actorId"),
        "actor_tipo": e.get("actorTipo"), "ocurrido_en": _ts(e.get("timestamp")),
        "correlation_id": e.get("correlationId"), "version_caso": e.get("versionCaso"),
        "cambios": e.get("cambios"), "metadata": e.get("metadata")}


# ── Redshift ─────────────────────────────────────────────────────────────────
_CAST = {"bool": "BOOLEAN", "int": "INTEGER", "ts": "TIMESTAMP", "json": "SUPER", "": "VARCHAR"}


def _esc(s: str) -> str:
    """Escapa un texto para meterlo entre comillas simples en Redshift.

    Las comillas simples se duplican, y las BARRAS INVERTIDAS también: Redshift
    las interpreta dentro de un literal (`'C:\\temp'` llega como «C:» + tab +
    «emp»). En un JSON eso lo rompe: `json.dumps` escribe `\\"` y `\\n`, Redshift
    se come la barra y `JSON_PARSE` recibe comillas sueltas o un salto de línea
    crudo. Tumbó el backfill del 20-10-2026 en la primera tanda de eventos con
    una comilla en la metadata."""
    return s.replace("\\", "\\\\").replace("'", "''")


def _lit(v, tipo: str, tipado: bool = False) -> str:
    """Valor → literal SQL, escapado con `_esc`.

    `tipado` castea también los NULL: hace falta en un SELECT ... UNION ALL,
    donde un NULL suelto no tiene tipo y Redshift lo resolvería como texto."""
    if v is None or v == "":
        return f"NULL::{_CAST[tipo]}" if tipado else "NULL"
    if tipo == "bool":
        return "TRUE" if v else "FALSE"
    if tipo == "int":
        try:
            return str(int(v))
        except (TypeError, ValueError):
            return f"NULL::{_CAST[tipo]}" if tipado else "NULL"
    if tipo == "json":
        txt = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
        return "JSON_PARSE('" + _esc(txt) + "')"
    s = _esc(str(v))
    if tipo == "ts":
        return f"'{s}'::TIMESTAMP"
    return f"'{s}'::VARCHAR" if tipado else f"'{s}'"


def _sql_de(tabla: str, lote: list) -> str:
    return _sql_insertar_cierres(lote) if tabla == "cierre" else _sql_insertar(tabla, lote)


def _trozos(tabla: str, rows: list) -> list:
    """Parte las filas en lotes cuyo SQL no pase de MAX_SQL_BYTES.

    El peso de cada fila se mide con el MISMO armador que se va a usar: el de
    cierres (SELECT … UNION ALL con casts y alias) pesa el doble por fila que un
    VALUES, y estimarlo con el de VALUES dio statements de 118 KB contra un
    límite de 100 KB. El primer renglón de cada lote paga el encabezado; los
    siguientes, solo lo que suman (la diferencia exacta entre armar el lote con
    la fila repetida y sin repetir)."""
    lotes, actual, peso = [], [], 0
    for r in rows:
        p = len(_sql_de(tabla, [r]).encode())
        if p > MAX_SQL_BYTES:
            # Una fila sola que no entra (un evento con una metadata enorme): se
            # recortan sus columnas JSON y se dice, en vez de que la Data API
            # rechace el lote entero y la corrida falle todos los días.
            _, cols = TABLAS[tabla]
            r = {**r, **{c: {"truncado": True, "bytes": p} for c, t in cols.items() if t == "json" and r.get(c)}}
            logger.warning("fila de %s recortada: %s bytes (%s)", tabla, p, r.get(TABLAS[tabla][0]))
            p = len(_sql_de(tabla, [r]).encode())
        extra = len(_sql_de(tabla, [r, r]).encode()) - p
        if actual and peso + extra > MAX_SQL_BYTES:
            lotes.append(actual)
            actual, peso = [], 0
        actual.append(r)
        peso += p if len(actual) == 1 else extra
    if actual:
        lotes.append(actual)
    return lotes


def _sql_borrar(tabla: str, lote: list) -> str:
    pk, _ = TABLAS[tabla]
    claves = ", ".join(_lit(r.get(pk), "") for r in lote)
    return f"DELETE FROM {SCHEMA}.{tabla} WHERE {pk} IN ({claves})"


def _sql_insertar(tabla: str, lote: list) -> str:
    _, cols = TABLAS[tabla]
    tuplas = ", ".join(
        "(" + ", ".join(_lit(r.get(c), t) for c, t in cols.items()) + ")" for r in lote)
    return f"INSERT INTO {SCHEMA}.{tabla} ({', '.join(cols)}) VALUES {tuplas}"


def _sql_insertar_cierres(lote: list) -> str:
    """INSERT de los cierres que FALTAN. Nunca borra ni pisa.

    Una fila de cierre puede haber entrado por el camino en vivo, y esa trae
    columnas que este job no tiene (status enviado, flag OFAC, PEP, risk level,
    last step, HTTP, detalle). Un DELETE + INSERT por clave las perdería: con la
    clave igual en los dos caminos (la del flujo autónomo), pasaría todas las
    mañanas sobre todo lo cerrado el día anterior. Por eso para `cierre` no hay
    DELETE: si ya hay una fila ok para el mismo caso y canal —venga de donde
    venga y con la clave que tenga— no se inserta nada.

    Eso además resuelve la otra mitad: la app arma `cierre_id` con la hora del
    LOG y este job con la del CIERRE (`cierres.<canal>.en`). Son el mismo cierre
    con dos claves, y por caso + canal no se duplica.

    Límite conocido: un caso que se cerró, se reabrió y se volvió a cerrar por
    el mismo canal conserva solo el primer cierre en Redshift."""
    _, cols = TABLAS["cierre"]
    nombres = ", ".join(cols)
    selects = " UNION ALL ".join(
        "SELECT " + ", ".join(f"{_lit(r.get(c), t, tipado=True)} AS {c}" for c, t in cols.items())
        for r in lote)
    return (f"INSERT INTO {SCHEMA}.cierre ({nombres}) SELECT {nombres} FROM ({selects}) v "
            f"WHERE NOT EXISTS (SELECT 1 FROM {SCHEMA}.cierre c WHERE c.numero_caso = v.numero_caso "
            f"AND c.canal = v.canal AND c.resultado_ok = TRUE)")


def _sql_marcar_automaticos(lote: list) -> str | None:
    """Completa `automatico` en filas que ya estaban, SOLO donde está en NULL.

    Son las que escribió la versión anterior de este job sin saber si el cierre
    era automático. Las del camino en vivo traen TRUE o FALSE y no se tocan; las
    columnas que no son de autoría tampoco."""
    ids = [r["cierre_id"] for r in lote if r.get("automatico") is True]
    if not ids:
        return None
    claves = ", ".join(_lit(i, "") for i in ids)
    return (f"UPDATE {SCHEMA}.cierre SET automatico = TRUE, actor_id = '{ACTOR_SISTEMA[0]}', "
            f"actor_nombre = '{ACTOR_SISTEMA[1]}', actor_tipo = 'SYSTEM' "
            f"WHERE cierre_id IN ({claves}) AND automatico IS NULL")


def _sentencias(tabla: str, lote: list) -> list:
    """Lo que se ejecuta por lote, en orden."""
    if tabla == "cierre":
        return [x for x in (_sql_insertar_cierres(lote), _sql_marcar_automaticos(lote)) if x]
    return [_sql_borrar(tabla, lote), _sql_insertar(tabla, lote)]


def _es_cluster_no_disponible(e: Exception) -> bool:
    m = str(e)
    return ("is not available" in m or "ClusterNotFound" in m or "is resuming" in m
            or "Connection refused" in m or "cluster is paused" in m.lower())


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
            if _es_cluster_no_disponible(e):
                raise ClusterNoDisponible(str(e)[:200]) from e
            if ("ActiveStatementsExceeded" in str(e) or "Throttling" in str(e)) and n < intentos - 1:
                time.sleep(min(2 ** n, 16) + random.random())
                continue
            raise
    for _ in range(600):
        d = client.describe_statement(Id=sid)
        if d["Status"] in ("FINISHED", "FAILED", "ABORTED"):
            if d["Status"] != "FINISHED":
                err = d.get("Error", "")
                if _es_cluster_no_disponible(RuntimeError(err)):
                    raise ClusterNoDisponible(err[:200])
                raise RuntimeError(f"{d['Status']}: {err[:300]}")
            return
        time.sleep(0.3)
    raise RuntimeError("timeout esperando el statement")


def _escribir(client, filas: dict) -> dict:
    """Escribe por tabla: UN hilo por tabla, sus lotes en serie. Devuelve filas
    por tabla (las procesadas, no las insertadas: un cierre que ya estaba cuenta
    aunque el NOT EXISTS lo saltee).

    Un solo escritor por tabla, a propósito. Redshift serializa las escrituras
    sobre una misma tabla con bloqueos, y el INSERT de cierres además LEE la
    tabla (el NOT EXISTS). Con 4 lotes de cierres en paralelo, el backfill del
    20-10-2026 midió 78 s de promedio por INSERT, con 0 s de ejecución: todo era
    espera. Cada tanda de casos tardaba 3,5 min, y el logger en vivo esperó
    hasta 116 s su DELETE sobre `cierre`. En paralelo solo van tablas distintas,
    que no se bloquean entre sí."""
    por_tabla = {}
    for tabla in TABLAS:
        lotes = _trozos(tabla, filas.get(tabla) or [])
        if lotes:
            por_tabla[tabla] = lotes

    def correr(tabla):
        n = 0
        for lote in por_tabla[tabla]:
            for sql in _sentencias(tabla, lote):
                _ejecutar(client, sql)
            n += len(lote)
        return tabla, n

    if not por_tabla:
        return {}
    with ThreadPoolExecutor(max_workers=len(por_tabla)) as ex:
        return dict(ex.map(correr, list(por_tabla)))


# ── Corrida ──────────────────────────────────────────────────────────────────
def _desde(estado: dict, clave: str, ahora: datetime) -> datetime:
    """Desde cuándo procesar: la marca menos el solape; sin marca, los últimos
    DIAS_SIN_MARCA días."""
    marca = _parse_iso(estado.get(clave))
    return (marca - SOLAPE) if marca else ahora - timedelta(days=DIAS_SIN_MARCA)


def lambda_handler(event, context):
    event = event if isinstance(event, dict) else {}
    import boto3

    inicio = time.time()
    ahora = datetime.now(timezone.utc)
    restante = (lambda: context.get_remaining_time_in_millis() / 1000) if context else (lambda: 10 ** 9)
    tok = _access_token()
    estado = _leer_estado(tok)

    # Backfill: NO se procesa en esta invocación, solo se mueve la marca hacia
    # atrás. Las corridas siguientes recuperan desde ahí, tanda por tanda.
    # Si la fecha viajara en cada invocación, un reintento automático volvería a
    # arrancar desde el principio en vez de seguir desde donde quedó.
    reinicio = _parse_iso(event.get("reiniciarMarca"))
    if reinicio:
        estado.update({"marcaCasos": _iso(reinicio), "marcaEventos": _iso(reinicio),
                       "marcaReiniciadaEn": _iso(ahora)})
        _guardar_estado(tok, estado)
        logger.info("marca reiniciada a %s", _iso(reinicio))
        return {"ok": True, "marcaReiniciada": _iso(reinicio)}

    client = boto3.client("redshift-data")

    # Se toca el cluster ANTES de leer Firestore: si está pausado, no tiene
    # sentido leer 20.000 documentos para nada.
    try:
        _ejecutar(client, "SELECT 1")
    except ClusterNoDisponible as e:
        ultima = _parse_iso(estado.get("ultimaOkEn"))
        dias = (ahora - ultima).days if ultima else None
        _guardar_estado(tok, {**estado, "ultimoIntentoEn": _iso(ahora), "ultimoResultado": "cluster_no_disponible",
                              "ultimoError": str(e)[:300]})
        if dias is not None and dias >= DIAS_TOLERANCIA:
            # Una pausa normal dura una noche o un fin de semana. Más que eso ya
            # no es una pausa: se lanza para que suene la alarma.
            raise RuntimeError(f"cluster sin responder y respaldo atrasado {dias} días: {e}") from e
        logger.warning("cluster no disponible: no es un error, se reintenta mañana (%s)", e)
        return {"ok": True, "omitido": "cluster_no_disponible"}

    desde_casos = _desde(estado, "marcaCasos", ahora)
    desde_eventos = _desde(estado, "marcaEventos", ahora)
    resumen = {"caso": 0, "cierre": 0, "screening": 0, "evento_auditoria": 0}
    pendiente = None
    # La tanda más lenta hasta ahora. El freno se revisa ENTRE tandas, así que el
    # margen tiene que alcanzar para una tanda entera: con 60 s fijos, una tanda
    # de 3,5 min arrancó con margen y terminó en el timeout duro de Lambda.
    lenta = {"s": 0.0}

    def guardar(resultado: str, error: str | None = None):
        if resultado == "ok":
            # Todo lo que cambió hasta el ARRANQUE quedó escrito: la marca pasa a
            # ser el arranque (lo que cambió durante la corrida entra por el solape).
            estado.update({"marcaCasos": _iso(ahora), "marcaEventos": _iso(ahora), "ultimaOkEn": _iso(ahora)})
        _guardar_estado(tok, {
            **estado, "ultimoIntentoEn": _iso(ahora), "ultimoResultado": resultado,
            "ultimoError": error, "resumen": json.dumps(resumen)})

    try:
        # 1) Eventos. Primero, porque de ellos sale qué casos tienen un
        #    CIERRE_AUTOMATICO, que hace falta para marcar los cierres.
        con_auto, nuevos = {}, []
        for ev in _eventos(tok):
            e = ev.get("fields") or {}
            if _val(e.get("tipo")) == "CIERRE_AUTOMATICO":
                meta = _val(e.get("metadata")) or {}
                ok = {c for c in ("sf", "admin") if meta.get(c) == "ok"}
                if ok:
                    con_auto.setdefault(_caso_de_evento(ev["name"]), set()).update(ok)
            # La marca usa la hora del SERVIDOR (`createTime`), no `timestamp`,
            # que pone el reloj del navegador: un evento escrito tarde (pestaña
            # dormida, reloj atrasado) quedaría detrás de la marca y no entraría.
            ts = _parse_iso(ev.get("createTime")) or _parse_iso(_val(e.get("timestamp")))
            if ts is None or ts >= desde_eventos:
                nuevos.append((ts or ahora, ev))
        nuevos.sort(key=lambda x: x[0])
        logger.info("eventos a escribir: %s (desde %s)", len(nuevos), _iso(desde_eventos))

        for i in range(0, len(nuevos), EVENTOS_POR_TANDA):
            if restante() < RESERVA_S + 1.5 * lenta["s"]:
                pendiente = f"eventos: faltan {len(nuevos) - i}"
                break
            t0 = time.time()
            tanda = nuevos[i:i + EVENTOS_POR_TANDA]
            filas = [f for f in (_fila_evento(ev) for _, ev in tanda) if f]
            r = _escribir(client, {"evento_auditoria": filas})
            lenta["s"] = max(lenta["s"], time.time() - t0)
            resumen["evento_auditoria"] += r.get("evento_auditoria", 0)
            # La marca avanza tanda por tanda: si la corrida se corta, la que
            # viene arranca desde acá y no desde el principio.
            estado["marcaEventos"] = _iso(tanda[-1][0])
            guardar("en_curso")

        # 2) Casos que cambiaron, por `updateTime`, del más viejo al más nuevo.
        if pendiente is None:
            cab = [(n, _parse_iso(u)) for n, u in _cabeceras_casos(tok)]
            cambiados = sorted(((u or ahora), n) for n, u in cab if u is None or u >= desde_casos)
            logger.info("casos en Firestore: %s · cambiados desde %s: %s",
                        len(cab), _iso(desde_casos), len(cambiados))
            for i in range(0, len(cambiados), CASOS_POR_TANDA):
                if restante() < RESERVA_S + 1.5 * lenta["s"]:
                    pendiente = f"casos: faltan {len(cambiados) - i}"
                    break
                t0 = time.time()
                tanda = cambiados[i:i + CASOS_POR_TANDA]
                filas = {"caso": [], "screening": [], "cierre": []}
                for doc in _traer_casos(tok, [n for _, n in tanda]):
                    cid = doc["name"].split("/")[-1]
                    for t, rows in _filas_de_caso(doc, frozenset(con_auto.get(cid, ()))).items():
                        filas[t].extend(rows)
                for t, n in _escribir(client, filas).items():
                    resumen[t] += n
                lenta["s"] = max(lenta["s"], time.time() - t0)
                estado["marcaCasos"] = _iso(tanda[-1][0])
                guardar("en_curso")
    except ClusterNoDisponible as e:
        # Se pausó a mitad de camino. Lo escrito queda; la marca quedó donde
        # llegó. Mismo criterio que arriba: no es un error.
        guardar("cluster_no_disponible", str(e)[:300])
        logger.warning("el cluster se fue a mitad de la corrida: %s", e)
        return {"ok": True, "omitido": "cluster_no_disponible", "escritas": resumen}
    except Exception as e:                                           # noqa: BLE001
        guardar("error", f"{type(e).__name__}: {str(e)[:280]}")
        raise

    if pendiente:
        guardar("incompleta", pendiente)
        # Se lanza a propósito: Lambda reintenta solo (invocación asíncrona) y
        # cada reintento sigue desde la marca. Si igual no alcanza, suena la
        # alarma, que es lo que tiene que pasar con un atraso que no se recupera.
        raise RuntimeError(f"sin tiempo, la corrida siguiente continúa ({pendiente}): {json.dumps(resumen)}")

    guardar("ok")
    salida = {"ok": True, "escritas": resumen, "desdeCasos": _iso(desde_casos),
              "desdeEventos": _iso(desde_eventos), "segundos": round(time.time() - inicio, 1)}
    logger.info("sincronización lista: %s", json.dumps(salida))
    return salida
