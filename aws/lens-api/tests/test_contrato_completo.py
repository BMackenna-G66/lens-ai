"""¿Sale TODO lo que el contrato pide? Campo por campo.

── Por qué existe este archivo ─────────────────────────────────────────────
La auditoría de las fases 5 y 6 encontró tres campos que el contrato exige y que
simplemente no estaban: `fullName`, `shareholderName` e `identificationType`.
**La suite de 244 tests pasaba igual.**

Y tenía que pasar: esos tests verifican que lo que sale esté **bien formado** —
que `JURIDICA` se traduzca, que el país tenga la grafía del anexo, que la fecha
sea ISO—. Ninguno verifica que esté **completo**. Son dos preguntas distintas y
solo una estaba cubierta.

Este archivo cubre la otra, y es el que hace que el próximo campo faltante
aparezca solo en vez de en una auditoría.

── De dónde sale la lista ──────────────────────────────────────────────────
De la especificación, §6.8 (EP-4) y §6.10 (EP-6), y los vocabularios de §7.5.
Está transcripta abajo a mano y a propósito: si alguien agrega un campo al
serializador sin agregarlo acá, el test no lo pide y el campo nuevo no molesta;
pero si tech agrega un campo al contrato, actualizar esta lista es lo primero
que se hace, y ahí el test dice exactamente qué falta.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import onboarding as ob  # noqa: E402


# ════════════════════════════════════════════════════════════════════════════
# La lista del contrato, transcripta
# ════════════════════════════════════════════════════════════════════════════

#: §6.8 — EP-4, siete campos por representante. Los siete son obligatorios.
CAMPOS_EP4 = (
    "fullName",
    "name",
    "lastName",
    "personType",
    "identificationType",
    "identificationNumber",
    "role",
)

#: §6.10 — EP-6, diez campos por accionista.
CAMPOS_EP6 = (
    "personType",
    "shareholderName",
    "shareholderId",
    "countryOfOrigin",
    "identificationType",
    "lastName",
    "name",
    "ownershipPercentage",
    "indirectShareholders",
    "isPEP",
)

#: §6.9 — EP-5, el bloque `company`.
CAMPOS_EMPRESA = (
    "legalName",
    "taxId",
    "taxIdType",
    "constitutionDate",
    "legalForm",
    "activity",
)

#: §7.5 — vocabularios, que NO son el mismo por endpoint.
VOCAB_EP4 = {"RUT", "CC", "DNI", "CE", "PASS", "PPT", "CV", "CP", "DRIVERS"}
VOCAB_EP6 = {"RUT", "RUC", "DNI", "CC", "CE", "NIT", "RFC", "CURP", "INE",
             "CUIT", "CUIL", "CPF", "CNPJ", "Pasaporte", "Tax ID", "EIN", "VAT Number"}


# ── Entradas de ejemplo, con TODO lo que la extracción puede dar ────────────

def _accionista_natural() -> dict:
    return {
        "personType": "NATURAL",
        "shareholderName": "PEREZ GOMEZ ANGELA VIVIANA",
        "name": "ANGELA VIVIANA",
        "lastName": "PEREZ GOMEZ",
        "shareholderId": "1.020.304-5",
        "identificationType": "CC",
        "countryOfOrigin": "colombia",
        "ownershipPercentage": 40,
        "isPEP": None,
    }


def _accionista_juridico() -> dict:
    return {
        "personType": "JURIDICA",
        "shareholderName": "INVERSIONES ACME SpA",
        "shareholderId": "76.123.456-K",
        "identificationType": "NIT",
        "countryOfOrigin": "chile",
        "ownershipPercentage": 60,
        "indirectShareholders": [_accionista_natural()],
    }


def _representante() -> dict:
    return {
        "personType": "NATURAL",
        "shareholderName": "JUAN CARLOS PÉREZ GÓMEZ",
        "name": "JUAN CARLOS",
        "lastName": "PÉREZ GÓMEZ",
        "shareholderId": "12.345.678-9",
        "identificationType": "RUT",
        "countryOfOrigin": "chile",
        "position": "Gerente General",
    }


# ════════════════════════════════════════════════════════════════════════════
# COMPLETITUD · están todos los campos, y ninguno de más
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("entrada", [_accionista_natural(), _accionista_juridico()])
def test_ep6_entrega_los_diez_campos(entrada):
    r = ob.persona(entrada, ob.Avisos())
    faltan = [c for c in CAMPOS_EP6 if c not in r]
    assert not faltan, f"EP-6 pide estos campos y no salen: {faltan}"


@pytest.mark.parametrize("entrada", [_accionista_natural(), _accionista_juridico()])
def test_ep6_no_entrega_campos_de_mas(entrada):
    """Un campo que el contrato no define obliga al consumidor a decidir si lo
    ignora o lo guarda, y esa decisión no debería existir."""
    r = ob.persona(entrada, ob.Avisos())
    sobran = [c for c in r if c not in CAMPOS_EP6]
    assert not sobran, f"EP-6 no define estos campos: {sobran}"


def test_ep4_entrega_los_siete_campos():
    r = ob.representante(_representante(), ob.Avisos())
    faltan = [c for c in CAMPOS_EP4 if c not in r]
    assert not faltan, f"EP-4 pide estos campos y no salen: {faltan}"


def test_ep4_no_entrega_campos_de_mas():
    r = ob.representante(_representante(), ob.Avisos())
    sobran = [c for c in r if c not in CAMPOS_EP4]
    assert not sobran, f"EP-4 no define estos campos: {sobran}"


def test_la_empresa_entrega_sus_campos():
    r = ob.empresa({"legalName": "X", "taxId": "76.1-2", "constitutionDate": "2019-03-15"}, ob.Avisos())
    faltan = [c for c in CAMPOS_EMPRESA if c not in r]
    assert not faltan, f"EP-5 pide estos campos y no salen: {faltan}"


# ════════════════════════════════════════════════════════════════════════════
# EL TEXTO ORIGINAL · lo que NO se puede reconstruir después
# ════════════════════════════════════════════════════════════════════════════

def test_el_accionista_conserva_el_nombre_tal_cual():
    """§7.4: «`fullName` y `shareholderName` conservan siempre el texto original».

    No es un campo de adorno: la partición NO es reversible. Con el orden
    registral colombiano, concatenar `name` + `lastName` da
    «ANGELA VIVIANA PEREZ GOMEZ», que no es lo que decía la escritura. Quien
    después cruce contra el registro necesita el nombre como está escrito.
    """
    r = ob.persona(_accionista_natural(), ob.Avisos())
    assert r["shareholderName"] == "PEREZ GOMEZ ANGELA VIVIANA"


def test_el_representante_conserva_el_nombre_tal_cual():
    r = ob.representante(_representante(), ob.Avisos())
    assert r["fullName"] == "JUAN CARLOS PÉREZ GÓMEZ"


def test_la_razon_social_se_conserva_entera_en_juridicas():
    r = ob.persona(_accionista_juridico(), ob.Avisos())
    assert r["shareholderName"] == "INVERSIONES ACME SpA"
    assert r["name"] == "INVERSIONES ACME SpA"
    assert r["lastName"] is None


# ════════════════════════════════════════════════════════════════════════════
# identificationType · vocabularios DISTINTOS por endpoint
# ════════════════════════════════════════════════════════════════════════════

def test_el_accionista_usa_el_vocabulario_de_ep6():
    r = ob.persona(_accionista_natural(), ob.Avisos())
    assert r["identificationType"] in VOCAB_EP6


def test_el_representante_usa_el_vocabulario_de_ep4():
    r = ob.representante(_representante(), ob.Avisos())
    assert r["identificationType"] in VOCAB_EP4


def test_pasaporte_se_escribe_distinto_en_cada_endpoint():
    """El caso que prueba que los vocabularios no son el mismo: EP-4 dice `PASS`
    y EP-6 dice `Pasaporte`. Un vocabulario único los rompería a los dos."""
    acc = ob.persona({**_accionista_natural(), "identificationType": "PASAPORTE"}, ob.Avisos())
    rep = ob.representante({**_representante(), "identificationType": "PASAPORTE"}, ob.Avisos())
    assert acc["identificationType"] == "Pasaporte"
    assert rep["identificationType"] == "PASS"


def test_un_tipo_que_no_esta_en_el_vocabulario_sale_null():
    """`null` es un valor válido del contrato; un valor inventado no."""
    r = ob.persona({**_accionista_natural(), "identificationType": "LIBRETA CIVICA"}, ob.Avisos())
    assert r["identificationType"] is None


# ════════════════════════════════════════════════════════════════════════════
# identificationNumber · el nombre de la clave, y su formato
# ════════════════════════════════════════════════════════════════════════════

def test_el_representante_lo_llama_identification_number_y_va_tal_cual():
    """El VALOR ya estaba bien —tal como figura, no solo dígitos— pero salía con
    el nombre `shareholderId`, que es la clave de EP-6, no la de EP-4."""
    r = ob.representante(_representante(), ob.Avisos())
    assert r["identificationNumber"] == "12.345.678-9"
    assert "shareholderId" not in r


def test_el_accionista_lo_llama_shareholder_id_y_va_solo_con_digitos():
    r = ob.persona(_accionista_natural(), ob.Avisos())
    assert r["shareholderId"] == "10203045"


# ════════════════════════════════════════════════════════════════════════════
# La cadena societaria
# ════════════════════════════════════════════════════════════════════════════

def test_una_juridica_lleva_su_cadena():
    r = ob.persona(_accionista_juridico(), ob.Avisos())
    assert isinstance(r["indirectShareholders"], list)
    assert r["indirectShareholders"][0]["shareholderName"] == "PEREZ GOMEZ ANGELA VIVIANA"


def test_una_natural_lleva_la_cadena_vacia():
    """La clave va SIEMPRE: el consumidor no tiene que defenderse de campos
    ausentes. Y `[]` no es lo mismo que «no se sabe»."""
    r = ob.persona(_accionista_natural(), ob.Avisos())
    assert r["indirectShareholders"] == []


def test_la_cadena_no_se_inventa():
    sin_cadena = {k: v for k, v in _accionista_juridico().items() if k != "indirectShareholders"}
    assert ob.persona(sin_cadena, ob.Avisos())["indirectShareholders"] == []


# ════════════════════════════════════════════════════════════════════════════
# El corte de respaldo · Colombia es donde vive este documento
# ════════════════════════════════════════════════════════════════════════════

def test_el_camino_normal_es_que_el_modelo_ya_partio_el_nombre():
    """El prompt de LENS pide `name` y `lastName` partidos y los parte CON EL
    DOCUMENTO A LA VISTA. Cuando vienen, mandan: no se vuelve a adivinar."""
    av = ob.Avisos()
    r = ob.persona(_accionista_natural(), av)
    assert (r["name"], r["lastName"]) == ("ANGELA VIVIANA", "PEREZ GOMEZ")
    assert not any(a["reason"] == ob.AVISO_NOMBRE_ADIVINADO for a in av.items)


def test_el_respaldo_no_invierte_el_orden_registral_colombiano():
    """El hallazgo de la auditoría. La regla literal de §7.4 —cuatro palabras,
    las dos primeras son el nombre— asume orden chileno y da vuelta la persona:

        PEREZ GOMEZ ANGELA VIVIANA → name «PEREZ GOMEZ», lastName «ANGELA VIVIANA»

    El propio prompt de LENS ya trae ese ejemplo resuelto al derecho, con la
    explicación de que un error acá se repite en todo el registro colombiano.
    """
    sin_partir = {"personType": "NATURAL",
                  "shareholderName": "PEREZ GOMEZ ANGELA VIVIANA",
                  "countryOfOrigin": "colombia"}
    r = ob.persona(sin_partir, ob.Avisos())
    assert r["name"] == "ANGELA VIVIANA"
    assert r["lastName"] == "PEREZ GOMEZ"


def test_el_respaldo_sigue_leyendo_chile_como_antes():
    sin_partir = {"personType": "NATURAL",
                  "shareholderName": "JUAN ANDRES PEREZ SOTO",
                  "countryOfOrigin": "chile"}
    r = ob.persona(sin_partir, ob.Avisos())
    assert r["name"] == "JUAN ANDRES"
    assert r["lastName"] == "PEREZ SOTO"


def test_adivinar_el_corte_SIEMPRE_deja_aviso():
    """Dos apellidos y dos nombres son indistinguibles sin el documento. El país
    mejora la conjetura pero no la elimina, así que queda dicho."""
    av = ob.Avisos()
    ob.persona({"personType": "NATURAL", "shareholderName": "PEREZ GOMEZ ANGELA VIVIANA",
                "countryOfOrigin": "colombia"}, av)
    avisos = [a for a in av.items if a["reason"] == ob.AVISO_NOMBRE_ADIVINADO]
    assert len(avisos) == 1
    assert "PEREZ GOMEZ ANGELA VIVIANA" in avisos[0]["message"]


def test_el_original_permite_deshacer_una_particion_equivocada():
    """La red de seguridad: aunque el corte salga mal, el texto original está.

    Concatenar name + lastName NO lo reconstruye — por eso el campo existe."""
    sin_partir = {"personType": "NATURAL",
                  "shareholderName": "PEREZ GOMEZ ANGELA VIVIANA",
                  "countryOfOrigin": "colombia"}
    r = ob.persona(sin_partir, ob.Avisos())
    assert r["shareholderName"] == "PEREZ GOMEZ ANGELA VIVIANA"
    assert f"{r['name']} {r['lastName']}" != r["shareholderName"]


# ════════════════════════════════════════════════════════════════════════════
# taxIdType · el cuarto campo faltante, que lo encontró este archivo
# ════════════════════════════════════════════════════════════════════════════

def test_el_rut_se_reconoce_por_su_forma_sin_saber_el_pais():
    """Un documento chileno puede venir con el país mal detectado; el RUT se
    reconoce solo. Es la única de la región con esa forma."""
    assert ob.tipo_tax_id("76.123.456-K") == "RUT"
    assert ob.tipo_tax_id("76123456-7", "colombia") == "RUT"


@pytest.mark.parametrize("pais,esperado", [
    ("colombia", "NIT"), ("peru", "RUC"), ("Perú", "RUC"),
    ("argentina", "CUIT"), ("mexico", "RFC"), ("México", "RFC"),
])
def test_para_el_resto_el_pais_es_la_unica_senal(pais, esperado):
    """Los identificadores de Colombia, Perú y Argentina son todos dígitos: no
    se distinguen entre sí por la forma."""
    assert ob.tipo_tax_id("900123456", pais) == esperado


def test_sin_forma_ni_pais_no_se_inventa():
    assert ob.tipo_tax_id("900123456") is None
    assert ob.tipo_tax_id("", "wakanda") is None


# ════════════════════════════════════════════════════════════════════════════
# es_pep · la inconsistencia entre dos helpers vecinos
# ════════════════════════════════════════════════════════════════════════════

def test_es_pep_entiende_el_tipo_crudo_igual_que_tipo_persona():
    """`tipo_persona` es idempotente y acepta las dos formas; `es_pep` aceptaba
    solo la traducida. Llamado suelto con «JURIDICA» devolvía None donde el
    contrato pide False."""
    assert ob.es_pep(None, "LEGAL") is False
    assert ob.es_pep(None, "JURIDICA") is False
