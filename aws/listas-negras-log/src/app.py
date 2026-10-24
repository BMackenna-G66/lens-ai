"""lens-listas-negras-log — el registro de cada cambio a las listas negras de
Compliance de Admin G66 (DNI, dominios, cuentas).

Lo llama SOLO el Worker (`/admin/listas-negras/*`), con un secreto propio. El
Worker pone el actor —del ID token de Lens que verificó—, el flujo y el
servicio: el navegador no los puede elegir.

── Dos tiempos, y el primero es el que manda ───────────────────────────────
1. **DynamoDB (`lens-listas-negras-log`) es el registro durable.** El Worker
   escribe el evento ANTES de llamar a Admin (`intento`), y si esa escritura
   falla no llama: falla cerrada. Después registra el resultado (`resultado`).
2. **Redshift (schema `listas_negras`) es el espejo.** El cluster se pausa de
   noche y los fines de semana, así que el espejo lo hace un horario: toma lo
   pendiente de DynamoDB y lo escribe, de forma idempotente.

── Por qué el espejo es idempotente ────────────────────────────────────────
`cambio` se reescribe por su clave (DELETE + INSERT por `cambio_id`) con la
fila ENTERA, que sale del ítem de DynamoDB: no hay columna que el reintento no
conozca (la lección de #205). `registro` no se escribe fila a fila: se
RECALCULA desde `cambio` para cada `registro_id` tocado, así que no importa en
qué orden ni cuántas veces lleguen los cambios.

── La etiqueta del flujo ───────────────────────────────────────────────────
`flujo` dice quién agregó o cambió el registro: hoy
`lens.regcheq.listas_negras.carga` y `.edicion`. Otro flujo que agregue a una
lista negra usa este mismo logger con su propia etiqueta.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import random
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

API_SECRET = os.environ.get("API_SECRET", "")
TABLA = os.environ.get("TABLA", "lens-listas-negras-log")
CLUSTER = os.environ.get("REDSHIFT_CLUSTER", "compliance-redshift-cluster")
DATABASE = os.environ.get("REDSHIFT_DATABASE", "dev")
DB_USER = os.environ.get("REDSHIFT_DB_USER", "awsuser")
SCHEMA = os.environ.get("REDSHIFT_SCHEMA", "listas_negras")

LISTAS = ("DNI", "DOMINIO", "CUENTA")
OPERACIONES = ("CREAR", "EDITAR")
#: Las que cambian el registro en Admin: de ellas sale `registro`.
EFECTIVOS = ("CREADO", "ACTIVADO", "DESACTIVADO", "EDITADO")
#: Las que manda el navegador sin pasar por Admin: no hubo operación.
SIN_OPERACION = ("OMITIDO_YA_EXISTE_ACTIVO", "OMITIDO_YA_EXISTE_INACTIVO", "SIN_CAMBIOS", "ERROR")
#: Un intento sin resultado después de esto se espeja como SIN_CONFIRMAR: el
#: Worker se cortó entre Admin y el registro, y no se sabe si Admin lo aplicó.
INTENTO_HUERFANO = timedelta(minutes=30)
#: Pendientes más viejos que esto ya no son una pausa del cluster: se lanza
#: para que suene la alarma.
ATRASO_MAXIMO = timedelta(days=4)
#: Tope de una sentencia de la Data API: 100 KB. Se arma por peso, no por filas.
MAX_SQL_BYTES = 80_000
MAX_RESPUESTA = 4000
_TS = "%Y-%m-%d %H:%M:%S.%f"

#: Para el `registro_id`: el mismo dato da siempre el mismo id.
_NS = uuid.UUID("6f1d2a54-2b4f-4e57-9c3e-0a0f3c1b5e21")
_UUIDISH = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")


class ErrorEntrada(ValueError):
    """La entrada no cumple el contrato: 400."""


class ClusterNoDisponible(RuntimeError):
    """El cluster está pausado o reanudándose: no es un error, se reintenta."""


# ══════════════════════════════════════════════════════════════════════════
# El dato
# ══════════════════════════════════════════════════════════════════════════

def norm_dominio(v: Any) -> str:
    s = str(v or "").strip().lower()
    if "@" in s:
        s = s.split("@")[-1]
    return s.strip(". ")


def norm_cuenta(v: Any) -> str:
    return "".join(str(v or "").split()).upper()


def valor_de(lista: str, registro: dict, valor_meta: Any) -> str:
    """El dato normalizado, con la misma normalización que los scripts.

    El PUT de dominios identifica por `id` y no trae el dominio: ahí viene de
    `meta.valor`, que el navegador saca del registro que leyó de Admin."""
    if lista == "DNI":
        return str(registro.get("dni") or "").strip().upper()
    if lista == "DOMINIO":
        return norm_dominio(registro.get("email") or valor_meta)
    return norm_cuenta(registro.get("accountNumber") or valor_meta)


def registro_id(lista: str, valor: str, country_code: str) -> str:
    return str(uuid.uuid5(_NS, f"{lista}|{valor}|{country_code}"))


def _texto(v: Any, tope: int) -> str | None:
    s = str(v).strip() if v is not None else ""
    return s[:tope] or None


def _bool(v: Any) -> bool | None:
    return v if isinstance(v, bool) else None


def _ahora() -> str:
    """Con microsegundos: dos filas del mismo archivo no empatan en el orden."""
    return datetime.now(timezone.utc).strftime(_TS)


def _parse_ts(s: str) -> datetime:
    return datetime.strptime(s, _TS).replace(tzinfo=timezone.utc)


def _actor(e: dict) -> dict:
    """El actor que puso el Worker: un analista (@global66.com, del ID token
    verificado) o un proceso (`sistema:…`, acreditado con su secreto)."""
    a = e.get("actor") or {}
    email = _texto(a.get("email"), 256)
    if not email or not (email.endswith("@global66.com") or re.match(r"^sistema:[a-z0-9-]{1,64}$", email)):
        raise ErrorEntrada("falta el actor (lo pone el Worker)")
    return {"actor_email": email, "actor_nombre": _texto(a.get("nombre"), 256),
            "actor_uid": _texto(a.get("uid"), 128)}


def _comunes(e: dict) -> dict:
    lista = str(e.get("lista") or "").upper()
    if lista not in LISTAS:
        raise ErrorEntrada("lista inválida")
    ejecucion = str(e.get("ejecucionId") or "")
    if not _UUIDISH.match(ejecucion):
        raise ErrorEntrada("ejecucionId inválido")
    flujo = _texto(e.get("flujo"), 128)
    if not flujo:
        raise ErrorEntrada("falta el flujo")
    return {"lista": lista, "ejecucion_id": ejecucion, "flujo": flujo,
            "servicio": _texto(e.get("servicio"), 128), **_actor(e)}


def evento_intento(e: dict) -> dict:
    """El ítem que se guarda ANTES de llamar a Admin."""
    c = _comunes(e)
    operacion = str(e.get("operacion") or "").upper()
    if operacion not in OPERACIONES:
        raise ErrorEntrada("operacion inválida")
    cambio = str(e.get("cambioId") or "")
    if not _UUIDISH.match(cambio):
        raise ErrorEntrada("cambioId inválido")
    reg = e.get("registro")
    if not isinstance(reg, dict):
        raise ErrorEntrada("falta el registro")
    meta = e.get("meta") or {}
    lista = c["lista"]
    valor = valor_de(lista, reg, meta.get("valor"))
    if not valor:
        raise ErrorEntrada("no se pudo determinar el dato")
    cc = str(reg.get("countryCode") or "").strip().upper()
    if operacion == "CREAR":
        # Un alta queda activa salvo la cuenta que se carga con enable = false.
        nuevo = reg.get("enable") if isinstance(reg.get("enable"), bool) else True
    else:
        nuevo = _bool(reg.get("enable") if lista == "CUENTA" else reg.get("status"))
    origen = e.get("origen") or {}
    return {
        **c,
        "cambio_id": cambio, "operacion": operacion,
        # El caso de la cola que lo originó, si vino de una (OFAC Bloqueado).
        "numero_caso": _texto(origen.get("numeroCaso"), 20), "caso_id": _texto(origen.get("casoId"), 64),
        "registro_id": registro_id(lista, valor, cc), "clave": valor[:512],
        "country_code": cc or None, "country_name": _texto(reg.get("countryName"), 128),
        "account_type": _texto(reg.get("accountType"), 32),
        "admin_id": _texto(reg.get("id"), 64),
        "estado_anterior": _bool(meta.get("estadoAnterior")),
        "estado_nuevo": nuevo,
        "reason_anterior": _texto(meta.get("reasonAnterior"), 1024),
        "reason_nueva": _texto(reg.get("reason"), 1024),
        "body_enviado": json.dumps(reg, ensure_ascii=False),
        "ocurrido_en": _ahora(),
        "estado": "INTENTO",
        "pendiente": "S",
        "version": 1,
    }


def resultado_de(item: dict, ok: bool) -> str:
    if not ok:
        return "ERROR"
    if item.get("operacion") == "CREAR":
        return "CREADO"
    antes, ahora = item.get("estado_anterior"), item.get("estado_nuevo")
    if ahora is not None and antes != ahora:
        return "ACTIVADO" if ahora else "DESACTIVADO"
    return "EDITADO"


def _id_en_respuesta(respuesta: Any) -> str | None:
    """El id que devuelve Admin al crear, si lo devuelve."""
    for r in (respuesta, (respuesta or {}).get("data") if isinstance(respuesta, dict) else None):
        if isinstance(r, dict) and r.get("id") not in (None, ""):
            return str(r["id"])[:64]
    return None


def eventos_sin_operacion(e: dict) -> list[dict]:
    """Las filas que no llegaron a Admin: omitidas, sin cambios o con error de
    validación. Quedan en `cambio`, sin tocar `registro`."""
    c = _comunes(e)
    filas = e.get("filas")
    if not isinstance(filas, list) or not 0 < len(filas) <= 500:
        raise ErrorEntrada("filas: entre 1 y 500")
    operacion = str(e.get("operacion") or "").upper()
    if operacion not in OPERACIONES:
        operacion = "CREAR" if c["flujo"].endswith(".carga") else "EDITAR"
    ahora = _ahora()
    salida = []
    for f in filas:
        if not isinstance(f, dict):
            raise ErrorEntrada("fila inválida")
        resultado = str(f.get("resultado") or "")
        if resultado not in SIN_OPERACION:
            raise ErrorEntrada(f"resultado no admitido: {resultado}")
        cambio = str(f.get("cambioId") or "")
        if not _UUIDISH.match(cambio):
            raise ErrorEntrada("cambioId inválido")
        lista = c["lista"]
        valor = valor_de(lista, {}, f.get("valor")) if lista != "DNI" else str(f.get("valor") or "").strip().upper()
        cc = str(f.get("countryCode") or "").strip().upper()
        salida.append({
            **c, "cambio_id": cambio, "operacion": operacion, "resultado": resultado,
            "registro_id": registro_id(lista, valor, cc) if valor else None, "clave": valor[:512] or None,
            "country_code": cc or None, "account_type": _texto(f.get("accountType"), 32),
            "admin_id": _texto(f.get("adminId"), 64), "estado_anterior": _bool(f.get("estadoAnterior")),
            "estado_nuevo": _bool(f.get("estadoNuevo")), "reason_nueva": _texto(f.get("reason"), 1024),
            "error": _texto(f.get("error"), 2048), "ocurrido_en": ahora, "resultado_en": ahora,
            "numero_caso": _texto(f.get("numeroCaso"), 20), "caso_id": _texto(f.get("casoId"), 64),
            "estado": "CERRADO", "pendiente": "S", "version": 1,
        })
    return salida


# ══════════════════════════════════════════════════════════════════════════
# DynamoDB, el registro durable
# ══════════════════════════════════════════════════════════════════════════

def _tabla():
    import boto3
    return boto3.resource("dynamodb").Table(TABLA)


def _a_dynamo(item: dict) -> dict:
    """Sin claves en None: DynamoDB no guarda un None en un índice."""
    return {k: v for k, v in item.items() if v is not None}


def registrar_intento(tabla, e: dict) -> dict:
    item = evento_intento(e)
    # La condición hace idempotente un reintento del Worker: el mismo cambioId
    # no se pisa.
    try:
        tabla.put_item(Item=_a_dynamo(item), ConditionExpression="attribute_not_exists(cambio_id)")
    except Exception as ex:  # noqa: BLE001
        if "ConditionalCheckFailed" not in str(ex):
            raise
    return {"cambioId": item["cambio_id"], "registroId": item["registro_id"]}


def registrar_resultado(tabla, e: dict) -> dict:
    cambio = str(e.get("cambioId") or "")
    if not _UUIDISH.match(cambio):
        raise ErrorEntrada("cambioId inválido")
    actual = tabla.get_item(Key={"cambio_id": cambio}).get("Item")
    if not actual:
        raise ErrorEntrada("no existe el intento de ese cambio")
    # El resultado solo lo puede cerrar quien lo empezó.
    if actual.get("actor_email") != _actor(e)["actor_email"]:
        raise ErrorEntrada("el resultado es de otro actor")
    ok = e.get("ok") is True
    status = e.get("httpStatus")
    respuesta = e.get("respuesta")
    resp_txt = json.dumps(respuesta, ensure_ascii=False) if respuesta is not None else None
    if resp_txt and len(resp_txt) > MAX_RESPUESTA:
        resp_txt = json.dumps({"truncado": True, "bytes": len(resp_txt)})
    cambios = {
        "resultado": resultado_de(actual, ok),
        "http_status": int(status) if isinstance(status, int) else None,
        "error": _texto(e.get("error"), 2048),
        "respuesta": resp_txt,
        "admin_id": actual.get("admin_id") or _id_en_respuesta(respuesta),
        "resultado_en": _ahora(),
        "estado": "CERRADO",
        "pendiente": "S",
    }
    sets = {k: v for k, v in cambios.items() if v is not None}
    # `version` sube con cada escritura: el espejo solo baja la marca de
    # pendiente si el ítem no cambió mientras lo espejaba.
    tabla.update_item(
        Key={"cambio_id": cambio},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in sets) + " ADD #version :uno",
        ExpressionAttributeNames={**{f"#{k}": k for k in sets}, "#version": "version"},
        ExpressionAttributeValues={**{f":{k}": v for k, v in sets.items()}, ":uno": 1},
    )
    return {"cambioId": cambio, "resultado": cambios["resultado"]}


def registrar_sin_operacion(tabla, e: dict) -> dict:
    items = eventos_sin_operacion(e)
    with tabla.batch_writer(overwrite_by_pkeys=["cambio_id"]) as b:
        for it in items:
            b.put_item(Item=_a_dynamo(it))
    return {"registrados": len(items)}


def completar_ids(tabla, e: dict) -> dict:
    """El `admin_id` de altas que Admin no devolvió, del GET posterior."""
    actor = _actor(e)["actor_email"]
    ids = e.get("ids")
    if not isinstance(ids, list) or not 0 < len(ids) <= 500:
        raise ErrorEntrada("ids: entre 1 y 500")
    n = 0
    for x in ids:
        cambio, admin = str((x or {}).get("cambioId") or ""), _texto((x or {}).get("adminId"), 64)
        if not _UUIDISH.match(cambio) or not admin:
            raise ErrorEntrada("id inválido")
        try:
            tabla.update_item(
                Key={"cambio_id": cambio},
                UpdateExpression="SET admin_id = :a, pendiente = :p ADD #version :uno",
                ConditionExpression="attribute_exists(cambio_id) AND actor_email = :e AND attribute_not_exists(admin_id)",
                ExpressionAttributeNames={"#version": "version"},
                ExpressionAttributeValues={":a": admin, ":p": "S", ":e": actor, ":uno": 1},
            )
            n += 1
        except Exception as ex:  # noqa: BLE001
            if "ConditionalCheckFailed" not in str(ex):
                raise
    return {"completados": n}


# ══════════════════════════════════════════════════════════════════════════
# Redshift, el espejo
# ══════════════════════════════════════════════════════════════════════════

#: Las columnas de `cambio`, con su tipo para armar el literal.
COLUMNAS_CAMBIO = (
    ("cambio_id", ""), ("ejecucion_id", ""), ("lista", ""), ("operacion", ""), ("resultado", ""),
    ("registro_id", ""), ("clave", ""), ("country_code", ""), ("country_name", ""), ("account_type", ""),
    ("admin_id", ""), ("estado_anterior", "bool"), ("estado_nuevo", "bool"), ("reason_anterior", ""),
    ("reason_nueva", ""), ("http_status", "int"), ("error", ""), ("body_enviado", "json"),
    ("respuesta", "json"), ("flujo", ""), ("servicio", ""), ("actor_email", ""), ("actor_nombre", ""),
    ("actor_uid", ""), ("ocurrido_en", "ts"), ("cargado_en", "ts"),
    # 002: el caso de la cola que originó el cambio (OFAC Bloqueado).
    ("numero_caso", ""), ("caso_id", ""),
)


def _esc(s: str) -> str:
    """Comillas y barras invertidas duplicadas: Redshift interpreta la barra
    dentro de un literal (PR #206)."""
    return s.replace("\\", "\\\\").replace("'", "''")


def _lit(v: Any, tipo: str) -> str:
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
        return "JSON_PARSE('" + _esc(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)) + "')"
    return "'" + _esc(str(v)) + "'"


def fila_cambio(item: dict, ahora: str) -> dict:
    """La fila de `cambio` desde el ítem. Un intento viejo sin resultado se
    espeja como SIN_CONFIRMAR."""
    fila = {c: item.get(c) for c, _ in COLUMNAS_CAMBIO}
    if item.get("estado") == "INTENTO":
        fila["resultado"] = "SIN_CONFIRMAR"
        fila["error"] = "El Worker no registró el resultado: no se sabe si Admin aplicó el cambio."
    fila["cargado_en"] = ahora
    return fila


def sentencias_espejo(items: list[dict], ahora: str) -> list[str]:
    """Las sentencias de un lote, en el orden en que van en UNA transacción."""
    s = f"{SCHEMA}"
    ids = ", ".join(_lit(i["cambio_id"], "") for i in items)
    valores = ",\n".join(
        "(" + ", ".join(_lit(fila_cambio(i, ahora)[c], t) for c, t in COLUMNAS_CAMBIO) + ")" for i in items)
    sql = [
        f"DELETE FROM {s}.cambio WHERE cambio_id IN ({ids})",
        f"INSERT INTO {s}.cambio ({', '.join(c for c, _ in COLUMNAS_CAMBIO)}) VALUES\n{valores}",
    ]
    regs = sorted({i["registro_id"] for i in items if i.get("registro_id")})
    if regs:
        sql += sentencias_registro(regs)
    return sql


def sentencias_registro(regs: list[str]) -> list[str]:
    """`registro` se RECALCULA desde `cambio` para esos ids: el último cambio
    efectivo decide el estado, el primer alta decide quién y por qué flujo lo
    agregó, y el último valor no vacío de cada dato completa el resto.

    Un registro que solo tiene ediciones —cargado antes de este registro— queda
    con `flujo_alta` y `creado_*` en NULL: no se sabe quién lo agregó."""
    s = SCHEMA
    en = ", ".join(_lit(r, "") for r in regs)
    efectivos = ", ".join(f"'{x}'" for x in EFECTIVOS)

    def ultimo_no_nulo(col: str) -> str:
        return (f"(SELECT registro_id, {col}, ROW_NUMBER() OVER (PARTITION BY registro_id "
                f"ORDER BY ocurrido_en DESC, cambio_id DESC) AS n FROM {s}.cambio "
                f"WHERE registro_id IN ({en}) AND resultado IN ({efectivos}) AND {col} IS NOT NULL)")

    return [
        f"DELETE FROM {s}.registro WHERE registro_id IN ({en})",
        f"""INSERT INTO {s}.registro (registro_id, lista, valor, country_code, country_name, account_type, reason,
  admin_id, activo, flujo_alta, ejecucion_id_alta, creado_por, creado_en, actualizado_por, actualizado_en)
SELECT u.registro_id, u.lista, u.clave, u.country_code, cn.country_name, ty.account_type, rz.reason_nueva,
  ad.admin_id, u.estado_nuevo, a.flujo, a.ejecucion_id, a.actor_email, a.ocurrido_en, u.actor_email, u.ocurrido_en
FROM (SELECT registro_id, lista, clave, country_code, estado_nuevo, actor_email, ocurrido_en,
        ROW_NUMBER() OVER (PARTITION BY registro_id ORDER BY ocurrido_en DESC, cambio_id DESC) AS n
      FROM {s}.cambio WHERE registro_id IN ({en}) AND resultado IN ({efectivos})) u
LEFT JOIN (SELECT registro_id, flujo, ejecucion_id, actor_email, ocurrido_en,
        ROW_NUMBER() OVER (PARTITION BY registro_id ORDER BY ocurrido_en, cambio_id) AS n
      FROM {s}.cambio WHERE registro_id IN ({en}) AND resultado = 'CREADO') a
  ON a.registro_id = u.registro_id AND a.n = 1
LEFT JOIN {ultimo_no_nulo('country_name')} cn ON cn.registro_id = u.registro_id AND cn.n = 1
LEFT JOIN {ultimo_no_nulo('account_type')} ty ON ty.registro_id = u.registro_id AND ty.n = 1
LEFT JOIN {ultimo_no_nulo('reason_nueva')} rz ON rz.registro_id = u.registro_id AND rz.n = 1
LEFT JOIN {ultimo_no_nulo('admin_id')} ad ON ad.registro_id = u.registro_id AND ad.n = 1
WHERE u.n = 1""",
    ]


def _es_cluster_no_disponible(e: Exception) -> bool:
    m = str(e)
    return ("is not available" in m or "ClusterNotFound" in m or "is resuming" in m
            or "Connection refused" in m or "cluster is paused" in m.lower())


def _ejecutar_lote(client, sqls: list[str], intentos: int = 6) -> None:
    """Una transacción (`BatchExecuteStatement`), esperando a que termine: así
    hay un solo statement activo a la vez y la cuota de 500 no se toca."""
    for n in range(intentos):
        try:
            sid = client.batch_execute_statement(
                ClusterIdentifier=CLUSTER, Database=DATABASE, DbUser=DB_USER, Sqls=sqls)["Id"]
            break
        except Exception as e:  # noqa: BLE001
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


def pendientes(tabla, limite: int = 2000) -> list[dict]:
    """Lo que falta espejar, del índice ralo `pendientes` (solo los ítems con
    `pendiente = S` están en él)."""
    items, inicio = [], None
    while len(items) < limite:
        kw = {"IndexName": "pendientes", "KeyConditionExpression": "pendiente = :s",
              "ExpressionAttributeValues": {":s": "S"}}
        if inicio:
            kw["ExclusiveStartKey"] = inicio
        r = tabla.query(**kw)
        items += r.get("Items", [])
        inicio = r.get("LastEvaluatedKey")
        if not inicio:
            break
    return items


def _normalizar(item: dict) -> dict:
    """De DynamoDB vienen `Decimal`: a int."""
    return {k: (int(v) if type(v).__name__ == "Decimal" else v) for k, v in item.items()}


def lotes(items: list[dict], ahora: str) -> list[list[dict]]:
    """Lotes cuyo INSERT de `cambio` no pase de MAX_SQL_BYTES."""
    salida, actual, peso = [], [], 0
    for i in items:
        p = len(("(" + ", ".join(_lit(fila_cambio(i, ahora)[c], t) for c, t in COLUMNAS_CAMBIO) + "),").encode())
        if actual and peso + p > MAX_SQL_BYTES:
            salida.append(actual)
            actual, peso = [], 0
        actual.append(i)
        peso += p
    if actual:
        salida.append(actual)
    return salida


def espejar(tabla, client, ahora_dt: datetime | None = None) -> dict:
    ahora_dt = ahora_dt or datetime.now(timezone.utc)
    ahora = ahora_dt.strftime(_TS)
    todos = [_normalizar(i) for i in pendientes(tabla)]
    # Un intento reciente sin resultado puede estar en curso: se espera.
    listos = [i for i in todos if i.get("estado") != "INTENTO"
              or _parse_ts(i["ocurrido_en"]) < ahora_dt - INTENTO_HUERFANO]
    listos.sort(key=lambda i: (i.get("ocurrido_en") or "", i["cambio_id"]))
    espejados = 0
    for lote in lotes(listos, ahora):
        _ejecutar_lote(client, sentencias_espejo(lote, ahora))
        for i in lote:
            # Solo se baja la marca si el ítem no cambió mientras tanto: un
            # resultado o un id que llegaron durante el espejo suben `version`
            # y el ítem sigue pendiente para la próxima.
            try:
                tabla.update_item(
                    Key={"cambio_id": i["cambio_id"]},
                    UpdateExpression="REMOVE pendiente SET espejado_en = :t",
                    ConditionExpression="#version = :v",
                    ExpressionAttributeNames={"#version": "version"},
                    ExpressionAttributeValues={":t": ahora, ":v": i.get("version", 1)},
                )
            except Exception as ex:  # noqa: BLE001
                if "ConditionalCheckFailed" not in str(ex):
                    raise
        espejados += len(lote)
    return {"pendientes": len(todos), "espejados": espejados, "esperando": len(todos) - len(listos)}


# ══════════════════════════════════════════════════════════════════════════
# Handler
# ══════════════════════════════════════════════════════════════════════════

ACCIONES = {
    "intento": registrar_intento,
    "resultado": registrar_resultado,
    "sin_operacion": registrar_sin_operacion,
    "ids": completar_ids,
}


def _resp(codigo: int, cuerpo: dict) -> dict:
    return {"statusCode": codigo, "headers": {"content-type": "application/json"},
            "body": json.dumps(cuerpo, ensure_ascii=False)}


def manejar_http(event: dict, tabla) -> dict:
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not API_SECRET or not hmac.compare_digest(headers.get("x-api-secret", ""), API_SECRET):
        return _resp(401, {"error": "no autorizado"})
    try:
        cuerpo = json.loads(event.get("body") or "{}")
    except ValueError:
        return _resp(400, {"error": "JSON inválido"})
    accion = ACCIONES.get(str((cuerpo or {}).get("accion") or ""))
    if not accion or not isinstance(cuerpo, dict):
        return _resp(400, {"error": "acción inválida"})
    try:
        return _resp(200, {"ok": True, **accion(tabla, cuerpo)})
    except ErrorEntrada as e:
        return _resp(400, {"error": str(e)})
    except Exception as e:  # noqa: BLE001
        # Sin el contenido del evento: trae DNI, cuentas o dominios.
        logger.error("no se pudo registrar (%s): %s", cuerpo.get("accion"), type(e).__name__)
        return _resp(503, {"error": "no se pudo registrar"})


def manejar_horario(tabla) -> dict:
    import boto3
    client = boto3.client("redshift-data")
    try:
        r = espejar(tabla, client)
    except ClusterNoDisponible as e:
        viejo = min((i.get("ocurrido_en") or "" for i in pendientes(tabla, 50)), default="")
        if viejo and _parse_ts(viejo) < datetime.now(timezone.utc) - ATRASO_MAXIMO:
            raise RuntimeError(f"cluster sin responder y eventos sin espejar desde {viejo}") from e
        logger.info("cluster no disponible: se reintenta en el próximo horario")
        return {"ok": True, "omitido": "cluster_no_disponible"}
    logger.info("espejo: %s", json.dumps(r))
    return {"ok": True, **r}


def lambda_handler(event, context):
    event = event if isinstance(event, dict) else {}
    tabla = _tabla()
    if event.get("source") == "aws.events" or event.get("espejar"):
        return manejar_horario(tabla)
    return manejar_http(event, tabla)
