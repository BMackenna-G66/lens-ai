-- Schema `listas_negras`: el registro de los cambios a las listas negras de
-- Compliance de Admin G66 (DNI, dominios de correo y cuentas bancarias).
--
-- Lo escribe SOLO el Lambda `lens-listas-negras-log`, que espeja lo que el
-- Worker registró en DynamoDB (`lens-listas-negras-log`, el registro durable).
-- El actor sale siempre del ID token de Lens verificado en el Worker.
--
-- Cluster compliance-redshift-cluster, base `dev`. Se aplica una vez:
--   aws redshift-data batch-execute-statement --cluster-identifier compliance-redshift-cluster \
--     --database dev --db-user awsuser --sqls file://...   (o desde el editor de consultas)

CREATE SCHEMA IF NOT EXISTS listas_negras;

-- Una fila por operación: lo que se cambió en Admin y también lo que se
-- omitió (ya existía, sin cambios) o falló, con quién, cuándo y por qué flujo.
CREATE TABLE IF NOT EXISTS listas_negras.cambio (
  cambio_id        VARCHAR(64)   NOT NULL,   -- uuid de la operación
  ejecucion_id     VARCHAR(64),              -- la carga o edición completa
  lista            VARCHAR(16)   NOT NULL,   -- DNI | DOMINIO | CUENTA
  operacion        VARCHAR(16),              -- CREAR | EDITAR
  resultado        VARCHAR(40),              -- CREADO | ACTIVADO | DESACTIVADO | EDITADO |
                                             -- OMITIDO_YA_EXISTE_ACTIVO | OMITIDO_YA_EXISTE_INACTIVO |
                                             -- SIN_CAMBIOS | ERROR | SIN_CONFIRMAR
  registro_id      VARCHAR(64),              -- FK a registro
  clave            VARCHAR(512),             -- dni, dominio o número de cuenta, normalizado
  country_code     VARCHAR(8),
  country_name     VARCHAR(128),
  account_type     VARCHAR(32),
  admin_id         VARCHAR(64),              -- el id del registro en Admin, si lo tiene
  estado_anterior  BOOLEAN,
  estado_nuevo     BOOLEAN,
  reason_anterior  VARCHAR(1024),
  reason_nueva     VARCHAR(1024),
  http_status      INTEGER,
  error            VARCHAR(2048),
  body_enviado     SUPER,
  respuesta        SUPER,
  flujo            VARCHAR(128),             -- p. ej. lens.regcheq.listas_negras.carga
  servicio         VARCHAR(128),             -- la ruta del Worker
  actor_email      VARCHAR(256),
  actor_nombre     VARCHAR(256),
  actor_uid        VARCHAR(128),
  ocurrido_en      TIMESTAMP,
  cargado_en       TIMESTAMP,
  PRIMARY KEY (cambio_id)
)
DISTSTYLE AUTO
SORTKEY (ocurrido_en);

-- Todo lo que se agregó o cambió en una lista negra, una fila por dato. Se
-- RECALCULA desde `cambio`: no se escribe a mano.
--   registro_id = uuid5 de (lista, valor, country_code): el mismo dato da
--   siempre el mismo id.
--   flujo_alta / creado_*: el primer CREADO. En NULL si el registro ya estaba
--   en Admin antes de este registro y solo se editó.
--   activo / actualizado_*: el último cambio efectivo.
CREATE TABLE IF NOT EXISTS listas_negras.registro (
  registro_id        VARCHAR(64)   NOT NULL,
  lista              VARCHAR(16)   NOT NULL,
  valor              VARCHAR(512)  NOT NULL,
  country_code       VARCHAR(8),
  country_name       VARCHAR(128),
  account_type       VARCHAR(32),
  reason             VARCHAR(1024),
  admin_id           VARCHAR(64),
  activo             BOOLEAN,
  flujo_alta         VARCHAR(128),
  ejecucion_id_alta  VARCHAR(64),
  creado_por         VARCHAR(256),
  creado_en          TIMESTAMP,
  actualizado_por    VARCHAR(256),
  actualizado_en     TIMESTAMP,
  PRIMARY KEY (registro_id)
)
DISTSTYLE AUTO;

-- Cada registro con su último cambio, del tipo que sea.
CREATE OR REPLACE VIEW listas_negras.v_registro_ultimo_cambio AS
SELECT r.registro_id, r.lista, r.valor, r.country_code, r.country_name, r.account_type, r.reason,
       r.admin_id, r.activo, r.flujo_alta, r.ejecucion_id_alta, r.creado_por, r.creado_en,
       r.actualizado_por, r.actualizado_en,
       c.cambio_id   AS ultimo_cambio_id,
       c.resultado   AS ultimo_resultado,
       c.flujo       AS ultimo_flujo,
       c.actor_email AS ultimo_actor,
       c.ocurrido_en AS ultimo_cambio_en
FROM listas_negras.registro r
LEFT JOIN (
  SELECT registro_id, cambio_id, resultado, flujo, actor_email, ocurrido_en,
         ROW_NUMBER() OVER (PARTITION BY registro_id ORDER BY ocurrido_en DESC, cambio_id DESC) AS n
  FROM listas_negras.cambio
) c ON c.registro_id = r.registro_id AND c.n = 1;
