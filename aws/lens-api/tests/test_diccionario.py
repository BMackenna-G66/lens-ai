"""El diccionario de datos publicado a Onboarding no puede quedar viejo.

Onboarding usa este documento para dos cosas que no toleran una versión
desactualizada: decidir qué tablas habilitan en el acceso de lectura (§14.2), y
programar contra la lista de `reason`. Del otro lado nadie puede notar que
envejeció, porque para ellos el documento ES la verdad.

De ahí que el documento se genere y que la deriva la cace un test y no un deploy:
quien agrega una columna o un `reason` se entera en el momento, no cuando alguien
consulta un dato que la vista no expone.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
GENERADOR = RAIZ / "scripts" / "generar_diccionario.py"
DOC = RAIZ / "DICCIONARIO_ONBOARDING.md"

sys.path.insert(0, str(RAIZ / "src"))

import errores as er  # noqa: E402


def test_el_documento_esta_al_dia():
    """LA prueba. Si falla: `python3 scripts/generar_diccionario.py`."""
    r = subprocess.run(
        [sys.executable, str(GENERADOR), "--check"],
        capture_output=True, text=True, cwd=RAIZ,
    )
    assert r.returncode == 0, r.stdout + r.stderr


@pytest.fixture(scope="module")
def doc() -> str:
    assert DOC.exists(), "falta el documento; correr el generador"
    return DOC.read_text(encoding="utf-8")


def test_estan_los_tres_canales_completos(doc):
    """Un `reason` que el servicio emite y el documento no lista deja al
    integrador sin manejarlo, y no hay forma de que lo descubra leyendo."""
    for nombre in er.TODOS:
        assert f"`{nombre}`" in doc, f"{nombre} está en el catálogo pero no en el documento"


def test_estan_las_diez_vistas(doc):
    for vista in ("analysis", "analysis_field", "analysis_record", "analysis_text",
                  "analysis_person", "analysis_activity", "batch_document",
                  "api_request", "analysis_pivot", "analysis_review"):
        assert f"### `lens.{vista}`" in doc, f"falta la vista {vista}"


def test_ninguna_columna_quedo_sin_tipo(doc):
    """Una columna sin tipo significa que el DDL que la define no se está
    leyendo — pasó con las quince que la Fase 1 agregó por `ALTER TABLE`. Se ve
    en la vista y falta en el diccionario, que es la peor combinación."""
    filas = [l for l in doc.splitlines() if l.startswith("| `") and l.count("|") == 5]
    assert filas, "no se reconoció ninguna fila de columna"
    sin_tipo = [l for l in filas if "| — |" in l]
    assert not sin_tipo, f"{len(sin_tipo)} columnas sin tipo: {sin_tipo[:3]}"


def test_ningun_rut_del_documento_es_valido(doc):
    """El documento entero, no solo los ejemplos.

    El schema guarda RUT, socios y participaciones, y esto circula fuera de
    Compliance. Que un RUT sea inventado no alcanza: si está bien formado puede
    coincidir con una sociedad real. Que el dígito verificador esté mal es lo
    único que lo garantiza.

    Cubre también los comentarios que el generador copia del DDL, que es de donde
    vino el caso que motivó este test: `lens_schema.sql` trae `784517926` como
    ejemplo y ese RUT **sí es válido**. Lo enmascara `enmascarar()`.
    """
    sys.path.insert(0, str(RAIZ / "scripts"))
    from generar_diccionario import dv_rut

    ruts = re.findall(r"\b(\d{1,2}(?:\.\d{3}){2})-([\dkK])\b", doc)
    assert ruts, "el documento no tiene ningún RUT de ejemplo: revisar este test"
    for cuerpo, dv in ruts:
        esperado = dv_rut(cuerpo)
        assert dv.upper() != esperado.upper(), (
            f"{cuerpo}-{dv} es un RUT VÁLIDO y no puede ir en este documento. "
            f"Cambiar el dígito verificador (el correcto es {esperado})."
        )

    for plano in re.findall(r"\b\d{8,9}\b", doc):
        assert plano[-1].upper() != dv_rut(plano[:-1]).upper(), (
            f"{plano} es un RUT válido sin puntos y quedó sin enmascarar."
        )
