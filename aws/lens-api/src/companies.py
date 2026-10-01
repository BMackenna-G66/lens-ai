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
#: especificación. La v1.1 la fija en `1.0.0` en los seis endpoints; decir `1.2`
#: —que es la versión del documento— le haría creer al consumidor que el formato
#: cambió cuando no cambió.
SCHEMA_VERSION = os.environ.get("SCHEMA_VERSION", "1.0.0")

#: Tope de documentos por petición. La v1.2 bajó el lote a 2; es su propio tope
#: y no el de `/v1/analisis` (12), que sigue como estaba.
MAX_DOCUMENTOS_LOTE = int(os.environ.get("MAX_DOCUMENTOS_LOTE", "2"))

#: Los `documentType` que cuentan como documento PRINCIPAL, separados por coma.
#:
#: El vocabulario SÍ está especificado —§5.2 lo fija en tres— y el principal es
#: la escritura:
#:
#:     company_deeds_document         escritura, siempre        ← PRINCIPAL
#:     company_shareholders_document  composición, Colombia     complementario
#:     company_id_document            identidad fiscal, Chile   complementario
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
        salida.append({
            "s3Uri": uri,
            "objectKey": clave,
            "fileName": str(d.get("fileName") or d.get("file_name") or ""),
            "documentType": str(d.get("documentType") or d.get("document_type") or ""),
        })
    return salida, None


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

_ALIAS_PAIS = {"co": "colombia", "cl": "chile", "pe": "peru", "mx": "mexico", "ar": "argentina"}


def _pais(v: Any) -> str:
    p = onboarding._sin_tildes(str(v or ""))
    return _ALIAS_PAIS.get(p, p)


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
            leer_identidad: Callable | None = None) -> dict | None:
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

    pais = str(cuerpo.get("country") or "").strip()
    if not pais:
        # §6.5 lo declara obligatorio, y acá además decide qué documento es el
        # principal: sin país, un lote colombiano no tiene escritura.
        return _error("BAD_REQUEST", "`country` es obligatorio.")

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

    # ── Una corrida por empresa a la vez ───────────────────────────────────
    try:
        viva = corridas.en_curso(ambiente, company_id)
    except Exception as e:  # noqa: BLE001
        # No se puede saber si hay una corrida viva. Arrancar otra podría
        # duplicar el trabajo y el gasto, así que se pide reintentar.
        log.warning("no se pudo consultar el estado de %s/%s: %s", ambiente, company_id, e)
        return _error("SERVICE_UNAVAILABLE", "No se pudo consultar el estado de la empresa.")

    if viva is not None:
        return _error(
            "CONFLICT",
            "Ya hay una corrida en curso para esa empresa y ambiente.",
            analysisId=viva.get("analysisId"),
            startedAt=viva.get("startedAt"),
        )

    # ── El registro va ANTES del 202 ───────────────────────────────────────
    analysis_id = str(cuerpo.get("analysisId") or cuerpo.get("analysis_id") or "").strip() or str(uuid.uuid4())
    reg = corridas.registrar_inicio(
        ambiente, company_id, analysis_id,
        country=pais,
        documentos=documentos,
        schema_version=SCHEMA_VERSION,
    )

    carga = {
        "ambiente": ambiente,
        "companyId": company_id,
        "analysisId": analysis_id,
        "country": pais,
        "documents": documentos,
    }
    # El modo del disparo NO viaja en la respuesta: el contrato de EP-1 son cinco
    # campos y uno de más se vuelve contrato de hecho en cuanto alguien lo use.
    # Es información de operación y vive donde corresponde, en `/salud`.
    disparador.disparar(carga, lambda c: procesar(
        c, analizar=analizar, extraer_socios=extraer_socios,
        extraer_administracion=extraer_administracion, leer_identidad=leer_identidad))

    return _resp(202, {
        # Como número, igual que EP-2 a EP-6: §6.2 lo declara numérico, y
        # ms-company es Java — un texto y un número se deserializan distinto.
        "companyId": identificador(company_id),
        "analysisId": analysis_id,
        "status": corridas.IN_PROGRESS,
        "startedAt": reg["startedAt"],
        "schemaVersion": SCHEMA_VERSION,
    })


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
        "schemaVersion": u.get("schemaVersion") or SCHEMA_VERSION,
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
             leer_identidad: Callable | None = None) -> dict:
    """Resuelve los documentos, analiza y cierra la corrida.

    Nunca levanta: lo que sale mal termina la corrida en `FAILED` con su motivo.
    Una excepción que escapara dejaría la corrida colgada en `IN_PROGRESS` hasta
    que la libere el tope de caducidad, y el consumidor esperando.

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
                r = leer_identidad(bajados[claves[i]], t0)
            except Exception as e:  # noqa: BLE001
                log.warning("no se pudo verificar el tipo de %s: %s", claves[i], e)
                r = None
            if r is None:
                avisos.append(errores.aviso(
                    "EXPECTED_DATA_MISSING",
                    "No se pudo verificar el tipo de documento ni resumir su actividad.",
                    object_key=claves[i]))
                continue
            identidad[i] = r
            if r.get("esConstitutivo") == "NO":
                declarado = pedidos[i].get("documentType") or "documento principal"
                visto = r.get("tipoDetectado") or "otro tipo de documento"
                etapa[i], detalle[i] = "tipo", f"se declaró {declarado} y el documento es {visto}"
        if not principales_vivos():
            return fallar_por_principal()

    # ── 5 · Leer y extraer los 18 campos ───────────────────────────────────
    # Se leen todos los que llegaron vivos, complementarios incluidos: la
    # identidad fiscal es fuente del RUT y la razón social cuando la escritura
    # no los trae. Lo que NO entra es un principal que resultó ser otra cosa —es
    # lo que metía «USUARIO CEDULA» como cargo de un representante—.
    a_leer = [bajados[claves[i]] for i in range(len(pedidos)) if etapa[i] is None]
    try:
        resultado = analizar([(d.nombre, d.contenido) for d in a_leer], False, str(pais or ""))
    except Exception as e:  # noqa: BLE001
        log.exception("fallo el análisis de la corrida %s", analysis_id)
        return fallar("LENS_EXTRACTION_FAILED", f"Error durante el análisis: {e}")

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
        razon = "OCR_PAGE_LIMIT_REACHED" if "tope de OCR" in a else "PARTIALLY_ILLEGIBLE"
        avisos.append(errores.aviso(razon, a, object_key=clave))

    # ── 6 · Personas y administración, sobre los PDF nativos ───────────────
    # Nunca lanzan: si fallan, la ficha de 18 campos ya está lista y perderla
    # por esto sería peor que devolverla sin personas.
    vivos = [bajados[claves[i]] for i in range(len(pedidos)) if etapa[i] is None]
    personas, avisos_personas = ({}, [])
    if extraer_socios is not None:
        try:
            personas, avisos_personas = extraer_socios(vivos, t0)
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo extraer la composición societaria de %s: %s", analysis_id, e)
            avisos_personas = [f"No se pudo extraer la composición societaria ({e})."]
    avisos += [errores.aviso("EXPECTED_DATA_MISSING", a) for a in avisos_personas]

    # El régimen de administración (§11). Si no queda presupuesto, `None` y
    # aviso: nunca se adivina, porque decide cuántas aprobaciones necesita una
    # empresa para operar.
    administracion = None
    if extraer_administracion is not None:
        try:
            administracion = extraer_administracion(vivos, t0)
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo leer el régimen de administración de %s: %s", analysis_id, e)
            avisos.append(errores.aviso(
                "EXPECTED_DATA_MISSING",
                f"No se pudo determinar el régimen de administración ({e})."))

    # ── 7 · Los documentos que se perdieron en el camino ───────────────────
    for i, e in enumerate(etapa):
        if e is None:
            continue
        razon, texto = AVISO_POR_ETAPA[e]
        nombre = pedidos[i].get("fileName") or claves[i].rsplit("/", 1)[-1]
        avisos.append(errores.aviso(razon, f"{texto} «{nombre}»: {detalle[i]}.", object_key=claves[i]))

    # ── 8 · Cerrar: el estado sale de §8.1 y §10, no de si se perdió algo ──
    ident = next((identidad[i] for i in principales_vivos() if i in identidad), {})
    ficha = _ficha(resultado, pedidos, claves, etapa, personas, administracion, ident)
    cuerpo, avisos_forma = _serializar(company_id, {"result": ficha, "country": pais})
    avisos += avisos_forma

    faltan_requeridos, faltan_esperados = evaluar(cuerpo, pais)
    if faltan_requeridos:
        return fallar("LENS_REQUIRED_DATA_MISSING",
                      "Faltan datos requeridos: " + "; ".join(faltan_requeridos) + ".")

    ya_avisados = {a.get("campo") for a in avisos_forma if a.get("campo")}
    for campo, mensaje in faltan_esperados:
        if campo not in ya_avisados:
            avisos.append(errores.aviso("EXPECTED_DATA_MISSING", mensaje))

    # §8.1: COMPLETED es «están todos los datos requeridos y esperados y no hay
    # avisos». Antes se miraba solo si se había perdido un documento, y las seis
    # empresas del lote de prueba salieron COMPLETED con avisos: Onboarding no le
    # mostraba al usuario lo que faltaba.
    estado = corridas.INCOMPLETE if normalizar_avisos(avisos) else corridas.COMPLETED
    return cerrar(estado, resultado=ficha)


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
        "address": _dato(campos.get("Domicilio Legal")),
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
        # reglas se leyó el documento.
        "country": u.get("country") or ficha.get("detectedCountry") or "",
        "schemaVersion": u.get("schemaVersion") or SCHEMA_VERSION,
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
    """Cada aviso con EXACTAMENTE las tres claves del contrato, sin repetidos.

    §6.6: `warnings[]` lleva `reason`, `objectKey` y `message`. Los avisos que
    nacen al darle forma a los datos traían claves de más —`campo`, `original`—,
    y alguno el objeto social entero; y los de la serialización no traían
    `objectKey`. Un aviso sin `objectKey` obliga a quien integra a adivinar de
    qué documento habla.
    """
    fuera: list[dict] = []
    vistos: set[tuple] = set()
    for a in avisos or []:
        limpio = {
            "reason": str(a.get("reason") or "EXPECTED_DATA_MISSING"),
            "objectKey": str(a.get("objectKey") or ""),
            "message": str(a.get("message") or ""),
        }
        firma = (limpio["reason"], limpio["objectKey"], limpio["message"])
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

    **Esperados**: documento y cargo de los representantes, RUT de la sociedad,
    forma legal, fecha de constitución y domicilio. En Colombia, el NIT con su
    dígito verificador. En el resto de los orígenes el identificador tributario
    puede no existir, así que ahí no cuenta.
    """
    empresa = cuerpo.get("company") or {}
    reps = cuerpo.get("legalRepresentatives") or []
    p = _pais(pais)

    requeridos: list[str] = []
    if not empresa.get("legalName"):
        requeridos.append("la razón social")
    if not any((r.get("fullName") or r.get("name")) and r.get("personType") for r in reps):
        requeridos.append("al menos un representante con nombre y tipo de persona")

    esperados: list[tuple[str, str]] = []
    if p in ("chile", "colombia"):
        if not empresa.get("taxId"):
            esperados.append(("taxId", "El documento no trae el identificador tributario de la sociedad."))
        elif p == "colombia" and not _nit_con_dv(empresa.get("taxId")):
            esperados.append(("taxId", "El NIT de la sociedad viene sin dígito verificador."))
    if not empresa.get("legalForm"):
        esperados.append(("legalForm", "No se pudo determinar la forma legal de la sociedad."))
    if not empresa.get("constitutionDate"):
        esperados.append(("constitutionDate", "El documento no trae la fecha de constitución."))
    domicilio = empresa.get("address") or {}
    if not (domicilio.get("street") or domicilio.get("city")):
        esperados.append(("address", "El documento no declara un domicilio legal."))

    def nombres(faltan: list[dict]) -> str:
        return ", ".join(str(r.get("fullName") or r.get("name") or "?") for r in faltan)

    sin_documento = [r for r in reps if not r.get("identificationNumber")]
    if sin_documento:
        esperados.append(("identificationNumber",
                          f"Falta el documento de identidad de: {nombres(sin_documento)}."))
    sin_cargo = [r for r in reps if not r.get("role")]
    if sin_cargo:
        esperados.append(("role", f"Falta el cargo de: {nombres(sin_cargo)}."))

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
    avisos = onboarding.Avisos()
    empresa = onboarding.empresa({
        "legalName": _dato(campos.get("Razón Social")),
        "taxId": _dato(campos.get("RUT de la sociedad")),
    }, avisos)

    def serie(personas: list) -> list:
        return [p for p in (onboarding.persona(x, avisos) for x in (personas or [])) if p]

    return {
        "businessName": empresa["legalName"],
        "businessId": empresa["taxId"],
        "directOwnership": serie(ficha.get("directOwnership")),
        "indirectShareholders": serie(ficha.get("indirectShareholders")),
    }


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
