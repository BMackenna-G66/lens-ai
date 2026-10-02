"""Persistencia operacional de corridas — Fase 1 del plan LENS ⇄ Onboarding B2B.

El hueco que tapa: **hoy nada está indexado por empresa**. `almacen.py` guarda
por `analysisId` y sirve para la idempotencia —un segundo POST con el mismo id
devuelve lo guardado— pero no puede responder «¿cuál fue la última corrida de
esta empresa?», que es exactamente lo que preguntan EP-2 y EP-3.

Son dos almacenes distintos a propósito, y este NO reemplaza al otro.

── Por qué DynamoDB y no el cluster analítico ──────────────────────────────
Ya está razonado en `almacen.py` y vale igual acá: el cluster se pausa de 18:30
a 04:00 y Onboarding pide disponibilidad 24/7. Una consulta de estado a las once
de la noche tiene que responder. Lo analítico sigue yendo a `lens.*` por el
camino de siempre.

── Por qué el ambiente es parte de la clave ────────────────────────────────
LENS tiene un solo ambiente y va a recibir tráfico de desarrollo, CI y
producción. El mismo `companyId` es una empresa distinta en cada uno. Con la
clave sin el ambiente, una prueba de desarrollo pisa la lectura de una empresa
real — y lo hace en silencio, que es lo peor de todo.

── `NOT_STARTED` no se guarda nunca ────────────────────────────────────────
Es la **ausencia** de registro, no un valor. Guardarlo obligaría a decidir
cuándo escribir una fila que dice «no pasó nada», y esa fila sería
indistinguible de una escritura que se perdió. `estado()` lo devuelve cuando no
encuentra nada; nadie lo escribe.

── Modo memoria ────────────────────────────────────────────────────────────
`CORRIDAS_TABLA` vacío deja todo en memoria, con la MISMA semántica: orden,
historial, corrida en curso y caducidad. Es lo que permite construir y testear
las Fases 2 a 4 sin esperar a que se destrabe el despliegue. No promete nada
entre invocaciones, y `disponible()` lo dice para que no haya que adivinarlo.

Funciones puras salvo las que tocan DynamoDB. El reloj se inyecta.
"""

from __future__ import annotations

import json
import logging
import os
import random
import re
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

log = logging.getLogger()

# ── Los cinco estados ───────────────────────────────────────────────────────

NOT_STARTED = "NOT_STARTED"
IN_PROGRESS = "IN_PROGRESS"
COMPLETED = "COMPLETED"
INCOMPLETE = "INCOMPLETE"
FAILED = "FAILED"

#: Los que cierran una corrida. Una vez en uno de estos, no se vuelve atrás.
TERMINALES: frozenset[str] = frozenset({COMPLETED, INCOMPLETE, FAILED})
#: Los que se pueden guardar. `NOT_STARTED` no está, y es a propósito.
GUARDABLES: frozenset[str] = frozenset({IN_PROGRESS}) | TERMINALES


# ── Configuración ───────────────────────────────────────────────────────────

TABLA = os.environ.get("CORRIDAS_TABLA", "").strip()

#: Cuánto vive el registro de una corrida. 90 días: más que el almacén de
#: idempotencia (30) porque acá lo que se guarda es el historial por empresa,
#: que es justamente lo que se consulta tiempo después.
TTL_DIAS = int(os.environ.get("CORRIDAS_TTL_DIAS", "90"))

#: Después de cuántos segundos una corrida `IN_PROGRESS` se considera abandonada.
#:
#: Sin esto hay un bloqueo permanente: si el proceso muere a mitad —timeout de
#: Lambda, falta de memoria, un deploy— la corrida queda `IN_PROGRESS` para
#: siempre y EP-1 devuelve `409` sobre esa empresa hasta que alguien borre la
#: fila a mano. El plan no lo menciona; aparece al construirlo.
#:
#: 6 minutos (antes 15). El techo de una corrida viva es el timeout de la
#: función, 300 s, por los dos caminos: el asíncrono corre en su propia
#: invocación, y el en línea dentro de la petición que la registró. Con 900,
#: una corrida muerta dejaba a la empresa con `409` un cuarto de hora, y
#: Onboarding corta la espera a los 7. A partir de este tope la corrida se lee
#: `FAILED`, EP-1 acepta otra, y `cerrar` ya no la puede cambiar.
TOPE_EN_CURSO_S = int(os.environ.get("CORRIDAS_TOPE_EN_CURSO_S", "360"))

#: Ambientes admitidos, separados por coma. **Vacío = se acepta cualquiera.**
#:
#: Queda abierto por defecto porque los tres nombres todavía no están
#: confirmados con Onboarding, y adivinarlos bloquearía tráfico legítimo el
#: primer día. Pero dejarlo abierto tiene su propio costo: un `prod` contra un
#: `production` crea dos particiones distintas sin avisar, y la consulta de
#: estado devuelve `NOT_STARTED` sobre una corrida que sí ocurrió.
#:
#: Cuando Onboarding confirme los nombres, setear esta variable cierra la trampa
#: sin tocar código.
AMBIENTES: tuple[str, ...] = tuple(
    a.strip().lower() for a in os.environ.get("CORRIDAS_AMBIENTES", "").split(",") if a.strip()
)

#: El separador de la clave. No puede aparecer en un ambiente normalizado, así
#: que partir la clave nunca es ambiguo.
SEP = "#"

_RE_AMBIENTE = re.compile(r"[^a-z0-9_-]+")

_memoria: dict[str, list[dict]] = {}

#: En modo memoria, lo que en DynamoDB hace la escritura condicional: que mirar
#: si hay una corrida viva y registrar la nueva sea UN paso.
_cerrojo_memoria = threading.Lock()


# ── El candado: una corrida viva por ambiente + empresa ─────────────────────
#
# El control «¿hay una en curso?» y el registro eran dos operaciones —una
# consulta y un `put_item`—, y dos EP-1 simultáneos pasaban los dos por el medio:
# dos corridas de la misma empresa, dos análisis, dos cobros. Ahora son UNA
# escritura: una transacción que pone el candado de la empresa CON CONDICIÓN y,
# en el mismo paso, la fila de la corrida. De dos EP-1 simultáneos, uno toma el
# candado y el otro recibe el `409` con los datos del primero.
#
# El candado es un ítem aparte, en OTRA partición: su clave empieza con `#`, que
# un ambiente normalizado no puede tener. Por eso `_leer_todas` y `ultima` no lo
# ven nunca — no aparece como corrida.
#
# Está libre si no existe, si su corrida ya cerró, o si su corrida pasó el tope
# de caducidad: esto último es lo que sigue liberando a la empresa cuando el
# proceso murió sin cerrar.

SK_CANDADO = "candado"

#: El candado se puede tomar. `#st` porque `status` es palabra reservada.
COND_CANDADO_LIBRE = "attribute_not_exists(pk) OR #st <> :en_curso OR startedTs < :limite"
#: La fila de la corrida es nueva: nunca se pisa una que ya existe.
COND_FILA_NUEVA = "attribute_not_exists(pk)"
#: La corrida se puede cerrar: sigue viva y no pasó el tope. Una que EP-2 ya
#: informó `FAILED` por caducada no cambia más de estado.
COND_CORRIDA_VIVA = "#st = :en_curso AND startedTs >= :limite"
#: El candado es de esta corrida (o no existe: una corrida registrada antes de
#: que hubiera candados).
COND_CANDADO_PROPIO = "attribute_not_exists(pk) OR analysisId = :aid"
#: Lo que se puede anular: una corrida que sigue `IN_PROGRESS`, y es esta.
COND_ANULABLE = "#st = :en_curso AND analysisId = :aid"

#: Cuántas veces se reintenta una transacción que chocó con otra simultánea
#: (`TransactionConflict`). Al reintentar, la otra ya terminó: o se toma el
#: candado, o se ve quién lo tiene y se responde el `409` con sus datos.
#:
#: Con 3 intentos fijos no alcanzaba: probado contra DynamoDB de verdad, de
#: ocho registros simultáneos dos seguían chocando al tercero y habrían salido
#: `503` en vez de `409`. Por eso la espera crece y lleva azar —para que los que
#: chocaron no vuelvan a chocar juntos—, y si igual se agotan, `registrar_inicio`
#: lee el candado antes de rendirse.
INTENTOS_TRANSACCION = 5


class EnCurso(Exception):
    """Ya hay una corrida viva de esa empresa en ese ambiente. Trae la que corre,
    para que EP-1 responda el `409` con su `analysisId` y su `startedAt`."""

    def __init__(self, viva: dict):
        super().__init__(f"ya hay una corrida en curso: {viva.get('analysisId')}")
        self.viva = viva


def clave_candado(ambiente: Any, company_id: Any) -> str:
    """`#candado#ambiente#companyId`: nunca coincide con la clave de una corrida,
    que empieza por el ambiente."""
    return f"{SEP}{SK_CANDADO}{SEP}{clave(ambiente, company_id)}"


def _limite(t: float) -> Decimal:
    """`startedTs` por debajo de esto = caducada. Es el MISMO criterio que
    `caducada()`, (t − inicio) > tope, escrito como lo puede comparar DynamoDB."""
    return Decimal(f"{t - TOPE_EN_CURSO_S:.3f}")


# ── Claves y normalización ──────────────────────────────────────────────────

def normalizar_ambiente(v: Any) -> str:
    """El ambiente como se guarda: minúsculas y sin nada que no sea `[a-z0-9_-]`.

    Se normaliza porque es vocabulario controlado y `PROD` y `prod` son el mismo
    ambiente. Que quede sin `#` es lo que hace que la clave no sea ambigua.
    """
    return _RE_AMBIENTE.sub("-", str(v or "").strip().lower()).strip("-")


def ambiente_admitido(ambiente: str) -> bool:
    """¿Este ambiente está en la lista? Con la lista vacía, cualquiera sirve."""
    return bool(ambiente) and (not AMBIENTES or ambiente in AMBIENTES)


def clave(ambiente: Any, company_id: Any) -> str:
    """La clave de partición: `ambiente#companyId`.

    El `companyId` NO se normaliza: es un identificador opaco que genera
    ms-company, y bajarlo a minúsculas podría unir dos empresas distintas. Solo
    se le sacan los espacios de los extremos.
    """
    return f"{normalizar_ambiente(ambiente)}{SEP}{str(company_id or '').strip()}"


def _ahora_iso(ahora: float | None = None) -> str:
    return datetime.fromtimestamp(ahora if ahora is not None else time.time(), timezone.utc) \
        .isoformat(timespec="seconds").replace("+00:00", "Z")


def _tabla():
    import boto3  # import perezoso: no se paga en frío si no hay tabla
    return boto3.resource("dynamodb").Table(TABLA)


# ── Escritura ───────────────────────────────────────────────────────────────

def registrar_inicio(
    ambiente: Any,
    company_id: Any,
    analysis_id: str,
    *,
    country: str = "",
    documentos: list[dict] | None = None,
    schema_version: str = "",
    ahora: float | None = None,
) -> dict:
    """Deja la corrida como `IN_PROGRESS` y devuelve el registro, o levanta
    `EnCurso` si la empresa ya tiene una corrida viva en ese ambiente.

    **Se llama ANTES de responder el `202`.** No es una preferencia de diseño: si
    el `202` sale primero, la primera consulta del front puede ver `NOT_STARTED`,
    volver a mostrar la pantalla de carga y disparar un segundo procesamiento del
    mismo lote.

    **Mirar y registrar es UN paso** (ver «El candado»). Cualquier otra falla se
    PROPAGA: si no se pudo registrar, no hay corrida, y EP-1 tiene que decirlo con
    un `503` en vez de responder un `202` que ninguna consulta de estado va a
    poder confirmar.
    """
    t = ahora if ahora is not None else time.time()
    iniciado = _ahora_iso(t)
    reg = {
        "pk": clave(ambiente, company_id),
        # Ordena por tiempo sin depender de que el id sea ordenable: el contrato
        # dice que el `analysisId` lo genera ms-company, así que no se puede dar
        # por hecho que sea un ULID.
        "sk": f"{iniciado}{SEP}{analysis_id}",
        "ambiente": normalizar_ambiente(ambiente),
        "companyId": str(company_id or "").strip(),
        "analysisId": str(analysis_id or ""),
        "status": IN_PROGRESS,
        "startedAt": iniciado,
        "startedTs": int(t),
        "finishedAt": None,
        "country": str(country or ""),
        "documents": documentos or [],
        "warnings": [],
        "error": None,
        "result": None,
        "schemaVersion": str(schema_version or ""),
    }

    if not TABLA:
        with _cerrojo_memoria:
            viva = _viva_en_memoria(reg["pk"], t)
            if viva is not None:
                raise EnCurso(viva)
            _escribir(reg)
        return reg

    candado = {
        "pk": clave_candado(ambiente, company_id),
        "sk": SK_CANDADO,
        "analysisId": reg["analysisId"],
        "startedAt": iniciado,
        "startedTs": reg["startedTs"],
        "status": IN_PROGRESS,
        "ttl": int(t) + TTL_DIAS * 86400,
    }
    valores = {":en_curso": IN_PROGRESS, ":limite": _limite(t)}
    try:
        _transaccion([
            {"Put": {
                "Item": candado,
                "ConditionExpression": COND_CANDADO_LIBRE,
                "ExpressionAttributeNames": {"#st": "status"},
                "ExpressionAttributeValues": valores,
                # Si está tomado, DynamoDB devuelve el candado en la cancelación:
                # el `409` sale con los datos de la que corre sin otra lectura.
                "ReturnValuesOnConditionCheckFailure": "ALL_OLD",
            }},
            {"Put": {"Item": _item(reg), "ConditionExpression": COND_FILA_NUEVA}},
        ])
    except _Cancelada as c:
        if c.fallo(0):
            otro = c.item(0)
            raise EnCurso({"analysisId": otro.get("analysisId"),
                           "startedAt": otro.get("startedAt")}) from None
        # Se agotaron los reintentos por choques con otras transacciones: hay
        # registros simultáneos de esta empresa. Si alguno ya tomó el candado,
        # la respuesta correcta es el 409 con sus datos, no un 503.
        otro = _candado_tomado(candado["pk"], t)
        if otro is not None:
            raise EnCurso(otro) from None
        raise
    return reg


def _candado_tomado(pk_candado: str, t: float) -> dict | None:
    """La corrida que tiene el candado, si lo tiene y no caducó. Lectura fuerte:
    una eventual podría no ver el candado recién tomado."""
    it = _tabla().get_item(Key={"pk": pk_candado, "sk": SK_CANDADO}, ConsistentRead=True).get("Item")
    if not it or it.get("status") != IN_PROGRESS or int(it.get("startedTs") or 0) < _limite(t):
        return None
    return {"analysisId": it.get("analysisId"), "startedAt": it.get("startedAt")}


def _viva_en_memoria(pk: str, t: float) -> dict | None:
    for f in reversed(_memoria.get(pk, [])):
        if f.get("status") == IN_PROGRESS and not caducada(f, t):
            return dict(f)
    return None


def anular(reg: dict) -> bool:
    """Deshace un registro de inicio cuyo `202` no llegó a salir.

    Si después de registrar algo revienta, EP-1 responde `503` y el consumidor
    reintenta SIN cobrarle el intento al usuario. Dejar la corrida `IN_PROGRESS`
    contradiría ese `503`: EP-2 diría que algo corre, y el reintento chocaría con
    un `409` hasta el tope de caducidad.

    Solo borra si la corrida sigue `IN_PROGRESS` y es esta: si el trabajo llegó a
    cerrarla, lo que pasó se respeta. Best-effort —si falla, queda el tope—, y
    devuelve si se anuló.
    """
    if not TABLA:
        with _cerrojo_memoria:
            filas = _memoria.get(reg["pk"], [])
            for i, f in enumerate(filas):
                if f["sk"] == reg["sk"] and f.get("status") == IN_PROGRESS:
                    del filas[i]
                    return True
        return False

    pk_candado = f"{SEP}{SK_CANDADO}{SEP}{reg['pk']}"
    try:
        _transaccion([
            {"Delete": {
                "Key": {"pk": reg["pk"], "sk": reg["sk"]},
                "ConditionExpression": COND_ANULABLE,
                "ExpressionAttributeNames": {"#st": "status"},
                "ExpressionAttributeValues": {":en_curso": IN_PROGRESS, ":aid": reg["analysisId"]},
            }},
            {"Delete": {
                "Key": {"pk": pk_candado, "sk": SK_CANDADO},
                "ConditionExpression": COND_CANDADO_PROPIO,
                "ExpressionAttributeValues": {":aid": reg["analysisId"]},
            }},
        ])
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("no se pudo anular la corrida %s; la libera el tope: %s", reg.get("analysisId"), e)
        return False


def cerrar(
    ambiente: Any,
    company_id: Any,
    analysis_id: str,
    estado_final: str,
    *,
    avisos: list[dict] | None = None,
    error: dict | None = None,
    resultado: dict | None = None,
    ahora: float | None = None,
) -> dict | None:
    """Lleva la corrida a un estado terminal y suelta el candado. `None` si no se
    encontró o si ya no se puede cerrar.

    Un `estado_final` que no sea terminal se trata como `FAILED` en vez de
    guardarse: dejar una corrida en un estado que el contrato no define le
    daría al consumidor un valor contra el que no puede programar. Mismo criterio
    que ya usan `contrato.error` y `errores.error_http`.

    ── Una corrida que ya se informó FAILED no cambia más ──────────────────────
    Solo se cierra una corrida que sigue `IN_PROGRESS` y NO pasó el tope. Pasado
    el tope, EP-2 ya dijo `FAILED` y Onboarding ya le cobró el intento al
    usuario: si un proceso rezagado la llevara después a `COMPLETED`, el mismo
    análisis tendría dos finales. Es una condición de la escritura, no una
    lectura previa, así que tampoco se pisan dos cierres simultáneos.
    """
    t = ahora if ahora is not None else time.time()
    if estado_final not in TERMINALES:
        log.warning("estado final no válido (%s); se cierra como FAILED", estado_final)
        estado_final = FAILED

    try:
        reg = buscar(ambiente, company_id, analysis_id)
    except Exception as e:  # noqa: BLE001
        # `_leer_todas` propaga a propósito, para que una consulta de estado no
        # devuelva `NOT_STARTED` sobre algo que existe. Acá no: el análisis YA
        # terminó, y dejar reventar al worker no cierra la corrida ni recupera
        # nada. Queda `IN_PROGRESS` y la libera el tope de caducidad.
        log.warning("no se pudo leer la corrida %s para cerrarla: %s", analysis_id, e)
        return None

    if reg is None:
        # Que no esté significa que nadie registró el inicio, y eso es un fallo
        # del orden de escritura — el que la Fase 2 existe para no cometer.
        log.warning("se pidió cerrar una corrida que no está registrada: %s", analysis_id)
        return None

    reg = {
        **reg,
        "status": estado_final,
        "finishedAt": _ahora_iso(t),
        "warnings": avisos if avisos is not None else reg.get("warnings") or [],
        "error": error,
        # Lo que EP-3 devuelve. Se guarda ACÁ y no en `almacen` porque EP-3
        # pregunta por empresa y ambiente, que es la clave de este almacén; el
        # otro solo sabe responder por `analysisId`.
        #
        # NO incluye el texto de los documentos: son escrituras enteras, y una
        # fila de DynamoDB tiene un tope de 400 KB. Lo que entra es la ficha —
        # campos, metadatos por documento y personas—, que está acotada.
        "result": resultado if resultado is not None else reg.get("result"),
    }

    if not TABLA:
        with _cerrojo_memoria:
            actual = next((f for f in _memoria.get(reg["pk"], []) if f["sk"] == reg["sk"]), None)
            if actual is None or actual.get("status") != IN_PROGRESS or caducada(actual, t):
                log.warning("la corrida %s ya no se puede cerrar (cerrada o caducada)", analysis_id)
                return None
            _escribir(reg)
        return reg

    viva = {":en_curso": IN_PROGRESS, ":limite": _limite(t)}
    corrida = {"Put": {
        "Item": _item(reg),
        "ConditionExpression": COND_CORRIDA_VIVA,
        "ExpressionAttributeNames": {"#st": "status"},
        "ExpressionAttributeValues": viva,
    }}
    candado = {"Put": {
        "Item": {
            "pk": clave_candado(ambiente, company_id), "sk": SK_CANDADO,
            "analysisId": reg["analysisId"], "startedAt": reg.get("startedAt"),
            "startedTs": int(reg.get("startedTs") or 0), "status": estado_final,
            "ttl": int(t) + TTL_DIAS * 86400,
        },
        "ConditionExpression": COND_CANDADO_PROPIO,
        "ExpressionAttributeValues": {":aid": reg["analysisId"]},
    }}
    try:
        _transaccion([corrida, candado])
        return reg
    except _Cancelada as c:
        if c.fallo(0):
            log.warning("la corrida %s ya no se puede cerrar (cerrada o caducada)", analysis_id)
            return None
        if c.fallo(1):
            # El candado lo tiene otra corrida. Solo pasa con una corrida
            # registrada antes de que existieran los candados, durante el
            # despliegue: se cierra la fila sola, con la misma condición.
            try:
                _transaccion([corrida])
                return reg
            except Exception as e:  # noqa: BLE001
                log.warning("no se pudo cerrar la corrida %s: %s", analysis_id, e)
                return None
        log.warning("no se pudo cerrar la corrida %s: %s", analysis_id, c)
        return None
    except Exception as e:  # noqa: BLE001
        # Queda `IN_PROGRESS` y la libera el tope de caducidad.
        log.warning("no se pudo cerrar la corrida %s: %s", analysis_id, e)
        return None


def _item(reg: dict) -> dict:
    """La fila como se guarda en DynamoDB."""
    return {
        **{k: v for k, v in reg.items() if k not in ("documents", "warnings", "error", "result")},
        # Serializados: DynamoDB no acepta floats y los avisos y documentos
        # pueden traerlos. Convertirlos uno por uno sería frágil, y es el
        # mismo criterio que ya usa `almacen.guardar`.
        "documents": json.dumps(reg.get("documents") or [], ensure_ascii=False),
        "warnings": json.dumps(reg.get("warnings") or [], ensure_ascii=False),
        "error": json.dumps(reg.get("error"), ensure_ascii=False),
        "result": json.dumps(reg.get("result"), ensure_ascii=False),
        "ttl": int(time.time()) + TTL_DIAS * 86400,
    }


# ── Transacciones ───────────────────────────────────────────────────────────

class _Cancelada(Exception):
    """DynamoDB canceló la transacción. Dice qué paso falló y, si se pidió,
    trae el ítem que hizo fallar la condición."""

    def __init__(self, razones: list[dict]):
        super().__init__("transacción cancelada: " + ", ".join(r.get("Code", "?") for r in razones))
        self.razones = razones

    def fallo(self, i: int) -> bool:
        return i < len(self.razones) and self.razones[i].get("Code") == "ConditionalCheckFailed"

    def item(self, i: int) -> dict:
        crudo = self.razones[i].get("Item") if i < len(self.razones) else None
        if not crudo:
            return {}
        from boto3.dynamodb.types import TypeDeserializer
        d = TypeDeserializer()
        return {k: d.deserialize(v) for k, v in crudo.items()}


def _cliente():
    import boto3  # import perezoso, igual que `_tabla`
    return boto3.client("dynamodb")


def _transaccion(pasos: list[dict]) -> None:
    """`TransactWriteItems` con los ítems en tipos de Python.

    Reintenta solo `TransactionConflict` —otra transacción tocaba el mismo ítem
    en ese instante—; una condición que no se cumple se levanta como
    `_Cancelada`, y cualquier otra falla se propaga tal cual.
    """
    from boto3.dynamodb.types import TypeSerializer
    from botocore.exceptions import ClientError
    s = TypeSerializer()

    def bajo(d: dict) -> dict:
        return {k: s.serialize(v) for k, v in d.items()}

    items = []
    for paso in pasos:
        (op, cuerpo), = paso.items()
        cuerpo = {"TableName": TABLA, **cuerpo}
        for campo in ("Item", "Key", "ExpressionAttributeValues"):
            if campo in cuerpo:
                cuerpo[campo] = bajo(cuerpo[campo])
        items.append({op: cuerpo})

    for intento in range(INTENTOS_TRANSACCION):
        try:
            _cliente().transact_write_items(TransactItems=items)
            return
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                raise
            razones = e.response.get("CancellationReasons") or []
            if any(r.get("Code") == "ConditionalCheckFailed" for r in razones):
                raise _Cancelada(razones) from None
            if any(r.get("Code") == "TransactionConflict" for r in razones) \
                    and intento < INTENTOS_TRANSACCION - 1:
                time.sleep(0.05 * (2 ** intento) * random.uniform(0.5, 1.5))
                continue
            raise _Cancelada(razones) from None


def _escribir(reg: dict) -> None:
    """La escritura del modo memoria. En DynamoDB, el registro y el cierre van
    por `_transaccion`, cada uno con su condición; esto se llama con el cerrojo
    tomado."""
    filas = _memoria.setdefault(reg["pk"], [])
    for i, f in enumerate(filas):
        if f["sk"] == reg["sk"]:
            filas[i] = dict(reg)
            break
    else:
        filas.append(dict(reg))
    filas.sort(key=lambda f: f["sk"])


# ── Lectura ─────────────────────────────────────────────────────────────────

def _leer_todas(ambiente: Any, company_id: Any, limite: int = 50) -> list[dict]:
    """El historial de una empresa, de la más reciente a la más vieja."""
    pk = clave(ambiente, company_id)
    if not TABLA:
        return [dict(f) for f in reversed(_memoria.get(pk, []))][:limite]
    try:
        from boto3.dynamodb.conditions import Key
        r = _tabla().query(
            KeyConditionExpression=Key("pk").eq(pk),
            ScanIndexForward=False,   # de la más reciente hacia atrás
            Limit=limite,
        )
        return [_deserializar(it) for it in r.get("Items", [])]
    except Exception as e:  # noqa: BLE001
        # Devolver vacío haría pasar por `NOT_STARTED` una corrida que existe, y
        # el consumidor volvería a analizar y a cobrar. Se propaga para que quien
        # llama responda `SERVICE_UNAVAILABLE` y no una mentira.
        log.warning("no se pudo leer el historial de %s: %s", pk, e)
        raise


def _deserializar(it: dict) -> dict:
    fuera = dict(it)
    for campo, vacio in (("documents", []), ("warnings", []), ("error", None), ("result", None)):
        v = fuera.get(campo)
        if isinstance(v, str):
            try:
                fuera[campo] = json.loads(v)
            except (ValueError, TypeError):
                fuera[campo] = vacio
    for campo in ("startedTs",):
        if campo in fuera and fuera[campo] is not None:
            fuera[campo] = int(fuera[campo])
    return fuera


def historial(ambiente: Any, company_id: Any, limite: int = 20) -> list[dict]:
    """Las corridas de una empresa en un ambiente, de la más reciente a la más vieja."""
    return _leer_todas(ambiente, company_id, limite)


def ultima(ambiente: Any, company_id: Any) -> dict | None:
    """La corrida más reciente, o `None` si la empresa no tiene ninguna."""
    filas = _leer_todas(ambiente, company_id, limite=1)
    return filas[0] if filas else None


def buscar(ambiente: Any, company_id: Any, analysis_id: str) -> dict | None:
    """Una corrida puntual por su id.

    Recorre el historial de esa empresa en vez de pedir la clave completa. Es una
    consulta más, y se paga a propósito: la alternativa es que quien cierra tenga
    que acarrear el `sk` a través de una invocación asíncrona, y si se pierde en
    el camino la corrida queda colgada en `IN_PROGRESS`.
    """
    aid = str(analysis_id or "")
    if not aid:
        return None
    for f in _leer_todas(ambiente, company_id, limite=50):
        if f.get("analysisId") == aid:
            return f
    return None


def caducada(reg: dict, ahora: float | None = None) -> bool:
    """¿Esta corrida `IN_PROGRESS` quedó abandonada?"""
    if reg.get("status") != IN_PROGRESS:
        return False
    t = ahora if ahora is not None else time.time()
    return (t - int(reg.get("startedTs") or 0)) > TOPE_EN_CURSO_S


def en_curso(ambiente: Any, company_id: Any, ahora: float | None = None) -> dict | None:
    """La corrida viva de esa empresa, si la hay. Es lo que decide el `409`.

    Una `IN_PROGRESS` más vieja que el tope NO cuenta: el proceso que la abrió ya
    no existe, y seguir devolviendo `409` sobre ella dejaría a la empresa
    bloqueada para siempre.
    """
    for f in _leer_todas(ambiente, company_id, limite=10):
        if f.get("status") == IN_PROGRESS and not caducada(f, ahora):
            return f
    return None


def estado(ambiente: Any, company_id: Any, ahora: float | None = None) -> str:
    """El estado que responde EP-2. `NOT_STARTED` si la empresa no tiene corridas.

    Una corrida caducada se reporta `FAILED` y no `IN_PROGRESS`: decir que sigue
    procesando algo que murió deja al consumidor esperando un resultado que no va
    a llegar nunca. **No se reescribe la fila** — el estado guardado es lo que
    pasó; esto es cómo se lee hoy.
    """
    u = ultima(ambiente, company_id)
    if u is None:
        return NOT_STARTED
    if caducada(u, ahora):
        return FAILED
    return str(u.get("status") or NOT_STARTED)


def disponible() -> bool:
    """¿Hay almacén persistente? Se reporta en `/salud` para que no haya que
    adivinar si el historial sobrevive a la invocación."""
    return bool(TABLA)


def _reiniciar_memoria() -> None:
    """Solo para los tests."""
    _memoria.clear()
