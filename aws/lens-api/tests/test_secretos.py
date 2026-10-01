"""Un `x-api-secret` por ambiente — Bloque 3.

Lo que estos tests protegen es la separación entre ambientes: con un secreto
único, quien tenía la clave de `dev` mandaba `environment: prod` y escribía en
producción. Y la transición: el secreto de siempre no puede dejar de funcionar
antes de que Onboarding tenga los nuevos, ni la API quedarse respondiendo 401 a
todo porque Secrets Manager no contestó.

Los «secretos» de acá son textos de prueba, no claves reales.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import secretos  # noqa: E402

VALORES = {"arn:dev": "clave-de-dev", "arn:ci": "clave-de-ci", "arn:prod": "clave-de-prod"}
LEGADO = "clave-de-siempre"


class SecretsManagerFalso:
    def __init__(self, roto=False):
        self.roto = roto
        self.lecturas = 0

    def get_secret_value(self, SecretId):
        self.lecturas += 1
        if self.roto:
            raise RuntimeError("AccessDeniedException")
        return {"SecretString": VALORES[SecretId]}


@pytest.fixture
def sm(monkeypatch):
    secretos._reiniciar()
    cliente = SecretsManagerFalso()
    monkeypatch.setattr(secretos, "ARNS", {"dev": "arn:dev", "ci": "arn:ci", "prod": "arn:prod"})
    monkeypatch.setattr(secretos, "_cliente", lambda: cliente)
    monkeypatch.setattr(secretos, "ACEPTAR_LEGADO", True)
    yield cliente
    secretos._reiniciar()


# ── LA regla: cada clave abre SOLO su ambiente ──────────────────────────────

@pytest.mark.parametrize("ambiente", ["dev", "ci", "prod"])
def test_cada_clave_abre_su_ambiente(sm, ambiente):
    assert secretos.autorizado_en(ambiente, f"clave-de-{ambiente}", LEGADO)


@pytest.mark.parametrize("clave,ambiente", [
    ("clave-de-dev", "prod"), ("clave-de-dev", "ci"),
    ("clave-de-ci", "prod"), ("clave-de-prod", "dev"),
])
def test_la_clave_de_un_ambiente_no_abre_otro(sm, clave, ambiente):
    """EL agujero que cierra este bloque: la clave de dev con `environment:
    prod` escribía en producción."""
    assert not secretos.autorizado_en(ambiente, clave, LEGADO)


def test_sin_clave_no_entra_nadie(sm):
    assert not secretos.autorizado_en("prod", "", LEGADO)
    assert not secretos.autorizado_en("prod", None, LEGADO)


def test_una_clave_inventada_no_entra(sm):
    assert not secretos.autorizado_en("prod", "cualquier-cosa", LEGADO)


# ── La transición ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("ambiente", ["dev", "ci", "prod"])
def test_durante_la_transicion_la_clave_de_siempre_sigue_abriendo(sm, ambiente):
    """Onboarding no puede quedar afuera antes de tener las tres claves nuevas."""
    assert secretos.autorizado_en(ambiente, LEGADO, LEGADO)


def test_apagada_la_transicion_la_clave_de_siempre_ya_no_abre(sm, monkeypatch):
    monkeypatch.setattr(secretos, "ACEPTAR_LEGADO", False)
    assert not secretos.autorizado_en("prod", LEGADO, LEGADO)
    assert secretos.autorizado_en("prod", "clave-de-prod", LEGADO), "la propia sigue entrando"


def test_la_transicion_arranca_prendida_por_defecto():
    """Un deploy que no diga nada no puede dejar afuera a Onboarding."""
    import importlib
    import os
    previo = os.environ.pop("ACEPTAR_SECRETO_LEGADO", None)
    try:
        assert importlib.reload(secretos).ACEPTAR_LEGADO is True
    finally:
        if previo is not None:
            os.environ["ACEPTAR_SECRETO_LEGADO"] = previo
        importlib.reload(secretos)


# ── La trampa: Secrets Manager que no contesta ──────────────────────────────

def test_si_secrets_manager_no_contesta_la_clave_de_siempre_sostiene(monkeypatch):
    """Sin respaldo, un permiso que falta dejaría a la API respondiendo 401 a
    todo. Durante la transición, la clave de siempre sigue funcionando."""
    secretos._reiniciar()
    monkeypatch.setattr(secretos, "ARNS", {"prod": "arn:prod"})
    monkeypatch.setattr(secretos, "_cliente", lambda: SecretsManagerFalso(roto=True))
    monkeypatch.setattr(secretos, "ACEPTAR_LEGADO", True)
    assert secretos.autorizado_en("prod", LEGADO, LEGADO)
    assert not secretos.autorizado_en("prod", "clave-de-prod", LEGADO)


def test_la_falla_no_escribe_el_arn_ni_el_valor_en_el_log(monkeypatch, caplog):
    secretos._reiniciar()
    monkeypatch.setattr(secretos, "ARNS", {"prod": "arn:aws:secretsmanager:lens-api/prod"})
    monkeypatch.setattr(secretos, "_cliente", lambda: SecretsManagerFalso(roto=True))
    with caplog.at_level("ERROR"):
        secretos.secreto_de("prod")
    assert "arn:" not in caplog.text
    assert "RuntimeError" in caplog.text, "sin código de AWS, dice el tipo de error"


def test_la_falla_de_aws_escribe_el_codigo_pero_no_el_mensaje(monkeypatch, caplog):
    """El código dice qué arreglar —un permiso, un secreto que no existe—; el
    mensaje de AWS puede traer el ARN."""
    class ErrorDeAws(Exception):
        response = {"Error": {"Code": "AccessDeniedException",
                              "Message": "no access to arn:aws:secretsmanager:lens-api/prod"}}

    class Roto:
        def get_secret_value(self, SecretId):
            raise ErrorDeAws("no access to arn:aws:secretsmanager:lens-api/prod")

    secretos._reiniciar()
    monkeypatch.setattr(secretos, "ARNS", {"prod": "arn:prod"})
    monkeypatch.setattr(secretos, "_cliente", lambda: Roto())
    with caplog.at_level("ERROR"):
        secretos.secreto_de("prod")
    assert "AccessDeniedException" in caplog.text
    assert "arn:" not in caplog.text


# ── El caché ────────────────────────────────────────────────────────────────

def test_el_secreto_se_lee_una_vez_y_no_en_cada_peticion(sm):
    for _ in range(20):
        secretos.autorizado_en("prod", "clave-de-prod", LEGADO)
    assert sm.lecturas == 1


def test_una_rotacion_llega_sola_cuando_vence_el_cache(sm):
    secretos.secreto_de("prod", ahora=0)
    VALORES["arn:prod"] = "clave-rotada"
    try:
        assert secretos.secreto_de("prod", ahora=secretos.TTL_S - 1) == "clave-de-prod"
        assert secretos.secreto_de("prod", ahora=secretos.TTL_S + 1) == "clave-rotada"
    finally:
        VALORES["arn:prod"] = "clave-de-prod"


def test_una_falla_se_reintenta_pronto(monkeypatch):
    """Si se cayó, apenas vuelva tiene que volver a leerse — no en cinco
    minutos."""
    secretos._reiniciar()
    cliente = SecretsManagerFalso(roto=True)
    monkeypatch.setattr(secretos, "ARNS", {"prod": "arn:prod"})
    monkeypatch.setattr(secretos, "_cliente", lambda: cliente)
    assert secretos.secreto_de("prod", ahora=0) is None
    cliente.roto = False
    assert secretos.secreto_de("prod", ahora=secretos.TTL_FALLA_S + 1) == "clave-de-prod"


# ── /salud ──────────────────────────────────────────────────────────────────

def test_el_estado_dice_si_se_pudo_leer_y_nunca_el_valor(sm):
    e = secretos.estado()
    assert e == {"dev": True, "ci": True, "prod": True}
    assert "clave" not in json.dumps(e)


def test_salud_no_muestra_ningun_secreto(sm, monkeypatch):
    import app

    r = app.lambda_handler({"rawPath": "/salud", "requestContext": {"http": {"method": "GET"}},
                            "headers": {}})
    cuerpo = r["body"]
    assert "clave-de" not in cuerpo
    assert json.loads(cuerpo)["secretos_por_ambiente"] == {"dev": True, "ci": True, "prod": True}


# ── De punta a punta, por el handler ────────────────────────────────────────

def _get(ambiente, clave):
    import app
    return app.lambda_handler({
        "rawPath": "/v1/companies/1/analysis/status",
        "requestContext": {"http": {"method": "GET"}},
        "headers": {"x-api-secret": clave},
        "queryStringParameters": {"environment": ambiente},
    })["statusCode"]


def _post(ambiente, clave):
    import app
    return app.lambda_handler({
        "rawPath": "/v1/companies/1/analyses",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"x-api-secret": clave},
        "body": json.dumps({"environment": ambiente, "country": "chile", "documents": []}),
    })["statusCode"]


def test_por_el_handler_la_clave_de_dev_no_abre_prod(sm, monkeypatch):
    import app
    monkeypatch.setattr(app, "API_SECRET", LEGADO)
    assert _get("dev", "clave-de-dev") == 200
    assert _get("prod", "clave-de-dev") == 401
    # En EP-1 el ambiente viaja en el cuerpo, y vale lo mismo. (El 400 es por
    # el lote vacío: pasó la autenticación, que es lo que se prueba.)
    assert _post("dev", "clave-de-dev") == 400
    assert _post("prod", "clave-de-dev") == 401


def test_las_rutas_viejas_siguen_con_el_secreto_de_siempre(sm, monkeypatch):
    """`/v1/analisis` y `/v1/analyses` no tienen ambiente y no cambian."""
    import app
    monkeypatch.setattr(app, "API_SECRET", LEGADO)
    monkeypatch.setattr(secretos, "ACEPTAR_LEGADO", False)   # aun con la transición apagada
    r = app.lambda_handler({"rawPath": "/v1/analisis", "requestContext": {"http": {"method": "POST"}},
                            "headers": {"x-api-secret": "clave-de-prod"}, "body": "{}"})
    assert r["statusCode"] == 401, "una clave de ambiente no abre las rutas viejas"
    r = app.lambda_handler({"rawPath": "/v1/analisis", "requestContext": {"http": {"method": "POST"}},
                            "headers": {"x-api-secret": LEGADO}, "body": "{}"})
    assert r["statusCode"] != 401, "la de siempre las sigue abriendo"
