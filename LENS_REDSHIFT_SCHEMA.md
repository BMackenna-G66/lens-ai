# Schema `lens` en Redshift — persistencia de la extracción

Diseño para revisión. Cubre los cuatro flujos que extraen fichas hoy y los deja
cruzables entre sí y con lo que ya vive en Redshift.

> **Nota sobre la cantidad de campos.** El pedido decía 16; son **18**.
> Coinciden `constants.ts:PREDEFINED_FIELDS`, la API (`lens-analisis`) y su
> README. Los 16 eran las columnas de la tabla de remesas, otra cosa. El diseño
> no depende del número: la extracción se guarda en **formato largo** (una fila
> por campo), así que agregar o quitar campos no obliga a migrar nada.

---

## 1. Los cuatro flujos

| Flujo | `origen` | Dónde corre | Quién lo ejecuta |
|---|---|---|---|
| Analizador de documentos (individual y consolidado) | `analizador` | navegador | persona |
| Batch de empresas (carpeta local o EmpresaDocs) | `batch` | navegador | persona |
| API de análisis (`lens-analisis`) | `api` | Lambda | **sistema** consumidor |
| Cola KYB | `kyb` | navegador | persona |

Los cuatro producen **la misma ficha de 18 campos**. Eso es lo que permite una
sola tabla de cabecera y una sola de campos: si cada flujo tuviera su propia
tabla de extracción, comparar la calidad entre flujos exigiría un `UNION` a mano
cada vez, y la primera vez que se agregue un campo quedarían desalineadas.

---

## 2. Cómo se cruza todo

Dos ejes, a propósito:

**`analisis_id`** — identifica **una ejecución**. Se genera en el origen (ULID:
ordenable por tiempo y sin coordinación) y viaja a todas las tablas. Es el
linaje técnico: de este análisis salieron estos campos, este JSON y estos
documentos.

**`rut_sociedad`** — identifica **la empresa**, normalizado sin puntos ni guion y
con el DV pegado (`784517926`). Es el cruce de negocio: contra `colas_trabajo`,
contra KYB y contra el resto del warehouse. Va desnormalizado en la cabecera
para que la tabla sirva sin joins.

El `rut_sociedad` sale del campo *RUT de la sociedad* de la propia extracción, y
puede venir vacío o mal — es texto que sacó un modelo de un PDF. Por eso el
cruce autoritativo es `analisis_id` y el RUT es el cruce **de conveniencia**:
sirve para agrupar, no para afirmar identidad.

```
lens.analisis  (1 fila por ejecución) ──┬── lens.analisis_campo   (1 fila por campo)
   analisis_id, origen, actor, fecha    ├── lens.analisis_ficha   (1 fila, JSON completo)
   rut_sociedad ─────────────────►      ├── lens.analisis_texto   (material crudo, en trozos)
        │                               └── lens.batch_documento  (1 fila por documento)
        └──► colas_trabajo.*, KYB, transacciones
lens.api_solicitud (1 fila por llamada a la API) ──► analisis_id (nullable)
```

> **Estado al 08-09-2026.** Las seis tablas están creadas y el analizador y el
> batch escriben en producción. El DDL ejecutable vive en
> `aws/colas-logger/sql/lens_schema.sql`, que es la versión autoritativa.
> Pendiente: instrumentar el flujo `api` y definir los GRANT de lectura.

### `lens.analisis_texto` — para recalibrar el modelo

Guarda la ENTRADA y la SALIDA textual: `tipo = 'documento'` es el texto exacto
que recibió el modelo, `tipo = 'respuesta_modelo'` es lo que devolvió antes de
que el esquema lo acomodara. Con la ficha estructurada sola no se puede calibrar
nada, porque no se sabe sobre qué se corrió.

Va en trozos de 20.000 caracteres por dos límites **medidos** contra el cluster:
la Data API rechaza requests de más de **200 kB**, y `VARCHAR` topa en **65.535
bytes** mientras una escritura de 41 páginas son 73.759 caracteres.

Al rearmar: `LISTAGG` también topa en 65.535 bytes, así que un documento largo
no se reconstruye en una sola consulta — se traen los trozos ordenados por
`orden` y se concatenan del lado del cliente. El `sha256` del texto completo va
repetido en cada trozo, así que dos análisis del mismo archivo se cruzan sin
rearmar nada.

---

## 3. DDL

```sql
CREATE SCHEMA IF NOT EXISTS lens;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 Cabecera. Los CUATRO flujos escriben acá. Es el eje del cruce.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lens.analisis (
  analisis_id       VARCHAR(64)    NOT NULL,   -- ULID generado en el origen
  origen            VARCHAR(20)    NOT NULL,   -- analizador | batch | api | kyb
  -- Quién. Puede ser una persona o un sistema: la API no tiene analista.
  actor_tipo        VARCHAR(10),               -- persona | sistema
  actor_id          VARCHAR(128),              -- uid del analista, o nombre del consumidor
  actor_email       VARCHAR(320),
  ejecutado_en      TIMESTAMP      NOT NULL,   -- UTC
  -- Qué se analizó
  n_archivos        SMALLINT,
  archivos          SUPER,                     -- ["escritura.pdf", "anexo.pdf"]
  consolidado       BOOLEAN,                   -- varios archivos como un solo análisis
  proposito         VARCHAR(32),               -- extract | risk | financial | …
  -- Resultado
  estado            VARCHAR(24),               -- COMPLETO | PARCIAL | ERROR
  pais_detectado    VARCHAR(32),
  rut_sociedad      VARCHAR(16),               -- normalizado: 784517926
  razon_social      VARCHAR(512),
  -- Cómo se leyó (sirve para saber cuánto OCR se está pagando)
  paginas_totales   INTEGER,
  paginas_por_capa  INTEGER,
  paginas_por_ocr   INTEGER,
  caracteres        BIGINT,
  -- Cuánto costó
  modelo            VARCHAR(64),               -- gemini-3.5-flash
  tokens_prompt     BIGINT,
  tokens_salida     BIGINT,
  duracion_ms       BIGINT,
  error             VARCHAR(2000),
  avisos            SUPER,
  cargado_en        TIMESTAMP                  -- cuándo llegó a Redshift
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 La extracción, campo por campo. Formato LARGO.
-- ─────────────────────────────────────────────────────────────────────────────
-- Largo y no ancho por tres razones concretas:
--   · la lista de campos cambia; una tabla ancha obliga a ALTER en cada cambio
--   · varios valores son párrafos (Objeto Social, Facultades, Accionistas)
--   · "¿en cuántos documentos salió vacío el capital?" es una línea de SQL
--
-- `origen` está duplicado desde la cabecera A PROPÓSITO: la pregunta más común
-- es "de qué flujo salió este valor", y así no necesita join.
CREATE TABLE IF NOT EXISTS lens.analisis_campo (
  analisis_id       VARCHAR(64)    NOT NULL,
  campo             VARCHAR(128)   NOT NULL,   -- "RUT de la sociedad"
  orden             SMALLINT,                  -- posición en el catálogo
  valor             VARCHAR(65535),
  vacio             BOOLEAN,                   -- valor = "No especificado" / ""
  origen            VARCHAR(20),
  ejecutado_en      TIMESTAMP,
  -- Previsto desde el día uno, aunque hoy la UI no permita corregir campos.
  -- El par "lo que dijo el modelo / lo que corrigió la persona" es el único
  -- dato que permite medir alucinación, y agregar estas columnas después
  -- obliga a re-migrar la tabla entera.
  valor_corregido   VARCHAR(65535),
  corregido_por     VARCHAR(320),
  corregido_en      TIMESTAMP,
  cargado_en        TIMESTAMP
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (campo, ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3 La ficha completa, en JSON. Sin el PDF.
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla aparte y no una columna de la cabecera: es un blob grande y no se
-- quiere arrastrar en cada consulta de la cabecera.
--
-- Acá va TODO lo que hoy queda solo en el navegador y no cabe en el formato
-- largo: análisis de riesgo, integridad, enriquecimiento Regcheq, comparativa
-- contra datos oficiales, resumen ejecutivo, y las secciones enriquecidas del
-- batch (estructura societaria, restricciones, tributaria, verificación del
-- representante, comercial, consistencia documental).
--
-- NO va el texto del documento (`rawTextContent`). Medido: una escritura de 41
-- páginas son 73.759 caracteres. Guardar eso multiplica la tabla, mete la
-- escritura entera en el warehouse, y con la Data API la sentencia no entra.
-- Para trazabilidad alcanzan el hash y el conteo de páginas.
CREATE TABLE IF NOT EXISTS lens.analisis_ficha (
  analisis_id       VARCHAR(64)    NOT NULL,
  origen            VARCHAR(20),
  ejecutado_en      TIMESTAMP,
  ficha             SUPER          NOT NULL,   -- el JSON completo de la extracción
  hash_documentos   VARCHAR(64),               -- sha256 del/los archivos fuente
  cargado_en        TIMESTAMP
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4 El batch, documento por documento.
-- ─────────────────────────────────────────────────────────────────────────────
-- El grano es el DOCUMENTO, que es lo que el batch tiene y los otros flujos no:
-- una corrida procesa muchos archivos de una empresa y cada uno pudo fallar por
-- su cuenta. Sin esta tabla, "el batch salió parcial" no dice qué faltó.
CREATE TABLE IF NOT EXISTS lens.batch_documento (
  analisis_id       VARCHAR(64)    NOT NULL,
  documento_id      VARCHAR(128)   NOT NULL,
  nombre_archivo    VARCHAR(512),
  fuente            VARCHAR(20),               -- local_folder | empresa_docs
  slot              VARCHAR(128),              -- el slot de EmpresaDocs
  estado_documento  VARCHAR(32),
  ok                BOOLEAN,
  metodo            VARCHAR(20),               -- capa_texto | ocr
  paginas_totales   INTEGER,
  paginas_leidas    INTEGER,
  paginas_por_ocr   INTEGER,
  caracteres        BIGINT,
  error             VARCHAR(2000),
  ejecutado_en      TIMESTAMP,
  cargado_en        TIMESTAMP
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.5 Todas las llamadas a la API, incluidas las que no llegaron a analizar.
-- ─────────────────────────────────────────────────────────────────────────────
-- "Todo lo que se procese a través de la API" incluye lo que se RECHAZÓ: un 401
-- por secreto mal puesto, un 413 por tamaño, un 502 por timeout. Eso no es un
-- análisis, así que no va en `lens.analisis` — pero es exactamente lo que hay
-- que mirar cuando el equipo de tech dice "la API no me responde".
--
-- `analisis_id` es NULL cuando la llamada no llegó a analizar.
CREATE TABLE IF NOT EXISTS lens.api_solicitud (
  solicitud_id      VARCHAR(64)    NOT NULL,   -- ULID por llamada
  analisis_id       VARCHAR(64),               -- NULL si no analizó
  consumidor        VARCHAR(128),              -- qué sistema llamó
  recibido_en       TIMESTAMP      NOT NULL,
  ruta              VARCHAR(128),
  metodo            VARCHAR(10),
  http_status       SMALLINT,
  n_documentos      SMALLINT,
  bytes_entrada     BIGINT,
  incluir_texto     BOOLEAN,
  pais_forzado      VARCHAR(32),
  estado            VARCHAR(24),
  error             VARCHAR(2000),
  duracion_ms       BIGINT,
  ip_origen         VARCHAR(64),
  cargado_en        TIMESTAMP
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (recibido_en);
```

---

## 4. Cómo se escribe

**Se reutiliza el camino que ya existe y está probado**, el mismo de
`colas_trabajo`:

```
navegador (SPA)   ─┐
                   ├─► Worker /colas/log ─► Lambda colas-logger ─► Redshift
API lens-analisis ─┘                          (whitelist + upsert)
```

El logger arma el SQL **solo** desde su whitelist de tablas y columnas, manda
los valores como parámetros, y hace `DELETE` + `INSERT` por PK (idempotente: si
una fila se reenvía, no se duplica). Sumar estas tablas es declararlas en ese
mapa — el tipo `json` ya existe y se materializa como `SUPER` vía `JSON_PARSE`.

### Contrato de envío

```jsonc
POST /colas/log
{ "eventos": [
  { "tabla": "lens_analisis", "datos": {
      "analisis_id": "01JBQ...", "origen": "analizador",
      "actor_tipo": "persona", "actor_id": "uid-123",
      "actor_email": "analista@global66.com",
      "ejecutado_en": "2026-09-07T14:03:11Z",
      "n_archivos": 2, "archivos": ["escritura.pdf", "anexo.pdf"],
      "consolidado": true, "estado": "COMPLETO", "pais_detectado": "chile",
      "rut_sociedad": "784517926", "razon_social": "AD ASTRA TECNOLOGIA SpA",
      "paginas_totales": 41, "paginas_por_ocr": 0, "caracteres": 73759,
      "modelo": "gemini-3.5-flash", "duracion_ms": 5459
  }},
  { "tabla": "lens_analisis_campo", "datos": {
      "analisis_id": "01JBQ...", "campo": "RUT de la sociedad", "orden": 0,
      "valor": "78.451.792-6", "vacio": false,
      "origen": "analizador", "ejecutado_en": "2026-09-07T14:03:11Z"
  }}
  // … una entrada por campo
]}
```

### Cambios necesarios en `colas-logger`

1. **Schema por tabla.** Hoy `SCHEMA` es una env var global (`colas_trabajo`) y
   el destino se arma como `f"{SCHEMA}.{tabla}"`. Para escribir en `lens` sin
   mover lo existente hay que permitir un `schema` opcional por entrada del
   whitelist, con `colas_trabajo` como default. Es un cambio chico y contenido.
2. **Las cinco tablas nuevas** en `TABLAS`, con sus tipos y PK:
   `lens_analisis` (pk `analisis_id`), `lens_analisis_campo`
   (pk `analisis_id`+`campo`), `lens_analisis_ficha` (pk `analisis_id`),
   `lens_batch_documento` (pk `analisis_id`+`documento_id`),
   `lens_api_solicitud` (pk `solicitud_id`).

---

## 5. Decisiones que hay que tomar antes de implementar

### 5.1 Acceso al schema — la que más pesa

Esto son RUT, nombres de socios, participaciones, capital, domicilios y
verificación de identidad del representante. Hoy vive en el IndexedDB del
navegador de quien corrió el análisis y muere ahí. En Redshift lo puede
consultar cualquiera que tenga acceso al warehouse.

**El acceso a `lens` hay que definirlo a propósito, no heredarlo** del que ya
tiene el resto del cluster. Es una decisión de Compliance, no técnica.

### 5.2 El buffer nocturno de la API

El cluster se pausa **18:30–04:00** (hora Chile). La SPA ya tiene buffer de
reintento en el navegador, pero la API es una Lambda: no hay pestaña abierta que
reintente después. Un análisis por API a las 22:00 se perdería.

Dos salidas: que la Lambda deje la fila en S3 o DynamoDB y el job diario de
`colas-sync` la levante a las 08:30 (mismo patrón que ya existe), o que escriba
en modo TCP contra el cluster cuando esté despierto y buffer cuando no. La
primera reutiliza lo que hay.

### 5.3 Tocar el código de la API

`aws/lens-api/` **no está en el repo** — por decisión tuya vive solo en tu
disco. Instrumentar el flujo `api` significa tocar ese código. Si querés que lo
haga, hay que decidir si entra al repo o se trabaja fuera.

### 5.4 Tamaño del JSON de la ficha

Con la Data API cada sentencia tiene un techo de tamaño, así que el JSON de
`lens.analisis_ficha` tiene que ir **sin** el texto del documento. Si más
adelante hicieran falta fichas más grandes, el logger ya soporta modo TCP
(`MODO=tcp`), que no tiene ese límite.

---

## 6. Lo que esto habilita

Preguntas que hoy no se pueden responder con datos y después sí:

```sql
-- ¿Qué campos falla más el modelo, y en qué país?
SELECT campo, pais_detectado,
       AVG(CASE WHEN vacio THEN 1.0 ELSE 0 END) AS tasa_vacio,
       COUNT(*) AS n
FROM lens.analisis_campo c JOIN lens.analisis a USING (analisis_id)
WHERE a.ejecutado_en >= DATEADD(day, -30, GETDATE())
GROUP BY 1, 2 ORDER BY tasa_vacio DESC;

-- ¿Cuánto OCR estamos pagando, y qué flujo lo consume?
SELECT origen, SUM(paginas_por_ocr) AS paginas_ocr,
       SUM(paginas_por_capa) AS paginas_gratis, SUM(tokens_prompt) AS tokens
FROM lens.analisis GROUP BY 1;

-- ¿La empresa que estoy revisando en la cola ya se analizó antes?
SELECT a.ejecutado_en, a.origen, a.actor_email, a.estado
FROM lens.analisis a
WHERE a.rut_sociedad = '784517926' ORDER BY 1 DESC;

-- ¿Qué le está pasando al equipo de tech con la API?
SELECT DATE_TRUNC('day', recibido_en) AS dia, http_status, COUNT(*)
FROM lens.api_solicitud GROUP BY 1, 2 ORDER BY 1 DESC;
```
