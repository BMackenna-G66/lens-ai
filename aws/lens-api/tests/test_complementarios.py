"""AJ-05 y AJ-06: de qué empresa es un complementario, y qué número es de quién.

Los textos imitan el RUT de la DIAN con sus etiquetas reales —«5. Número de
Identificación Tributaria (NIT)», «35. Razón social», las casillas 100 y 101—,
pero las empresas, los NIT y las cédulas son INVENTADOS: el repo es público.

Lo que se protege, en orden de gravedad:

  · que el RUT de OTRA empresa se reconozca como tal (el dato ajeno precargado
    en un onboarding es el error caro);
  · que el RUT de la MISMA empresa NO se excluya —es el que completa el NIT que
    el certificado no trae— aunque escriba la sigla distinto;
  · que ante la duda no se haga nada.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import complementarios as c  # noqa: E402


def rut_dian(nit_casillas: str, razon: str, cedula_rep: str = "10203040") -> str:
    """El texto de un RUT de la DIAN, con el NIT casilla por casilla."""
    return (
        "Formulario del Registro Único Tributario Hoja Principal 001\n"
        "2. Concepto 02 4. Número de formulario 14000000001\n"
        "5. Número de Identificación Tributaria (NIT) 6. DV 12. Dirección seccional 14. Buzón electrónico\n"
        f"{nit_casillas} Impuestos de Medellín 11\n"
        "IDENTIFICACIÓN\n"
        "35. Razón social\n"
        f"{razon}\n"
        "36. Nombre comercial 37. Sigla\n"
        "Representación\n"
        f"98. Representación REPRS LEGAL PRIN 100. Tipo de documento 13 101. Número de identificación {cedula_rep}\n"
    )


OTRA = rut_dian("9 9 9 9 9 9 0 0 2 5", "EMPRESA FICTICIA DOS S.A.S.")
MISMA = rut_dian("9 9 9 9 9 9 0 0 1 7", "EMPRESA FICTICIA UNO SAS")

PRINCIPAL_CON_NIT = {"taxId": "999.999.001-7", "legalName": "EMPRESA FICTICIA UNO S.A.S."}
PRINCIPAL_SIN_NIT = {"taxId": None, "legalName": "EMPRESA FICTICIA UNO S.A.S."}


# ── Leer la identidad del texto ─────────────────────────────────────────────

def test_el_nit_de_la_casilla_5_se_lee_aunque_venga_digito_por_digito():
    """El formulario imprime cada dígito en su casilla. Y el número de
    formulario, que va antes, no se confunde con el NIT."""
    assert c.tax_id_desde_texto(OTRA) == "9999990025"


def test_la_razon_social_de_la_casilla_35_viene_en_la_linea_siguiente():
    assert c.razon_social_desde_texto(OTRA) == "EMPRESA FICTICIA DOS S.A.S."


def test_la_razon_social_con_dos_puntos_va_en_la_misma_linea():
    assert c.razon_social_desde_texto("RAZÓN SOCIAL: EMPRESA FICTICIA TRES LTDA\nRUT: 1") == \
        "EMPRESA FICTICIA TRES LTDA"


def test_la_razon_social_en_prosa_no_cuenta():
    """«cuya razón social es…» no es una etiqueta: tomar lo que sigue daría una
    razón social que no coincide con nada y excluiría un documento bueno."""
    assert c.razon_social_desde_texto("la sociedad cuya razón social es OTRA, con domicilio") is None


@pytest.mark.parametrize("texto,esperado", [
    ("Rol Único Tributario: 77.000.111-K", "77.000.111-K"),
    ("R.U.T. 77.000.111-5", "77.000.111-5"),
    ("NIT: 999.999.001-7", "999.999.001-7"),
    ("RFC: EFU010101AB1", "EFU010101AB1"),
])
def test_las_otras_etiquetas_tributarias(texto, esperado):
    assert c.tax_id_desde_texto(texto) == esperado


def test_sin_etiqueta_no_hay_identificador():
    assert c.identidad_desde_texto("Un texto cualquiera con el número 12345678.") == \
        {"taxId": None, "legalName": None}


# ── Comparar ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("a,b", [
    ("999.999.001-7", "9999990017"),     # verificador separado vs pegado
    ("999999001", "999.999.001-7"),      # sin verificador vs con él
    ("77.000.111-K", "77000111K"),
    ("EFU010101AB1", "efu 010101 ab1"),
])
def test_el_mismo_identificador_escrito_distinto_coincide(a, b):
    assert c.coinciden(c.nucleo(a), c.nucleo(b))


def test_dos_nit_distintos_no_coinciden():
    assert not c.coinciden(c.nucleo("999.999.001-7"), c.nucleo("999.999.002-5"))


@pytest.mark.parametrize("a,b", [
    ("EMPRESA FICTICIA UNO S.A.S.", "Empresa Ficticia Uno SAS"),
    ("EMPRESA FICTICIA UNO S.A.S. BIC", "EMPRESA FICTICIA UNO"),
    ("Orquídea Ficticia Ltda.", "ORQUIDEA FICTICIA LIMITADA"),
    ("FICTICIA, S.A. DE C.V.", "FICTICIA SA DE CV"),
])
def test_la_razon_social_se_compara_sin_tildes_signos_ni_sigla(a, b):
    assert c.razon_normalizada(a) == c.razon_normalizada(b)


# ── Las tres pruebas de Onboarding ──────────────────────────────────────────

def test_prueba_a_certificado_con_nit_y_rut_de_otra_empresa():
    veredicto, motivo = c.misma_empresa(PRINCIPAL_CON_NIT, c.identidad_desde_texto(OTRA))
    assert veredicto is False
    assert "9999990025" in motivo and "999.999.001-7" in motivo


def test_prueba_b_certificado_sin_nit_y_rut_de_otra_empresa():
    """Sin NIT en el principal, decide la razón social."""
    veredicto, motivo = c.misma_empresa(PRINCIPAL_SIN_NIT, c.identidad_desde_texto(OTRA))
    assert veredicto is False
    assert "EMPRESA FICTICIA DOS" in motivo


def test_prueba_c_rut_de_la_misma_empresa_no_se_excluye():
    """El caso que funcionaba y no se puede romper: el RUT de la MISMA empresa
    completa el NIT que el certificado no trae. Acá escribe «SAS» sin puntos."""
    assert c.misma_empresa(PRINCIPAL_SIN_NIT, c.identidad_desde_texto(MISMA)) == (True, "")
    assert c.misma_empresa(PRINCIPAL_CON_NIT, c.identidad_desde_texto(MISMA)) == (True, "")


def test_manda_el_nit_aunque_la_razon_social_coincida():
    otra_mismo_nombre = rut_dian("9 9 9 9 9 9 0 0 2 5", "EMPRESA FICTICIA UNO S.A.S.")
    assert c.misma_empresa(PRINCIPAL_CON_NIT, c.identidad_desde_texto(otra_mismo_nombre))[0] is False


def test_si_no_hay_con_que_comparar_no_se_decide():
    assert c.misma_empresa({}, c.identidad_desde_texto(OTRA)) == (None, "")
    assert c.misma_empresa(PRINCIPAL_CON_NIT, {"taxId": None, "legalName": None}) == (None, "")


# ── AJ-06 · El código DIAN pegado a la cédula ───────────────────────────────

def test_el_13_pegado_se_quita_si_el_texto_lo_confirma():
    assert c.sin_codigo_dian("1310203040", [MISMA]) == ("10203040", "CC")


def test_tambien_con_la_cedula_escrita_con_puntos():
    assert c.sin_codigo_dian("1310203040", [rut_dian("1", "X", cedula_rep="10.203.040")]) == ("10203040", "CC")


def test_si_el_numero_pegado_figura_en_el_texto_es_el_de_verdad():
    """Una cédula de 10 dígitos puede empezar con 13."""
    assert c.sin_codigo_dian("1310203040", [rut_dian("1", "X", cedula_rep="1310203040")]) is None


def test_si_el_texto_no_lo_confirma_no_se_toca():
    assert c.sin_codigo_dian("1310203040", ["un texto sin el número"]) is None
    assert c.sin_codigo_dian("1310203040", []) is None


def test_un_numero_que_no_empieza_con_un_codigo_dian_no_se_toca():
    assert c.sin_codigo_dian("10203040", [MISMA]) is None
    assert c.sin_codigo_dian("9910203040", [MISMA]) is None
