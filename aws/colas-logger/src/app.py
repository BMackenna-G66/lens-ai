"""
Logger de la gestión de colas de Lens → Redshift (schema `colas_trabajo`).

INDEPENDIENTE del receptor de casos (aws/casos-receptor): stack propio, función
propia, URL propia, secreto propio, rol propio y código propio. No importa ni
modifica nada de ese proyecto — está inspirado en él (Function URL + header
x-api-secret) pero no lo reutiliza, así los dos no pueden chocar.

Dos modos de escritura (se elige por env var):

  · MODO=tcp (default recomendado) — conexión directa al cluster con el MISMO
    usuario de base de datos que ya usás para cargar información. No requiere
    ningún permiso IAM en la cuenta del cluster; solo que el endpoint sea
    alcanzable. Usa `redshift_connector` (driver puro Python de AWS).

  · MODO=dataapi — Redshift Data API. Requiere permisos IAM
    (redshift-data:ExecuteStatement) en la cuenta del cluster.

Contrato: POST { "eventos": [ { "tabla": "...", "datos": { ... } }, ... ] }

La app llama esto fire-and-forget: si falla, la Bandeja sigue funcionando y
Firestore sigue siendo la fuente operacional.
"""

import json
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

API_SECRET = os.environ.get("API_SECRET", "")
SCHEMA = os.environ.get("REDSHIFT_SCHEMA", "colas_trabajo")
MAX_EVENTOS = int(os.environ.get("MAX_EVENTOS", "100"))

# Modo TCP (usuario/contraseña de Redshift — el mismo que ya está habilitado).
HOST = os.environ.get("REDSHIFT_HOST", "")
PORT = int(os.environ.get("REDSHIFT_PORT", "5439"))
DATABASE = os.environ.get("REDSHIFT_DATABASE", "dev")
USER = os.environ.get("REDSHIFT_USER", "")
PASSWORD = os.environ.get("REDSHIFT_PASSWORD", "")

# Modo Data API (alternativo).
CLUSTER = os.environ.get("REDSHIFT_CLUSTER", "")
DB_USER = os.environ.get("REDSHIFT_DB_USER", "")

MODO = os.environ.get("MODO", "").lower() or ("tcp" if HOST else "dataapi")

# ── Whitelist de tablas y columnas ───────────────────────────────────────────
# El SQL se arma SOLO desde este mapa (nunca con nombres que vengan del request)
# y los valores viajan como parámetros. Sin concatenar datos → sin inyección.
#   tipo: '' = texto · 'int' · 'bool' · 'ts' = timestamp · 'json' = SUPER
TABLAS = {
    "caso": {
        "pk": ["numero_caso"],
        "cols": {
            "numero_caso": "", "caso_id": "", "cola": "", "asunto": "",
            "nombre_cuenta": "", "pais": "", "pais_codigo": "",
            "id_interno_usuario": "int", "remesa_tx": "", "origen": "",
            "recibido_en": "ts", "actualizado_en": "ts",
        },
    },
    "analista": {
        "pk": ["actor_id"],
        "cols": {
            "actor_id": "", "nombre": "", "email": "", "es_sistema": "bool",
            "primer_evento_en": "ts", "ultimo_evento_en": "ts",
        },
    },
    "evento_auditoria": {
        "pk": ["event_id"],
        "cols": {
            "event_id": "", "numero_caso": "", "tipo": "", "actor_id": "",
            "actor_tipo": "", "ocurrido_en": "ts", "correlation_id": "",
            "version_caso": "int", "cambios": "json", "metadata": "json",
        },
    },
    "screening": {
        "pk": ["screening_id"],
        "cols": {
            "screening_id": "", "numero_caso": "", "fuente": "", "estado": "",
            "decision": "", "delitos_unicos": "int", "es_pep": "bool",
            "retenido_sensible": "bool", "categorias_sensibles": "",
            "coincidencias": "json", "screened_en": "ts",
        },
    },
    "cierre": {
        "pk": ["cierre_id"],
        "cols": {
            "cierre_id": "", "numero_caso": "", "canal": "",
            "resultado_ok": "bool", "automatico": "bool", "tipologia": "",
            "status_enviado": "", "ofac_flag": "bool", "pep_enviado": "bool",
            "risk_level": "", "last_step": "bool", "http_status": "int",
            "detalle_error": "", "actor_id": "", "ocurrido_en": "ts",
        },
    },
    "caso_historial": {
        "pk": ["historial_id"],
        "cols": {
            "historial_id": "", "numero_caso": "", "campo": "",
            "valor_anterior": "", "valor_nuevo": "", "actor_id": "",
            "actor_tipo": "", "ocurrido_en": "ts",
        },
    },
    "config_flujo_historial": {
        "pk": ["config_id"],
        "cols": {
            "config_id": "", "cola": "", "habilitado": "bool",
            "paises_habilitados": "", "cerrar_sf": "bool", "cerrar_admin": "bool",
            "tipologias": "json", "actor_id": "", "actor_nombre": "",
            "ocurrido_en": "ts",
        },
    },
}


def _respuesta(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type,x-api-secret",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def _normalizar(valor, tipo):
    """Valor del request → valor Python que entiende el driver."""
    if valor is None or valor == "":
        return None
    if tipo == "int":
        return int(valor)
    if tipo == "bool":
        return bool(valor)
    if tipo == "json":
        return valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
    return str(valor)


def _sentencias(tabla, datos):
    """(delete_sql, delete_vals, insert_sql, insert_vals) para una fila.
    Usa placeholders %s: los datos nunca se concatenan en el SQL."""
    spec = TABLAS[tabla]
    cols = [c for c in spec["cols"] if c in datos]      # columnas desconocidas: se ignoran
    for pk in spec["pk"]:
        if pk not in cols:
            raise ValueError(f"falta la clave {pk} para {tabla}")

    destino = f"{SCHEMA}.{tabla}"
    exprs, vals = [], []
    for c in cols:
        tipo = spec["cols"][c]
        v = _normalizar(datos[c], tipo)
        if tipo == "json":
            exprs.append("JSON_PARSE(%s)" if v is not None else "%s")
        elif tipo == "ts":
            exprs.append("%s::TIMESTAMP")
        else:
            exprs.append("%s")
        vals.append(v)

    where = " AND ".join(f"{pk} = %s" for pk in spec["pk"])
    del_vals = [_normalizar(datos[pk], spec["cols"][pk]) for pk in spec["pk"]]
    delete_sql = f"DELETE FROM {destino} WHERE {where}"
    insert_sql = f"INSERT INTO {destino} ({', '.join(cols)}) VALUES ({', '.join(exprs)})"
    return delete_sql, del_vals, insert_sql, vals


# ── Modo TCP: mismo usuario de base de datos que ya está habilitado ───────────
def _conectar_tcp():
    """Conexión al cluster. Prefiere el driver oficial de AWS; si no está
    empaquetado, usa pg8000 (100% Python, más fácil de meter en la Lambda).
    Los dos hablan DB-API con placeholders %s, así que el resto no cambia."""
    try:
        import redshift_connector
        return redshift_connector.connect(
            host=HOST, port=PORT, database=DATABASE, user=USER, password=PASSWORD,
            timeout=20,
        )
    except ImportError:
        import ssl
        import pg8000.dbapi
        # REDSHIFT_SSL: '1' verifica el certificado (default) · 'noverify' cifra sin
        # verificarlo (si el cluster usa una CA privada) · '0' sin SSL.
        modo_ssl = os.environ.get("REDSHIFT_SSL", "1")
        if modo_ssl == "0":
            ctx = None
        elif modo_ssl == "noverify":
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        else:
            ctx = ssl.create_default_context()
        return pg8000.dbapi.connect(
            host=HOST, port=PORT, database=DATABASE, user=USER, password=PASSWORD,
            ssl_context=ctx, timeout=20,
        )


def _escribir_tcp(filas):
    conn = _conectar_tcp()
    ok, errores = 0, []
    try:
        conn.autocommit = False
        cur = conn.cursor()
        for i, (tabla, datos) in filas:
            try:
                d_sql, d_vals, i_sql, i_vals = _sentencias(tabla, datos)
                cur.execute(d_sql, tuple(d_vals))   # idempotencia por clave natural
                cur.execute(i_sql, tuple(i_vals))
                ok += 1
            except Exception as e:  # noqa: BLE001 — una fila mala no corta el lote
                conn.rollback()
                logger.exception("fallo escribiendo en %s", tabla)
                errores.append({"i": i, "tabla": tabla, "error": str(e)})
        conn.commit()
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
    return ok, errores


# ── Modo Data API (alternativo; requiere permisos IAM en la cuenta del cluster)
def _escribir_dataapi(filas):
    import boto3  # import perezoso

    client = boto3.client("redshift-data")
    ok, errores = 0, []
    for i, (tabla, datos) in filas:
        try:
            d_sql, d_vals, i_sql, i_vals = _sentencias(tabla, datos)
            # La Data API usa parámetros nombrados: se re-arma con :p0, :p1, …
            for sql, vals in ((d_sql, d_vals), (i_sql, i_vals)):
                nombres = [f"p{n}" for n in range(len(vals))]
                sql_n = sql
                for nom in nombres:
                    sql_n = sql_n.replace("%s", f":{nom}", 1)
                params = [
                    {"name": nom, "value": "" if v is None else ("true" if v is True else "false" if v is False else str(v))}
                    for nom, v in zip(nombres, vals)
                ]
                client.execute_statement(
                    ClusterIdentifier=CLUSTER, Database=DATABASE, DbUser=DB_USER,
                    Sql=sql_n, Parameters=params,
                )
            ok += 1
        except Exception as e:  # noqa: BLE001
            logger.exception("fallo escribiendo en %s", tabla)
            errores.append({"i": i, "tabla": tabla, "error": str(e)})
    return ok, errores


def lambda_handler(event, _context):
    metodo = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "POST")
    if metodo == "OPTIONS":
        return _respuesta(200, {"ok": True})
    if metodo != "POST":
        return _respuesta(405, {"error": "Método no permitido"})

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not API_SECRET or headers.get("x-api-secret") != API_SECRET:
        return _respuesta(401, {"error": "No autorizado"})

    if MODO == "tcp":
        if not HOST or not USER or not PASSWORD:
            return _respuesta(500, {"error": "Faltan REDSHIFT_HOST / REDSHIFT_USER / REDSHIFT_PASSWORD"})
    elif not CLUSTER or not DB_USER:
        return _respuesta(500, {"error": "Faltan REDSHIFT_CLUSTER / REDSHIFT_DB_USER"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _respuesta(400, {"error": "Body JSON inválido"})

    eventos = body.get("eventos")
    if not isinstance(eventos, list) or not eventos:
        return _respuesta(400, {"error": "Se espera { eventos: [...] }"})
    if len(eventos) > MAX_EVENTOS:
        return _respuesta(400, {"error": f"Máximo {MAX_EVENTOS} eventos por request"})

    # Valida el lote ANTES de abrir la conexión (tabla permitida + datos presentes).
    filas, errores = [], []
    for i, ev in enumerate(eventos):
        tabla = (ev or {}).get("tabla")
        datos = (ev or {}).get("datos")
        if tabla not in TABLAS or not isinstance(datos, dict) or not datos:
            errores.append({"i": i, "error": f"tabla inválida o datos vacíos: {tabla}"})
            continue
        filas.append((i, (tabla, datos)))

    ok = 0
    if filas:
        escribir = _escribir_tcp if MODO == "tcp" else _escribir_dataapi
        try:
            ok, errs = escribir(filas)
            errores.extend(errs)
        except Exception as e:  # noqa: BLE001 — no se pudo ni conectar
            logger.exception("fallo de conexión a Redshift")
            return _respuesta(502, {"error": f"Redshift inalcanzable: {e}", "ok": 0})

    return _respuesta(200 if not errores else 207, {"ok": ok, "modo": MODO, "errores": errores})
