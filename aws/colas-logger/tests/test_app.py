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

# ── Stub del driver de Redshift (captura el SQL en vez de conectarse) ─────────
EJECUTADOS = []   # [(sql, valores), ...]


class _FakeCursor:
    def execute(self, sql, vals=None):
        EJECUTADOS.append((sql, vals))


class _FakeConn:
    autocommit = False

    def cursor(self):
        return _FakeCursor()

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


sys.modules["redshift_connector"] = types.SimpleNamespace(connect=lambda **_kw: _FakeConn())

os.environ.update({
    "API_SECRET": "s3cr3t",
    "MODO": "tcp",
    "REDSHIFT_HOST": "compliance-redshift-cluster.abc.us-east-1.redshift.amazonaws.com",
    "REDSHIFT_DATABASE": "dev",
    "REDSHIFT_USER": "compliance",
    "REDSHIFT_PASSWORD": "x",
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
    (del_sql, del_vals), (ins_sql, ins_vals) = EJECUTADOS
    assert del_sql == "DELETE FROM colas_trabajo.evento_auditoria WHERE event_id = %s"
    assert del_vals == ("ev-1",)
    assert ins_sql.startswith("INSERT INTO colas_trabajo.evento_auditoria (")
    assert "JSON_PARSE(%s)" in ins_sql
    assert "%s::TIMESTAMP" in ins_sql
    # El JSON viaja serializado; el int como int.
    assert json.loads(ins_vals[list(ins_sql.split("(")[1].split(")")[0].split(", ")).index("metadata")])["tipologia"] == "liberar_normal"
    assert 1 in ins_vals


def test_tipos_bool_y_nulos():
    _reset()
    datos = {
        "cierre_id": "c-1", "numero_caso": "02648810", "canal": "ADMIN",
        "resultado_ok": True, "automatico": False, "ofac_flag": None,
        "ocurrido_en": "2026-08-14T10:00:00",
    }
    r = app.lambda_handler(_evt({"eventos": [{"tabla": "cierre", "datos": datos}]}), None)
    assert r["statusCode"] == 200, r["body"]
    ins_sql, ins_vals = EJECUTADOS[1]
    cols = ins_sql.split("(")[1].split(")")[0].split(", ")
    val = dict(zip(cols, ins_vals))
    assert val["resultado_ok"] is True
    assert val["automatico"] is False
    # La columna nula se OMITE del INSERT (la Data API no acepta valores vacíos):
    # queda NULL por defecto en la tabla.
    assert "ofac_flag" not in val
    assert "::BOOLEAN" in ins_sql and "::TIMESTAMP" in ins_sql


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
    sql, vals = EJECUTADOS[1]
    assert "columna_rara" not in sql and "DROP" not in sql
    assert "x'; DROP TABLE y;--" not in str(vals)


def test_fallback_pg8000_cuando_no_hay_driver_oficial():
    """Sin redshift_connector instalado, debe usar pg8000 igual (es el camino
    real del deploy: se empaqueta pg8000 para no depender de Docker)."""
    _reset()
    oficial = sys.modules.pop("redshift_connector", None)
    usados = {}

    def _fake_connect(**kw):
        usados.update(kw)
        return _FakeConn()

    sys.modules["pg8000"] = types.SimpleNamespace(dbapi=types.SimpleNamespace(connect=_fake_connect))
    sys.modules["pg8000.dbapi"] = sys.modules["pg8000"].dbapi
    try:
        datos = {"actor_id": "u1", "nombre": "Benja"}
        r = app.lambda_handler(_evt({"eventos": [{"tabla": "analista", "datos": datos}]}), None)
        assert r["statusCode"] == 200, r["body"]
        assert usados["host"] and usados["user"] == "compliance"
        assert len(EJECUTADOS) == 2      # DELETE + INSERT
    finally:
        if oficial is not None:
            sys.modules["redshift_connector"] = oficial


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
