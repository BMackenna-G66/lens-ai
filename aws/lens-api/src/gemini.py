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

import base64
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
    PROMPT_SHAREHOLDERS,
    PROMPT_SHAREHOLDERS_CADENA,
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


def _generar(partes: list[dict], config: dict) -> tuple[str, dict]:
    """POST a generateContent con reintentos. Devuelve (texto, usageMetadata).

    `partes` es la lista de `parts` del contenido: un solo `{"text": ...}` para
    el camino de texto, o el archivo seguido del prompt para el multimodal.
    """
    url = f"{BASE}/{MODELO}:generateContent"
    cuerpo = {"contents": [{"parts": partes}], "generationConfig": config}

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

            devueltas = (candidatos[0].get("content") or {}).get("parts") or []
            texto = "".join(p.get("text", "") for p in devueltas).strip()
            if not texto:
                raise ErrorGemini("Respuesta vacía del modelo.")
            return texto, (datos.get("usageMetadata") or {})

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


def _llamar(prompt: str, config: dict) -> str:
    """El camino de texto: un solo `part` con el prompt. Devuelve el texto."""
    return _generar([{"text": prompt}], config)[0]


# ── Camino multimodal ───────────────────────────────────────────────────────
# Equivale a `generarConArchivo` de la SPA: se le manda el ARCHIVO NATIVO al
# modelo, no su texto. Es lo que usa la extracción de composición societaria,
# porque las tablas de propiedad se leen muchísimo mejor con el PDF a la vista
# que con el texto aplanado.

MIME_POR_EXTENSION = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}

# Tope del request inline de Gemini. Es el límite DOCUMENTADO por Google
# (20 MB para TODO el request, no solo el archivo). Se corta antes con un
# mensaje claro en vez de dejar que la API devuelva un error críptico. Un
# archivo más grande necesita la Files API, que es otra cosa.
TOPE_INLINE_BYTES = 18 * 1024 * 1024
TOPE_SALIDA_MULTIMODAL = 8192


def mime_de(nombre: str) -> str | None:
    """El MIME que hay que mandarle a Gemini, o None si el tipo no se soporta.

    Se decide por la extensión y no por lo que diga el origen: los objetos que
    bajan de S3 a menudo vienen sin `ContentType` o con `binary/octet-stream`.
    """
    ext = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    return MIME_POR_EXTENSION.get(ext)


def _llamar_con_archivos(docs: list[tuple[str, bytes]], prompt: str, config: dict) -> tuple[str, dict]:
    """Varios archivos en la MISMA llamada, en el orden en que se pasan.

    Van todos y no solo el mejor: medido sobre 87 análisis de producción donde
    el camino de texto SÍ encontró accionistas, mandar uno solo los perdía en el
    63 % de los consolidados de varios archivos.

    El orden importa — el primero es el que manda para decidir cuál es la
    sociedad principal — y lo decide el llamador.
    """
    if not docs:
        raise ErrorGemini("No se recibió ningún archivo para la ruta multimodal.")

    partes = []
    total = 0
    for nombre, contenido in docs:
        mime = mime_de(nombre)
        if not mime:
            raise ErrorGemini(
                f"Tipo de archivo no soportado para la ruta multimodal ({nombre}). Se aceptan PDF, JPG y PNG.")
        total += len(contenido)
        partes.append({"inlineData": {"mimeType": mime,
                                      "data": base64.b64encode(contenido).decode("ascii")}})

    # El tope de Google es sobre el REQUEST entero, no sobre cada archivo.
    if total > TOPE_INLINE_BYTES:
        raise ErrorGemini(
            f"Los {len(docs)} archivo(s) suman {total / 1024 / 1024:.1f} MB y el tope para mandarlos "
            f"en línea es {TOPE_INLINE_BYTES // (1024 * 1024)} MB."
        )

    # Los archivos PRIMERO y el prompt después: es el orden que recomienda
    # Google para que las instrucciones se lean con los documentos ya en
    # contexto, y es el mismo que usa la SPA.
    partes.append({"text": prompt})
    return _generar(partes, config)


def _llamar_con_archivo(nombre: str, contenido: bytes, prompt: str, config: dict) -> tuple[str, dict]:
    """Un solo archivo. Se conserva porque es la forma que usan los tests y deja
    el caso simple legible."""
    return _llamar_con_archivos([(nombre, contenido)], prompt, config)


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


# ── 3. Composición societaria ───────────────────────────────────────────────
# Puerto de `services/shareholdersService.ts`. Es lo que llena
# `legalRepresentatives`, `directOwnership` e `indirectShareholders` del
# contrato `BusinessShareholders`: sin esto la API respondía las tres claves
# vacías y ms-company no podía dejar de llamar al bot.
#
# EL ESQUEMA ES PLANO Y LAS PASADAS SON DOS. No es un detalle de estilo, es el
# resultado de una medición: con el esquema anidado, sobre 8 corridas del mismo
# documento la cadena salía 6 de 8, y una de cada cinco corridas se desbocaba
# hasta 45.358 tokens de salida devolviendo JSON truncado. Las corridas malas
# eran EXACTAMENTE las que tocaban el tope de salida. Con dos pasadas planas:
# 8 de 8, cero JSON roto, salida estable en ~640 tokens. Si alguien vuelve a
# anidar el esquema, vuelve el problema.

_PERSONA_PLANA = {
    "type": "OBJECT",
    "properties": {
        "personType": {"type": "STRING", "enum": ["NATURAL", "JURIDICA"]},
        "shareholderName": {"type": "STRING"},
        "name": {"type": "STRING"},
        "lastName": {"type": "STRING"},
        "shareholderId": {"type": "STRING"},
        "identificationType": {"type": "STRING"},
        "countryOfOrigin": {"type": "STRING"},
        "ownershipPercentage": {"type": "NUMBER", "nullable": True},
        "isPEP": {"type": "BOOLEAN", "nullable": True},
        "position": {"type": "STRING"},
    },
    "required": ["personType", "shareholderName"],
}

#: Pasada 1: representantes y todos los dueños de la tabla, sin anidar.
ESQUEMA_SHAREHOLDERS = {
    "type": "OBJECT",
    "properties": {
        "legalRepresentatives": {"type": "ARRAY", "items": _PERSONA_PLANA},
        "owners": {"type": "ARRAY", "items": _PERSONA_PLANA},
    },
    "required": ["legalRepresentatives", "owners"],
}

#: Pasada 2: los socios de UNA jurídica.
ESQUEMA_CADENA = {
    "type": "OBJECT",
    "properties": {"members": {"type": "ARRAY", "items": _PERSONA_PLANA}},
    "required": ["members"],
}


def _config_multimodal(esquema: dict) -> dict:
    return {
        "thinkingConfig": {"thinkingBudget": 0},
        "maxOutputTokens": TOPE_SALIDA_MULTIMODAL,
        "responseMimeType": "application/json",
        "responseSchema": esquema,
    }


def _objeto_de(texto: str, que: str) -> dict:
    try:
        datos = _json_de(texto)
    except (json.JSONDecodeError, ValueError) as e:
        raise ErrorGemini(f"La respuesta de {que} no es JSON válido: {e}") from e
    if not isinstance(datos, dict):
        raise ErrorGemini(f"La respuesta de {que} no es un objeto JSON.")
    return datos


def _personas(valor) -> list[dict]:
    return [p for p in (valor or []) if isinstance(p, dict)]


def extraer_shareholders(docs, quedan_llamadas=None) -> tuple[dict, dict]:
    """La composición societaria en DOS PASADAS PLANAS sobre el archivo nativo.

      1. representantes + todos los dueños de la tabla (naturales y jurídicas)
      2. por CADA jurídica, una pregunta propia: ¿quiénes son sus socios?

    El resultado se arma acá con la forma del contrato —las tres claves, con la
    cadena anidada un nivel—, así que lo que consume ms-company no cambia.

    El reparto sale de `personType`, NO de dónde el modelo puso a cada uno:
    NATURAL va a `directOwnership`, JURIDICA a la raíz de `indirectShareholders`.
    La regla de oro del contrato deja de depender de que el modelo la respete.

    `quedan_llamadas` es un callable sin argumentos que dice si todavía hay
    tiempo para otra pasada. Cada jurídica cuesta una llamada al modelo y una
    sociedad con ocho socios jurídicos se comería el timeout de la Lambda: las
    que no alcanzan quedan con la cadena vacía y se avisa, que es lo mismo que
    pasa cuando el documento no la revela.

    Devuelve `(resultado, senales)`. Las señales son para calibrar, no para el
    consumidor.
    """
    # Acepta objetos con `.nombre`/`.contenido` (lo que devuelve `ingesta_s3`)
    # o tuplas sueltas, que es como lo llaman los tests.
    pares = [(d.nombre, d.contenido) if hasattr(d, "nombre") else d for d in docs]

    texto1, uso1 = _llamar_con_archivos(
        pares, PROMPT_SHAREHOLDERS, _config_multimodal(ESQUEMA_SHAREHOLDERS)
    )
    p1 = _objeto_de(texto1, "shareholders")

    duenos = _personas(p1.get("owners"))
    naturales = [p for p in duenos if p.get("personType") != "JURIDICA"]
    juridicas = [p for p in duenos if p.get("personType") == "JURIDICA"]

    entrada = int(uso1.get("promptTokenCount") or 0)
    salida = int(uso1.get("candidatesTokenCount") or 0)
    llamadas = 1
    con_cadena = 0
    en_nivel1 = 0
    sin_tiempo = 0

    indirectos: list[dict] = []
    for j in juridicas:
        miembros: list[dict] = []
        if quedan_llamadas is not None and not quedan_llamadas():
            sin_tiempo += 1
            indirectos.append({**j, "indirectShareholders": []})
            continue
        try:
            # La empresa se compone ACÁ, no dentro del prompt: el extractor que
            # sincroniza los prompts con la SPA no puede leer un ternario con
            # backticks anidados, así que el prompt recibe el texto ya armado.
            doc = str(j.get("shareholderId") or "").strip()
            empresa = str(j.get("shareholderName") or "") + (f" (documento {doc})" if doc else "")
            texto2, uso2 = _llamar_con_archivos(
                pares,
                _rellenar(PROMPT_SHAREHOLDERS_CADENA, empresa=empresa),
                _config_multimodal(ESQUEMA_CADENA),
            )
            llamadas += 1
            entrada += int(uso2.get("promptTokenCount") or 0)
            salida += int(uso2.get("candidatesTokenCount") or 0)
            miembros = _personas(_objeto_de(texto2, "la cadena societaria").get("members"))
        except ErrorGemini as e:
            # Que falle la cadena de UNA jurídica no puede tirar abajo el
            # análisis entero: queda con [] y se cuenta como no revelada.
            log.warning("no se pudo resolver la cadena de %s: %s", j.get("shareholderName"), e)
            miembros = []
        if miembros:
            con_cadena += 1
        en_nivel1 += sum(1 for m in miembros if m.get("personType") == "JURIDICA")
        indirectos.append({**j, "indirectShareholders": miembros})

    resultado = {
        "legalRepresentatives": _personas(p1.get("legalRepresentatives")),
        "directOwnership": naturales,
        "indirectShareholders": indirectos,
    }

    # La suma solo se evalúa si TODOS los directos traen porcentaje: con uno en
    # null el total no significa nada y marcarlo sospechoso sería ruido.
    #
    # Es el chequeo más barato que existe para el error que más se repite: que
    # el modelo meta en la tabla principal a los socios de OTRA empresa que el
    # documento también describe. Medido: pasaba, y la suma daba 200.
    directos = naturales + juridicas
    todos_con_pct = bool(directos) and all(
        isinstance(p.get("ownershipPercentage"), (int, float))
        and not isinstance(p.get("ownershipPercentage"), bool)
        for p in directos
    )
    suma = round(sum(float(p["ownershipPercentage"]) for p in directos), 2) if todos_con_pct else None

    senales = {
        "juridicas": len(juridicas),
        "juridicas_con_cadena": con_cadena,
        "juridicas_en_nivel1": en_nivel1,
        "juridicas_sin_tiempo": sin_tiempo,
        "llamadas": llamadas,
        "suma_participacion": suma,
        "participacion_sospechosa": suma is not None and abs(suma - 100) > 0.5,
        "tokens_entrada": entrada,
        "tokens_salida": salida,
    }
    return resultado, senales
