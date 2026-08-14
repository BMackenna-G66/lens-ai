-- ============================================================================
--  Schema `colas_trabajo` — logs de gestión de la Bandeja de Casos de Lens
--  Cluster: compliance-redshift-cluster · database: dev
--
--  Guarda la trazabilidad completa del trabajo sobre las colas (OFAC, Remesas,
--  Otros): quién hizo qué, cuándo, con qué tipología y con qué resultado, más el
--  screening y los cierres por canal (Salesforce / Admin).
--
--  Firestore sigue siendo la fuente OPERACIONAL (la app lee de ahí en vivo).
--  Redshift es el histórico consultable / auditable. No se reemplaza nada.
--
--  Notas de Redshift:
--   · Las PK/FK son informativas (no se validan). La deduplicación se hace en la
--     carga usando las claves naturales marcadas como UNIQUE lógico.
--   · `SUPER` guarda el JSON tal cual (metadata/cambios) para no perder detalle.
--   · Idempotencia: cargar con MERGE (o DELETE+INSERT por clave) — ver README.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS colas_trabajo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Dimensión: caso (1 fila por caso recibido desde Salesforce)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.caso (
    numero_caso         VARCHAR(20)   NOT NULL,   -- clave natural (ej. '02648810')
    caso_id             VARCHAR(64),              -- id del documento en Firestore
    cola                VARCHAR(20),              -- ofac | remesa | otros
    asunto              VARCHAR(255),
    nombre_cuenta       VARCHAR(255),
    pais                VARCHAR(60),
    pais_codigo         CHAR(2),                  -- CL | CO | (vacío si no aplica)
    id_interno_usuario  BIGINT,                   -- customerId en Admin
    remesa_tx           VARCHAR(30),              -- nº de TX (solo cola Remesa)
    origen              VARCHAR(40),              -- salesforce | ...
    recibido_en         TIMESTAMP,                -- llegada a la cola
    actualizado_en      TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (numero_caso)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
SORTKEY (recibido_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dimensión: analista (para poder separar la gestión por usuario)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.analista (
    actor_id            VARCHAR(64)   NOT NULL,   -- uid de la sesión (o 'system')
    nombre              VARCHAR(160),
    email               VARCHAR(160),
    rol                 VARCHAR(40),              -- rol en Lens (Lider | Analista | ...)
    deshabilitado       BOOLEAN,
    es_sistema          BOOLEAN       DEFAULT FALSE,  -- TRUE para el flujo automático
    primer_evento_en    TIMESTAMP,
    ultimo_evento_en    TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (actor_id)
)
DISTSTYLE ALL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Hecho: evento de auditoría (el log crudo, append-only)
--    Espejo de casos_sf/{caso}/auditoria en Firestore.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.evento_auditoria (
    event_id            VARCHAR(64)   NOT NULL,   -- UNIQUE lógico (dedup en carga)
    numero_caso         VARCHAR(20)   NOT NULL,
    tipo                VARCHAR(40)   NOT NULL,   -- CASO_ASIGNADO | STATUS_CAMBIADO | CIERRE_AUTOMATICO | ...
    actor_id            VARCHAR(64),
    actor_tipo          VARCHAR(10),              -- USER | SYSTEM
    ocurrido_en         TIMESTAMP     NOT NULL,
    correlation_id      VARCHAR(64),
    version_caso        INTEGER,
    cambios             SUPER,                    -- { campo: { anterior, nuevo } }
    metadata            SUPER,                    -- payload del evento (sin datos sensibles)
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (event_id)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
COMPOUND SORTKEY (ocurrido_en, tipo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Hecho: screening (una fila por consulta; las reconsultas suman filas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.screening (
    screening_id        VARCHAR(80)   NOT NULL,   -- numero_caso + screened_en
    numero_caso         VARCHAR(20)   NOT NULL,
    fuente              VARCHAR(20),              -- Regcheq | Inspektor
    estado              VARCHAR(20),              -- ok | sin_causas | error | na
    decision            VARCHAR(80),              -- conclusión del motor
    delitos_unicos      INTEGER,
    es_pep              BOOLEAN,
    retenido_sensible   BOOLEAN       DEFAULT FALSE,  -- freno del flujo automático
    categorias_sensibles VARCHAR(255),            -- 'Tráfico, Armas' (texto plano)
    coincidencias       SUPER,                    -- delitos/causas tal cual
    screened_en         TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (screening_id)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
SORTKEY (screened_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Hecho: cierre por canal (Salesforce / Admin) — manual o automático
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.cierre (
    cierre_id           VARCHAR(80)   NOT NULL,   -- numero_caso + canal + en
    numero_caso         VARCHAR(20)   NOT NULL,
    canal               VARCHAR(10)   NOT NULL,   -- SF | ADMIN
    resultado_ok        BOOLEAN,
    automatico          BOOLEAN       DEFAULT FALSE,  -- TRUE = lo cerró el flujo
    tipologia           VARCHAR(40),              -- liberar_normal | liberar_ucr | fully_blocked | blocked_pep
    status_enviado      VARCHAR(40),              -- Admin: NORMAL | BLOCKED | FULLY_BLOCKED | ...
    ofac_flag           BOOLEAN,                  -- blacklist (true solo en FULLY_BLOCKED)
    pep_enviado         BOOLEAN,                  -- se ejecutó el paso PEP
    risk_level          VARCHAR(20),              -- Bajo | Medio | Alto (si se envió)
    last_step           BOOLEAN,
    http_status         INTEGER,
    detalle_error       VARCHAR(1000),
    actor_id            VARCHAR(64),
    actor_nombre        VARCHAR(160),             -- denormalizado: quién cerró, legible
    actor_tipo          VARCHAR(10),              -- USER | SYSTEM (flujo automático)
    ocurrido_en         TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (cierre_id)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
COMPOUND SORTKEY (ocurrido_en, canal);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Hecho: historial de status / estado / prioridad / asignación del caso
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.caso_historial (
    historial_id        VARCHAR(80)   NOT NULL,   -- numero_caso + campo + en
    numero_caso         VARCHAR(20)   NOT NULL,
    campo               VARCHAR(20)   NOT NULL,   -- STATUS | ESTADO | PRIORIDAD | ASIGNACION
    valor_anterior      VARCHAR(80),
    valor_nuevo         VARCHAR(80),
    actor_id            VARCHAR(64),
    actor_tipo          VARCHAR(10),
    ocurrido_en         TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (historial_id)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
SORTKEY (ocurrido_en);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Catálogo: categorías de delito que retienen el caso del flujo automático
--    (espejo de services/delitosSensibles.ts — futuro sub-catálogo con detalle)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.categoria_sensible (
    categoria_id        VARCHAR(40)   NOT NULL,
    label               VARCHAR(80)   NOT NULL,
    patron              VARCHAR(120),             -- patrón de match usado en la app
    activo              BOOLEAN       DEFAULT TRUE,
    vigente_desde       TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (categoria_id)
)
DISTSTYLE ALL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Auditoría del MANTENEDOR: quién prendió/apagó el flujo automático
--    Clave para compliance: deja registro de quién habilitó la automatización.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colas_trabajo.config_flujo_historial (
    config_id           VARCHAR(80)   NOT NULL,   -- cola + en
    cola                VARCHAR(20)   NOT NULL,   -- ofac | remesa
    habilitado          BOOLEAN,
    paises_habilitados  VARCHAR(80),              -- 'CL' / 'CL,CO'
    cerrar_sf           BOOLEAN,
    cerrar_admin        BOOLEAN,
    tipologias          SUPER,                    -- mapeo conclusión → tipología
    actor_id            VARCHAR(64),
    actor_nombre        VARCHAR(160),
    ocurrido_en         TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (config_id)
)
DISTSTYLE ALL
SORTKEY (ocurrido_en);
