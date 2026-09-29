"""El disparo del procesamiento en segundo plano — Fase 2 del plan.

El problema que resuelve, en una línea: **un Lambda no puede seguir trabajando
después de responder.** Para devolver `202` y procesar detrás hace falta una
segunda invocación asíncrona. El plan lo dice y tiene razón: es infraestructura
nueva, no un cambio de handler.

── Por qué esto es un módulo y no dos líneas en `app.py` ───────────────────
Porque la infraestructura todavía no existe y el contrato hacia afuera no puede
esperar a que exista.

La invocación asíncrona necesita `lambda:InvokeFunction` sobre la propia función.
Eso es un permiso, y lo medido el 12-09-2026 es que cualquier `sam deploy` que
toque permisos con `compliance-admin` falla **y deja el stack trabado** — que es
exactamente el estado en el que están tres stacks de este proyecto.

Así que el disparo se abstrae en una decisión sola:

  · **asíncrono**  — hay permiso: se invoca y se responde `202` de inmediato.
  · **en línea**   — no hay: se procesa y recién después se responde `202`.

En los dos casos el consumidor ve lo mismo: un `202` con el `analysisId`, y el
estado de la corrida cambiando por su cuenta. Lo que cambia es CUÁNDO llega ese
`202`, no qué dice. El modo en línea es peor —la petición tarda lo que tarda el
análisis— pero es correcto, y permite construir y probar las Fases 2 a 4 sin
esperar a que se destrabe nada.

`disponible()` lo reporta en `/salud`, porque una promesa de `202` inmediato que
en realidad tarda tres minutos no se puede descubrir mirando la respuesta.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable

log = logging.getLogger()

#: Nombre de la función a invocar. Vacío = modo en línea.
#:
#: Se toma de `AWS_LAMBDA_FUNCTION_NAME` cuando no está seteada, que es la
#: variable que Lambda pone sola: así el día que exista el permiso, alcanza con
#: prender `DISPARO_ASINCRONO` y no hay que acordarse del nombre.
FUNCION = os.environ.get("DISPARO_FUNCION", "").strip() or os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "").strip()

#: Interruptor explícito. Apagado por defecto: encenderlo sin el permiso haría
#: que cada corrida falle en el disparo, y una corrida que no arranca es peor
#: que una que tarda.
ASINCRONO = os.environ.get("DISPARO_ASINCRONO", "false").strip().lower() in ("1", "true", "si", "sí")

#: La clave que marca un evento como «esto es el trabajo de fondo, no una
#: petición HTTP». Un nombre improbable a propósito: el handler lo mira antes
#: que la ruta, y confundirlo con un evento real sería ejecutar trabajo de fondo
#: a partir de algo que llegó por HTTP.
MARCA = "__lens_procesar__"


def disponible() -> bool:
    """¿El `202` sale antes de procesar, o después?"""
    return bool(ASINCRONO and FUNCION)


def disparar(carga: dict, en_linea: Callable[[dict], Any]) -> str:
    """Manda el trabajo al fondo. Devuelve `"asincrono"` o `"en_linea"`.

    `en_linea` es la función que hace el trabajo de verdad. Se recibe como
    parámetro y no se importa para que este módulo no dependa de `app`: al revés
    sería un ciclo, y además así el disparo se puede testear solo.

    Si la invocación asíncrona **falla**, se procesa en línea en vez de dar por
    perdida la corrida. Tarda, pero responde — que es el mismo criterio que ya
    usa `almacen.leer` cuando no puede leer: ante la duda, hacer el trabajo.
    """
    evento = {MARCA: True, "carga": carga}

    if disponible():
        try:
            import boto3
            boto3.client("lambda").invoke(
                FunctionName=FUNCION,
                InvocationType="Event",   # sin esto es síncrono y no sirve de nada
                Payload=json.dumps(evento, ensure_ascii=False).encode("utf-8"),
            )
            return "asincrono"
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo disparar en segundo plano (%s); se procesa en línea", e)

    en_linea(carga)
    return "en_linea"


def es_trabajo_de_fondo(evento: dict) -> dict | None:
    """La carga si este evento es un disparo de fondo, `None` si no.

    Se mira ANTES que la ruta. Un evento con la marca no viene de la Function
    URL —no tiene `requestContext`— así que tratarlo como petición HTTP lo
    mandaría a `/`, que responde `/salud`, y el trabajo no se haría nunca. En
    silencio.
    """
    if not isinstance(evento, dict) or not evento.get(MARCA):
        return None
    carga = evento.get("carga")
    return carga if isinstance(carga, dict) else {}
