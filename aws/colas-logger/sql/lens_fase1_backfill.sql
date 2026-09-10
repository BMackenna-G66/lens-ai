-- Fase 1.3 · Backfill de `lens.analisis_persona` desde el texto ya guardado.
--
-- NO gasta un solo token: desdobla lo que ya está en `lens.analisis_campo`.
--
-- IDEMPOTENTE. El `NOT EXISTS` del final es lo que lo hace: Redshift no impone
-- la PRIMARY KEY, así que sin esa guarda una segunda corrida duplicaría todo.
-- Verificado: primera corrida 577 filas, segunda 0.
--
-- Verificado el 10-09-2026 sobre 190 análisis: 577 de 577 líneas parsean, cero
-- descartes. Los porcentajes cierran en 154 de 154 análisis completos.
--
-- Qué queda NULL a propósito: el texto viejo no dice si un accionista es
-- natural o jurídico, ni el tipo de documento, ni el país, ni si es PEP, ni la
-- cadena de propiedad. Eso lo llena la extracción nueva de acá en adelante.
--
-- Y por eso el rol de estas filas es el neutro 'accionista', no
-- 'accionista_directo': clasificarlas afirmaría algo que no sabemos, y además
-- rompería la restricción `accionista_directo ⇒ person_type = NATURAL`.

INSERT INTO lens.analisis_persona (
  persona_uid, analisis_id, rol, persona_padre_uid, nivel, orden,
  person_type, nombre_completo, nombre, apellido,
  documento, documento_canon, tipo_documento, pais_origen,
  participacion_pct, es_pep, cargo, dato_crudo,
  origen, ejecutado_en, cargado_en
)
WITH base AS (
  SELECT c.analisis_id, c.campo, c.origen, c.ejecutado_en,
         SPLIT_TO_ARRAY(c.valor, CHR(10)) AS lineas
  FROM lens.analisis_campo c
  WHERE c.campo IN ('Representante Legal', 'Accionistas y aportes')
    AND NOT c.vacio
), lineas AS (
  SELECT b.analisis_id, b.campo, b.origen, b.ejecutado_en,
         idx AS orden, TRIM(l::varchar) AS linea
  FROM base b, b.lineas AS l AT idx
), personas AS (
  SELECT analisis_id, campo, origen, ejecutado_en, orden,
         TRIM(SPLIT_PART(linea, '|', 1)) AS nombre_completo,
         TRIM(SPLIT_PART(linea, '|', 2)) AS documento_raw,
         TRIM(SPLIT_PART(linea, '|', 3)) AS dato
  FROM lineas
  WHERE linea <> '' AND REGEXP_COUNT(linea, '[|]') = 2
)
SELECT
  p.analisis_id || '|'
    || CASE p.campo WHEN 'Representante Legal' THEN 'representante' ELSE 'accionista' END
    || '|' || p.orden::varchar                                   AS persona_uid,
  p.analisis_id,
  CASE p.campo WHEN 'Representante Legal' THEN 'representante'
               ELSE 'accionista' END                             AS rol,
  NULL                                                           AS persona_padre_uid,
  0                                                              AS nivel,
  p.orden,
  NULL                                                           AS person_type,
  p.nombre_completo,
  NULL                                                           AS nombre,
  NULL                                                           AS apellido,
  CASE WHEN LOWER(p.documento_raw) LIKE 'sin documento%'
       THEN NULL ELSE p.documento_raw END                        AS documento,
  -- Solo se canoniza si el valor TIENE DÍGITOS. Hay líneas donde el campo 2 es
  -- el RUT deletreado en palabras: canonizar eso daría una clave inventada.
  CASE WHEN LOWER(p.documento_raw) LIKE 'sin documento%' THEN NULL
       WHEN p.documento_raw !~ '[0-9]' THEN NULL
       ELSE REGEXP_REPLACE(UPPER(p.documento_raw), '[^0-9A-Z]', '') END AS documento_canon,
  NULL                                                           AS tipo_documento,
  NULL                                                           AS pais_origen,
  CASE WHEN p.campo = 'Accionistas y aportes' AND POSITION('%' IN p.dato) > 0
       THEN NULLIF(REPLACE(REGEXP_SUBSTR(p.dato, '[0-9]+([.,][0-9]+)?'), ',', '.'), '')::decimal(9,4)
  END                                                            AS participacion_pct,
  NULL                                                           AS es_pep,
  CASE WHEN p.campo = 'Representante Legal' THEN p.dato END      AS cargo,
  p.dato                                                         AS dato_crudo,
  p.origen, p.ejecutado_en, GETDATE()                            AS cargado_en
FROM personas p
WHERE NOT EXISTS (
  SELECT 1 FROM lens.analisis_persona x
  WHERE x.persona_uid = p.analisis_id || '|'
    || CASE p.campo WHEN 'Representante Legal' THEN 'representante' ELSE 'accionista' END
    || '|' || p.orden::varchar
)
