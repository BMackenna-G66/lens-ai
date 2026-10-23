// Tabla de estados del área «Análisis de causa (IA)» (§4.2 del contrato con el
// scraper de PJUD) y armado del caso que Lens encola (§3.1).
//
// La regla que no se puede romper: `Incompleta` y `Fallida` NUNCA se leen como
// «sin antecedentes». Es el bug del sistema heredado: 16 de 33 resúmenes que
// decían «0 causas» venían de corridas fallidas.
//
// Correr:
//   npx esbuild services/pjudScraper.ts --bundle --format=esm --platform=node \
//     --outfile=test/pjud.bundle.mjs --log-level=warning
//   node test/pjudEstados.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';
import { estadoAnalisisPjud, armarCasoScraper, rutNormalizado, fechaIso, motivoCoincidencia } from './pjud.bundle.mjs';

const doc = (x = {}) => ({ en_proceso: null, documentacion: null, analisis: null, resuelto_en: null, ...x });
const docu = (estado, x = {}) => ({ estado, error: null, ultimo_error: null, causas_sin_verificar: [], avisos_pjud: [], documentos_borrados_en: null, ...x });
const analisis = { texto: 'RUC 1900000000-0: condena; el imputado es el cliente.', generado: '2026-10-23T10:00:00Z' };
const DICE_QUE_NO_HAY = /^(?!.*no equivale).*(sin antecedentes|sin causas|0 causas|no tiene antecedentes)/i;

let ok = 0;
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

console.log('Tabla de estados (§4.2):');
prueba('sin documento en scraper_casos: nada', () => {
  assert.equal(estadoAnalisisPjud(null).tipo, 'nada');
});
prueba('en_proceso y sin análisis: «Analizando…» y se sigue consultando', () => {
  const e = estadoAnalisisPjud(doc({ en_proceso: { tipo: 'caso_completo', estado: 'en_cola' } }));
  assert.equal(e.tipo, 'analizando');
  assert.match(e.titulo, /Analizando la documentación de PJUD/);
  assert.equal(e.enCurso, true);
  assert.equal(e.texto, null);
});
prueba('en_proceso y con análisis: el texto, «actualizándose…»', () => {
  const e = estadoAnalisisPjud(doc({ en_proceso: { tipo: 'reanalizar' }, analisis, documentacion: docu('Completada') }));
  assert.equal(e.tipo, 'actualizando');
  assert.match(e.titulo, /actualizándose/);
  assert.equal(e.texto, analisis.texto);
  assert.equal(e.enCurso, true);
});
prueba('Completada: el texto y la fecha, sin seguir consultando', () => {
  const e = estadoAnalisisPjud(doc({ analisis, documentacion: docu('Completada') }));
  assert.equal(e.tipo, 'completada');
  assert.equal(e.texto, analisis.texto);
  assert.equal(e.generado, analisis.generado);
  assert.equal(e.enCurso, false);
  assert.equal(e.aviso, null);
});
prueba('Incompleta: el texto CON un aviso visible de causas sin verificar', () => {
  const e = estadoAnalisisPjud(doc({ analisis, documentacion: docu('Incompleta', { causas_sin_verificar: [{ ruc: '1800000000-1' }] }) }));
  assert.equal(e.tipo, 'incompleta');
  assert.equal(e.texto, analisis.texto);
  assert.match(e.aviso, /1 causa\(s\) sin verificar \(1800000000-1\)/);
  assert.match(e.aviso, /no se sabe si hay antecedentes/);
});
prueba('Fallida: «No se pudo obtener la documentación», el error y los avisos de PJUD', () => {
  const e = estadoAnalisisPjud(doc({ documentacion: docu('Fallida', { error: 'bloqueo_waf', avisos_pjud: ['Mantención programada'] }) }));
  assert.equal(e.tipo, 'fallida');
  assert.equal(e.titulo, 'No se pudo obtener la documentación');
  assert.equal(e.error, 'bloqueo_waf');
  assert.deepEqual(e.avisosPjud, ['Mantención programada']);
  assert.equal(e.texto, null);
});
prueba('resuelto_en: «Caso resuelto: documentos borrados»', () => {
  const e = estadoAnalisisPjud(doc({ resuelto_en: '2026-10-24T00:00:00Z', analisis, documentacion: docu('Completada') }));
  assert.equal(e.tipo, 'resuelto');
  assert.equal(e.titulo, 'Caso resuelto: documentos borrados');
});
prueba('re-corrida fallida con resultado anterior: se conserva y se avisa el último error', () => {
  const e = estadoAnalisisPjud(doc({ analisis, documentacion: docu('Completada', { ultimo_error: 'PJUD no respondió' }) }));
  assert.equal(e.tipo, 'completada');
  assert.match(e.aviso, /La última corrida falló: PJUD no respondió/);
});

console.log('Nunca «sin antecedentes»:');
for (const [nombre, d] of [
  ['Incompleta sin texto', doc({ documentacion: docu('Incompleta') })],
  ['Incompleta con texto', doc({ analisis, documentacion: docu('Incompleta', { causas_sin_verificar: ['1800000000-1'] }) })],
  ['Fallida', doc({ documentacion: docu('Fallida') })],
  ['Fallida con error vacío', doc({ documentacion: docu('Fallida', { error: '' }) })],
  ['sin documentación todavía', doc()],
]) {
  prueba(`${nombre}: ninguna línea dice que no hay antecedentes`, () => {
    const e = estadoAnalisisPjud(d);
    for (const t of [e.titulo, e.texto, e.aviso, e.error]) if (t) assert.doesNotMatch(t, DICE_QUE_NO_HAY, t);
  });
}

console.log('Armado del caso (§3.1):');
prueba('RUT con guion y DV, con o sin puntos, con K', () => {
  assert.equal(rutNormalizado('12.345.678-5'), '12345678-5');
  assert.equal(rutNormalizado('123456785'), '12345678-5');
  assert.equal(rutNormalizado('9.876.543-k'), '9876543-K');
  assert.equal(rutNormalizado('no es un rut'), null);
  assert.equal(rutNormalizado(''), null);
});
prueba('fecha DD/MM/AAAA → AAAA-MM-DD', () => {
  assert.equal(fechaIso('10/04/2019'), '2019-04-10');
  assert.equal(fechaIso('2/3/2019'), '2019-03-02');
  assert.equal(fechaIso('basura'), null);
});
prueba('motivo_coincidencia: retenido por delito y retenido por otra cosa', () => {
  const co = [{ tipo: 'Estafas y otras defraudaciones', detalle: 'RUC 1900000000-0' }];
  assert.equal(motivoCoincidencia('delito_sensible', ['Defraudaciones'], co), 'regcheq · Defraudaciones');
  assert.equal(motivoCoincidencia('pep', ['PEP'], co), 'PEP · además regcheq: Defraudaciones');
  assert.equal(motivoCoincidencia('pais_apagado', [], [{ tipo: 'Hurto simple', detalle: 'RUC 1700000000-2' }]),
    'país deshabilitado · además regcheq: Hurto simple');
});
prueba('sin causas con RUC, o sin RUT: no entra', () => {
  assert.equal(armarCasoScraper('1', { 'Número de DNI': '12.345.678-5' }, [{ tipo: 'X', detalle: 'sin rol' }], 'pep', []), null);
  assert.equal(armarCasoScraper('1', { 'Número de DNI': '' }, [{ tipo: 'X', detalle: 'RUC 1-1' }], 'pep', []), null);
});

console.log(`\n${ok} pruebas OK`);
