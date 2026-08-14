-- Vistas de consulta para el oficial de cumplimiento / reportería.
-- Responden las preguntas que hoy no se pueden contestar desde Firestore.

-- 1. ¿Qué hizo cada analista, por día? (separa persona vs flujo automático)
CREATE OR REPLACE VIEW colas_trabajo.v_gestion_por_analista AS
SELECT
    TRUNC(e.ocurrido_en)                       AS dia,
    e.actor_id,
    COALESCE(a.nombre, e.actor_id)             AS analista,
    e.actor_tipo,                              -- USER | SYSTEM
    e.tipo                                     AS tipo_evento,
    COUNT(*)                                   AS eventos,
    COUNT(DISTINCT e.numero_caso)              AS casos
FROM colas_trabajo.evento_auditoria e
LEFT JOIN colas_trabajo.analista a ON a.actor_id = e.actor_id
GROUP BY 1, 2, 3, 4, 5;

-- 2. ¿Qué cerró el flujo automático, y con qué tipología?
CREATE OR REPLACE VIEW colas_trabajo.v_cierres_automaticos AS
SELECT
    c.numero_caso,
    ca.cola,
    ca.pais_codigo,
    c.canal,
    c.tipologia,
    c.status_enviado,
    c.ofac_flag,
    c.resultado_ok,
    c.detalle_error,
    c.ocurrido_en
FROM colas_trabajo.cierre c
LEFT JOIN colas_trabajo.caso ca ON ca.numero_caso = c.numero_caso
WHERE c.automatico = TRUE;

-- 3. Resumen por caso: último screening + cierres + si quedó retenido.
CREATE OR REPLACE VIEW colas_trabajo.v_caso_resumen AS
WITH ult_screening AS (
    SELECT numero_caso, decision, delitos_unicos, es_pep,
           retenido_sensible, categorias_sensibles, screened_en,
           ROW_NUMBER() OVER (PARTITION BY numero_caso ORDER BY screened_en DESC) AS rn
    FROM colas_trabajo.screening
)
SELECT
    ca.numero_caso,
    ca.cola,
    ca.pais,
    ca.pais_codigo,
    ca.id_interno_usuario,
    ca.recibido_en,
    s.decision                                 AS conclusion,
    s.delitos_unicos,
    s.es_pep,
    s.retenido_sensible,
    s.categorias_sensibles,
    MAX(CASE WHEN c.canal = 'SF'    AND c.resultado_ok THEN c.ocurrido_en END) AS cerrado_sf_en,
    MAX(CASE WHEN c.canal = 'ADMIN' AND c.resultado_ok THEN c.ocurrido_en END) AS cerrado_admin_en,
    BOOL_OR(c.automatico)                      AS tuvo_cierre_automatico
FROM colas_trabajo.caso ca
LEFT JOIN ult_screening s ON s.numero_caso = ca.numero_caso AND s.rn = 1
LEFT JOIN colas_trabajo.cierre c ON c.numero_caso = ca.numero_caso
GROUP BY 1,2,3,4,5,6,7,8,9,10,11;
