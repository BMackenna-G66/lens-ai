"""El `x-api-secret` de Onboarding, uno por ambiente, en Secrets Manager (Bloque 3).

── Los dos problemas que resuelve ─────────────────────────────────────────
1. **Se perdía.** El secreto vivía en una variable de entorno de la Lambda: cada
   deploy lo tenía que pasar a mano, y el del 31-08-2026 se perdió —nadie lo
   tenía—. En Secrets Manager queda guardado, con permisos, y sobrevive a los
   deploys.

2. **Una clave abría todos los ambientes.** Con un solo secreto, quien tiene la
   clave de `dev` manda `environment: prod` y escribe en producción: la
   separación dependía de que el que llama dijera la verdad. §14.1 pide «un
   secreto distinto por ambiente», y ahora cada clave abre SOLO el suyo.

── Lo que NO se rompe ──────────────────────────────────────────────────────
**Las rutas viejas no cambian.** `/v1/analisis` y `/v1/analyses` no tienen
ambiente y siguen con el secreto de siempre (`API_SECRET`). Esto aplica solo a
`/v1/companies/…`.

**La transición.** El secreto actual —el que Benjamín generó y probó— sigue
abriendo `/v1/companies/…` en cualquier ambiente mientras
`ACEPTAR_SECRETO_LEGADO` esté prendido, que es el default. Cuando Onboarding
tenga los tres nuevos se apaga, y desde ahí cada ambiente solo acepta su clave.

**La trampa.** Si la Lambda no pudiera leer Secrets Manager —un permiso que
falta, un ARN mal escrito—, sin respaldo `/v1/companies/…` respondería 401 a
TODO. Mientras dure la transición el respaldo es el secreto de siempre, y
`/salud` dice ambiente por ambiente si el secreto se pudo leer: esa es la señal
para apagar la transición, no una suposición.

Nunca se registra ni se devuelve el valor de un secreto: `/salud` solo dice
si se pudo leer.
"""

from __future__ import annotations

import hmac
import logging
import os
import time
from typing import Any

log = logging.getLogger()

AMBIENTES: tuple[str, ...] = ("dev", "ci", "prod")

#: El ARN del secreto de cada ambiente. Vacío = ese ambiente no tiene secreto
#: propio todavía, y solo lo abre el secreto de siempre (si la transición sigue).
ARNS: dict[str, str] = {
    a: os.environ.get(f"SECRETO_ARN_{a.upper()}", "").strip() for a in AMBIENTES
}

#: Si el secreto de siempre sigue abriendo `/v1/companies/…`. Prendido por
#: defecto: es lo que deja a Onboarding seguir funcionando hasta tener los nuevos.
ACEPTAR_LEGADO = os.environ.get("ACEPTAR_SECRETO_LEGADO", "true").strip().lower() in (
    "1", "true", "si", "sí")

#: Cuánto se guarda un secreto leído. Cinco minutos: lo bastante para no pedirlo
#: en cada request, y lo bastante corto para que una rotación llegue sola.
TTL_S = 300
#: Cuánto se recuerda que una lectura FALLÓ, para no martillar Secrets Manager
#: si está caído. Corto: apenas vuelve, tiene que volver a leerse.
TTL_FALLA_S = 30

_cache: dict[str, tuple[str | None, float]] = {}


def _cliente():
    import boto3  # import perezoso: no se paga en frío si no hay secretos
    return boto3.client("secretsmanager")


def secreto_de(ambiente: str, ahora: float | None = None) -> str | None:
    """El secreto vigente de ese ambiente, o `None` si no hay o no se pudo leer."""
    return desde_manager(ARNS.get(ambiente or ""), ambiente, ahora)


def desde_manager(secret_id: str, etiqueta: str = "", ahora: float | None = None) -> str | None:
    """El valor de un secreto de Secrets Manager, o `None` si no se pudo leer.

    `None` incluye el caso de un secreto que existe pero todavía NO TIENE VALOR:
    así nacen los que se cargan a mano (Bloque 3b), y quien llama tiene que
    seguir con su respaldo mientras tanto.
    """
    arn = (secret_id or "").strip()
    if not arn:
        return None
    t = ahora if ahora is not None else time.monotonic()
    if arn in _cache:
        valor, cuando = _cache[arn]
        if t - cuando < (TTL_S if valor else TTL_FALLA_S):
            return valor
    try:
        valor = (_cliente().get_secret_value(SecretId=arn).get("SecretString") or "").strip() or None
    except Exception as e:  # noqa: BLE001
        # El CÓDIGO de error de AWS —AccessDeniedException,
        # ResourceNotFoundException— dice qué arreglar y no trae datos. El
        # MENSAJE puede traer el ARN, así que no se escribe: un secreto no tiene
        # que aparecer ni de refilón en un log.
        codigo = ((getattr(e, "response", None) or {}).get("Error") or {}).get("Code")
        if codigo == "ResourceNotFoundException":
            # Un secreto sin valor todavía —recién creado, esperando la carga a
            # mano— responde así. No es un error: el respaldo lo cubre.
            log.info("el secreto de %s todavía no tiene valor; se usa el respaldo", etiqueta)
        else:
            log.error("no se pudo leer el secreto de %s (%s)", etiqueta, codigo or type(e).__name__)
        valor = None
    _cache[arn] = (valor, t)
    return valor


# ── Los dos secretos que todavía viven en variables de entorno (Bloque 3b) ───
# `GEMINI_API_KEY` y el `x-api-secret` de siempre. Pasan a Secrets Manager para
# que la Lambda pueda importarse a Terraform sin escribirlos en el estado: la
# convención de Arquitectura (iac-gereo/secrets.tf) es que Terraform maneja el
# CONTENEDOR y nunca el valor.
#
# Se leen por NOMBRE, no por ARN: el ARN de un secreto lleva un sufijo al azar
# que no se conoce hasta crearlo, y estos dos se crean vacíos, fuera del stack.
#
# Mientras no tengan valor, cada uno sigue con su variable de entorno. Con los dos
# cargados —`/salud` → `secretos_cargados`—, las variables se pueden sacar.
ID_GEMINI = os.environ.get("SECRETO_GEMINI_ID", "").strip()
ID_LEGADO = os.environ.get("SECRETO_LEGADO_ID", "").strip()


def cargados() -> dict[str, bool]:
    """Para `/salud`: si cada uno ya tiene valor en Secrets Manager. NUNCA el valor."""
    return {"gemini": bool(desde_manager(ID_GEMINI, "gemini")),
            "legado": bool(desde_manager(ID_LEGADO, "legado"))}


def autorizado_en(ambiente: str, presentado: Any, legado: str = "") -> bool:
    """¿Esta clave abre ESTE ambiente?

    Primero la del ambiente. Después, solo durante la transición, la de siempre.
    La comparación es de tiempo constante en los dos casos.
    """
    clave = str(presentado or "")
    if not clave:
        return False
    propio = secreto_de(ambiente)
    if propio and hmac.compare_digest(clave, propio):
        return True
    if ACEPTAR_LEGADO and legado and hmac.compare_digest(clave, legado):
        return True
    return False


def estado() -> dict[str, bool]:
    """Para `/salud`: ambiente por ambiente, si su secreto se pudo leer.

    NUNCA el valor. Es la señal para apagar la transición: con los tres en
    `true`, Secrets Manager responde y el secreto de siempre ya no hace falta.
    """
    return {a: bool(secreto_de(a)) for a in AMBIENTES}


def _reiniciar() -> None:
    """Solo para los tests."""
    _cache.clear()
