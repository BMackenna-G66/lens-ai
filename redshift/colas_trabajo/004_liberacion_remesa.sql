-- Auditoría de la LIBERACIÓN DE REMESAS (cola Remesa de la Bandeja).
--
-- Va en el mismo schema que el resto (colas_trabajo) pero en su propia tabla, no
-- dentro de `cierre`. Motivo: `cierre` guarda UNA FILA POR CANAL de un cierre de
-- caso (SF / Admin) con las columnas del flujo OFAC (ofac_flag, pep_enviado,
-- risk_level, last_step). Una liberación de remesa es otra cosa: el objeto no es
-- el cliente sino la TRANSACCIÓN, y lo auditable es qué plata se soltó, con qué
-- evidencia y quién la soltó. Meterlo en `cierre` obligaría a dejar en NULL media
-- tabla en cada fila y a agregarle columnas de remesa que no aplican a OFAC.
--
-- Las filas de `cierre` se siguen escribiendo igual (una por canal): esta tabla
-- NO las reemplaza, las complementa con el detalle de la transacción.
--
-- Una fila = una liberación de un caso de remesa (los dos canales juntos).

CREATE TABLE IF NOT EXISTS colas_trabajo.liberacion_remesa (
    liberacion_id        VARCHAR(90)   NOT NULL,  -- numero_caso + transaccion + ocurrido_en
    numero_caso          VARCHAR(20)   NOT NULL,
    transaccion_id       VARCHAR(40),             -- nº de remesa en Admin
    tipologia            VARCHAR(40),             -- liberar
    automatico           BOOLEAN       DEFAULT FALSE,  -- TRUE = lo hizo el flujo

    -- Resultado por canal
    admin_ok             BOOLEAN,
    admin_omitido        BOOLEAN,                 -- ya estaba en el estado objetivo
    sf_ok                BOOLEAN,
    estado_anterior      VARCHAR(60),             -- UNDER_COMPLIANCE_REVIEW
    estado_nuevo         VARCHAR(60),             -- DATOS_VERIFICADOS

    -- Transacción liberada (denormalizado: el detalle completo vive en el modelo
    -- transaccional; acá va lo mínimo para auditar sin cruzar con otra fuente).
    beneficiario         VARCHAR(200),
    beneficiario_dni     VARCHAR(40),
    beneficiario_pais    VARCHAR(80),
    monto_usd            DECIMAL(18,2),
    tipo_envio           VARCHAR(80),

    -- Evidencia: el screening del beneficiario que respaldó la decisión
    screening_flujo      VARCHAR(10),             -- CL | CO | INTL | SIN_DATO
    screening_estado     VARCHAR(20),             -- ok | sin_causas | error | na
    screening_decision   VARCHAR(300),
    delitos_unicos       INTEGER,
    listas_coincidencia  VARCHAR(600),            -- listas con match, separadas por coma
    retenido_sensible    BOOLEAN,                 -- había delito sensible
    categorias_sensibles VARCHAR(200),

    -- Trazabilidad del cambio
    requested_by         VARCHAR(160),
    change_ticket        VARCHAR(80),
    detalle_error        VARCHAR(1000),
    actor_id             VARCHAR(64),
    actor_nombre         VARCHAR(160),
    actor_tipo           VARCHAR(10),             -- USER | SYSTEM
    ocurrido_en          TIMESTAMP,
    cargado_en           TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (liberacion_id)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
COMPOUND SORTKEY (ocurrido_en, transaccion_id);


-- Resumen operativo: qué se liberó, por quién y con qué evidencia.
-- DROP + CREATE (y no CREATE OR REPLACE): Redshift rechaza el replace si cambia
-- la lista de columnas de la vista.
DROP VIEW IF EXISTS colas_trabajo.v_liberacion_remesa;
CREATE VIEW colas_trabajo.v_liberacion_remesa AS
SELECT
    l.ocurrido_en::DATE                              AS dia,
    l.numero_caso,
    l.transaccion_id,
    l.beneficiario,
    l.beneficiario_pais,
    l.monto_usd,
    l.tipo_envio,
    l.screening_flujo,
    l.screening_decision,
    l.delitos_unicos,
    l.listas_coincidencia,
    l.retenido_sensible,
    l.categorias_sensibles,
    l.estado_anterior,
    l.estado_nuevo,
    CASE WHEN l.admin_ok AND l.sf_ok THEN 'COMPLETA'
         WHEN l.admin_ok             THEN 'SOLO ADMIN'
         WHEN l.sf_ok                THEN 'SOLO SF'
         ELSE 'FALLIDA' END                          AS estado_liberacion,
    l.automatico,
    l.actor_nombre,
    l.change_ticket
FROM colas_trabajo.liberacion_remesa l;


-- Control diario: cuántas remesas se liberaron, monto total y cuántas fueron
-- automáticas. Sirve para detectar saltos raros de volumen.
DROP VIEW IF EXISTS colas_trabajo.v_liberacion_remesa_diaria;
CREATE VIEW colas_trabajo.v_liberacion_remesa_diaria AS
SELECT
    ocurrido_en::DATE                                    AS dia,
    COUNT(*)                                             AS liberaciones,
    SUM(CASE WHEN admin_ok THEN 1 ELSE 0 END)            AS admin_ok,
    SUM(CASE WHEN sf_ok    THEN 1 ELSE 0 END)            AS sf_ok,
    SUM(CASE WHEN automatico THEN 1 ELSE 0 END)          AS automaticas,
    SUM(CASE WHEN retenido_sensible THEN 1 ELSE 0 END)   AS con_delito_sensible,
    SUM(COALESCE(monto_usd, 0))                          AS monto_usd_total
FROM colas_trabajo.liberacion_remesa
GROUP BY 1
ORDER BY 1 DESC;
