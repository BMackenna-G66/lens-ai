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


PASO6 = json.loads((Path(__file__).parent / "fixtures" / "eventos_paso6.json").read_text())


def test_los_eventos_del_paso6_se_registran_y_se_espejan():
    """`fixtures/eventos_paso6.json` lo escribe test/listaNegraDni.mjs del Worker:
    un alta manual, una reactivación automática, un ya activo y un sin DNI."""
    t, r = TablaFalsa(), RedshiftFalso()
    for e in PASO6:
        s, c = http(t, e)
        assert s == 200, (e["accion"], c)
    app.espejar(t, r, AHORA)
    cambio, registro = r.foto()
    por_caso = {c["numero_caso"]: c for c in cambio}
    assert {k: v["resultado"] for k, v in por_caso.items()} == {
        "09000001": "CREADO", "09000003": "ACTIVADO", "09000004": "OMITIDO_YA_EXISTE_ACTIVO", "09000005": "ERROR"}
    assert por_caso["09000001"]["flujo"] == "colas_trabajo.ofac.bloqueado.manual"
    assert por_caso["09000003"]["actor_email"] == "sistema:lens-flujo-autonomo"
    assert por_caso["09000005"]["error"] == "El caso no tiene DNI."
    regs = {g["valor"]: g for g in registro}
    assert regs["11.111.111-1"]["flujo_alta"] == "colas_trabajo.ofac.bloqueado.manual"
    # Reactivado: ya estaba en Admin, así que no se sabe quién lo agregó.
    assert regs["22.333.444-0"]["flujo_alta"] is None and regs["22.333.444-0"]["activo"] == 1
    assert set(regs) == {"11.111.111-1", "22.333.444-0"}
