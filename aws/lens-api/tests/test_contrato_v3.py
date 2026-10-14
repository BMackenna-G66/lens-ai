"""PR-C · La versión del 14-10 de los pedidos de Onboarding (contrato v3).

AJ-07 (avisos con `field` y `subject`), AJ-08 (país con ISO y catálogo único),
AJ-09 (largos de la base de Onboarding) y la sección 3: fechas, formas del
identificador tributario, partículas de los nombres, tipo de persona.

Todos los nombres, identificadores y empresas son INVENTADOS: el repo es público.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

import extraccion  # noqa: E402
import onboarding as ob  # noqa: E402
from paises_anexo_a import PAISES  # noqa: E402


def _av() -> ob.Avisos:
    return ob.Avisos()


# ════════════════════════════════════════════════════════════════════════════
# AJ-08 · Un solo catálogo de países, con su código ISO
# ════════════════════════════════════════════════════════════════════════════

def test_el_catalogo_es_identico_al_csv_de_onboarding():
    """La única fuente de LENS y de Onboarding. Si alguna de las dos cambia y
    la otra no, este test lo dice: un país que Onboarding no reconoce se guarda
    como desconocido sin avisar."""
    with open(RAIZ / "tests" / "fixtures" / "anexo-a-paises-country-code-enum.csv", encoding="utf-8") as f:
        del_csv = tuple((r["iso_code"], r["nombre_esperado_es"]) for r in csv.DictReader(f))
    assert PAISES == del_csv
    assert len(PAISES) == 238


def test_todo_nombre_del_catalogo_entra_en_origin_country():
    """`origin_country` es de 45 caracteres en la base de Onboarding."""
    assert max(len(n) for _, n in PAISES) <= 45


@pytest.mark.parametrize("entrada,iso", [
    ("Mexico", "MX"), ("MÉXICO", "MX"), ("méxico", "MX"), ("MEX", "MX"), ("mx", "MX"),
    ("Brazil", "BR"), ("Brasil", "BR"), ("BRA", "BR"),
    ("USA", "US"), ("EE. UU.", "US"), ("EEUU", "US"), ("Estados Unidos de América", "US"),
    ("United States", "US"), ("COL", "CO"), ("República de Colombia", "CO"), ("CO", "CO"),
    ("Perú", "PE"), ("Germany", "DE"), ("Alemanha", "DE"), ("Côte d’Ivoire", "CI"),
])
def test_el_pais_se_reconoce_en_sus_variantes(entrada, iso):
    assert ob.codigo_pais(entrada) == iso


def test_cada_nombre_y_codigo_del_catalogo_se_reconoce_a_si_mismo():
    for iso, nombre in PAISES:
        assert ob.resolver_pais(nombre) == (iso, nombre)
        assert ob.resolver_pais(iso) == (iso, nombre)


def test_el_accionista_lleva_el_codigo_al_lado_del_nombre():
    co = ob.persona({"personType": "NATURAL", "name": "ANA", "lastName": "FICTICIA",
                     "shareholderName": "ANA FICTICIA", "countryOfOrigin": "Colombia"}, _av())
    mx = ob.persona({"personType": "NATURAL", "name": "LUIS", "lastName": "INVENTADO",
                     "shareholderName": "LUIS INVENTADO", "countryOfOrigin": "Mexico"}, _av())
    assert (co["countryOfOrigin"], co["countryOfOriginCode"]) == ("Colombia", "CO")
    assert (mx["countryOfOrigin"], mx["countryOfOriginCode"]) == ("México", "MX")


def test_un_pais_que_no_se_puede_mapear_va_null_con_aviso_y_el_texto_original():
    av = _av()
    p = ob.persona({"personType": "NATURAL", "name": "ANA", "lastName": "FICTICIA",
                    "shareholderName": "ANA FICTICIA", "countryOfOrigin": "Wakanda"}, av)
    assert p["countryOfOrigin"] is None and p["countryOfOriginCode"] is None
    a = next(a for a in av.items if a["reason"] == ob.AVISO_PAIS)
    assert "Wakanda" in a["message"]
    assert a["field"] == "shareholder.countryOfOrigin" and a["subject"] == "ANA FICTICIA"


def test_las_reglas_por_pais_no_dependen_de_como_se_escribio():
    for v in ("CO", "COL", "Colombia", "colombia", "República de Colombia"):
        assert ob.pais_normalizado(v) == "colombia"
        assert ob.tipo_tax_id("900.000.111-0", v) == "NIT"


# ════════════════════════════════════════════════════════════════════════════
# AJ-09 · Los largos de la base de Onboarding
# ════════════════════════════════════════════════════════════════════════════

def test_oficina_999_se_abrevia_y_entra_en_10():
    av = _av()
    assert ob.apto_corto("Oficina 999", av) == "Of. 999"
    assert not av.items, "abreviar no es recortar: no se avisa"


@pytest.mark.parametrize("entrada,salida", [
    ("Apartamento 1201", "Apto. 1201"),
    ("Departamento 5", "Depto. 5"),
    ("Interior 301", "Int. 301"),
    ("Of 302", "Of 302"),
])
def test_las_otras_abreviaturas(entrada, salida):
    assert ob.apto_corto(entrada) == salida


def test_si_ni_abreviado_entra_se_recorta_por_palabras_con_aviso():
    av = _av()
    r = ob.apto_corto("Apartamento 1201 Torre B", av)
    assert r == "Apto. 1201" and len(r) <= 10
    a = av.items[0]
    assert a["reason"] == ob.AVISO_TRUNCADO and a["field"] == "address.apt"


def test_ningun_valor_de_la_empresa_pasa_de_255():
    av = _av()
    largo = "EMPRESA FICTICIA " * 20 + "SpA"
    r = ob.empresa({"legalName": largo, "address": "Calle Inventada " * 20 + "123, Santiago",
                    "country": "chile"}, av)
    assert len(r["legalName"]) <= 255 and len(r["address"]["street"]) <= 255
    assert {"legalName", "address.street"} <= {a["field"] for a in av.items
                                                 if a["reason"] == ob.AVISO_TRUNCADO}


def test_los_nombres_del_representante_tampoco_pasan_de_255():
    av = _av()
    nombre = "NOMBREINVENTADO " * 20
    r = ob.representante({"personType": "NATURAL", "name": nombre, "lastName": "FICTICIO",
                          "shareholderName": nombre, "position": "Gerente"}, av)
    assert len(r["name"]) <= 255 and len(r["fullName"]) <= 255
    assert any(a["field"] == "legalRepresentative.name" and a["subject"] for a in av.items)


# ════════════════════════════════════════════════════════════════════════════
# AJ-07 · Cada aviso dice qué dato y de quién
# ════════════════════════════════════════════════════════════════════════════

def test_el_cargo_recortado_dice_de_quien_es():
    av = _av()
    ob.representante({"personType": "NATURAL", "name": "ANA", "lastName": "FICTICIA",
                      "shareholderName": "ANA FICTICIA", "position": "Cargo " * 20}, av)
    a = next(a for a in av.items if a["reason"] == ob.AVISO_TRUNCADO)
    assert a["field"] == "legalRepresentative.role" and a["subject"] == "ANA FICTICIA"


def test_la_fecha_ilegible_dice_su_campo_y_trae_el_texto_original():
    av = _av()
    ob.fecha_iso("el día que se firmó", av)
    assert av.items[0]["field"] == "constitutionDate"
    assert "el día que se firmó" in av.items[0]["message"]


def test_el_nombre_partido_por_conteo_dice_de_quien_es():
    av = _av()
    ob.persona({"personType": "NATURAL", "shareholderName": "ANA MARIA FICTICIA SOTO"}, av)
    a = next(a for a in av.items if a["reason"] == ob.AVISO_NOMBRE_ADIVINADO)
    assert a["subject"] == "ANA MARIA FICTICIA SOTO" and a["field"] == "shareholder.name"


# ════════════════════════════════════════════════════════════════════════════
# Sección 3 · Fechas
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("entrada", [
    "Feb 28, 2019", "28 February 2019", "February 28th, 2019", "2019/02/28", "28.02.2019",
    "28 de fevereiro de 2019", "28-feb-2019",
])
def test_los_formatos_nuevos(entrada):
    assert ob.fecha_iso(entrada, pais="chile") == "2019-02-28"


def test_la_fecha_ambigua_sigue_la_convencion_del_pais():
    assert ob.fecha_iso("02/03/2019", pais="chile") == "2019-03-02"
    assert ob.fecha_iso("02/03/2019", pais="US") == "2019-02-03"


def test_la_fecha_ambigua_sin_pais_no_se_adivina():
    av = _av()
    assert ob.fecha_iso("02/03/2019", av) is None
    assert "02/03/2019" in av.items[0]["message"] and "ambigua" in av.items[0]["message"]


def test_sin_ambiguedad_no_hace_falta_el_pais():
    assert ob.fecha_iso("13/02/2019") == "2019-02-13"
    assert ob.fecha_iso("02/13/2019") == "2019-02-13"


# ════════════════════════════════════════════════════════════════════════════
# Sección 3 · El identificador tributario con forma de otro país
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("tax_id,declarado,forma", [
    ("EFU010101AB1", "colombia", "RFC mexicano"),
    ("900.000.111-0", "chile", "NIT colombiano"),
    ("10999999991", "colombia", "RUC peruano"),
    ("30-99999999-1", "peru", "CUIT argentino"),
    ("76.000.111-K", "colombia", "RUT chileno"),
])
def test_la_forma_de_otro_pais_se_avisa(tax_id, declarado, forma):
    av = _av()
    ob.tipo_tax_id(tax_id, declarado, av)
    a = av.items[0]
    assert a["reason"] == ob.AVISO_TAX_ID_DISCREPA and forma in a["message"] and a["field"] == "taxId"


@pytest.mark.parametrize("tax_id,declarado", [
    ("EFU010101AB1", "mexico"), ("900.000.111-0", "colombia"), ("20999999991", "peru"),
    ("20999999991", "argentina"), ("30-99999999-1", "argentina"), ("76.000.111-K", "chile"),
    ("900000111", "colombia"),
])
def test_la_forma_del_pais_declarado_no_avisa(tax_id, declarado):
    av = _av()
    ob.tipo_tax_id(tax_id, declarado, av)
    assert not av.items


# ════════════════════════════════════════════════════════════════════════════
# Sección 3 · Nombres con partículas
# ════════════════════════════════════════════════════════════════════════════

def test_las_particulas_van_con_su_palabra():
    assert ob.partir_nombre("MARÍA DEL PILAR GÓMEZ DE LA TORRE") == ("MARÍA DEL PILAR", "GÓMEZ DE LA TORRE")


def test_las_particulas_en_orden_registral():
    assert ob.partir_nombre("GÓMEZ DE LA TORRE MARÍA DEL PILAR", pais="CO") == \
        ("MARÍA DEL PILAR", "GÓMEZ DE LA TORRE")


def test_sin_particulas_sigue_como_antes():
    assert ob.partir_nombre("ANA MARIA FICTICIA SOTO") == ("ANA MARIA", "FICTICIA SOTO")


# ════════════════════════════════════════════════════════════════════════════
# Sección 3 · El tipo de persona
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("persona,tipo", [
    ({"shareholderId": "EFU010101AB1", "identificationType": "RFC"}, "JURIDICA"),   # 12: moral
    ({"shareholderId": "EFUA800101HD1", "identificationType": "RFC"}, "NATURAL"),   # 13: física
    ({"shareholderName": "INVERSIONES FICTICIAS LIMITADA"}, "JURIDICA"),
    ({"shareholderName": "Ficticia Holdings Inc."}, "JURIDICA"),
    ({"shareholderName": "EMPRESA INVENTADA S.A.S."}, "JURIDICA"),
    ({"shareholderName": "ANA FICTICIA", "identificationType": "CC"}, "NATURAL"),
    ({"shareholderName": "ANA FICTICIA", "identificationType": "Pasaporte"}, "NATURAL"),
    ({"shareholderName": "X", "identificationType": "NIT"}, "JURIDICA"),
    ({"shareholderId": "20999999991", "identificationType": "RUC"}, "JURIDICA"),
    ({"shareholderId": "10999999991", "identificationType": "RUC"}, "NATURAL"),
    ({"shareholderName": "ANA FICTICIA"}, None),
    ({"shareholderId": "20999999991"}, None),     # sin tipo: RUC de empresa o CUIT de persona
])
def test_el_tipo_de_persona_se_deduce_de_lo_que_se_puede(persona, tipo):
    assert ob.inferir_tipo_persona(persona) == tipo


def test_el_tipo_declarado_manda():
    assert ob.inferir_tipo_persona({"personType": "NATURAL", "shareholderName": "X S.A."}) == "NATURAL"


# ════════════════════════════════════════════════════════════════════════════
# AJ-07 · Lo que la corrida usa antes de avisar que falta
# ════════════════════════════════════════════════════════════════════════════

def test_la_forma_legal_del_texto_solo_si_nombra_una():
    assert ob.forma_legal_desde_texto("constituyen una sociedad por acciones simplificada") == "SAS"
    assert ob.forma_legal_desde_texto("una sociedad anónima de capital variable") == "SA"
    assert ob.forma_legal_desde_texto(
        "la sociedad anónima X, socia de la sociedad por acciones simplificada Y") is None
    assert ob.forma_legal_desde_texto("") is None


@pytest.mark.parametrize("objeto,actividad", [
    ("Inversiones y rentas de toda clase de bienes", "Inversiones"),
    ("La sociedad tendrá por objeto la prestación de servicios turísticos, y otros", "Prestación de servicios"),
    ("Objeto: comercialización de calzado; importación", "Comercialización de calzado"),
])
def test_la_actividad_del_objeto_social(objeto, actividad):
    assert ob.actividad(ob.actividad_desde_objeto(objeto), objeto) == actividad


# ════════════════════════════════════════════════════════════════════════════
# Sección 3 · PARTIALLY_ILLEGIBLE dice qué páginas
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("indices,texto", [
    ([6, 11, 18], "páginas 7, 12 y 19"),
    ([6], "página 7"),
    (list(range(15, 26)), "páginas 16 a 26"),
    ([2, 6, 7, 8, 11], "páginas 3, 7 a 9 y 12"),
])
def test_las_paginas_se_dicen_como_las_lee_una_persona(indices, texto):
    assert extraccion.paginas_legibles(indices) == texto
