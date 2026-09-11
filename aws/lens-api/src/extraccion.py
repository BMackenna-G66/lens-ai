"""Documento → texto plano.

Es el reemplazo del `fileProcessorService.ts` de la SPA, no un port. La SPA no
se puede portar tal cual: rasteriza cada página con `document.createElement
('canvas')`, que es DOM y no existe en Lambda.

Y de paso arregla la deuda #1 del analizador: **la SPA aplica OCR siempre**,
incluso a los PDF que ya traen el texto adentro — y los del Conservador y las
notarías modernas lo traen. Acá el orden es al revés:

    1. capa de texto  → extracción EXACTA, sin error de reconocimiento, gratis
    2. OCR (Textract) → solo para las páginas que no tienen capa

La decisión es **por página**, no por documento. Una escritura digital con un
anexo escaneado usa capa de texto en las primeras y OCR solo en el anexo. Un
umbral por documento obligaría a elegir mal en ese caso.

Dependencias: `pypdf` (wheel pura, sin compilación nativa) y `boto3` (ya viene
en el runtime de Lambda). Mismo criterio que `casos-receptor`, así que
`sam build` funciona sin Docker.
"""

from __future__ import annotations

import io
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# Caracteres mínimos para considerar que una página TIENE capa de texto. Una
# página escaneada suele devolver 0; una con basura de encoding devuelve unos
# pocos. 40 separa "tiene texto" de "tiene ruido" sin descartar portadas cortas.
MIN_CHARS_CAPA = int(os.environ.get("MIN_CHARS_CAPA", "40"))

# Tope de páginas que se le mandan al OCR por documento. Mismo valor que usa la
# cola KYB: en una escritura la identidad —RUT, razón social, comparecencia,
# capital, objeto social— está al principio, y las últimas páginas son firmas y
# timbres. Las páginas CON capa de texto no cuentan contra este tope: son
# gratis.
MAX_PAGINAS_OCR = int(os.environ.get("MAX_PAGINAS_OCR", "15"))

# Motor de OCR. `textract` usa AWS Textract; `ninguno` desactiva el OCR y los
# escaneos vuelven con aviso en vez de con texto. Existe para poder desplegar
# antes de que Textract esté habilitado en la cuenta.
MOTOR_OCR = os.environ.get("MOTOR_OCR", "textract").strip().lower()

OCR_CONCURRENCIA = int(os.environ.get("OCR_CONCURRENCIA", "4"))

TIPOS_IMAGEN = {"png", "jpg", "jpeg", "tiff", "tif"}


@dataclass
class ResultadoTexto:
    """Lo que se pudo leer de UN documento, y cómo."""

    nombre: str
    texto: str = ""
    paginas_totales: int = 0
    paginas_leidas: int = 0
    paginas_por_capa: int = 0
    paginas_por_ocr: int = 0
    metodo: str = "desconocido"      # capa_texto | ocr | mixto | texto_plano | ninguno
    ok: bool = False
    avisos: list[str] = field(default_factory=list)

    def a_dict(self) -> dict:
        return {
            "nombre": self.nombre,
            "ok": self.ok,
            "metodo": self.metodo,
            "paginas_totales": self.paginas_totales,
            "paginas_leidas": self.paginas_leidas,
            "paginas_por_capa": self.paginas_por_capa,
            "paginas_por_ocr": self.paginas_por_ocr,
            "caracteres": len(self.texto),
            "avisos": self.avisos,
        }


class SinPresupuesto(Exception):
    """El tiempo asignado se agotó a mitad de la lectura."""


@dataclass
class Presupuesto:
    """Reloj compartido por toda la corrida.

    Sin esto, un escaneo de 60 páginas se come el timeout de la Lambda y el
    cliente recibe un 502 sin explicación. Con esto se devuelve lo que se
    alcanzó a leer, con el aviso de qué faltó — que es lo que hace la cola KYB
    y la razón por la que un corte por tiempo no invalida la corrida.
    """

    limite_s: float
    inicio: float = field(default_factory=time.monotonic)

    def restante(self) -> float:
        return self.limite_s - (time.monotonic() - self.inicio)

    def agotado(self, margen_s: float = 0.0) -> bool:
        return self.restante() <= margen_s


# ── OCR ─────────────────────────────────────────────────────────────────────
_textract = None


def _cliente_textract():
    global _textract
    if _textract is None:
        import boto3

        _textract = boto3.client("textract")
    return _textract


def _ocr_bytes(contenido: bytes) -> str:
    """Una llamada síncrona a Textract sobre UNA página o UNA imagen.

    `detect_document_text` es la operación barata (solo texto, sin formularios
    ni tablas) y la única que se necesita: el que interpreta la estructura es
    Gemini, después.

    Si AWS rechazara el PDF de una sola página en `Bytes`, el arreglo vive
    entero acá: subir a S3 y usar `start_document_text_detection`. Nada más del
    módulo cambia.
    """
    resp = _cliente_textract().detect_document_text(Document={"Bytes": contenido})
    lineas = [b.get("Text", "") for b in resp.get("Blocks", []) if b.get("BlockType") == "LINE"]
    return "\n".join(lineas).strip()


def _pagina_a_pdf(lector, indice: int) -> bytes:
    """Extrae UNA página como un PDF independiente, para mandarla al OCR."""
    from pypdf import PdfWriter

    escritor = PdfWriter()
    escritor.add_page(lector.pages[indice])
    buf = io.BytesIO()
    escritor.write(buf)
    return buf.getvalue()


# ── PDF ─────────────────────────────────────────────────────────────────────
def _leer_pdf(nombre: str, contenido: bytes, presupuesto: Presupuesto) -> ResultadoTexto:
    from pypdf import PdfReader

    r = ResultadoTexto(nombre=nombre)

    try:
        lector = PdfReader(io.BytesIO(contenido))
    except Exception as e:                                    # PDF corrupto o cifrado
        r.avisos.append(f"No se pudo abrir el PDF: {e}")
        return r

    if getattr(lector, "is_encrypted", False):
        # Muchos PDF del Conservador vienen con cifrado vacío: se abren con
        # contraseña "". Si no, no hay nada que hacer sin la clave.
        try:
            lector.decrypt("")
        except Exception:
            r.avisos.append("El PDF está protegido con contraseña.")
            return r

    r.paginas_totales = len(lector.pages)
    if r.paginas_totales == 0:
        r.avisos.append("El PDF no tiene páginas.")
        return r

    # ── Paso 1: capa de texto, página por página ──
    por_pagina: list[str | None] = []
    for i in range(r.paginas_totales):
        try:
            t = (lector.pages[i].extract_text() or "").strip()
        except Exception:
            t = ""
        por_pagina.append(t if len(t) >= MIN_CHARS_CAPA else None)

    r.paginas_por_capa = sum(1 for t in por_pagina if t is not None)
    sin_capa = [i for i, t in enumerate(por_pagina) if t is None]

    # ── Paso 2: OCR solo donde hace falta ──
    if sin_capa and MOTOR_OCR == "textract":
        a_ocrear = sin_capa[:MAX_PAGINAS_OCR]
        if len(sin_capa) > MAX_PAGINAS_OCR:
            # Se DICE. Un documento leído parcial que no lo declara es lo peor
            # que puede hacer una herramienta de compliance: quien revisa
            # decide creyendo que se miró todo.
            r.avisos.append(
                f"{len(sin_capa)} páginas sin capa de texto y el tope de OCR es "
                f"{MAX_PAGINAS_OCR}: se leyeron las primeras {len(a_ocrear)}."
            )

        def trabajo(i: int) -> tuple[int, str | None, str | None]:
            if presupuesto.agotado(margen_s=5):
                return i, None, "sin presupuesto"
            try:
                return i, _ocr_bytes(_pagina_a_pdf(lector, i)), None
            except Exception as e:
                return i, None, str(e)

        cortadas = 0
        with ThreadPoolExecutor(max_workers=OCR_CONCURRENCIA) as pool:
            for i, texto, err in pool.map(trabajo, a_ocrear):
                if texto:
                    por_pagina[i] = texto
                    r.paginas_por_ocr += 1
                elif err == "sin presupuesto":
                    cortadas += 1
                elif err:
                    r.avisos.append(f"OCR falló en la página {i + 1}: {err}")

        if cortadas:
            r.avisos.append(f"Se agotó el tiempo: {cortadas} página(s) quedaron sin leer.")

    elif sin_capa and MOTOR_OCR != "textract":
        r.avisos.append(
            f"{len(sin_capa)} página(s) sin capa de texto y el OCR está desactivado "
            f"(MOTOR_OCR={MOTOR_OCR}): ese contenido no se leyó."
        )

    leidas = [t for t in por_pagina if t]
    r.paginas_leidas = len(leidas)
    r.texto = "\n\n".join(leidas).strip()
    r.ok = bool(r.texto)

    if not r.ok:
        r.avisos.append("No se pudo extraer texto de ninguna página.")

    if r.paginas_por_capa and r.paginas_por_ocr:
        r.metodo = "mixto"
    elif r.paginas_por_ocr:
        r.metodo = "ocr"
    elif r.paginas_por_capa:
        r.metodo = "capa_texto"
    else:
        r.metodo = "ninguno"

    return r


# ── Imagen y texto plano ────────────────────────────────────────────────────
def _leer_imagen(nombre: str, contenido: bytes, presupuesto: Presupuesto) -> ResultadoTexto:
    r = ResultadoTexto(nombre=nombre, paginas_totales=1)

    if MOTOR_OCR != "textract":
        r.avisos.append(f"Es una imagen y el OCR está desactivado (MOTOR_OCR={MOTOR_OCR}).")
        return r
    if presupuesto.agotado(margen_s=5):
        r.avisos.append("Se agotó el tiempo antes de poder leer la imagen.")
        return r

    try:
        r.texto = _ocr_bytes(contenido)
    except Exception as e:
        r.avisos.append(f"OCR falló: {e}")
        return r

    r.ok = bool(r.texto)
    r.paginas_leidas = 1 if r.ok else 0
    r.paginas_por_ocr = r.paginas_leidas
    r.metodo = "ocr"
    if not r.ok:
        r.avisos.append("El OCR no detectó texto en la imagen.")
    return r


def _leer_texto_plano(nombre: str, contenido: bytes) -> ResultadoTexto:
    r = ResultadoTexto(nombre=nombre, paginas_totales=1, metodo="texto_plano")
    for enc in ("utf-8", "latin-1"):
        try:
            r.texto = contenido.decode(enc).strip()
            break
        except UnicodeDecodeError:
            continue
    r.ok = bool(r.texto)
    r.paginas_leidas = 1 if r.ok else 0
    r.paginas_por_capa = r.paginas_leidas
    if not r.ok:
        r.avisos.append("El archivo de texto está vacío o no se pudo decodificar.")
    return r


# ── Entrada pública ─────────────────────────────────────────────────────────
def extension(nombre: str) -> str:
    return nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""


def es_soportado(nombre: str, tipo_mime: str = "") -> bool:
    ext = extension(nombre)
    return ext in {"pdf", "txt"} or ext in TIPOS_IMAGEN or tipo_mime.startswith(("application/pdf", "image/", "text/plain"))


def extraer_texto(nombre: str, contenido: bytes, presupuesto: Presupuesto) -> ResultadoTexto:
    """Devuelve el texto de UN documento. Nunca lanza: los problemas van en `avisos`.

    Que no lance es deliberado. Un documento ilegible en un lote de ocho no
    puede tumbar el análisis de los otros siete — es exactamente lo que hace el
    pipeline de la SPA con las descargas fallidas.
    """
    ext = extension(nombre)

    # Firma real del archivo, por si la extensión miente.
    if contenido[:5] == b"%PDF-":
        ext = "pdf"

    if ext == "pdf":
        return _leer_pdf(nombre, contenido, presupuesto)
    if ext in TIPOS_IMAGEN:
        return _leer_imagen(nombre, contenido, presupuesto)
    if ext in {"txt", "text", "md"}:
        return _leer_texto_plano(nombre, contenido)

    r = ResultadoTexto(nombre=nombre)
    r.avisos.append(f"Tipo de archivo no soportado (.{ext or 'sin extensión'}). Se aceptan PDF, PNG, JPG, TIFF y TXT.")
    return r
