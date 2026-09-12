-- Fase 6 · Vistas en inglés sobre las tablas en español.
--
-- Tech pidió estandarizar en inglés. RENOMBRAR ROMPE: la app, el dict `TABLAS`
-- del logger y cualquier consulta ya escrita apuntan a los nombres actuales.
--
-- La forma no destructiva es esta: un juego de vistas. Aditivo, reversible —se
-- borran con un DROP y no se pierde un dato— y tech consulta los nombres que
-- pidió. Las tablas en español siguen siendo la fuente de verdad y lo que
-- escriben el logger y la SPA.
--
-- Van en el MISMO schema `lens`, no en uno aparte: así un solo GRANT cubre las
-- dos formas y no hay que mantener permisos duplicados. Conviven
-- `lens.analisis` (la tabla) y `lens.analysis` (la vista).
--
-- Se generaron DESDE las columnas reales del cluster, no a mano: nunca pueden
-- quedar apuntando a algo que no existe el día que se crean.
--
-- Lo que NO resuelve generarlas es el día siguiente: si alguien agrega una
-- columna y no regenera, la vista simplemente no la expone. No falla, no avisa,
-- y tech concluye que el dato no existe. Para eso está
-- `scripts/verificar_vistas.py --check`, que compara este archivo contra el DDL
-- versionado y falla en CI. Si tocás una tabla de `lens`, corrélo.
--
-- NO llevan `WITH NO SCHEMA BINDING`, y es a propósito. Una vista de enlace
-- tardío NO aparece en `information_schema.columns`: no la ve un catálogo, ni
-- una herramienta de BI, ni un `\d` — y que tech pueda descubrir estos nombres
-- es justamente el objetivo de la fase. Verificado contra el cluster: con
-- enlace tardío las nueve vistas devolvían 0 columnas en el catálogo.
--
-- El costo de enlazarlas es que una tabla con vista dependiente no se puede
-- DROPear ni cambiarle el tipo a una columna sin borrar antes la vista. Agregar
-- columnas sí funciona, que es lo que se hace normalmente.
--
-- PENDIENTE DE DECISIÓN, fuera de este alcance: el resto del warehouse
-- (`colas_trabajo`, `liberacion_remesa`, `kyb_empresa`) también está en español.
-- Si el estándar es para todo el warehouse, es un proyecto aparte.


CREATE OR REPLACE VIEW lens.analysis AS
SELECT
  analisis_id AS analysis_id,
  origen AS source,
  actor_tipo AS actor_type,
  actor_id AS actor_id,
  actor_email AS actor_email,
  ejecutado_en AS executed_at,
  n_archivos AS file_count,
  archivos AS files,
  consolidado AS consolidated,
  proposito AS purpose,
  estado AS status,
  pais_detectado AS detected_country,
  rut_sociedad AS company_tax_id,
  razon_social AS company_name,
  paginas_totales AS total_pages,
  paginas_por_capa AS pages_from_text_layer,
  paginas_por_ocr AS pages_from_ocr,
  caracteres AS characters,
  modelo AS model,
  tokens_prompt AS prompt_tokens,
  tokens_salida AS output_tokens,
  duracion_ms AS duration_ms,
  error AS error,
  avisos AS warnings,
  cargado_en AS loaded_at,
  company_id AS company_id,
  domicilio_pais AS address_country,
  domicilio_region AS address_region,
  domicilio_ciudad AS address_city,
  domicilio_calle AS address_street,
  domicilio_numero AS address_number,
  domicilio_complemento AS address_complement,
  domicilio_cp AS address_postal_code,
  domicilio_raw AS address_raw,
  notaria_registro AS notary_registry,
  fecha_constitucion_iso AS incorporation_date,
  flag_administracion_conjunta AS flag_joint_management,
  flag_limites_monto AS flag_amount_limits,
  flag_18a AS flag_18a
FROM lens.analisis;

CREATE OR REPLACE VIEW lens.analysis_field AS
SELECT
  campo_id AS field_id,
  analisis_id AS analysis_id,
  campo AS field,
  orden AS position,
  valor AS value,
  vacio AS is_empty,
  origen AS source,
  ejecutado_en AS executed_at,
  valor_corregido AS corrected_value,
  corregido_por AS corrected_by,
  corregido_en AS corrected_at,
  cargado_en AS loaded_at
FROM lens.analisis_campo;

CREATE OR REPLACE VIEW lens.analysis_record AS
SELECT
  analisis_id AS analysis_id,
  origen AS source,
  ejecutado_en AS executed_at,
  ficha AS record,
  hash_documentos AS documents_hash,
  cargado_en AS loaded_at
FROM lens.analisis_ficha;

CREATE OR REPLACE VIEW lens.analysis_text AS
SELECT
  texto_id AS text_id,
  analisis_id AS analysis_id,
  tipo AS type,
  orden AS position,
  partes AS parts,
  texto AS text,
  caracteres AS characters,
  sha256 AS sha256,
  origen AS source,
  ejecutado_en AS executed_at,
  cargado_en AS loaded_at
FROM lens.analisis_texto;

CREATE OR REPLACE VIEW lens.analysis_person AS
SELECT
  persona_uid AS person_uid,
  analisis_id AS analysis_id,
  rol AS role,
  persona_padre_uid AS parent_person_uid,
  nivel AS level,
  orden AS position,
  person_type AS person_type,
  nombre_completo AS full_name,
  nombre AS first_name,
  apellido AS last_name,
  documento AS identification,
  documento_canon AS identification_canonical,
  tipo_documento AS identification_type,
  pais_origen AS country_of_origin,
  participacion_pct AS ownership_percentage,
  es_pep AS is_pep,
  cargo AS position_title,
  dato_crudo AS raw_value,
  origen AS source,
  ejecutado_en AS executed_at,
  cargado_en AS loaded_at
FROM lens.analisis_persona;

CREATE OR REPLACE VIEW lens.analysis_activity AS
SELECT
  actividad_uid AS activity_uid,
  analisis_id AS analysis_id,
  orden AS position,
  codigo AS code,
  descripcion AS description,
  origen AS source,
  ejecutado_en AS executed_at,
  cargado_en AS loaded_at
FROM lens.analisis_actividad;

CREATE OR REPLACE VIEW lens.batch_document AS
SELECT
  documento_uid AS document_uid,
  analisis_id AS analysis_id,
  documento_id AS document_id,
  nombre_archivo AS file_name,
  fuente AS origin,
  slot AS slot,
  estado_documento AS document_status,
  ok AS ok,
  metodo AS method,
  paginas_totales AS total_pages,
  paginas_leidas AS pages_read,
  paginas_por_ocr AS pages_from_ocr,
  caracteres AS characters,
  error AS error,
  ejecutado_en AS executed_at,
  cargado_en AS loaded_at
FROM lens.batch_documento;

CREATE OR REPLACE VIEW lens.api_request AS
SELECT
  solicitud_id AS request_id,
  analisis_id AS analysis_id,
  consumidor AS consumer,
  recibido_en AS received_at,
  ruta AS path,
  metodo AS method,
  http_status AS http_status,
  n_documentos AS document_count,
  bytes_entrada AS input_bytes,
  incluir_texto AS include_raw_text,
  pais_forzado AS forced_country,
  estado AS status,
  error AS error,
  duracion_ms AS duration_ms,
  ip_origen AS source_ip,
  cargado_en AS loaded_at
FROM lens.api_solicitud;

CREATE OR REPLACE VIEW lens.analysis_pivot AS
SELECT
  analisis_id AS analysis_id,
  origen AS source,
  ejecutado_en AS executed_at,
  rut_de_la_sociedad AS company_tax_id,
  razon_social AS company_name,
  fecha_de_constitucion AS incorporation_date,
  objeto_social AS business_purpose,
  capital_social AS share_capital,
  acciones AS shares,
  accionistas_y_aportes AS shareholders_and_contributions,
  representante_legal AS legal_representative,
  duracion AS duration,
  domicilio_legal AS legal_address,
  facultades AS powers,
  juntas_de_accionistas AS shareholder_meetings,
  resolucion_de_conflictos AS dispute_resolution,
  distribucion_de_utilidades AS profit_distribution,
  medio_de_comunicacion AS communication_channel,
  empresa_con_fines_de_lucro AS for_profit,
  documento_contains_modificaciones AS contains_amendments,
  analisis_de_facultades_especificas AS specific_powers_analysis
FROM lens.analisis_pivote;


CREATE OR REPLACE VIEW lens.analysis_review AS
SELECT
  revision_uid AS review_uid,
  analisis_id AS analysis_id,
  motivo AS reason,
  severidad AS severity,
  detalle AS details,
  detectado_en AS detected_at,
  detectado_por AS detected_by,
  resuelto AS resolved
FROM lens.analisis_revision;


-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos: escritos, SIN EJECUTAR. Decidido así el 12-09-2026.
-- ─────────────────────────────────────────────────────────────────────────────
-- Estado medido ese día: en el cluster NO hay ningún grupo creado, y los únicos
-- usuarios son `awsuser` (superusuario), `rdsdb` (interno de AWS) y un rol SSO
-- (`IAMR:AWSReservedSSO_…`). Tech no tiene principal todavía.
--
-- Y el rol SSO NO puede leer nada de `lens`: ni USAGE sobre el schema, ni SELECT
-- sobre las tablas, ni sobre estas vistas. Hoy el schema solo se consulta con
-- `awsuser`, que es lo que usa el Data API.
--
-- El alcance decidido es **solo las vistas en inglés**. Las tablas en español
-- quedan como detalle interno: menos superficie, y el día que se renombre una
-- columna adentro nadie afuera se entera.
--
-- Por eso NO se usa `GRANT SELECT ON ALL TABLES IN SCHEMA lens`: eso abarcaría
-- también las tablas en español. Hay que enumerar. El costo de enumerar es que
-- **una vista nueva nace sin permiso** —y el síntoma es "a tech le falta una de
-- las nueve", sin ningún error que lo explique—, así que
-- `scripts/verificar_vistas.py` falla si una vista de este archivo no aparece
-- también acá abajo.
--
-- Para habilitarlo, descomentar y ejecutar como `awsuser`:
--
--   CREATE GROUP lens_lectura;
--   GRANT USAGE ON SCHEMA lens TO GROUP lens_lectura;
--
--   GRANT SELECT ON lens.analysis              TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_field        TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_record       TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_text         TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_person       TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_activity     TO GROUP lens_lectura;
--   GRANT SELECT ON lens.batch_document        TO GROUP lens_lectura;
--   GRANT SELECT ON lens.api_request           TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_pivot        TO GROUP lens_lectura;
--   GRANT SELECT ON lens.analysis_review       TO GROUP lens_lectura;
--
-- Y recién entonces sumar a cada quien, que es una línea por principal. El
-- nombre exacto del rol SSO NO se escribe acá —este repo es público— y se saca
-- del cluster en el momento:
--
--   SELECT usename FROM pg_user WHERE usename LIKE 'IAMR:%';
--   ALTER GROUP lens_lectura ADD USER "<lo que devuelva>";
--
-- El permiso va al GRUPO y no a cada usuario a propósito: sumar a tech mañana
-- es un ALTER GROUP y no hay que volver a razonar sobre los permisos.
--
-- OJO con la vista sobre la materializada: `lens.analysis_pivot` lee de
-- `lens.analisis_pivote`. En Redshift el SELECT sobre una vista se evalúa con
-- los permisos del DUEÑO, así que con esto alcanza — pero si alguna vez se
-- recrea una vista con `WITH NO SCHEMA BINDING`, deja de aparecer en
-- `information_schema` y el descubrimiento se rompe. Ver la nota del encabezado.
