# Diccionario de datos · LENS ⇄ Onboarding B2B

> **GENERADO.** No se edita a mano: sale de
> `aws/lens-api/scripts/generar_diccionario.py`, que lee el catálogo de errores,
> los campos de cada endpoint y las vistas directamente del código. Para
> regenerarlo, correr ese script; para verificar que está al día, con `--check`.

| | |
|---|---|
| **Responde a** | Especificación LENS ⇄ Onboarding B2B v1.2 (25-sep-2026), §13.3 |
| **Para qué** | Definir el acceso de lectura a la base (§14.2) y programar contra los `reason` |
| **Ejemplos** | Todos inventados. Ver la nota al final |

---

## 1. Estados de una corrida

Una corrida de análisis pasa por estos estados. `GET …/analysis/status` los
devuelve siempre con **HTTP 200**, incluido `NOT_STARTED`: nunca un `404`.

| Estado | Qué significa | ¿Hay resultado? |
|---|---|---|
| `NOT_STARTED` | Nunca se pidió un análisis para esa empresa en ese ambiente | No |
| `IN_PROGRESS` | Se aceptó el pedido y está procesando | No |
| `COMPLETED` | Terminó y leyó todo lo que se le mandó | Sí |
| `INCOMPLETE` | Terminó, pero algo quedó sin leer | Sí, parcial, con `warnings[]` |
| `FAILED` | No se pudo completar | No, con `error` |

### Transiciones

```
                   ┌──────────────┐
                   │ NOT_STARTED  │
                   └──────┬───────┘
                          │  POST …/analyses  →  202
                          ▼
                   ┌──────────────┐
                   │ IN_PROGRESS  │
                   └──┬────┬────┬─┘
                      │    │    │
        ┌─────────────┘    │    └──────────────┐
        ▼                  ▼                   ▼
  ┌───────────┐     ┌────────────┐      ┌──────────┐
  │ COMPLETED │     │ INCOMPLETE │      │  FAILED  │
  └───────────┘     └────────────┘      └──────────┘
```

**El registro ocurre ANTES de responder el `202`.** No es una preferencia de
diseño: si el `202` saliera primero, la primera consulta del front podría ver
`NOT_STARTED`, volver a mostrar la pantalla de carga y disparar un segundo
procesamiento del mismo lote.

Un estado **no vuelve atrás**. Una corrida nueva sobre la misma empresa crea un
registro nuevo; la anterior queda en el historial.

---

## 2. Estructuras de respuesta

Los tipos son los de JSON. «Obligatorio» significa que **la clave viaja
siempre**, aunque su valor sea `null`: el consumidor no tiene que defenderse de
campos ausentes.

Donde dice *derivado*, el valor no sale tal cual de un campo extraído sino de
una regla; la regla está en la columna de origen.

### 2.1 Bloque `company` — EP-5

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `legalName` | string \| null | Sí | *Razón Social*, directo | `"COMERCIAL TRIFOLIO SpA"` |
| `taxId` | string \| null | Sí | *RUT de la sociedad*, tal como figura | `"77.111.222-1"` |
| `taxIdType` | string \| null | Sí | Derivado del país declarado; el formato solo decide si el país no se sabe | `"RUT"` |
| `constitutionDate` | string \| null | Sí | *Fecha de Constitución*, convertida a `YYYY-MM-DD` | `"2019-03-12"` |
| `legalForm` | string \| null | Sí | Derivado, máximo 30 caracteres | `"Sociedad por Acciones"` |
| `activity` | string \| null | Sí | Derivado de *Objeto Social*, máximo 30 caracteres | `"Inversiones"` |

> `taxIdType` va en `null` cuando `taxId` va en `null`. Un tipo de documento para
> un documento que no existe es ruido en el camino que decide `NOT_COMPARABLE`.

### 2.2 Bloque `company` — EP-3

**No es el mismo bloque que el de EP-5.** Son los seis campos de arriba **más
`address`**, que EP-5 no define. Los dos endpoints tienen contratos distintos y
mezclarlos haría que EP-5 entregue un campo que su especificación no declara.

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `address.street` | string \| null | Sí | Derivado de *Domicilio Legal* | `"Av. Providencia 1234"` |
| `address.apt` | string \| null | Sí | Derivado; `null` si la dirección no lo trae | `"Of 302"` |
| `address.city` | string \| null | Sí | Derivado | `"Santiago"` |
| `address.state` | string \| null | Sí | Derivado | `"Región Metropolitana"` |

El domicilio viene escrito a mano en la escritura y no tiene formato. Lo único
estable es que las partes van separadas por comas y **de lo más específico a lo
más general**, así que se reparte desde el final, que es la posición confiable.
Lo que no se puede repartir **queda en `null`**: una comuna adivinada a partir de
una región es peor que una comuna vacía, porque nadie la va a revisar.

### 2.3 `legalRepresentatives[]` — EP-3 y EP-4

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `fullName` | string \| null | Sí | *Representante Legal*, **texto original sin reordenar** | `"MARTINEZ SOTO CLAUDIA ANDREA"` |
| `name` | string \| null | Sí | Partición del nombre (§7.4) | `"CLAUDIA ANDREA"` |
| `lastName` | string \| null | Sí | Partición del nombre | `"MARTINEZ SOTO"` |
| `personType` | string | Sí | `NATURAL` o `LEGAL` | `"NATURAL"` |
| `identificationType` | string \| null | Sí | Declarado, o derivado del país y del tipo de persona | `"CC"` |
| `identificationNumber` | string \| null | Sí | **Tal como figura**, no solo dígitos | `"1.020.304-5"` |
| `role` | string \| null | Sí | *Representante Legal* (cargo), hasta 60 caracteres | `"Gerente General"` |

### 2.4 `shareholders[]` — EP-3 y EP-6

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `personType` | string | Sí | `NATURAL` o `LEGAL` | `"LEGAL"` |
| `shareholderName` | string \| null | Sí | **Texto original sin reordenar** | `"INVERSIONES AURORA LIMITADA"` |
| `shareholderId` | string \| null | Sí | **Solo dígitos** | `"771112221"` |
| `countryOfOrigin` | string \| null | Sí | Uno de los 238 nombres del Anexo A, con su grafía | `"Colombia"` |
| `identificationType` | string \| null | Sí | Declarado, o derivado del país y del tipo de persona | `"NIT"` |
| `lastName` | string \| null | Sí | Partición; `null` en personas jurídicas | `null` |
| `name` | string \| null | Sí | Partición; razón social en personas jurídicas | `"INVERSIONES AURORA LIMITADA"` |
| `ownershipPercentage` | number \| null | Sí | Porcentaje declarado; **no se estima** | `60` |
| `indirectShareholders` | array | Sí | Cadena societaria; `[]` si el documento no la revela | `[]` |
| `isPEP` | boolean \| null | Sí | Solo si el documento lo declara; `false` en jurídicas | `false` |

> **`shareholderName` y `fullName` no son redundantes con `name` + `lastName`.**
> La partición **no es reversible**. Con el orden registral colombiano,
> concatenar da `"CLAUDIA ANDREA MARTINEZ SOTO"`, que no es lo que decía la
> escritura. Quien cruce contra el registro necesita el texto como está escrito.

> **Dos reglas distintas para el mismo dato.** El identificador del accionista va
> **solo con dígitos** y el de la empresa y el del representante **tal como
> figuran**. Lo pide así el contrato.

---

## 3. Errores y avisos

Tres canales, y **no son el mismo**. La diferencia que importa es si el
análisis sirve:

| Canal | Cuándo | ¿Sirve el análisis? |
|---|---|---|
| Error HTTP | La petición no se pudo atender | — |
| Fallo de corrida | Arrancó y terminó en `FAILED` | **No** |
| Aviso | Terminó, pero algo salió degradado | **Sí** |

> `GATEWAY_TIMEOUT` y `SERVICE_UNAVAILABLE` llegan por separado a propósito.
> Para Onboarding tienen la misma consecuencia —consumen intento— pero no el
> mismo diagnóstico: uno se arregla subiendo un tiempo de espera y el otro
> levantando un servicio.

### 3.1 Errores HTTP

| `reason` | HTTP | Código corporativo | Qué pasó |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | `000401` | Falta el `x-api-secret` o no coincide. |
| `BAD_REQUEST` | 400 | `000400` | El cuerpo no cumple el contrato: falta un campo obligatorio o tiene un valor inválido. |
| `NOT_FOUND` | 404 | `000404` | No hay un análisis utilizable para esa empresa y ambiente. |
| `CONFLICT` | 409 | `000409` | Ya hay una corrida en curso para ese ambiente y empresa. |
| `TOO_MANY_REQUESTS` | 429 | `000429` | Se superó la capacidad configurada de corridas simultáneas. |
| `SERVICE_UNAVAILABLE` | 503 | `000503` | LENS no puede atender en este momento. Se puede reintentar. |
| `GATEWAY_TIMEOUT` | 504 | `000504` | Se agotó el tiempo esperando a un servicio del que LENS depende. |
| `INVALID_DOCUMENT_TYPE` | 400 | `000619` | El `documentType` declarado no es uno de los admitidos. |
| `FILE_EXTENSION_NOT_SUPPORTED` | 400 | `032401` | La extensión del archivo no es una de las que LENS puede leer. |
| `FILE_SIZE_NOT_IN_RANGE` | 400 | `032402` | El archivo excede el tamaño admitido, o está vacío. |

### 3.2 Fallos de corrida

| `reason` | Código corporativo | Qué pasó |
|---|---|---|
| `DOCUMENT_TYPE_NOT_MATCH` | `000612` | El documento no es del tipo declarado: se dijo escritura y llegó otra cosa. |
| `LENS_DOCUMENT_DOWNLOAD_FAILED` | **pendiente de alta** | No se pudo descargar el documento desde S3: permiso, red o la clave no existe. |
| `LENS_DOCUMENT_NOT_READABLE` | **pendiente de alta** | El documento se descargó pero no se pudo leer: archivo corrupto, cifrado, o un escaneo sin texto recuperable. |
| `LENS_EXTRACTION_FAILED` | **pendiente de alta** | El documento se leyó pero la extracción no produjo un resultado utilizable. |
| `LENS_REQUIRED_DATA_MISSING` | **pendiente de alta** | Faltan datos sin los cuales el análisis no sirve: la razón social o el RUT de la sociedad. |

> Los marcados como pendientes (4) están solicitados a
> Arquitectura y todavía no tienen código asignado. Son propios de LENS: ningún
> otro servicio del catálogo lee escrituras.

### 3.3 Avisos

Catálogo propio de LENS. Viajan en `warnings[]` con `reason`, `objectKey` y `message`.

| `reason` | Qué pasó |
|---|---|
| `PARTIALLY_ILLEGIBLE` | Parte del documento no se pudo leer; lo que sigue salió del resto. |
| `OCR_PAGE_LIMIT_REACHED` | El documento excede el límite de páginas que LENS procesa; se leyeron las primeras. |
| `PERSON_TYPE_UNDETERMINED` | No se pudo determinar si una entidad es persona natural o jurídica; se omitió. |
| `EXPECTED_DATA_MISSING` | Un dato que el documento debería traer no aparece. |
| `COUNTRY_NOT_IN_CATALOG` | El país existe en el documento pero no coincide con el Anexo A; se envía vacío. |
| `DATE_FORMAT_UNPARSEABLE` | La fecha existe pero no se pudo interpretar con certeza; se envía vacía. |
| `VALUE_TRUNCATED` | El valor estaba completo y se recortó al máximo que admite el contrato. |
| `TAX_ID_COUNTRY_MISMATCH` | El identificador tributario tiene forma de otro país que el declarado; se usó el del país declarado y queda dicho por si el país vino mal. |
| `NAME_SPLIT_INFERRED` | El nombre vino sin partir y se separó por cantidad de palabras: es una conjetura, y el orden de apellidos no se puede deducir sin el documento. |

---

## 4. Modelo de datos

El schema `lens` guarda cada corrida. Las **vistas en inglés** son la forma
recomendada de consultarlo: las tablas están en español y son la fuente de
verdad, pero renombrarlas rompería la app y el logger, así que las vistas
exponen los nombres que tech pidió sin mover nada.


### `lens.analysis`

Sobre `lens.analisis`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `analysis_id` | `VARCHAR(64)` | `analisis_id` | ULID generado en el origen |
| `source` | `VARCHAR(20)` | `origen` | analizador \| batch \| api \| kyb |
| `actor_type` | `VARCHAR(10)` | `actor_tipo` | persona \| sistema |
| `actor_id` | `VARCHAR(128)` | `actor_id` | uid del analista, o el consumidor |
| `actor_email` | `VARCHAR(320)` | `actor_email` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` | UTC |
| `file_count` | `SMALLINT` | `n_archivos` |  |
| `files` | `SUPER` | `archivos` | ["escritura.pdf","anexo.pdf"] |
| `consolidated` | `BOOLEAN` | `consolidado` |  |
| `purpose` | `VARCHAR(32)` | `proposito` |  |
| `status` | `VARCHAR(24)` | `estado` | COMPLETO \| PARCIAL \| ERROR |
| `detected_country` | `VARCHAR(32)` | `pais_detectado` |  |
| `company_tax_id` | `VARCHAR(16)` | `rut_sociedad` | normalizado: … |
| `company_name` | `VARCHAR(512)` | `razon_social` |  |
| `total_pages` | `INTEGER` | `paginas_totales` |  |
| `pages_from_text_layer` | `INTEGER` | `paginas_por_capa` |  |
| `pages_from_ocr` | `INTEGER` | `paginas_por_ocr` |  |
| `characters` | `BIGINT` | `caracteres` |  |
| `model` | `VARCHAR(64)` | `modelo` |  |
| `prompt_tokens` | `BIGINT` | `tokens_prompt` |  |
| `output_tokens` | `BIGINT` | `tokens_salida` |  |
| `duration_ms` | `BIGINT` | `duracion_ms` |  |
| `error` | `VARCHAR(2000)` | `error` |  |
| `warnings` | `SUPER` | `avisos` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |
| `company_id` | `VARCHAR(64)` | `company_id` |  |
| `address_country` | `VARCHAR(64)` | `domicilio_pais` |  |
| `address_region` | `VARCHAR(128)` | `domicilio_region` |  |
| `address_city` | `VARCHAR(128)` | `domicilio_ciudad` |  |
| `address_street` | `VARCHAR(256)` | `domicilio_calle` |  |
| `address_number` | `VARCHAR(32)` | `domicilio_numero` |  |
| `address_complement` | `VARCHAR(128)` | `domicilio_complemento` |  |
| `address_postal_code` | `VARCHAR(32)` | `domicilio_cp` |  |
| `address_raw` | `VARCHAR(512)` | `domicilio_raw` |  |
| `notary_registry` | `VARCHAR(256)` | `notaria_registro` |  |
| `incorporation_date` | `DATE` | `fecha_constitucion_iso` |  |
| `flag_joint_management` | `BOOLEAN` | `flag_administracion_conjunta` |  |
| `flag_amount_limits` | `BOOLEAN` | `flag_limites_monto` |  |
| `flag_18a` | `BOOLEAN` | `flag_18a` |  |

### `lens.analysis_field`

Sobre `lens.analisis_campo`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `field_id` | `VARCHAR(256)` | `campo_id` | analisis_id\|campo |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `field` | `VARCHAR(128)` | `campo` | "RUT de la sociedad" |
| `position` | `SMALLINT` | `orden` | posición en el catálogo |
| `value` | `VARCHAR(65535)` | `valor` |  |
| `is_empty` | `BOOLEAN` | `vacio` | "No especificado" o vacío |
| `source` | `VARCHAR(20)` | `origen` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `corrected_value` | `VARCHAR(65535)` | `valor_corregido` |  |
| `corrected_by` | `VARCHAR(320)` | `corregido_por` |  |
| `corrected_at` | `TIMESTAMP` | `corregido_en` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.analysis_record`

Sobre `lens.analisis_ficha`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `source` | `VARCHAR(20)` | `origen` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `record` | `SUPER` | `ficha` | el JSON completo |
| `documents_hash` | `VARCHAR(64)` | `hash_documentos` | sha256 de los archivos fuente |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.analysis_text`

Sobre `lens.analisis_texto`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `text_id` | `VARCHAR(320)` | `texto_id` | analisis_id\|tipo\|orden |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `type` | `VARCHAR(24)` | `tipo` | documento \| respuesta_modelo |
| `position` | `SMALLINT` | `orden` | 0-based |
| `parts` | `SMALLINT` | `partes` | cuántos trozos tiene ese tipo |
| `text` | `VARCHAR(65535)` | `texto` |  |
| `characters` | `INTEGER` | `caracteres` | de ESTE trozo |
| `sha256` | `VARCHAR(64)` | `sha256` | del texto COMPLETO |
| `source` | `VARCHAR(20)` | `origen` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.analysis_person`

Sobre `lens.analisis_persona`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `person_uid` | `VARCHAR(320)` | `persona_uid` | analisis_id\|rol\|ruta |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `role` | `VARCHAR(24)` | `rol` | representante \| accionista \| accionista_directo \| accionista_indirecto |
| `parent_person_uid` | `VARCHAR(320)` | `persona_padre_uid` | NULL en la raíz · el uid de la jurídica en los anidados |
| `level` | `SMALLINT` | `nivel` | 0 raíz · 1 detrás de una jurídica |
| `position` | `SMALLINT` | `orden` | posición en la lista original |
| `person_type` | `VARCHAR(16)` | `person_type` | NATURAL \| JURIDICA · NULL en el backfill |
| `full_name` | `VARCHAR(512)` | `nombre_completo` | shareholderName |
| `first_name` | `VARCHAR(256)` | `nombre` | name |
| `last_name` | `VARCHAR(256)` | `apellido` | lastName |
| `identification` | `VARCHAR(128)` | `documento` | shareholderId, con su formato original |
| `identification_canonical` | `VARCHAR(128)` | `documento_canon` | sin puntos ni guiones, mayúscula: clave de cruce |
| `identification_type` | `VARCHAR(32)` | `tipo_documento` | identificationType |
| `country_of_origin` | `VARCHAR(64)` | `pais_origen` | countryOfOrigin |
| `ownership_percentage` | `DECIMAL(9,4)` | `participacion_pct` | ownershipPercentage |
| `is_pep` | `BOOLEAN` | `es_pep` | isPEP · tres estados: true / false / NULL |
| `position_title` | `VARCHAR(256)` | `cargo` | solo representante |
| `raw_value` | `VARCHAR(512)` | `dato_crudo` | el tercer campo tal cual vino, para poder auditar |
| `source` | `VARCHAR(20)` | `origen` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.analysis_activity`

Sobre `lens.analisis_actividad`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `activity_uid` | `VARCHAR(320)` | `actividad_uid` | analisis_id\|orden |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `position` | `SMALLINT` | `orden` |  |
| `code` | `VARCHAR(32)` | `codigo` |  |
| `description` | `VARCHAR(512)` | `descripcion` |  |
| `source` | `VARCHAR(20)` | `origen` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.batch_document`

Sobre `lens.batch_documento`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `document_uid` | `VARCHAR(256)` | `documento_uid` | analisis_id\|documento_id |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `document_id` | `VARCHAR(128)` | `documento_id` |  |
| `file_name` | `VARCHAR(512)` | `nombre_archivo` |  |
| `origin` | `VARCHAR(20)` | `fuente` | local_folder \| empresa_docs |
| `slot` | `VARCHAR(128)` | `slot` | el slot de EmpresaDocs |
| `document_status` | `VARCHAR(32)` | `estado_documento` |  |
| `ok` | `BOOLEAN` | `ok` |  |
| `method` | `VARCHAR(20)` | `metodo` | capa_texto \| ocr |
| `total_pages` | `INTEGER` | `paginas_totales` |  |
| `pages_read` | `INTEGER` | `paginas_leidas` |  |
| `pages_from_ocr` | `INTEGER` | `paginas_por_ocr` |  |
| `characters` | `BIGINT` | `caracteres` |  |
| `error` | `VARCHAR(2000)` | `error` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.api_request`

Sobre `lens.api_solicitud`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `request_id` | `VARCHAR(64)` | `solicitud_id` | ULID por llamada |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` | NULL si no analizó |
| `consumer` | `VARCHAR(128)` | `consumidor` | qué sistema llamó |
| `received_at` | `TIMESTAMP` | `recibido_en` |  |
| `path` | `VARCHAR(128)` | `ruta` |  |
| `method` | `VARCHAR(10)` | `metodo` |  |
| `http_status` | `SMALLINT` | `http_status` |  |
| `document_count` | `SMALLINT` | `n_documentos` |  |
| `input_bytes` | `BIGINT` | `bytes_entrada` |  |
| `include_raw_text` | `BOOLEAN` | `incluir_texto` |  |
| `forced_country` | `VARCHAR(32)` | `pais_forzado` |  |
| `status` | `VARCHAR(24)` | `estado` |  |
| `error` | `VARCHAR(2000)` | `error` |  |
| `duration_ms` | `BIGINT` | `duracion_ms` |  |
| `source_ip` | `VARCHAR(64)` | `ip_origen` |  |
| `loaded_at` | `TIMESTAMP` | `cargado_en` |  |

### `lens.analysis_pivot`

> **Es una vista materializada.** No refleja una corrida nueva hasta que
> alguien corre `REFRESH MATERIALIZED VIEW lens.analisis_pivote`. Para leer
> el dato más reciente, `lens.analysis_field`, que es la fuente de verdad.

Sobre `lens.analisis_pivote`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `source` | `VARCHAR(20)` | `origen` |  |
| `executed_at` | `TIMESTAMP` | `ejecutado_en` |  |
| `company_tax_id` | `VARCHAR(65535)` | `rut_de_la_sociedad` | uno de los 18 campos del catálogo, como columna |
| `company_name` | `VARCHAR(65535)` | `razon_social` | uno de los 18 campos del catálogo, como columna |
| `incorporation_date` | `VARCHAR(65535)` | `fecha_de_constitucion` | uno de los 18 campos del catálogo, como columna |
| `business_purpose` | `VARCHAR(65535)` | `objeto_social` | uno de los 18 campos del catálogo, como columna |
| `share_capital` | `VARCHAR(65535)` | `capital_social` | uno de los 18 campos del catálogo, como columna |
| `shares` | `VARCHAR(65535)` | `acciones` | uno de los 18 campos del catálogo, como columna |
| `shareholders_and_contributions` | `VARCHAR(65535)` | `accionistas_y_aportes` | uno de los 18 campos del catálogo, como columna |
| `legal_representative` | `VARCHAR(65535)` | `representante_legal` | uno de los 18 campos del catálogo, como columna |
| `duration` | `VARCHAR(65535)` | `duracion` | uno de los 18 campos del catálogo, como columna |
| `legal_address` | `VARCHAR(65535)` | `domicilio_legal` | uno de los 18 campos del catálogo, como columna |
| `powers` | `VARCHAR(65535)` | `facultades` | uno de los 18 campos del catálogo, como columna |
| `shareholder_meetings` | `VARCHAR(65535)` | `juntas_de_accionistas` | uno de los 18 campos del catálogo, como columna |
| `dispute_resolution` | `VARCHAR(65535)` | `resolucion_de_conflictos` | uno de los 18 campos del catálogo, como columna |
| `profit_distribution` | `VARCHAR(65535)` | `distribucion_de_utilidades` | uno de los 18 campos del catálogo, como columna |
| `communication_channel` | `VARCHAR(65535)` | `medio_de_comunicacion` | uno de los 18 campos del catálogo, como columna |
| `for_profit` | `VARCHAR(65535)` | `empresa_con_fines_de_lucro` | uno de los 18 campos del catálogo, como columna |
| `contains_amendments` | `VARCHAR(65535)` | `documento_contains_modificaciones` | uno de los 18 campos del catálogo, como columna |
| `specific_powers_analysis` | `VARCHAR(65535)` | `analisis_de_facultades_especificas` | uno de los 18 campos del catálogo, como columna |

### `lens.analysis_review`

Sobre `lens.analisis_revision`.

| Columna | Tipo | Columna original | Descripción |
|---|---|---|---|
| `review_uid` | `VARCHAR(128)` | `revision_uid` | analisis_id\|motivo |
| `analysis_id` | `VARCHAR(64)` | `analisis_id` |  |
| `reason` | `VARCHAR(64)` | `motivo` | accionistas_faltantes \| documento_discrepante \| documento_faltante |
| `severity` | `VARCHAR(16)` | `severidad` | alta \| media \| baja |
| `details` | `VARCHAR(2000)` | `detalle` | qué se vio, con las dos lecturas |
| `detected_at` | `TIMESTAMP` | `detectado_en` |  |
| `detected_by` | `VARCHAR(128)` | `detectado_por` |  |
| `resolved` | `BOOLEAN` | `resuelto` |  |

## 5. Sobre el acceso a la base

El schema `lens` **arranca sin `GRANT` para nadie** salvo su dueño, y es
deliberado: guarda RUT, socios, participaciones, domicilios y verificación de
identidad del representante legal.

Las vistas viven en el **mismo schema** que las tablas, así que un solo `GRANT`
cubre las dos formas. Otorgarlo es una decisión, no un trámite: conviene que sea
sobre las vistas y no sobre las tablas, y acotado a lo que Onboarding consulta.

## 6. Sobre los ejemplos de este documento

**Todos inventados.** Los RUT tienen el dígito verificador deliberadamente mal,
para que no puedan coincidir con una sociedad real.

No es formalismo: un ejemplo copiado de una corrida revelaría que una empresa
concreta pasó por el sistema de compliance. El RUT y la razón social de una
sociedad chilena son públicos; **que haya sido analizada, no**.
