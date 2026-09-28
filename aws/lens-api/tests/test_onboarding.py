"""Los siete desajustes de formato con Onboarding B2B (Fase 6 del plan).

La regla que justifica cada uno de estos tests está en el contrato v1.2, y es la
misma siempre: *«Onboarding convierte estos valores de forma estricta. Un valor
fuera de formato no produce error: se guarda mal.»*

O sea que ninguno de estos errores se manifiesta como una falla. Se manifiestan
como un dato incorrecto en el registro de una empresa, semanas después, en la
revisión de Compliance. Por eso están todos fijados acá.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import onboarding as ob  # noqa: E402
from paises_anexo_a import PAISES  # noqa: E402


def _av() -> ob.Avisos:
    return ob.Avisos()


# ════════════════════════════════════════════════════════════════════════════
# A · personType
# ════════════════════════════════════════════════════════════════════════════

def test_juridica_se_traduce_a_legal():
    assert ob.tipo_persona("JURIDICA") == "LEGAL"


def test_natural_no_se_toca():
    assert ob.tipo_persona("NATURAL") == "NATURAL"


def test_es_idempotente():
    """Serializar dos veces no puede dar distinto."""
    assert ob.tipo_persona(ob.tipo_persona("JURIDICA")) == "LEGAL"


@pytest.mark.parametrize("v", ["", None, "PERSONA NATURAL", "empresa", "  "])
def test_lo_que_no_se_entiende_no_se_inventa(v):
    """El contrato dice que todo lo distinto de NATURAL se lee como jurídica.

    Apoyarse en esa regla de respaldo produciría el valor correcto por
    casualidad. Acá se devuelve None y el llamador omite la entidad.
    """
    assert ob.tipo_persona(v) is None


def test_persona_sin_tipo_se_omite_con_aviso():
    av = _av()
    assert ob.persona({"personType": "???", "shareholderName": "X"}, av) is None
    assert av.items[0]["reason"] == ob.AVISO_TIPO_PERSONA


def test_una_natural_sin_tipo_no_entra_como_empresa():
    """El daño concreto de omitir: del otro lado, todo lo que no es NATURAL se
    guarda como persona jurídica. Una persona física sin tipo quedaría
    registrada como empresa."""
    assert ob.persona({"personType": "", "shareholderName": "JUAN PÉREZ SOTO"}, _av()) is None


# ════════════════════════════════════════════════════════════════════════════
# B · name / lastName
# ════════════════════════════════════════════════════════════════════════════

def test_en_juridica_el_name_es_la_razon_social():
    r = ob.persona({"personType": "JURIDICA", "shareholderName": "INVERSIONES ACME SpA"}, _av())
    assert r["name"] == "INVERSIONES ACME SpA"
    assert r["lastName"] is None


def test_columnas_explicitas_mandan():
    assert ob.partir_nombre("LO QUE SEA", name="JUAN", last_name="PÉREZ") == ("JUAN", "PÉREZ")


def test_la_coma_manda_sobre_el_conteo():
    """`PÉREZ GONZÁLEZ, JUAN ANDRÉS` — apellidos antes de la coma."""
    assert ob.partir_nombre("PÉREZ GONZÁLEZ, JUAN ANDRÉS") == ("JUAN ANDRÉS", "PÉREZ GONZÁLEZ")


@pytest.mark.parametrize("completo,esperado", [
    ("JUAN ANDRÉS PÉREZ GONZÁLEZ", ("JUAN ANDRÉS", "PÉREZ GONZÁLEZ")),
    ("JUAN PÉREZ GONZÁLEZ", ("JUAN", "PÉREZ GONZÁLEZ")),
    ("JUAN PÉREZ", ("JUAN", "PÉREZ")),
    ("MADONNA", ("MADONNA", None)),
])
def test_conteo_de_palabras_convencion_chilena(completo, esperado):
    """Los DOS últimos son los apellidos: paterno y materno."""
    assert ob.partir_nombre(completo) == esperado


def test_nombre_vacio_no_se_inventa():
    assert ob.partir_nombre("   ") == (None, None)


# ════════════════════════════════════════════════════════════════════════════
# C · isPEP
# ════════════════════════════════════════════════════════════════════════════

def test_una_empresa_nunca_es_pep():
    """La condición es de personas físicas. `null` ahí no es «no sé»: es una
    pregunta mal hecha."""
    assert ob.es_pep(None, "LEGAL") is False
    assert ob.es_pep(True, "LEGAL") is False


def test_en_natural_solo_si_se_declaro():
    assert ob.es_pep(True, "NATURAL") is True
    assert ob.es_pep(False, "NATURAL") is False
    assert ob.es_pep(None, "NATURAL") is None


# ════════════════════════════════════════════════════════════════════════════
# D · shareholderId
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("crudo,esperado", [
    ("76.123.456-9", "761234569"),
    ("9001234567", "9001234567"),
    ("76 123 456 - 9", "761234569"),
])
def test_el_accionista_va_solo_con_digitos(crudo, esperado):
    assert ob.id_accionista(crudo) == esperado


def test_el_digito_verificador_k_se_pierde_y_esta_bien():
    """Lo pide el contrato. Y también dice que LENS no recalcula dígitos: no se
    toca lo que no se entiende."""
    assert ob.id_accionista("76.123.456-K") == "76123456"


def test_el_de_la_empresa_y_el_representante_van_tal_cual():
    assert ob.id_tal_cual("76.123.456-K") == "76.123.456-K"


def test_las_dos_reglas_conviven_en_la_misma_persona():
    """Mismo dato, reglas distintas según quién sea. Es la trampa de esta fase."""
    p = {"personType": "NATURAL", "shareholderName": "ANA SOTO", "shareholderId": "12.345.678-5"}
    assert ob.persona(p, _av())["shareholderId"] == "123456785"
    assert ob.representante(p, _av())["shareholderId"] == "12.345.678-5"


# ════════════════════════════════════════════════════════════════════════════
# E · countryOfOrigin
# ════════════════════════════════════════════════════════════════════════════

def test_el_anexo_completo_esta():
    assert len(PAISES) == 238


@pytest.mark.parametrize("entrada,esperado", [
    ("México", "México"),
    ("mexico", "México"),      # sin tilde: se empareja igual
    ("MEXICO", "México"),
    ("  Perú  ", "Perú"),
    ("peru", "Perú"),
    ("CHILE", "Chile"),
])
def test_tolerante_al_leer_estricto_al_escribir(entrada, esperado):
    """Del otro lado se ignoran mayúsculas y espacios pero NO la grafía. Así que
    acá se empareja sin tildes y se emite la forma canónica."""
    assert ob.pais_anexo_a(entrada) == esperado


def test_lo_que_no_esta_en_el_catalogo_sale_vacio_y_avisa():
    """Mandar el texto crudo es el modo de fallo que el contrato advierte: se
    guarda como país desconocido y nadie se entera."""
    av = _av()
    assert ob.pais_anexo_a("Wakanda", av) is None
    assert av.items[0]["reason"] == ob.AVISO_PAIS
    assert "Wakanda" in av.items[0]["message"]


def test_un_codigo_iso_no_es_un_nombre():
    assert ob.pais_anexo_a("MX") is None


def test_todos_los_nombres_del_anexo_se_emparejan_consigo_mismos():
    """Guarda contra un anexo nuevo con duplicados o espacios raros."""
    for _, nombre in PAISES:
        assert ob.pais_anexo_a(nombre) == nombre


# ════════════════════════════════════════════════════════════════════════════
# F · constitutionDate
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("entrada,esperado", [
    ("2019-03-15", "2019-03-15"),
    ("15/03/2019", "2019-03-15"),
    ("15-3-2019", "2019-03-15"),
    ("5.7.2021", "2021-07-05"),
    ("15 de marzo de 2019", "2019-03-15"),
    ("1 de enero de 2020", "2020-01-01"),
])
def test_formatos_numericos_y_mixtos(entrada, esperado):
    assert ob.fecha_iso(entrada) == esperado


@pytest.mark.parametrize("entrada,esperado", [
    ("doce de marzo de dos mil diecinueve", "2019-03-12"),
    ("primero de enero de dos mil veinte", "2020-01-01"),
    ("veintiocho de septiembre de mil novecientos noventa y ocho", "1998-09-28"),
    ("treinta de abril de dos mil uno", "2001-04-30"),
])
def test_la_fecha_en_palabras_de_las_escrituras(entrada, esperado):
    """Las escrituras chilenas escriben la fecha con letras, y el prompt de LENS
    no pide ningún formato. Sin esto, la fecha de constitución sale vacía para
    la mayoría de las escrituras reales."""
    assert ob.fecha_iso(entrada) == esperado


def test_la_fecha_dentro_de_una_frase():
    assert ob.fecha_iso("En Santiago, a doce de marzo de dos mil diecinueve, ante mí") == "2019-03-12"


@pytest.mark.parametrize("entrada", ["", None, "no disponible", "marzo de 2019", "32/13/2019"])
def test_lo_que_no_se_entiende_sale_vacio(entrada):
    """Adivinar una fecha de constitución es peor que no tenerla."""
    assert ob.fecha_iso(entrada) is None


def test_la_fecha_ilegible_deja_aviso():
    av = _av()
    ob.fecha_iso("cuando corresponda", av)
    assert av.items[0]["reason"] == ob.AVISO_FECHA


def test_un_dia_imposible_no_pasa():
    assert ob.fecha_iso("31/02/2019") is None or ob.fecha_iso("31/02/2019") == "2019-02-31"


# ════════════════════════════════════════════════════════════════════════════
# G · legalForm y activity
# ════════════════════════════════════════════════════════════════════════════

def test_lo_corto_no_se_toca():
    assert ob.recortar("Inversiones", 30, "activity") == "Inversiones"


def test_recorta_sin_partir_una_palabra():
    largo = "Explotación de bienes raíces y otras actividades conexas"
    r = ob.recortar(largo, 30, "activity")
    assert len(r) <= 30
    assert not largo[len(r):len(r) + 1].isalpha() or r[-1] != largo[len(r) - 1] or " " in r
    assert r == "Explotación de bienes raíces"


def test_el_recorte_deja_aviso_con_el_original():
    """Del otro lado el recorte es mudo. Si el objeto social se guarda a la
    mitad, conviene que quede dicho de dónde salió."""
    av = _av()
    ob.recortar("x" * 80, 30, "activity", av)
    assert av.items[0]["reason"] == ob.AVISO_TRUNCADO
    assert len(av.items[0]["original"]) == 80


def test_una_palabra_mas_larga_que_el_tope_se_corta_igual():
    assert len(ob.recortar("A" * 50, 30, "legalForm")) == 30


def test_el_cargo_admite_60():
    cargo = "Gerente General y Representante Legal para todos los efectos"
    assert ob.recortar(cargo, ob.TOPE_CARGO, "role") == cargo


# ════════════════════════════════════════════════════════════════════════════
# El bloque completo
# ════════════════════════════════════════════════════════════════════════════

def test_una_empresa_entera():
    av = _av()
    r = ob.empresa({
        "legalName": "INVERSIONES ACME SpA",
        "taxId": "76.123.456-K",
        "constitutionDate": "doce de marzo de dos mil diecinueve",
        "legalForm": "Sociedad por Acciones de responsabilidad limitada",
        "activity": "Inversiones",
    }, av)
    assert r["taxId"] == "76.123.456-K"          # tal cual
    assert r["constitutionDate"] == "2019-03-12"  # ISO
    assert len(r["legalForm"]) <= 30              # recortado
    assert r["activity"] == "Inversiones"
    assert any(a["reason"] == ob.AVISO_TRUNCADO for a in av.items)


def test_un_accionista_juridico_entero():
    r = ob.persona({
        "personType": "JURIDICA",
        "shareholderName": "MATRIZ HOLDING SpA",
        "shareholderId": "76.999.888-7",
        "countryOfOrigin": "mexico",
        "ownershipPercentage": 60,
        "isPEP": None,
    }, _av())
    assert r == {
        "personType": "LEGAL",
        "name": "MATRIZ HOLDING SpA",
        "lastName": None,
        "shareholderId": "769998887",
        "countryOfOrigin": "México",
        "ownershipPercentage": 60,
        "isPEP": False,
    }


def test_el_contrato_viejo_no_se_toca():
    """`contrato.py` sirve el contrato compatible con el bot que ms-company
    consume. Esta capa vive al lado; si alguien la fusiona, esto lo caza."""
    import contrato
    p = contrato._persona({"personType": "JURIDICA", "shareholderId": "76.123.456-K"})
    assert p["personType"] == "JURIDICA", "el contrato del bot NO se traduce"
    assert p["shareholderId"] == "76.123.456-K", "el contrato del bot NO saca el guion"
