"""EP-1 · `POST /v1/companies/{companyId}/analyses` — Fase 2 del plan.

La familia de rutas por empresa que pide Onboarding B2B. **Se agrega al lado**:
`/v1/analisis` y `/v1/analyses` siguen vivas y sin un cambio, que es lo que
permite migrar sin ventana de corte.

── Una diferencia que no se puede mezclar ──────────────────────────────────
`/v1/analyses` (el contrato del bot) devuelve **HTTP 200 siempre**, con el
`statusCode` real adentro del cuerpo. Esta familia NO: usa códigos HTTP de
verdad —`202`, `400`, `409`, `429`— porque así lo define la especificación v1.2.
Son dos contratos distintos conviviendo en el mismo handler, y confundirlos
rompe a uno de los dos consumidores.

── El orden de escritura es el punto de la fase ────────────────────────────
La corrida se registra **antes** de responder el `202`. Si el `202` saliera
primero, la primera consulta del front podría ver `NOT_STARTED`, volver a
mostrar la pantalla de carga y disparar un segundo procesamiento del mismo lote.

── Qué es un error de petición y qué es un fallo de corrida ────────────────
La división no es estética, decide qué recibe el consumidor:

  · **La forma de la petición** —falta `environment`, no hay documentos, un
    `s3Uri` que no se puede ni parsear, más documentos que el tope— es un
    `400` sincrónico. Es un problema de quien llama y lo puede arreglar.

  · **Si el documento se puede bajar y leer** es el resultado de la corrida:
    `FAILED` o `INCOMPLETE`. No se sabe sin ir a S3, y averiguarlo antes de
    responder convertiría el `202` en una espera.

Por eso la resolución contra S3 ocurre en el trabajo de fondo y no acá.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from typing import Any, Callable

import complementarios
import corridas
import disparador
import errores
import ingesta_s3
import onboarding

log = logging.getLogger()

#: `POST /v1/companies/{companyId}/analyses`. El `companyId` puede traer
#: cualquier cosa menos una barra: es opaco y lo genera ms-company.
RUTA_ANALYSES = re.compile(r"^/v1/companies/([^/]+)/analyses$")

#: `GET /v1/companies/{companyId}/analysis/status` — EP-2, Fase 3.
RUTA_STATUS = re.compile(r"^/v1/companies/([^/]+)/analysis/status$")

#: `GET /v1/companies/{companyId}/analysis` — EP-3, Fase 4.
RUTA_ANALYSIS = re.compile(r"^/v1/companies/([^/]+)/analysis$")

#: EP-4, EP-5 y EP-6 — Fase 7. Son vistas filtradas del MISMO resultado, así que
#: se resuelven con una ruta sola y un nombre de sección. La especificación lo
#: contempla explícitamente: «LENS puede implementar EP-4, EP-5 y EP-6 como
#: filtros de un único endpoint de resultados […]. Lo que Onboarding necesita es
#: el contrato de respuesta, no la forma de la ruta».
RUTA_SECCION = re.compile(r"^/v1/companies/([^/]+)/analysis/(legal-representatives|company|shareholders)$")

#: La versión del ESQUEMA de respuesta, que no es la del documento de
#: especificación. La v1.1 la fijó en `1.0.0` en los seis endpoints; decir `1.2`
#: —que es la versión del documento— le haría creer al consumidor que el formato
#: cambió cuando no cambió.
#:
#: `1.1.0` desde el contrato v3 (14-10-2026), que sí cambia la forma: los avisos
#: traen `field` y `subject`, EP-6 trae `countryOfOriginCode` y `personType`
#: puede ir en `null`, y EP-3 trae `countryCode`. §15 del contrato: cambia
#: cuando cambia la forma de las respuestas.
SCHEMA_VERSION = os.environ.get("SCHEMA_VERSION", "1.1.0")

#: Tope de documentos por petición. La v1.2 bajó el lote a 2; es su propio tope
#: y no el de `/v1/analisis` (12), que sigue como estaba.
MAX_DOCUMENTOS_LOTE = int(os.environ.get("MAX_DOCUMENTOS_LOTE", "2"))

#: Los `documentType` que cuentan como documento PRINCIPAL, separados por coma.
#:
#: El vocabulario lo fija la pantalla de carga de Onboarding (contrato v3.1,
#: §8.2): dos espacios en todos los países, y el principal es siempre el mismo:
#:
#:     company_deeds_document          escritura (en Colombia también el
#:                                     certificado de Cámara de Comercio)  ← PRINCIPAL
#:     company_shareholders_document   composición, Colombia (obligatorio)  complementario
#:     company_complementary_document  el resto de los países (opcional)    complementario
#:
#: `company_id_document` (el e-RUT de Chile) y
#: `company_trade_chamber_sedpe_document` se siguen aceptando por
#: compatibilidad, pero Onboarding ya no los envía: el RUT de Chile lo trae el
#: scraper del SII, y el certificado colombiano llega como
#: `company_deeds_document`.
#:
#: Este default arrancó vacío —«todos principales»— por elegir el lado
#: conservador sin tener la especificación a mano. Con el dato, el lado
#: conservador es el otro, y la diferencia le cuesta al usuario: §8 dice que
#: `FAILED` consume uno de sus 3 intentos de lectura y `INCOMPLETE` no. Con todo
#: marcado como principal, la rama `INCOMPLETE` de §5.2 no se dispara nunca y un
#: complementario que falla le quema un intento que no debería.
#:
#: Vacío sigue significando «todos principales», porque es lo correcto si alguna
#: vez llega un lote sin `documentType` declarado.
TIPOS_PRINCIPALES: tuple[str, ...] = tuple(
    t.strip().upper()
    for t in os.environ.get("TIPOS_PRINCIPALES", "company_deeds_document").split(",")
    if t.strip()
)


def _resp(codigo: int, cuerpo: dict) -> dict:
    return {
        "statusCode": codigo,
        "headers": {"content-type": "application/json; charset=utf-8"},
        "body": json.dumps(cuerpo, ensure_ascii=False),
    }


def _error(nombre: str, mensaje: str = "", **extra) -> dict:
    codigo, cuerpo = errores.error_http(nombre, mensaje, **extra)
    return _resp(codigo, cuerpo)


# ── Entrada ─────────────────────────────────────────────────────────────────

def _documentos_pedidos(cuerpo: dict) -> tuple[list[dict], str | None]:
    """Los documentos tal como los nombró el llamador, o el motivo del `400`.

    No se toca S3 acá. Solo se mira la FORMA: que haya documentos, que no pasen
    del tope, y que cada uno diga de dónde sacarlo.
    """
    docs = cuerpo.get("documents")
    if not isinstance(docs, list) or not docs:
        return [], "`documents` es obligatorio y tiene que traer al menos un documento."
    if len(docs) > MAX_DOCUMENTOS_LOTE:
        return [], f"Se mandaron {len(docs)} documentos y el máximo por petición es {MAX_DOCUMENTOS_LOTE}."

    salida: list[dict] = []
    for i, d in enumerate(docs):
        if not isinstance(d, dict):
            return [], f"El documento {i} no es un objeto."
        uri = str(d.get("s3Uri") or "").strip()
        clave = str(d.get("objectKey") or d.get("object_key") or "").strip()
        if not uri and not clave:
            return [], f"El documento {i} no trae `s3Uri` ni `objectKey`."
        # Un `s3Uri` que ni siquiera se puede partir es un error de contrato, no
        # un documento que no se pudo bajar: se dice ahora y no dentro de tres
        # minutos por una consulta de estado.
        if uri and ingesta_s3.parsear_s3_uri(uri) is None:
            return [], f"El documento {i} trae un `s3Uri` inválido: se espera `s3://bucket/clave`."
        # §5.1 lo declara obligatorio en CADA documento (CO-03). Un
        # complementario sin tipo se aceptaba, y se leía sin saber qué era.
        tipo = str(d.get("documentType") or d.get("document_type") or "").strip()
        if not tipo:
            return [], f"El documento {i} no trae `documentType`."
        salida.append({
            "s3Uri": uri,
            "objectKey": clave,
            "fileName": str(d.get("fileName") or d.get("file_name") or ""),
            "documentType": tipo,
        })
    return salida, None


def ubicacion_invalida(documentos: list[dict], ambiente: str, company_id: str) -> str | None:
    """Por qué algún documento está fuera de su lugar, o `None` si están todos bien.

    ── Por qué EP-1 lo exige ──────────────────────────────────────────────────
    La Lambda puede leer todo el bucket de documentos, de los tres ambientes. Sin
    esto, quien tenía la credencial de `dev` pedía un análisis sobre un documento
    de `prod/…` y se lo llevaba entero por EP-3: el secreto por ambiente cuidaba
    la ruta, pero no el documento.

    Cada documento tiene que estar en el bucket de documentos y bajo
    `{environment}/{companyId}/`: el ambiente normalizado, y el `companyId` tal
    cual viene en la ruta. Vale para `s3Uri` y para `objectKey`, cuando vienen.
    Se rechaza también un segmento `.` o `..`: no tiene uso legítimo en una clave,
    y es la forma de que una clave que EMPIEZA con el prefijo apunte afuera de él.
    """
    prefijo = f"{ambiente}/{company_id}/"

    def motivo_clave(clave: str) -> str | None:
        if not clave.startswith(prefijo):
            return f"tiene que estar bajo «{prefijo}» (el ambiente y la empresa de la petición), y es «{clave}»"
        if any(s in (".", "..") for s in clave.split("/")):
            return f"no puede tener segmentos «.» ni «..» («{clave}»)"
        return None

    for i, d in enumerate(documentos):
        if d.get("s3Uri"):
            bucket, clave = ingesta_s3.parsear_s3_uri(d["s3Uri"]) or ("", "")
            if bucket != ingesta_s3.BUCKET:
                return (f"El documento {i} está en el bucket «{bucket}» y tiene que estar en "
                        f"«{ingesta_s3.BUCKET}».")
            m = motivo_clave(clave)
            if m:
                return f"El documento {i}: el `s3Uri` {m}."
        if d.get("objectKey"):
            m = motivo_clave(d["objectKey"])
            if m:
                return f"El documento {i}: el `objectKey` {m}."
    return None


#: Principales que se SUMAN según el país.
#:
#: En Colombia el documento constitutivo no llega como escritura: llega como el
#: certificado de existencia y representación legal de la Cámara de Comercio,
#: con el `documentType` `company_trade_chamber_sedpe_document`, que §5.2 no
#: lista. Es la realidad del dato —es el documento que prueba la sociedad y la
#: representación allá—, así que cuenta como principal.
#:
#: Sin esto, un lote colombiano quedaba SIN documento principal y salía
#: COMPLETED igual: la regla que protege «si falla la escritura, FAILED» no
#: tenía escritura que proteger. Pasó con un lote real.
TIPOS_PRINCIPALES_POR_PAIS: dict[str, tuple[str, ...]] = {
    "colombia": ("COMPANY_TRADE_CHAMBER_SEDPE_DOCUMENT",),
}

def _pais(v: Any) -> str:
    """El país como lo comparan las reglas: el nombre del catálogo en minúsculas
    y sin tildes, venga como código ISO o como nombre (AJ-08)."""
    return onboarding.pais_normalizado(v)


def tipos_principales(pais: Any = "") -> tuple[str, ...]:
    """Los `documentType` principales para ese país. Vacío = todos lo son."""
    if not TIPOS_PRINCIPALES:
        return ()
    return TIPOS_PRINCIPALES + TIPOS_PRINCIPALES_POR_PAIS.get(_pais(pais), ())


def es_principal(documento: dict, pais: Any = "") -> bool:
    """¿Este documento es la escritura (o lo que hace de escritura en ese país)?

    Sin vocabulario configurado, todos son principales. Ver `TIPOS_PRINCIPALES`.
    """
    tipos = tipos_principales(pais)
    if not tipos:
        return True
    return str(documento.get("documentType") or "").strip().upper() in tipos


# ── EP-1 ────────────────────────────────────────────────────────────────────

def manejar(evento: dict, ruta: str, metodo: str, *, analizar: Callable,
            extraer_socios: Callable | None = None,
            extraer_administracion: Callable | None = None,
            leer_identidad: Callable | None = None,
            leer_texto: Callable | None = None) -> dict | None:
    """La respuesta si la ruta es de esta familia, `None` si no lo es.

    Devolver `None` —y no un `404`— es lo que deja que el handler siga probando
    las rutas viejas. Un `404` acá se comería `/v1/analisis`.
    """
    m = RUTA_STATUS.match(ruta)
    if m:
        return _status(evento, m.group(1), metodo)

    m = RUTA_SECCION.match(ruta)
    if m:
        return _seccion(evento, m.group(1), m.group(2), metodo)

    m = RUTA_ANALYSIS.match(ruta)
    if m:
        return _analysis(evento, m.group(1), metodo)

    m = RUTA_ANALYSES.match(ruta)
    if not m:
        return None
    company_id = m.group(1)

    if metodo != "POST":
        return _error("BAD_REQUEST", f"{metodo} no está permitido en esta ruta.")

    try:
        cuerpo = json.loads(evento.get("body") or "{}")
        if not isinstance(cuerpo, dict):
            raise ValueError("el cuerpo no es un objeto")
    except Exception as e:  # noqa: BLE001
        return _error("BAD_REQUEST", f"No se pudo leer el cuerpo: {e}")

    # ── La forma de la petición ────────────────────────────────────────────
    ambiente = corridas.normalizar_ambiente(cuerpo.get("environment"))
    if not ambiente:
        return _error("BAD_REQUEST", "`environment` es obligatorio.")
    if not corridas.ambiente_admitido(ambiente):
        return _error(
            "BAD_REQUEST",
            f"`environment` no reconocido: {ambiente}. Admitidos: {', '.join(corridas.AMBIENTES)}.",
        )

    documentos, motivo = _documentos_pedidos(cuerpo)
    if motivo:
        return _error("BAD_REQUEST", motivo)

    motivo = ubicacion_invalida(documentos, ambiente, company_id)
    if motivo:
        return _error("BAD_REQUEST", motivo)

    pais_pedido = str(cuerpo.get("country") or "").strip()
    if not pais_pedido:
        # §6.5 lo declara obligatorio, y acá además decide qué documento es el
        # principal: sin país, un lote colombiano no tiene escritura.
        return _error("BAD_REQUEST", "`country` es obligatorio.")
    # AJ-08: el código ISO —que es lo que manda ms-company— o el nombre, siempre
    # del catálogo del Anexo A. Lo que no está, 400: un país que no se reconoce
    # dejaba sin aplicar las reglas por país, en silencio. Se guarda el nombre
    # normalizado del catálogo, que es contra lo que comparan las reglas.
    if onboarding.resolver_pais(pais_pedido) is None:
        posibles = onboarding.paises_posibles(pais_pedido)
        return _error("BAD_REQUEST", (
            f"`country` es ambiguo: «{pais_pedido}» puede ser {' o '.join(posibles)}. "
            "Mandar el código ISO." if posibles else
            f"`country` no está en el catálogo de países (Anexo A): «{pais_pedido}»."))
    pais = _pais(pais_pedido)

    # Un lote sin documento principal es un error de la PETICIÓN, no de la
    # corrida: se sabe antes de leer nada, así que es un 400 sincrónico y no un
    # FAILED — que además le consumiría al usuario uno de sus 3 intentos por
    # algo que no hizo él. §5.2: la escritura viaja «siempre».
    if not any(es_principal(d, pais) for d in documentos):
        esperados = ", ".join(t.lower() for t in tipos_principales(pais))
        return _error(
            "BAD_REQUEST",
            f"El lote no trae el documento principal. Se espera un `documentType` entre: {esperados}.",
        )

    # ── Una corrida por empresa a la vez, y el registro ANTES del 202 ──────
    # Mirar si hay una viva y registrar la nueva es UNA escritura condicional
    # (ver `corridas`, «El candado»): de dos EP-1 simultáneos, uno registra y el
    # otro recibe el 409 con los datos del primero.
    analysis_id = str(cuerpo.get("analysisId") or cuerpo.get("analysis_id") or "").strip() or str(uuid.uuid4())
    try:
        reg = corridas.registrar_inicio(
            ambiente, company_id, analysis_id,
            country=pais,
            documentos=documentos,
            schema_version=SCHEMA_VERSION,
        )
    except corridas.EnCurso as e:
        return _error(
            "CONFLICT",
            "Ya hay una corrida en curso para esa empresa y ambiente.",
            analysisId=e.viva.get("analysisId"),
            startedAt=e.viva.get("startedAt"),
        )
    except Exception as e:  # noqa: BLE001
        # Sin registro no hay corrida: un 202 acá prometería algo que ninguna
        # consulta de estado va a poder confirmar. ms-company reintenta un 503
        # sin cobrarle el intento al usuario.
        log.warning("no se pudo registrar la corrida de %s/%s: %s", ambiente, company_id, e)
        return _error("SERVICE_UNAVAILABLE", "No se pudo registrar la corrida. Se puede reintentar.")

    carga = {
        "ambiente": ambiente,
        "companyId": company_id,
        "analysisId": analysis_id,
        "country": pais,
        "documents": documentos,
    }
    try:
        # El modo del disparo NO viaja en la respuesta: el contrato de EP-1 son
        # cinco campos y uno de más se vuelve contrato de hecho en cuanto alguien
        # lo use. Es información de operación y vive en `/salud`.
        disparador.disparar(carga, lambda c: procesar(
            c, analizar=analizar, extraer_socios=extraer_socios,
            extraer_administracion=extraer_administracion, leer_identidad=leer_identidad,
            leer_texto=leer_texto))

        return _resp(202, {
            # Como número, igual que EP-2 a EP-6: §6.2 lo declara numérico, y
            # ms-company es Java — un texto y un número se deserializan distinto.
            "companyId": identificador(company_id),
            "analysisId": analysis_id,
            "status": corridas.IN_PROGRESS,
            "startedAt": reg["startedAt"],
            "schemaVersion": SCHEMA_VERSION,
        })
    except Exception:  # noqa: BLE001
        # Ya registrada, el 202 no llega a salir. El 503 le dice al consumidor
        # que reintente sin cobrar, así que la corrida no puede quedar
        # `IN_PROGRESS`: EP-2 mentiría y el reintento chocaría con un 409.
        log.exception("EP-1 falló después de registrar la corrida %s", analysis_id)
        corridas.anular(reg)
        return _error("SERVICE_UNAVAILABLE", "No se pudo iniciar la corrida. Se puede reintentar.")


# ── EP-2 · Estado ───────────────────────────────────────────────────────────

def _ambiente_de_query(evento: dict) -> str:
    q = evento.get("queryStringParameters") or {}
    return corridas.normalizar_ambiente(q.get("environment") or q.get("ambiente"))


def _status(evento: dict, company_id: str, metodo: str) -> dict:
    """`GET /v1/companies/{companyId}/analysis/status?environment=…`

    ── La regla que define este endpoint ───────────────────────────────────
    **Responde `200` siempre**, incluido `NOT_STARTED`. Nunca un `404`.

    No es una preferencia: «no hay análisis todavía» es una respuesta válida a
    esta pregunta, y decirla con un `404` la vuelve indistinguible de «esa ruta
    no existe» o «se equivocaron de `companyId`». El consumidor consulta en un
    bucle mientras espera, y un `404` lo haría dudar de su propia integración en
    cada vuelta.

    Lee de la persistencia operacional y **no reprocesa nada**: por eso responde
    con el cluster analítico pausado, que es el criterio de terminado del plan.
    """
    if metodo != "GET":
        return _error("BAD_REQUEST", f"{metodo} no está permitido en esta ruta.")

    ambiente = _ambiente_de_query(evento)
    if not ambiente:
        # El ambiente es parte de la clave. Adivinarlo leería el estado de otro
        # ambiente sobre la misma empresa, que es peor que no responder.
        return _error("BAD_REQUEST", "Falta el parámetro `environment`.")
    if not corridas.ambiente_admitido(ambiente):
        return _error(
            "BAD_REQUEST",
            f"`environment` no reconocido: {ambiente}. Admitidos: {', '.join(corridas.AMBIENTES)}.",
        )

    try:
        u = corridas.ultima(ambiente, company_id)
    except Exception as e:  # noqa: BLE001
        # Un `NOT_STARTED` acá haría que el consumidor vuelva a mandar el
        # análisis de una empresa que ya se analizó, y a pagarlo de nuevo.
        log.warning("no se pudo leer el estado de %s/%s: %s", ambiente, company_id, e)
        return _error("SERVICE_UNAVAILABLE", "No se pudo leer el estado de la empresa.")

    return _resp(200, estado_de(company_id, u))


def estado_de(company_id: str, u: dict | None) -> dict:
    """El cuerpo de EP-2 a partir del registro de la corrida.

    Función aparte y pura para que la forma de la respuesta se pueda testear sin
    montar un evento HTTP — y para que la Fase 4 la reuse sin copiarla.
    """
    if u is None:
        return {
            "companyId": identificador(company_id),
            "analysisId": None,
            "status": corridas.NOT_STARTED,
            "startedAt": None,
            "finishedAt": None,
            "error": None,
            "warnings": [],
            "schemaVersion": SCHEMA_VERSION,
        }

    estado = str(u.get("status") or corridas.NOT_STARTED)
    error = u.get("error")

    if corridas.caducada(u):
        # La corrida murió sin reportar: el proceso que la abrió ya no existe.
        # Decir que sigue procesando dejaría al consumidor esperando un
        # resultado que no va a llegar nunca.
        #
        # Se reusa `LENS_EXTRACTION_FAILED`, que es el motivo de respaldo del
        # canal, en vez de pedirle a Arquitectura un código nuevo para esto: el
        # plan dice explícitamente que cada `reason` nuevo es un pedido que
        # bloquea, y el mensaje ya distingue el caso.
        estado = corridas.FAILED
        error = errores.fallo(
            "LENS_EXTRACTION_FAILED",
            "La corrida dejó de reportar y se da por terminada.",
        )

    # `error` con CONTENIDO solo en FAILED, pero la CLAVE viaja siempre.
    #
    # Son dos reglas distintas y confundirlas fue un bug real: en `INCOMPLETE` el
    # análisis sirve, y mandar un error ahí haría que Onboarding descarte un
    # resultado utilizable —el error caro que describe `errores.py`—. Pero omitir
    # la clave es otra cosa: §6.2 dice que cada endpoint devuelve siempre los
    # mismos campos en cualquier estado, y los cuatro ejemplos de §6.6 muestran
    # `"error": null` explícito.
    #
    # En JavaScript casi no se nota (`r.error?.reason` no falla). ms-company es
    # Java, y ahí un campo ausente no es lo mismo que uno nulo.
    return {
        "companyId": identificador(u.get("companyId") or company_id),
        "analysisId": u.get("analysisId"),
        "status": estado,
        "startedAt": u.get("startedAt"),
        "finishedAt": u.get("finishedAt"),
        "error": (error or errores.fallo(
            "LENS_EXTRACTION_FAILED", "La corrida terminó sin un resultado utilizable.")
        ) if estado == corridas.FAILED else None,
        "warnings": normalizar_avisos(u.get("warnings") or []),
        # La forma con la que se SIRVE, no con la que se guardó: una corrida
        # de antes del v3 sale con los campos nuevos.
        "schemaVersion": SCHEMA_VERSION,
    }


# ── El trabajo de fondo ─────────────────────────────────────────────────────

#: Por qué se cayó un documento, según DÓNDE se cayó. La etapa decide la razón,
#: y la razón decide lo que le pasa al usuario: §8 separa «FAILED por el
#: documento» —se le pide subir otro— de «FAILED por el servicio» —reintento—.
#:
#: El caso que motivó separarlo: el objeto no existía en S3, `head_object`
#: falló, y la corrida salía LENS_DOCUMENT_NOT_READABLE. Eso le dice al usuario
#: «suba otro documento» cuando el documento estaba bien y la falla era de Lens.
RAZON_POR_ETAPA = {
    "resolucion": "LENS_DOCUMENT_DOWNLOAD_FAILED",   # head_object: no está o no hay permiso
    "descarga": "LENS_DOCUMENT_DOWNLOAD_FAILED",     # get_object
    "filtro": "LENS_DOCUMENT_NOT_READABLE",          # extensión o tamaño: es del documento
    "lectura": "LENS_DOCUMENT_NOT_READABLE",         # se bajó y no tiene texto recuperable
    "tipo": "DOCUMENT_TYPE_NOT_MATCH",               # no es el documento declarado
}

#: El aviso que deja un documento complementario que se perdió, según la etapa.
AVISO_POR_ETAPA = {
    "resolucion": ("EXPECTED_DATA_MISSING", "No se pudo obtener el documento"),
    "descarga": ("EXPECTED_DATA_MISSING", "No se pudo descargar el documento"),
    "filtro": ("PARTIALLY_ILLEGIBLE", "No se pudo usar el documento"),
    "lectura": ("PARTIALLY_ILLEGIBLE", "No se pudo leer el documento"),
    "tipo": ("EXPECTED_DATA_MISSING", "El documento no es del tipo declarado"),
    # Solo complementarios: el principal es la referencia, no se compara.
    "entidad": ("DOCUMENT_ENTITY_MISMATCH", "No se usaron los datos del documento"),
}


def _motivo(avisos: list[str], *claves: str) -> str:
    """El texto del aviso que habla de alguna de estas claves, sin el prefijo."""
    for a in avisos:
        for c in claves:
            if c and (a.startswith(c + ":") or a.startswith(c.rsplit("/", 1)[-1] + ":")):
                return a.split(":", 1)[1].strip()
    return ""


def procesar(carga: dict, *, analizar: Callable, extraer_socios: Callable | None = None,
             extraer_administracion: Callable | None = None,
             leer_identidad: Callable | None = None,
             leer_texto: Callable | None = None) -> dict:
    """Resuelve los documentos, analiza y cierra la corrida.

    Nunca levanta: lo que sale mal termina la corrida en `FAILED` con su motivo.
    Una excepción que escapara dejaría la corrida colgada en `IN_PROGRESS` hasta
    que la libere el tope de caducidad, y el consumidor esperando.

    ── Si el modelo no responde, la corrida no sigue ──────────────────────────
    La identidad, los 18 campos, las personas y la administración alimentan
    `company` y `legalRepresentatives`. Si alguna no responde —el callable lanza
    `errores.ServicioNoDisponible`—, la corrida termina `FAILED` con
    `SERVICE_UNAVAILABLE`. Antes seguía con lo que tuviera: una corrida con
    Gemini caído salió INCOMPLETE con la razón social corta, sin forma legal ni
    actividad, y tres «faltan datos» que culpaban al documento (AJ-04).

    ── Cada documento lleva su propio seguimiento ─────────────────────────────
    Un documento se puede caer en cinco lugares —al resolverlo, al filtrarlo, al
    descargarlo, al leerlo o al verificar que es lo que se dijo—, y lo que se
    haga con eso depende de DÓNDE se cayó y de SI ERA EL PRINCIPAL. Antes se
    reconstruía a partir de los textos de los avisos, y así se perdían dos cosas:
    la razón correcta de un fallo de descarga, y el `objectKey` en el aviso.
    """
    ambiente = carga.get("ambiente", "")
    company_id = carga.get("companyId", "")
    analysis_id = carga.get("analysisId", "")
    pais = carga.get("country", "")
    pedidos = carga.get("documents") or []
    t0 = time.monotonic()

    # Cuánto tarda cada etapa. Se guarda con la corrida —no sale en EP-3— porque
    # una corrida lenta no se diagnostica adivinando: una prueba con escrituras
    # reales tardó 101 s donde antes tardaba 16, y sin esto no había forma de
    # saber si fue la verificación de identidad, la lectura o las personas.
    tiempos: dict[str, int] = {}
    marca = [time.monotonic()]

    def medir(etapa_: str) -> None:
        ahora = time.monotonic()
        tiempos[etapa_] = int((ahora - marca[0]) * 1000)
        marca[0] = ahora

    claves = [_clave_pedida(d) for d in pedidos]
    etapa: list[str | None] = [None] * len(pedidos)
    detalle: list[str] = [""] * len(pedidos)
    avisos: list[dict] = []

    def cerrar(estado: str, error: dict | None = None, resultado: dict | None = None) -> dict:
        corridas.cerrar(ambiente, company_id, analysis_id, estado,
                        avisos=normalizar_avisos(avisos), error=error, resultado=resultado)
        return {"status": estado, "analysisId": analysis_id}

    def fallar(razon: str, mensaje: str) -> dict:
        return cerrar(corridas.FAILED, error=errores.fallo(razon, mensaje))

    def caido(que: str, e: Exception) -> dict:
        """§8, «FAILED por el servicio»: el documento puede estar bien."""
        log.warning("corrida %s cortada: no se pudo %s (%s)", analysis_id, que, e)
        return fallar("SERVICE_UNAVAILABLE", f"No se pudo {que}: {e}")

    def inservible(que: str, e: Exception) -> dict:
        """AJ-07: el modelo respondió dos veces algo que no se pudo usar. Es una
        falla de LENS, no un dato que el documento no traiga."""
        log.warning("corrida %s cortada: no se pudo %s, dos respuestas inutilizables (%s)",
                    analysis_id, que, e)
        return fallar("LENS_EXTRACTION_FAILED",
                      f"No se pudo {que}: el modelo respondió dos veces algo que no se pudo usar ({e}).")

    def con_reintento(que: str, llamada: Callable[[], Any]) -> Any:
        """Una vez más si la respuesta fue inutilizable (JSON inválido, cortada):
        leída de nuevo, casi siempre sale bien."""
        try:
            return llamada()
        except errores.ExtraccionFallida as e:
            log.warning("corrida %s: %s respondió algo inutilizable (%s); se reintenta una vez",
                        analysis_id, que, e)
            return llamada()

    principales = [i for i, d in enumerate(pedidos) if es_principal(d, pais)]

    def principales_vivos() -> list[int]:
        return [i for i in principales if etapa[i] is None]

    def fallar_por_principal() -> dict:
        """No quedó ningún principal utilizable: la razón es la de su etapa."""
        if not principales:
            return fallar("DOCUMENT_TYPE_NOT_MATCH", "El lote no trae el documento principal.")
        i = principales[0]
        e = etapa[i] or "lectura"
        nombre = pedidos[i].get("fileName") or claves[i]
        return fallar(RAZON_POR_ETAPA[e],
                      f"No se pudo usar el documento principal «{nombre}»: {detalle[i] or e}.")

    try:
        import boto3
        s3 = boto3.client("s3")
    except Exception as e:  # noqa: BLE001
        return fallar("LENS_DOCUMENT_DOWNLOAD_FAILED", f"No se pudo crear el cliente de S3: {e}")

    # ── 1 · Resolver ───────────────────────────────────────────────────────
    objetos, avisos_res = ingesta_s3.resolver_documentos(
        s3, [ingesta_s3.DocumentoPedido(
            s3_uri=d.get("s3Uri", ""), clave=d.get("objectKey", ""),
            nombre_archivo=d.get("fileName", ""), tipo=d.get("documentType", ""),
        ) for d in pedidos],
    )
    resueltos = {o.clave: o for o in objetos}
    for i, c in enumerate(claves):
        if c not in resueltos:
            etapa[i], detalle[i] = "resolucion", _motivo(avisos_res, c) or "no está en S3"

    # ── 2 · Filtrar ────────────────────────────────────────────────────────
    # El filtro por nombre NO se aplica: el llamador nombró los documentos uno
    # por uno y declaró su tipo, así que exigir además un prefijo descartaría
    # `escritura_constitucion.pdf` entero — y con un aviso, no con un error.
    aceptados, avisos_filtro = ingesta_s3.filtrar(list(resueltos.values()), exigir_prefijo=False)
    aceptadas = {o.clave for o in aceptados}
    for i, c in enumerate(claves):
        if etapa[i] is None and c not in aceptadas:
            etapa[i], detalle[i] = "filtro", _motivo(avisos_filtro, c) or "formato o tamaño no admitido"

    # ── 3 · Descargar ──────────────────────────────────────────────────────
    try:
        # El bucket por defecto solo se usa para los documentos que vinieron con
        # `objectKey` suelto: los que traen `s3Uri` llevan el suyo.
        descargados, avisos_desc = ingesta_s3.descargar(s3, ingesta_s3.BUCKET, aceptados)
    except Exception as e:  # noqa: BLE001
        return fallar("LENS_DOCUMENT_DOWNLOAD_FAILED", f"Falló la descarga: {e}")
    bajados = {d.clave: d for d in descargados}
    for i, c in enumerate(claves):
        if etapa[i] is None and c not in bajados:
            etapa[i], detalle[i] = "descarga", _motivo(avisos_desc, c) or "falló la descarga"
    medir("s3")

    if not principales_vivos():
        return fallar_por_principal()

    # ── 4 · ¿Es el documento que se dijo? ──────────────────────────────────
    # Antes de gastar nada más. Solo sobre los principales: el complementario de
    # identidad fiscal ES un documento tributario, y descartarlo por eso sería
    # descartar justo lo que §5.2 le pide.
    identidad: dict[int, dict] = {}
    if leer_identidad is not None:
        for i in principales_vivos():
            try:
                r = con_reintento("verificar el documento principal",
                                  lambda: leer_identidad(bajados[claves[i]], t0))
            except errores.ServicioNoDisponible as e:
                return caido("verificar el documento principal", e)
            except errores.ExtraccionFallida as e:
                return inservible("verificar el documento principal", e)
            except Exception as e:  # noqa: BLE001
                log.warning("no se pudo verificar el tipo de %s: %s", claves[i], e)
                r = None
            if r is None:
                avisos.append(errores.aviso(
                    "EXPECTED_DATA_MISSING",
                    "No se pudo verificar el tipo de documento ni resumir su actividad.",
                    object_key=claves[i], field="document"))
                continue
            identidad[i] = r
            if r.get("esConstitutivo") == "NO":
                declarado = pedidos[i].get("documentType") or "documento principal"
                visto = r.get("tipoDetectado") or "otro tipo de documento"
                etapa[i], detalle[i] = "tipo", f"se declaró {declarado} y el documento es {visto}"
        if not principales_vivos():
            return fallar_por_principal()
    medir("identidad")

    # ── 4b · ¿Los complementarios son de la misma empresa? (AJ-05) ─────────
    # Un certificado con el RUT de OTRA empresa se leía entero: el representante
    # de la otra entraba a la lista y, sin NIT en el certificado, se tomaba el de
    # la otra. Se lee el texto de cada complementario —que `analizar` reusa, no
    # se lee dos veces— y se compara su identidad con la del principal. Si es de
    # otra empresa, queda fuera de todo lo que sigue y se avisa. Si no se puede
    # saber, se usa como siempre: excluir a ciegas también es perder datos.
    ya_leidos: dict[str, Any] = {}
    textos_complementarios: dict[int, str] = {}
    complementarios_vivos = [i for i in range(len(pedidos))
                             if etapa[i] is None and i not in principales]
    if leer_texto is not None and complementarios_vivos:
        ref = next((identidad[i] for i in principales_vivos() if i in identidad), {})
        for i in complementarios_vivos:
            d = bajados[claves[i]]
            try:
                lectura = leer_texto(d, t0)
            except Exception as e:  # noqa: BLE001
                log.warning("no se pudo leer el texto de %s antes de analizar: %s", claves[i], e)
                continue
            if lectura is None:
                continue
            ya_leidos[d.nombre] = lectura
            textos_complementarios[i] = str(getattr(lectura, "texto", "") or "")
            propia = complementarios.identidad_desde_texto(textos_complementarios[i])
            veredicto, motivo = complementarios.misma_empresa(ref, propia)
            # Enmascarado: en Colombia el NIT de una persona natural es su cédula.
            # El veredicto es lo que permite validar el lector contra el RUT real.
            log.info("AJ-05 %s: id principal %s · id documento %s · razón social %s · → %s%s",
                     claves[i], complementarios.enmascarar(ref.get("taxId")),
                     complementarios.enmascarar(propia.get("taxId")),
                     "leída" if propia.get("legalName") else "no leída", veredicto,
                     f" ({motivo})" if veredicto is True and motivo else "")
            if veredicto is False:
                etapa[i], detalle[i] = "entidad", f"es de otra empresa, porque {motivo}"
    medir("identidad_complementarios")

    # ── 5 · Leer y extraer los 18 campos ───────────────────────────────────
    # Se leen todos los que llegaron vivos, complementarios incluidos: la
    # identidad fiscal es fuente del RUT y la razón social cuando la escritura
    # no los trae. Lo que NO entra es un principal que resultó ser otra cosa —es
    # lo que metía «USUARIO CEDULA» como cargo de un representante—, ni un
    # complementario de otra empresa.
    a_leer = [bajados[claves[i]] for i in range(len(pedidos)) if etapa[i] is None]
    try:
        resultado = analizar([(d.nombre, d.contenido) for d in a_leer], False, str(pais or ""),
                             inicio=t0, ya_leidos=ya_leidos or None)
    except errores.ServicioNoDisponible as e:
        return caido("extraer los campos del documento", e)
    except Exception as e:  # noqa: BLE001
        log.exception("fallo el análisis de la corrida %s", analysis_id)
        return fallar("LENS_EXTRACTION_FAILED", f"Error durante el análisis: {e}")
    medir("lectura_y_18_campos")

    # Qué se pudo leer, documento por documento.
    por_nombre = {d.nombre: d.clave for d in a_leer}
    ilegibles = {por_nombre.get(d.get("nombre")) for d in (resultado.get("documentos") or [])
                 if not d.get("ok")}
    for i, c in enumerate(claves):
        if etapa[i] is None and c in ilegibles:
            etapa[i], detalle[i] = "lectura", "no tiene texto recuperable"

    if not principales_vivos():
        return fallar_por_principal()
    if not resultado.get("ok"):
        return fallar("LENS_EXTRACTION_FAILED",
                      str(resultado.get("error") or "La extracción no produjo un resultado."))

    # Los avisos de la lectura, cada uno con el documento del que habla. Los de
    # un documento que ya quedó marcado como ilegible no se repiten: lo cubre el
    # aviso de documento perdido.
    for a in resultado.get("avisos") or []:
        nombre, sep, resto = a.partition(": ")
        clave = por_nombre.get(nombre, "") if sep else ""
        if clave and clave in ilegibles:
            continue
        razon = ("OCR_PAGE_LIMIT_REACHED" if ("tope de OCR" in a or "tope de lectura" in a)
                 else "PARTIALLY_ILLEGIBLE")
        avisos.append(errores.aviso(razon, a, object_key=clave, field="document"))

    # AJ-07: la forma legal y la actividad, si la pasada de identidad respondió
    # sin ellas. Antes de avisar que faltan: primero lo que dice el propio
    # documento, después una pasada más. Solo si siguen faltando, el aviso.
    i_ident = next((i for i in principales_vivos() if i in identidad), None)
    if i_ident is not None:
        try:
            _conciliar_identidad(identidad[i_ident], resultado, bajados[claves[i_ident]].nombre,
                                 lambda: con_reintento("releer el documento principal",
                                                       lambda: leer_identidad(bajados[claves[i_ident]], t0)),
                                 analysis_id)
        except errores.ServicioNoDisponible as e:
            return caido("releer el documento principal", e)
        except errores.ExtraccionFallida as e:
            return inservible("releer el documento principal", e)

    # ── 6 · Personas y administración, sobre los PDF nativos ───────────────
    # Nunca lanzan: si fallan, la ficha de 18 campos ya está lista y perderla
    # por esto sería peor que devolverla sin personas.
    vivos = [bajados[claves[i]] for i in range(len(pedidos)) if etapa[i] is None]
    personas, avisos_personas = ({}, [])
    if extraer_socios is not None:
        try:
            personas, avisos_personas = con_reintento("leer a los representantes",
                                                      lambda: extraer_socios(vivos, t0))
        except errores.ServicioNoDisponible as e:
            return caido("leer a los representantes", e)
        except errores.ExtraccionFallida as e:
            return inservible("leer a los representantes", e)
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo extraer la composición societaria de %s: %s", analysis_id, e)
            avisos_personas = [f"No se pudo extraer la composición societaria ({e})."]
    avisos += [errores.aviso("EXPECTED_DATA_MISSING", a, field=_campo_aviso_socios(a))
               for a in avisos_personas]
    _clasificar_personas(personas)
    _sin_codigo_dian(personas, [textos_complementarios[i] for i in textos_complementarios
                                if etapa[i] is None and _es_id_fiscal(pedidos[i])], pais)
    medir("personas")

    # El régimen de administración (§11). Si el modelo no responde, la corrida
    # no sigue (ver arriba); si responde y no lo dice, `None`: nunca se adivina,
    # porque decide cuántas aprobaciones necesita una empresa para operar.
    administracion = None
    if extraer_administracion is not None:
        try:
            administracion = con_reintento("leer el régimen de administración",
                                           lambda: extraer_administracion(vivos, t0))
        except errores.ServicioNoDisponible as e:
            return caido("leer el régimen de administración", e)
        except errores.ExtraccionFallida as e:
            return inservible("leer el régimen de administración", e)
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo leer el régimen de administración de %s: %s", analysis_id, e)
            avisos.append(errores.aviso(
                "EXPECTED_DATA_MISSING",
                f"No se pudo determinar el régimen de administración ({e}).",
                field="jointAdministration"))
    medir("administracion")

    # ── 7 · Los documentos que se perdieron en el camino ───────────────────
    for i, e in enumerate(etapa):
        if e is None:
            continue
        razon, texto = AVISO_POR_ETAPA[e]
        nombre = pedidos[i].get("fileName") or claves[i].rsplit("/", 1)[-1]
        avisos.append(errores.aviso(razon, f"{texto} «{nombre}»: {detalle[i]}.", object_key=claves[i],
                                    field="document"))

    # ── 8 · Cerrar: el estado sale de §8.1 y §10, no de si se perdió algo ──
    i_ident = next((i for i in principales_vivos() if i in identidad), None)
    ident = identidad[i_ident] if i_ident is not None else {}

    # CO-07: el documento es de otro país que el declarado. El país de
    # `analizar` no sirve para esto —en esta corrida es el declarado, forzado—;
    # el del documento sale de la pasada de identidad. Solo si lo dijo.
    pais_doc = _pais(ident.get("country"))
    if pais_doc and not _mismo_pais(pais_doc, _pais(pais)):
        avisos.append(errores.aviso(
            "DOCUMENT_COUNTRY_MISMATCH",
            f"El documento principal es de {ident.get('country')} y el país declarado es «{pais}»: "
            "se leyó con las reglas del país declarado.",
            object_key=claves[i_ident], field="document"))

    # CO-06: los campos fijos de personas que vinieron vacíos se completan
    # desde el bloque estructurado, que es el que manda.
    _completar_campos_de_personas(resultado.get("campos") or [], personas, analysis_id)

    ficha = _ficha(resultado, pedidos, claves, etapa, personas, administracion, ident)
    # AJ-01: la línea de dirección, del principal primero. Se guarda la línea
    # y no el texto: una escritura entera no entra en la fila.
    textos = resultado.get("_textos") or {}
    orden = sorted((i for i in range(len(pedidos)) if etapa[i] is None),
                   key=lambda i: (i not in principales, i))
    ficha["addressLine"] = onboarding.linea_de_direccion(
        [textos.get(bajados[claves[i]].nombre, "") for i in orden])
    ficha["timingsMs"] = tiempos
    log.info("corrida %s · tiempos por etapa (ms): %s", analysis_id, json.dumps(tiempos))
    cuerpo, avisos_forma = _serializar(company_id, {"result": ficha, "country": pais})
    avisos_forma = avisos_forma + _accionistas({"result": ficha})[2]
    avisos += avisos_forma

    faltan_requeridos, faltan_esperados = evaluar(cuerpo, pais)
    if faltan_requeridos:
        return fallar("LENS_REQUIRED_DATA_MISSING",
                      "Faltan datos requeridos: " + "; ".join(faltan_requeridos) + ".")

    # Lo que la serialización ya avisó —una fecha ilegible, la forma legal— no
    # se avisa dos veces.
    ya_avisados = {(a.get("field"), a.get("subject")) for a in avisos_forma if a.get("field")}
    for campo, mensaje, quien in faltan_esperados:
        if (campo, quien) not in ya_avisados:
            avisos.append(errores.aviso("EXPECTED_DATA_MISSING", mensaje, field=campo, subject=quien))

    # §8.1: COMPLETED es «están todos los datos requeridos y esperados y no hay
    # avisos». Antes se miraba solo si se había perdido un documento, y las seis
    # empresas del lote de prueba salieron COMPLETED con avisos: Onboarding no le
    # mostraba al usuario lo que faltaba.
    estado = corridas.INCOMPLETE if normalizar_avisos(avisos) else corridas.COMPLETED
    return cerrar(estado, resultado=ficha)


def _conciliar_identidad(ident: dict, resultado: dict, nombre_principal: str,
                         releer: Callable[[], dict | None], analysis_id: str) -> None:
    """AJ-07: la forma legal y la actividad, antes de avisar que faltan.

    La pasada de identidad a veces responde sin ellas teniéndolas el documento:
    la misma escritura, leída de nuevo, las daba. Avisar «faltan datos» por eso
    le descontaba al usuario un intento por una falla de LENS. Antes de avisar:

      1. la forma legal, de lo que dice el texto del documento —una sola forma
         societaria nombrada con todas sus letras—, si la razón social no la da;
      2. una pasada más, si todavía falta alguna de las dos;
      3. la actividad, resumida del «Objeto Social» de los 18 campos.

    Modifica `ident` en el lugar. Lo que siga faltando lo avisa la
    serialización, como siempre.
    """
    campos = {c.get("field"): c.get("value") for c in (resultado.get("campos") or [])}
    razon, objeto = _dato(campos.get("Razón Social")), _dato(campos.get("Objeto Social"))
    texto = (resultado.get("_textos") or {}).get(nombre_principal, "")

    def falta_forma() -> bool:
        return onboarding.forma_legal(razon, ident.get("legalForm")) is None

    def falta_actividad() -> bool:
        return bool(objeto) and not onboarding.actividad(ident.get("activity"), objeto)

    if not (falta_forma() or falta_actividad()):
        return
    if falta_forma():
        ident["legalForm"] = onboarding.forma_legal_desde_texto(texto) or ident.get("legalForm")
    if falta_forma() or falta_actividad():
        otra = releer() or {}
        for k in ("legalForm", "activity"):
            if not ident.get(k) and otra.get(k):
                ident[k] = otra[k]
    if falta_actividad():
        ident["activity"] = onboarding.actividad_desde_objeto(objeto)
    log.info("AJ-07 corrida %s: identidad conciliada · forma legal %s · actividad %s", analysis_id,
             "ok" if not falta_forma() else "falta", "ok" if not falta_actividad() else "falta")


def _campo_aviso_socios(texto: str) -> str | None:
    """El `field` de un aviso de la lectura de personas (AJ-07)."""
    t = texto.lower()
    if "participación" in t or "suma" in t:
        return "shareholder.ownershipPercentage"
    if "cadena" in t or "segundo nivel" in t:
        return "shareholder.indirectShareholders"
    return "legalRepresentatives"


def _clasificar_personas(personas: dict) -> None:
    """El tipo de las personas que vinieron sin él, y cada una en su lugar.

    `onboarding.inferir_tipo_persona` decide lo decidible —el RFC de 12 o 13,
    la sigla societaria, el tipo de documento—. Una sociedad que el modelo dejó
    sin tipo estaba en `directOwnership`, que es de personas naturales: pasa a
    la raíz de `indirectShareholders`, que es donde el contrato pone a las
    jurídicas. Lo que no se puede decidir se queda donde está, sin tipo, y la
    serialización lo avisa. Modifica `personas` en el lugar.
    """
    for r in personas.get("legalRepresentatives") or []:
        if not onboarding.tipo_persona(r.get("personType")):
            r["personType"] = onboarding.inferir_tipo_persona(r) or r.get("personType")
    directos, juridicas = [], []
    for d in personas.get("directOwnership") or []:
        if not onboarding.tipo_persona(d.get("personType")):
            d["personType"] = onboarding.inferir_tipo_persona(d) or d.get("personType")
        (juridicas if d.get("personType") == "JURIDICA" else directos).append(d)
    if juridicas:
        personas["directOwnership"] = directos
        personas["indirectShareholders"] = (personas.get("indirectShareholders") or []) + [
            {**j, "indirectShareholders": j.get("indirectShareholders") or []} for j in juridicas]


def _mismo_pais(a: str, b: str) -> bool:
    """«colombia» y «republica de colombia» son el mismo país."""
    return a == b or f" {a} " in f" {b} " or f" {b} " in f" {a} "


#: Lo que en los campos de personas dice «no hay nadie».
_RELLENO_PERSONAS = re.compile(r"no especificado|sin documento|sin porcentaje|sin cargo", re.IGNORECASE)


def _sin_personas(valor: Any) -> bool:
    """¿El campo fijo no nombra a nadie? «No especificado», o solo relleno:
    Onboarding vio «sin documento · sin porcentaje» con los porcentajes en EP-6."""
    resto = _RELLENO_PERSONAS.sub(" ", str(valor or ""))
    return sum(c.isalpha() for c in resto) < 2


def _linea_persona(p: dict, dato: str) -> str:
    nombre = str(p.get("shareholderName") or p.get("name") or "").strip()
    doc = str(p.get("shareholderId") or p.get("identificationNumber") or "").strip()
    return f"{nombre} | {doc or 'sin documento'} | {dato}"


def _completar_campos_de_personas(campos: list[dict], personas: dict, analysis_id: str) -> None:
    """CO-06: si «Representante Legal» o «Accionistas y aportes» vinieron sin
    nadie y el bloque estructurado sí trae personas, el campo se completa desde
    el bloque, con el formato de siempre (`NOMBRE | DOCUMENTO | DATO`).

    Son dos llamadas al modelo que respondieron distinto sobre las mismas
    páginas —no un efecto del tope de OCR—, y la regla es explícita: manda el
    bloque estructurado. La discrepancia queda en el log, sin datos de personas.
    Modifica `campos` en el lugar.
    """
    p = personas or {}
    reps = p.get("legalRepresentatives") or []
    duenos = (p.get("directOwnership") or []) + (p.get("indirectShareholders") or [])

    def pct(x: dict) -> str:
        n = onboarding.porcentaje(x.get("ownershipPercentage"))
        return f"{n}%".replace(".", ",") if n is not None else "sin porcentaje"

    desde_bloque = {
        "Representante Legal": [_linea_persona(r, onboarding.cargo_legible(r.get("position")) or "sin cargo")
                                for r in reps],
        "Accionistas y aportes": [_linea_persona(d, pct(d)) for d in duenos],
    }
    for c in campos:
        lineas = desde_bloque.get(c.get("field"))
        if lineas and _sin_personas(c.get("value")):
            log.warning("CO-06 corrida %s: «%s» vino sin personas y el bloque estructurado trae %d; "
                        "se completa desde el bloque", analysis_id, c.get("field"), len(lineas))
            c["value"] = "\n".join(lineas)


def _es_id_fiscal(documento: dict) -> bool:
    return str(documento.get("documentType") or "").strip().upper() == "COMPANY_ID_DOCUMENT"


def _sin_codigo_dian(personas: dict, textos_rut: list[str], pais: Any) -> None:
    """AJ-06: el número del representante sin el código DIAN pegado adelante.

    En el RUT de la DIAN la casilla 100 es el código del tipo de documento
    (13 = cédula) y la 101 el número, y el modelo los junta: la cédula de 8
    dígitos salía como `13` + la cédula. Se corrige SOLO si el texto del RUT lo
    confirma —el número sin el código aparece suelto y el pegado no aparece—, y
    el código solo sirve para el tipo cuando el modelo no lo dio. Solo en
    Colombia, que es donde existe ese formulario. Modifica `personas` en el lugar.
    """
    if not textos_rut or _pais(pais) != "colombia":
        return
    for p in personas.get("legalRepresentatives") or []:
        arreglo = complementarios.sin_codigo_dian(
            p.get("shareholderId") or p.get("identificationNumber"), textos_rut)
        if arreglo is None:
            continue
        numero, tipo = arreglo
        clave = "shareholderId" if p.get("shareholderId") else "identificationNumber"
        p[clave] = numero
        if tipo and not str(p.get("identificationType") or "").strip():
            p["identificationType"] = tipo
        # Sin el número: es un dato personal y el log no lo necesita.
        log.info("AJ-06: se quitó el código DIAN pegado al número de un representante")


def _ficha(resultado: dict, pedidos: list[dict], claves: list[str], etapa: list,
           personas: dict | None = None, administracion: dict | None = None,
           identidad: dict | None = None) -> dict:
    """Lo que se guarda de una corrida y después sirve EP-3.

    **No entra el texto de los documentos.** Son escrituras enteras y una fila
    de DynamoDB tiene un tope de 400 KB; además EP-3 no lo pide.

    `documents[]` lleva UNA ENTRADA POR DOCUMENTO PEDIDO, en el orden en que se
    pidieron, también los que se perdieron. §6.7: «`ok: false` indica un
    documento complementario que no se pudo usar mientras la corrida siguió con
    los demás». Si el perdido no apareciera, Onboarding no tendría cómo saber
    cuál de sus archivos falló.
    """
    leidos = {d.get("nombre"): d for d in (resultado.get("documentos") or [])}

    documentos = []
    for i, d in enumerate(pedidos):
        nombre = d.get("fileName") or claves[i].rsplit("/", 1)[-1]
        meta = leidos.get(claves[i].rsplit("/", 1)[-1]) or leidos.get(nombre) or {}
        documentos.append({
            "objectKey": claves[i],
            "fileName": nombre,
            "documentType": d.get("documentType") or None,
            "ok": bool(meta.get("ok")) and etapa[i] is None,
            "pagesTotal": meta.get("paginas_totales"),
            "pagesRead": meta.get("paginas_leidas"),
            # Para diagnóstico y para el espejo analítico. NO salen en EP-3: el
            # contrato de `documents[]` son seis claves.
            "_method": meta.get("metodo"),
            "_pagesFromOcr": meta.get("paginas_por_ocr"),
        })

    p = personas or {}
    return {
        "fields": resultado.get("campos") or [],
        "documents": documentos,
        "detectedCountry": resultado.get("pais_detectado") or "",
        # Crudos, sin serializar: la forma de EP-4 la pone `_serializar` al
        # responder. Guardarlos ya serializados congelaría el formato de la
        # fecha en que se corrió el análisis.
        "legalRepresentatives": p.get("legalRepresentatives") or [],
        "directOwnership": p.get("directOwnership") or [],
        "indirectShareholders": p.get("indirectShareholders") or [],
        "administration": administracion or {},
        # La pasada de identidad: la actividad resumida y la forma legal según
        # el texto del documento.
        "identity": {
            "activity": (identidad or {}).get("activity"),
            "legalForm": (identidad or {}).get("legalForm"),
            "documentKind": (identidad or {}).get("tipoDetectado"),
            "country": (identidad or {}).get("country"),
        },
    }


# ── EP-3 · El resultado ─────────────────────────────────────────────────────

#: Los estados en los que hay algo que devolver. Los demás dan `404`.
UTILIZABLES = (corridas.COMPLETED, corridas.INCOMPLETE)


def _analysis(evento: dict, company_id: str, metodo: str) -> dict:
    """`GET /v1/companies/{companyId}/analysis?environment=…`

    ── El `404` de acá NO contradice el `200` de EP-2 ──────────────────────
    Son dos preguntas distintas. EP-2 pregunta *«¿en qué anda?»* y «todavía
    nada» es una respuesta; EP-3 pregunta *«dame el resultado»* y cuando no hay
    resultado no hay nada que devolver.

    Y el `404` mira **solo la corrida más reciente**, aunque exista una anterior
    utilizable. Devolver la vieja sería contestar con datos de un análisis que
    ya se reemplazó, sin que quien pregunta pueda notarlo.
    """
    u, fallo_ = _corrida_utilizable(evento, company_id, metodo)
    if fallo_ is not None:
        return fallo_
    return _resp(200, resultado_de(company_id, u))


def _corrida_utilizable(evento: dict, company_id: str, metodo: str) -> tuple[dict, dict | None]:
    """`(corrida, None)` si hay una utilizable; `({}, respuesta_de_error)` si no.

    Lo comparten EP-3 y las tres vistas de la Fase 7: son el mismo resultado
    mirado por distintas ventanas, así que tienen que dar el mismo `404` sobre
    la misma corrida. Duplicar esta lógica haría que una sección respondiera
    `200` mientras otra responde `404` sobre la misma empresa.
    """
    if metodo != "GET":
        return {}, _error("BAD_REQUEST", f"{metodo} no está permitido en esta ruta.")

    ambiente = _ambiente_de_query(evento)
    if not ambiente:
        return {}, _error("BAD_REQUEST", "Falta el parámetro `environment`.")
    if not corridas.ambiente_admitido(ambiente):
        return {}, _error(
            "BAD_REQUEST",
            f"`environment` no reconocido: {ambiente}. Admitidos: {', '.join(corridas.AMBIENTES)}.",
        )

    try:
        u = corridas.ultima(ambiente, company_id)
    except Exception as e:  # noqa: BLE001
        log.warning("no se pudo leer el análisis de %s/%s: %s", ambiente, company_id, e)
        return {}, _error("SERVICE_UNAVAILABLE", "No se pudo leer el análisis de la empresa.")

    if u is None or corridas.caducada(u) or u.get("status") not in UTILIZABLES:
        return {}, _error(
            "NOT_FOUND",
            "No hay un análisis utilizable para esa empresa y ambiente.",
            status=(corridas.estado(ambiente, company_id) if u else corridas.NOT_STARTED),
        )

    return u, None


def identificador(company_id: Any) -> Any:
    """El `companyId` como lo espera Onboarding.

    La especificación lo declara **number** y sus ejemplos lo muestran así
    (`48213`). Se devuelve como número cuando lo es, y tal cual cuando no: el
    caso normal calza exacto con el contrato, y un identificador que no sea
    numérico se refleja como vino en vez de romper la respuesta.

    No se RECHAZA lo no numérico —la v1.1 pide un `400` para eso— porque la v1.2
    cambió la clave de persistencia a «ambiente + companyId» y no está en este
    repo para confirmar si el tipo siguió igual. Rechazar de más cortaría
    tráfico legítimo; reflejarlo no rompe a nadie. Queda anotado para cerrarlo
    cuando llegue la v1.2.
    """
    texto = str(company_id or "").strip()
    return int(texto) if texto.isdigit() else company_id


#: Las claves de cada entrada de `documents[]` que viajan en EP-3 (§6.7). Las
#: que empiezan con `_` quedan guardadas para diagnóstico y no salen.
CLAVES_DOCUMENTO = ("objectKey", "fileName", "documentType", "ok", "pagesTotal", "pagesRead")


def _serializar(company_id: str, u: dict) -> tuple[dict, list[dict]]:
    """`(cuerpo_de_EP3, avisos_de_forma)`. Puro.

    Se llama DOS veces en la vida de una corrida, y es a propósito: al cerrarla,
    para que el estado tenga en cuenta todo lo que salió mal al darle forma a
    los datos; y al responder EP-3, para armar la respuesta. Los avisos de la
    segunda vez se descartan: los que valen son los guardados al cerrar, que son
    los mismos que muestra EP-2. §6.7: EP-3 lleva «los mismos avisos de EP-2».
    """
    ficha = u.get("result") or {}
    campos = {c.get("field"): c.get("value") for c in (ficha.get("fields") or [])}
    ident = ficha.get("identity") or {}
    avisos = onboarding.Avisos()

    empresa = onboarding.empresa({
        "legalName": _dato(campos.get("Razón Social")),
        "taxId": _dato(campos.get("RUT de la sociedad")),
        # El país DECLARADO manda; el detectado es solo para cuando no vino.
        "country": u.get("country") or ficha.get("detectedCountry") or "",
        "constitutionDate": _dato(campos.get("Fecha de Constitución")),
        "legalFormDoc": ident.get("legalForm"),
        "activity": ident.get("activity"),
        # Contra qué se verifica que el resumen no traiga una palabra cortada.
        "objetoSocial": _dato(campos.get("Objeto Social")),
        "address": _dato(campos.get("Domicilio Legal")),
        # La calle y la oficina, de la línea de dirección del documento (AJ-01).
        "addressLine": ficha.get("addressLine"),
        "jointAdministration": (ficha.get("administration") or {}).get("jointAdministration"),
    }, avisos)

    representantes = [
        r for r in (
            onboarding.representante(p, avisos)
            for p in (ficha.get("legalRepresentatives") or [])
        ) if r is not None
    ]

    cuerpo = {
        "companyId": identificador(u.get("companyId") or company_id),
        "analysisId": u.get("analysisId"),
        "status": u.get("status"),
        # La jurisdicción con la que se corrió: le dice al consumidor bajo qué
        # reglas se leyó el documento. Normalizada como pide el contrato
        # —minúsculas, sin tildes—: «Colombia» y «perú» volvían tal cual (CO-04).
        "country": _pais(u.get("country") or ficha.get("detectedCountry") or ""),
        # AJ-08: el ISO-2 del catálogo, al lado. `null` si el país no es de él.
        "countryCode": onboarding.codigo_pais(u.get("country") or ficha.get("detectedCountry") or ""),
        # La forma con la que se SIRVE, no con la que se guardó: una corrida
        # de antes del v3 sale con los campos nuevos.
        "schemaVersion": SCHEMA_VERSION,
        "company": empresa,
        "legalRepresentatives": representantes,
        "fields": ficha.get("fields") or [],
        "documents": [{k: d.get(k) for k in CLAVES_DOCUMENTO}
                      for d in (ficha.get("documents") or [])],
        "warnings": [],
    }
    return cuerpo, avisos.items


def resultado_de(company_id: str, u: dict) -> dict:
    """El cuerpo de EP-3. Puro: la forma se testea sin montar un evento HTTP."""
    cuerpo, _ = _serializar(company_id, u)
    cuerpo["warnings"] = normalizar_avisos(u.get("warnings") or [])
    return cuerpo


def normalizar_avisos(avisos: list[dict]) -> list[dict]:
    """Cada aviso con EXACTAMENTE las cinco claves del contrato, sin repetidos.

    §6.6: `warnings[]` lleva `reason`, `objectKey` y `message`, y desde el v3
    `field` y `subject` (AJ-07). Los avisos que nacen al darle forma a los datos
    traían claves de más —`original`, `valor`—, y alguno el objeto social
    entero; y los de la serialización no traían `objectKey`. Un aviso sin
    `objectKey` obliga a quien integra a adivinar de qué documento habla.

    Los avisos guardados antes del v3 no tienen `field` ni `subject`: salen en
    `null`, igual que cuando no aplican.
    """
    fuera: list[dict] = []
    vistos: set[tuple] = set()
    for a in avisos or []:
        limpio = {
            "reason": str(a.get("reason") or "EXPECTED_DATA_MISSING"),
            # `null` cuando no es de un archivo (§6.6), nunca `""`.
            "objectKey": str(a.get("objectKey")) if a.get("objectKey") else None,
            "message": str(a.get("message") or ""),
            "field": str(a.get("field")) if a.get("field") else None,
            "subject": str(a.get("subject")) if a.get("subject") else None,
        }
        firma = (limpio["reason"], limpio["objectKey"], limpio["message"],
                 limpio["field"], limpio["subject"])
        if firma not in vistos:
            vistos.add(firma)
            fuera.append(limpio)
    return fuera


# ── §10 · Qué es requerido y qué es esperado ────────────────────────────────

def _nit_con_dv(tax_id: Any) -> bool:
    """¿El NIT trae su dígito verificador? `900123456-7`, `900123456 7` o diez
    dígitos seguidos. §10 lo pide explícitamente para Colombia."""
    s = str(tax_id or "").strip()
    return bool(re.search(r"\d[\s-]\d$", s)) or len(re.sub(r"\D", "", s)) >= 10


def evaluar(cuerpo: dict, pais: Any) -> tuple[list[str], list[tuple[str, str]]]:
    """`(requeridos_que_faltan, esperados_que_faltan)` según §10.

    ── Por qué esto decide el estado y no otra cosa ──────────────────────────
    §8.1 define los tres estados terminales POR LOS DATOS, no por cómo fue la
    lectura:

      FAILED      falta al menos un dato REQUERIDO
      INCOMPLETE  están los requeridos, pero hay avisos o falta un ESPERADO
      COMPLETED   están todos los requeridos y esperados, y no hay avisos

    **Requeridos**, en todos los orígenes: la razón social y al menos un
    representante con nombre y tipo de persona. La versión anterior exigía
    «razón social O RUT» —el RUT es esperado, no requerido— y no miraba a los
    representantes: una corrida sin ningún representante salía COMPLETED, y
    para Onboarding eso es una empresa sin nadie que pueda operarla.

    **Esperados**: documento y cargo de los representantes, forma legal, fecha
    de constitución y domicilio. El identificador tributario solo en Colombia:
    el NIT con su dígito verificador.

    En Chile el RUT dejó de ser esperado (contrato v3.1, 22-10-2026). Onboarding
    ya no envía el e-RUT: el RUT lo trae el scraper del SII, y una escritura de
    constitución no lo trae porque el SII lo asigna después. Seguir esperándolo
    dejaría INCOMPLETE a todas las corridas de Chile solo por eso. Si la
    escritura trae el RUT, se informa igual. En el resto de los orígenes el
    identificador tributario puede no existir.
    """
    empresa = cuerpo.get("company") or {}
    reps = cuerpo.get("legalRepresentatives") or []
    p = _pais(pais)

    requeridos: list[str] = []
    if not empresa.get("legalName"):
        requeridos.append("la razón social")
    if not any((r.get("fullName") or r.get("name")) and r.get("personType") for r in reps):
        requeridos.append("al menos un representante con nombre y tipo de persona")

    # `(field, message, subject)`. Uno por persona, no uno con todos los
    # nombres: Onboarding le dice al usuario qué dato falta y de quién (AJ-07).
    esperados: list[tuple[str, str, str | None]] = []
    if p == "colombia":
        if not empresa.get("taxId"):
            esperados.append(("taxId", "El documento no trae el identificador tributario de la sociedad.", None))
        elif not _nit_con_dv(empresa.get("taxId")):
            esperados.append(("taxId", "El NIT de la sociedad viene sin dígito verificador.", None))
    if not empresa.get("legalForm"):
        esperados.append(("legalForm", "No se pudo determinar la forma legal de la sociedad.", None))
    if not empresa.get("constitutionDate"):
        esperados.append(("constitutionDate", "El documento no trae la fecha de constitución.", None))
    domicilio = empresa.get("address") or {}
    if not (domicilio.get("street") or domicilio.get("city")):
        esperados.append(("address", "El documento no declara un domicilio legal.", None))

    for r in reps:
        quien = str(r.get("fullName") or r.get("name") or "").strip() or None
        if not r.get("identificationNumber"):
            esperados.append(("legalRepresentative.identificationNumber",
                              f"Falta el documento de identidad de: {quien or '?'}.", quien))
        if not r.get("role"):
            esperados.append(("legalRepresentative.role", f"Falta el cargo de: {quien or '?'}.", quien))

    return requeridos, esperados


# ── EP-4, EP-5 y EP-6 · Las vistas filtradas — Fase 7 ───────────────────────
# Las tres responden lo MISMO que su bloque en EP-3, sin recalcular nada: salen
# de `resultado_de`, que es la única implementación del contrato. Si cada una
# armara su bloque por su cuenta, EP-3 y EP-5 podrían empezar a diferir sin que
# nadie lo note — y el consumidor vería una empresa distinta según por dónde
# preguntara.

#: Qué clave de `resultado_de` entrega cada sección.
SECCIONES = {
    "legal-representatives": "legalRepresentatives",
    "company": "company",
    "shareholders": "businessShareholders",
}


def _seccion(evento: dict, company_id: str, nombre: str, metodo: str) -> dict:
    """`GET /v1/companies/{companyId}/analysis/{legal-representatives|company|shareholders}`

    Mismas reglas que EP-3: mismo `404`, mismo `environment`, misma lectura. Lo
    único que cambia es cuánto se devuelve.
    """
    u, fallo_ = _corrida_utilizable(evento, company_id, metodo)
    if fallo_ is not None:
        return fallo_

    completo = resultado_de(company_id, u)
    clave = SECCIONES[nombre]
    return _resp(200, {
        "companyId": completo["companyId"],
        "analysisId": completo["analysisId"],
        clave: (accionistas_de(company_id, u) if clave == "businessShareholders"
                else completo[clave]),
        "schemaVersion": completo["schemaVersion"],
    })


def accionistas_de(company_id: str, u: dict) -> dict:
    """El objeto raíz `BusinessShareholders` de EP-6: cuatro campos.

    Es la estructura que el procesador de accionistas de Onboarding produce hoy.
    Respetarla es el punto del endpoint: permite retirar ese procesador sin que
    Onboarding toque su persistencia.

    Los accionistas se serializan con `persona()` y no con `representante()`
    aunque las dos hagan «una persona»: EP-6 tiene otras claves y otras reglas
    —el identificador va solo con dígitos, y el vocabulario de
    `identificationType` es el otro—. Reusar la forma de EP-4 acá emitiría las
    claves equivocadas con los valores equivocados.
    """
    ficha = u.get("result") or {}
    campos = {c.get("field"): c.get("value") for c in (ficha.get("fields") or [])}
    empresa = onboarding.empresa({
        "legalName": _dato(campos.get("Razón Social")),
        "taxId": _dato(campos.get("RUT de la sociedad")),
    }, onboarding.Avisos())
    directos, indirectos, _ = _accionistas(u)
    return {
        "businessName": empresa["legalName"],
        "businessId": empresa["taxId"],
        "directOwnership": directos,
        "indirectShareholders": indirectos,
    }


def _accionistas(u: dict) -> tuple[list, list, list[dict]]:
    """`(directOwnership, indirectShareholders, avisos)` de EP-6.

    Los avisos importan: hasta el 14-10-2026 la corrida no serializaba a los
    accionistas al cerrarse, así que lo que se avisaba de ellos —un país fuera
    del catálogo, una persona sin tipo— no llegaba nunca a `warnings[]`.
    """
    ficha = u.get("result") or {}
    avisos = onboarding.Avisos()
    directos = [onboarding.persona(x, avisos) for x in (ficha.get("directOwnership") or [])]
    indirectos = [onboarding.persona(x, avisos) for x in (ficha.get("indirectShareholders") or [])]
    return directos, indirectos, avisos.items


def _dato(v: Any) -> str:
    """El valor de un campo, o vacío si es uno de los literales de «no está»."""
    return str(v or "").strip() if _hay_dato(v) else ""


#: Los literales que los 18 campos usan para decir «no está». No son un valor.
SIN_DATO = ("", "no especificado", "sin documento", "sin porcentaje")


def _hay_dato(v: Any) -> bool:
    return str(v or "").strip().lower() not in SIN_DATO


def _clave_pedida(d: dict) -> str:
    """La clave S3 de un documento pedido, venga por `s3Uri` o por `objectKey`."""
    partes = ingesta_s3.parsear_s3_uri(d.get("s3Uri", ""))
    return partes[1] if partes else str(d.get("objectKey") or "")
