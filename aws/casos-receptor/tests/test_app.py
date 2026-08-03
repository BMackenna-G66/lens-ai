"""
Tests unitarios del receptor. No tocan red: se mockea `procesar_caso`.
Ejecutar:  cd aws/casos-receptor && python -m pytest -q
"""

import json
import os
import sys

import pytest

# Permitir importar src/app.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import app  # noqa: E402

SECRET = "test-secret-123"


@pytest.fixture(autouse=True)
def _entorno(monkeypatch):
    # Secreto por variable de entorno + limpiar caché entre tests.
    monkeypatch.setattr(app, "SSM_API_SECRET_PARAM", "")
    monkeypatch.setenv("API_SECRET", SECRET)
    app._cache.clear()
    # No persistir de verdad: contar llamadas y simular éxito.
    llamadas = []
    monkeypatch.setattr(app, "procesar_caso", lambda caso: llamadas.append(caso) or True)
    yield llamadas
    app._cache.clear()


def _evt(body, secret=SECRET):
    headers = {"x-api-secret": secret} if secret is not None else {}
    return {"headers": headers, "body": body if isinstance(body, str) else json.dumps(body)}


def _json(resp):
    return json.loads(resp["body"])


def test_secreto_valido_array_ok(_entorno):
    casos = [{"Número del caso": "001", "Asunto": "A"}, {"Número del caso": "002"}]
    resp = app.lambda_handler(_evt(casos), None)
    assert resp["statusCode"] == 200
    assert _json(resp) == {"ok": True, "recibidos": 2, "guardados": 2}
    assert len(_entorno) == 2


def test_secreto_invalido_401(_entorno):
    resp = app.lambda_handler(_evt([{"x": 1}], secret="mal"), None)
    assert resp["statusCode"] == 401
    assert _json(resp)["error"] == "No autorizado"


def test_secreto_ausente_401(_entorno):
    resp = app.lambda_handler(_evt([{"x": 1}], secret=None), None)
    assert resp["statusCode"] == 401


def test_body_no_json_400(_entorno):
    resp = app.lambda_handler(_evt("esto no es json {{"), None)
    assert resp["statusCode"] == 400
    assert _json(resp)["error"] == "JSON inválido"


def test_objeto_unico_recibidos_1(_entorno):
    resp = app.lambda_handler(_evt({"Número del caso": "009", "Asunto": "único"}), None)
    assert resp["statusCode"] == 200
    assert _json(resp)["recibidos"] == 1


def test_objeto_vacio_ok(_entorno):
    # Todos los campos son opcionales → {} es válido.
    resp = app.lambda_handler(_evt({}), None)
    assert resp["statusCode"] == 200
    assert _json(resp)["recibidos"] == 1


def test_elemento_no_objeto_422(_entorno):
    resp = app.lambda_handler(_evt(["soy un string"]), None)
    assert resp["statusCode"] == 422
    assert "elemento 0" in _json(resp)["error"]


def test_array_vacio_400(_entorno):
    resp = app.lambda_handler(_evt([]), None)
    assert resp["statusCode"] == 400


def test_guardados_refleja_fallos(monkeypatch, _entorno):
    # Si una persistencia falla, `guardados` < `recibidos` pero sigue 200.
    def falla_el_segundo(caso):
        return caso.get("Número del caso") != "002"

    monkeypatch.setattr(app, "procesar_caso", falla_el_segundo)
    casos = [{"Número del caso": "001"}, {"Número del caso": "002"}, {"Número del caso": "003"}]
    resp = app.lambda_handler(_evt(casos), None)
    assert resp["statusCode"] == 200
    assert _json(resp) == {"ok": True, "recibidos": 3, "guardados": 2}


# ── Tests del conversor a formato Firestore ─────────────────────────────────
def test_to_fs_value_tipos():
    assert app._to_fs_value("x") == {"stringValue": "x"}
    assert app._to_fs_value(True) == {"booleanValue": True}
    assert app._to_fs_value(3) == {"integerValue": "3"}
    assert app._to_fs_value(None) == {"nullValue": None}
    assert app._to_fs_value([1, "a"]) == {
        "arrayValue": {"values": [{"integerValue": "1"}, {"stringValue": "a"}]}
    }
    anidado = app._to_fs_value({"k": {"j": 2}})
    assert anidado["mapValue"]["fields"]["k"]["mapValue"]["fields"]["j"] == {"integerValue": "2"}


def test_doc_id_usa_numero_de_caso():
    assert app._doc_id({"Número del caso": "00123456"}) == "00123456"
    assert app._doc_id({"Número del caso": "a/b"}) == "a-b"
    assert app._doc_id({}).startswith("auto-")
