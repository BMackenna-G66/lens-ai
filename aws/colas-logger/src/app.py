"""
Logger de la gestión de colas de Lens → Redshift (schema `colas_trabajo`).

INDEPENDIENTE del receptor de casos (aws/casos-receptor): stack propio, función
propia, secreto propio y código propio. No importa ni modifica nada de ese
proyecto — está inspirado en él (Function URL + header x-api-secret) pero no lo
reutiliza, para que un cambio acá no pueda romper la ingesta de casos.

Contrato: POST con
    { "eventos": [ { "tabla": "evento_auditoria", "datos": { ... } }, ... ] }

Escribe en Redshift por la **Data API** (sin VPC, sin driver). Cada fila se
inserta de forma idempotente: se borra por clave natural y se inserta de nuevo,
así reprocesar el mismo evento no duplica.

La app llama esto fire-and-forget: si falla, la Bandeja sigue funcionando y
Firestore sigue siendo la fuente operacional.
"""

import json
import logging
import os
import time

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

API_SECRET = os.environ.get("API_SECRET", "")
CLUSTER = os.environ.get("REDSHIFT_CLUSTER", "")
DATABASE = os.environ.get("REDSHIFT_DATABASE", "dev")
DB_USER = os.environ.get("REDSHIFT_DB_USER", "")
SECRET_ARN = os.environ.get("REDSHIFT_SECRET_ARN", "")
SCHEMA = os.environ.get("REDSHIFT_SCHEMA", "colas_trabajo")
ASSUME_ROLE_ARN = os.environ.get("ASSUME_ROLE_ARN", "")   # cross-account
WAIT_RESULT = os.environ.get("WAIT_FOR_RESULT", "") == "1"
MAX_EVENTOS = int(os.environ.get("MAX_EVENTOS", "100"))

# ── Whitelist de tablas y columnas ───────────────────────────────────────────
# El SQL se arma SOLO desde este mapa (nunca con nombres que vengan del request),
# y los valores viajan como parámetros de la Data API. Sin concatenar datos.
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


def _cliente_redshift():
    """Cliente de la Data API. Si ASSUME_ROLE_ARN está seteado, asume ese rol
    primero (caso cross-account: la Lambda vive en una cuenta y Redshift en otra)."""
    if not ASSUME_ROLE_ARN:
        return boto3.client("redshift-data")
    creds = boto3.client("sts").assume_role(
        RoleArn=ASSUME_ROLE_ARN, RoleSessionName="colas-logger"
    )["Credentials"]
    return boto3.client(
        "redshift-data",
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
    )


def _expr(col, tipo):
    """Expresión SQL del valor para una columna. Los vacíos entran como NULL."""
    p = f":{col}"
    if tipo == "int":
        return f"NULLIF({p}, '')::BIGINT"
    if tipo == "bool":
        return f"NULLIF({p}, '')::BOOLEAN"
    if tipo == "ts":
        return f"NULLIF({p}, '')::TIMESTAMP"
    if tipo == "json":
        return f"CASE WHEN {p} = '' THEN NULL ELSE JSON_PARSE({p}) END"
    return f"NULLIF({p}, '')"


def _param(col, valor, tipo):
    """Valor → parámetro de la Data API (siempre string)."""
    if valor is None:
        s = ""
    elif tipo == "json":
        s = valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
    elif tipo == "bool":
        s = "true" if valor is True else ("false" if valor is False else "")
    else:
        s = str(valor)
    return {"name": col, "value": s}


def _sql_de_fila(tabla, datos):
    """Devuelve (sql_delete, sql_insert, parametros) para una fila."""
    spec = TABLAS[tabla]
    cols = [c for c in spec["cols"] if c in datos]           # solo lo que vino
    for pk in spec["pk"]:
        if pk not in cols:
            raise ValueError(f"falta la clave {pk} para {tabla}")

    params = [_param(c, datos[c], spec["cols"][c]) for c in cols]
    destino = f"{SCHEMA}.{tabla}"

    where = " AND ".join(f"{pk} = :{pk}" for pk in spec["pk"])
    sql_del = f"DELETE FROM {destino} WHERE {where}"
    sql_ins = (
        f"INSERT INTO {destino} ({', '.join(cols)}) VALUES "
        f"({', '.join(_expr(c, spec['cols'][c]) for c in cols)})"
    )
    # El DELETE solo necesita los parámetros de la PK.
    params_del = [p for p in params if p["name"] in spec["pk"]]
    return sql_del, sql_ins, params, params_del


def _ejecutar(client, sql, params):
    kwargs = {"Database": DATABASE, "Sql": sql, "Parameters": params}
    if CLUSTER:
        kwargs["ClusterIdentifier"] = CLUSTER
    if SECRET_ARN:
        kwargs["SecretArn"] = SECRET_ARN
    elif DB_USER:
        kwargs["DbUser"] = DB_USER
    res = client.execute_statement(**kwargs)
    sid = res["Id"]
    if WAIT_RESULT:
        for _ in range(30):
            d = client.describe_statement(Id=sid)
            if d["Status"] in ("FINISHED", "FAILED", "ABORTED"):
                if d["Status"] != "FINISHED":
                    raise RuntimeError(f"{d['Status']}: {d.get('Error', '')}")
                break
            time.sleep(0.3)
    return sid


def lambda_handler(event, _context):
    metodo = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "POST")
    if metodo == "OPTIONS":
        return _respuesta(200, {"ok": True})
    if metodo != "POST":
        return _respuesta(405, {"error": "Método no permitido"})

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not API_SECRET or headers.get("x-api-secret") != API_SECRET:
        return _respuesta(401, {"error": "No autorizado"})
    if not CLUSTER:
        return _respuesta(500, {"error": "Falta REDSHIFT_CLUSTER"})
    if not DB_USER and not SECRET_ARN:
        return _respuesta(500, {"error": "Falta REDSHIFT_DB_USER o REDSHIFT_SECRET_ARN"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _respuesta(400, {"error": "Body JSON inválido"})

    eventos = body.get("eventos")
    if not isinstance(eventos, list) or not eventos:
        return _respuesta(400, {"error": "Se espera { eventos: [...] }"})
    if len(eventos) > MAX_EVENTOS:
        return _respuesta(400, {"error": f"Máximo {MAX_EVENTOS} eventos por request"})

    client = _cliente_redshift()
    ok, errores = 0, []
    for i, ev in enumerate(eventos):
        tabla = (ev or {}).get("tabla")
        datos = (ev or {}).get("datos")
        if tabla not in TABLAS or not isinstance(datos, dict):
            errores.append({"i": i, "error": f"tabla inválida o datos vacíos: {tabla}"})
            continue
        try:
            sql_del, sql_ins, params, params_del = _sql_de_fila(tabla, datos)
            _ejecutar(client, sql_del, params_del)
            _ejecutar(client, sql_ins, params)
            ok += 1
        except Exception as e:  # noqa: BLE001 — un evento malo no corta el lote
            logger.exception("fallo escribiendo en %s", tabla)
            errores.append({"i": i, "tabla": tabla, "error": str(e)})

    return _respuesta(200 if not errores else 207, {"ok": ok, "errores": errores})
