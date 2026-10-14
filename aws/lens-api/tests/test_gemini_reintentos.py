"""AJ-04 · Cuando Gemini no responde, se reintenta con criterio y se dice.

Una corrida del 10-10-2026 se encontró a Gemini sobrecargado: la identidad
se cortó a los 25 s sin reintento, las personas tardaron 92 s y la
administración 60. La corrida siguió con lo que tenía y salió INCOMPLETE con
tres «faltan datos» — una caída nuestra presentada como un problema del
documento.

Lo que se protege acá:

  · se reintenta lo que se puede arreglar esperando (red, tiempo, 429, 5xx) y
    no lo que va a dar igual (un 400, una respuesta bloqueada);
  · la espera crece y lleva jitter, y nunca se pasa del presupuesto;
  · al final, la falla del servicio es `GeminiNoDisponible` —que la corrida
    convierte en FAILED con SERVICE_UNAVAILABLE— y la del pedido no;
  · el status HTTP queda en el log, y la API key no queda en ningún lado.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import errores  # noqa: E402
import gemini  # noqa: E402

CLAVE = "CLAVE-DE-PRUEBA-NO-REAL"


class Resp:
    def __init__(self, status=200, texto='{"ok": true}', cuerpo=None):
        self.status_code = status
        self.text = texto
        self._cuerpo = cuerpo

    def json(self):
        if self._cuerpo is not None:
            return self._cuerpo
        return {"candidates": [{"content": {"parts": [{"text": self.text}]}}]}


@pytest.fixture
def gemini_falso(monkeypatch):
    """`requests.post` que responde lo que se le encola, y sin dormir de verdad."""
    estado = {"cola": [], "llamadas": [], "pausas": []}

    def post(url, **kw):
        estado["llamadas"].append(kw)
        r = estado["cola"].pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(gemini, "_clave", lambda: CLAVE)
    monkeypatch.setattr(gemini.requests, "post", post)
    monkeypatch.setattr(gemini.time, "sleep", lambda s: estado["pausas"].append(s))
    return estado


def test_un_503_y_despues_bien_responde(gemini_falso):
    gemini_falso["cola"] = [Resp(503, "overloaded"), Resp(200, "hola")]
    assert gemini._llamar("x", {}) == "hola"
    assert len(gemini_falso["llamadas"]) == 2


def test_la_espera_crece_y_lleva_jitter(gemini_falso, monkeypatch):
    monkeypatch.setattr(gemini.random, "uniform", lambda a, b: b)   # el techo del jitter
    gemini_falso["cola"] = [Resp(503), Resp(503), Resp(503)]
    with pytest.raises(gemini.GeminiNoDisponible):
        gemini._llamar("x", {})
    assert gemini_falso["pausas"] == [gemini.ESPERA_BASE_S, gemini.ESPERA_BASE_S * 2]


def test_el_jitter_achica_la_espera_hasta_la_mitad(monkeypatch):
    monkeypatch.setattr(gemini.random, "uniform", lambda a, b: a)
    assert gemini._espera(1) == gemini.ESPERA_BASE_S * 0.5


@pytest.mark.parametrize("respuesta,status", [
    (Resp(503, "overloaded"), 503),
    (Resp(500, "internal"), 500),
    (Resp(429, "Resource has been exhausted (e.g. check quota)."), 429),
])
def test_lo_del_servicio_se_reintenta_y_termina_en_no_disponible(gemini_falso, respuesta, status):
    gemini_falso["cola"] = [respuesta] * gemini.MAX_INTENTOS
    with pytest.raises(gemini.GeminiNoDisponible) as e:
        gemini._llamar("x", {})
    assert len(gemini_falso["llamadas"]) == gemini.MAX_INTENTOS
    assert e.value.status == status
    # Es las dos cosas: los caminos viejos lo siguen atajando como ErrorGemini.
    assert isinstance(e.value, gemini.ErrorGemini)
    assert isinstance(e.value, errores.ServicioNoDisponible)


def test_la_cuota_agotada_se_dice_como_cuota(gemini_falso):
    gemini_falso["cola"] = [Resp(429, "quota exceeded")] * gemini.MAX_INTENTOS
    with pytest.raises(gemini.GeminiNoDisponible, match="cuota"):
        gemini._llamar("x", {})


def test_el_tiempo_agotado_se_reintenta_y_se_marca(gemini_falso):
    gemini_falso["cola"] = [requests.Timeout("read timed out")] * gemini.MAX_INTENTOS
    with pytest.raises(gemini.GeminiNoDisponible) as e:
        gemini._llamar("x", {})
    assert e.value.por_tiempo is True
    assert "tiempo de espera agotado" in str(e.value)


def test_un_400_no_se_reintenta_y_no_es_del_servicio(gemini_falso):
    """Un 400 habla del pedido o del archivo: reintentarlo da lo mismo, y no es
    una caída —la corrida no tiene que decir «el servicio no respondió»—."""
    gemini_falso["cola"] = [Resp(400, "Request contains an invalid argument.")]
    with pytest.raises(gemini.ErrorGemini) as e:
        gemini._llamar("x", {})
    assert not isinstance(e.value, gemini.GeminiNoDisponible)
    assert len(gemini_falso["llamadas"]) == 1


def test_una_respuesta_bloqueada_no_es_del_servicio(gemini_falso):
    gemini_falso["cola"] = [Resp(200, cuerpo={"promptFeedback": {"blockReason": "SAFETY"}})]
    with pytest.raises(gemini.ErrorGemini, match="bloqueado") as e:
        gemini._llamar("x", {})
    assert not isinstance(e.value, gemini.GeminiNoDisponible)


def test_la_key_invalida_no_se_reintenta_pero_es_del_servicio(gemini_falso):
    gemini_falso["cola"] = [Resp(400, "API key not valid. Please pass a valid API key.")]
    with pytest.raises(gemini.GeminiNoDisponible, match="API Key"):
        gemini._llamar("x", {})
    assert len(gemini_falso["llamadas"]) == 1


# ── El presupuesto ──────────────────────────────────────────────────────────

def test_sin_tiempo_para_un_intento_util_no_se_empieza(gemini_falso):
    limite = time.monotonic() + gemini.MIN_INTENTO_S - 1
    with pytest.raises(gemini.GeminiNoDisponible, match="No quedó tiempo") as e:
        gemini._llamar("x", {}, limite)
    assert gemini_falso["llamadas"] == []
    assert e.value.por_tiempo is True


def test_el_intento_no_espera_mas_que_lo_que_queda(gemini_falso):
    gemini_falso["cola"] = [Resp(200, "hola")]
    gemini._llamar("x", {}, time.monotonic() + 30)
    assert gemini_falso["llamadas"][0]["timeout"] <= 30


def test_no_se_reintenta_si_la_espera_no_entra_en_el_presupuesto(gemini_falso):
    gemini_falso["cola"] = [Resp(503)] * gemini.MAX_INTENTOS
    with pytest.raises(gemini.GeminiNoDisponible):
        gemini._llamar("x", {}, time.monotonic() + gemini.MIN_INTENTO_S + 0.5)
    assert len(gemini_falso["llamadas"]) == 1
    assert gemini_falso["pausas"] == []


def test_sin_limite_la_llamada_queda_como_era(monkeypatch):
    """Los caminos viejos no pasan presupuesto: `_generar` recibe exactamente
    los mismos argumentos que antes."""
    visto = {}

    def espiar(partes, config):
        visto["ok"] = True
        return "{}", {}

    monkeypatch.setattr(gemini, "_generar", espiar)
    gemini._llamar("x", {})
    assert visto["ok"]


# ── Lo que queda escrito ────────────────────────────────────────────────────

def test_el_status_de_gemini_queda_en_el_log(gemini_falso, caplog):
    gemini_falso["cola"] = [Resp(503), Resp(200, "hola")]
    with caplog.at_level(logging.WARNING):
        gemini._llamar("x", {})
    assert "HTTP 503" in caplog.text


def test_la_api_key_no_queda_en_el_log_ni_en_el_error(gemini_falso, caplog):
    """`requests` pone la URL entera —con `?key=`— en sus excepciones."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key={CLAVE}"
    gemini_falso["cola"] = [requests.ConnectionError(f"Max retries exceeded with url: {url}")] * 3
    with caplog.at_level(logging.WARNING):
        with pytest.raises(gemini.GeminiNoDisponible) as e:
            gemini._llamar("x", {})
    assert CLAVE not in caplog.text
    assert CLAVE not in str(e.value)


def test_la_identidad_ahora_se_reintenta(gemini_falso):
    """Hasta el 13-10-2026 iba con un solo intento, porque si fallaba la corrida
    seguía. Ahora una identidad sin leer corta la corrida."""
    ok = ('{"esConstitutivo": "SI", "tipoDetectado": "escritura", "activity": null, '
          '"legalForm": "SAS", "legalName": "EMPRESA FICTICIA UNO S.A.S.", "taxId": "999.999.001-7"}')
    gemini_falso["cola"] = [requests.Timeout("timed out"), Resp(200, ok)]
    r, _ = gemini.leer_identidad([("a.pdf", b"%PDF-1.4")])
    assert r["legalName"] == "EMPRESA FICTICIA UNO S.A.S." and r["taxId"] == "999.999.001-7"
    assert gemini_falso["llamadas"][0]["timeout"] == gemini.TIMEOUT_IDENTIDAD_S
