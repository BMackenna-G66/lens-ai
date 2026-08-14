-- Seed del catálogo de categorías sensibles (espejo de services/delitosSensibles.ts).
-- Idempotente: borra e inserta las 5 categorías vigentes.
--
-- Estas categorías RETIENEN el caso: nunca se cierra por el flujo automático,
-- ni en Salesforce ni en Admin, aunque la conclusión del motor diga "Liberar".

BEGIN;

DELETE FROM colas_trabajo.categoria_sensible
 WHERE categoria_id IN ('trafico', 'defraudaciones', 'armas', 'lavado', 'terrorismo');

-- `patron` es informativo (la app tiene el regex real en delitosSensibles.ts).
-- Se guarda sin backslashes para no depender del escapado de Redshift; ARMA se
-- evalúa en la app con límite de palabra para no matchear "alarma".
INSERT INTO colas_trabajo.categoria_sensible (categoria_id, label, patron, activo) VALUES
  ('trafico',        'Tráfico',            'TRAFIC',              TRUE),
  ('defraudaciones', 'Defraudaciones',     'DEFRAUD',             TRUE),
  ('armas',          'Armas',              'ARMA (límite palabra)', TRUE),
  ('lavado',         'Lavado de activos',  'LAVADO',              TRUE),
  ('terrorismo',     'Terrorismo',         'TERROR',              TRUE);

COMMIT;
