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
import re
import time
from datetime import datetime, timezone
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
#: 15 minutos es el tope de una Lambda. Una corrida viva más que eso no está
#: viva.
TOPE_EN_CURSO_S = int(os.environ.get("CORRIDAS_TOPE_EN_CURSO_S", "900"))

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
    """Deja la corrida como `IN_PROGRESS` y devuelve el registro.

    **Se llama ANTES de responder el `202`.** No es una preferencia de diseño: si
    el `202` sale primero, la primera consulta del front puede ver `NOT_STARTED`,
    volver a mostrar la pantalla de carga y disparar un segundo procesamiento del
    mismo lote.

    El registro que devuelve trae `sk`, así que quien lo tenga puede cerrar la
    corrida sin buscarla.
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
        "schemaVersion": str(schema_version or ""),
    }
    _escribir(reg)
    return reg


def cerrar(
    ambiente: Any,
    company_id: Any,
    analysis_id: str,
    estado_final: str,
    *,
    avisos: list[dict] | None = None,
    error: dict | None = None,
    ahora: float | None = None,
) -> dict | None:
    """Lleva la corrida a un estado terminal. `None` si no se encontró.

    Un `estado_final` que no sea terminal se trata como `FAILED` en vez de
    guardarse: dejar una corrida en un estado que el contrato no define le
    daría al consumidor un valor contra el que no puede programar. Mismo criterio
    que ya usan `contrato.error` y `errores.error_http`.
    """
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
        "finishedAt": _ahora_iso(ahora),
        "warnings": avisos if avisos is not None else reg.get("warnings") or [],
        "error": error,
    }
    _escribir(reg)
    return reg


def _escribir(reg: dict) -> None:
    """Best-effort igual que `almacen.guardar`, con una diferencia que importa.

    Si falla el guardado de un cierre, la corrida queda `IN_PROGRESS` y el tope
    de caducidad la libera sola. Si falla el registro del inicio, el `409` no
    protege y dos corridas de la misma empresa pueden convivir. Las dos cosas se
    loguean en WARNING porque ninguna es visible de otra forma.
    """
    if not TABLA:
        filas = _memoria.setdefault(reg["pk"], [])
        for i, f in enumerate(filas):
            if f["sk"] == reg["sk"]:
                filas[i] = dict(reg)
                break
        else:
            filas.append(dict(reg))
        filas.sort(key=lambda f: f["sk"])
        return
    try:
        _tabla().put_item(Item={
            **{k: v for k, v in reg.items() if k not in ("documents", "warnings", "error")},
            # Serializados: DynamoDB no acepta floats y los avisos y documentos
            # pueden traerlos. Convertirlos uno por uno sería frágil, y es el
            # mismo criterio que ya usa `almacen.guardar`.
            "documents": json.dumps(reg.get("documents") or [], ensure_ascii=False),
            "warnings": json.dumps(reg.get("warnings") or [], ensure_ascii=False),
            "error": json.dumps(reg.get("error"), ensure_ascii=False),
            "ttl": int(time.time()) + TTL_DIAS * 86400,
        })
    except Exception as e:  # noqa: BLE001
        log.warning("no se pudo guardar la corrida %s: %s", reg.get("analysisId"), e)


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
    for campo, vacio in (("documents", []), ("warnings", []), ("error", None)):
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
