"""
Tests del logger de colas. No necesitan AWS: se stubea boto3 y se captura el SQL
que se habría ejecutado.

Correr:  python3 tests/test_app.py     (o pytest, si está instalado)
"""

import json
import os
import sys
import types
from pathlib import Path

# ── Stub de boto3 (captura los execute_statement en vez de llamar a AWS) ──────
EJECUTADOS = []


class _FakeClient:
    def execute_statement(self, **kwargs):
        EJECUTADOS.append(kwargs)
        return {"Id": f"stmt-{len(EJECUTADOS)}"}

    def describe_statement(self, Id):  # noqa: N803
        return {"Status": "FINISHED"}


def _fake_boto3_client(nombre, **_kw):
    return _FakeClient()


sys.modules["boto3"] = types.SimpleNamespace(client=_fake_boto3_client)

os.environ.update({
    "API_SECRET": "s3cr3t",
    "REDSHIFT_CLUSTER": "compliance-redshift-cluster",
    "REDSHIFT_DATABASE": "dev",
    "REDSHIFT_DB_USER": "compliance",
    "REDSHIFT_SCHEMA": "colas_trabajo",
})

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import app  # noqa: E402


def _evt(body, secret="s3cr3t", metodo="POST"):
    return {
        "requestContext": {"http": {"method": metodo}},
        "headers": {"x-api-secret": secret} if secret else {},
        "body": json.dumps(body),
    }


def _reset():
    EJECUTADOS.clear()


def test_rechaza_sin_secreto():
    r = app.lambda_handler(_evt({"eventos": []}, secret=None), None)
    assert r["statusCode"] == 401


def test_rechaza_secreto_malo():
    r = app.lambda_handler(_evt({"eventos": []}, secret="otro"), None)
    assert r["statusCode"] == 401


def test_rechaza_body_sin_eventos():
    r = app.lambda_handler(_evt({}), None)
    assert r["statusCode"] == 400


def test_rechaza_tabla_no_permitida():
    _reset()
    r = app.lambda_handler(_evt({"eventos": [{"tabla": "usuarios; DROP TABLE x", "datos": {"a": 1}}]}), None)
    cuerpo = json.loads(r["body"])
    assert r["statusCode"] == 207 and cuerpo["ok"] == 0
    assert not EJECUTADOS, "no debe ejecutar SQL para una tabla no permitida"


def test_inserta_evento_auditoria_idempotente():
    _reset()
    datos = {
        "event_id": "ev-1", "numero_caso": "02648810", "tipo": "CIERRE_AUTOMATICO",
        "actor_id": "system", "actor_tipo": "SYSTEM", "ocurrido_en": "2026-08-14T10:00:00",
        "version_caso": 1, "metadata": {"tipologia": "liberar_normal"},
    }
    r = app.lambda_handler(_evt({"eventos": [{"tabla": "evento_auditoria", "datos": datos}]}), None)
    assert r["statusCode"] == 200, r["body"]
    assert json.loads(r["body"])["ok"] == 1
    # Un DELETE (por PK) + un INSERT.
    assert len(EJECUTADOS) == 2
    borrado, insertado = EJECUTADOS
    assert borrado["Sql"] == "DELETE FROM colas_trabajo.evento_auditoria WHERE event_id = :event_id"
    assert [p["name"] for p in borrado["Parameters"]] == ["event_id"]
    assert insertado["Sql"].startswith("INSERT INTO colas_trabajo.evento_auditoria (")
    assert "JSON_PARSE(:metadata)" in insertado["Sql"]
    assert "NULLIF(:version_caso, '')::BIGINT" in insertado["Sql"]
    # El JSON viaja serializado como string.
    meta = next(p for p in insertado["Parameters"] if p["name"] == "metadata")
    assert json.loads(meta["value"])["tipologia"] == "liberar_normal"


def test_tipos_bool_y_nulos():
    _reset()
    datos = {
        "cierre_id": "c-1", "numero_caso": "02648810", "canal": "ADMIN",
        "resultado_ok": True, "automatico": False, "ofac_flag": None,
        "ocurrido_en": "2026-08-14T10:00:00",
    }
    r = app.lambda_handler(_evt({"eventos": [{"tabla": "cierre", "datos": datos}]}), None)
    assert r["statusCode"] == 200, r["body"]
    params = {p["name"]: p["value"] for p in EJECUTADOS[1]["Parameters"]}
    assert params["resultado_ok"] == "true"
    assert params["automatico"] == "false"
    assert params["ofac_flag"] == ""          # entra como NULL vía NULLIF
    assert "NULLIF(:resultado_ok, '')::BOOLEAN" in EJECUTADOS[1]["Sql"]


def test_falta_clave_natural():
    _reset()
    r = app.lambda_handler(_evt({"eventos": [{"tabla": "cierre", "datos": {"canal": "SF"}}]}), None)
    cuerpo = json.loads(r["body"])
    assert r["statusCode"] == 207 and cuerpo["ok"] == 0
    assert "cierre_id" in cuerpo["errores"][0]["error"]


def test_lote_parcial_no_corta():
    _reset()
    eventos = [
        {"tabla": "evento_auditoria", "datos": {"event_id": "ev-9", "numero_caso": "1", "tipo": "X", "ocurrido_en": "2026-08-14T10:00:00"}},
        {"tabla": "inexistente", "datos": {"a": 1}},
    ]
    r = app.lambda_handler(_evt({"eventos": eventos}), None)
    cuerpo = json.loads(r["body"])
    assert r["statusCode"] == 207
    assert cuerpo["ok"] == 1 and len(cuerpo["errores"]) == 1


def test_columna_desconocida_se_ignora():
    _reset()
    datos = {"actor_id": "u1", "nombre": "Benja", "columna_rara": "x'; DROP TABLE y;--"}
    r = app.lambda_handler(_evt({"eventos": [{"tabla": "analista", "datos": datos}]}), None)
    assert r["statusCode"] == 200, r["body"]
    sql = EJECUTADOS[1]["Sql"]
    assert "columna_rara" not in sql and "DROP" not in sql


if __name__ == "__main__":
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"✓ {nombre}")
            except AssertionError as e:
                fallos += 1
                print(f"✗ {nombre}: {e}")
    print("ALL OK" if not fallos else f"{fallos} FALLO(S)")
    sys.exit(1 if fallos else 0)
