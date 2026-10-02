"""El candado de corridas contra DynamoDB DE VERDAD. Opcional.

`test_corridas.py` prueba la lógica contra una tabla falsa que evalúa las
condiciones en Python. Lo que esa tabla no puede probar es que DynamoDB entienda
las expresiones como se escribieron: un nombre reservado sin `#`, un tipo que no
compara, una condición sobre un ítem que no existe. Eso se prueba acá.

Corre SOLO si `LENS_PRUEBA_TABLA` nombra una tabla de PRUEBA —clave `pk` y `sk`,
las dos texto—, nunca la de producción: escribe y borra ítems.

    LENS_PRUEBA_TABLA=lens-prueba-candado AWS_PROFILE=… AWS_REGION=us-east-1 \\
        python -m pytest tests/test_corridas_dynamodb_real.py
"""

from __future__ import annotations

import os
import sys
import threading
import time
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import corridas as co  # noqa: E402

TABLA = os.environ.get("LENS_PRUEBA_TABLA", "").strip()

pytestmark = pytest.mark.skipif(not TABLA, reason="sin LENS_PRUEBA_TABLA: no hay tabla de prueba")


@pytest.fixture(autouse=True)
def tabla_real(monkeypatch):
    assert "TablaCorridas" not in TABLA and "TablaAnalisis" not in TABLA, "nunca contra producción"
    monkeypatch.setattr(co, "TABLA", TABLA)


@pytest.fixture
def empresa():
    """Una empresa nueva por test: así no se pisan entre ellos."""
    return f"PRUEBA-{uuid.uuid4().hex[:10]}"


def test_de_registros_simultaneos_gana_uno(empresa):
    largada = threading.Barrier(8)
    ok, en_curso, otros = [], [], []

    def uno(i):
        largada.wait()
        try:
            co.registrar_inicio("prod", empresa, f"a{i}")
            ok.append(f"a{i}")
        except co.EnCurso as e:
            en_curso.append(e)
        except Exception as e:  # noqa: BLE001
            otros.append(e)

    hilos = [threading.Thread(target=uno, args=(i,)) for i in range(8)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    assert not otros, otros
    assert len(ok) == 1 and len(en_curso) == 7
    assert {e.viva["analysisId"] for e in en_curso} == set(ok)
    assert all(e.viva["startedAt"] for e in en_curso)
    assert [f["analysisId"] for f in co.historial("prod", empresa)] == ok


def test_el_candado_no_aparece_como_corrida(empresa):
    co.registrar_inicio("prod", empresa, "a1")
    assert [f["analysisId"] for f in co.historial("prod", empresa)] == ["a1"]
    assert co.ultima("prod", empresa)["analysisId"] == "a1"


def test_cerrar_suelta_el_candado_y_no_cierra_dos_veces(empresa):
    co.registrar_inicio("prod", empresa, "a1")
    assert co.cerrar("prod", empresa, "a1", co.COMPLETED) is not None
    assert co.cerrar("prod", empresa, "a1", co.FAILED) is None
    assert co.ultima("prod", empresa)["status"] == co.COMPLETED
    co.registrar_inicio("prod", empresa, "a2")
    assert co.ultima("prod", empresa)["analysisId"] == "a2"


def test_la_caducidad_libera_y_el_cierre_tardio_no_cambia_nada(empresa):
    vieja = time.time() - co.TOPE_EN_CURSO_S - 1
    co.registrar_inicio("prod", empresa, "muerta", ahora=vieja)
    co.registrar_inicio("prod", empresa, "nueva")
    assert co.cerrar("prod", empresa, "muerta", co.COMPLETED) is None
    assert co.buscar("prod", empresa, "muerta")["status"] == co.IN_PROGRESS
    assert co.estado("prod", empresa) == co.IN_PROGRESS, "la última es la nueva"


def test_anular(empresa):
    reg = co.registrar_inicio("prod", empresa, "a1")
    assert co.anular(reg) is True
    assert co.ultima("prod", empresa) is None
    co.registrar_inicio("prod", empresa, "a2")


def test_una_corrida_sin_candado_se_sigue_cerrando(empresa):
    """Las registradas antes del despliegue no tienen candado."""
    import boto3
    ahora = time.time()
    boto3.resource("dynamodb").Table(TABLA).put_item(Item={
        "pk": co.clave("prod", empresa), "sk": f"{co._ahora_iso(ahora)}#vieja",
        "analysisId": "vieja", "status": co.IN_PROGRESS, "startedAt": co._ahora_iso(ahora),
        "startedTs": int(ahora), "documents": "[]", "warnings": "[]", "error": "null", "result": "null",
    })
    co.registrar_inicio("prod", empresa, "nueva")
    assert co.cerrar("prod", empresa, "vieja", co.COMPLETED) is not None
    assert co.buscar("prod", empresa, "vieja")["status"] == co.COMPLETED
    assert co.buscar("prod", empresa, "nueva")["status"] == co.IN_PROGRESS
