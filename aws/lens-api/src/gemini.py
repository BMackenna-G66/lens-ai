"""Las dos llamadas a Gemini que hace Lens: detectar país y extraer los 18 campos.

Equivale a `services/geminiService.ts`, contra la API REST en vez del SDK de JS.
Se replican a propósito tres cosas que definen el resultado, porque si cambian
la API deja de devolver lo mismo que la herramienta:

  · el modelo (`gemini-3.5-flash`),
  · `thinkingBudget: 0` — esto es extracción, no razonamiento,
  · el `responseSchema` con los nombres de campo restringidos por enumeración,
    que es lo que impide que el modelo invente un campo.

Y una cuarta que no está en el schema: la salida se **rellena** hasta los 18
campos con "No especificado". Quien consume no tiene que defenderse de campos
ausentes, igual que en la SPA.

Los prompts NO están acá: viven en `prompts_generado.py`, que se genera leyendo
`constants.ts`. Ver `scripts/generar_prompts.py`.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time

import requests

from prompts_generado import (
    CAMPOS_PREDEFINIDOS,
    CONTEXTO_POR_DEFECTO,
    CONTEXTO_POR_PAIS,
    PAISES,
    PROMPT_DETECCION_PAIS,
    PROMPT_EXTRACCION,
)

log = logging.getLogger(__name__)

MODELO = os.environ.get("GEMINI_MODELO", "gemini-3.5-flash")
BASE = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT_S = int(os.environ.get("GEMINI_TIMEOUT_S", "120"))

MAX_INTENTOS = 3
VALOR_AUSENTE = "No especificado"

# El texto que se le manda al modelo. 32k tokens ≈ 120k caracteres; se corta
# antes para dejar aire al prompt, que son varios miles de caracteres de
# instrucciones. Un recorte se avisa: nunca se manda medio documento en
# silencio.
MAX_CARACTERES = int(os.environ.get("GEMINI_MAX_CARACTERES", "300000"))


class ErrorGemini(Exception):
    """Falla de la llamada al modelo, ya traducida a castellano."""


# Misma clasificación que `executeWithRetry` en la SPA: reintentar la red y la
# sobrecarga, nunca una key inválida ni la cuota agotada.
def _es_permanente(msg: str) -> bool:
    return "api key not valid" in msg or "api_key_invalid" in msg or "quota" in msg


def _es_transitorio(msg: str) -> bool:
    return any(
        s in msg
        for s in (
            "failed to fetch", "networkerror", "connection", "timeout", "timed out",
            "overloaded", "unavailable", "429", "500", "502", "503", "504",
        )
    )


def _clave() -> str:
    k = os.environ.get("GEMINI_API_KEY", "").strip()
    if not k:
        raise ErrorGemini("No hay una API Key de Gemini configurada en el servicio.")
    return k


def _llamar(prompt: str, config: dict) -> str:
    """POST a generateContent con reintentos. Devuelve el texto de la respuesta."""
    url = f"{BASE}/{MODELO}:generateContent"
    cuerpo = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": config}

    ultimo = ""
    for intento in range(1, MAX_INTENTOS + 1):
        try:
            resp = requests.post(
                url,
                params={"key": _clave()},
                json=cuerpo,
                timeout=TIMEOUT_S,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code >= 400:
                raise ErrorGemini(f"{resp.status_code} {resp.text[:400]}")

            datos = resp.json()
            candidatos = datos.get("candidates") or []
            if not candidatos:
                # `promptFeedback.blockReason` aparece cuando el filtro de
                # seguridad bloqueó la entrada. Decirlo es mejor que "respuesta
                # vacía": el que integra necesita saber que no es un bug suyo.
                razon = (datos.get("promptFeedback") or {}).get("blockReason")
                raise ErrorGemini(f"El modelo no devolvió contenido{f' (bloqueado: {razon})' if razon else ''}.")

            partes = (candidatos[0].get("content") or {}).get("parts") or []
            texto = "".join(p.get("text", "") for p in partes).strip()
            if not texto:
                raise ErrorGemini("Respuesta vacía del modelo.")
            return texto

        except ErrorGemini as e:
            ultimo = str(e)
            m = ultimo.lower()
            if _es_permanente(m) or not _es_transitorio(m) or intento == MAX_INTENTOS:
                break
            time.sleep(intento * 1.2)                      # 1,2 s y 2,4 s, igual que la SPA
        except requests.RequestException as e:
            ultimo = str(e)
            if intento == MAX_INTENTOS:
                break
            time.sleep(intento * 1.2)

    bajo = ultimo.lower()
    if "api key not valid" in bajo or "api_key_invalid" in bajo:
        raise ErrorGemini("La API Key de Gemini no es válida.")
    if "quota" in bajo:
        raise ErrorGemini("Se excedió la cuota de la API de Gemini.")
    if _es_transitorio(bajo):
        raise ErrorGemini("No se pudo conectar con Gemini tras varios intentos (red o sobrecarga).")
    raise ErrorGemini(ultimo or "Error desconocido de la API de Gemini.")


def _rellenar(plantilla: str, **valores: str) -> str:
    """Sustituye los marcadores `{nombre}` de la plantilla.

    Se usa `replace` y NO `str.format`: el prompt de extracción trae llaves
    literales en el ejemplo de "Análisis de Facultades Específicas"
    (`{"compraVentaBienes": true, ...}`) y `format` las leería como marcadores
    y reventaría con KeyError.
    """
    salida = plantilla
    for nombre, valor in valores.items():
        marcador = "{" + nombre + "}"
        if marcador not in salida:
            raise ErrorGemini(f"El prompt generado no tiene el marcador {marcador}. Regenerá prompts_generado.py.")
        salida = salida.replace(marcador, valor)
    return salida


def _json_de(texto: str):
    """Saca el JSON de la respuesta aunque venga envuelto en un bloque de código.

    Con `responseMimeType: application/json` no debería hacer falta, pero la SPA
    lo hace y cuesta nada: una respuesta envuelta en ``` rompería el parseo.
    """
    t = texto.strip()
    m = re.match(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", t, re.S)
    if m:
        t = m.group(1).strip()

    i_llave, i_corchete = t.find("{"), t.find("[")
    if i_llave == -1 and i_corchete == -1:
        return json.loads(t)
    if i_llave == -1 or (i_corchete != -1 and i_corchete < i_llave):
        ini, cierre = i_corchete, "]"
    else:
        ini, cierre = i_llave, "}"
    fin = t.rfind(cierre)
    return json.loads(t[ini:fin + 1] if fin > ini else t)


# ── 1. Detección de país ────────────────────────────────────────────────────
def detectar_pais(texto: str) -> str:
    prompt = _rellenar(
        PROMPT_DETECCION_PAIS,
        lista_paises=", ".join(PAISES),
        texto_documento=texto[:MAX_CARACTERES],
    )
    crudo = _llamar(prompt, {"thinkingConfig": {"thinkingBudget": 0}})

    # Misma normalización que la SPA: el modelo a veces devuelve una bandera o
    # un prefijo de código de país.
    pais = re.sub(r"[^\w\s]", " ", crudo, flags=re.UNICODE).strip().lower()
    pais = re.sub(r"\s+", " ", pais)
    pais = re.sub(r"^cl\b\s*", "", pais).strip()
    return pais if pais in PAISES or pais == "unknown" else "unknown"


def contexto_de(pais: str) -> str:
    if pais in CONTEXTO_POR_PAIS:
        return CONTEXTO_POR_PAIS[pais]
    if pais in PAISES:
        return f"Estás analizando un documento legal de origen: {pais}. Traduce el contenido al español si es necesario."
    return CONTEXTO_POR_DEFECTO


# ── 2. Extracción de los 18 campos ──────────────────────────────────────────
ESQUEMA_CAMPOS = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            # La enumeración es lo que impide que el modelo invente un nombre
            # de campo. Sin esto la salida deja de ser comparable con la ficha
            # de la herramienta.
            "field": {"type": "STRING", "enum": CAMPOS_PREDEFINIDOS},
            "value": {"type": "STRING"},
        },
        "required": ["field", "value"],
    },
}


def extraer_campos(texto: str, contexto_pais: str) -> list[dict]:
    """Devuelve SIEMPRE los 18 campos, en el orden del catálogo."""
    prompt = _rellenar(
        PROMPT_EXTRACCION,
        contexto_pais=contexto_pais,
        texto_documento=texto[:MAX_CARACTERES],
    )
    crudo = _llamar(
        prompt,
        {
            "responseMimeType": "application/json",
            "responseSchema": ESQUEMA_CAMPOS,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    )

    try:
        datos = _json_de(crudo)
    except (json.JSONDecodeError, ValueError) as e:
        raise ErrorGemini(f"El modelo devolvió algo que no es JSON válido: {e}") from e

    if not isinstance(datos, list):
        raise ErrorGemini("El modelo no devolvió una lista de campos.")

    por_nombre = {
        str(d.get("field")): str(d.get("value", "")).strip()
        for d in datos
        if isinstance(d, dict) and d.get("field")
    }
    # El relleno: la salida siempre trae los 18, igual que en la SPA.
    return [{"field": c, "value": por_nombre.get(c) or VALOR_AUSENTE} for c in CAMPOS_PREDEFINIDOS]
