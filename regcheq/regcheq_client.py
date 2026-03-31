"""
Cliente HTTP para la API de Regcheq.
Encapsula todos los endpoints disponibles.
"""
import requests
from config import API_KEY, BASE_URL


def _url(*parts):
    return "/".join([BASE_URL] + [str(p) for p in parts])


# ─── FICHAS ──────────────────────────────────────────────────────────────────

def crear_ficha(datos: dict) -> dict:
    """POST /record/{API_KEY} — Crea o actualiza una ficha (natural o legal)."""
    resp = requests.post(_url("record", API_KEY), json=datos, timeout=30)
    resp.raise_for_status()
    return resp.json()


def obtener_ficha(dni: str) -> dict:
    """GET /record/{dni}/{API_KEY} — Retorna el perfil completo con resultados de listas."""
    resp = requests.get(_url("record", dni, API_KEY), timeout=30)
    resp.raise_for_status()
    return resp.json()


# ─── OPERACIONES ─────────────────────────────────────────────────────────────

def crear_operacion(payload: dict) -> dict:
    """POST /operation/{API_KEY} — Registra una transacción con 1-5 participantes."""
    resp = requests.post(_url("operation", API_KEY), json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def obtener_operacion(id_operacion: str) -> dict:
    """GET /operation/{id}/{API_KEY} — Consulta estado, formularios y riesgo de operación."""
    resp = requests.get(_url("operation", id_operacion, API_KEY), timeout=30)
    resp.raise_for_status()
    return resp.json()


# ─── LISTA DE INTERÉS ────────────────────────────────────────────────────────

def obtener_lista_interes() -> list:
    """GET /interest-list/{api-key} — Retorna todos los registros activos."""
    resp = requests.get(_url("interest-list", API_KEY), timeout=30)
    resp.raise_for_status()
    return resp.json()


def agregar_lista_interes(dni: str, nombre: str, person_type: str, razon: str,
                           status: str = "active") -> dict:
    """POST /interest-list/{api-key} — Agrega o actualiza un registro en lista interna."""
    payload = {
        "dni": dni,
        "name": nombre,
        "personType": person_type,
        "reason": razon,
        "status": status,
    }
    resp = requests.post(_url("interest-list", API_KEY), json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()
