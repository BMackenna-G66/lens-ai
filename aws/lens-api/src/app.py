"""API de análisis documental de Lens — un endpoint, entra documento, sale JSON.

Qué es
------
El procesamiento de Lens expuesto por HTTP, para que cualquier sistema lo
incorpore. **La ingesta de documentos corre por cuenta de quien llama**: este
servicio no sabe de dónde salió el archivo, no lo guarda y no lo vuelve a
pedir. Recibe bytes y devuelve la misma ficha de 18 campos que produce la
herramienta.

Qué NO es
---------
No toca la SPA. Es un stack aparte, con su propio despliegue. Los prompts se
generan leyendo `constants.ts` en modo solo lectura (ver
`scripts/generar_prompts.py`), así que la herramienta queda intacta y aun así
las dos puntas usan el mismo texto.

Por qué es síncrono
-------------------
Con la capa de texto primero, un PDF digital se resuelve en segundos: no hay
OCR, solo la llamada al modelo. El async con cola y almacén de estado se
justifica cuando el trabajo tarda minutos de forma habitual, y con este orden
de lectura no es el caso.

Para el escaneo largo, que sí tarda, la respuesta **no se cuelga ni se cae**:
hay un presupuesto de tiempo y, cuando se agota, devuelve lo que alcanzó a leer
con `estado: "INCOMPLETO"` y el motivo en `avisos`. Es la misma semántica que
usa la cola KYB, y por eso un corte por tiempo nunca deja al cliente esperando
ni invalida lo que sí se pudo leer.

Rutas
-----
    GET  /salud          → estado del servicio, sin auth
    POST /v1/analisis    → análisis. Requiere el header `x-api-secret`

Exposición: Lambda Function URL, como las otras cuatro Lambdas del proyecto —
el rol `compliance-admin` no puede crear API Gateway. La protección real es el
header, no la infra.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import logging
import os
import time
from urllib.parse import urlparse

import extraccion
import gemini
from extraccion import Presupuesto, extraer_texto

logging.basicConfig()
log = logging.getLogger()
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

API_SECRET = os.environ.get("API_SECRET", "")

# Presupuesto de la corrida. Tiene que ser MENOR que el timeout de la Lambda,
# o el corte lo hace AWS con un 502 sin cuerpo en vez de devolver el resultado
# parcial. El margen paga la respuesta y el cierre de conexiones.
PRESUPUESTO_S = float(os.environ.get("PRESUPUESTO_S", "260"))

# Mismo tope que la cola KYB. Cada documento es lectura + su parte del prompt.
MAX_DOCUMENTOS = int(os.environ.get("MAX_DOCUMENTOS", "12"))

# Dominios desde los que se acepta descargar un documento por URL. Vacío =
# desactivado, que es el default: un servicio que baja cualquier URL que le
# manden es un SSRF con pasos extra.
DOMINIOS_URL = {d.strip().lower() for d in os.environ.get("DOMINIOS_URL_PERMITIDOS", "").split(",") if d.strip()}

MAX_BYTES_DOC = int(os.environ.get("MAX_BYTES_DOC", str(25 * 1024 * 1024)))


# ── Respuestas ──────────────────────────────────────────────────────────────
def _resp(codigo: int, cuerpo: dict) -> dict:
    return {
        "statusCode": codigo,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(cuerpo, ensure_ascii=False),
    }


def _error(codigo: int, mensaje: str, **extra) -> dict:
    log.warning("respuesta %s: %s", codigo, mensaje)
    return _resp(codigo, {"ok": False, "error": mensaje, **extra})


# ── Entrada ─────────────────────────────────────────────────────────────────
class EntradaInvalida(Exception):
    pass


def _cuerpo_bytes(evento: dict) -> bytes:
    crudo = evento.get("body") or ""
    if evento.get("isBase64Encoded"):
        return base64.b64decode(crudo)
    return crudo.encode("utf-8")


def _partes_multipart(cuerpo: bytes, content_type: str) -> list[tuple[str, bytes]]:
    """Parsea multipart/form-data con el parser de `email` de la stdlib.

    Se usa `email` y no `cgi` porque `cgi` está deprecado en 3.11 y eliminado en
    3.13: atarse a él sería heredar un problema con fecha.
    """
    from email import message_from_bytes

    msg = message_from_bytes(b"Content-Type: " + content_type.encode() + b"\r\nMIME-Version: 1.0\r\n\r\n" + cuerpo)
    if not msg.is_multipart():
        raise EntradaInvalida("El cuerpo no es un multipart/form-data válido.")

    salida: list[tuple[str, bytes]] = []
    for parte in msg.get_payload():
        nombre = parte.get_filename()
        if not nombre:
            continue                                  # campo de formulario, no archivo
        datos = parte.get_payload(decode=True)
        if datos:
            salida.append((nombre, datos))
    return salida


def _descargar(url: str) -> bytes:
    import requests

    p = urlparse(url)
    if p.scheme != "https":
        raise EntradaInvalida("Solo se aceptan URLs https.")
    if not DOMINIOS_URL:
        raise EntradaInvalida("La descarga por URL está desactivada en este servicio.")
    if (p.hostname or "").lower() not in DOMINIOS_URL:
        raise EntradaInvalida(f"El dominio {p.hostname} no está en la lista permitida.")

    r = requests.get(url, timeout=60, stream=True)
    r.raise_for_status()
    datos = r.raw.read(MAX_BYTES_DOC + 1, decode_content=True)
    if len(datos) > MAX_BYTES_DOC:
        raise EntradaInvalida(f"El documento supera el máximo de {MAX_BYTES_DOC // (1024 * 1024)} MB.")
    return datos


def _documentos_del_evento(evento: dict) -> tuple[list[tuple[str, bytes]], bool]:
    """Devuelve [(nombre, bytes)] y si el cliente pidió el texto crudo."""
    headers = {k.lower(): v for k, v in (evento.get("headers") or {}).items()}
    content_type = headers.get("content-type", "")
    cuerpo = _cuerpo_bytes(evento)

    if not cuerpo:
        raise EntradaInvalida("El cuerpo de la petición está vacío.")

    if content_type.startswith("multipart/form-data"):
        docs = _partes_multipart(cuerpo, content_type)
        incluir = str((evento.get("queryStringParameters") or {}).get("incluir_texto", "")).lower() == "true"
        return docs, incluir

    try:
        datos = json.loads(cuerpo)
    except json.JSONDecodeError as e:
        raise EntradaInvalida(f"El cuerpo no es JSON válido: {e}") from e
    if not isinstance(datos, dict):
        raise EntradaInvalida("Se esperaba un objeto JSON en el cuerpo.")

    entradas = datos.get("documentos")
    if not isinstance(entradas, list) or not entradas:
        raise EntradaInvalida('Falta "documentos": una lista con al menos un elemento.')

    docs: list[tuple[str, bytes]] = []
    for i, d in enumerate(entradas):
        if not isinstance(d, dict):
            raise EntradaInvalida(f"documentos[{i}] no es un objeto.")
        nombre = str(d.get("nombre") or f"documento-{i + 1}.pdf")

        if d.get("contenido_base64"):
            try:
                contenido = base64.b64decode(str(d["contenido_base64"]), validate=True)
            except (binascii.Error, ValueError) as e:
                raise EntradaInvalida(f'documentos[{i}].contenido_base64 no es base64 válido: {e}') from e
        elif d.get("url"):
            contenido = _descargar(str(d["url"]))
        else:
            raise EntradaInvalida(f'documentos[{i}] necesita "contenido_base64" o "url".')

        if len(contenido) > MAX_BYTES_DOC:
            raise EntradaInvalida(f"{nombre} supera el máximo de {MAX_BYTES_DOC // (1024 * 1024)} MB.")
        docs.append((nombre, contenido))

    return docs, bool(datos.get("incluir_texto"))


# ── El análisis ─────────────────────────────────────────────────────────────
def analizar(documentos: list[tuple[str, bytes]], incluir_texto: bool, pais_forzado: str = "") -> dict:
    """El pipeline completo: documentos → texto → país → 18 campos.

    Mismo orden que la herramienta. La diferencia está adentro del primer paso:
    acá la capa de texto va antes que el OCR.
    """
    t0 = time.monotonic()
    presupuesto = Presupuesto(limite_s=PRESUPUESTO_S)
    avisos: list[str] = []

    if len(documentos) > MAX_DOCUMENTOS:
        avisos.append(f"Se recibieron {len(documentos)} documentos y el tope es {MAX_DOCUMENTOS}: se analizaron los primeros.")
        documentos = documentos[:MAX_DOCUMENTOS]

    # ── 1. Texto ──
    leidos = [extraer_texto(nombre, contenido, presupuesto) for nombre, contenido in documentos]
    for r in leidos:
        avisos.extend(f"{r.nombre}: {a}" for a in r.avisos)

    textos = [r.texto for r in leidos if r.ok and r.texto]
    if not textos:
        return {
            "ok": False,
            "estado": "ERROR",
            "error": "No se pudo extraer texto de ningún documento.",
            "documentos": [r.a_dict() for r in leidos],
            "avisos": avisos,
            "duracion_ms": int((time.monotonic() - t0) * 1000),
        }

    texto = "\n\n".join(textos)

    # ── 2. País ──
    if pais_forzado:
        pais = pais_forzado.strip().lower()
    elif presupuesto.agotado(margen_s=20):
        pais = "unknown"
        avisos.append("No quedó tiempo para detectar el país: se analizó sin contexto de jurisdicción.")
    else:
        try:
            pais = gemini.detectar_pais(texto)
        except gemini.ErrorGemini as e:
            pais = "unknown"
            avisos.append(f"No se pudo detectar el país ({e}): se analizó sin contexto de jurisdicción.")

    # ── 3. Los 18 campos ──
    try:
        campos = gemini.extraer_campos(texto, gemini.contexto_de(pais))
    except gemini.ErrorGemini as e:
        return {
            "ok": False,
            "estado": "ERROR",
            "error": str(e),
            "pais_detectado": pais,
            "documentos": [r.a_dict() for r in leidos],
            "avisos": avisos,
            "duracion_ms": int((time.monotonic() - t0) * 1000),
        }

    # INCOMPLETO no es un fallo: es "se analizó y faltan cosas". El cliente
    # recibe la ficha igual y sabe exactamente qué no se pudo leer. ERROR queda
    # para "volvé a llamar", que es otra cosa.
    fallidos = [r for r in leidos if not r.ok]
    estado = "INCOMPLETO" if (fallidos or avisos) else "COMPLETO"

    salida = {
        "ok": True,
        "estado": estado,
        "pais_detectado": pais,
        "campos": campos,
        "documentos": [r.a_dict() for r in leidos],
        "avisos": avisos,
        "duracion_ms": int((time.monotonic() - t0) * 1000),
    }
    if incluir_texto:
        salida["texto_crudo"] = texto
    return salida


# ── Handler ─────────────────────────────────────────────────────────────────
def _autorizado(evento: dict) -> bool:
    if not API_SECRET:
        log.error("API_SECRET no está configurado: se rechaza todo.")
        return False
    headers = {k.lower(): v for k, v in (evento.get("headers") or {}).items()}
    return hmac.compare_digest(str(headers.get("x-api-secret", "")), API_SECRET)


def lambda_handler(evento: dict, contexto=None) -> dict:
    ctx = (evento.get("requestContext") or {}).get("http") or {}
    metodo = (ctx.get("method") or evento.get("httpMethod") or "GET").upper()
    ruta = (evento.get("rawPath") or ctx.get("path") or "/").rstrip("/") or "/"

    if metodo == "OPTIONS":
        return _resp(204, {})

    if ruta in ("/salud", "/") and metodo == "GET":
        return _resp(200, {
            "ok": True,
            "servicio": "lens-api",
            "modelo": gemini.MODELO,
            "motor_ocr": extraccion.MOTOR_OCR,
            "max_documentos": MAX_DOCUMENTOS,
            "max_paginas_ocr": extraccion.MAX_PAGINAS_OCR,
            "presupuesto_s": PRESUPUESTO_S,
        })

    if ruta != "/v1/analisis":
        return _error(404, f"Ruta no encontrada: {ruta}. Disponibles: GET /salud, POST /v1/analisis")
    if metodo != "POST":
        return _error(405, f"{metodo} no permitido en /v1/analisis. Usá POST.")
    if not _autorizado(evento):
        return _error(401, "Falta o no coincide el header x-api-secret.")

    try:
        documentos, incluir_texto = _documentos_del_evento(evento)
    except EntradaInvalida as e:
        return _error(400, str(e))
    except Exception as e:                                    # noqa: BLE001 — nunca 502 sin explicación
        log.exception("fallo leyendo la entrada")
        return _error(400, f"No se pudo leer la petición: {e}")

    if not documentos:
        return _error(400, "No se recibió ningún documento.")

    pais = str((evento.get("queryStringParameters") or {}).get("pais", "")).strip()

    try:
        resultado = analizar(documentos, incluir_texto, pais)
    except Exception as e:                                    # noqa: BLE001
        log.exception("fallo en el análisis")
        return _error(500, f"Error interno durante el análisis: {e}")

    return _resp(200 if resultado.get("ok") else 502, resultado)
