"""Contrato Worker → Lambda: los eventos que el Worker DE VERDAD manda.

`fixtures/eventos_worker.json` lo escribe el test del Worker
(cloudflare/empresadocs-proxy/test/listasNegras.mjs) con lo que capturó: una
carga, una edición, una fila omitida y un id completado. Si el Worker cambia la
forma de un evento y el Lambda no, esto falla.
"""

from __future__ import annotations

import json
from pathlib import Path

import app
from test_app import AHORA, RedshiftFalso, TablaFalsa, http

EVENTOS = json.loads((Path(__file__).parent / "fixtures" / "eventos_worker.json").read_text())


def test_los_eventos_del_worker_se_registran_y_se_espejan():
    t, r = TablaFalsa(), RedshiftFalso()
    for e in EVENTOS:
        s, c = http(t, e)
        assert s == 200, (e["accion"], c)
    app.espejar(t, r, AHORA)
    cambio, registro = r.foto()
    assert sorted(c["resultado"] for c in cambio) == ["CREADO", "DESACTIVADO", "OMITIDO_YA_EXISTE_ACTIVO"]
    assert {c["actor_email"] for c in cambio} == {"analista@global66.com"}
    assert {c["flujo"] for c in cambio} == {"lens.regcheq.listas_negras.carga", "lens.regcheq.listas_negras.edicion"}
    assert len(registro) == 1
    reg = registro[0]
    assert (reg["valor"], reg["country_code"], reg["admin_id"], reg["activo"]) == ("3000000001", "CO", "44", 0)
    assert reg["flujo_alta"] == "lens.regcheq.listas_negras.carga"
    assert reg["creado_por"] == reg["actualizado_por"] == "analista@global66.com"
