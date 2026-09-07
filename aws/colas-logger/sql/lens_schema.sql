-- Schema `lens` — persistencia de la extracción de documentos.
--
-- Correr una vez contra el cluster. Es idempotente: se puede volver a correr.
--
-- Los CUATRO flujos que extraen fichas —analizador, batch, API y KYB— escriben
-- en `lens.analisis` y `lens.analisis_campo`. A propósito: los cuatro producen
-- la MISMA ficha de 18 campos, y con una tabla por flujo comparar la calidad
-- entre ellos exigiría un UNION a mano cada vez.
--
-- ── Sobre las claves ────────────────────────────────────────────────────────
-- Las tablas hijas usan una clave SINTÉTICA (`analisis_id|campo`) en vez de una
-- compuesta. No es capricho: la ruta batcheada del logger borra por la primera
-- columna de la PK, así que con una PK compuesta escribir un campo habría
-- borrado los otros 17 del mismo análisis. Misma convención que `liberacion_id`
-- en `colas_trabajo`.
--
-- ── Sobre el acceso ─────────────────────────────────────────────────────────
-- Un schema nuevo NO hereda permisos: arranca sin GRANT para nadie salvo su
-- dueño. Eso es deliberado. Acá hay RUT, socios, participaciones, domicilios y
-- verificación de identidad del representante, datos que hoy mueren en el
-- navegador de quien corrió el análisis. Los GRANT van al final de este archivo,
-- comentados, para que se otorguen a propósito y no por arrastre.

CREATE SCHEMA IF NOT EXISTS lens;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cabecera: una fila por ejecución. Es el eje del cruce.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lens.analisis (
  analisis_id       VARCHAR(64)    NOT NULL,   -- ULID generado en el origen
  origen            VARCHAR(20),               -- analizador | batch | api | kyb
  -- Quién. Puede ser persona o sistema: la API no tiene analista detrás.
  actor_tipo        VARCHAR(10),               -- persona | sistema
  actor_id          VARCHAR(128),              -- uid del analista, o el consumidor
  actor_email       VARCHAR(320),
  ejecutado_en      TIMESTAMP,                 -- UTC
  -- Qué se analizó
  n_archivos        SMALLINT,
  archivos          SUPER,                     -- ["escritura.pdf","anexo.pdf"]
  consolidado       BOOLEAN,
  proposito         VARCHAR(32),
  -- Resultado
  estado            VARCHAR(24),               -- COMPLETO | PARCIAL | ERROR
  pais_detectado    VARCHAR(32),
  rut_sociedad      VARCHAR(16),               -- normalizado: 784517926
  razon_social      VARCHAR(512),
  -- Cómo se leyó: dice cuánto OCR se está pagando
  paginas_totales   INTEGER,
  paginas_por_capa  INTEGER,
  paginas_por_ocr   INTEGER,
  caracteres        BIGINT,
  -- Cuánto costó
  modelo            VARCHAR(64),
  tokens_prompt     BIGINT,
  tokens_salida     BIGINT,
  duracion_ms       BIGINT,
  error             VARCHAR(2000),
  avisos            SUPER,
  cargado_en        TIMESTAMP,
  PRIMARY KEY (analisis_id)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- La extracción campo por campo. Formato LARGO.
-- ─────────────────────────────────────────────────────────────────────────────
-- Largo y no ancho por tres razones concretas:
--   · la lista de campos cambia; una tabla ancha obliga a ALTER en cada cambio
--   · varios valores son párrafos (Objeto Social, Facultades, Accionistas)
--   · "¿en cuántos documentos salió vacío el capital?" es una línea de SQL
CREATE TABLE IF NOT EXISTS lens.analisis_campo (
  campo_id          VARCHAR(256)   NOT NULL,   -- analisis_id|campo
  analisis_id       VARCHAR(64)    NOT NULL,
  campo             VARCHAR(128),              -- "RUT de la sociedad"
  orden             SMALLINT,                  -- posición en el catálogo
  valor             VARCHAR(65535),
  vacio             BOOLEAN,                   -- "No especificado" o vacío
  -- Duplicados desde la cabecera A PROPÓSITO: la pregunta más común es "de qué
  -- flujo salió este valor y cuándo", y así no necesita join.
  origen            VARCHAR(20),
  ejecutado_en      TIMESTAMP,
  -- Previstas desde el día uno, aunque hoy la UI no permita corregir campos. El
  -- par "lo que dijo el modelo / lo que corrigió la persona" es el único dato
  -- que deja medir alucinación, y agregarlas después obliga a re-migrar.
  valor_corregido   VARCHAR(65535),
  corregido_por     VARCHAR(320),
  corregido_en      TIMESTAMP,
  cargado_en        TIMESTAMP,
  PRIMARY KEY (campo_id)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (campo, ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- La ficha completa, en JSON. Sin el PDF y sin el texto del documento.
-- ─────────────────────────────────────────────────────────────────────────────
-- Acá va todo lo que hoy queda solo en el navegador y no cabe en el formato
-- largo: análisis de riesgo, integridad, enriquecimiento Regcheq, comparativa
-- contra datos oficiales, resumen ejecutivo, y las secciones enriquecidas del
-- batch (estructura societaria, restricciones, tributaria, verificación del
-- representante, comercial, consistencia documental).
--
-- NO va `rawTextContent`. Medido: una escritura de 41 páginas son 73.759
-- caracteres. Guardar eso mete la escritura entera en el warehouse y con la
-- Data API la sentencia no entra. Para trazabilidad alcanzan hash y páginas.
-- ── OJO con las claves del JSON: snake_case, no camelCase ───────────────────
-- Redshift BAJA A MINÚSCULAS el identificador cuando se navega un SUPER con
-- punto, así que una clave camelCase devuelve NULL en silencio:
--
--   ficha.paisDetectado   → NULL   (se busca 'paisdetectado')
--   ficha.pais_detectado  → 'chile'
--
-- Verificado contra el cluster. Por eso las claves que escribimos van en
-- snake_case. Los objetos anidados de proveedores (regcheq, comparativa contra
-- Admin) conservan su forma original; para navegar esos hay que usar
--   json_extract_path_text(json_serialize(ficha), 'claveCamelCase')
-- o prender `enable_case_sensitive_identifier` en la sesión.
CREATE TABLE IF NOT EXISTS lens.analisis_ficha (
  analisis_id       VARCHAR(64)    NOT NULL,
  origen            VARCHAR(20),
  ejecutado_en      TIMESTAMP,
  ficha             SUPER,                     -- el JSON completo
  hash_documentos   VARCHAR(64),               -- sha256 de los archivos fuente
  cargado_en        TIMESTAMP,
  PRIMARY KEY (analisis_id)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- El batch, documento por documento.
-- ─────────────────────────────────────────────────────────────────────────────
-- El grano es el DOCUMENTO, que es lo que el batch tiene y los otros flujos no:
-- una corrida procesa muchos archivos de una empresa y cada uno pudo fallar por
-- su cuenta. Sin esta tabla, "el batch salió parcial" no dice qué faltó.
CREATE TABLE IF NOT EXISTS lens.batch_documento (
  documento_uid     VARCHAR(256)   NOT NULL,   -- analisis_id|documento_id
  analisis_id       VARCHAR(64)    NOT NULL,
  documento_id      VARCHAR(128),
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
  cargado_en        TIMESTAMP,
  PRIMARY KEY (documento_uid)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (ejecutado_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- Toda llamada a la API, incluidas las que NO llegaron a analizar.
-- ─────────────────────────────────────────────────────────────────────────────
-- "Todo lo que se procese por la API" incluye lo que se RECHAZÓ: un 401 por
-- secreto mal puesto, un 413 por tamaño, un 502 por timeout. Eso no es un
-- análisis, así que no va en `lens.analisis` — pero es justo lo que hay que
-- mirar cuando el equipo de tech dice "la API no me responde".
-- `analisis_id` queda NULL cuando la llamada no llegó a analizar.
CREATE TABLE IF NOT EXISTS lens.api_solicitud (
  solicitud_id      VARCHAR(64)    NOT NULL,   -- ULID por llamada
  analisis_id       VARCHAR(64),               -- NULL si no analizó
  consumidor        VARCHAR(128),              -- qué sistema llamó
  recibido_en       TIMESTAMP,
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
  cargado_en        TIMESTAMP,
  PRIMARY KEY (solicitud_id)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (recibido_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos: a propósito, comentados.
-- ─────────────────────────────────────────────────────────────────────────────
-- El usuario con el que escribe el logger necesita esto:
--
--   GRANT USAGE ON SCHEMA lens TO <usuario_del_logger>;
--   GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA lens TO <usuario_del_logger>;
--
-- La LECTURA para analistas o para el dashboard va aparte, y es una decisión de
-- Compliance: acá hay datos personales que hoy no salen del navegador.
--
--   -- GRANT USAGE ON SCHEMA lens TO GROUP <grupo>;
--   -- GRANT SELECT ON ALL TABLES IN SCHEMA lens TO GROUP <grupo>;
