// lens-flujo-autonomo de punta a punta, contra un Firestore EN MEMORIA y con
// `fetch` simulado: no toca producción ni llama a nadie.
//
// Prueba lo que se arregló el 15-10-2026:
//   1. Un documento sin datos (sin statusCaso) NO vacía la cola. Antes, con uno
//      solo, la corrida leía los 2.000 casos más viejos y salía con 0 en cola.
//   2. Un caso que se borra en la Bandeja durante la corrida NO se recrea. Antes
//      el `set(merge)` del screening lo recreaba con un solo campo, y ese
//      documento era el del punto 1.
//   3. Cada cierre se espeja en Redshift (`/colas/log`) con automatico = true y
//      con la MISMA clave que arma el respaldo diario desde Firestore.
//
// Correr:
//   npx esbuild aws/flujo-autonomo/src/index.ts --bundle --platform=node --format=esm \
//     --alias:firebase-admin/app=./test/fakes/firebaseApp.mjs \
//     --alias:firebase-admin/firestore=./test/fakes/firestore.mjs \
//     --alias:@aws-sdk/client-eventbridge=./test/fakes/eventbridge.mjs \
//     --define:import.meta.env=process.env --outfile=test/flujoAutonomo.bundle.mjs
//   node test/flujoAutonomoCola.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';

process.env.EMPRESADOCS_PROXY_URL = 'https://proxy.prueba';
process.env.FIREBASE_SA_JSON = Buffer.from('{"project_id":"prueba"}').toString('base64');

const store = (globalThis.__FAKE_FS ??= new Map());
const C = 'casos_sf';

// ── Fixtures ────────────────────────────────────────────────────────────────
const SCREENING_LIMPIO = { schemaVersion: 3, estado: 'ok', decision: 'LIBERAR', coincidencias: [], pep: false };

function sembrar() {
  store.clear();
  // 2.100 casos viejos y cerrados: más que los 2.000 que leía la "lectura completa".
  for (let i = 0; i < 2100; i++) {
    const n = String(10000000 + i);
    store.set(`${C}/${n}`, { numeroCaso: n, asunto: 'Coincidencia OFAC', pais: 'Chile', statusCaso: 'CERRADO' });
  }
  // El documento huérfano: solo el screening del beneficiario, sin statusCaso.
  store.set(`${C}/90000001`, { screeningBeneficiario: { estado: 'ok', schemaVersion: 3 } });
  // Tres abiertos, con los números más altos.
  const ofac = n => ({
    numeroCaso: n, asunto: 'Coincidencia OFAC', pais: 'Chile', statusCaso: 'ABIERTO',
    datos: { 'Id interno del usuario': '555' + n.slice(-3) }, screening: SCREENING_LIMPIO,
  });
  store.set(`${C}/90000010`, ofac('90000010'));
  store.set(`${C}/90000011`, ofac('90000011'));     // se borra a mitad de la corrida
  store.set(`${C}/90000012`, {
    numeroCaso: '90000012', asunto: 'DETIENE TX 777001', pais: 'Chile', statusCaso: 'ABIERTO',
    screeningBeneficiario: { schemaVersion: 3, estado: 'ok', flujo: 'CL', samePerson: true },
  });
  // Un caso importado SIN statusCaso (el import de la app no lo escribe): se cura.
  store.set(`${C}/90000013`, { ...ofac('90000013'), statusCaso: undefined });
  store.set('config/flujoAutomatico', {
    ofac: { enabled: true, paises: { CL: true }, cerrarSF: true, cerrarAdmin: true,
            tipoLiberarNormal: 'liberar_normal', tipoLiberarUcr: 'liberar_ucr', tipoBloquear: 'fully_blocked' },
    remesa: { enabled: true, paises: { CL: true }, cerrarSF: true, cerrarAdmin: true,
              tipoLiberar: 'liberar', samePerson: true },
  });
}

// ── fetch simulado ──────────────────────────────────────────────────────────
const logs = [];
const llamadas = [];
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  llamadas.push({ url: String(url), body });
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
  if (String(url).endsWith('/colas/log')) { logs.push(...body.eventos); return json({ ok: body.eventos.length }); }
  if (String(url).endsWith('/salesforce/case-update')) {
    // El analista borra el caso 90000011 en la Bandeja justo mientras se cierra.
    if (body.CaseNumber === '90000011') store.delete(`${C}/90000011`);
    return json({ success: true });
  }
  if (String(url).endsWith('/admin/customer-status')) return json({ ok: true, results: [{ customerId: body.customerIds?.[0], ok: true, steps: {} }] });
  if (String(url).endsWith('/admin/transaction-status')) return json({ ok: true, results: [{ transactionId: '777001', ok: true }] });
  if (String(url).includes('/remesas/search')) return json({ rows: [{ transaction_id: 777001, beneficiary_name: 'Beneficiaria Prueba', amount_usd: 100 }] });
  throw new Error(`fetch no esperado: ${url}`);
};

const { handler } = await import('./flujoAutonomo.bundle.mjs');

// ── Corrida ─────────────────────────────────────────────────────────────────
sembrar();
const r = await handler(undefined, {});

let ok = 0;
const prueba = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

console.log('Cola con un documento huérfano:');
prueba('la cola NO sale vacía: ve los 3 OFAC y la remesa', () => {
  assert.equal(r.casosEnCola, 3, JSON.stringify({ modo: r.modoLectura, avisos: r.avisos }));
  assert.equal(r.remesa.enCola, 1);
});
prueba('un caso de verdad sin statusCaso se cura, entra a la cola y se procesa', () => {
  assert.ok(r.detalle.some(x => x.caseId === '90000013' && x.accion === 'cerrado'));
  assert.equal(store.get(`${C}/90000013`).statusCaso, 'CERRADO');
});
prueba('el huérfano se avisa y no se toca', () => {
  assert.ok(r.avisos.some(a => /NI datos del caso/.test(a)), JSON.stringify(r.avisos));
  assert.equal(store.get(`${C}/90000001`).statusCaso, undefined);
});

console.log('Caso borrado durante la corrida:');
prueba('no se recrea', () => assert.equal(store.has(`${C}/90000011`), false));
prueba('no cuenta como error: cerrado (el update a Salesforce ocurrió) con motivo', () => {
  const d = r.detalle.find(x => x.caseId === '90000011');
  assert.equal(d.accion, 'cerrado');
  assert.equal(d.motivo, 'caso_eliminado_durante_la_corrida');
  assert.equal(r.errores, 0);
});
prueba('el cierre en Salesforce que sí ocurrió queda espejado', () => {
  assert.ok(logs.some(l => l.tabla === 'cierre' && l.datos.numero_caso === '90000011' && l.datos.canal === 'SF'));
});
prueba('no se intentó Admin después de notar el borrado', () => {
  assert.equal(llamadas.filter(x => x.url.endsWith('/admin/customer-status') && x.body.customerIds?.[0] === '555011').length, 0);
});

console.log('Espejo en Redshift:');
const caso10 = store.get(`${C}/90000010`);
prueba('el caso normal quedó cerrado por los dos canales', () => {
  assert.equal(caso10.cierres.sf.ok, true);
  assert.equal(caso10.cierres.admin.ok, true);
  assert.equal(caso10.statusCaso, 'CERRADO');
});
for (const canal of ['sf', 'admin']) {
  prueba(`cierre ${canal.toUpperCase()}: automatico = true y la clave del respaldo diario`, () => {
    const en = caso10.cierres[canal].en.replace('T', ' ').replace('Z', '').slice(0, 23);
    const fila = logs.find(l => l.tabla === 'cierre' && l.datos.numero_caso === '90000010' && l.datos.canal === canal.toUpperCase());
    assert.ok(fila, 'falta la fila');
    assert.equal(fila.datos.automatico, true);
    assert.equal(fila.datos.actor_tipo, 'SYSTEM');
    assert.equal(fila.datos.cierre_id, `90000010|${canal.toUpperCase()}|${en}`);
    assert.equal(fila.datos.ocurrido_en, en);
  });
}
prueba('la fila de caso acompaña al cierre (faltaban ~860 casos en colas_trabajo.caso)', () => {
  assert.ok(logs.some(l => l.tabla === 'caso' && l.datos.numero_caso === '90000010'));
});
prueba('evento CIERRE_AUTOMATICO en la auditoría y en Redshift', () => {
  const evs = [...store.entries()].filter(([k]) => k.startsWith(`${C}/90000010/auditoria/`)).map(([, v]) => v);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].tipo, 'CIERRE_AUTOMATICO');
  assert.ok(logs.some(l => l.tabla === 'evento_auditoria' && l.datos.event_id === evs[0].eventId));
});
prueba('la remesa: cierre ADMIN espejado y liberación registrada', () => {
  assert.ok(logs.some(l => l.tabla === 'cierre' && l.datos.numero_caso === '90000012' && l.datos.canal === 'ADMIN' && l.datos.automatico === true));
  const lib = logs.find(l => l.tabla === 'liberacion_remesa' && l.datos.numero_caso === '90000012');
  assert.ok(lib);
  assert.equal(lib.datos.transaccion_id, '777001');
  assert.equal(lib.datos.automatico, true);
});
prueba('el resumen cuenta el espejo', () => {
  assert.ok(r.espejoRedshift.escritas > 0);
  assert.equal(r.espejoRedshift.fallidas, 0);
});

console.log('Espejo caído:');
{
  sembrar();
  store.delete(`${C}/90000001`);                    // sin huérfano esta vez
  store.delete(`${C}/90000013`);                    // ni casos sin statusCaso
  const fetchBueno = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).endsWith('/colas/log')
    ? new Response(JSON.stringify({ error: 'Redshift endpoint is not available' }), { status: 502 })
    : fetchBueno(url, init);
  const r2 = await handler(undefined, {});
  globalThis.fetch = fetchBueno;
  prueba('el cierre igual se hace y queda en Firestore', () => {
    assert.equal(store.get(`${C}/90000010`).cierres.admin.ok, true);
    assert.equal(r2.errores, 0);
  });
  prueba('las fallidas se cuentan (el respaldo diario las reescribe)', () => {
    assert.ok(r2.espejoRedshift.fallidas > 0);
    assert.equal(r2.espejoRedshift.escritas, 0);
  });
  prueba('sin huérfano no hay aviso ni barrido', () => {
    assert.equal(r2.avisos.length, 0);
    assert.equal(r2.modoLectura, 'consulta acotada');
  });
}

console.log(`\n${ok} pruebas OK`);
