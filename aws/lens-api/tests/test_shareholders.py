"""Tests de la composición societaria en Python — el puerto de la Fase 3.

Lo que se verifica acá no es "que llame al modelo": es que las tres decisiones
que costaron medirse sigan en pie.

  1. El esquema es PLANO. Con el anidado la cadena salía 6 de 8 veces y una de
     cada cinco corridas se desbocaba hasta 45.358 tokens devolviendo JSON
     truncado. Hay un test que falla si alguien vuelve a anidarlo.
  2. El reparto sale de `personType`, no de dónde el modelo puso a cada uno.
  3. Que falle la cadena de UNA jurídica no puede tirar abajo el análisis.

Sin red y sin API key: se reemplaza `_llamar_con_archivo` por una función que
devuelve JSON fijo.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

os.environ.setdefault("API_SECRET", "prueba")

import gemini  # noqa: E402


def _persona(nombre, tipo="NATURAL", pct=None, doc=""):
    return {
        "personType": tipo, "shareholderName": nombre, "shareholderId": doc,
        "ownershipPercentage": pct,
    }


class ModeloFalso:
    """Responde la pasada 1 y, por cada jurídica, la pasada 2 que le toque."""

    def __init__(self, pase1, cadenas=None, rompe=()):
        self.pase1 = pase1
        self.cadenas = cadenas or {}
        self.rompe = set(rompe)
        self.prompts = []

    def __call__(self, nombre, contenido, prompt, config):
        self.prompts.append(prompt)
        if len(self.prompts) == 1:
            return json.dumps(self.pase1), {"promptTokenCount": 10, "candidatesTokenCount": 5}
        for empresa in self.rompe:
            if empresa in prompt:
                raise gemini.ErrorGemini("el modelo se cayó")
        for empresa, miembros in self.cadenas.items():
            if empresa in prompt:
                return json.dumps({"members": miembros}), {"candidatesTokenCount": 3}
        return json.dumps({"members": []}), {}


def _correr(monkeypatch, modelo, **kw):
    monkeypatch.setattr(gemini, "_llamar_con_archivo", modelo)
    return gemini.extraer_shareholders("escritura.pdf", b"%PDF-fake", **kw)


# ── El esquema tiene que seguir PLANO ───────────────────────────────────────

def test_ningun_esquema_anida_la_cadena():
    """La regresión que importa: si vuelve la anidación, vuelve el JSON truncado."""
    crudo = json.dumps([gemini.ESQUEMA_SHAREHOLDERS, gemini.ESQUEMA_CADENA])
    assert "indirectShareholders" not in crudo


def test_la_pasada_1_pide_representantes_y_duenos():
    assert set(gemini.ESQUEMA_SHAREHOLDERS["required"]) == {"legalRepresentatives", "owners"}
    assert gemini.ESQUEMA_CADENA["required"] == ["members"]


def test_persontype_esta_restringido_por_enumeracion():
    """Es lo que impide que el modelo invente un tercer tipo de persona."""
    props = gemini.ESQUEMA_SHAREHOLDERS["properties"]["owners"]["items"]["properties"]
    assert props["personType"]["enum"] == ["NATURAL", "JURIDICA"]


# ── El reparto sale de personType ───────────────────────────────────────────

def test_las_naturales_van_a_directas_y_las_juridicas_a_indirectas(monkeypatch):
    modelo = ModeloFalso({
        "legalRepresentatives": [_persona("ANA GERENTA")],
        "owners": [_persona("JUAN", pct=40), _persona("INV SpA", "JURIDICA", pct=60)],
    }, cadenas={"INV SpA": [_persona("PEDRO", pct=100)]})
    r, s = _correr(monkeypatch, modelo)

    assert [p["shareholderName"] for p in r["directOwnership"]] == ["JUAN"]
    assert [p["shareholderName"] for p in r["indirectShareholders"]] == ["INV SpA"]
    assert r["legalRepresentatives"][0]["shareholderName"] == "ANA GERENTA"
    assert s["juridicas"] == 1 and s["juridicas_con_cadena"] == 1


def test_el_reparto_no_depende_de_donde_lo_puso_el_modelo(monkeypatch):
    """El modelo devuelve TODO en `owners`: la regla de oro la aplica este código."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("MATRIZ LTDA", "JURIDICA"), _persona("LUIS"), _persona("OTRA SA", "JURIDICA"),
    ]})
    r, _ = _correr(monkeypatch, modelo)
    assert len(r["directOwnership"]) == 1
    assert len(r["indirectShareholders"]) == 2
    assert all(p["personType"] == "JURIDICA" for p in r["indirectShareholders"])


def test_sin_persontype_cuenta_como_natural(monkeypatch):
    """Ante la duda va a directas: inventarle una cadena a algo que quizá no es
    una sociedad costaría una llamada y podría alucinar socios."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [{"shareholderName": "SIN TIPO"}]})
    r, _ = _correr(monkeypatch, modelo)
    assert len(r["directOwnership"]) == 1 and r["indirectShareholders"] == []


def test_la_cadena_se_anida_bajo_su_juridica(monkeypatch):
    modelo = ModeloFalso(
        {"legalRepresentatives": [], "owners": [_persona("HOLDING SpA", "JURIDICA", doc="76.1-2")]},
        cadenas={"HOLDING SpA": [_persona("ANA"), _persona("BETO")]},
    )
    r, s = _correr(monkeypatch, modelo)
    hijos = r["indirectShareholders"][0]["indirectShareholders"]
    assert [h["shareholderName"] for h in hijos] == ["ANA", "BETO"]
    # El documento entra en el prompt de la cadena: dos empresas del mismo
    # nombre en un documento se distinguen por ahí.
    assert "(documento 76.1-2)" in modelo.prompts[1]


def test_una_pasada_por_juridica(monkeypatch):
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("A SpA", "JURIDICA"), _persona("B SpA", "JURIDICA"), _persona("ANA"),
    ]})
    _, s = _correr(monkeypatch, modelo)
    assert s["llamadas"] == 3          # 1 + una por cada jurídica
    assert len(modelo.prompts) == 3


def test_sin_juridicas_no_hay_segunda_pasada(monkeypatch):
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [_persona("ANA")]})
    _, s = _correr(monkeypatch, modelo)
    assert s["llamadas"] == 1


# ── Una cadena rota no tira abajo el análisis ───────────────────────────────

def test_si_falla_la_cadena_de_una_el_resto_sobrevive(monkeypatch):
    modelo = ModeloFalso(
        {"legalRepresentatives": [], "owners": [
            _persona("ROTA SpA", "JURIDICA"), _persona("SANA SpA", "JURIDICA")]},
        cadenas={"SANA SpA": [_persona("ANA")]},
        rompe={"ROTA SpA"},
    )
    r, s = _correr(monkeypatch, modelo)
    assert len(r["indirectShareholders"]) == 2
    assert r["indirectShareholders"][0]["indirectShareholders"] == []
    assert r["indirectShareholders"][1]["indirectShareholders"][0]["shareholderName"] == "ANA"
    assert s["juridicas"] == 2 and s["juridicas_con_cadena"] == 1


def test_si_falla_la_pasada_1_si_lanza(monkeypatch):
    """Sin la pasada 1 no hay nada que devolver: acá sí tiene que propagarse."""
    def revienta(*a, **k):
        raise gemini.ErrorGemini("sin API key")

    monkeypatch.setattr(gemini, "_llamar_con_archivo", revienta)
    try:
        gemini.extraer_shareholders("x.pdf", b"x")
    except gemini.ErrorGemini:
        return
    raise AssertionError("tenía que lanzar ErrorGemini")


def test_una_respuesta_que_no_es_json_se_traduce(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar_con_archivo", lambda *a, **k: ("no soy json", {}))
    try:
        gemini.extraer_shareholders("x.pdf", b"x")
    except gemini.ErrorGemini as e:
        assert "no es JSON válido" in str(e)
        return
    raise AssertionError("tenía que lanzar ErrorGemini")


# ── El presupuesto de tiempo ────────────────────────────────────────────────

def test_sin_tiempo_las_juridicas_quedan_sin_cadena_pero_aparecen(monkeypatch):
    """Una sociedad con ocho socios jurídicos son ocho llamadas: se corta, se
    avisa, y las jurídicas siguen en la respuesta."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("A SpA", "JURIDICA"), _persona("B SpA", "JURIDICA")]})
    r, s = _correr(monkeypatch, modelo, quedan_llamadas=lambda: False)

    assert len(r["indirectShareholders"]) == 2
    assert all(p["indirectShareholders"] == [] for p in r["indirectShareholders"])
    assert s["juridicas_sin_tiempo"] == 2
    assert s["llamadas"] == 1                 # solo la pasada 1


def test_el_corte_de_tiempo_es_a_mitad_de_camino(monkeypatch):
    """El reloj se consulta por jurídica, no una sola vez al principio."""
    quedan = [True, False]
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("A SpA", "JURIDICA"), _persona("B SpA", "JURIDICA")]},
        cadenas={"A SpA": [_persona("ANA")]})
    r, s = _correr(monkeypatch, modelo, quedan_llamadas=lambda: quedan.pop(0))

    assert r["indirectShareholders"][0]["indirectShareholders"][0]["shareholderName"] == "ANA"
    assert r["indirectShareholders"][1]["indirectShareholders"] == []
    assert s["juridicas_sin_tiempo"] == 1


# ── La suma de participación ────────────────────────────────────────────────

def test_la_suma_cierra_en_cien(monkeypatch):
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("ANA", pct=33.33), _persona("BETO", pct=33.33), _persona("CARLA", pct=33.34)]})
    _, s = _correr(monkeypatch, modelo)
    assert s["suma_participacion"] == 100.0
    assert s["participacion_sospechosa"] is False


def test_doscientos_por_ciento_es_sospechoso(monkeypatch):
    """El error que más se repite: el modelo mete en la tabla principal a los
    socios de OTRA empresa que el documento también describe. Medido: pasaba."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("ANA", pct=50), _persona("BETO", pct=50),
        _persona("ANA", pct=50), _persona("BETO", pct=50)]})
    _, s = _correr(monkeypatch, modelo)
    assert s["suma_participacion"] == 200.0
    assert s["participacion_sospechosa"] is True


def test_la_suma_incluye_a_las_juridicas_directas(monkeypatch):
    """Las jurídicas van a `indirectShareholders`, pero son dueñas DIRECTAS: si
    no contaran, la suma daría 40 y marcaría sospechoso un documento sano."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("ANA", pct=40), _persona("INV SpA", "JURIDICA", pct=60)]})
    _, s = _correr(monkeypatch, modelo)
    assert s["suma_participacion"] == 100.0
    assert s["participacion_sospechosa"] is False


def test_con_un_porcentaje_nulo_no_se_evalua(monkeypatch):
    """Con uno en null el total no significa nada: marcarlo sería ruido."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        _persona("ANA", pct=50), _persona("BETO", pct=None)]})
    _, s = _correr(monkeypatch, modelo)
    assert s["suma_participacion"] is None
    assert s["participacion_sospechosa"] is False


def test_sin_duenos_no_hay_suma(monkeypatch):
    modelo = ModeloFalso({"legalRepresentatives": [_persona("ANA")], "owners": []})
    _, s = _correr(monkeypatch, modelo)
    assert s["suma_participacion"] is None


def test_un_ispep_booleano_no_se_confunde_con_un_porcentaje(monkeypatch):
    """En Python `True` es instancia de `int`: sin la guarda, un `isPEP` colado
    en `ownershipPercentage` sumaría 1 y el chequeo dejaría de detectar nada."""
    modelo = ModeloFalso({"legalRepresentatives": [], "owners": [
        {"shareholderName": "ANA", "ownershipPercentage": True}]})
    _, s = _correr(monkeypatch, modelo)
    assert s["suma_participacion"] is None


def test_se_cuentan_las_juridicas_del_segundo_nivel(monkeypatch):
    """Una jurídica DETRÁS de otra: la cadena sigue más abajo de lo que el
    contrato representa. Se aplana y se cuenta."""
    modelo = ModeloFalso(
        {"legalRepresentatives": [], "owners": [_persona("A SpA", "JURIDICA")]},
        cadenas={"A SpA": [_persona("B SpA", "JURIDICA"), _persona("ANA")]},
    )
    _, s = _correr(monkeypatch, modelo)
    assert s["juridicas_en_nivel1"] == 1


# ── El camino multimodal ────────────────────────────────────────────────────

def test_los_tipos_soportados():
    for n in ("a.pdf", "a.PDF", "b.jpg", "b.jpeg", "c.png"):
        assert gemini.mime_de(n)
    assert gemini.mime_de("escritura.pdf") == "application/pdf"


def test_los_tipos_no_soportados():
    for n in ("a.docx", "a.txt", "sin_extension", "a.pdf.zip"):
        assert gemini.mime_de(n) is None


def test_un_tipo_no_soportado_no_llega_a_la_red():
    try:
        gemini._llamar_con_archivo("contrato.docx", b"x", "prompt", {})
    except gemini.ErrorGemini as e:
        assert "no soportado" in str(e)
        return
    raise AssertionError("tenía que rechazar el .docx")


def test_un_archivo_gigante_no_llega_a_la_red():
    grande = b"x" * (gemini.TOPE_INLINE_BYTES + 1)
    try:
        gemini._llamar_con_archivo("a.pdf", grande, "prompt", {})
    except gemini.ErrorGemini as e:
        assert "MB" in str(e)
        return
    raise AssertionError("tenía que rechazar el archivo gigante")


def test_el_archivo_va_antes_que_el_prompt(monkeypatch):
    """El orden que recomienda Google: las instrucciones se leen con el
    documento ya en contexto. Es el mismo que usa la SPA."""
    visto = {}

    def espiar(partes, config):
        visto["partes"] = partes
        return "{}", {}

    monkeypatch.setattr(gemini, "_generar", espiar)
    gemini._llamar_con_archivo("a.pdf", b"%PDF-1.4", "instrucciones", {})
    assert "inlineData" in visto["partes"][0]
    assert visto["partes"][0]["inlineData"]["mimeType"] == "application/pdf"
    assert visto["partes"][1]["text"] == "instrucciones"


def test_la_config_multimodal_apaga_el_pensamiento_y_topea_la_salida():
    """`thinkingBudget: 0` porque esto es extracción, no razonamiento; el tope
    de salida es la red que evitó las corridas desbocadas."""
    c = gemini._config_multimodal(gemini.ESQUEMA_CADENA)
    assert c["thinkingConfig"]["thinkingBudget"] == 0
    assert c["maxOutputTokens"] == gemini.TOPE_SALIDA_MULTIMODAL
    assert c["responseMimeType"] == "application/json"


# ── El enganche con el contrato: `_extraer_socios` NUNCA lanza ──────────────
# La ficha de 18 campos ya está lista cuando esto corre. Perderla porque la
# composición societaria falló sería peor que devolverla sin socios.

import time  # noqa: E402

import app  # noqa: E402
import contrato  # noqa: E402
from ingesta_s3 import Descargado  # noqa: E402


def _doc(nombre="escritura.pdf"):
    return [Descargado(clave=f"c/{nombre}", nombre=nombre, contenido=b"%PDF-1.4")]


def test_socios_ok_llena_las_tres_claves(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar_con_archivo", ModeloFalso({
        "legalRepresentatives": [_persona("ANA GERENTA")],
        "owners": [_persona("JUAN", pct=40), _persona("INV SpA", "JURIDICA", pct=60)],
    }, cadenas={"INV SpA": [_persona("PEDRO", pct=100)]}))

    socios, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert socios["directOwnership"][0]["shareholderName"] == "JUAN"
    assert socios["indirectShareholders"][0]["indirectShareholders"][0]["shareholderName"] == "PEDRO"
    assert avisos == []


def test_un_fallo_del_modelo_no_rompe_la_respuesta(monkeypatch):
    def revienta(*a, **k):
        raise gemini.ErrorGemini("se excedió la cuota")

    monkeypatch.setattr(gemini, "_llamar_con_archivo", revienta)
    socios, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert socios == {"legalRepresentatives": [], "directOwnership": [], "indirectShareholders": []}
    assert any("cuota" in a for a in avisos)


def test_un_fallo_inesperado_tampoco_rompe(monkeypatch):
    """No solo ErrorGemini: cualquier cosa. Es la última línea antes del 502."""
    def revienta(*a, **k):
        raise ZeroDivisionError("algo raro")

    monkeypatch.setattr(gemini, "_llamar_con_archivo", revienta)
    socios, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert socios["directOwnership"] == []
    assert len(avisos) == 1


def test_sin_un_documento_que_el_modelo_pueda_ver(monkeypatch):
    docs = [Descargado(clave="c/a.docx", nombre="a.docx", contenido=b"x")]
    socios, avisos = app._extraer_socios(docs, time.monotonic())
    assert socios["directOwnership"] == []
    assert any("PDF, JPG o PNG" in a for a in avisos)


def test_elige_el_primer_archivo_que_el_modelo_puede_ver(monkeypatch):
    """El orden de `ingesta_s3` es determinista, así que dos corridas sobre la
    misma carpeta eligen el mismo archivo."""
    visto = {}

    def espiar(nombre, contenido, prompt, config):
        visto["nombre"] = nombre
        return json.dumps({"legalRepresentatives": [], "owners": []}), {}

    monkeypatch.setattr(gemini, "_llamar_con_archivo", espiar)
    docs = [
        Descargado(clave="c/notas.docx", nombre="notas.docx", contenido=b"x"),
        Descargado(clave="c/uno.pdf", nombre="uno.pdf", contenido=b"%PDF"),
        Descargado(clave="c/dos.pdf", nombre="dos.pdf", contenido=b"%PDF"),
    ]
    app._extraer_socios(docs, time.monotonic())
    assert visto["nombre"] == "uno.pdf"


def test_con_el_presupuesto_agotado_ni_se_intenta(monkeypatch):
    def no_deberia_llamarse(*a, **k):
        raise AssertionError("no tenía que llamar al modelo")

    monkeypatch.setattr(gemini, "_llamar_con_archivo", no_deberia_llamarse)
    # Un t0 muy viejo: el presupuesto de la corrida ya se consumió entero.
    socios, avisos = app._extraer_socios(_doc(), time.monotonic() - app.PRESUPUESTO_S)
    assert socios["directOwnership"] == []
    assert any("No quedó tiempo" in a for a in avisos)


def test_la_suma_sospechosa_llega_al_consumidor_como_aviso(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar_con_archivo", ModeloFalso({
        "legalRepresentatives": [],
        "owners": [_persona("ANA", pct=100), _persona("BETO", pct=100)],
    }))
    _, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert any("no ~100" in a for a in avisos)


def test_lo_extraido_pasa_por_el_contrato_sin_perder_la_cadena(monkeypatch):
    """El puente completo: lo que devuelve el modelo sale con las claves del
    contrato y la anidación intacta."""
    monkeypatch.setattr(gemini, "_llamar_con_archivo", ModeloFalso({
        "legalRepresentatives": [{"shareholderName": "ANA", "personType": "NATURAL",
                                  "position": "Gerente General"}],
        "owners": [_persona("INV SpA", "JURIDICA", pct=100)],
    }, cadenas={"INV SpA": [_persona("PEDRO", pct=100)]}))

    socios, _ = app._extraer_socios(_doc(), time.monotonic())
    r = contrato.respuesta(
        analysis_id="x",
        legal_representatives=socios["legalRepresentatives"],
        direct_ownership=socios["directOwnership"],
        indirect_shareholders=socios["indirectShareholders"],
    )
    assert r["legalRepresentatives"][0]["position"] == "Gerente General"
    assert r["shareholders"]["directOwnership"] == []
    raiz = r["shareholders"]["indirectShareholders"][0]
    assert raiz["shareholderName"] == "INV SpA"
    assert raiz["indirectShareholders"][0]["shareholderName"] == "PEDRO"
