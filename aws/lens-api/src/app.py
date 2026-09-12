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
import re
import time
from urllib.parse import urlparse

import extraccion
import contrato
import almacen
import ingesta_s3
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


def _analyses(evento: dict, ruta: str, metodo: str) -> dict:
    """`POST /v1/analyses` y `GET /v1/analyses/{analysisId}`.

    Los errores de este contrato viajan con **HTTP 200** y el statusCode real en
    el cuerpo: es como responde el bot que se reemplaza, y el consumidor lo lee
    de ahí. Devolver un 400 de verdad rompería a quien ya está integrado.
    """
    # GET: solo devuelve lo guardado. Nunca analiza.
    if metodo == "GET":
        analysis_id = ruta.rsplit("/", 1)[-1]
        if not analysis_id or analysis_id == "analyses":
            return _resp(200, contrato.error("MISSING_FOLDER_PATH", "Falta el analysisId en la ruta."))
        guardado = almacen.leer(analysis_id)
        if guardado is None:
            return _resp(200, contrato.error("NO_DOCUMENTS_FOUND", f"No hay un análisis guardado con id {analysis_id}."))
        return _resp(200, guardado)

    if metodo != "POST":
        return _resp(200, contrato.error("AWS_ERROR", f"{metodo} no permitido en /v1/analyses."))

    try:
        cuerpo = json.loads(evento.get("body") or "{}")
        if not isinstance(cuerpo, dict):
            raise ValueError("el cuerpo no es un objeto")
    except Exception as e:  # noqa: BLE001
        return _resp(200, contrato.error("AWS_ERROR", f"No se pudo leer la petición: {e}"))

    # `session_id` viaja de ida y vuelta SIN interpretarse: el consumidor lo usa
    # para correlacionar con su WebSocket.
    session_id = str(cuerpo.get("session_id") or cuerpo.get("sessionId") or "")
    analysis_id = str(cuerpo.get("analysisId") or cuerpo.get("analysis_id") or "").strip()

    # ── Idempotencia ──────────────────────────────────────────────────────
    # El contrato dice que ms-company genera el UUID justamente para esto. Un
    # segundo POST con el mismo id devuelve lo guardado y NO vuelve a analizar
    # ni a cobrar tokens. El session_id SÍ se refresca: la segunda llamada puede
    # venir de otra sesión del consumidor.
    if analysis_id:
        guardado = almacen.leer(analysis_id)
        if guardado is not None:
            if session_id:
                guardado = {**guardado, "session_id": session_id}
            return _resp(200, guardado)

    motivo = contrato.validar_entrada(cuerpo)
    if motivo:
        return _resp(200, contrato.error(motivo, "Falta folderPath o files.", session_id))

    return _resp(200, _correr_analyses(cuerpo, analysis_id, session_id))


# Cuánto tiempo se le reserva a la composición societaria. Es la SEGUNDA
# extracción de la corrida: los 18 campos ya corrieron y el reloj de la Lambda
# sigue andando. Con el presupuesto agotado se devuelven las tres claves vacías
# con un aviso — que es una respuesta válida del contrato— en vez de dejar que
# AWS corte con un 502 sin cuerpo y el consumidor se quede sin nada.
MARGEN_SOCIOS_S = float(os.environ.get("MARGEN_SOCIOS_S", "35"))


# Cuál de los documentos se le manda al modelo, ordenado por qué tan probable es
# que sea la escritura. NO es "el primero soportado": medido en producción sobre
# 45 análisis multi-archivo de la SPA, en 4 (9 %) el primer PDF era una cédula
# teniendo la escritura al lado, y a esa cédula se le pedía la tabla de
# propiedad.
#
# El nombre lo pone quien sube los documentos y es estable. Un nombre sin señal
# queda en el medio: no hay con qué decidir y se respeta el orden de `ingesta_s3`,
# que ya es determinista.
#
# El certificado de cámara de comercio entra ALTO a propósito: en Colombia es la
# fuente canónica de la composición societaria, y el prompt de la cadena le dice
# al modelo que la busque justamente ahí.
#
# Mismo orden que `elegirDocumentoSocietario` en la SPA. Si cambia uno, cambian
# los dos: que las dos puntas elijan distinto sería peor que elegir mal.
_RANGO_DOC = [
    (re.compile(r"deeds|escritura|constituc", re.I), 0),                 # la escritura
    (re.compile(r"trade_chamber|c[aá]mara_?de_?comercio", re.I), 1),     # cámara de comercio
    (re.compile(r"complementary|anexo", re.I), 3),                       # anexos
    (re.compile(r"_id_document|legal_representative_document|c[eé]dula|pasaporte|\bdni\b",
                re.I), 4),                                               # identidad
]


def _rango_doc(nombre: str) -> int:
    for rx, n in _RANGO_DOC:
        if rx.search(nombre):
            return n
    return 2


def elegir_documentos(archivos, tope_bytes: int = gemini.TOPE_INLINE_BYTES) -> list:
    """Los documentos que se le mandan al modelo, en el orden en que los lee.

    Van TODOS los que pueda ver, no solo el mejor. Medido sobre 87 análisis de
    producción en los que el camino de texto SÍ encontró accionistas —o sea, el
    documento demostrablemente los tenía— la extracción estructurada los perdió
    en el 5 % de los de un archivo y en el **63 % de los consolidados de
    varios**: el camino de texto concatena todo y este mandaba uno.

    Se acota por peso acumulado porque el tope de Gemini es sobre el request
    entero. Como van ordenados, lo que queda afuera es lo menos parecido a una
    escritura. El primero entra siempre: si ni él cabe, que falle abajo con el
    mensaje de tamaño y no con una lista vacía, que se leería como «no había
    documentos».
    """
    nativos = [a for a in archivos if gemini.mime_de(a.nombre)]
    # El desempate es el orden de llegada, que `ingesta_s3` ya deja
    # determinista: dos corridas sobre la misma carpeta mandan lo mismo.
    ordenados = sorted(nativos, key=lambda a: (_rango_doc(a.nombre), nativos.index(a)))

    salida, acumulado = [], 0
    for a in ordenados:
        peso = len(a.contenido)
        if salida and acumulado + peso > tope_bytes:
            break
        salida.append(a)
        acumulado += peso
    return salida


def _extraer_socios(archivos, t0: float) -> tuple[dict, list[str]]:
    """La composición societaria de los documentos NATIVOS, no de su texto: las
    tablas de propiedad se leen mucho mejor con el PDF a la vista.

    Nunca lanza. Si algo falla, las tres claves quedan vacías y el motivo va en
    los avisos: la ficha de 18 campos ya está lista y perderla por esto sería
    peor que devolverla sin socios.
    """
    vacio = {"legalRepresentatives": [], "directOwnership": [], "indirectShareholders": []}

    docs = elegir_documentos(archivos)
    if not docs:
        return vacio, ["Ningún documento es PDF, JPG o PNG: no se extrajo la composición societaria."]

    def queda_tiempo() -> bool:
        return (time.monotonic() - t0) < (PRESUPUESTO_S - MARGEN_SOCIOS_S)

    if not queda_tiempo():
        return vacio, ["No quedó tiempo para extraer la composición societaria."]

    try:
        socios, senales = gemini.extraer_shareholders(docs, queda_tiempo)
    except gemini.ErrorGemini as e:
        return vacio, [f"No se pudo extraer la composición societaria ({e})."]
    except Exception as e:  # noqa: BLE001
        log.exception("fallo inesperado extrayendo la composición societaria")
        return vacio, [f"No se pudo extraer la composición societaria ({e})."]

    # Las señales van al log, no a la respuesta: son para calibrar el modelo,
    # no para el consumidor, que tiene su propio contrato.
    log.info("shareholders %s: %s", [d.nombre for d in docs], json.dumps(senales, ensure_ascii=False))

    avisos = []
    if senales["participacion_sospechosa"]:
        avisos.append(
            f"La participación de los dueños directos suma {senales['suma_participacion']} y no ~100: "
            "revisá si se mezcló la tabla de otra sociedad."
        )
    if senales["juridicas_sin_tiempo"]:
        avisos.append(
            f"{senales['juridicas_sin_tiempo']} sociedad(es) quedaron sin su cadena por falta de tiempo."
        )
    if senales["juridicas_en_nivel1"]:
        avisos.append(
            f"{senales['juridicas_en_nivel1']} socio(s) del segundo nivel son sociedades: "
            "la cadena sigue más abajo de lo que el contrato representa."
        )
    return socios, avisos


def _correr_analyses(cuerpo: dict, analysis_id: str, session_id: str) -> dict:
    """Resuelve S3, analiza y arma la respuesta del contrato."""
    import uuid
    t0 = time.monotonic()
    analysis_id = analysis_id or str(uuid.uuid4())

    folder_path = str(cuerpo.get("folderPath") or cuerpo.get("folder_path") or "").strip()
    archivos_pedidos = cuerpo.get("files") or []
    opciones = cuerpo.get("options") or {}

    try:
        import boto3
        s3 = boto3.client("s3")
    except Exception as e:  # noqa: BLE001
        return contrato.error("AWS_ERROR", f"No se pudo crear el cliente de S3: {e}", session_id)

    ing = ingesta_s3.ingerir(s3, folder_path=folder_path, archivos=archivos_pedidos)

    # Los dos casos que el bot distingue, y que NO son lo mismo:
    #   · la carpeta no tenía nada        → NO_DOCUMENTS_FOUND
    #   · tenía cosas y ninguna servía    → NO_VALID_FILES
    # Mezclarlos dejaría a quien depura sin saber si el path está mal o si los
    # archivos están mal nombrados.
    if not ing.archivos:
        motivo = "NO_VALID_FILES" if ing.vistos > 0 else "NO_DOCUMENTS_FOUND"
        return contrato.error(
            motivo,
            f"{ing.vistos} objeto(s) encontrados, {ing.descartados} descartados.",
            session_id, warnings=ing.avisos,
        )

    documentos = [(a.nombre, a.contenido) for a in ing.archivos]
    incluir_texto = bool(opciones.get("includeRawText"))
    try:
        resultado = analizar(documentos, incluir_texto, str(cuerpo.get("country") or ""))
    except Exception as e:  # noqa: BLE001
        log.exception("fallo en el análisis de /v1/analyses")
        return contrato.error("AWS_ERROR", f"Error interno durante el análisis: {e}", session_id,
                              warnings=ing.avisos)

    socios, avisos_socios = _extraer_socios(ing.archivos, t0)

    campos = {c["field"]: c["value"] for c in (resultado.get("campos") or [])}
    respuesta = contrato.respuesta(
        analysis_id=analysis_id,
        company={
            "companyId": str(cuerpo.get("companyId") or cuerpo.get("company_id") or ""),
            "companyName": campos.get("Razón Social", ""),
            "identification": campos.get("RUT de la sociedad", ""),
            "country": resultado.get("pais_detectado", ""),
            "constitutionDate": campos.get("Fecha de Constitución", ""),
            "capital": campos.get("Capital Social", ""),
        },
        legal_representatives=socios["legalRepresentatives"],
        direct_ownership=socios["directOwnership"],
        indirect_shareholders=socios["indirectShareholders"],
        economic_activities=[],
        raw_text=[d.get("texto", "") for d in (resultado.get("documentos") or [])] if incluir_texto else None,
        avisos=(ing.avisos + list(resultado.get("avisos") or []) + avisos_socios) or None,
        session_id=session_id,
    )
    almacen.guardar(analysis_id, respuesta)
    return respuesta


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
            # Si esto es false, la idempotencia de /v1/analyses NO persiste
            # entre invocaciones. Se expone para no tener que adivinarlo.
            "almacen_idempotencia": almacen.disponible(),
        })

    # ── Contrato BusinessShareholders (Fase 5) ─────────────────────────────
    # SE AGREGA. `/v1/analisis` sigue igual y sin cambios: es lo que permite
    # migrar a ms-company sin ventana de corte, con las dos rutas vivas.
    if ruta == "/v1/analyses" or ruta.startswith("/v1/analyses/"):
        if not _autorizado(evento):
            return _error(401, "Falta o no coincide el header x-api-secret.")
        return _analyses(evento, ruta, metodo)

    if ruta not in ("/v1/analisis",):
        return _error(404, f"Ruta no encontrada: {ruta}. Disponibles: GET /salud, POST /v1/analisis, POST /v1/analyses")
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
