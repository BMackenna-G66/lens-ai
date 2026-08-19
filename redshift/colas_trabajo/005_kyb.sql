-- Trazabilidad de la cola KYB (empresas / B2B).
--
-- Mismo schema que el resto (colas_trabajo), tablas propias. El objeto acá es la
-- EMPRESA y su corrida de análisis, que no tiene nada que ver con la forma de
-- `caso` / `cierre` de las colas OFAC y Remesa.
--
-- La decisión de diseño que importa: hay UNA FILA POR COMPONENTE POR CORRIDA
-- (kyb_componente). Sin eso no se puede responder qué componente falla más
-- seguido ni dónde se pierde el tiempo del analista, que es justamente lo que
-- justifica tener el histórico.
--
-- ⚠️ La Lambda colas-trabajo-logger arma el SQL SOLO desde su whitelist TABLAS y
-- DESCARTA EN SILENCIO lo que no esté ahí. Estas cuatro tablas ya están agregadas
-- en aws/colas-logger/src/app.py; si se suma otra, hay que agregarla y redesplegar
-- o la traza se pierde sin ningún error visible.

-- ── Empresa: la última foto conocida ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.kyb_empresa (
    company_id          VARCHAR(40)   NOT NULL,
    razon_social        VARCHAR(300),
    identificacion      VARCHAR(40),
    pais                VARCHAR(60),
    compliance_status   VARCHAR(60),
    kyc_stage1          VARCHAR(60),
    risk_level          VARCHAR(40),
    institucional       BOOLEAN,
    origen              VARCHAR(20),      -- manual | barrido | salesforce
    status_kyb          VARCHAR(20),      -- ABIERTO | GESTIONANDO | CERRADO
    recibido_en         TIMESTAMP,
    actualizado_en      TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (company_id)
)
DISTSTYLE KEY
DISTKEY (company_id)
COMPOUND SORTKEY (recibido_en);


-- ── Corrida de análisis ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.kyb_analisis (
    run_id              VARCHAR(90)   NOT NULL,
    company_id          VARCHAR(40)   NOT NULL,
    corrida_en          TIMESTAMP,
    estado              VARCHAR(20),      -- COMPLETO | INCOMPLETO | ERROR
    -- NULL = no se pudo calcular. Nunca 0 por falta de análisis: en el reporting
    -- un 0 y un NULL se leen distinto y esa diferencia importa.
    certidumbre         INTEGER,
    cobertura           DECIMAL(6,2),     -- peso comparado en las dos fuentes
    penalizacion        DECIMAL(6,2),
    hash_documentos     VARCHAR(20),
    documentos_total    INTEGER,
    alertas_criticas    INTEGER,
    alertas_preventivas INTEGER,
    alertas_no_evaluables INTEGER,
    faltantes           VARCHAR(2000),
    mensaje_error       VARCHAR(1000),
    actor_id            VARCHAR(64),
    actor_nombre        VARCHAR(160),
    actor_tipo          VARCHAR(10),
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (run_id)
)
DISTSTYLE KEY
DISTKEY (company_id)
COMPOUND SORTKEY (corrida_en);


-- ── UNA FILA POR COMPONENTE POR CORRIDA ─────────────────────────────────────
-- Es la tabla que hace que el histórico sirva: permite responder "qué componente
-- discrepa más seguido" sin abrir una sola ficha.
CREATE TABLE IF NOT EXISTS colas_trabajo.kyb_componente (
    componente_id       VARCHAR(120)  NOT NULL,  -- run_id + '|' + id del componente
    run_id              VARCHAR(90)   NOT NULL,
    company_id          VARCHAR(40)   NOT NULL,
    corrida_en          TIMESTAMP,
    componente          VARCHAR(40),      -- razon_social, identificacion, …
    label               VARCHAR(80),
    peso                INTEGER,
    estado              VARCHAR(20),      -- COINCIDE | PARCIAL | DISCREPA | SOLO_* | SIN_DATOS
    aporte              DECIMAL(6,2),     -- peso × factor del estado
    es_identidad        BOOLEAN,
    valor_lens          VARCHAR(500),
    valor_admin         VARCHAR(500),
    emparejados         INTEGER,
    solo_en_lens        INTEGER,
    solo_en_admin       INTEGER,
    detalle             VARCHAR(1000),
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (componente_id)
)
DISTSTYLE KEY
DISTKEY (company_id)
COMPOUND SORTKEY (corrida_en, componente);


-- ── Alertas por corrida ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.kyb_alerta (
    alerta_id           VARCHAR(120)  NOT NULL,  -- run_id + '|' + codigo
    run_id              VARCHAR(90)   NOT NULL,
    company_id          VARCHAR(40)   NOT NULL,
    corrida_en          TIMESTAMP,
    codigo              VARCHAR(20),
    label               VARCHAR(200),
    severidad           VARCHAR(20),      -- CRITICA | PREVENTIVA | INFORMATIVA
    estado              VARCHAR(20),
    -- FALSE = no se pudo evaluar por falta de fuente. Se guarda igual: si no, en
    -- el reporting "no evaluable" y "sin hallazgos" se verían iguales, que es
    -- exactamente el error que produjo los falsos negativos de Regcheq.
    evaluable           BOOLEAN,
    faltante            VARCHAR(300),
    detalle             VARCHAR(1000),
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (alerta_id)
)
DISTSTYLE KEY
DISTKEY (company_id)
COMPOUND SORTKEY (corrida_en, codigo);


-- ── Decisiones, con maker-checker ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.kyb_decision (
    decision_id         VARCHAR(120)  NOT NULL,  -- company_id + '|' + decidida_en
    company_id          VARCHAR(40)   NOT NULL,
    tipo                VARCHAR(30),      -- APROBAR | RECHAZAR | FALTA_INFORMACION | …
    reason_code         VARCHAR(60),
    comentario          VARCHAR(1000),
    automatica          BOOLEAN,
    -- TRUE = el flujo estaba en simulación: se registró qué HABRÍA hecho, sin
    -- ejecutar. Es lo que permite medir el automático antes de prenderlo.
    simulacion          BOOLEAN,
    certidumbre         INTEGER,
    maker_id            VARCHAR(64),
    maker_nombre        VARCHAR(160),
    checker_id          VARCHAR(64),
    checker_nombre      VARCHAR(160),
    estado_aprobacion   VARCHAR(30),      -- PENDIENTE_APROBACION | APROBADA | RECHAZADA
    decidida_en         TIMESTAMP,
    resuelta_en         TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (decision_id)
)
DISTSTYLE KEY
DISTKEY (company_id)
COMPOUND SORTKEY (decidida_en);


-- ── Vistas ──────────────────────────────────────────────────────────────────

-- La que responde la pregunta que justifica todo esto: qué componente falla más.
DROP VIEW IF EXISTS colas_trabajo.v_kyb_componente_ranking;
CREATE VIEW colas_trabajo.v_kyb_componente_ranking AS
SELECT
    componente,
    label,
    COUNT(*)                                                    AS corridas,
    SUM(CASE WHEN estado = 'DISCREPA'   THEN 1 ELSE 0 END)       AS discrepa,
    SUM(CASE WHEN estado = 'SIN_DATOS'  THEN 1 ELSE 0 END)       AS sin_datos,
    SUM(CASE WHEN estado LIKE 'SOLO_%'  THEN 1 ELSE 0 END)       AS una_sola_fuente,
    SUM(CASE WHEN estado = 'COINCIDE'   THEN 1 ELSE 0 END)       AS coincide,
    ROUND(100.0 * SUM(CASE WHEN estado = 'DISCREPA' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS pct_discrepa,
    ROUND(AVG(aporte), 2)                                       AS aporte_promedio
FROM colas_trabajo.kyb_componente
GROUP BY componente, label
ORDER BY discrepa DESC, sin_datos DESC;

-- Qué alertas disparan más y cuáles no se pueden evaluar nunca.
DROP VIEW IF EXISTS colas_trabajo.v_kyb_alerta_ranking;
CREATE VIEW colas_trabajo.v_kyb_alerta_ranking AS
SELECT
    codigo,
    label,
    severidad,
    COUNT(*)                                                          AS corridas,
    SUM(CASE WHEN evaluable AND estado = 'ABIERTA' THEN 1 ELSE 0 END) AS disparo,
    SUM(CASE WHEN NOT evaluable THEN 1 ELSE 0 END)                    AS no_evaluable,
    ROUND(100.0 * SUM(CASE WHEN NOT evaluable THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS pct_no_evaluable
FROM colas_trabajo.kyb_alerta
GROUP BY codigo, label, severidad
ORDER BY disparo DESC;

-- Embudo por empresa: última corrida y en qué quedó.
DROP VIEW IF EXISTS colas_trabajo.v_kyb_resumen;
CREATE VIEW colas_trabajo.v_kyb_resumen AS
SELECT
    e.company_id,
    e.razon_social,
    e.pais,
    e.compliance_status,
    e.status_kyb,
    a.corrida_en                AS ultimo_analisis_en,
    a.estado                    AS estado_analisis,
    a.certidumbre,
    a.cobertura,
    a.alertas_criticas,
    a.alertas_no_evaluables,
    d.tipo                      AS decision,
    d.automatica,
    d.simulacion,
    d.estado_aprobacion,
    d.maker_nombre,
    d.checker_nombre
FROM colas_trabajo.kyb_empresa e
LEFT JOIN colas_trabajo.kyb_analisis a
       ON a.company_id = e.company_id
      AND a.corrida_en = (SELECT MAX(corrida_en) FROM colas_trabajo.kyb_analisis x WHERE x.company_id = e.company_id)
LEFT JOIN colas_trabajo.kyb_decision d
       ON d.company_id = e.company_id
      AND d.decidida_en = (SELECT MAX(decidida_en) FROM colas_trabajo.kyb_decision y WHERE y.company_id = e.company_id);
