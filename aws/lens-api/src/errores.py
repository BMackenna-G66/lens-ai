"""Catálogo de errores y avisos de LENS hacia Onboarding B2B (Fase 5 del plan).

Contra la especificación v1.2 (25-sep-2026) y el **Anexo B**, el catálogo de
`ErrorReason` de Global66 (484 entradas, verificado el 28-09-2026).

── Los tres canales, que NO son el mismo ───────────────────────────────────
Un integrador tiene que poder distinguir tres situaciones distintas, y el
contrato las trata por separado:

  1. **Error HTTP.** La petición no se pudo atender. Viaja en el `error` de la
     respuesta, con su código de estado.
  2. **Fallo de corrida.** La petición se aceptó (`202`), la corrida arrancó y
     terminó en `FAILED`. Viaja en el `error` de EP-2, con `reason` y `message`.
  3. **Aviso.** La corrida **siguió** y terminó, pero algo no salió como debía.
     Viaja en `warnings[]`, con `reason`, `objectKey` y `message`.

Confundir 2 con 3 es el error caro: un aviso convertido en fallo hace que
Onboarding descarte un análisis utilizable, y un fallo convertido en aviso le
hace guardar datos que no puede confiar.

── La regla que el plan marca como irrenunciable ───────────────────────────
*«El tiempo agotado y la caída del servicio llegan con motivos distintos. Para
Onboarding tienen la misma consecuencia —consumen intento— pero no el mismo
diagnóstico.»*

Por eso `GATEWAY_TIMEOUT` y `SERVICE_UNAVAILABLE` se mantienen separados aunque
del otro lado se manejen igual. La consecuencia es de quien consume; el
diagnóstico es de quien opera, y es lo único que permite saber si hay que subir
un timeout o levantar un servicio.

── Reusar antes que inventar ───────────────────────────────────────────────
Cada `reason` nuevo es una entrada más en un catálogo corporativo que ya tiene
484, y un pedido a Arquitectura que bloquea. Así que se adopta el nombre que ya
existe siempre que la situación sea la misma, y solo se pide lo que de verdad
no está.

Funciones PURAS: sin red, sin estado. Se testean solas.
"""

from __future__ import annotations

from typing import Any, NamedTuple


class Reason(NamedTuple):
    """Una entrada del catálogo.

    `code` y `http` solo los tienen las que vienen del Anexo B: son SU dato, y
    copiarlos mal es peor que no tenerlos. Las que LENS pide o define propias
    van sin código hasta que Arquitectura las asigne.
    """
    nombre: str
    http: int | None
    code: str | None
    descripcion: str
    #: `True` mientras Arquitectura no la haya dado de alta en el catálogo.
    pendiente: bool = False


# ══════════════════════════════════════════════════════════════════════════
# CANAL 1 · Error HTTP — la petición no se pudo atender
# ══════════════════════════════════════════════════════════════════════════
# Todas salen del Anexo B con su `code` y su `http_status` textuales. Si alguna
# vez el anexo cambia, el test de deriva lo caza.

HTTP: dict[str, Reason] = {
    r.nombre: r for r in (
        Reason("UNAUTHORIZED", 401, "000401",
               "Falta el `x-api-secret` o no coincide."),
        Reason("BAD_REQUEST", 400, "000400",
               "El cuerpo no cumple el contrato: falta un campo obligatorio o tiene un valor inválido."),
        Reason("NOT_FOUND", 404, "000404",
               "No hay un análisis utilizable para esa empresa y ambiente."),
        Reason("CONFLICT", 409, "000409",
               "Ya hay una corrida en curso para ese ambiente y empresa."),
        Reason("TOO_MANY_REQUESTS", 429, "000429",
               "Se superó la capacidad configurada de corridas simultáneas."),
        Reason("SERVICE_UNAVAILABLE", 503, "000503",
               "LENS no puede atender en este momento. Se puede reintentar."),
        Reason("GATEWAY_TIMEOUT", 504, "000504",
               "Se agotó el tiempo esperando a un servicio del que LENS depende."),
        Reason("INVALID_DOCUMENT_TYPE", 400, "000619",
               "El `documentType` declarado no es uno de los admitidos."),
        Reason("FILE_EXTENSION_NOT_SUPPORTED", 400, "032401",
               "La extensión del archivo no es una de las que LENS puede leer."),
        Reason("FILE_SIZE_NOT_IN_RANGE", 400, "032402",
               "El archivo excede el tamaño admitido, o está vacío."),
    )
}


# ══════════════════════════════════════════════════════════════════════════
# CANAL 2 · Fallo de corrida — arrancó y terminó en FAILED
# ══════════════════════════════════════════════════════════════════════════
# Acá están los `LENS_*`. Van con prefijo porque describen algo que solo pasa
# adentro de LENS: ningún otro servicio del catálogo lee escrituras.

FALLO: dict[str, Reason] = {
    r.nombre: r for r in (
        # ── Ya existe en el Anexo B: se ADOPTA, no se pide ──
        #
        # `DOCUMENT_TYPE_NOT_MATCH` (000612) dice, textual: «Error response when
        # document type does not match expected». Es exactamente nuestro caso —
        # se declaró un `documentType` y el documento resultó ser otra cosa— así
        # que pedir un `LENS_DOCUMENT_TYPE_MISMATCH` sería duplicar una entrada
        # que ya está. Un código menos que pedir es un bloqueo menos.
        Reason("DOCUMENT_TYPE_NOT_MATCH", None, "000612",
               "El documento no es del tipo declarado: se dijo escritura y llegó otra cosa."),

        # ── Hay que pedirlos: NO están en el Anexo B (verificado) ──
        Reason("LENS_DOCUMENT_DOWNLOAD_FAILED", None, None,
               "No se pudo descargar el documento desde S3: permiso, red o la clave no existe.",
               pendiente=True),
        Reason("LENS_DOCUMENT_NOT_READABLE", None, None,
               "El documento se descargó pero no se pudo leer: archivo corrupto, cifrado, "
               "o un escaneo sin texto recuperable.",
               pendiente=True),
        Reason("LENS_EXTRACTION_FAILED", None, None,
               "El documento se leyó pero la extracción no produjo un resultado utilizable.",
               pendiente=True),
        Reason("LENS_REQUIRED_DATA_MISSING", None, None,
               "Faltan datos sin los cuales el análisis no sirve: la razón social o el RUT "
               "de la sociedad.",
               pendiente=True),
    )
}


# ══════════════════════════════════════════════════════════════════════════
# CANAL 3 · Avisos — la corrida siguió, pero algo no salió bien
# ══════════════════════════════════════════════════════════════════════════
# Catálogo PROPIO de LENS. No van al Anexo B: no son errores, y meterlos ahí
# obligaría a Onboarding a distinguir por convención cuáles rompen y cuáles no.
#
# La diferencia con el canal 2 es la única que importa: acá el análisis SIRVE.
# Está incompleto o tiene una parte degradada, y se dice cuál.

AVISO: dict[str, Reason] = {
    r.nombre: r for r in (
        # ── Los cuatro del plan ──
        Reason("PARTIALLY_ILLEGIBLE", None, None,
               "Parte del documento no se pudo leer; lo que sigue salió del resto."),
        Reason("OCR_PAGE_LIMIT_REACHED", None, None,
               "El documento excede el límite de páginas que LENS procesa; se leyeron las primeras."),
        Reason("PERSON_TYPE_UNDETERMINED", None, None,
               "No se pudo determinar si una entidad es persona natural o jurídica; se omitió."),
        Reason("EXPECTED_DATA_MISSING", None, None,
               "Un dato que el documento debería traer no aparece."),

        # ── Tres más, que salieron de construir la Fase 6 ──
        #
        # No estaban en la lista del plan porque aparecieron al escribir la capa
        # de formato. Son distintos de `EXPECTED_DATA_MISSING` y la distinción
        # importa: ahí el dato NO ESTÁ; acá está y el problema es otro. Mandarlos
        # todos como "falta un dato" haría que quien lo reciba busque en el
        # documento algo que sí estaba.
        Reason("COUNTRY_NOT_IN_CATALOG", None, None,
               "El país existe en el documento pero no coincide con el Anexo A; se envía vacío."),
        Reason("DATE_FORMAT_UNPARSEABLE", None, None,
               "La fecha existe pero no se pudo interpretar con certeza; se envía vacía."),
        Reason("VALUE_TRUNCATED", None, None,
               "El valor estaba completo y se recortó al máximo que admite el contrato."),
    )
}


# ── Índices y utilidades ────────────────────────────────────────────────────

TODOS: dict[str, Reason] = {**HTTP, **FALLO, **AVISO}

#: Lo que hay que pedirle a Arquitectura. Es la lista, no una nota en un plan.
PENDIENTES: tuple[str, ...] = tuple(sorted(r.nombre for r in TODOS.values() if r.pendiente))


def error_http(nombre: str, mensaje: str = "", **extra: Any) -> tuple[int, dict]:
    """`(status, cuerpo)` para un error del canal 1.

    Un nombre desconocido cae en `SERVICE_UNAVAILABLE` en vez de inventar uno:
    el consumidor tiene una lista cerrada y un valor nuevo lo deja sin manejar.
    Es el mismo criterio que ya usa `contrato.error` con `AWS_ERROR`.
    """
    r = HTTP.get(nombre) or HTTP["SERVICE_UNAVAILABLE"]
    cuerpo: dict[str, Any] = {"reason": r.nombre, "message": mensaje or r.descripcion}
    cuerpo.update(extra)
    return (r.http or 503), {"error": cuerpo}


def fallo(nombre: str, mensaje: str = "", **extra: Any) -> dict:
    """El bloque `error` de una corrida que terminó en `FAILED` (canal 2)."""
    r = FALLO.get(nombre) or FALLO["LENS_EXTRACTION_FAILED"]
    return {"reason": r.nombre, "message": mensaje or r.descripcion, **extra}


def aviso(nombre: str, mensaje: str = "", object_key: str = "", **extra: Any) -> dict:
    """Una entrada de `warnings[]` (canal 3).

    `objectKey` viaja aunque esté vacío: el contrato lo define y un consumidor
    no tiene que defenderse de campos ausentes.
    """
    r = AVISO.get(nombre) or AVISO["EXPECTED_DATA_MISSING"]
    return {
        "reason": r.nombre,
        "objectKey": object_key,
        "message": mensaje or r.descripcion,
        **extra,
    }


def conocido(nombre: str) -> bool:
    """¿Este `reason` está en alguno de los tres canales?"""
    return nombre in TODOS
