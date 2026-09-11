"""El contrato HTTP de `BusinessShareholders` — Fase 5 del plan de absorción.

Es el contrato que ms-company YA consume hoy contra el bot que se elimina. El
consumidor no cambia, así que todo acá está al servicio de que la respuesta de
Lens sea indistinguible de la del bot.

Dos cosas que parecen errores y no lo son
-----------------------------------------
1. **Los errores viajan con HTTP 200.** El `statusCode` real va en el CUERPO.
   Es como responde el bot y el consumidor lo lee de ahí; devolver un 400 de
   verdad rompería a quien ya está integrado.

2. **`session_id` viaja de ida y vuelta sin que nadie lo mire.** El consumidor
   lo usa para correlacionar con su WebSocket. Acá es opaco a propósito: no se
   valida, no se normaliza, no se registra como dato de negocio.
"""

from __future__ import annotations

from typing import Any

MSG_TYPE_ERROR = "SHAREHOLDERS_DOCS_ERROR"

# Los cuatro códigos del bot, con su statusCode y su msg_type.
#
# `AWS_ERROR` NO lleva msg_type — no es un olvido, es así en el bot y el
# consumidor distingue por su ausencia. Replicarlo es parte de que la migración
# no necesite ventana de corte.
ERRORES: dict[str, dict[str, Any]] = {
    "MISSING_FOLDER_PATH": {"statusCode": 400, "msg_type": MSG_TYPE_ERROR},
    "NO_DOCUMENTS_FOUND":  {"statusCode": 404, "msg_type": MSG_TYPE_ERROR},
    "NO_VALID_FILES":      {"statusCode": 400, "msg_type": MSG_TYPE_ERROR},
    "AWS_ERROR":           {"statusCode": 500},
}


def error(reason: str, mensaje: str = "", session_id: str = "", **extra) -> dict:
    """Un error con la forma exacta del bot.

    Un `reason` desconocido cae en AWS_ERROR en vez de inventar un código: el
    consumidor tiene una lista cerrada y un valor nuevo lo dejaría sin manejar.
    """
    spec = ERRORES.get(reason)
    if spec is None:
        reason, spec = "AWS_ERROR", ERRORES["AWS_ERROR"]
    cuerpo: dict[str, Any] = {
        "success": False,
        "reason": reason,
        "statusCode": spec["statusCode"],
    }
    if "msg_type" in spec:
        cuerpo["msg_type"] = spec["msg_type"]
    if mensaje:
        cuerpo["message"] = mensaje
    if session_id:
        cuerpo["session_id"] = session_id
    cuerpo.update(extra)
    return cuerpo


# ── La respuesta con datos ──────────────────────────────────────────────────

def _persona(p: dict) -> dict:
    """Una persona con las claves del contrato, en orden y sin nulos raros.

    Las claves van SIEMPRE, aunque el valor sea vacío: el consumidor no tiene
    que defenderse de campos ausentes, que es la misma promesa que ya hace
    `campos` en `/v1/analisis`.
    """
    return {
        "personType": p.get("personType") or "",
        "shareholderName": p.get("shareholderName") or "",
        "name": p.get("name") or "",
        "lastName": p.get("lastName") or "",
        "shareholderId": p.get("shareholderId") or "",
        "identificationType": p.get("identificationType") or "",
        "countryOfOrigin": p.get("countryOfOrigin") or "",
        "ownershipPercentage": p.get("ownershipPercentage"),
        "isPEP": p.get("isPEP"),
    }


def _representante(p: dict) -> dict:
    r = _persona(p)
    r["position"] = p.get("position") or ""
    return r


def respuesta(
    analysis_id: str,
    company: dict | None = None,
    legal_representatives: list[dict] | None = None,
    direct_ownership: list[dict] | None = None,
    indirect_shareholders: list[dict] | None = None,
    economic_activities: list[dict] | None = None,
    raw_text: list[str] | None = None,
    avisos: list[str] | None = None,
    session_id: str = "",
) -> dict:
    """El cuerpo exitoso.

    `directOwnership` e `indirectShareholders` aparecen SIEMPRE, aunque queden
    vacíos: es la regla de oro del contrato y el consumidor cuenta con las dos
    claves.

    `rawText` solo se incluye si se pidió — es el texto completo de las
    escrituras, y mandarlo por defecto sería mover documentos enteros en cada
    respuesta.
    """
    cuerpo: dict[str, Any] = {
        "success": True,
        "statusCode": 200,
        "analysisId": analysis_id,
        "company": company or {},
        "legalRepresentatives": [_representante(p) for p in (legal_representatives or [])],
        "shareholders": {
            "directOwnership": [_persona(p) for p in (direct_ownership or [])],
            "indirectShareholders": [
                {**_persona(p), "indirectShareholders": [_persona(h) for h in (p.get("indirectShareholders") or [])]}
                for p in (indirect_shareholders or [])
            ],
        },
        "economicActivities": economic_activities or [],
    }
    if raw_text is not None:
        cuerpo["rawText"] = raw_text
    if avisos:
        cuerpo["warnings"] = avisos
    if session_id:
        cuerpo["session_id"] = session_id
    return cuerpo


def validar_entrada(cuerpo: dict) -> str | None:
    """El `reason` del primer problema de la petición, o None si está bien.

    Solo valida lo que el contrato del bot define como error de entrada. El
    resto —que la carpeta exista, que tenga archivos válidos— se sabe recién
    después de mirar S3 y lo reporta quien lo mira.
    """
    if not str(cuerpo.get("folderPath") or cuerpo.get("folder_path") or "").strip():
        # `files` explícito también sirve: el bot acepta las dos formas.
        if not cuerpo.get("files"):
            return "MISSING_FOLDER_PATH"
    return None
