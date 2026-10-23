// services/listaNegraDni.ts: la regla de los «Bloqueado» de la cola OFAC que
// entran a la lista negra de DNI. Es la que usan el Worker (paso 6), la SPA
// (históricos) y el Lambda del flujo automático.
//
// Correr:
//   npx esbuild services/listaNegraDni.ts --bundle --format=esm --platform=node \
//     --outfile=test/listaNegraDni.bundle.mjs --log-level=warning
//   node test/listaNegraDni.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';
import * as ln from './listaNegraDni.bundle.mjs';

let ok = 0;
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };
const pais = p => (/chile|^cl$/i.test(p) ? 'CL' : /colombia|^co$/i.test(p) ? 'CO' : '');
const cola = a => ((a || '').toLowerCase() === 'coincidencia ofac' ? 'ofac' : 'otros');

console.log('El DNI:');
prueba('la clave compara sin puntos, guiones ni mayúsculas', () => {
  assert.equal(ln.claveDni('12.345.678-k'), '12345678K');
  assert.equal(ln.claveDni(' 12345678-K '), '12345678K');
  assert.equal(ln.claveDni(null), '');
});
prueba('las formas', () => {
  assert.equal(ln.formaDe('12.345.678-5'), 'puntos_guion');
  assert.equal(ln.formaDe('12345678-K'), 'guion');
  assert.equal(ln.formaDe('1.020.304.050'), 'puntos');
  assert.equal(ln.formaDe('1020304050'), 'compacto');
  assert.equal(ln.formaDe('12 345'), null);
});
prueba('la forma dominante se mide por país; un empate no decide', () => {
  const recs = [{ dni: '1.111.111-1', countryCode: 'CL' }, { dni: '2.222.222-2', countryCode: 'CL' },
                { dni: '3333333-3', countryCode: 'CL' }, { dni: '1020304050', countryCode: 'CO' }];
  assert.equal(ln.formaDominante(recs, 'CL'), 'puntos_guion');
  assert.equal(ln.formaDominante(recs, 'CO'), 'compacto');
  assert.equal(ln.formaDominante(recs, 'PE'), null);
  assert.equal(ln.formaDominante([{ dni: '1-1', countryCode: 'CL' }, { dni: '2.222-2', countryCode: 'CL' }], 'CL'), null);
});
prueba('escribir en cada forma; lo que no encaja va como vino', () => {
  assert.equal(ln.formatearDni('11111111-1', 'puntos_guion'), '11.111.111-1');
  assert.equal(ln.formatearDni('11.111.111-K', 'guion'), '11111111-K');
  assert.equal(ln.formatearDni('1.020.304.050', 'compacto'), '1020304050');
  assert.equal(ln.formatearDni('1020304050', 'puntos'), '1.020.304.050');
  assert.equal(ln.formatearDni('AB123', 'puntos'), 'AB123');
  assert.equal(ln.formatearDni(' 11111111-1 ', null), '11111111-1');
});

console.log('La decisión:');
const LISTA = [
  { dni: '12.345.678-5', countryCode: 'CL', blacklistStatus: true },
  { dni: '22.333.444-0', countryCode: 'CL', blacklistStatus: false, reason: 'antes' },
  { dni: '1020304050', countryCode: 'CO', blacklistStatus: true },
];
prueba('activo: no se toca, aunque esté escrito distinto', () => {
  assert.equal(ln.decidirDni('123456785', 'CL', LISTA).accion, 'ya_activo');
});
prueba('inactivo: se reactiva el registro que está', () => {
  const d = ln.decidirDni('22333444-0', 'cl', LISTA);
  assert.equal(d.accion, 'reactivar');
  assert.equal(d.registro.dni, '22.333.444-0');
});
prueba('el mismo DNI en otro país es otro registro', () => {
  assert.equal(ln.decidirDni('1020304050', 'CL', LISTA).accion, 'agregar');
});
prueba('nuevo: se agrega escrito como los de su país', () => {
  assert.deepEqual(ln.decidirDni('11111111-1', 'CL', LISTA), { accion: 'agregar', dniAdmin: '11.111.111-1', forma: 'puntos_guion' });
});
prueba('sin DNI o sin país: error con su motivo', () => {
  assert.deepEqual(ln.decidirDni('', 'CL', LISTA), { accion: 'error', motivo: 'El caso no tiene DNI.' });
  assert.match(ln.decidirDni('1', '', LISTA).motivo, /no tiene un país reconocido/);
});
prueba('solo un Bloqueado de la cola OFAC', () => {
  assert.equal(ln.esBloqueadoOfac('ofac', 'fully_blocked'), true);
  assert.equal(ln.esBloqueadoOfac('otros', 'fully_blocked'), false);
  assert.equal(ln.esBloqueadoOfac('ofac', 'liberar_ucr'), false);
  assert.equal(ln.esBloqueadoOfac('mixta', 'fully_blocked'), false);
});
prueba('del resultado de listas_negras al de colas_trabajo', () => {
  assert.deepEqual(['CREADO', 'ACTIVADO', 'OMITIDO_YA_EXISTE_ACTIVO', 'ERROR', 'SIN_CONFIRMAR'].map(ln.resultadoColas),
    ['AGREGADO', 'ACTIVADO', 'YA_ACTIVO', 'ERROR', 'ERROR']);
});

console.log('Los históricos:');
const caso = (id, x = {}) => ({ id, numeroCaso: id, asunto: 'Coincidencia OFAC', pais: 'Chile',
  datos: { 'Id interno del usuario': '4000' + id.slice(-3), 'Número de DNI': '1-9' },
  cierres: { admin: { ok: true, tipologia: 'fully_blocked', en: '2026-10-01T00:00:00Z' } }, ...x });
prueba('solo OFAC, con el cierre en Admin ok y tipología fully_blocked', () => {
  const filas = ln.filasHistoricas([
    caso('09000001'),
    caso('09000002', { asunto: 'DETIENE TX 1' }),
    caso('09000003', { cierres: { admin: { ok: false, tipologia: 'fully_blocked' } } }),
    caso('09000004', { cierres: { admin: { ok: true, tipologia: 'liberar_normal' } } }),
  ], cola, pais);
  assert.deepEqual(filas.map(f => f.numeroCaso), ['09000001']);
  assert.deepEqual(filas[0], { customerId: '4000001', dni: '1-9', countryCode: 'CL', numeroCaso: '09000001',
    casoId: '09000001', idInternoUsuario: '4000001', tipologia: 'fully_blocked' });
});
prueba('uno por cliente: el cierre más reciente', () => {
  const filas = ln.filasHistoricas([
    caso('09000010', { datos: { 'Id interno del usuario': '777', 'Número de DNI': '1-9' } }),
    caso('09000011', { datos: { 'Id interno del usuario': '777', 'Número de DNI': '1-9' },
                       cierres: { admin: { ok: true, tipologia: 'fully_blocked', en: '2026-10-05T00:00:00Z' } } }),
  ], cola, pais);
  assert.deepEqual(filas.map(f => f.numeroCaso), ['09000011']);
});
prueba('sin id interno: el cliente es su DNI y país; sin nada, cada caso es uno', () => {
  const sinId = (id, dni) => caso(id, { datos: { 'Número de DNI': dni } });
  // «5-5» y «5.5» son el mismo DNI: con la misma fecha de cierre queda el primero.
  const filas = ln.filasHistoricas([sinId('09000020', '5-5'), sinId('09000021', '5.5'), sinId('09000022', ''), sinId('09000023', '')], cola, pais);
  assert.deepEqual(filas.map(f => f.numeroCaso), ['09000020', '09000022', '09000023']);
});

console.log('La auditoría del caso:');
const PASO = { resultado: 'AGREGADO', cambioId: 'c-1', flujo: 'colas_trabajo.ofac.bloqueado.manual', countryCode: 'CL',
  tipologia: 'fully_blocked', automatico: false, ocurridoEn: '2026-10-23T18:00:00.000Z', registro: 'ok',
  actor: { email: 'analista@global66.com', nombre: 'Analista', uid: 'u-1' } };
const ENTRADA = { customerId: '4000001', dni: '11.111.111-1', countryCode: 'CL', numeroCaso: '09000001', casoId: '09000001',
  idInternoUsuario: '4000001', tipologia: 'fully_blocked' };
prueba('la metadata trae todo lo de la fila de colas, MENOS el DNI', () => {
  const m = ln.metadataAuditoria(PASO, ENTRADA);
  assert.deepEqual(Object.keys(m).sort(), ['actorEmail', 'actorNombre', 'actorUid', 'automatico', 'cambioId', 'casoId',
    'countryCode', 'detalle', 'flujo', 'idInternoUsuario', 'ocurridoEn', 'registro', 'resultado', 'tipologia']);
  assert.doesNotMatch(JSON.stringify(m), /11\.111\.111|111111111/);
});
prueba('sin resultado (no corrió o siguió después) no hay evento', () => {
  assert.equal(ln.metadataAuditoria({ omitido: 'sin_actor_verificado' }, ENTRADA), null);
  assert.equal(ln.metadataAuditoria({ en_curso: true }, ENTRADA), null);
  assert.equal(ln.metadataAuditoria(undefined, ENTRADA), null);
});
prueba('el resumen para la pantalla', () => {
  assert.equal(ln.resumenPaso6(PASO), 'Lista negra de DNI: agregado');
  assert.equal(ln.resumenPaso6({ resultado: 'ERROR', detalle: 'El caso no tiene DNI.' }), 'Lista negra de DNI: error (El caso no tiene DNI.)');
  assert.match(ln.resumenPaso6({ omitido: 'sin_actor_verificado' }), /carga de históricos/);
  assert.equal(ln.resumenPaso6({ omitido: 'no es un cierre Bloqueado de la cola OFAC' }), null);
});

console.log(`\n${ok} pruebas OK`);
