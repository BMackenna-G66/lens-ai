-- El caso de la cola que originó el cambio: los «Bloqueado» de la cola OFAC
-- entran a la lista negra de DNI (decisión de Benjamín, 23-10-2026). Vacío en
-- los cambios del módulo, que no vienen de un caso.
--
-- Una sentencia por columna: Redshift agrega de a una.

ALTER TABLE listas_negras.cambio ADD COLUMN numero_caso VARCHAR(20);

ALTER TABLE listas_negras.cambio ADD COLUMN caso_id VARCHAR(64);
