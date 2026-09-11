"""Almacén de análisis para la idempotencia — Fase 5.

El contrato dice que ms-company genera el `analysisId` justamente para esto: un
segundo POST con el mismo id tiene que devolver lo guardado, **no volver a
analizar**. Hoy Lens no hace eso — genera su propio id y analiza siempre.

Por qué NO se guarda en Redshift
--------------------------------
Redshift es el warehouse y **el cluster se pausa de 18:30 a 04:00**. Un
`GET /v1/analyses/{id}` a las once de la noche devolvería error sobre algo que
sí analizamos. La idempotencia es operacional, no analítica: necesita un almacén
que esté siempre.

DynamoDB es el que corresponde, y ya es el patrón de la cuenta —
`compliance-redshift-reports` lo usa para sus corridas.

Lo analítico sigue yendo a `lens.*` por el camino de siempre. Son dos cosas
distintas y se guardan en dos lados distintos, a propósito.

Sin tabla configurada
---------------------
`ALMACEN_TABLA` vacío deja el almacén en modo memoria: sirve para los tests y
para correr en local, y **no promete idempotencia entre invocaciones**. Se avisa
en el log en vez de fingir que funciona, porque una idempotencia que se pierde
en silencio es peor que no tenerla.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

log = logging.getLogger()

TABLA = os.environ.get("ALMACEN_TABLA", "").strip()
# Cuánto vive un análisis guardado. 30 días: suficiente para que un reintento
# del consumidor encuentre lo suyo, y acotado para no guardar documentos
# societarios para siempre en una base operacional.
TTL_DIAS = int(os.environ.get("ALMACEN_TTL_DIAS", "30"))

_memoria: dict[str, dict] = {}


def _tabla():
    import boto3  # import perezoso: no se paga en frío si no hay tabla
    return boto3.resource("dynamodb").Table(TABLA)


def guardar(analysis_id: str, respuesta: dict) -> None:
    """Guarda la respuesta completa. Best-effort: si falla, no rompe el análisis
    —el consumidor ya recibió su resultado— pero sí queda en el log, porque
    significa que el próximo POST va a re-analizar y a cobrar de nuevo."""
    if not analysis_id:
        return
    if not TABLA:
        _memoria[analysis_id] = respuesta
        return
    try:
        _tabla().put_item(Item={
            "analysis_id": analysis_id,
            # Se guarda serializado: DynamoDB no acepta floats y la respuesta
            # trae porcentajes. Convertirlos uno por uno sería frágil.
            "respuesta": json.dumps(respuesta, ensure_ascii=False),
            "guardado_en": int(time.time()),
            "ttl": int(time.time()) + TTL_DIAS * 86400,
        })
    except Exception as e:  # noqa: BLE001
        log.warning("no se pudo guardar el análisis %s: %s", analysis_id, e)


def leer(analysis_id: str) -> dict | None:
    """La respuesta guardada, o None si no está.

    Si la lectura FALLA (permisos, tabla caída) devuelve None y lo dice en el
    log. Es deliberado: ante la duda se re-analiza, que cuesta plata pero
    responde. Devolver un error dejaría al consumidor sin nada."""
    if not analysis_id:
        return None
    if not TABLA:
        return _memoria.get(analysis_id)
    try:
        it = _tabla().get_item(Key={"analysis_id": analysis_id}).get("Item")
        if not it:
            return None
        return json.loads(it["respuesta"])
    except Exception as e:  # noqa: BLE001
        log.warning("no se pudo leer el análisis %s: %s", analysis_id, e)
        return None


def disponible() -> bool:
    """¿Hay almacén persistente? Se reporta en /salud para que no haya que
    adivinar si la idempotencia está realmente activa."""
    return bool(TABLA)


def _reiniciar_memoria() -> None:
    """Solo para los tests."""
    _memoria.clear()
