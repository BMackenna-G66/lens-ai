// lens-flujo-autonomo + scraper de PJUD, contra un Firestore EN MEMORIA y con
// `fetch` simulado. No toca producción ni llama a nadie.
//
// Lo que se prueba (condiciones de la auditoría del 23-10-2026):
//   1. Con el switch APAGADO, el resumen de la corrida es IDÉNTICO al de main
//      (se corre el bundle de main sobre el mismo escenario y se comparan).
//   2. Prendido: encola los retenidos de Chile con causas con RUC, una sola vez
//      (`auto-{caseId}` create-only), con el formato del contrato §3.1.
//   3. Borrado (§4.4): un caso cerrado o borrado en Lens recibe `borrar-{caseId}`
//      y `resuelto_en`, una sola vez.
//   4. Prendido y con la base `pjud` caída: cada caso se cierra o se retiene
//      igual que con el switch apagado, la corrida no falla y el error se cuenta.
//
// Correr:
//   B="npx esbuild --bundle --platform=node --format=esm --log-level=warning \
//      --alias:firebase-admin/app=./test/fakes/firebaseApp.mjs \
//      --alias:firebase-admin/firestore=./test/fakes/firestore.mjs \
//      --alias:@aws-sdk/client-eventbridge=./test/fakes/eventbridge.mjs \
//      --define:import.meta.env=process.env"
//   $B aws/flujo-autonomo/src/index.ts --outfile=test/flujoAutonomo.bundle.mjs
//   git show main:aws/flujo-autonomo/src/index.ts > aws/flujo-autonomo/src/index_main_tmp.ts
//   $B aws/flujo-autonomo/src/index_main_tmp.ts --outfile=test/flujoAutonomoMain.bundle.mjs
//   rm aws/flujo-autonomo/src/index_main_tmp.ts
//   node test/flujoAutonomoPjud.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.EMPRESADOCS_PROXY_URL = 'https://proxy.prueba';
process.env.FIREBASE_SA_JSON = Buffer.from('{"project_id":"prueba"}').toString('base64');
process.env.TRIGGER_SECRET = 'secreto-prueba';

const store = (globalThis.__FAKE_FS ??= new Map());
const C = 'casos_sf';
const MANUAL = { requestContext: {}, headers: { 'x-lens-trigger': 'secreto-prueba' } };

const screening = (decision, coincidencias, extra = {}) =>
  ({ schemaVersion: 3, estado: 'ok', fuente: 'Regcheq', decision, coincidencias, pep: false, ...extra });
const causa = (tipo, ruc, fecha = '10/04/2019') =>
  ({ tipo, detalle: `RUC ${ruc}`, estado: 'FALLADA O CONCLUIDA', fecha, fuente: 'Juzgado de Garantía de Prueba' });
const ofac = (n, pais, sc, datos = {}) => ({
  numeroCaso: n, asunto: 'Coincidencia OFAC', pais, statusCaso: 'ABIERTO', screening: sc,
  datos: { 'Id interno del usuario': '7' + n.slice(-3), 'Número de DNI': '11.111.111-1', Nombre: 'NOMBRE PRUEBA', Apellido: 'APELLIDO PRUEBA', ...datos },
});

function sembrar(pjud) {
  store.clear();
  // Retenido por delito sensible, con dos causas con RUC.
  store.set(`${C}/90000101`, ofac('90000101', 'Chile', screening('Revisar', [
    causa('Tráfico ilícito de estupefacientes', '1900000000-0'), causa('Estafas y otras defraudaciones', '1800000000-1', '02/11/2018')])));
  // Retenido por PEP, con una causa no sensible: entra con el motivo doble.
  store.set(`${C}/90000102`, ofac('90000102', 'Chile', screening('Liberar', [causa('Hurto simple', '1700000000-2')], { pep: true }),
    { 'Número de DNI': '222222222', Apellido: 'correo@prueba.cl' }));
  // Retenido por delito sensible, pero la causa no tiene RUC: no entra.
  store.set(`${C}/90000103`, ofac('90000103', 'Chile', screening('Revisar', [{ tipo: 'Tráfico de armas', detalle: 'Causa sin rol', fuente: 'X' }])));
  // Colombia retenido: no entra (el scraper es de PJUD Chile).
  store.set(`${C}/90000104`, ofac('90000104', 'Colombia', { ...screening('Revisar', [{ tipo: 'Tráfico', detalle: 'algo' }]), fuente: 'Inspektor' }));
  // Chile limpio: se cierra solo, no entra.
  store.set(`${C}/90000105`, ofac('90000105', 'Chile', screening('Liberar', [])));
  // Remesa de Chile: no entra (el sujeto es el beneficiario).
  store.set(`${C}/90000106`, {
    numeroCaso: '90000106', asunto: 'DETIENE TX 778001', pais: 'Chile', statusCaso: 'ABIERTO',
    screeningBeneficiario: { schemaVersion: 3, estado: 'ok', flujo: 'CL', samePerson: true },
  });
  store.set('config/flujoAutomatico', {
    ofac: { enabled: true, paises: { CL: true, CO: true }, cerrarSF: true, cerrarAdmin: true,
            tipoLiberarNormal: 'liberar_normal', tipoLiberarUcr: 'liberar_ucr', tipoBloquear: 'fully_blocked' },
    remesa: { enabled: true, paises: { CL: true }, cerrarSF: true, cerrarAdmin: true, tipoLiberar: 'liberar', samePerson: true },
    ...(pjud ? { pjud } : {}),
  });
}

globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  const json = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (String(url).endsWith('/colas/log')) return json({ ok: body.eventos.length });
  if (String(url).endsWith('/salesforce/case-update')) return json({ success: true });
  if (String(url).endsWith('/admin/customer-status')) return json({ ok: true, results: [{ customerId: body.customerIds?.[0], ok: true, steps: {} }] });
  if (String(url).endsWith('/admin/transaction-status')) return json({ ok: true, results: [{ ok: true }] });
  if (String(url).includes('/remesas/search')) return json({ rows: [{ transaction_id: 778001, amount_usd: 10 }] });
  throw new Error(`fetch no esperado: ${url}`);
};

const normalizar = r => { const { duracionMs: _d, ...resto } = r; return resto; };

// ── Modo «resumen»: lo usa la regresión para correr el bundle de main ────────
if (process.env.MODO === 'resumen') {
  const { handler } = await import(process.env.BUNDLE);
  sembrar(null);
  const r = await handler(MANUAL, {});
  // El Lambda también escribe sus líneas de log en stdout: el resumen va marcado.
  process.stdout.write('\n@@RESUMEN@@' + JSON.stringify(normalizar(r)));
  process.exit(0);
}

const { handler } = await import('./flujoAutonomo.bundle.mjs');
let ok = 0;
const prueba = async (nombre, fn) => { await fn(); ok++; console.log('  ✓', nombre); };
const pj = k => store.get(`@pjud/${k}`);
const clavesPjud = () => [...store.keys()].filter(k => k.startsWith('@pjud/')).sort();

console.log('Switch apagado:');
const aqui = fileURLToPath(new URL('.', import.meta.url));
let apagado;
await prueba('el resumen es idéntico al de main', async () => {
  const correr = b => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url)],
    { env: { ...process.env, MODO: 'resumen', BUNDLE: aqui + b }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('@@RESUMEN@@').pop());
  apagado = correr('flujoAutonomo.bundle.mjs');
  assert.deepEqual(apagado, correr('flujoAutonomoMain.bundle.mjs'));
  assert.equal(apagado.pjud, undefined, 'apagado no agrega la clave pjud');
});
await prueba('no escribe nada en la base pjud', async () => {
  sembrar(null);
  await handler(MANUAL, {});
  assert.deepEqual(clavesPjud(), []);
});

console.log('Switch prendido:');
sembrar({ enabled: true });
const r1 = await handler(MANUAL, {});
await prueba('cada caso termina igual que con el switch apagado', async () => {
  const acc = r => Object.fromEntries([...r.detalle, ...r.remesa.detalle].map(x => [x.caseId, `${x.accion}|${x.motivo ?? ''}`]));
  assert.deepEqual(acc(r1), acc(apagado));
  assert.equal(r1.errores, apagado.errores);
});
await prueba('encola los dos retenidos de Chile con causas con RUC, y nada más', async () => {
  assert.deepEqual(clavesPjud(), [
    '@pjud/scraper_casos/90000101', '@pjud/scraper_casos/90000102',
    '@pjud/scraper_jobs/auto-90000101', '@pjud/scraper_jobs/auto-90000102']);
  assert.deepEqual({ ...r1.pjud, salteado: undefined },
    { encolados: 2, yaEstaban: 0, sinRuc: 1, borrados: 0, errores: 0, salteado: undefined });
});
await prueba('scraper_casos con el formato de §3.1', async () => {
  const c = pj('scraper_casos/90000101');
  assert.equal(c.case_id, '90000101');
  assert.equal(c.pais, 'CL');
  assert.deepEqual(c.sujeto, { documento: { tipo: 'RUT', valor: '11111111-1' }, nombre: 'NOMBRE PRUEBA', apellido: 'APELLIDO PRUEBA' });
  assert.equal(c.motivo_coincidencia, 'regcheq · Tráfico, Defraudaciones');
  assert.equal(c.delitos.length, 2);
  assert.deepEqual(Object.keys(c.delitos[0]).sort(), ['antiguedad', 'delito', 'estado', 'fecha', 'fuente', 'ruc']);
  assert.equal(c.delitos[0].ruc, '1900000000-0');
  assert.equal(c.delitos[0].fecha, '2019-04-10');
  assert.deepEqual(c.en_proceso, { tipo: 'caso_completo', estado: 'en_cola', job_id: 'auto-90000101' });
  assert.equal(c.resuelto_en, null);
  assert.match(c.creado, /^\d{4}-\d{2}-\d{2}T/);
});
await prueba('PEP con causa no sensible: «PEP · además regcheq: …», RUT sin guion normalizado y el email no es un apellido', async () => {
  const c = pj('scraper_casos/90000102');
  assert.equal(c.motivo_coincidencia, 'PEP · además regcheq: Hurto simple');
  assert.equal(c.sujeto.documento.valor, '22222222-2');
  assert.equal(c.sujeto.apellido, null);
});
await prueba('el job automático con el formato de §3.2', async () => {
  const j = pj('scraper_jobs/auto-90000101');
  assert.deepEqual({ ...j, creado: undefined }, {
    tipo: 'caso_completo', case_id: '90000101', origen: 'flujo_automatico',
    prioridad: 5, estado: 'pendiente', intentos: 0, creado: undefined });
});

await prueba('una sola vez por caso: la corrida siguiente no vuelve a encolar ni pisa el job', async () => {
  const antes = JSON.stringify(pj('scraper_jobs/auto-90000101'));
  pj('scraper_jobs/auto-90000101').estado = 'listo';         // el scraper ya lo procesó
  const r2 = await handler(MANUAL, {});
  assert.equal(r2.pjud.encolados, 0);
  assert.equal(r2.pjud.yaEstaban, 2);
  assert.equal(pj('scraper_jobs/auto-90000101').estado, 'listo');
  assert.equal(JSON.parse(antes).creado, pj('scraper_jobs/auto-90000101').creado);
});

console.log('Borrado al resolverse (§4.4):');
await prueba('caso cerrado en Lens y caso borrado: job borrar-{id} y resuelto_en', async () => {
  store.get(`${C}/90000101`).statusCaso = 'CERRADO';
  store.delete(`${C}/90000102`);
  const r3 = await handler(MANUAL, {});
  assert.equal(r3.pjud.borrados, 2);
  for (const id of ['90000101', '90000102']) {
    const j = pj(`scraper_jobs/borrar-${id}`);
    assert.deepEqual({ ...j, creado: undefined }, {
      tipo: 'borrar', case_id: id, origen: 'lens:caso_resuelto', prioridad: 3, estado: 'pendiente', intentos: 0, creado: undefined });
    assert.match(pj(`scraper_casos/${id}`).resuelto_en, /^\d{4}-/);
  }
});
await prueba('un caso resuelto no se vuelve a barrer', async () => {
  const r4 = await handler(MANUAL, {});
  assert.equal(r4.pjud.borrados, 0);
});
await prueba('un caso todavía abierto no se borra', async () => {
  sembrar({ enabled: true });
  await handler(MANUAL, {});
  const r5 = await handler(MANUAL, {});
  assert.equal(r5.pjud.borrados, 0);
  assert.equal(pj('scraper_casos/90000101').resuelto_en, null);
  assert.equal(pj('scraper_jobs/borrar-90000101'), undefined);
});

console.log('Base pjud caída:');
await prueba('cada caso se cierra o se retiene igual, la corrida no falla y el error se cuenta', async () => {
  sembrar({ enabled: true });
  globalThis.__FAKE_FS_FALLA = 'pjud';
  const r6 = await handler(MANUAL, {});
  globalThis.__FAKE_FS_FALLA = undefined;
  const acc = r => Object.fromEntries([...r.detalle, ...r.remesa.detalle].map(x => [x.caseId, `${x.accion}|${x.motivo ?? ''}`]));
  assert.deepEqual(acc(r6), acc(apagado));
  assert.equal(r6.errores, apagado.errores);
  assert.ok(r6.pjud.errores > 0);
  assert.equal(r6.pjud.encolados, 0);
});

console.log('Volumen (sin inanición):');
function sembrarMuchos(n) {
  store.clear();
  for (let i = 0; i < n; i++) {
    const id = String(91000000 + i);
    store.set(`${C}/${id}`, ofac(id, 'Chile', screening('Revisar', [causa('Tráfico ilícito de estupefacientes', `${1500000000 + i}-${i % 10}`)])));
  }
  store.set('config/flujoAutomatico', {
    ofac: { enabled: true, paises: { CL: true }, cerrarSF: true, cerrarAdmin: true,
            tipoLiberarNormal: 'liberar_normal', tipoLiberarUcr: 'liberar_ucr', tipoBloquear: 'fully_blocked' },
    remesa: { enabled: false, paises: {}, cerrarSF: false, cerrarAdmin: false, tipoLiberar: 'liberar' },
    pjud: { enabled: true },
  });
}
const cuantos = pref => [...store.keys()].filter(k => k.startsWith(`@pjud/scraper_jobs/${pref}`)).length;
await prueba('60 retenidos con RUC: 50 en la primera corrida y los 10 restantes en la segunda', async () => {
  sembrarMuchos(60);
  const a = await handler(MANUAL, {});
  assert.equal(a.pjud.encolados, 50);
  assert.ok(a.pjud.salteado.some(x => /10 para la próxima corrida/.test(x)), JSON.stringify(a.pjud.salteado));
  const b = await handler(MANUAL, {});
  assert.equal(b.pjud.encolados, 10);
  assert.equal(b.pjud.yaEstaban, 50);
  assert.equal(cuantos('auto-'), 60);
});
await prueba('60 resueltos: todos barridos en una corrida (tope 500), una sola vez', async () => {
  for (let i = 0; i < 60; i++) store.get(`${C}/${91000000 + i}`).statusCaso = 'CERRADO';
  const c = await handler(MANUAL, {});
  assert.equal(c.pjud.borrados, 60);
  assert.equal(cuantos('borrar-'), 60);
  const d = await handler(MANUAL, {});
  assert.equal(d.pjud.borrados, 0);
});

console.log(`\n${ok} pruebas OK`);
