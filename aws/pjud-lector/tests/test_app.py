"""
Tests de lens-pjud-lector. No necesitan AWS ni Firestore: se reemplaza `_leer`.

Correr:  python3.12 -m pytest aws/pjud-lector/tests -q

Todos los datos son inventados.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import app  # noqa: E402


def _s(v):
    return {"stringValue": v}


DOC = {"fields": {
    "case_id": _s("90000101"),
    "sujeto": {"mapValue": {"fields": {"nombre": _s("NOMBRE PRUEBA")}}},
    "en_proceso": {"nullValue": None},
    "documentacion": {"mapValue": {"fields": {
        "estado": _s("Incompleta"),
        "error": {"nullValue": None},
        "ultimo_error": {"nullValue": None},
        "causas_sin_verificar": {"arrayValue": {"values": [
            {"mapValue": {"fields": {"ruc": _s("1900000000-0"), "motivo": _s("error"),
                                     "descripcion": _s("TERCERO EN EL DOCUMENTO")}}}]}},
        "avisos_pjud": {"arrayValue": {"values": [_s("Mantención programada")]}},
        "documentos_borrados_en": {"nullValue": None},
        "causas": {"arrayValue": {"values": [{"mapValue": {"fields": {
            "folios": {"arrayValue": {"values": [{"mapValue": {"fields": {"descripcion": _s("TERCERO EN EL DOCUMENTO")}}}]}}}}}]}},
    }}},
    "analisis": {"mapValue": {"fields": {
        "texto": _s("RUC 1900000000-0: condena."), "generado": {"timestampValue": "2026-10-23T10:00:00Z"},
        "por_causa": {"arrayValue": {"values": []}}}}},
    "resuelto_en": {"nullValue": None},
}}


def _evento(secreto="s3cr3to", caso="90000101"):
    return {"headers": {"X-Pjud-Lector": secreto}, "body": json.dumps({"caseId": caso})}


def _preparar(monkeypatch, doc=DOC, secreto="s3cr3to"):
    monkeypatch.setattr(app, "SECRETO", secreto)
    pedidos = []
    monkeypatch.setattr(app, "_leer", lambda c: (pedidos.append(c), doc)[1])
    return pedidos


def test_sin_secreto_o_con_otro_responde_401(monkeypatch):
    pedidos = _preparar(monkeypatch)
    assert app.lambda_handler(_evento("otro"), None)["statusCode"] == 401
    assert app.lambda_handler({"headers": {}, "body": "{}"}, None)["statusCode"] == 401
    assert pedidos == [], "no llega a Firestore"


def test_sin_secreto_configurado_no_atiende_a_nadie(monkeypatch):
    _preparar(monkeypatch, secreto="")
    assert app.lambda_handler(_evento(""), None)["statusCode"] == 401


def test_un_caseid_que_no_es_un_numero_de_caso_no_llega_a_firestore(monkeypatch):
    pedidos = _preparar(monkeypatch)
    for malo in ["../config/flujoAutomatico", "90000101/x", "", "abc"]:
        assert app.lambda_handler(_evento(caso=malo), None)["statusCode"] == 400
    assert pedidos == []


def test_devuelve_solo_los_campos_minimos(monkeypatch):
    _preparar(monkeypatch)
    r = app.lambda_handler(_evento(), None)
    assert r["statusCode"] == 200
    cuerpo = json.loads(r["body"])
    assert set(cuerpo) == {"existe", "en_proceso", "documentacion", "analisis", "resuelto_en"}
    assert cuerpo["documentacion"]["estado"] == "Incompleta"
    assert cuerpo["documentacion"]["causas_sin_verificar"] == [{"ruc": "1900000000-0", "motivo": "error"}]
    assert cuerpo["analisis"] == {"texto": "RUC 1900000000-0: condena.", "generado": "2026-10-23T10:00:00Z"}
    # Ni folios, ni descripciones, ni el sujeto.
    assert "TERCERO" not in r["body"] and "NOMBRE PRUEBA" not in r["body"] and "causas\"" not in r["body"]


def test_la_mascara_no_pide_los_folios():
    assert all(not c.startswith("documentacion.causas.") and c != "documentacion.causas" for c in app.CAMPOS)
    assert "sujeto" not in app.CAMPOS and "delitos" not in app.CAMPOS


def test_sin_documento_existe_false(monkeypatch):
    _preparar(monkeypatch, doc=None)
    r = app.lambda_handler(_evento(), None)
    assert json.loads(r["body"]) == {"existe": False}


def test_si_firestore_falla_responde_503_sin_detalle(monkeypatch):
    monkeypatch.setattr(app, "SECRETO", "s3cr3to")

    def revienta(_c):
        raise RuntimeError("detalle interno con datos")
    monkeypatch.setattr(app, "_leer", revienta)
    r = app.lambda_handler(_evento(), None)
    assert r["statusCode"] == 503 and "detalle interno" not in r["body"]


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-q"]))
