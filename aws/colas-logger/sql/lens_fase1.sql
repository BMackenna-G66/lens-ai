-- Fase 1 del plan de absorción de shareholders — TODO ADITIVO.
--
-- Columnas nuevas nullable y tablas nuevas. Nada de lo que existe cambia de
-- forma: ninguna columna se renombra, se borra ni cambia de tipo, y las tablas
-- que ya escriben siguen escribiendo igual. Idempotente donde Redshift lo
-- permite; los ALTER fallan si la columna ya existe y eso está bien, dice que
-- ya se corrió.
--
-- Redshift acepta UNA columna por ALTER: por eso van catorce sentencias y no una.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 y 1.5 · Columnas nuevas en la cabecera
-- ─────────────────────────────────────────────────────────────────────────────
-- `company_id` es la más importante: hoy la única clave para cruzar `lens` con
-- el resto del warehouse es `rut_sociedad`, QUE LO EXTRAE EL MODELO. Es una
-- inferencia, y si lee mal un dígito la empresa se parte en dos. `company_id`
-- viene del llamador: es un hecho, no una lectura.
ALTER TABLE lens.analisis ADD COLUMN company_id VARCHAR(64);
ALTER TABLE lens.analisis ADD COLUMN domicilio_pais VARCHAR(64);
ALTER TABLE lens.analisis ADD COLUMN domicilio_region VARCHAR(128);
ALTER TABLE lens.analisis ADD COLUMN domicilio_ciudad VARCHAR(128);
ALTER TABLE lens.analisis ADD COLUMN domicilio_calle VARCHAR(256);
ALTER TABLE lens.analisis ADD COLUMN domicilio_numero VARCHAR(32);
ALTER TABLE lens.analisis ADD COLUMN domicilio_complemento VARCHAR(128);
ALTER TABLE lens.analisis ADD COLUMN domicilio_cp VARCHAR(32);
ALTER TABLE lens.analisis ADD COLUMN domicilio_raw VARCHAR(512);
ALTER TABLE lens.analisis ADD COLUMN notaria_registro VARCHAR(256);
ALTER TABLE lens.analisis ADD COLUMN fecha_constitucion_iso DATE;
ALTER TABLE lens.analisis ADD COLUMN flag_administracion_conjunta BOOLEAN;
ALTER TABLE lens.analisis ADD COLUMN flag_limites_monto BOOLEAN;
ALTER TABLE lens.analisis ADD COLUMN flag_18a BOOLEAN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 · `lens.analisis_persona` — representantes, accionistas y la cadena
-- ─────────────────────────────────────────────────────────────────────────────
-- UNA tabla, no varias, con auto-referencia: un accionista indirecto es una
-- persona colgando de otra persona (la jurídica), y separar eso en tablas
-- obliga a un UNION para la pregunta más común ("¿quiénes son los dueños?").
--
-- PK SINTÉTICA, obligatoria. La ruta batcheada del logger borra por la PRIMERA
-- columna de la PK: con PK compuesta, escribir una persona borraría a las demás
-- del mismo análisis. Es el mismo problema que ya apareció en `analisis_campo`,
-- y la misma solución.
--
-- Restricciones que se derivan del contrato (no las impone Redshift, se
-- verifican por consulta):
--   rol = 'accionista_directo'            ⇒ person_type = 'NATURAL'
--   rol = 'accionista_indirecto' y nivel 0 ⇒ person_type = 'JURIDICA'
--   nivel = 1                              ⇒ persona_padre_uid IS NOT NULL
--
-- OJO con `rol` en las filas del backfill: el texto viejo NO dice si un
-- accionista es natural o jurídico, así que clasificarlo como
-- 'accionista_directo' sería afirmar algo que no sabemos —y violaría la primera
-- restricción, porque `person_type` queda NULL—. Esas filas llevan el rol
-- neutro 'accionista'. Lo que viene de la extracción nueva sí se clasifica.
CREATE TABLE IF NOT EXISTS lens.analisis_persona (
  persona_uid        VARCHAR(320)  NOT NULL,   -- analisis_id|rol|ruta
  analisis_id        VARCHAR(64)   NOT NULL,
  rol                VARCHAR(24),  -- representante | accionista | accionista_directo | accionista_indirecto
  persona_padre_uid  VARCHAR(320), -- NULL en la raíz · el uid de la jurídica en los anidados
  nivel              SMALLINT,     -- 0 raíz · 1 detrás de una jurídica
  orden              SMALLINT,     -- posición en la lista original
  person_type        VARCHAR(16),  -- NATURAL | JURIDICA · NULL en el backfill
  nombre_completo    VARCHAR(512), -- shareholderName
  nombre             VARCHAR(256), -- name
  apellido           VARCHAR(256), -- lastName
  -- 128 y no 64: medido, el más largo son 67 bytes. Es un RUT que la escritura
  -- deletrea en palabras y el modelo transcribe literal («veinticuatro ciento
  -- noventa y cinco mil, treinta y dos, guión ocho»). Se guarda tal cual: es lo
  -- que dijo el modelo y se necesita para calibrarlo.
  documento          VARCHAR(128), -- shareholderId, con su formato original
  -- La clave de cruce solo se arma si el valor TIENE DÍGITOS. Canonizar esa
  -- prosa daría 'VEINTICUATROCIENTONOVENTAYCINCOMIL…', una clave inventada que
  -- ensucia los cruces sin que nadie lo note. Sin dígitos, NULL.
  documento_canon    VARCHAR(128), -- sin puntos ni guiones, mayúscula: clave de cruce
  tipo_documento     VARCHAR(32),  -- identificationType
  pais_origen        VARCHAR(64),  -- countryOfOrigin
  participacion_pct  DECIMAL(9,4), -- ownershipPercentage
  es_pep             BOOLEAN,      -- isPEP · tres estados: true / false / NULL
  cargo              VARCHAR(256), -- solo representante
  dato_crudo         VARCHAR(512), -- el tercer campo tal cual vino, para poder auditar
  origen             VARCHAR(20),
  ejecutado_en       TIMESTAMP,
  cargado_en         TIMESTAMP,
  PRIMARY KEY (persona_uid)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (analisis_id, rol, orden);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4 · `lens.analisis_actividad` — economicActivities[]
-- ─────────────────────────────────────────────────────────────────────────────
-- Es una lista, así que necesita su tabla. Mismo patrón: PK sintética y DISTKEY
-- por `analisis_id` para que el join con la cabecera quede co-localizado.
CREATE TABLE IF NOT EXISTS lens.analisis_actividad (
  actividad_uid      VARCHAR(320)  NOT NULL,   -- analisis_id|orden
  analisis_id        VARCHAR(64)   NOT NULL,
  orden              SMALLINT,
  codigo             VARCHAR(32),
  descripcion        VARCHAR(512),
  origen             VARCHAR(20),
  ejecutado_en       TIMESTAMP,
  cargado_en         TIMESTAMP,
  PRIMARY KEY (actividad_uid)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (analisis_id, orden);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.6 Vista materializada: los 18 campos como columnas.
-- ─────────────────────────────────────────────────────────────────────────────
-- Responde el pedido de tech sobre consultas pesadas SIN romper el formato
-- largo, que se eligió a propósito y cuyos motivos siguen en pie: la lista de
-- campos cambia, varios valores son párrafos, y medir cobertura por campo es
-- una línea de SQL.
--
-- La tabla larga sigue siendo la fuente de verdad. Esto es para consultar.
-- Los nombres de columna se generaron DESDE `PREDEFINED_FIELDS`, no a mano.
--
-- Se refresca con:  REFRESH MATERIALIZED VIEW lens.analisis_pivote;
CREATE MATERIALIZED VIEW lens.analisis_pivote AS
SELECT
  c.analisis_id,
  MAX(c.origen)       AS origen,
  MAX(c.ejecutado_en) AS ejecutado_en,
  MAX(CASE WHEN campo = 'RUT de la sociedad' THEN valor END) AS rut_de_la_sociedad,
  MAX(CASE WHEN campo = 'Razón Social' THEN valor END) AS razon_social,
  MAX(CASE WHEN campo = 'Fecha de Constitución' THEN valor END) AS fecha_de_constitucion,
  MAX(CASE WHEN campo = 'Objeto Social' THEN valor END) AS objeto_social,
  MAX(CASE WHEN campo = 'Capital Social' THEN valor END) AS capital_social,
  MAX(CASE WHEN campo = 'Acciones' THEN valor END) AS acciones,
  MAX(CASE WHEN campo = 'Accionistas y aportes' THEN valor END) AS accionistas_y_aportes,
  MAX(CASE WHEN campo = 'Representante Legal' THEN valor END) AS representante_legal,
  MAX(CASE WHEN campo = 'Duración' THEN valor END) AS duracion,
  MAX(CASE WHEN campo = 'Domicilio Legal' THEN valor END) AS domicilio_legal,
  MAX(CASE WHEN campo = 'Facultades' THEN valor END) AS facultades,
  MAX(CASE WHEN campo = 'Juntas de Accionistas' THEN valor END) AS juntas_de_accionistas,
  MAX(CASE WHEN campo = 'Resolución de Conflictos' THEN valor END) AS resolucion_de_conflictos,
  MAX(CASE WHEN campo = 'Distribución de Utilidades' THEN valor END) AS distribucion_de_utilidades,
  MAX(CASE WHEN campo = 'Medio de Comunicación' THEN valor END) AS medio_de_comunicacion,
  MAX(CASE WHEN campo = '¿Empresa con fines de lucro?' THEN valor END) AS empresa_con_fines_de_lucro,
  MAX(CASE WHEN campo = 'Documento contains modificaciones?' THEN valor END) AS documento_contains_modificaciones,
  MAX(CASE WHEN campo = 'Análisis de Facultades Específicas' THEN valor END) AS analisis_de_facultades_especificas
FROM lens.analisis_campo c
GROUP BY c.analisis_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- Análisis marcados para revisión humana (12-09-2026)
-- ─────────────────────────────────────────────────────────────────────────────
-- Existe porque dos bugs de extracción societaria se arreglaron HACIA ADELANTE
-- (PR #161 y #165) y lo ya cargado quedó como estaba. Sin esta tabla, una fila
-- con datos incompletos es indistinguible de una buena para quien la consulte.
--
-- NO se corrigen los datos: se marca cuál mirar y por qué. Corregir a mano sobre
-- una de las dos lecturas sería elegir un ganador sin volver al documento, que
-- es exactamente lo que el contraste de las dos lecturas existe para no hacer.
--
-- El `revision_uid` es sintético (`analisis_id|motivo`) y no compuesto: el
-- camino batcheado del logger borra por `pk[0]`, así que una PK compuesta
-- borraría las otras filas del mismo análisis al escribir una.
--
-- `resuelto` se pone en TRUE cuando alguien revisó, no cuando se re-analizó: un
-- re-análisis genera un `analisis_id` nuevo y esta fila sigue describiendo al
-- viejo.
CREATE TABLE IF NOT EXISTS lens.analisis_revision (
  revision_uid   VARCHAR(128) NOT NULL,   -- analisis_id|motivo
  analisis_id    VARCHAR(64)  NOT NULL,
  motivo         VARCHAR(64),             -- accionistas_faltantes | documento_discrepante | documento_faltante
  severidad      VARCHAR(16),             -- alta | media | baja
  detalle        VARCHAR(2000),           -- qué se vio, con las dos lecturas
  detectado_en   TIMESTAMP,
  detectado_por  VARCHAR(128),
  resuelto       BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (revision_uid)
)
DISTSTYLE KEY DISTKEY (analisis_id)
SORTKEY (detectado_en);
