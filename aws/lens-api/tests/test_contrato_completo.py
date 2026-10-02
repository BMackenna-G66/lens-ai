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

#: §6.9 — EP-5, el bloque `company`. Es TAMBIÉN el de EP-3: la especificación
#: dice literal «`company`: mismo contenido que EP-5».
#:
#: `address` faltaba en esta lista desde la Fase 6, y por eso pasó desapercibido
#: hasta la 7. Es el campo que Onboarding usa para precargar el domicilio por
#: componentes, y sin él esa pantalla queda vacía.
CAMPOS_EMPRESA = (
    "legalName",
    "taxId",
    "taxIdType",
    "constitutionDate",
    "legalForm",
    "address",
    "activity",
    # §11, no §6.9: la especificación lo propone para EP-5 en la Fase 2 y
    # Benjamín aprobó construirlo. `boolean | null`.
    "jointAdministration",
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

def test_el_formato_decide_SOLO_cuando_no_se_sabe_el_pais():
    """Sin país declarado, una forma inequívoca de RUT alcanza."""
    assert ob.tipo_tax_id("76.123.456-K") == "RUT"
    assert ob.tipo_tax_id("76123456-K") == "RUT"


def test_el_pais_declarado_le_gana_al_formato():
    """La corrección de la segunda auditoría, y es la que más importa.

    Un NIT colombiano de ocho dígitos con verificador tiene EXACTAMENTE la forma
    de un RUT chileno sin puntos: nada en el string los separa. Y el país viene
    DECLARADO en el cuerpo de EP-1, no inferido — es información dura. Hacer que
    una heurística de formato le gane a un dato declarado es descartar lo que se
    sabe a favor de lo que se adivina.
    """
    assert ob.tipo_tax_id("80012345-6", "colombia") == "NIT"
    assert ob.tipo_tax_id("12345678-9", "colombia") == "NIT"


def test_cuando_el_formato_contradice_al_pais_gana_el_pais_pero_se_avisa():
    """Un RUT con K declarado como colombiano no es ni NIT ni RUT: es una señal
    de que algo vino mal más arriba. Elegir en silencio la tapa."""
    av = ob.Avisos()
    assert ob.tipo_tax_id("76.123.456-K", "colombia", av) == "NIT"
    assert any(a["reason"] == ob.AVISO_TAX_ID_DISCREPA for a in av.items)


def test_sin_identificador_no_hay_tipo_de_identificador():
    """§6.9 usa la ausencia de `taxId` para dejar el contraste en NOT_COMPARABLE;
    un `taxIdType` poblado ahí es ruido justo en el camino que decide eso."""
    r = ob.empresa({"legalName": "ACME SpA", "country": "chile"}, ob.Avisos())
    assert r["taxId"] is None
    assert r["taxIdType"] is None


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
    assert ob.tipo_tax_id("12345678-9") is None    # ambiguo: NIT de 8 o RUT sin puntos
    assert ob.tipo_tax_id("", "wakanda") is None


# ════════════════════════════════════════════════════════════════════════════
# identificationType · se DERIVA cuando el documento no lo declara
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("pais,tipo,esperado", [
    ("chile", "NATURAL", "RUT"), ("chile", "LEGAL", "RUT"),
    ("colombia", "NATURAL", "CC"), ("colombia", "LEGAL", "NIT"),
    ("peru", "NATURAL", "DNI"), ("peru", "LEGAL", "RUC"),
])
def test_se_deriva_del_pais_y_del_tipo_de_persona(pais, tipo, esperado):
    """§6.8 y §6.10 lo describen como «derivado del formato y del país». Va por
    país y no por formato porque los formatos no se distinguen: una cédula
    colombiana y un DNI peruano son los dos una tira de dígitos."""
    r = ob.persona({"personType": tipo, "shareholderName": "X",
                    "countryOfOrigin": pais}, ob.Avisos())
    assert r["identificationType"] == esperado


def test_lo_declarado_le_gana_a_la_derivacion():
    r = ob.persona({"personType": "NATURAL", "shareholderName": "X",
                    "countryOfOrigin": "colombia", "identificationType": "PASAPORTE"},
                   ob.Avisos())
    assert r["identificationType"] == "Pasaporte"


def test_sin_pais_no_se_deriva():
    r = ob.persona({"personType": "NATURAL", "shareholderName": "X"}, ob.Avisos())
    assert r["identificationType"] is None


# ════════════════════════════════════════════════════════════════════════════
# es_pep · la inconsistencia entre dos helpers vecinos
# ════════════════════════════════════════════════════════════════════════════

def test_es_pep_entiende_el_tipo_crudo_igual_que_tipo_persona():
    """`tipo_persona` es idempotente y acepta las dos formas; `es_pep` aceptaba
    solo la traducida. Llamado suelto con «JURIDICA» devolvía None donde el
    contrato pide False."""
    assert ob.es_pep(None, "LEGAL") is False
    assert ob.es_pep(None, "JURIDICA") is False


# ════════════════════════════════════════════════════════════════════════════
# §6.6 — EP-2, el estado
# ════════════════════════════════════════════════════════════════════════════
# Este endpoint faltaba en este archivo, y era el ÚNICO que faltaba. La auditoría
# de las fases 1 a 7 encontró un campo ausente justo acá — `error` no salía
# cuando no había error—, que es exactamente lo que este archivo existe para
# atrapar. El agujero no estaba en el código: estaba en el guardia.
#
# §6.2 lo dice para todos: «Cada endpoint devuelve siempre los mismos campos, en
# cualquier estado». Los cuatro ejemplos de §6.6 —NOT_STARTED, IN_PROGRESS,
# INCOMPLETE y FAILED— muestran las ocho claves, con `"error": null` explícito en
# los tres primeros.
#
# En JavaScript un campo ausente casi no se nota: `r.error?.reason` no falla.
# ms-company es Java, y ahí un campo que no viene no es lo mismo que uno nulo.

CAMPOS_EP2 = (
    "companyId",
    "analysisId",
    "status",
    "startedAt",
    "finishedAt",
    "error",
    "warnings",
    "schemaVersion",
)

#: Los cinco estados, con una corrida de ejemplo para cada uno. `None` = no hay
#: corrida, que es como se representa `NOT_STARTED`.
CORRIDAS_EP2 = {
    "NOT_STARTED": None,
    "IN_PROGRESS": {"analysisId": "a1", "status": "IN_PROGRESS", "startedAt": "2026-09-29T10:00:00Z",
                    "startedTs": 4_102_444_800, "finishedAt": None, "warnings": [], "error": None},
    "COMPLETED": {"analysisId": "a1", "status": "COMPLETED", "startedAt": "2026-09-29T10:00:00Z",
                  "startedTs": 4_102_444_800, "finishedAt": "2026-09-29T10:02:00Z",
                  "warnings": [], "error": None},
    "INCOMPLETE": {"analysisId": "a1", "status": "INCOMPLETE", "startedAt": "2026-09-29T10:00:00Z",
                   "startedTs": 4_102_444_800, "finishedAt": "2026-09-29T10:02:00Z",
                   "warnings": [{"reason": "PARTIALLY_ILLEGIBLE", "objectKey": "a.pdf",
                                 "message": "Páginas 12 a 18 sin texto legible"}],
                   "error": None},
    "FAILED": {"analysisId": "a1", "status": "FAILED", "startedAt": "2026-09-29T10:00:00Z",
               "startedTs": 4_102_444_800, "finishedAt": "2026-09-29T10:04:00Z", "warnings": [],
               "error": {"reason": "LENS_EXTRACTION_FAILED", "message": "…"}},
}


@pytest.mark.parametrize("estado", sorted(CORRIDAS_EP2))
def test_ep2_entrega_sus_campos_en_todos_los_estados(estado):
    import companies as co

    r = co.estado_de("48213", CORRIDAS_EP2[estado])
    faltan = [c for c in CAMPOS_EP2 if c not in r]
    assert not faltan, f"EP-2 en {estado} pide estos campos y no salen: {faltan}"


@pytest.mark.parametrize("estado", sorted(CORRIDAS_EP2))
def test_ep2_no_entrega_campos_de_mas(estado):
    import companies as co

    r = co.estado_de("48213", CORRIDAS_EP2[estado])
    sobran = [c for c in r if c not in CAMPOS_EP2]
    assert not sobran, f"EP-2 no define estos campos: {sobran}"


@pytest.mark.parametrize("estado", ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "INCOMPLETE"])
def test_el_error_de_ep2_es_null_cuando_no_hay_error(estado):
    """La clave viaja siempre; lo que cambia es su valor.

    Que en `INCOMPLETE` vaya en `null` no es un detalle: ahí el análisis SIRVE, y
    mandar un error haría que Onboarding descarte un resultado utilizable.
    """
    import companies as co

    assert co.estado_de("48213", CORRIDAS_EP2[estado])["error"] is None


def test_el_error_de_ep2_trae_reason_y_message_cuando_falla():
    import companies as co

    e = co.estado_de("48213", CORRIDAS_EP2["FAILED"])["error"]
    assert e is not None and {"reason", "message"} <= set(e)


# ════════════════════════════════════════════════════════════════════════════
# Los SOBRES de cada endpoint — §6.5, §6.7 y §6.8 a §6.10
# ════════════════════════════════════════════════════════════════════════════
# El agujero era más grande de lo que decía la auditoría. Este archivo vigilaba
# los SERIALIZADORES DE BLOQUE —`persona`, `representante`, `empresa`— pero
# ninguno de los SOBRES: qué claves de primer nivel devuelve cada endpoint.
# EP-2 fue el primero en quedar cubierto, y por eso el campo faltante apareció
# ahí. Los otros cinco tenían el mismo agujero, sin nadie mirando.
#
# Un campo DE MÁS también cuenta. No es inofensivo: un deserializador estricto
# —ms-company es Java— puede rechazarlo, y en cuanto alguien del otro lado lo
# usa se vuelve contrato de hecho, imposible de sacar sin avisar.

#: §6.5 — EP-1, el `202`. Cinco campos: no hay `finishedAt` ni `error` porque
#: cuando se responde, la corrida recién arranca.
CAMPOS_EP1 = ("companyId", "analysisId", "status", "startedAt", "schemaVersion")

#: §6.7 — EP-3, el resultado completo.
CAMPOS_EP3 = ("companyId", "analysisId", "status", "country", "fields", "company",
              "legalRepresentatives", "documents", "warnings", "schemaVersion")

#: §6.8 a §6.10 — las tres vistas. Mismo sobre, distinto bloque.
SOBRES_SECCION = {
    "legal-representatives": "legalRepresentatives",
    "company": "company",
    "shareholders": "businessShareholders",
}


def _corrida_terminada() -> dict:
    return {
        "companyId": "48213", "analysisId": "a1", "status": "COMPLETED",
        "startedAt": "2026-09-29T10:00:00Z", "finishedAt": "2026-09-29T10:02:00Z",
        "startedTs": 4_102_444_800, "country": "chile", "warnings": [], "error": None,
        "schemaVersion": "1.0.0",
        "result": {"fields": [{"field": "Razón Social", "value": "X SpA"}],
                   "documents": [], "detectedCountry": "chile",
                   "legalRepresentatives": [], "directOwnership": [],
                   "indirectShareholders": []},
    }


def test_ep3_entrega_su_sobre_completo():
    import companies as co

    r = co.resultado_de("48213", _corrida_terminada())
    faltan = [c for c in CAMPOS_EP3 if c not in r]
    assert not faltan, f"EP-3 pide estos campos y no salen: {faltan}"


def test_ep3_no_entrega_campos_de_mas():
    import companies as co

    r = co.resultado_de("48213", _corrida_terminada())
    sobran = [c for c in r if c not in CAMPOS_EP3]
    assert not sobran, f"EP-3 no define estos campos: {sobran}"


def test_la_empresa_no_entrega_campos_de_mas():
    """Faltaba el par de `test_la_empresa_entrega_sus_campos`: se vigilaba que no
    faltara nada, pero no que no sobrara."""
    r = ob.empresa({"legalName": "X", "taxId": "76.1-2"}, ob.Avisos())
    sobran = [c for c in r if c not in CAMPOS_EMPRESA]
    assert not sobran, f"EP-5 no define estos campos: {sobran}"


def test_ep1_entrega_su_sobre_y_nada_mas():
    """El `202` son CINCO campos. El modo del disparo —si fue asíncrono o en
    línea— es información de operación y vive en `/salud`: acá sería un sexto
    campo que se vuelve contrato de hecho en cuanto alguien lo use."""
    import json as _json
    import sys as _sys

    import companies as co
    import corridas
    import disparador

    corridas._reiniciar_memoria()
    asincrono = disparador.ASINCRONO
    disparador.ASINCRONO = False
    try:
        ev = {
            "rawPath": "/v1/companies/48213/analyses",
            "requestContext": {"http": {"method": "POST"}},
            "headers": {},
            "body": _json.dumps({"environment": "prod", "country": "chile",
                                 "documents": [{"s3Uri": "s3://g66-company/prod/48213/x.pdf",
                                                "documentType": "company_deeds_document"}]}),
        }

        class _Boto:
            @staticmethod
            def client(_):
                class _S3:
                    def head_object(self, **__):
                        raise RuntimeError("NoSuchKey")
                return _S3()

        _sys.modules["boto3"] = _Boto
        r = co.manejar(ev, ev["rawPath"], "POST", analizar=lambda *a, **k: {"campos": []})
        cuerpo = _json.loads(r["body"])
    finally:
        disparador.ASINCRONO = asincrono
        _sys.modules.pop("boto3", None)
        corridas._reiniciar_memoria()

    assert r["statusCode"] == 202
    assert set(cuerpo) == set(CAMPOS_EP1), f"EP-1 devuelve {sorted(set(cuerpo) ^ set(CAMPOS_EP1))} de diferencia"


@pytest.mark.parametrize("seccion,clave", sorted(SOBRES_SECCION.items()))
def test_las_tres_vistas_entregan_su_sobre_y_nada_mas(seccion, clave):
    """Mismo sobre para las tres, distinto bloque: `companyId`, `analysisId`, el
    bloque, y `schemaVersion`. Nada del resultado completo se filtra."""
    import json as _json

    import companies as co
    import corridas

    corridas._reiniciar_memoria()
    reg = _corrida_terminada()
    corridas._memoria[corridas.clave("prod", "48213")] = [{**reg, "sk": "z"}]
    try:
        ruta = f"/v1/companies/48213/analysis/{seccion}"
        r = co.manejar({
            "rawPath": ruta,
            "requestContext": {"http": {"method": "GET"}},
            "headers": {},
            "queryStringParameters": {"environment": "prod"},
        }, ruta, "GET", analizar=lambda *a, **k: {})
        cuerpo = _json.loads(r["body"])
    finally:
        corridas._reiniciar_memoria()

    assert r["statusCode"] == 200
    assert set(cuerpo) == {"companyId", "analysisId", clave, "schemaVersion"}
