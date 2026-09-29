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


def es_principal(documento: dict) -> bool:
    """¿Este documento es la escritura, o un complementario?

    Sin vocabulario configurado, todos son principales. Ver `TIPOS_PRINCIPALES`.
    """
    if not TIPOS_PRINCIPALES:
        return True
    return str(documento.get("documentType") or "").strip().upper() in TIPOS_PRINCIPALES


# ── EP-1 ────────────────────────────────────────────────────────────────────

def manejar(evento: dict, ruta: str, metodo: str, *, analizar: Callable,
            extraer_socios: Callable | None = None,
            extraer_administracion: Callable | None = None) -> dict | None:
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
        country=str(cuerpo.get("country") or ""),
        documentos=documentos,
        schema_version=SCHEMA_VERSION,
    )

    carga = {
        "ambiente": ambiente,
        "companyId": company_id,
        "analysisId": analysis_id,
        "country": str(cuerpo.get("country") or ""),
        "documents": documentos,
    }
    # El modo del disparo NO viaja en la respuesta: el contrato de EP-1 son cinco
    # campos y uno de más se vuelve contrato de hecho en cuanto alguien lo use.
    # Es información de operación y vive donde corresponde, en `/salud`.
    disparador.disparar(carga, lambda c: procesar(
        c, analizar=analizar, extraer_socios=extraer_socios,
        extraer_administracion=extraer_administracion))

    return _resp(202, {
        "companyId": company_id,
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
        "warnings": u.get("warnings") or [],
        "schemaVersion": u.get("schemaVersion") or SCHEMA_VERSION,
    }


# ── El trabajo de fondo ─────────────────────────────────────────────────────

def procesar(carga: dict, *, analizar: Callable, extraer_socios: Callable | None = None,
             extraer_administracion: Callable | None = None) -> dict:
    """Resuelve los documentos, analiza y cierra la corrida.

    Nunca levanta: lo que sale mal termina la corrida en `FAILED` con su motivo.
    Una excepción que escapara dejaría la corrida colgada en `IN_PROGRESS` hasta
    que la libere el tope de caducidad, y el consumidor esperando.
    """
    ambiente = carga.get("ambiente", "")
    company_id = carga.get("companyId", "")
    analysis_id = carga.get("analysisId", "")
    pedidos = carga.get("documents") or []
    t0 = time.monotonic()

    def cerrar(estado: str, avisos: list[dict] | None = None, error: dict | None = None,
               resultado: dict | None = None) -> dict:
        corridas.cerrar(ambiente, company_id, analysis_id, estado,
                        avisos=avisos, error=error, resultado=resultado)
        return {"status": estado, "analysisId": analysis_id}

    try:
        import boto3
        s3 = boto3.client("s3")
    except Exception as e:  # noqa: BLE001
        return cerrar(corridas.FAILED, error=errores.fallo(
            "LENS_DOCUMENT_DOWNLOAD_FAILED", f"No se pudo crear el cliente de S3: {e}"))

    objetos, avisos_resolucion = ingesta_s3.resolver_documentos(
        s3, [ingesta_s3.DocumentoPedido(
            s3_uri=d.get("s3Uri", ""), clave=d.get("objectKey", ""),
            nombre_archivo=d.get("fileName", ""), tipo=d.get("documentType", ""),
        ) for d in pedidos],
    )

    avisos = [
        errores.aviso("PARTIALLY_ILLEGIBLE", a, object_key=_clave_de(a, pedidos))
        for a in avisos_resolucion
    ]

    # El filtro por nombre NO se aplica: el llamador nombró los documentos uno
    # por uno y declaró su tipo, así que exigir además un prefijo descartaría
    # `escritura_constitucion.pdf` entero — y con un aviso, no con un error.
    aceptados, avisos_filtro = ingesta_s3.filtrar(objetos, exigir_prefijo=False)
    avisos += [errores.aviso("PARTIALLY_ILLEGIBLE", a) for a in avisos_filtro]

    if not aceptados:
        return cerrar(corridas.FAILED, avisos=avisos, error=errores.fallo(
            "LENS_DOCUMENT_NOT_READABLE",
            "Ninguno de los documentos pudo usarse.",
        ))

    try:
        # El bucket por defecto solo se usa para los documentos que vinieron con
        # `objectKey` suelto: los que traen `s3Uri` llevan el suyo.
        descargados, avisos_descarga = ingesta_s3.descargar(s3, ingesta_s3.BUCKET, aceptados)
    except Exception as e:  # noqa: BLE001
        return cerrar(corridas.FAILED, avisos=avisos, error=errores.fallo(
            "LENS_DOCUMENT_DOWNLOAD_FAILED", f"Falló la descarga: {e}"))

    avisos += [errores.aviso("PARTIALLY_ILLEGIBLE", a) for a in avisos_descarga]

    # ── Qué documento se perdió, y si importaba ────────────────────────────
    # El chequeo va ACÁ y una sola vez, contra lo que de verdad se bajó. Un
    # documento se puede caer en tres lugares —al resolverlo, al filtrarlo o al
    # descargarlo— y mirar solo el primero dejaba pasar el caso peor: la
    # escritura falla al bajar, el complementario baja bien, y la corrida
    # terminaba analizando el anexo sola.
    leidas = {d.clave for d in descargados}
    perdidos = [d for d in pedidos if _clave_pedida(d) not in leidas]

    if any(es_principal(d) for d in perdidos):
        return cerrar(corridas.FAILED, avisos=avisos, error=errores.fallo(
            "LENS_DOCUMENT_DOWNLOAD_FAILED",
            "No se pudo obtener el documento principal.",
        ))

    if not descargados:
        return cerrar(corridas.FAILED, avisos=avisos, error=errores.fallo(
            "LENS_DOCUMENT_DOWNLOAD_FAILED", "No se pudo descargar ningún documento."))

    try:
        resultado = analizar(
            [(d.nombre, d.contenido) for d in descargados],
            False,
            str(carga.get("country") or ""),
        )
    except Exception as e:  # noqa: BLE001
        log.exception("fallo el análisis de la corrida %s", analysis_id)
        return cerrar(corridas.FAILED, avisos=avisos, error=errores.fallo(
            "LENS_EXTRACTION_FAILED", f"Error durante el análisis: {e}"))

    campos = {c["field"]: c["value"] for c in (resultado.get("campos") or [])}
    avisos += [errores.aviso("PARTIALLY_ILLEGIBLE", a) for a in (resultado.get("avisos") or [])]

    # Sin razón social ni RUT el análisis no sirve para nada aguas abajo: es un
    # fallo, no un resultado degradado.
    if not _hay_dato(campos.get("Razón Social")) and not _hay_dato(campos.get("RUT de la sociedad")):
        return cerrar(corridas.FAILED, avisos=avisos, error=errores.fallo(
            "LENS_REQUIRED_DATA_MISSING",
            "No se pudo obtener ni la razón social ni el RUT de la sociedad.",
        ))

    # Los representantes legales salen de una SEGUNDA extracción, sobre los PDF
    # nativos: las tablas de propiedad se leen mucho mejor con el documento a la
    # vista que con su texto. Nunca lanza — si falla, la ficha de 18 campos ya
    # está lista y perderla por esto sería peor que devolverla sin personas.
    personas, avisos_personas = ({}, [])
    if extraer_socios is not None:
        try:
            personas, avisos_personas = extraer_socios(descargados, t0)
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo extraer la composición societaria de %s: %s", analysis_id, e)
            avisos_personas = [f"No se pudo extraer la composición societaria ({e})."]
    avisos += [errores.aviso("EXPECTED_DATA_MISSING", a) for a in avisos_personas]

    # El régimen de administración, en su propia pasada (§11). Va después de la
    # societaria y con el mismo reloj: si no queda presupuesto, `None` y aviso.
    # Nunca se adivina — es el dato que decide cuántas aprobaciones necesita una
    # empresa para operar.
    administracion = None
    if extraer_administracion is not None:
        try:
            administracion = extraer_administracion(descargados, t0)
        except Exception as e:  # noqa: BLE001
            log.warning("no se pudo leer el régimen de administración de %s: %s", analysis_id, e)
            avisos.append(errores.aviso(
                "EXPECTED_DATA_MISSING",
                f"No se pudo determinar el régimen de administración ({e})."))

    ficha = _ficha(resultado, descargados, pedidos, personas, administracion)

    # Llegó hasta acá con la escritura leída. Si se perdió un complementario, el
    # resultado sirve pero está incompleto, y se dice cuál faltó.
    if perdidos:
        avisos += [
            errores.aviso(
                "EXPECTED_DATA_MISSING",
                "No se pudo leer un documento complementario.",
                object_key=d.get("objectKey") or d.get("s3Uri", ""),
            )
            for d in perdidos
        ]
        return cerrar(corridas.INCOMPLETE, avisos=avisos, resultado=ficha)

    return cerrar(corridas.COMPLETED, avisos=avisos, resultado=ficha)


def _ficha(resultado: dict, descargados: list, pedidos: list[dict],
           personas: dict | None = None, administracion: dict | None = None) -> dict:
    """Lo que se guarda de una corrida y después sirve EP-3.

    **No entra el texto de los documentos.** Son escrituras enteras y una fila
    de DynamoDB tiene un tope de 400 KB; además EP-3 no lo pide. Lo que entra es
    la ficha: los campos, los metadatos por documento y el país.

    El detalle por documento cruza lo que devolvió la extracción —que solo
    conoce el nombre del archivo— con lo que pidió el llamador, para agregarle
    `objectKey` y `documentType`. Sin ese cruce, quien integra no puede
    relacionar un documento de la respuesta con el que mandó.
    """
    por_nombre = {d.nombre: d for d in descargados}
    pedido_por_clave = {_clave_pedida(p): p for p in pedidos}

    documentos = []
    for d in resultado.get("documentos") or []:
        bajado = por_nombre.get(d.get("nombre"))
        pedido = pedido_por_clave.get(bajado.clave) if bajado else None
        documentos.append({
            "fileName": d.get("nombre"),
            "objectKey": bajado.clave if bajado else None,
            "documentType": (pedido or {}).get("documentType") or (bajado.tipo if bajado else None),
            "pagesTotal": d.get("paginas_totales"),
            "pagesRead": d.get("paginas_leidas"),
            "pagesFromOcr": d.get("paginas_por_ocr"),
            "method": d.get("metodo"),
            "ok": d.get("ok"),
        })

    p = personas or {}
    return {
        "fields": resultado.get("campos") or [],
        "documents": documentos,
        "detectedCountry": resultado.get("pais_detectado") or "",
        # Crudos, sin serializar: la forma de EP-4 la pone `resultado_de` al
        # momento de responder. Guardarlos ya serializados congelaría el formato
        # de la fecha en que se corrió el análisis, y un arreglo del contrato no
        # alcanzaría a las corridas viejas.
        "legalRepresentatives": p.get("legalRepresentatives") or [],
        "directOwnership": p.get("directOwnership") or [],
        "indirectShareholders": p.get("indirectShareholders") or [],
        # §11. Solo el booleano viaja en EP-5; el detalle queda guardado para
        # cuando Compliance defina la marca por persona.
        "administration": administracion or {},
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


def resultado_de(company_id: str, u: dict) -> dict:
    """El cuerpo de EP-3. Puro: la forma se testea sin montar un evento HTTP."""
    ficha = u.get("result") or {}
    campos = {c.get("field"): c.get("value") for c in (ficha.get("fields") or [])}
    avisos = onboarding.Avisos()

    empresa = onboarding.empresa({
        "legalName": _dato(campos.get("Razón Social")),
        "taxId": _dato(campos.get("RUT de la sociedad")),
        "country": ficha.get("detectedCountry") or u.get("country") or "",
        "constitutionDate": _dato(campos.get("Fecha de Constitución")),
        "legalForm": _forma_legal(campos),
        "activity": _dato(campos.get("Objeto Social")),
        "address": _dato(campos.get("Domicilio Legal")),
        "jointAdministration": (ficha.get("administration") or {}).get("jointAdministration"),
    }, avisos)

    representantes = [
        r for r in (
            onboarding.representante(p, avisos)
            for p in (ficha.get("legalRepresentatives") or [])
        ) if r is not None
    ]

    return {
        "companyId": identificador(u.get("companyId") or company_id),
        "analysisId": u.get("analysisId"),
        "status": u.get("status"),
        # La jurisdicción con la que se corrió. La pide el contrato de EP-3 y es
        # lo que le dice al consumidor bajo qué reglas se leyó el documento.
        "country": u.get("country") or ficha.get("detectedCountry") or "",
        "schemaVersion": u.get("schemaVersion") or SCHEMA_VERSION,
        "company": empresa,
        "legalRepresentatives": representantes,
        "fields": ficha.get("fields") or [],
        "documents": ficha.get("documents") or [],
        # Los de la corrida más los que salieron de serializar. Van juntos
        # porque para quien integra son lo mismo: algo que no salió redondo.
        "warnings": (u.get("warnings") or []) + avisos.items,
    }


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


#: Sufijos que identifican la forma legal dentro de la razón social. Se miran de
#: más largo a más corto: «S.A.» es sufijo de varias y ganaría por casualidad.
FORMAS_LEGALES = (
    ("SOCIEDAD POR ACCIONES", "Sociedad por Acciones"),
    ("SPA", "Sociedad por Acciones"),
    ("S.P.A.", "Sociedad por Acciones"),
    ("LIMITADA", "Sociedad de Responsabilidad Limitada"),
    ("LTDA", "Sociedad de Responsabilidad Limitada"),
    ("S.A.S.", "Sociedad por Acciones Simplificada"),
    ("SAS", "Sociedad por Acciones Simplificada"),
    ("E.I.R.L.", "Empresa Individual de Responsabilidad Limitada"),
    ("EIRL", "Empresa Individual de Responsabilidad Limitada"),
    ("S.A.", "Sociedad Anónima"),
    ("SA", "Sociedad Anónima"),
)


def _forma_legal(campos: dict) -> str:
    """La forma legal, derivada del sufijo de la razón social.

    Se deriva y no se extrae porque no es uno de los 18 campos, y esos no se
    tocan: están fuera de alcance por acuerdo y de ellos depende la cola KYB.

    El sufijo es la señal más confiable que hay — es parte del nombre inscrito—
    y cuando no se reconoce se devuelve vacío en vez de adivinar: una forma
    legal equivocada viaja al expediente de compliance sin que nadie la revise.
    """
    nombre = _dato(campos.get("Razón Social")).upper().replace(",", " ")
    palabras = set(nombre.replace(".", ". ").split())
    for sufijo, forma in FORMAS_LEGALES:
        if nombre.endswith(" " + sufijo) or sufijo in palabras or nombre.endswith(sufijo):
            return forma
    return ""


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


def _clave_de(aviso: str, pedidos: list[dict]) -> str:
    """La clave del documento al que se refiere un aviso de resolución.

    El aviso viene armado como `«clave»: motivo`, así que alcanza con mirar cuál
    de los documentos pedidos aparece adentro. Vale la pena: el contrato define
    `objectKey` en cada aviso, y un aviso sin él obliga a quien integra a
    adivinar a qué documento se refiere.
    """
    for d in pedidos:
        for candidato in (d.get("objectKey"), d.get("s3Uri"), d.get("fileName")):
            if candidato and candidato in aviso:
                return str(d.get("objectKey") or d.get("s3Uri") or "")
    return ""
