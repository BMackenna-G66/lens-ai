"""`shareholders[]` en EP-3 — contrato v3.2 (pedido de Onboarding, 23-10-2026).

Onboarding precarga la declaración de beneficiarios finales con los accionistas
que lee LENS. Lo que se protege acá:

  · que entren los dueños directos, consolidados y con el estilo de EP-4;
  · que el que no tiene nombre o documento se omita CON su aviso, y que una
    composición accionaria sin nadie avise sin hacer fallar la corrida;
  · que la nacionalidad no se infiera;
  · que un problema sea un aviso, no dos;
  · que EP-4, EP-5 y EP-6 salgan idénticos a como salían antes.

Todos los nombres, documentos y empresas son INVENTADOS: el repo es público.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

import companies as co  # noqa: E402
import corridas  # noqa: E402
import disparador  # noqa: E402
import onboarding as ob  # noqa: E402

FIXTURES = RAIZ / "tests" / "fixtures"

ESCRITURA = "prod/990000003/documents_company/company_deeds_document_1791500000000.PDF"
COMPOSICION = "prod/990000003/documents_company/company_shareholders_document_1791500000001.PDF"


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    corridas._reiniciar_memoria()
    monkeypatch.setattr(disparador, "ASINCRONO", False)
    yield
    corridas._reiniciar_memoria()


# ── Personas como las devuelve la extracción ────────────────────────────────

def natural(nombre, apellido, doc, tipo="CC", pct=None, pais="Colombia", declarada=False, **extra):
    """`declarada`: el documento escribe la nacionalidad, y `pais` sale de ahí."""
    return {"personType": "NATURAL", "shareholderName": f"{apellido} {nombre}", "name": nombre,
            "lastName": apellido, "shareholderId": doc, "identificationType": tipo,
            "countryOfOrigin": pais, "ownershipPercentage": pct, "isPEP": None,
            "nationalityDeclared": declarada, **extra}


def juridica(razon, doc, tipo="NIT", pct=None, cadena=(), **extra):
    return {"personType": "JURIDICA", "shareholderName": razon, "shareholderId": doc,
            "identificationType": tipo, "countryOfOrigin": "Colombia", "ownershipPercentage": pct,
            "indirectShareholders": list(cadena), **extra}


REPRESENTANTE = natural("ANA PRUEBA", "FICTICIA SOTO", "99.000.009", declarada=True,
                        position="Representante legal")

#: La corrida D del pedido de Onboarding, con nombres inventados: una persona
#: con cédula y nacionalidad declarada, un extranjero con pasaporte y sin
#: nacionalidad declarada, y una sociedad.
CORRIDA_D = {
    "directOwnership": [
        natural("JUAN PRUEBA", "RAMOS INVENTADO", "99.000.001", pct=40, declarada=True),
        natural("THOMAS EDWARD", "TESTFIELD", "X9876543", tipo="Pasaporte", pct=20, pais=""),
    ],
    "indirectShareholders": [
        juridica("INVERSIONES AURORA DE PRUEBA S.A.S.", "999.999.003-5", pct=20,
                 cadena=[natural("PEDRO CADENA", "SEGUNDO NIVEL", "99.000.077", pct=100)]),
    ],
}


def ficha(personas=None, documentos=None, reps=None) -> dict:
    p = personas if personas is not None else CORRIDA_D
    return {
        "fields": [{"field": "Razón Social", "value": "COMERCIAL DE PRUEBA S.A.S."},
                   {"field": "RUT de la sociedad", "value": "999.000.001-1"}],
        "documents": documentos if documentos is not None else [
            {"objectKey": ESCRITURA, "documentType": "company_deeds_document", "ok": True},
            {"objectKey": COMPOSICION, "documentType": "company_shareholders_document", "ok": True},
        ],
        "detectedCountry": "colombia",
        "legalRepresentatives": [dict(REPRESENTANTE)] if reps is None else reps,
        "directOwnership": [dict(x) for x in p.get("directOwnership", [])],
        "indirectShareholders": [dict(x) for x in p.get("indirectShareholders", [])],
        "administration": {}, "identity": {},
    }


def servir(f: dict, warnings=()) -> dict:
    """EP-3 sobre una corrida guardada con esa ficha."""
    return co.resultado_de("990000003", {
        "companyId": "990000003", "analysisId": "a1", "status": "INCOMPLETE",
        "country": "CO", "warnings": list(warnings), "result": f,
    })


def avisos_de(f: dict) -> list[dict]:
    """Los avisos que deja el nodo al cerrar la corrida, ya normalizados."""
    av = ob.Avisos()
    co.accionistas_ep3(f, av)
    return co.normalizar_avisos(av.items)


# ════════════════════════════════════════════════════════════════════════════
# El nodo
# ════════════════════════════════════════════════════════════════════════════

def test_la_corrida_d_sale_como_la_pidio_onboarding():
    assert servir(ficha())["shareholders"] == [
        {"fullName": "RAMOS INVENTADO JUAN PRUEBA", "name": "JUAN PRUEBA", "lastName": "RAMOS INVENTADO",
         "personType": "NATURAL", "identificationType": "CC", "identificationNumber": "99.000.001",
         "ownershipPercentage": 40, "nationalityCode": "CO", "documentCountryCode": "CO"},
        {"fullName": "TESTFIELD THOMAS EDWARD", "name": "THOMAS EDWARD", "lastName": "TESTFIELD",
         "personType": "NATURAL", "identificationType": "PASS", "identificationNumber": "X9876543",
         "ownershipPercentage": 20, "nationalityCode": None, "documentCountryCode": None},
        {"fullName": "INVERSIONES AURORA DE PRUEBA S.A.S.", "name": "INVERSIONES AURORA DE PRUEBA S.A.S.",
         "lastName": None, "personType": "LEGAL", "identificationType": "NIT",
         "identificationNumber": "999.999.003-5", "ownershipPercentage": 20, "nationalityCode": None,
         "documentCountryCode": "CO"},
    ]


def test_el_nodo_va_siempre_aunque_no_haya_nadie():
    assert servir(ficha({}))["shareholders"] == []


def test_la_cadena_de_una_sociedad_queda_fuera():
    nombres = [a["fullName"] for a in servir(ficha())["shareholders"]]
    assert not any("CADENA" in n for n in nombres)


def test_una_sociedad_no_tiene_apellido():
    soc = servir(ficha())["shareholders"][2]
    assert soc["personType"] == "LEGAL" and soc["lastName"] is None
    assert soc["name"] == soc["fullName"]


def test_el_tipo_de_persona_que_no_se_sabe_va_en_null_y_no_se_omite():
    f = ficha({"directOwnership": [
        {"shareholderName": "PRUEBA DUDOSA", "shareholderId": "88.000.001", "identificationType": "RUT"}]})
    a = servir(f)["shareholders"]
    assert len(a) == 1 and a[0]["personType"] is None
    assert [x["field"] for x in avisos_de(f) if x["reason"] == "PERSON_TYPE_UNDETERMINED"] == [
        "shareholder.personType"]


@pytest.mark.parametrize("tipo,pais", [("Pasaporte", None), ("DNI", None), ("CC", "CO"),
                                       ("NIT", "CO"), ("RUT", "CL"), ("RFC", "MX"), ("CURP", "MX")])
def test_el_pais_del_documento_solo_sale_del_tipo_si_es_inequivoco(tipo, pais):
    f = ficha({"directOwnership": [natural("LUIS", "PRUEBA DOC", "AB-123456", tipo=tipo, pais="")]})
    assert servir(f)["shareholders"][0]["documentCountryCode"] == pais


def test_el_numero_va_tal_como_figura():
    f = ficha({"directOwnership": [natural("LUIS", "PRUEBA RFC", "PRLU-800101-AB1", tipo="RFC")]})
    assert servir(f)["shareholders"][0]["identificationNumber"] == "PRLU-800101-AB1"


# ── Nacionalidad: solo la declarada ─────────────────────────────────────────

def test_la_nacionalidad_que_no_se_declaro_va_en_null_aunque_se_sepa_el_pais():
    """`countryOfOrigin` puede ser deducido; solo cuenta como nacionalidad si
    el modelo marcó que el documento la escribe. Una cédula colombiana no dice
    la nacionalidad."""
    f = ficha({"directOwnership": [natural("LUIS", "PRUEBA SIN", "99.000.002", pais="Colombia")]})
    a = servir(f)["shareholders"][0]
    assert a["nationalityCode"] is None
    assert a["documentCountryCode"] == "CO"


def test_la_nacionalidad_declarada_se_reconoce_por_el_gentilicio():
    f = ficha({"directOwnership": [natural("LUIS", "PRUEBA MX", "PRLU800101AB1", tipo="RFC",
                                           pais="mexicano", declarada=True)]})
    assert servir(f)["shareholders"][0]["nationalityCode"] == "MX"


def test_una_nacionalidad_fuera_del_catalogo_va_en_null_con_su_field():
    f = ficha({"directOwnership": [natural("LUIS", "PRUEBA WAK", "99.000.003", pais="wakandiana", declarada=True)]})
    assert servir(f)["shareholders"][0]["nationalityCode"] is None
    pais = [a for a in avisos_de(f) if a["reason"] == "COUNTRY_NOT_IN_CATALOG"]
    assert len(pais) == 1
    assert pais[0]["field"] == "shareholder.nationalityCode"
    assert pais[0]["subject"] == "PRUEBA WAK LUIS"


def test_una_sociedad_no_tiene_nacionalidad_aunque_el_modelo_la_marque():
    f = ficha({"indirectShareholders": [juridica("INVERSIONES PRUEBA S.A.S.", "999.999.004-1",
                                                 nationalityDeclared=True)]})
    assert servir(f)["shareholders"][0]["nationalityCode"] is None


# ── Porcentajes ─────────────────────────────────────────────────────────────

def test_los_porcentajes_no_se_ajustan_a_100():
    f = ficha({"directOwnership": [natural("A", "PRUEBA UNO", "99.000.011", pct=40),
                                   natural("B", "PRUEBA DOS", "99.000.012", pct="33,333"),
                                   natural("C", "PRUEBA TRES", "99.000.013", pct=None)]})
    assert [a["ownershipPercentage"] for a in servir(f)["shareholders"]] == [40, 33.33, None]
    assert not [a for a in avisos_de(f) if a["field"] == "shareholder.ownershipPercentage"]


def test_un_porcentaje_fuera_de_rango_va_en_null_con_aviso():
    f = ficha({"directOwnership": [natural("A", "PRUEBA RANGO", "99.000.014", pct=150)]})
    assert servir(f)["shareholders"][0]["ownershipPercentage"] is None
    assert [a["field"] for a in avisos_de(f)] == ["shareholder.ownershipPercentage"]


# ════════════════════════════════════════════════════════════════════════════
# Regla de inclusión
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("quitar,campo,mensaje", [
    ({"shareholderId": ""}, "shareholder.identificationNumber",
     "Falta el documento de identidad de: GOMEZ PRUEBA MARIA ALEJANDRA."),
    ({"identificationType": "", "countryOfOrigin": ""}, "shareholder.identificationType",
     "Falta el tipo de documento de identidad de: GOMEZ PRUEBA MARIA ALEJANDRA."),
    ({"shareholderName": "", "name": "", "lastName": ""}, "shareholder.name",
     "Falta el nombre de un accionista con documento 99.000.004."),
])
def test_al_que_le_falta_un_dato_minimo_se_lo_omite_con_su_aviso(quitar, campo, mensaje):
    p = {**natural("MARIA ALEJANDRA", "GOMEZ PRUEBA", "99.000.004", pct=10), **quitar}
    f = ficha({"directOwnership": [natural("JUAN PRUEBA", "RAMOS INVENTADO", "99.000.001", pct=90), p]})
    assert len(servir(f)["shareholders"]) == 1
    faltan = [a for a in avisos_de(f) if a["reason"] == "EXPECTED_DATA_MISSING"]
    assert faltan == [{
        "reason": "EXPECTED_DATA_MISSING",
        # Con dos documentos vivos no se sabe de cuál salió: el de la composición.
        "objectKey": COMPOSICION,
        "message": mensaje,
        "field": campo,
        "subject": None if campo == "shareholder.name" else "GOMEZ PRUEBA MARIA ALEJANDRA",
    }]


def test_con_un_solo_documento_vivo_el_aviso_nombra_ese():
    docs = [{"objectKey": ESCRITURA, "documentType": "company_deeds_document", "ok": True}]
    f = ficha({"directOwnership": [{**natural("A", "PRUEBA SIN DOC", "x"), "shareholderId": ""}]}, docs)
    assert avisos_de(f)[0]["objectKey"] == ESCRITURA


def test_sin_composicion_y_con_dos_documentos_el_aviso_va_sin_object_key():
    docs = [{"objectKey": ESCRITURA, "documentType": "company_deeds_document", "ok": True},
            {"objectKey": "prod/x/otro.pdf", "documentType": "company_complementary_document", "ok": True}]
    f = ficha({"directOwnership": [{**natural("A", "PRUEBA SIN DOC", "x"), "shareholderId": ""}]}, docs)
    assert avisos_de(f)[0]["objectKey"] is None


# ── Consolidación ───────────────────────────────────────────────────────────

def test_la_misma_persona_de_dos_documentos_sale_una_vez_la_mas_completa():
    escritura = natural("JUAN PRUEBA", "RAMOS INVENTADO", "99000001", pct=None)
    composicion = natural("JUAN PRUEBA", "RAMOS INVENTADO", "99.000.001", pct=40, declarada=True)
    a = servir(ficha({"directOwnership": [escritura, composicion]}))["shareholders"]
    assert len(a) == 1
    assert a[0]["ownershipPercentage"] == 40 and a[0]["nationalityCode"] == "CO"


def test_sin_numero_pero_con_el_nombre_de_un_incluido_no_se_avisa_como_omitido():
    """La escritura lo nombra sin cédula y la composición lo trae completo: no
    falta nadie."""
    sin_doc = {**natural("Juan Prueba", "Ramos Inventado", ""), "shareholderName": "Juan Prueba Ramos Inventado"}
    f = ficha({"directOwnership": [sin_doc, natural("JUAN PRUEBA", "RAMOS INVENTADO", "99.000.001", pct=40)]})
    assert len(servir(f)["shareholders"]) == 1
    assert not [a for a in avisos_de(f) if a["reason"] == "EXPECTED_DATA_MISSING"]


def test_dos_omitidos_con_el_mismo_nombre_avisan_una_vez():
    sin_doc = {**natural("ANA", "PRUEBA REPETIDA", ""), "ownershipPercentage": 50}
    f = ficha({"directOwnership": [sin_doc, dict(sin_doc)]})
    assert len([a for a in avisos_de(f) if a["field"] == "shareholder.identificationNumber"]) == 1


# ════════════════════════════════════════════════════════════════════════════
# Composición accionaria sin nadie (§4.2)
# ════════════════════════════════════════════════════════════════════════════

AVISO_SIN_NADIE = {
    "reason": "EXPECTED_DATA_MISSING", "objectKey": COMPOSICION,
    "message": "La composición accionaria no trae ningún accionista con nombre y documento de identidad.",
    "field": "shareholders", "subject": None,
}


def test_composicion_sin_nadie_avisa():
    assert AVISO_SIN_NADIE in avisos_de(ficha({}))


def test_composicion_con_todos_omitidos_avisa_tambien():
    f = ficha({"directOwnership": [{**natural("A", "PRUEBA SIN DOC", ""), "pct": 100}]})
    assert AVISO_SIN_NADIE in avisos_de(f)


def test_composicion_que_fallo_avisa_tambien():
    docs = [{"objectKey": ESCRITURA, "documentType": "company_deeds_document", "ok": True},
            {"objectKey": COMPOSICION, "documentType": "company_shareholders_document", "ok": False}]
    assert AVISO_SIN_NADIE in avisos_de(ficha({}, docs))


def test_sin_composicion_en_el_lote_no_se_avisa():
    """Chile y el resto mandan solo la escritura: un nodo vacío no es un aviso."""
    docs = [{"objectKey": ESCRITURA, "documentType": "company_deeds_document", "ok": True}]
    assert not [a for a in avisos_de(ficha({}, docs)) if a["field"] == "shareholders"]


def test_con_accionistas_no_se_avisa():
    assert not [a for a in avisos_de(ficha()) if a["field"] == "shareholders"]


# ════════════════════════════════════════════════════════════════════════════
# La corrida entera
# ════════════════════════════════════════════════════════════════════════════

class _S3:
    def __init__(self, falla_get=()):
        self.falla_get = set(falla_get)

    def head_object(self, Bucket, Key):
        return {"ContentLength": 1024}

    def get_object(self, Bucket, Key):
        if Key in self.falla_get:
            raise RuntimeError("AccessDenied")

        class _Cuerpo:
            def read(self):
                return b"%PDF-1.4 contenido"
        return {"Body": _Cuerpo()}


@pytest.fixture
def s3(monkeypatch):
    cliente = _S3()

    class _Boto:
        @staticmethod
        def client(_):
            return cliente

    monkeypatch.setitem(sys.modules, "boto3", _Boto)
    return cliente


CAMPOS = [
    {"field": "Razón Social", "value": "COMERCIAL DE PRUEBA S.A.S."},
    {"field": "RUT de la sociedad", "value": "999.000.001-1"},
    {"field": "Fecha de Constitución", "value": "12 de marzo de 2019"},
    {"field": "Objeto Social", "value": "Inversiones y rentas de toda clase de bienes"},
    {"field": "Domicilio Legal", "value": "Calle 100 # 10-20, Of 302, Bogotá, Cundinamarca"},
]


def _analizar(documentos, incluir_texto, pais="", **_):
    return {"ok": True, "campos": CAMPOS, "pais_detectado": "colombia", "avisos": [],
            "documentos": [{"nombre": n, "ok": True, "metodo": "capa_texto", "paginas_totales": 3,
                            "paginas_leidas": 3, "paginas_por_ocr": 0} for n, _ in documentos]}


def _identidad(descargado, t0):
    return {"esConstitutivo": "SI", "tipoDetectado": "certificado de existencia", "activity": "Inversiones",
            "legalForm": "S.A.S.", "country": "Colombia"}


def correr(personas, documentos=None):
    docs = documentos or [
        {"s3Uri": f"s3://g66-company/{ESCRITURA}", "documentType": "company_deeds_document"},
        {"s3Uri": f"s3://g66-company/{COMPOSICION}", "documentType": "company_shareholders_document"},
    ]
    corridas.registrar_inicio("prod", "990000003", "a1", documentos=docs)
    co.procesar({"ambiente": "prod", "companyId": "990000003", "analysisId": "a1", "country": "CO",
                 "documents": docs},
                analizar=_analizar, leer_identidad=_identidad,
                extraer_socios=lambda d, t0: ({"legalRepresentatives": [dict(REPRESENTANTE)],
                                               "directOwnership": [dict(x) for x in personas.get("directOwnership", [])],
                                               "indirectShareholders": [dict(x) for x in personas.get("indirectShareholders", [])]},
                                              []))
    return corridas.buscar("prod", "990000003", "a1")


def test_la_corrida_d_termina_completa_y_ep3_trae_el_nodo(s3):
    reg = correr(CORRIDA_D)
    assert reg["status"] == corridas.COMPLETED, reg["warnings"]
    cuerpo = co.resultado_de("990000003", reg)
    assert len(cuerpo["shareholders"]) == 3
    assert cuerpo["schemaVersion"] == "1.2.0"


def test_composicion_sin_nadie_deja_la_corrida_incomplete_y_no_failed(s3):
    reg = correr({})
    assert reg["status"] == corridas.INCOMPLETE
    assert AVISO_SIN_NADIE in reg["warnings"]
    # Lo demás sigue: es lo que un FAILED perdería.
    cuerpo = co.resultado_de("990000003", reg)
    assert cuerpo["legalRepresentatives"] and cuerpo["company"]["legalName"]


def test_composicion_que_no_se_pudo_bajar_tambien_avisa_y_sigue(s3):
    s3.falla_get.add(COMPOSICION)
    reg = correr({})
    assert reg["status"] == corridas.INCOMPLETE
    assert AVISO_SIN_NADIE in reg["warnings"]


def test_un_problema_un_aviso(s3):
    """El mismo país fuera del catálogo como `countryOfOrigin` (EP-6) y como
    nacionalidad declarada (EP-3), y el mismo tipo de persona sin determinar:
    un aviso cada uno, no dos."""
    reg = correr({"directOwnership": [
        natural("LUIS", "PRUEBA WAK", "99.000.003", pais="Wakanda", declarada=True, pct=60),
        {"shareholderName": "PRUEBA DUDOSA", "shareholderId": "88.000.001", "identificationType": "RUT",
         "ownershipPercentage": 40},
    ]})
    pais = [a for a in reg["warnings"] if a["reason"] == "COUNTRY_NOT_IN_CATALOG"]
    assert [a["field"] for a in pais] == ["shareholder.nationalityCode"]
    tipo = [a for a in reg["warnings"] if a["reason"] == "PERSON_TYPE_UNDETERMINED"]
    assert len(tipo) == 1
    firmas = [(a["reason"], a["field"], a["subject"]) for a in reg["warnings"]]
    assert len(firmas) == len(set(firmas)), firmas


def test_el_pais_que_solo_esta_en_ep6_se_sigue_avisando(s3):
    """Si la nacionalidad no se declaró, el `countryOfOrigin` de EP-6 es otro
    dato y su aviso sigue."""
    reg = correr({"directOwnership": [natural("LUIS", "PRUEBA WAK", "99.000.003", pais="Wakanda", pct=100)]})
    assert [a["field"] for a in reg["warnings"] if a["reason"] == "COUNTRY_NOT_IN_CATALOG"] == [
        "shareholder.countryOfOrigin"]


def test_una_corrida_guardada_antes_del_v32_se_sirve_con_el_nodo():
    """No tiene `nationalityDeclared` ni los avisos nuevos, pero la forma es la de hoy."""
    f = ficha()
    for p in f["directOwnership"] + f["indirectShareholders"]:
        p.pop("nationalityDeclared", None)
    cuerpo = servir(f)
    assert len(cuerpo["shareholders"]) == 3
    assert {a["nationalityCode"] for a in cuerpo["shareholders"]} == {None}


# ════════════════════════════════════════════════════════════════════════════
# Lo que NO cambia: EP-4, EP-5, EP-6 y fields[], idénticos a main (3d73041)
# ════════════════════════════════════════════════════════════════════════════
# El fixture se generó corriendo `resultado_de` y `accionistas_de` de main sobre
# esta misma ficha. Si cambia, cambió algo que el pedido dice que no se toca.

def _ficha_rica() -> dict:
    return ficha({
        "directOwnership": [
            natural("JUAN PRUEBA", "RAMOS INVENTADO", "99.000.001", pct=40, declarada=True),
            natural("THOMAS EDWARD", "TESTFIELD", "X9876543", tipo="Pasaporte", pct=20, pais=""),
            natural("LUIS", "PRUEBA WAK", "99.000.003", pais="Wakanda", declarada=True, pct=10),
            {"shareholderName": "PRUEBA DUDOSA", "shareholderId": "88.000.001", "identificationType": "RUT",
             "ownershipPercentage": 10},
        ],
        "indirectShareholders": CORRIDA_D["indirectShareholders"],
    })


def test_ep6_y_los_otros_bloques_de_ep3_son_identicos_a_main():
    esperado = json.loads((FIXTURES / "ep3_ep6_main_3d73041.json").read_text(encoding="utf-8"))
    u = {"companyId": "990000003", "analysisId": "a1", "status": "INCOMPLETE",
         "country": "CO", "warnings": [], "result": _ficha_rica()}
    ep3 = co.resultado_de("990000003", u)
    assert co.accionistas_de("990000003", u) == esperado["ep6"]
    for clave in ("company", "legalRepresentatives", "fields", "documents", "country", "countryCode"):
        assert ep3[clave] == esperado["ep3"][clave], clave
