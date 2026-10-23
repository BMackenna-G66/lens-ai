// config/flujoAutomatico lo escriben dos pantallas, y ninguna puede pisar lo de
// la otra: el panel del flujo automático (ofac, remesa) y el switch del
// scraper de PJUD en Administración (solo pjud.*). Las dos usan
// setDoc(…, { merge: true }); acá se aplica la misma semántica de merge.
//
// Correr:
//   npx esbuild services/flujoConfigPayloads.ts --bundle --format=esm --platform=node \
//     --outfile=test/flujoConfigPayloads.bundle.mjs --log-level=warning
//   node test/flujoConfigPayloads.mjs

import assert from 'node:assert/strict';
import { payloadFlujoConfig, payloadSwitchPjud } from './flujoConfigPayloads.bundle.mjs';

// setDoc con merge: true de Firestore fusiona los mapas campo por campo.
const esMapa = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) out[k] = esMapa(v) && esMapa(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
};

const OFAC = { enabled: true, paises: { CL: true, CO: false }, cerrarSF: true, cerrarAdmin: true };
const REMESA = { enabled: false, paises: { CL: true }, cerrarSF: true, cerrarAdmin: true, tipoLiberar: 'liberar' };
const base = { ofac: OFAC, remesa: REMESA, actualizadoEn: '2026-10-01T00:00:00.000Z', actualizadoPor: 'Analista',
               pjud: { enabled: false, database: 'pjud' } };

let ok = 0;
const prueba = (n, fn) => { fn(); ok++; console.log('  ✓', n); };

prueba('el switch escribe solo pjud.enabled, quién y cuándo', () => {
  const p = payloadSwitchPjud(true, { email: 'lider@global66.com', nombre: 'Líder' }, new Date('2026-10-23T12:00:00Z'));
  assert.deepEqual(p, { pjud: { enabled: true, actualizadoPor: 'lider@global66.com', actualizadoEn: '2026-10-23T12:00:00.000Z' } });
});
prueba('prender desde Administración no toca ofac, remesa ni pjud.database', () => {
  const d = merge(base, payloadSwitchPjud(true, { email: 'lider@global66.com' }));
  assert.deepEqual(d.ofac, OFAC);
  assert.deepEqual(d.remesa, REMESA);
  assert.equal(d.pjud.database, 'pjud');
  assert.equal(d.pjud.enabled, true);
  assert.equal(d.actualizadoPor, 'Analista', 'el actualizadoPor de la raíz es del panel del flujo');
});
prueba('guardar desde el panel del flujo automático no borra pjud', () => {
  const prendido = merge(base, payloadSwitchPjud(true, { email: 'lider@global66.com' }));
  const cfg = { ofac: { ...OFAC, enabled: false }, remesa: REMESA };
  const d = merge(prendido, payloadFlujoConfig(cfg, { nombre: 'Otra analista' }));
  assert.equal(d.pjud.enabled, true);
  assert.equal(d.pjud.database, 'pjud');
  assert.equal(d.ofac.enabled, false);
  assert.ok(!('pjud' in payloadFlujoConfig(cfg)), 'el panel no manda la clave pjud');
});

console.log(`\n${ok} pruebas OK`);
