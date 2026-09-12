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

    def __call__(self, docs, prompt, config):
        self.docs = docs
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


def _correr(monkeypatch, modelo, docs=None, **kw):
    monkeypatch.setattr(gemini, "_llamar_con_archivos", modelo)
    return gemini.extraer_shareholders(docs or [("escritura.pdf", b"%PDF-fake")], **kw)


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

    monkeypatch.setattr(gemini, "_llamar_con_archivos", revienta)
    try:
        gemini.extraer_shareholders([("x.pdf", b"x")])
    except gemini.ErrorGemini:
        return
    raise AssertionError("tenía que lanzar ErrorGemini")


def test_una_respuesta_que_no_es_json_se_traduce(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar_con_archivos", lambda *a, **k: ("no soy json", {}))
    try:
        gemini.extraer_shareholders([("x.pdf", b"x")])
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
    monkeypatch.setattr(gemini, "_llamar_con_archivos", ModeloFalso({
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

    monkeypatch.setattr(gemini, "_llamar_con_archivos", revienta)
    socios, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert socios == {"legalRepresentatives": [], "directOwnership": [], "indirectShareholders": []}
    assert any("cuota" in a for a in avisos)


def test_un_fallo_inesperado_tampoco_rompe(monkeypatch):
    """No solo ErrorGemini: cualquier cosa. Es la última línea antes del 502."""
    def revienta(*a, **k):
        raise ZeroDivisionError("algo raro")

    monkeypatch.setattr(gemini, "_llamar_con_archivos", revienta)
    socios, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert socios["directOwnership"] == []
    assert len(avisos) == 1


def test_sin_un_documento_que_el_modelo_pueda_ver(monkeypatch):
    docs = [Descargado(clave="c/a.docx", nombre="a.docx", contenido=b"x")]
    socios, avisos = app._extraer_socios(docs, time.monotonic())
    assert socios["directOwnership"] == []
    assert any("PDF, JPG o PNG" in a for a in avisos)


def _espiar_orden(monkeypatch, nombres, pesos=None):
    """En qué ORDEN recibe el modelo los documentos."""
    visto = {}

    def espiar(docs, prompt, config):
        visto["orden"] = [n for n, _ in docs]
        return json.dumps({"legalRepresentatives": [], "owners": []}), {}

    monkeypatch.setattr(gemini, "_llamar_con_archivos", espiar)
    app._extraer_socios(
        [Descargado(clave=f"c/{n}", nombre=n, contenido=b"x" * ((pesos or {}).get(n, 4)))
         for n in nombres],
        time.monotonic(),
    )
    return visto.get("orden", [])


def _espiar_eleccion(monkeypatch, nombres):
    """El PRIMERO, que es el que manda para decidir la sociedad principal."""
    orden = _espiar_orden(monkeypatch, nombres)
    return orden[0] if orden else None


def test_sin_senal_en_el_nombre_se_respeta_el_orden(monkeypatch):
    """El orden de `ingesta_s3` es determinista, así que dos corridas sobre la
    misma carpeta eligen el mismo archivo."""
    assert _espiar_eleccion(monkeypatch, ["notas.docx", "uno.pdf", "dos.pdf"]) == "uno.pdf"


def test_la_escritura_le_gana_a_la_cedula_aunque_venga_despues(monkeypatch):
    """LA regresión. Medido en producción: 4 de 45 consolidados tenían el
    `company_id_document` primero y se le pedía a una cédula la tabla de
    propiedad. Uno de ellos quedó con `ok:false` en la ficha."""
    elegido = _espiar_eleccion(monkeypatch, [
        "company_id_document_1789130963319.pdf",
        "company_deeds_document_1789042109217.pdf",
    ])
    assert elegido == "company_deeds_document_1789042109217.pdf"


def test_el_caso_real_de_produccion_con_cuatro_archivos(monkeypatch):
    """Tal cual salió de Redshift: cédula, anexo y dos escrituras."""
    elegido = _espiar_eleccion(monkeypatch, [
        "company_id_document_1787954908243.pdf",
        "company_complementary_document_1788963242795.pdf",
        "company_deeds_document_1787954908035.pdf",
        "company_deeds_document_1787954908155.pdf",
    ])
    # La primera escritura, no la segunda: entre iguales manda el orden.
    assert elegido == "company_deeds_document_1787954908035.pdf"


def test_el_anexo_le_gana_a_la_cedula(monkeypatch):
    """Sin escritura, un complementario sigue siendo mejor que un documento de
    identidad: al menos puede traer la tabla."""
    assert _espiar_eleccion(monkeypatch, [
        "company_id_document_1.pdf", "company_complementary_document_2.pdf",
    ]) == "company_complementary_document_2.pdf"


def test_un_nombre_libre_le_gana_a_la_cedula(monkeypatch):
    """Una subida manual no tiene señal, pero una cédula SÍ tiene señal de que
    no sirve. Ante la duda, la que no sabemos."""
    assert _espiar_eleccion(monkeypatch, [
        "company_id_document_1.pdf", "escaneo.pdf",
    ]) == "escaneo.pdf"


def test_si_todo_es_cedula_igual_se_elige_una(monkeypatch):
    """Rankear no es descartar: con un solo documento malo, se intenta igual y
    el resultado queda registrado. Descartar dejaría las tres claves vacías sin
    haber preguntado."""
    assert _espiar_eleccion(monkeypatch, ["company_id_document_1.pdf"]) == "company_id_document_1.pdf"


def test_la_camara_de_comercio_entra_alto(monkeypatch):
    """En Colombia el certificado de cámara ES la fuente canónica de la
    composición, y el prompt de la cadena le dice al modelo que la busque ahí."""
    assert _espiar_eleccion(monkeypatch, [
        "company_complementary_document_1.pdf",
        "company_trade_chamber_sedpe_document_2.pdf",
    ]) == "company_trade_chamber_sedpe_document_2.pdf"


def test_la_escritura_le_gana_a_la_camara(monkeypatch):
    assert _espiar_eleccion(monkeypatch, [
        "company_trade_chamber_sedpe_document_1.pdf",
        "company_deeds_document_2.pdf",
    ]) == "company_deeds_document_2.pdf"


def test_el_documento_del_representante_cuenta_como_identidad(monkeypatch):
    """Es la cédula del representante, no la escritura. Estaba sin rankear y en
    producción una vez ganó por venir de un `.JPG` con nombre libre."""
    assert _espiar_eleccion(monkeypatch, [
        "company_legal_representative_document_1.JPG", "company_deeds_document_2.pdf",
    ]) == "company_deeds_document_2.pdf"


def test_un_anexo_conocido_pierde_contra_un_nombre_desconocido(monkeypatch):
    """No es arbitrario: de un `complementary` SABEMOS que es secundario; de un
    nombre libre no sabemos nada, y bien puede ser el documento principal.

    Caso real de producción: dos `complementary` y un
    «MATRICULA DE COMERCIO VALIDADO.pdf», que es el que trae la composición."""
    assert _espiar_eleccion(monkeypatch, [
        "company_complementary_document_1788290889998.pdf",
        "company_complementary_document_1788290890187.pdf",
        "MATRICULA DE COMERCIO VALIDADO.pdf",
    ]) == "MATRICULA DE COMERCIO VALIDADO.pdf"


def test_van_TODOS_los_documentos_no_solo_el_mejor(monkeypatch):
    """LA regresión de este cambio. Medido sobre 87 análisis en los que el
    camino de texto SÍ encontró accionistas: mandando un solo archivo, la
    extracción estructurada los perdía en el 63 % de los consolidados de varios
    contra el 5 % de los de uno. La tabla vive en la escritura, pero la
    composición vigente suele estar en un anexo."""
    orden = _espiar_orden(monkeypatch, [
        "company_id_document_1.pdf",
        "company_complementary_document_2.pdf",
        "company_deeds_document_3.pdf",
    ])
    assert len(orden) == 3, "se perdió algún documento por el camino"
    # Y van ORDENADOS: el primero decide cuál es la sociedad principal.
    assert orden == ["company_deeds_document_3.pdf",
                     "company_complementary_document_2.pdf",
                     "company_id_document_1.pdf"]


def test_lo_que_el_modelo_no_puede_ver_no_va(monkeypatch):
    orden = _espiar_orden(monkeypatch, ["notas.docx", "planilla.xlsx", "escritura.pdf"])
    assert orden == ["escritura.pdf"]


def test_la_cadena_recibe_los_mismos_documentos_que_la_tabla(monkeypatch):
    """La pasada 2 pregunta por los socios de una jurídica: si viera menos
    documentos que la pasada 1, podría no encontrar la cláusula que los lista."""
    modelo = ModeloFalso(
        {"legalRepresentatives": [], "owners": [_persona("INV SpA", "JURIDICA")]},
        cadenas={"INV SpA": [_persona("ANA")]},
    )
    docs = [("company_deeds_document_1.pdf", b"%PDF"), ("anexo.pdf", b"%PDF")]
    _correr(monkeypatch, modelo, docs=docs)
    assert modelo.docs == docs          # los de la ÚLTIMA llamada, la de la cadena
    assert len(modelo.prompts) == 2


def test_el_tope_de_peso_es_sobre_la_suma_no_sobre_cada_uno(monkeypatch):
    """El límite de Gemini es sobre el request entero. Se corta por peso
    acumulado y, como van ordenados, lo que queda afuera es lo menos parecido a
    una escritura."""
    tope = gemini.TOPE_INLINE_BYTES
    orden = _espiar_orden(
        monkeypatch,
        ["company_deeds_document_1.pdf", "company_id_document_2.pdf"],
        pesos={"company_deeds_document_1.pdf": tope - 10, "company_id_document_2.pdf": 100},
    )
    assert orden == ["company_deeds_document_1.pdf"]      # la cédula no entró


def test_el_primero_entra_aunque_solo_no_quepa(monkeypatch):
    """Devolver una lista vacía se leería como «no había documentos», que es
    otra cosa. Que falle abajo con el mensaje de tamaño, que sí explica."""
    docs = [Descargado(clave="c/gigante.pdf", nombre="gigante.pdf",
                       contenido=b"x" * (gemini.TOPE_INLINE_BYTES + 50))]
    assert [d.nombre for d in app.elegir_documentos(docs)] == ["gigante.pdf"]


def test_un_documento_gigante_no_llega_a_la_red():
    grande = b"x" * (gemini.TOPE_INLINE_BYTES + 1)
    try:
        gemini._llamar_con_archivos([("a.pdf", grande)], "prompt", {})
    except gemini.ErrorGemini as e:
        assert "suman" in str(e) and "MB" in str(e)
        return
    raise AssertionError("tenía que rechazar por tamaño")


def test_dos_medianos_que_juntos_pasan_el_tope_tampoco(monkeypatch):
    """Cada uno cabe; los dos juntos no. Si el chequeo fuera por archivo, esto
    saldría a la red y volvería un error críptico de Google."""
    mitad = b"x" * (gemini.TOPE_INLINE_BYTES // 2 + 100)
    try:
        gemini._llamar_con_archivos([("a.pdf", mitad), ("b.pdf", mitad)], "prompt", {})
    except gemini.ErrorGemini as e:
        assert "2 archivo(s) suman" in str(e)
        return
    raise AssertionError("tenía que sumar los dos")


def test_sin_documentos_no_sale_a_la_red():
    try:
        gemini._llamar_con_archivos([], "prompt", {})
    except gemini.ErrorGemini as e:
        assert "ningún archivo" in str(e)
        return
    raise AssertionError("tenía que rechazar la lista vacía")


def test_el_caso_MTYF8PY7_que_fallo_en_produccion(monkeypatch):
    """El análisis del 12-09 que quedó con `{"ok":false,"error":"...no es JSON
    válido"}`: se le pedía la tabla de propiedad a una cédula teniendo al lado
    la escritura del Conservador, que tiene nombre libre."""
    assert _espiar_eleccion(monkeypatch, [
        "company_id_document_1789130963319.pdf", "CR90BiZzWtBS.pdf",
    ]) == "CR90BiZzWtBS.pdf"


def test_con_el_presupuesto_agotado_ni_se_intenta(monkeypatch):
    def no_deberia_llamarse(*a, **k):
        raise AssertionError("no tenía que llamar al modelo")

    monkeypatch.setattr(gemini, "_llamar_con_archivos", no_deberia_llamarse)
    # Un t0 muy viejo: el presupuesto de la corrida ya se consumió entero.
    socios, avisos = app._extraer_socios(_doc(), time.monotonic() - app.PRESUPUESTO_S)
    assert socios["directOwnership"] == []
    assert any("No quedó tiempo" in a for a in avisos)


def test_la_suma_sospechosa_llega_al_consumidor_como_aviso(monkeypatch):
    monkeypatch.setattr(gemini, "_llamar_con_archivos", ModeloFalso({
        "legalRepresentatives": [],
        "owners": [_persona("ANA", pct=100), _persona("BETO", pct=100)],
    }))
    _, avisos = app._extraer_socios(_doc(), time.monotonic())
    assert any("no ~100" in a for a in avisos)


def test_lo_extraido_pasa_por_el_contrato_sin_perder_la_cadena(monkeypatch):
    """El puente completo: lo que devuelve el modelo sale con las claves del
    contrato y la anidación intacta."""
    monkeypatch.setattr(gemini, "_llamar_con_archivos", ModeloFalso({
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


# ── El contraste entre las dos lecturas ─────────────────────────────────────
# El mismo documento se lee dos veces por caminos independientes: los 18 campos
# salen del texto extraído, la composición societaria sale del PDF nativo. Donde
# coinciden hay confianza; donde difieren, alguno adivinó.
#
# Los casos de acá son REALES, sacados de producción cruzando
# `lens.analisis_campo` contra `lens.analisis_persona` sobre 104 análisis: 44
# coincidían y 3 no. Dos de esos tres diferían en un solo dígito.

def _contraste(texto, documentos):
    return app.contrastar_lecturas(
        texto, {"directOwnership": [{"shareholderId": d} for d in documentos],
                "indirectShareholders": []})


def test_las_dos_lecturas_coinciden():
    c = _contraste("A | 18.641.710-0 | 99%\nB | 9.810.248-5 | 1%",
                   ["18.641.710-0", "9.810.248-5"])
    assert c["coinciden"] == 2
    assert c["revisar"] is False
    assert c["posible_digito"] == []


def test_caso_real_MTX3PT3N_un_digito():
    """texto 27.334.038-6  ·  estructurada 22.334.038-6. No son dos personas:
    es una de las dos lecturas inventando un dígito."""
    c = _contraste("X | 18.459.364-5 | 50%\nY | 27.334.038-6 | 50%",
                   ["18.459.364-5", "22.334.038-6"])
    assert c["posible_digito"] == [["273340386", "223340386"]]
    assert c["revisar"] is True
    assert c["coinciden"] == 1


def test_caso_real_MTYGWYJP_un_digito_y_un_faltante():
    """Dos cosas distintas a la vez: un dígito cambiado y un documento que la
    estructurada no vio. Se reportan por separado."""
    c = _contraste("A | 6.089.449-3 | 40%\nB | 6.553.729-K | 30%\nC | 76.198.910-3 | 30%",
                   ["6.089.441-3", "6.553.729-K"])
    assert c["posible_digito"] == [["60894493", "60894413"]]
    assert "761989103" in c["solo_texto"]


def test_caso_real_MTX2IKTQ_documentos_sin_relacion():
    """Cuando los documentos no se parecen en nada NO se inventa un par: se dice
    que hay que revisar, sin señalar un dígito que no existe."""
    c = _contraste("Z | 1.144.162.573 | 100%", ["902.099.643-3"])
    assert c["revisar"] is True
    assert c["posible_digito"] == []
    assert c["coinciden"] == 0


def test_sin_documento_no_genera_falso_positivo():
    """El campo de texto escribe «sin documento» cuando no lo encuentra. No hay
    con qué cruzar, así que no hay discrepancia que reportar."""
    c = _contraste("SEBASTIAN JIMENEZ AGUDELO | sin documento | 100%", [""])
    assert c["revisar"] is False


def test_la_puntuacion_no_cuenta():
    """`18.641.710-0` y `186417100` son el mismo documento escrito distinto."""
    c = _contraste("A | 18.641.710-0 | 100%", ["186417100"])
    assert c["coinciden"] == 1 and c["revisar"] is False


def test_un_rut_deletreado_en_palabras_no_inventa_clave():
    """Hay escrituras que escriben el RUT en letras. Canonizar esa prosa
    produciría una clave inventada que nunca cruzaría con nada."""
    c = _contraste("A | doce millones trescientos mil | 100%", [""])
    assert c["revisar"] is False


def test_largos_distintos_no_son_un_digito():
    """`123456` y `1234567` no difieren en un dígito: falta uno. Tratarlo como
    dígito cambiado señalaría el carácter equivocado."""
    c = _contraste("A | 123456-7 | 100%", ["1234567-8"])
    assert c["posible_digito"] == []


def test_dos_digitos_distintos_tampoco():
    c = _contraste("A | 11.111.111-1 | 100%", ["11.111.122-1"])
    assert c["posible_digito"] == []
    assert c["revisar"] is True


def test_el_aviso_dice_que_mirar():
    c = _contraste("Y | 27.334.038-6 | 100%", ["22.334.038-6"])
    av = app.avisos_del_contraste(c)
    assert len(av) == 1
    assert "273340386 vs 223340386" in av[0]


def test_sin_discrepancia_no_hay_aviso():
    assert app.avisos_del_contraste(_contraste("A | 1-9 | 100%", ["1-9"])) == []


def test_tambien_cruza_contra_los_indirectos():
    """Una jurídica dueña va a `indirectShareholders`, pero es dueña DIRECTA y
    el campo de texto la lista. Si no se cruzara, daría discrepancia siempre."""
    c = app.contrastar_lecturas(
        "INV SpA | 76.554.221-8 | 100%",
        {"directOwnership": [], "indirectShareholders": [{"shareholderId": "76.554.221-8"}]})
    assert c["coinciden"] == 1 and c["revisar"] is False
