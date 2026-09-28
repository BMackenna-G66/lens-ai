"""El catálogo de errores y avisos hacia Onboarding B2B (Fase 5 del plan).

Lo que estos tests protegen no es el código: es el **contrato publicado**. Un
integrador programa contra esta lista de `reason`. Si lo que el servicio emite y
lo que el catálogo dice se separan, el integrador maneja un caso que no llega y
no maneja el que sí — y ninguna de las dos cosas se ve hasta producción.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import errores as er  # noqa: E402
import onboarding as ob  # noqa: E402


# ════════════════════════════════════════════════════════════════════════════
# Los tres canales son tres, y no se mezclan
# ════════════════════════════════════════════════════════════════════════════

def test_ningun_reason_esta_en_dos_canales():
    """Un mismo nombre en dos canales haría que el integrador no sepa si el
    análisis sirve o no, que es la única pregunta que los separa."""
    assert set(er.HTTP) & set(er.FALLO) == set()
    assert set(er.HTTP) & set(er.AVISO) == set()
    assert set(er.FALLO) & set(er.AVISO) == set()


def test_el_indice_junta_los_tres_sin_perder_ninguno():
    assert len(er.TODOS) == len(er.HTTP) + len(er.FALLO) + len(er.AVISO)


def test_la_clave_del_diccionario_es_el_nombre():
    """Guarda contra un copy-paste que deje la clave de otro `reason`."""
    for canal in (er.HTTP, er.FALLO, er.AVISO):
        for clave, r in canal.items():
            assert clave == r.nombre


# ════════════════════════════════════════════════════════════════════════════
# Canal 1 · lo que viene del Anexo B va con SU código, no con uno inventado
# ════════════════════════════════════════════════════════════════════════════

#: Copiado del Anexo B el 28-09-2026. Si tech manda un anexo nuevo y algún
#: código cambia, este test falla — que es exactamente lo que tiene que pasar.
ANEXO_B = {
    "UNAUTHORIZED":                 ("000401", 401),
    "BAD_REQUEST":                  ("000400", 400),
    "NOT_FOUND":                    ("000404", 404),
    "CONFLICT":                     ("000409", 409),
    "TOO_MANY_REQUESTS":            ("000429", 429),
    "SERVICE_UNAVAILABLE":          ("000503", 503),
    "GATEWAY_TIMEOUT":              ("000504", 504),
    "INVALID_DOCUMENT_TYPE":        ("000619", 400),
    "FILE_EXTENSION_NOT_SUPPORTED": ("032401", 400),
    "FILE_SIZE_NOT_IN_RANGE":       ("032402", 400),
    "DOCUMENT_TYPE_NOT_MATCH":      ("000612", None),
}


@pytest.mark.parametrize("nombre,esperado", sorted(ANEXO_B.items()))
def test_los_codigos_corporativos_son_los_del_anexo(nombre, esperado):
    code, http = esperado
    r = er.TODOS[nombre]
    assert r.code == code, f"{nombre}: el código no es el del Anexo B"
    if http is not None:
        assert r.http == http, f"{nombre}: el HTTP no es el del Anexo B"


def test_lo_adoptado_del_anexo_no_figura_como_pendiente():
    """Pedirle a Arquitectura algo que ya existe cuesta una vuelta entera."""
    for nombre in ANEXO_B:
        assert er.TODOS[nombre].pendiente is False


def test_document_type_not_match_se_adopta_en_vez_de_pedir_uno_nuevo():
    """El Anexo B ya tiene «Error response when document type does not match
    expected» (000612). Pedir un `LENS_DOCUMENT_TYPE_MISMATCH` sería duplicarlo.
    """
    assert "DOCUMENT_TYPE_NOT_MATCH" in er.FALLO
    assert "LENS_DOCUMENT_TYPE_MISMATCH" not in er.TODOS


# ════════════════════════════════════════════════════════════════════════════
# Canal 2 · lo que hay que pedir, y solo eso
# ════════════════════════════════════════════════════════════════════════════

def test_son_cuatro_los_que_faltan_no_cinco():
    assert er.PENDIENTES == (
        "LENS_DOCUMENT_DOWNLOAD_FAILED",
        "LENS_DOCUMENT_NOT_READABLE",
        "LENS_EXTRACTION_FAILED",
        "LENS_REQUIRED_DATA_MISSING",
    )


def test_lo_pendiente_no_tiene_codigo_inventado():
    """Un código lo asigna Arquitectura. Inventarlo produce una colisión que
    aparece recién cuando alguien más lo usa."""
    for nombre in er.PENDIENTES:
        assert er.TODOS[nombre].code is None


def test_solo_los_propios_de_lens_llevan_prefijo():
    """El prefijo dice «esto solo pasa adentro de LENS». Ponérselo a algo
    adoptado del catálogo corporativo lo volvería un nombre nuevo."""
    for nombre, r in er.TODOS.items():
        if nombre.startswith("LENS_"):
            assert r.pendiente, f"{nombre} lleva prefijo pero no es propio"
        else:
            assert not r.pendiente, f"{nombre} es propio pero no lleva prefijo"


# ════════════════════════════════════════════════════════════════════════════
# La regla irrenunciable del plan
# ════════════════════════════════════════════════════════════════════════════

def test_el_timeout_y_la_caida_no_son_el_mismo_motivo():
    """Del plan: «tienen la misma consecuencia —consumen intento— pero no el
    mismo diagnóstico». Fusionarlos deja sin saber si hay que subir un timeout
    o levantar un servicio."""
    t, s = er.HTTP["GATEWAY_TIMEOUT"], er.HTTP["SERVICE_UNAVAILABLE"]
    assert t.nombre != s.nombre
    assert t.http != s.http
    assert t.descripcion != s.descripcion


# ════════════════════════════════════════════════════════════════════════════
# Las funciones que arman el cuerpo
# ════════════════════════════════════════════════════════════════════════════

def test_error_http_devuelve_el_status_del_catalogo():
    status, cuerpo = er.error_http("CONFLICT", "Ya hay una corrida en curso.")
    assert status == 409
    assert cuerpo["error"]["reason"] == "CONFLICT"
    assert cuerpo["error"]["message"] == "Ya hay una corrida en curso."


def test_sin_mensaje_usa_la_descripcion_del_catalogo():
    _, cuerpo = er.error_http("UNAUTHORIZED")
    assert cuerpo["error"]["message"] == er.HTTP["UNAUTHORIZED"].descripcion


def test_un_reason_desconocido_no_inventa_uno_nuevo():
    """El consumidor tiene una lista cerrada: un valor nuevo lo deja sin
    manejar. Mismo criterio que `contrato.error` con AWS_ERROR."""
    status, cuerpo = er.error_http("ALGO_QUE_NO_EXISTE")
    assert status == 503
    assert cuerpo["error"]["reason"] == "SERVICE_UNAVAILABLE"


def test_el_aviso_siempre_trae_object_key():
    """Aunque vaya vacío: el contrato lo define y un consumidor no tiene que
    defenderse de campos ausentes."""
    a = er.aviso("PARTIALLY_ILLEGIBLE")
    assert "objectKey" in a and a["objectKey"] == ""


def test_el_fallo_desconocido_cae_en_extraction_failed():
    assert er.fallo("CUALQUIERA")["reason"] == "LENS_EXTRACTION_FAILED"


# ════════════════════════════════════════════════════════════════════════════
# Deriva entre el catálogo y lo que el servicio de verdad emite
# ════════════════════════════════════════════════════════════════════════════

def test_los_avisos_que_emite_la_capa_de_formato_estan_publicados():
    """LA prueba de esta fase. `onboarding.py` emite avisos; si alguno no está
    en el catálogo, el integrador recibe un `reason` contra el que no puede
    programar. Por eso los nombres se importan de acá y no se escriben sueltos.
    """
    for nombre in (ob.AVISO_TIPO_PERSONA, ob.AVISO_PAIS, ob.AVISO_FECHA, ob.AVISO_TRUNCADO):
        assert er.conocido(nombre), f"{nombre} se emite pero no está en el catálogo"
        assert nombre in er.AVISO, f"{nombre} se emite como aviso pero está en otro canal"


def test_los_cuatro_avisos_del_plan_siguen_estando():
    """Los que la especificación enumera. Los otros tres salieron de construir
    la Fase 6 y se agregaron; estos no se pueden perder."""
    for nombre in ("PARTIALLY_ILLEGIBLE", "OCR_PAGE_LIMIT_REACHED",
                   "PERSON_TYPE_UNDETERMINED", "EXPECTED_DATA_MISSING"):
        assert nombre in er.AVISO


def test_todo_reason_tiene_descripcion_util():
    """El catálogo se publica: una descripción vacía o de tres palabras no le
    sirve a quien integra."""
    for nombre, r in er.TODOS.items():
        assert len(r.descripcion) > 25, f"{nombre} no tiene una descripción utilizable"
