// lens-flujo-autonomo: un cierre automático «Bloqueado» de la cola OFAC manda
// el paso 6 (lista negra de DNI) con el secreto de sistema, y deja el evento
// LISTA_NEGRA_DNI en la auditoría del caso, SIN el DNI.
//
// Contra un Firestore EN MEMORIA y con `fetch` simulado: no toca producción.
//
// Correr:
//   npx esbuild aws/flujo-autonomo/src/index.ts --bundle --platform=node --format=esm \
//     --alias:firebase-admin/app=./test/fakes/firebaseApp.mjs \
//     --alias:firebase-admin/firestore=./test/fakes/firestore.mjs \
//     --alias:@aws-sdk/client-eventbridge=./test/fakes/eventbridge.mjs \
//     --define:import.meta.env=process.env --outfile=test/flujoAutonomo.bundle.mjs
//   node test/flujoAutonomoListaNegra.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';

process.env.EMPRESADOCS_PROXY_URL = 'https://proxy.prueba';
process.env.FIREBASE_SA_JSON = Buffer.from('{"project_id":"prueba"}').toString('base64');
process.env.LISTA_NEGRA_SISTEMA_SECRET = 'secreto-sistema';

const store = (globalThis.__FAKE_FS ??= new Map());
const C = 'casos_sf';
const SCREENING = (decision) => ({ schemaVersion: 3, estado: 'ok', decision, coincidencias: [], pep: false });

function sembrar() {
  store.clear();
  const caso = (n, decision, extra = {}) => ({
    numeroCaso: n, asunto: 'Coincidencia OFAC', pais: 'Chile', statusCaso: 'ABIERTO',
    datos: { 'Id interno del usuario': '555' + n.slice(-3), 'Número de DNI': '11.111.111-1' },
    screening: SCREENING(decision), ...extra,
  });
  store.set(`${C}/90000021`, caso('90000021', 'BLOQUEAR'));                  // Bloqueado: paso 6
  store.set(`${C}/90000022`, caso('90000022', 'LIBERAR'));                   // Liberar: sin paso 6
  store.set('config/flujoAutomatico', {
    ofac: { enabled: true, paises: { CL: true }, cerrarSF: false, cerrarAdmin: true,
            tipoLiberarNormal: 'liberar_normal', tipoLiberarUcr: 'liberar_ucr', tipoBloquear: 'fully_blocked' },
    remesa: { enabled: false, paises: {}, cerrarSF: false, cerrarAdmin: false, tipoLiberar: 'liberar' },
  });
}

const pedidos = [];
const logs = [];
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
  if (String(url).endsWith('/colas/log')) { logs.push(...body.eventos); return json({ ok: body.eventos.length }); }
  if (String(url).endsWith('/admin/customer-status')) {
    pedidos.push({ body, headers: init.headers });
    const steps = body.listaNegraDni ? { listaNegraDni: {
      resultado: 'AGREGADO', cambioId: 'cambio-prueba', flujo: 'colas_trabajo.ofac.bloqueado.automatico', countryCode: 'CL',
      tipologia: 'fully_blocked', automatico: true, ocurridoEn: '2026-10-23T18:00:00.000Z', registro: 'ok', colas: true,
      actor: { email: 'sistema:lens-flujo-autonomo', nombre: 'Flujo automático OFAC', uid: 'lens-flujo-autonomo' } } } : {};
    return json({ ok: true, results: [{ customerId: body.customerIds?.[0], ok: true, steps }] });
  }
  throw new Error(`fetch no esperado: ${url}`);
};

const { handler } = await import('./flujoAutonomo.bundle.mjs');
sembrar();
await handler(undefined, {});

let ok = 0;
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };
const bloqueado = pedidos.find(p => p.body.customerIds[0] === '555021');
const liberado = pedidos.find(p => p.body.customerIds[0] === '555022');

console.log('El pedido a /admin/customer-status:');
prueba('el «Bloqueado» lleva la entrada del paso 6 y el secreto de sistema', () => {
  assert.ok(bloqueado, 'no se cerró el caso Bloqueado');
  assert.deepEqual(bloqueado.body.listaNegraDni, {
    customerId: '555021', dni: '11.111.111-1', countryCode: 'CL', numeroCaso: '90000021', casoId: '90000021',
    idInternoUsuario: '555021', tipologia: 'fully_blocked' });
  assert.equal(bloqueado.headers['x-lens-sistema'], 'secreto-sistema');
  assert.equal(bloqueado.headers.Authorization, undefined);
});
prueba('un «Liberar» no lleva nada nuevo: el pedido de siempre', () => {
  assert.ok(liberado);
  assert.equal('listaNegraDni' in liberado.body, false);
  assert.equal(liberado.headers['x-lens-sistema'], undefined);
});

console.log('La auditoría del caso:');
const auditoria = [...store.entries()].filter(([k]) => k.startsWith(`${C}/90000021/auditoria/`)).map(([, v]) => v);
const ev = auditoria.find(e => e.tipo === 'LISTA_NEGRA_DNI');
prueba('queda el evento LISTA_NEGRA_DNI, de sistema, con el resultado y el cambio', () => {
  assert.ok(ev, JSON.stringify(auditoria.map(e => e.tipo)));
  assert.equal(ev.actorTipo, 'SYSTEM');
  assert.equal(ev.metadata.resultado, 'AGREGADO');
  assert.equal(ev.metadata.cambioId, 'cambio-prueba');
  assert.equal(ev.metadata.automatico, true);
  assert.equal(ev.metadata.idInternoUsuario, '555021');
});
prueba('SIN el DNI: la auditoría no guarda DNI', () => {
  assert.doesNotMatch(JSON.stringify(ev), /11\.111\.111|111111111/);
});
prueba('el evento se espeja en /colas/log, también sin el DNI', () => {
  const espejo = logs.find(l => l.tabla === 'evento_auditoria' && l.datos.tipo === 'LISTA_NEGRA_DNI');
  assert.ok(espejo);
  assert.doesNotMatch(JSON.stringify(espejo), /11\.111\.111|111111111/);
});
prueba('el «Liberar» no deja evento de lista negra', () => {
  const del2 = [...store.entries()].filter(([k]) => k.startsWith(`${C}/90000022/auditoria/`)).map(([, v]) => v.tipo);
  assert.ok(!del2.includes('LISTA_NEGRA_DNI'), JSON.stringify(del2));
});

console.log(`\n${ok} pruebas OK`);
