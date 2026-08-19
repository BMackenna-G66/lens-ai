"""
Logger de la gestión de colas de Lens → Redshift (schema `colas_trabajo`).

INDEPENDIENTE del receptor de casos (aws/casos-receptor): stack propio, función
propia, URL propia, secreto propio, rol propio y código propio. No importa ni
modifica nada de ese proyecto — está inspirado en él (Function URL + header
x-api-secret) pero no lo reutiliza, así los dos no pueden chocar.

Dos modos de escritura (se elige por env var):

  · MODO=dataapi (el que aplica acá) — Redshift Data API. No necesita VPC ni
    contraseña: el rol de la Lambda usa auth IAM con DbUser (awsuser), igual que
    el otro proyecto que ya carga este cluster. Verificado contra
    compliance-redshift-cluster (cuenta 561521480266).

  · MODO=tcp — conexión directa con usuario/contraseña. OJO: este cluster NO es
    público (vive en una VPC), así que este modo solo sirve si la Lambda se mete
    en la misma VPC. Se deja implementado por si el cluster cambia.

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
DB_USER = DB_USER or "awsuser"

# ── Whitelist de tablas y columnas ───────────────────────────────────────────
# El SQL se arma SOLO desde este mapa (nunca con nombres que vengan del request)
# y los valores viajan como parámetros. Sin concatenar datos → sin inyección.
#   tipo: '' = texto · 'int' · 'num' = decimal · 'bool' · 'ts' = timestamp · 'json' = SUPER
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
            "actor_id": "", "nombre": "", "email": "", "rol": "",
            "deshabilitado": "bool", "es_sistema": "bool",
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
            "detalle_error": "", "actor_id": "", "actor_nombre": "",
            "actor_tipo": "", "ocurrido_en": "ts",
        },
    },
    "liberacion_remesa": {
        "pk": ["liberacion_id"],
        "cols": {
            "liberacion_id": "", "numero_caso": "", "transaccion_id": "",
            "tipologia": "", "automatico": "bool",
            "admin_ok": "bool", "admin_omitido": "bool", "sf_ok": "bool",
            "estado_anterior": "", "estado_nuevo": "",
            "beneficiario": "", "beneficiario_dni": "", "beneficiario_pais": "",
            "monto_usd": "num", "tipo_envio": "",
            "screening_flujo": "", "screening_estado": "", "screening_decision": "",
            "delitos_unicos": "int", "listas_coincidencia": "",
            "retenido_sensible": "bool", "categorias_sensibles": "",
            "requested_by": "", "change_ticket": "", "detalle_error": "",
            "actor_id": "", "actor_nombre": "", "actor_tipo": "", "ocurrido_en": "ts",
        },
    },
    "kyb_empresa": {
        "pk": ["company_id"],
        "cols": {
            "company_id": "", "razon_social": "", "identificacion": "", "pais": "",
            "compliance_status": "", "kyc_stage1": "", "risk_level": "",
            "institucional": "bool", "origen": "", "status_kyb": "",
            "recibido_en": "ts", "actualizado_en": "ts",
        },
    },
    "kyb_analisis": {
        "pk": ["run_id"],
        "cols": {
            "run_id": "", "company_id": "", "corrida_en": "ts", "estado": "",
            "certidumbre": "int", "cobertura": "num", "penalizacion": "num",
            "hash_documentos": "", "documentos_total": "int",
            "alertas_criticas": "int", "alertas_preventivas": "int",
            "alertas_no_evaluables": "int", "faltantes": "", "mensaje_error": "",
            "actor_id": "", "actor_nombre": "", "actor_tipo": "",
        },
    },
    "kyb_componente": {
        "pk": ["componente_id"],
        "cols": {
            "componente_id": "", "run_id": "", "company_id": "", "corrida_en": "ts",
            "componente": "", "label": "", "peso": "int", "estado": "",
            "aporte": "num", "es_identidad": "bool",
            "valor_lens": "", "valor_admin": "", "emparejados": "int",
            "solo_en_lens": "int", "solo_en_admin": "int", "detalle": "",
        },
    },
    "kyb_alerta": {
        "pk": ["alerta_id"],
        "cols": {
            "alerta_id": "", "run_id": "", "company_id": "", "corrida_en": "ts",
            "codigo": "", "label": "", "severidad": "", "estado": "",
            "evaluable": "bool", "faltante": "", "detalle": "",
        },
    },
    "kyb_decision": {
        "pk": ["decision_id"],
        "cols": {
            "decision_id": "", "company_id": "", "tipo": "", "reason_code": "",
            "comentario": "", "automatica": "bool", "simulacion": "bool",
            "certidumbre": "int", "maker_id": "", "maker_nombre": "",
            "checker_id": "", "checker_nombre": "", "estado_aprobacion": "",
            "decidida_en": "ts", "resuelta_en": "ts",
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
    if tipo == "num":
        return float(valor)
    if tipo == "bool":
        return bool(valor)
    if tipo == "json":
        return valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
    return str(valor)


def _columnas(tabla, datos):
    """(cols, exprs, vals) de una fila: qué columnas van, con qué expresión SQL y
    con qué valores. Las columnas desconocidas se ignoran y las nulas se omiten."""
    spec = TABLAS[tabla]
    cols, exprs, vals = [], [], []
    for c, tipo in spec["cols"].items():
        if c not in datos:
            continue
        v = _normalizar(datos[c], tipo)
        if v is None:
            continue
        if tipo == "json":
            exprs.append("JSON_PARSE(%s)")
        elif tipo == "ts":
            exprs.append("%s::TIMESTAMP")
        elif tipo == "int":
            exprs.append("%s::BIGINT")
        elif tipo == "num":
            exprs.append("%s::DECIMAL(18,2)")
        elif tipo == "bool":
            exprs.append("%s::BOOLEAN")
        else:
            exprs.append("%s")
        cols.append(c)
        vals.append(v)
    for pk in spec["pk"]:
        if pk not in cols:
            raise ValueError(f"falta la clave {pk} para {tabla}")
    return cols, exprs, vals


def _sentencias(tabla, datos):
    """(delete_sql, delete_vals, insert_sql, insert_vals) para una fila.
    Usa placeholders %s: los datos nunca se concatenan en el SQL.

    Las columnas con valor nulo se OMITEN del INSERT (quedan NULL por defecto).
    Es necesario: la Data API rechaza parámetros con string vacío
    ("Invalid length for parameter ... valid min length: 1"), así que no se puede
    mandar '' como marcador de nulo. Verificado contra el cluster."""
    spec = TABLAS[tabla]
    destino = f"{SCHEMA}.{tabla}"

    # Columnas desconocidas: se ignoran. Columnas nulas: se omiten.
    cols, exprs, vals = [], [], []
    for c, tipo in spec["cols"].items():
        if c not in datos:
            continue
        v = _normalizar(datos[c], tipo)
        if v is None:
            continue
        # Casts explícitos: en Data API todos los valores viajan como texto.
        if tipo == "json":
            exprs.append("JSON_PARSE(%s)")
        elif tipo == "ts":
            exprs.append("%s::TIMESTAMP")
        elif tipo == "int":
            exprs.append("%s::BIGINT")
        elif tipo == "num":
            exprs.append("%s::DECIMAL(18,2)")
        elif tipo == "bool":
            exprs.append("%s::BOOLEAN")
        else:
            exprs.append("%s")
        cols.append(c)
        vals.append(v)

    for pk in spec["pk"]:
        if pk not in cols:
            raise ValueError(f"falta la clave {pk} para {tabla}")

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


# ── Modo Data API ────────────────────────────────────────────────────────────
# La Data API tiene una cuota de 500 statements ACTIVOS por cuenta, y no espera a
# que terminen: mandar 2 statements por fila (DELETE + INSERT) la revienta apenas
# el backfill sube unos cientos de filas (ActiveStatementsExceededException).
#
# Por eso las filas se AGRUPAN por (tabla, columnas presentes) y cada grupo sale
# como 2 statements: un DELETE con IN (...) y un INSERT con varios VALUES. Un lote
# de 100 filas pasa de ~200 statements a ~6.

def _ejecutar_con_reintento(client, sql, params, intentos=6):
    """Ejecuta con backoff si la cuota de statements activos está llena.
    La cuota (500) es de TODA la cuenta, así que otro proceso puede estar
    consumiéndola: conviene insistir un rato antes de dar la fila por perdida."""
    import random
    import time
    for n in range(intentos):
        try:
            return client.execute_statement(
                ClusterIdentifier=CLUSTER, Database=DATABASE, DbUser=DB_USER,
                Sql=sql, Parameters=params,
            )
        except Exception as e:  # noqa: BLE001
            transitorio = "ActiveStatementsExceeded" in str(e) or "ThrottlingException" in str(e)
            if transitorio and n < intentos - 1:
                # backoff exponencial con jitter: 1s, 2s, 4s, 8s, 16s (+ hasta 1s)
                time.sleep(min(2 ** n, 16) + random.random())
                continue
            raise


def _escribir_dataapi(filas):
    import boto3  # import perezoso

    client = boto3.client("redshift-data")
    ok, errores = 0, []

    # 1) Agrupa por tabla + firma de columnas (las filas no siempre traen las mismas).
    grupos = {}
    for i, (tabla, datos) in filas:
        try:
            cols, exprs, vals = _columnas(tabla, datos)
        except Exception as e:  # noqa: BLE001
            errores.append({"i": i, "tabla": tabla, "error": str(e)})
            continue
        grupos.setdefault((tabla, tuple(cols), tuple(exprs)), []).append((i, vals))

    # 2) Un DELETE + un INSERT por grupo.
    for (tabla, cols, exprs), items in grupos.items():
        destino = f"{SCHEMA}.{tabla}"
        pk = TABLAS[tabla]["pk"][0]                  # todas las tablas tienen PK simple
        pos_pk = cols.index(pk)
        indices = [i for i, _ in items]
        try:
            # DELETE ... WHERE pk IN (:p0, :p1, …)
            claves = [v[pos_pk] for _, v in items]
            nombres = [f"p{n}" for n in range(len(claves))]
            sql_del = f"DELETE FROM {destino} WHERE {pk} IN ({', '.join(':' + n for n in nombres)})"
            _ejecutar_con_reintento(
                client, sql_del,
                [{"name": n, "value": str(v)} for n, v in zip(nombres, claves)],
            )

            # INSERT ... VALUES (…), (…), …
            params, tuplas, k = [], [], 0
            for _, vals in items:
                expr_fila = []
                for expr, v in zip(exprs, vals):
                    nom = f"p{k}"; k += 1
                    expr_fila.append(expr.replace("%s", f":{nom}"))
                    params.append({
                        "name": nom,
                        "value": "true" if v is True else "false" if v is False else str(v),
                    })
                tuplas.append(f"({', '.join(expr_fila)})")
            sql_ins = f"INSERT INTO {destino} ({', '.join(cols)}) VALUES {', '.join(tuplas)}"
            _ejecutar_con_reintento(client, sql_ins, params)
            ok += len(items)
        except Exception as e:  # noqa: BLE001 — un grupo malo no corta el resto
            logger.exception("fallo escribiendo en %s", tabla)
            for i in indices:
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
