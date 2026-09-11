"""Tests de la API. Corren sin AWS y sin llamar a Gemini.

    python3 -m pytest aws/lens-api/tests -q

Lo que se cubre es lo que puede romper en silencio: el ruteo y la auth, el
parseo de las tres formas de entrada, el relleno a 18 campos, la sustitución de
marcadores en un prompt que tiene llaves literales, y que un documento ilegible
no tumbe al resto del lote.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

os.environ.setdefault("API_SECRET", "secreto-de-prueba")
os.environ.setdefault("GEMINI_API_KEY", "clave-de-prueba")
os.environ.setdefault("MOTOR_OCR", "ninguno")          # sin AWS en los tests

import app            # noqa: E402
import extraccion     # noqa: E402
import gemini         # noqa: E402
import prompts_generado as P   # noqa: E402

SECRETO = os.environ["API_SECRET"]


# ── Utilidades ──────────────────────────────────────────────────────────────
def evento(metodo="POST", ruta="/v1/analisis", cuerpo=None, headers=None, b64=False, qs=None):
    return {
        "requestContext": {"http": {"method": metodo, "path": ruta}},
        "rawPath": ruta,
        "headers": headers if headers is not None else {"x-api-secret": SECRETO},
        "body": cuerpo,
        "isBase64Encoded": b64,
        "queryStringParameters": qs,
    }


def cuerpo_json(**kw) -> str:
    return json.dumps(kw)


def pdf_con_texto(texto: str, paginas: int = 1) -> bytes:
    """Un PDF real con capa de texto, generado con pypdf + reportlab si está,
    o con un PDF mínimo escrito a mano si no."""
    from pypdf import PdfWriter

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rlcanvas
    except ImportError:
        pytest.skip("reportlab no está instalado; se omiten los tests que necesitan un PDF real")

    buf = io.BytesIO()
    c = rlcanvas.Canvas(buf, pagesize=A4)
    for i in range(paginas):
        y = 800
        for linea in f"{texto} (pagina {i + 1})".split("\n"):
            c.drawString(60, y, linea)
            y -= 16
        c.showPage()
    c.save()

    w = PdfWriter()
    w.append(io.BytesIO(buf.getvalue()))
    salida = io.BytesIO()
    w.write(salida)
    return salida.getvalue()


# ── Ruteo y auth ────────────────────────────────────────────────────────────
def test_salud_no_pide_auth():
    r = app.lambda_handler(evento("GET", "/salud", headers={}))
    assert r["statusCode"] == 200
    cuerpo = json.loads(r["body"])
    assert cuerpo["ok"] is True
    assert cuerpo["servicio"] == "lens-api"


def test_ruta_desconocida_da_404():
    r = app.lambda_handler(evento("GET", "/otra-cosa"))
    assert r["statusCode"] == 404


def test_metodo_incorrecto_da_405():
    r = app.lambda_handler(evento("GET", "/v1/analisis"))
    assert r["statusCode"] == 405


def test_sin_secreto_da_401():
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[]), headers={}))
    assert r["statusCode"] == 401


def test_secreto_incorrecto_da_401():
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[]), headers={"x-api-secret": "otro"}))
    assert r["statusCode"] == 401


def test_el_nombre_del_header_es_case_insensitive():
    """Function URL normaliza a minúsculas, pero un proxy intermedio puede no
    hacerlo y un cliente puede mandar `X-Api-Secret`. Se comprueba contra
    `_autorizado` directamente: el handler devuelve 405 antes de mirar la auth,
    así que por la ruta pública este caso no se distingue."""
    assert app._autorizado(evento(headers={"X-Api-Secret": SECRETO})) is True
    assert app._autorizado(evento(headers={"x-api-secret": SECRETO})) is True
    assert app._autorizado(evento(headers={"X-API-SECRET": SECRETO})) is True
    assert app._autorizado(evento(headers={"x-api-secret": "otro"})) is False
    assert app._autorizado(evento(headers={})) is False


def test_sin_secreto_configurado_se_rechaza_todo():
    """Un despliegue sin API_SECRET no puede quedar abierto de par en par."""
    original = app.API_SECRET
    app.API_SECRET = ""
    try:
        assert app._autorizado(evento(headers={"x-api-secret": ""})) is False
        assert app._autorizado(evento(headers={"x-api-secret": "loquesea"})) is False
    finally:
        app.API_SECRET = original


# ── Entrada ─────────────────────────────────────────────────────────────────
def test_cuerpo_vacio_da_400():
    r = app.lambda_handler(evento(cuerpo=""))
    assert r["statusCode"] == 400


def test_json_invalido_da_400():
    r = app.lambda_handler(evento(cuerpo="{no soy json"))
    assert r["statusCode"] == 400
    assert "JSON" in json.loads(r["body"])["error"]


def test_sin_lista_de_documentos_da_400():
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(otra_cosa=1)))
    assert r["statusCode"] == 400
    assert "documentos" in json.loads(r["body"])["error"]


def test_base64_invalido_da_400_con_el_indice():
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "a.pdf", "contenido_base64": "no-es-base64!!"}])))
    assert r["statusCode"] == 400
    assert "documentos[0]" in json.loads(r["body"])["error"]


def test_documento_sin_contenido_ni_url_da_400():
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "a.pdf"}])))
    assert r["statusCode"] == 400


def test_url_esta_desactivada_por_defecto():
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "a.pdf", "url": "https://ejemplo.com/a.pdf"}])))
    assert r["statusCode"] == 400
    assert "desactivada" in json.loads(r["body"])["error"]


def test_url_http_se_rechaza():
    app.DOMINIOS_URL = {"ejemplo.com"}
    try:
        r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "a.pdf", "url": "http://ejemplo.com/a.pdf"}])))
        assert r["statusCode"] == 400
        assert "https" in json.loads(r["body"])["error"]
    finally:
        app.DOMINIOS_URL = set()


def test_url_de_dominio_no_permitido_se_rechaza():
    app.DOMINIOS_URL = {"permitido.com"}
    try:
        r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "a.pdf", "url": "https://malicioso.com/a.pdf"}])))
        assert r["statusCode"] == 400
        assert "no está en la lista permitida" in json.loads(r["body"])["error"]
    finally:
        app.DOMINIOS_URL = set()


def test_multipart_se_parsea():
    limite = "----prueba123"
    cuerpo = (
        f"--{limite}\r\n"
        'Content-Disposition: form-data; name="archivos"; filename="escritura.txt"\r\n'
        "Content-Type: text/plain\r\n\r\n"
        "CONSTITUCION DE SOCIEDAD\r\n"
        f"--{limite}--\r\n"
    ).encode()
    docs, incluir = app._documentos_del_evento(
        evento(cuerpo=base64.b64encode(cuerpo).decode(), b64=True,
               headers={"x-api-secret": SECRETO, "content-type": f"multipart/form-data; boundary={limite}"})
    )
    assert len(docs) == 1
    assert docs[0][0] == "escritura.txt"
    assert b"CONSTITUCION" in docs[0][1]
    assert incluir is False


# ── Extracción de texto ─────────────────────────────────────────────────────
def test_txt_se_lee_sin_ocr():
    p = extraccion.Presupuesto(limite_s=60)
    r = extraccion.extraer_texto("nota.txt", "hola mundo".encode(), p)
    assert r.ok
    assert r.metodo == "texto_plano"
    assert r.texto == "hola mundo"


def test_tipo_no_soportado_no_lanza():
    p = extraccion.Presupuesto(limite_s=60)
    r = extraccion.extraer_texto("hoja.xlsx", b"PK\x03\x04", p)
    assert r.ok is False
    assert any("no soportado" in a for a in r.avisos)


def test_pdf_corrupto_no_lanza():
    p = extraccion.Presupuesto(limite_s=60)
    r = extraccion.extraer_texto("roto.pdf", b"%PDF-1.4 basura", p)
    assert r.ok is False
    assert r.avisos


def test_pdf_con_capa_de_texto_no_usa_ocr():
    """El punto de todo el módulo: si el PDF trae texto, no se toca el OCR."""
    p = extraccion.Presupuesto(limite_s=60)
    r = extraccion.extraer_texto("digital.pdf", pdf_con_texto("CONSTITUCION DE SOCIEDAD POR ACCIONES", 3), p)
    assert r.ok
    assert r.metodo == "capa_texto"
    assert r.paginas_totales == 3
    assert r.paginas_por_capa == 3
    assert r.paginas_por_ocr == 0
    assert "CONSTITUCION" in r.texto


def test_extension_mentirosa_se_detecta_por_la_firma():
    """Un PDF llamado .txt tiene que leerse como PDF: la extensión miente seguido."""
    p = extraccion.Presupuesto(limite_s=60)
    contenido = pdf_con_texto("CONSTITUCION DE SOCIEDAD POR ACCIONES AD ASTRA SPA\nRUT 78.451.792-6")
    r = extraccion.extraer_texto("se_llama.txt", contenido, p)
    assert r.metodo == "capa_texto"          # no "texto_plano": entró por el camino de PDF
    assert "AD ASTRA" in r.texto


def test_pagina_casi_vacia_no_cuenta_como_capa_de_texto():
    """Una página con un par de caracteres sueltos es ruido de encoding, no
    una capa de texto: tiene que caer al OCR, no darse por leída."""
    p = extraccion.Presupuesto(limite_s=60)
    r = extraccion.extraer_texto("casi_vacio.pdf", pdf_con_texto("ab"), p)
    assert r.paginas_por_capa == 0
    assert r.metodo == "ninguno"             # MOTOR_OCR=ninguno en los tests
    assert any("sin capa de texto" in a for a in r.avisos)


def test_presupuesto_agotado_se_detecta():
    p = extraccion.Presupuesto(limite_s=0)
    assert p.agotado()
    assert p.restante() <= 0


# ── Prompts ─────────────────────────────────────────────────────────────────
def test_el_catalogo_tiene_18_campos():
    assert len(P.CAMPOS_PREDEFINIDOS) == 18
    assert P.CAMPOS_PREDEFINIDOS[0] == "RUT de la sociedad"


def test_hay_contexto_para_cada_pais():
    assert set(P.PAISES) <= set(P.CONTEXTO_POR_PAIS)


def test_el_prompt_conserva_el_formato_de_personas():
    """Si esto se rompe, la extracción de socios vuelve a prosa y la
    comparación automática deja de funcionar."""
    assert "NOMBRE COMPLETO | DOCUMENTO | DATO" in P.PROMPT_EXTRACCION
    assert "sin documento" in P.PROMPT_EXTRACCION
    assert "sin porcentaje" in P.PROMPT_EXTRACCION
    assert "NUNCA inventes" in P.PROMPT_EXTRACCION


def test_rellenar_soporta_llaves_literales():
    """El prompt trae `{"compraVentaBienes": true, ...}` literal. `str.format`
    lo leería como marcador y reventaría; por eso se usa `replace`."""
    salida = gemini._rellenar(P.PROMPT_EXTRACCION, contexto_pais="CTX", texto_documento="TEXTO")
    assert "CTX" in salida
    assert "TEXTO" in salida
    assert '"compraVentaBienes"' in salida
    assert "{contexto_pais}" not in salida
    assert "{texto_documento}" not in salida


def test_rellenar_avisa_si_falta_el_marcador():
    with pytest.raises(gemini.ErrorGemini):
        gemini._rellenar("una plantilla sin marcadores", texto_documento="x")


# ── Relleno de campos ───────────────────────────────────────────────────────
def test_la_salida_siempre_trae_los_18_campos(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar", lambda *a, **k: json.dumps([
        {"field": "Razón Social", "value": "AD ASTRA SPA"},
        {"field": "RUT de la sociedad", "value": "78.451.792-6"},
    ]))
    campos = gemini.extraer_campos("texto", "ctx")
    assert len(campos) == 18
    assert [c["field"] for c in campos] == P.CAMPOS_PREDEFINIDOS      # y en orden
    por_nombre = {c["field"]: c["value"] for c in campos}
    assert por_nombre["Razón Social"] == "AD ASTRA SPA"
    assert por_nombre["Capital Social"] == "No especificado"          # el relleno


def test_campo_inventado_por_el_modelo_se_descarta(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar", lambda *a, **k: json.dumps([
        {"field": "Campo Que No Existe", "value": "x"},
        {"field": "Duración", "value": "indefinida"},
    ]))
    campos = gemini.extraer_campos("texto", "ctx")
    assert "Campo Que No Existe" not in [c["field"] for c in campos]
    assert len(campos) == 18


def test_json_envuelto_en_bloque_de_codigo_se_parsea(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar", lambda *a, **k: '```json\n[{"field": "Duración", "value": "10 años"}]\n```')
    campos = gemini.extraer_campos("texto", "ctx")
    assert {c["field"]: c["value"] for c in campos}["Duración"] == "10 años"


def test_respuesta_que_no_es_json_da_error_claro(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar", lambda *a, **k: "lo siento, no puedo")
    with pytest.raises(gemini.ErrorGemini, match="no es JSON"):
        gemini.extraer_campos("texto", "ctx")


# ── El pipeline completo ────────────────────────────────────────────────────
def test_analisis_de_punta_a_punta(monkeypatch):
    monkeypatch.setattr(gemini, "detectar_pais", lambda t: "chile")
    monkeypatch.setattr(gemini, "extraer_campos", lambda t, c: [{"field": f, "value": "x"} for f in P.CAMPOS_PREDEFINIDOS])

    contenido = base64.b64encode("CONSTITUCION DE SOCIEDAD".encode()).decode()
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "e.txt", "contenido_base64": contenido}])))

    assert r["statusCode"] == 200
    cuerpo = json.loads(r["body"])
    assert cuerpo["ok"] is True
    assert cuerpo["estado"] == "COMPLETO"
    assert cuerpo["pais_detectado"] == "chile"
    assert len(cuerpo["campos"]) == 18
    assert cuerpo["documentos"][0]["metodo"] == "texto_plano"
    assert "texto_crudo" not in cuerpo                         # no se devuelve si no se pide


def test_incluir_texto_devuelve_el_crudo(monkeypatch):
    monkeypatch.setattr(gemini, "detectar_pais", lambda t: "chile")
    monkeypatch.setattr(gemini, "extraer_campos", lambda t, c: [{"field": f, "value": "x"} for f in P.CAMPOS_PREDEFINIDOS])

    contenido = base64.b64encode("TEXTO ORIGINAL".encode()).decode()
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(
        documentos=[{"nombre": "e.txt", "contenido_base64": contenido}], incluir_texto=True)))
    assert json.loads(r["body"])["texto_crudo"] == "TEXTO ORIGINAL"


def test_un_documento_ilegible_no_tumba_al_resto(monkeypatch):
    """Es la regla del pipeline de la SPA: un documento roto en un lote de ocho
    no puede invalidar el análisis de los otros siete."""
    monkeypatch.setattr(gemini, "detectar_pais", lambda t: "chile")
    monkeypatch.setattr(gemini, "extraer_campos", lambda t, c: [{"field": f, "value": "x"} for f in P.CAMPOS_PREDEFINIDOS])

    bueno = base64.b64encode("CONTENIDO BUENO".encode()).decode()
    malo = base64.b64encode(b"PK\x03\x04binario").decode()
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[
        {"nombre": "bueno.txt", "contenido_base64": bueno},
        {"nombre": "malo.xlsx", "contenido_base64": malo},
    ])))

    cuerpo = json.loads(r["body"])
    assert r["statusCode"] == 200
    assert cuerpo["ok"] is True
    assert cuerpo["estado"] == "INCOMPLETO"         # se analizó, pero faltó algo
    assert len(cuerpo["campos"]) == 18
    assert any("malo.xlsx" in a for a in cuerpo["avisos"])
    assert [d["ok"] for d in cuerpo["documentos"]] == [True, False]


def test_ningun_documento_legible_da_error_explicito(monkeypatch):
    malo = base64.b64encode(b"PK\x03\x04").decode()
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "a.xlsx", "contenido_base64": malo}])))
    cuerpo = json.loads(r["body"])
    assert cuerpo["ok"] is False
    assert cuerpo["estado"] == "ERROR"
    assert "No se pudo extraer texto" in cuerpo["error"]


def test_fallo_de_gemini_no_deja_al_cliente_sin_explicacion(monkeypatch):
    monkeypatch.setattr(gemini, "detectar_pais", lambda t: "chile")

    def revienta(t, c):
        raise gemini.ErrorGemini("Se excedió la cuota de la API de Gemini.")

    monkeypatch.setattr(gemini, "extraer_campos", revienta)
    contenido = base64.b64encode("TEXTO".encode()).decode()
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "e.txt", "contenido_base64": contenido}])))

    cuerpo = json.loads(r["body"])
    assert cuerpo["estado"] == "ERROR"
    assert "cuota" in cuerpo["error"]


def test_fallo_al_detectar_pais_no_aborta_el_analisis(monkeypatch):
    """La detección de país es un lujo; la extracción es el producto."""
    def revienta(t):
        raise gemini.ErrorGemini("sobrecarga")

    monkeypatch.setattr(gemini, "detectar_pais", revienta)
    monkeypatch.setattr(gemini, "extraer_campos", lambda t, c: [{"field": f, "value": "x"} for f in P.CAMPOS_PREDEFINIDOS])

    contenido = base64.b64encode("TEXTO".encode()).decode()
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=[{"nombre": "e.txt", "contenido_base64": contenido}])))

    cuerpo = json.loads(r["body"])
    assert cuerpo["ok"] is True
    assert cuerpo["pais_detectado"] == "unknown"
    assert any("país" in a for a in cuerpo["avisos"])


def test_pais_forzado_saltea_la_deteccion(monkeypatch):
    def no_deberia_llamarse(t):
        raise AssertionError("no se debía detectar el país")

    monkeypatch.setattr(gemini, "detectar_pais", no_deberia_llamarse)
    monkeypatch.setattr(gemini, "extraer_campos", lambda t, c: [{"field": f, "value": "x"} for f in P.CAMPOS_PREDEFINIDOS])

    contenido = base64.b64encode("TEXTO".encode()).decode()
    r = app.lambda_handler(evento(
        cuerpo=cuerpo_json(documentos=[{"nombre": "e.txt", "contenido_base64": contenido}]),
        qs={"pais": "colombia"}))
    assert json.loads(r["body"])["pais_detectado"] == "colombia"


def test_tope_de_documentos_se_respeta_y_se_avisa(monkeypatch):
    monkeypatch.setattr(gemini, "detectar_pais", lambda t: "chile")
    monkeypatch.setattr(gemini, "extraer_campos", lambda t, c: [{"field": f, "value": "x"} for f in P.CAMPOS_PREDEFINIDOS])
    monkeypatch.setattr(app, "MAX_DOCUMENTOS", 2)

    contenido = base64.b64encode("TEXTO".encode()).decode()
    docs = [{"nombre": f"d{i}.txt", "contenido_base64": contenido} for i in range(5)]
    r = app.lambda_handler(evento(cuerpo=cuerpo_json(documentos=docs)))

    cuerpo = json.loads(r["body"])
    assert len(cuerpo["documentos"]) == 2
    assert any("tope es 2" in a for a in cuerpo["avisos"])
