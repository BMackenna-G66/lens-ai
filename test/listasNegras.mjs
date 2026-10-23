// La lógica de `blacklist_cargar.py` y `blacklist_editar.py`, portada a
// services/listasNegras.ts. Los casos son los ejemplos del README de los scripts
// (README_listas_negras.md) y las reglas de su §4.
//
// Correr:
//   npx esbuild services/listasNegras.ts --bundle --format=esm --platform=node \
//     --outfile=test/listasNegras.bundle.mjs --log-level=warning
//   node test/listasNegras.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';
import * as ln from './listasNegras.bundle.mjs';

let ok = 0;
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };
const OP = { defaultReason: '', targetStatus: false, countries: { CO: 'Colombia', CL: 'Chile' } };

console.log('CSV (README §3):');
prueba('los tres ejemplos de carga del README', () => {
  assert.deepEqual(ln.parseCsv('dni,country_code,reason\n12345678,CO,Suplantación de identidad\n98765432-1,CL,Fraude documental\n'), [
    { dni: '12345678', country_code: 'CO', reason: 'Suplantación de identidad' },
    { dni: '98765432-1', country_code: 'CL', reason: 'Fraude documental' },
  ]);
  assert.deepEqual(ln.parseCsv('domain,reason\ntempmail.dev,Correos desechables'), [{ domain: 'tempmail.dev', reason: 'Correos desechables' }]);
  assert.deepEqual(ln.parseCsv('country_code,account_number,account_type,reason,enable\nCO,3001234567,Electronic,Fraude,\n,LT601010012345678901,,Phishing IBAN,'), [
    { country_code: 'CO', account_number: '3001234567', account_type: 'Electronic', reason: 'Fraude', enable: '' },
    { country_code: '', account_number: 'LT601010012345678901', account_type: '', reason: 'Phishing IBAN', enable: '' },
  ]);
});
prueba('BOM de Excel, encabezados en mayúscula y con espacios, CRLF', () => {
  assert.deepEqual(ln.parseCsv('﻿DNI , Country_Code,STATUS\r\n11223344,CO,false\r\n'), [{ dni: '11223344', country_code: 'CO', status: 'false' }]);
});
prueba('punto y coma (Excel en español) y tabulaciones (pegado desde Excel)', () => {
  assert.deepEqual(ln.parseCsv('domain;reason\nx.prueba;Phishing'), [{ domain: 'x.prueba', reason: 'Phishing' }]);
  assert.deepEqual(ln.parseCsv('domain\treason\nx.prueba\tPhishing, masivo'), [{ domain: 'x.prueba', reason: 'Phishing, masivo' }]);
});
prueba('comillas con comas adentro; columnas extra se conservan pero no estorban', () => {
  assert.deepEqual(ln.parseCsv('domain,reason,nota\nx.prueba,"Fraude, phishing ""masivo""",extra'),
    [{ domain: 'x.prueba', reason: 'Fraude, phishing "masivo"', nota: 'extra' }]);
});

console.log('Normalización (README §4):');
prueba('parse_bool: los valores aceptados y el error', () => {
  for (const v of ['true', '1', 'si', 'sí', 'S', 'activo', 'yes', 'Y']) assert.equal(ln.parseBool(v, false), true, v);
  for (const v of ['false', '0', 'no', 'N', 'inactivo']) assert.equal(ln.parseBool(v, true), false, v);
  assert.equal(ln.parseBool('', true), true);
  assert.equal(ln.parseBool(undefined, false), false);
  assert.throws(() => ln.parseBool('quizás', true), /Valor booleano no reconocido: quizás/);
});
prueba('dominio: minúsculas y lo que va después de @', () => {
  assert.equal(ln.normDomain('usuario@Trashmail.com'), 'trashmail.com');
  assert.equal(ln.normDomain(' .TempMail.dev. '), 'tempmail.dev');
});
prueba('cuenta: sin espacios y en mayúsculas', () => {
  assert.equal(ln.normAccount('lt 1234'), 'LT1234');
  assert.equal(ln.normAccount(' 300 123\t4567 '), '3001234567');
});
prueba('extract_list: lista directa o envuelta en data/content/…', () => {
  const r = [{ dni: '1' }];
  assert.deepEqual(ln.extractList(r), r);
  assert.deepEqual(ln.extractList({ data: r }), r);
  assert.deepEqual(ln.extractList({ data: { content: r } }), r);
  assert.deepEqual(ln.extractList({ blacklist: r }), r);
  assert.deepEqual(ln.extractList({ otra: r }), []);
});
prueba('países: tolerante al formato', () => {
  assert.deepEqual(ln.loadCountries([{ countryCode: 'co', countryName: 'Colombia' }, { code: 'CL', name: 'Chile' }, { iso2: 'PE' }]),
    { CO: 'Colombia', CL: 'Chile' });
  assert.deepEqual(ln.loadCountries({ data: [{ isoCode: 'MX', nameEs: 'México' }] }), { MX: 'México' });
});

console.log('Cargar (POST):');
prueba('los bodies del README, lista por lista', () => {
  assert.deepEqual(ln.buildBody('DNI', { dni: '12345678', country_code: 'co', reason: 'Fraude' }, OP.countries, '').body,
    { dni: '12345678', countryCode: 'CO', countryName: 'Colombia', reason: 'Fraude' });
  assert.deepEqual(ln.buildBody('DOMINIO', { domain: 'usuario@TempMail.dev' }, {}, 'Desechables').body,
    { email: 'tempmail.dev', reason: 'Desechables' });
  assert.deepEqual(ln.buildBody('CUENTA', { country_code: 'CO', account_number: '300 1234567', account_type: 'Electronic', reason: 'Fraude' }, {}, '').body,
    { countryCode: 'CO', accountNumber: '3001234567', accountType: 'Electronic', enable: true, reason: 'Fraude' });
  assert.deepEqual(ln.buildBody('CUENTA', { account_number: 'LT601010012345678901', reason: 'Phishing IBAN', enable: 'no' }, {}, '').body,
    { countryCode: null, accountNumber: 'LT601010012345678901', accountType: null, enable: false, reason: 'Phishing IBAN' });
});
prueba('errores de validación del README', () => {
  assert.throws(() => ln.buildBody('DNI', { dni: '1', country_code: 'CO' }, OP.countries, ''), /Falta reason/);
  assert.throws(() => ln.buildBody('DNI', { dni: '1', country_code: 'XX', reason: 'x' }, OP.countries, ''), /No se encontró countryName para XX/);
  assert.equal(ln.buildBody('DNI', { dni: '1', country_code: 'XX', reason: 'x', country_name: 'Equis' }, {}, '').body.countryName, 'Equis');
  assert.throws(() => ln.buildBody('DOMINIO', { domain: 'sinpunto', reason: 'x' }, {}, ''), /Dominio inválido/);
  assert.throws(() => ln.buildBody('CUENTA', { reason: 'x' }, {}, ''), /CUENTA requiere account_number/);
});
prueba('account_type por país (README §3)', () => {
  const t = (cc, tipo) => () => ln.buildBody('CUENTA', { country_code: cc, account_number: '1', account_type: tipo, reason: 'x' }, {}, '');
  for (const [cc, tipo] of [['CO', 'Electronic'], ['CL', 'Vista'], ['CL', 'RUT'], ['PE', 'Checking'], ['', 'Saving'], ['MX', 'Blockchain']]) t(cc, tipo)();
  assert.throws(t('CL', 'Electronic'), /account_type 'Electronic' no válido para país CL/);
  assert.throws(t('CO', 'Vista'), /no válido para país CO/);
  assert.throws(t('CO', 'saving'), /no válido/, 'respeta mayúsculas');
});
prueba('duplicados: activo, inactivo y la cuenta histórica sin país', () => {
  const plan = ln.planificar('cargar', 'CUENTA', [
    { country_code: 'CO', account_number: '3001234567', reason: 'x' },
    { country_code: 'CO', account_number: 'LT1', reason: 'x' },
    { country_code: 'CL', account_number: '999', reason: 'x' },
  ], [
    { id: 1, accountNumber: '3001234567', countryCode: 'CO', enable: true },
    { id: 2, accountNumber: 'lt 1', countryCode: null, enable: false },
  ], OP);
  assert.deepEqual(plan.map(p => [p.accion, p.resultado]), [['omitir', 'YA_EXISTE_ACTIVO'], ['omitir', 'YA_EXISTE_INACTIVO'], ['crear', 'DRY_RUN']]);
  assert.match(plan[1].detalle, /Para reactivarlo usar el modo Editar/);
  assert.equal(plan[1].adminId, '2');
});
prueba('dentro del mismo archivo: la segunda vez se omite, como en la corrida real', () => {
  const plan = ln.planificar('cargar', 'DOMINIO', [{ domain: 'x.prueba', reason: 'a' }, { domain: 'X.Prueba', reason: 'b' }], [], OP);
  assert.deepEqual(plan.map(p => [p.accion, p.resultado, !!p.repetida]), [['crear', 'DRY_RUN', false], ['omitir', 'YA_EXISTE_ACTIVO', true]]);
  assert.match(plan[1].detalle, /Repetido más arriba/);
});

console.log('Editar (PUT):');
const DNIS = [{ dni: '11223344', countryCode: 'CO', blacklistStatus: true, reason: 'r' }, { dni: '11223344', countryCode: 'PE', blacklistStatus: false }];
prueba('find_record: no existe, y la ambigüedad pide id', () => {
  assert.throws(() => ln.findRecord('DNI', { dni: '1', country_code: 'CO' }, DNIS), /No existe en la lista negra/);
  const cuentas = [{ id: 5, accountNumber: '1', countryCode: 'CO' }, { id: 6, accountNumber: '1', countryCode: 'CO' }];
  assert.throws(() => ln.findRecord('CUENTA', { account_number: '1' }, cuentas), /Coincidencia ambigua \(2 registros, ids=\[5, 6\]\)\. Usa la columna id/);
  assert.equal(ln.findRecord('CUENTA', { id: '6' }, cuentas).rec.id, 6);
});
prueba('find_record: la cuenta desempata por país', () => {
  const cuentas = [{ id: 5, accountNumber: '1', countryCode: 'CO' }, { id: 6, accountNumber: '1', countryCode: 'CL' }];
  assert.equal(ln.findRecord('CUENTA', { account_number: '1', country_code: 'cl' }, cuentas).rec.id, 6);
});
prueba('el ejemplo del README: desactivar 11223344 (CO)', () => {
  const [p] = ln.planificar('editar', 'DNI', ln.parseCsv('dni,country_code,status\n11223344,CO,false'), DNIS, OP);
  assert.deepEqual([p.accion, p.estadoAnterior, p.estadoNuevo], ['editar', 'ACTIVO', 'INACTIVO']);
  assert.deepEqual(p.body, { dni: '11223344', countryCode: 'CO', status: false });
});
prueba('status vacío usa el estado objetivo; sin cambios no manda PUT', () => {
  const plan = ln.planificar('editar', 'DNI', [{ dni: '11223344', country_code: 'PE' }], DNIS, { ...OP, targetStatus: false });
  assert.deepEqual([plan[0].accion, plan[0].resultado], ['sin_cambios', 'N/A']);
  assert.match(plan[0].detalle, /Sin cambios: ya está INACTIVO/);
});
prueba('dominio: la razón es obligatoria en el PUT y si falta se reutiliza la actual', () => {
  const doms = [{ id: 7, domain: 'x.prueba', blacklistStatus: true, reason: 'Actual' }, { id: 8, domain: 'y.prueba', blacklistStatus: true }];
  const [a] = ln.planificar('editar', 'DOMINIO', [{ domain: 'x.prueba' }], doms, OP);
  assert.deepEqual(a.body, { id: 7, status: false, reason: 'Actual' });
  const [b] = ln.planificar('editar', 'DOMINIO', [{ id: '8' }], doms, OP);
  assert.deepEqual([b.accion, b.error], ['error', 'DOMINIO exige reason en el PUT y el registro no tiene una; agrega reason.']);
  const [c] = ln.planificar('editar', 'DOMINIO', [{ domain: 'x.prueba', status: 'activo', reason: 'Nueva' }], doms, OP);
  assert.equal(c.accion, 'editar', 'cambiar solo la razón es un cambio');
});
prueba('cuenta: el objeto completo con id', () => {
  const [p] = ln.planificar('editar', 'CUENTA', [{ account_number: '300 1234567', status: 'false', account_type: 'Electronic' }],
    [{ id: 9, accountNumber: '3001234567', countryCode: 'CO', accountType: null, enable: true, reason: 'Fraude' }], OP);
  assert.deepEqual(p.body, { id: 9, countryCode: 'CO', accountNumber: '3001234567', accountType: 'Electronic', enable: false, reason: 'Fraude' });
});
prueba('la misma fila dos veces: la segunda ya no cambia nada', () => {
  const plan = ln.planificar('editar', 'DNI', [{ dni: '11223344', country_code: 'CO' }, { dni: '11223344', country_code: 'CO' }], DNIS, OP);
  assert.deepEqual(plan.map(p => p.accion), ['editar', 'sin_cambios']);
  assert.equal(DNIS[0].blacklistStatus, true, 'la lista original no se toca');
});

console.log('Conteos, plan y log:');
prueba('conteos y comparación de planes', () => {
  const plan = ln.planificar('cargar', 'DOMINIO', [{ domain: 'a.prueba', reason: 'x' }, { domain: 'mal', reason: 'x' }], [], OP);
  assert.deepEqual(ln.contar(plan), { total: 2, crear: 1, editar: 0, omitir: 0, sin_cambios: 0, error: 1 });
  assert.ok(ln.mismoPlan(plan, ln.planificar('cargar', 'DOMINIO', [{ domain: 'a.prueba', reason: 'x' }, { domain: 'mal', reason: 'x' }], [], OP)));
  assert.ok(!ln.mismoPlan(plan, ln.planificar('cargar', 'DOMINIO', [{ domain: 'a.prueba', reason: 'x' }, { domain: 'mal', reason: 'x' }], [{ domain: 'a.prueba', blacklistStatus: true }], OP)));
});
prueba('el log tiene las columnas de los scripts', () => {
  assert.equal(ln.csvLog('cargar', []).split('\r\n')[0], 'timestamp,lista,registro,paso,accion,status_http,resultado,detalle,error');
  assert.equal(ln.csvLog('editar', []).split('\r\n')[0],
    'timestamp,lista,registro,paso,accion,status_http,resultado,estado_anterior,estado_nuevo,detalle,error');
});
prueba('el log de cada paso: vista previa, real, omitido y error', () => {
  const [crear, omitir, error] = ln.planificar('cargar', 'DNI',
    [{ dni: '1', country_code: 'CO', reason: 'x' }, { dni: '2', country_code: 'CO', reason: 'x' }, { dni: '3' }],
    [{ dni: '2', countryCode: 'CO', blacklistStatus: false }], OP);
  assert.equal(ln.filasLog('cargar', 'DNI', crear)[0].accion, 'DRY_RUN POST /beneficiary/compliance/blacklist');
  assert.deepEqual(Object.entries(ln.filasLog('cargar', 'DNI', crear, { ok: true, status: 200, respuesta: { ok: 1 } })[0])
    .filter(([k]) => ['paso', 'accion', 'status_http', 'resultado'].includes(k)),
    [['paso', '2 - CREATE'], ['accion', 'POST /beneficiary/compliance/blacklist'], ['status_http', 200], ['resultado', 'OK']]);
  assert.equal(ln.filasLog('cargar', 'DNI', omitir)[0].resultado, 'YA_EXISTE_INACTIVO');
  assert.equal(ln.filasLog('cargar', 'DNI', error)[0].paso, 'ERROR');
  const [ed] = ln.planificar('editar', 'DNI', [{ dni: '11223344', country_code: 'CO' }], DNIS, OP);
  assert.deepEqual(ln.filasLog('editar', 'DNI', ed).map(f => f.paso), ['1 - LOOKUP', '2 - UPDATE']);
});
prueba('comillas y comas en el log quedan escapadas', () => {
  const csv = ln.csvLog('cargar', [{ registro: 'a,b', detalle: '{"x":"y"}' }]);
  assert.match(csv, /"a,b"/);
  assert.match(csv, /"\{""x"":""y""\}"/);
});
prueba('el resultado para el registro de Lens de lo que no llega a Admin', () => {
  const plan = ln.planificar('cargar', 'DNI', [{ dni: '2', country_code: 'CO', reason: 'x' }, { dni: '9' }],
    [{ dni: '2', countryCode: 'CO', blacklistStatus: true }], OP);
  assert.deepEqual(plan.map(ln.resultadoSinOperacion), ['OMITIDO_YA_EXISTE_ACTIVO', 'ERROR']);
});

console.log(`\n${ok} pruebas OK`);
