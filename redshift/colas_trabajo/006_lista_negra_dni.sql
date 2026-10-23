-- ============================================================================
--  colas_trabajo.lista_negra_dni — los «Bloqueado» de la cola OFAC que entran a
--  la lista negra de DNI de Admin G66 (decisión de Benjamín, 23-10-2026)
--
--  Una fila por intento, sea cual sea el resultado. La escribe el Worker (paso 6
--  de /admin/customer-status y la carga de históricos), con el actor verificado
--  —el ID token del analista o el secreto del flujo automático—, y la recupera
--  el respaldo diario (colas-sync) desde el evento LISTA_NEGRA_DNI del caso.
--
--  Es lo que pasó en la COLA. Lo que pasó en Admin (el cambio, el registro, la
--  respuesta) vive en `listas_negras`, y `cambio_id` vincula los dos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS colas_trabajo.lista_negra_dni (
    cambio_id           VARCHAR(64)   NOT NULL,   -- = listas_negras.cambio.cambio_id
    numero_caso         VARCHAR(20)   NOT NULL,
    caso_id             VARCHAR(64),
    id_interno_usuario  BIGINT,                   -- customerId en Admin
    dni                 VARCHAR(64),              -- solo letras y dígitos, en mayúsculas
    country_code        CHAR(2),
    tipologia           VARCHAR(40),              -- fully_blocked
    resultado           VARCHAR(20),              -- AGREGADO | ACTIVADO | YA_ACTIVO | ERROR
    detalle             VARCHAR(1024),            -- el motivo de un ERROR
    flujo               VARCHAR(64),              -- colas_trabajo.ofac.bloqueado.{manual|automatico|historico}
    automatico          BOOLEAN,
    actor_email         VARCHAR(256),
    actor_nombre        VARCHAR(256),
    actor_uid           VARCHAR(128),
    ocurrido_en         TIMESTAMP,
    cargado_en          TIMESTAMP     DEFAULT SYSDATE,
    PRIMARY KEY (cambio_id)
)
DISTSTYLE KEY
DISTKEY (numero_caso)
SORTKEY (ocurrido_en);
