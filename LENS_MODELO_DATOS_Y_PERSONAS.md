# Modelo de datos `lens` + los campos de personas

Complementa `LENS_REDSHIFT_SCHEMA.md` (que es el **diseño**) con el **estado
verificado en producción** y una especificación exhaustiva de los dos campos de
personas.

Todo lo medido acá salió de consultas al cluster el **10-09-2026**.
Ubicación: `compliance-redshift-cluster` / database `dev` / schema `lens`.

---

## 1. Cómo llega el dato

```
Navegador  (DocumentAnalyzer · batch · KYB)
   │  arma las filas
   ▼
services/lensPersistenciaService.ts     filasDeAnalisis() · filasDeTexto() · filasDeBatchDocumentos()
   │  enviarLote([{ tabla: 'lens_analisis', datos: {...} }])
   ▼
services/colasLogService.ts  →  Worker  POST /colas/log     (agrega x-api-secret)
   ▼
Lambda  colas-trabajo-logger            TABLAS['lens_analisis'] → {schema:'lens', nombre:'analisis'}
   ▼
Redshift Data API  →  schema lens
```

**Dos cosas que explican rarezas del modelo:**

**El prefijo `lens_` es lógico, no físico.** La app manda la clave `lens_analisis`
y el Lambda la traduce a `lens.analisis`. Existe para que no pueda chocar con una
tabla de `colas_trabajo`, que viaja por el mismo endpoint.

**El logger borra e inserta, no hace UPDATE.** Por eso las tablas hijas usan clave
**sintética** (`analisis_id|campo`) y no compuesta: con PK compuesta, escribir un
campo habría borrado los otros 17 del mismo análisis.

### Permisos

El schema arranca **sin GRANT para nadie salvo el dueño**, a propósito: acá hay
RUT, socios, participaciones y domicilios, datos que antes morían en el navegador.
Los GRANT están al final del DDL, comentados.

> **Efecto práctico:** `information_schema.tables` devuelve **vacío** para este
> schema. Las tablas solo se ven por `pg_tables` / `pg_views`. Cualquier
> herramienta que descubra tablas por `information_schema` no va a encontrar nada.

---

## 2. Las seis tablas

| Tabla | Grano | Filas (10-09) |
|---|---|---|
| `analisis` | una ejecución | 181 |
| `analisis_campo` | un campo de una ejecución | 18 × análisis |
| `analisis_ficha` | una ejecución | 1:1 con `analisis` |
| `batch_documento` | un documento del batch | 2 |
| `analisis_texto` | un trozo de texto | **0** |
| `api_solicitud` | una llamada HTTP | **0** |

### 2.1 `lens.analisis` — cabecera

| Campo | Significado | Estado |
|---|---|---|
| `analisis_id` | ULID generado en el origen · **PK** | ✅ |
| `origen` | `analizador` · `batch` · `api` · `kyb` | ✅ |
| `actor_tipo` | `persona` \| `sistema` — la API no tiene analista detrás | ✅ |
| `actor_id`, `actor_email` | quién lo pidió, desde `AuthContext` | ✅ |
| `ejecutado_en` | UTC, reloj del navegador · **SORTKEY** | ✅ |
| `n_archivos`, `archivos` | cuántos y cuáles (`SUPER`) | ✅ |
| `consolidado` | varios documentos en un solo análisis | ✅ |
| `proposito` | para qué se analizó | ✅ |
| `estado` | `COMPLETO` \| `PARCIAL` \| `ERROR` | ✅ |
| `pais_detectado` | detectado por prompt | 180/181 |
| `rut_sociedad` | normalizado por `rutCanonico()`, sin puntos | ✅ |
| `razon_social` | del campo extraído | ✅ |
| `paginas_totales` | cuántas páginas tenía | **0/181** |
| `paginas_por_capa` | leídas de la capa de texto | **0/181** |
| `paginas_por_ocr` | leídas por OCR — *cuánto OCR se paga* | **0/181** |
| `caracteres` | largo del texto leído | ✅ |
| `modelo` | `gemini-3.5-flash` | ✅ |
| `tokens_prompt`, `tokens_salida` | costo del modelo | **0/181** |
| `duracion_ms` | | ✅ |
| `error`, `avisos` | | |

> ⚠️ **Las cinco columnas de costo están vacías en el 100 % de las filas.** El DDL
> las documenta como «cuánto OCR se está pagando» y «cuánto costó». La fila se
> escribe, esos campos no se completan. Cada análisis que pasa así es historia
> que no se recupera.

### 2.2 `lens.analisis_campo` — la extracción, formato largo

Una fila **por cada uno de los 18 campos** de `constants.ts:PREDEFINED_FIELDS`.

| Campo | Significado |
|---|---|
| `campo_id` | `analisis_id\|campo` — **PK sintética** |
| `analisis_id` | **DISTKEY** |
| `campo` | nombre literal del catálogo |
| `orden` | 0–17, posición en `PREDEFINED_FIELDS` |
| `valor` | texto extraído, hasta 65.535 |
| `vacio` | `true` si el modelo respondió "No especificado" o vacío |
| `origen`, `ejecutado_en` | **duplicados de la cabecera a propósito**, para no exigir join |
| `valor_corregido`, `corregido_por`, `corregido_en` | la corrección humana — **0 de 550** |

> **Por qué largo y no ancho:** la lista de campos cambia (una tabla ancha obliga
> a `ALTER` en cada cambio), varios valores son párrafos, y «¿en cuántos
> documentos salió vacío el capital?» es una línea de SQL.

**`valor_corregido` en cero significa que hoy la tabla mide cobertura, no
calidad.** El par «lo que dijo el modelo / lo que corrigió la persona» es lo único
que permite medir alucinación, y la UI todavía no permite corregir.

### 2.3 `lens.analisis_ficha` — la ficha completa en JSON

| Campo | Significado |
|---|---|
| `ficha` | `SUPER` con el objeto de `fichaLens()` |
| `hash_documentos` | sha256 de los archivos fuente |

Claves del JSON y presencia real:

| Clave | Presencia |
|---|---|
| `campos` | 141/141 |
| `pais_detectado` | 140/141 |
| `proposito`, `archivos`, `consolidado` | ✅ |
| `regcheq` | 66/141 |
| `analisis_riesgo` | **0/141** |
| `analisis_integridad` | **0/141** |

Las dos últimas se escriben solo si alguien corre esos análisis desde la UI, que
son pasos opcionales. Por el dato, no se están usando.

> ⚠️ **Las claves van en `snake_case` obligatoriamente.** Redshift baja a
> minúsculas el identificador al navegar un `SUPER` con punto:
> `ficha.paisDetectado` devuelve **NULL en silencio**, `ficha.pais_detectado`
> funciona. Los objetos anidados de proveedores conservan camelCase; para esos hay
> que usar `json_extract_path_text(json_serialize(ficha), 'claveCamelCase')`.

**No incluye `rawTextContent`.** Una escritura de 41 páginas son 73.759
caracteres; guardarla metería el documento entero en el warehouse y la sentencia
no entraría por la Data API.

### 2.4 `lens.batch_documento` — el proceso, no la extracción

Grano: el **documento**. Existe porque una corrida de batch procesa varios
archivos y cada uno puede fallar por separado — sin esto, «el batch salió
parcial» no dice qué faltó.

| Campo | Estado |
|---|---|
| `documento_uid` (`analisis_id\|documento_id`) · **PK** | ✅ |
| `documento_id`, `nombre_archivo` | ✅ |
| `fuente` (`local_folder` \| `empresa_docs`), `slot` | ✅ |
| `estado_documento`, `ok` | ✅ |
| `metodo` (`capa_texto` \| `ocr`) | **0/2** |
| `paginas_totales`, `paginas_leidas`, `paginas_por_ocr`, `caracteres` | **0/2** |
| `error` | 0/2 |

Guarda **cuál** documento se procesó, pero no **cómo se leyó**. Además las dos
filas tienen `estado_documento = 'PENDING'` con `ok = true`, que no cuadra.

### 2.5 `lens.analisis_texto` — material crudo (0 filas)

Para recalibrar no alcanza con la ficha: hay que poder volver a correr el modelo
sobre exactamente el mismo texto y comparar contra exactamente lo que respondió.

| `tipo` | Contenido |
|---|---|
| `documento` | el texto que se le mandó al modelo |
| `respuesta_modelo` | lo que devolvió, antes de que el esquema lo acomodara |

Partida en trozos de ~20.000 caracteres (`orden`, `partes`) por dos límites duros:
la Data API rechaza requests de más de 200 kB, y un `VARCHAR` topa en 65.535
**bytes**. El `sha256` es del texto **completo** y se repite en cada trozo, para
saber si dos análisis corrieron sobre el mismo documento sin rearmar nada.

> Al rearmar: `LISTAGG` también topa en 65.535 bytes, así que un documento largo
> **no** se reconstruye en una sola consulta. Se traen los trozos ordenados y se
> concatenan del lado del cliente.

### 2.6 `lens.api_solicitud` — telemetría HTTP (0 filas)

Lo que **no** es un análisis: un 401 por secreto mal puesto, un 413 por tamaño, un
502 por timeout. `analisis_id` queda NULL cuando la llamada nunca llegó a
analizar. Es lo que hay que mirar cuando tech dice «la API no me responde».

Campos: `solicitud_id` (PK), `analisis_id`, `consumidor`, `recibido_en`, `ruta`,
`metodo`, `http_status`, `n_documentos`, `bytes_entrada`, `incluir_texto`,
`pais_forzado`, `estado`, `error`, `duracion_ms`, `ip_origen`.

---

# 3. Los dos campos de personas

Esta sección aparte porque es la que se usa para cruzar con otros procesos y la
que más se malinterpreta.

## 3.1 Dónde viven

**No hay tabla de personas.** Viven como texto en dos filas de
`lens.analisis_campo`:

| `orden` | `campo` | Grano |
|---|---|---|
| 7 | `Representante Legal` | **todos** los representantes en un solo `valor` |
| 6 | `Accionistas y aportes` | **todos** los accionistas en un solo `valor` |

También aparecen dentro de `analisis_ficha.ficha.campos`, pero es **la misma
cadena duplicada**, no una versión estructurada.

## 3.2 El contrato de formato

Lo define el prompt en `constants.ts`. Instrucciones literales:

```
Devuelve UNA PERSONA POR LÍNEA con este formato exacto:

NOMBRE COMPLETO | DOCUMENTO | DATO
```

| Posición | Contenido | Si falta |
|---|---|---|
| 1 · **NOMBRE COMPLETO** | todos los nombres y apellidos como figuran. Nunca abreviar, cortar apellidos ni usar iniciales | — |
| 2 · **DOCUMENTO** | RUT, cédula, DNI o pasaporte con su formato original | literal `sin documento` |
| 3 · **DATO** | `Accionistas`: **porcentaje** de participación. Si el documento da acciones y no porcentaje, se calcula sobre el total | literal `sin porcentaje` |
| | `Representante`: el **cargo** (ej. Gerente General) | — |

Regla explícita del prompt: **varias personas nombradas juntas** —"Juan Pérez y
María Soto", o separadas por comas— **son líneas distintas**. Nunca se juntan.

Ejemplos que el prompt entrega al modelo:

```
Accionistas y aportes
JUAN ANDRÉS PÉREZ SOTO | 12.345.678-9 | 50%
MARÍA JOSÉ GONZÁLEZ RUIZ | 9.876.543-2 | 50%

Representante Legal
JUAN ANDRÉS PÉREZ SOTO | 12.345.678-9 | Gerente General
```

## 3.3 Qué está pasando de verdad — medido

Sobre las 181 ejecuciones cargadas:

### Cobertura

| | Representante Legal | Accionistas y aportes |
|---|---|---|
| Análisis con el campo | 181 | 181 |
| Con dato | 180 (99 %) | 151 (83 %) |
| **Vacío** | **1** | **30 (17 %)** |
| **Personas individualizadas** | **291** | **259** |

**550 personas** en total.

### Integridad del formato

| Chequeo | Representante | Accionistas |
|---|---|---|
| Líneas que parsean (exactamente 2 pipes) | **291 / 291** | **259 / 259** |
| Líneas descartadas | **0** | **0** |
| Líneas vacías | 0 | 0 |
| Caída a prosa (sin pipe) | **0** | **0** |
| Nombre de una sola palabra | 0 | 0 |
| Nombre > 60 caracteres (prosa colada) | 0 | 0 |
| Nombre con paréntesis o coma | 2 | 1 |
| Tercer campo vacío | 0 | 0 |

**El formato se respeta en el 100 % de los casos.** Cero fallbacks a prosa, cero
líneas mal formadas, cero pérdida al parsear.

### Documento

| | Representante | Accionistas |
|---|---|---|
| Con documento | 256 (88 %) | 211 (81 %) |
| `sin documento` | **35 (12 %)** | **48 (19 %)** |
| Documento presente pero < 7 caracteres | **0** | **0** |

Los que traen documento lo traen bien: ninguno es basura corta.

### Participación accionaria

| Chequeo | Resultado |
|---|---|
| Análisis con socios | 151 |
| Con porcentaje en **todos** los socios | 146 |
| Con porcentaje incompleto | **5** |
| De los completos, **suman 100 %** (±0,5) | **146 de 146** |
| De los completos, **no suman 100** | **0** |

> **Los porcentajes cierran en el 100 % de los casos completos.** Es la validación
> que el diseño prometía y nunca se había medido.

## 3.4 Cómo leerlo — query de desdoble

Convierte el texto multilínea en una fila por persona. Validada el 10-09-2026:
**550 de 550 líneas parsean, 0 descartes.**

```sql
WITH base AS (
  SELECT c.analisis_id, c.campo, c.origen, c.ejecutado_en,
         SPLIT_TO_ARRAY(c.valor, CHR(10)) AS lineas
  FROM lens.analisis_campo c
  WHERE c.campo IN ('Representante Legal', 'Accionistas y aportes')
    AND NOT c.vacio
),
lineas AS (
  SELECT b.analisis_id, b.campo, b.origen, b.ejecutado_en,
         idx AS orden, TRIM(l::varchar) AS linea
  FROM base b, b.lineas AS l AT idx        -- PartiQL: desdobla el SUPER
),
personas AS (
  SELECT analisis_id, campo, origen, ejecutado_en, orden,
         TRIM(SPLIT_PART(linea, '|', 1)) AS nombre,
         TRIM(SPLIT_PART(linea, '|', 2)) AS documento_raw,
         TRIM(SPLIT_PART(linea, '|', 3)) AS dato
  FROM lineas
  WHERE linea <> '' AND REGEXP_COUNT(linea, '[|]') = 2
)
SELECT
  a.ejecutado_en, a.origen, a.actor_email, a.estado,
  a.pais_detectado, a.rut_sociedad, a.razon_social,
  CASE p.campo WHEN 'Representante Legal' THEN 'representante'
               ELSE 'accionista' END                        AS rol,
  p.orden,
  p.nombre,
  CASE WHEN LOWER(p.documento_raw) LIKE 'sin documento%'
       THEN NULL ELSE p.documento_raw END                    AS documento,
  -- clave de cruce: sin esto "12.345.678-9" y "12345678-9" no matchean
  CASE WHEN LOWER(p.documento_raw) LIKE 'sin documento%'
       THEN NULL
       ELSE REGEXP_REPLACE(UPPER(p.documento_raw), '[^0-9A-Z]', '') END
                                                             AS documento_canon,
  -- solo castea si hay '%': sin la guarda, "1.000 acciones" se volvería 1,0 %
  CASE WHEN p.campo = 'Accionistas y aportes' AND POSITION('%' IN p.dato) > 0
       THEN NULLIF(REPLACE(REGEXP_SUBSTR(p.dato, '[0-9]+([.,][0-9]+)?'), ',', '.'), '')::decimal(9,4)
  END                                                        AS participacion_pct,
  CASE WHEN p.campo = 'Representante Legal' THEN p.dato END  AS cargo,
  p.dato                                                     AS dato_crudo,
  p.analisis_id
FROM personas p
JOIN lens.analisis a ON a.analisis_id = p.analisis_id
ORDER BY a.ejecutado_en DESC, rol, p.orden;
```

**Tres detalles al leerla:**

- `FROM b.lineas AS l AT idx` es sintaxis **PartiQL** de Redshift para desdoblar un
  `SUPER`. Es lo que convierte texto multilínea en filas, sin `generate_series`.
- `documento_canon` es la clave de cruce entre análisis. Sin normalizar, el mismo
  RUT no matchea consigo mismo.
- El casteo de porcentaje **solo se aplica si el texto trae `%`**. Sin esa guarda,
  una línea con «1.000 acciones» se convertiría en `1,0 %`, que es peor que `NULL`.

### Dos consultas derivadas

```sql
-- Personas que aparecen en más de una empresa
SELECT documento_canon, COUNT(DISTINCT rut_sociedad) AS empresas, COUNT(*) AS apariciones
FROM ( … )
WHERE documento_canon IS NOT NULL
GROUP BY 1 HAVING COUNT(DISTINCT rut_sociedad) > 1
ORDER BY 2 DESC;

-- Empresas cuyas participaciones no cierran en 100
SELECT analisis_id, rut_sociedad, SUM(participacion_pct) AS suma
FROM ( … )
WHERE rol = 'accionista'
GROUP BY 1,2 HAVING ABS(SUM(participacion_pct) - 100) > 0.5;
```

## 3.5 Qué funciona y qué hay que corregir

**Funciona, y bien:**

- El formato de 3 campos se respeta sin excepción — 550 de 550.
- No hay caída a prosa. Ninguna.
- Los porcentajes cierran en 100 en los 146 análisis completos.
- Los documentos presentes son válidos: ninguno por debajo de 7 caracteres.
- El parseo hacia atrás es **sin pérdida**: no hace falta re-analizar nada.

**Hay que corregir:**

| # | Qué | Tamaño |
|---|---|---|
| 1 | **No está modelado 1 a 1.** Para saber cuántos socios tiene una empresa hay que contar saltos de línea dentro de un `VARCHAR`. No se puede cruzar por persona sin parsear en cada query | 550 personas afectadas |
| 2 | **Accionistas vacío** en 30 de 181 análisis | 17 % |
| 3 | **`sin documento`** — sin documento no hay cruce posible con esa persona | 83 de 550 (15 %) |
| 4 | **Porcentaje incompleto** en 5 análisis: algún socio sin `%`, así que la suma no se puede validar | 5 de 151 |
| 5 | **`valor_corregido` en 0** — sin correcciones no se puede medir alucinación, solo cobertura | 0 de 550 |

### La corrección de fondo: `lens.analisis_persona`

El punto 1 se resuelve con una tabla derivada. **No requiere re-analizar nada ni
gastar un token**: se puebla parseando lo que ya está guardado, hacia atrás sobre
los 181 análisis, y a futuro se escribe en el mismo momento que el campo largo.

```
lens.analisis_persona
  persona_uid        analisis_id|rol|orden     -- PK sintética, misma convención
  analisis_id                                  -- DISTKEY
  rol                representante | accionista
  orden              posición dentro del campo
  nombre
  documento                                    -- NULL si "sin documento"
  documento_canon                              -- clave de cruce
  cargo                                        -- solo representante
  participacion_pct                            -- solo accionista
  origen, ejecutado_en                         -- duplicados, misma convención
  cargado_en
```

Mantiene las tres convenciones del schema: PK sintética (el logger borra por la
primera columna), `analisis_id` como DISTKEY, y `origen`/`ejecutado_en`
duplicados para no exigir join.

---

## 4. Resumen del estado

| | |
|---|---|
| Schema | ✅ productivo desde 07-09-2026 22:13 UTC |
| Tablas creadas | 6 de 6 |
| Flujos escribiendo | **2 de 4** — `analizador` y `batch`. Faltan `api` y `kyb` |
| Extracción | ✅ completa y consistente |
| Personas | ✅ el dato está · ❌ no está modelado |
| Costo (páginas, tokens) | ❌ 0 % en las tres tablas que lo contemplan |
| Material crudo | ❌ `analisis_texto` en 0 filas |
| Correcciones humanas | ❌ 0 — la UI no permite corregir |
