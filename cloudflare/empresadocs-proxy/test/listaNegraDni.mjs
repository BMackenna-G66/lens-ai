// Paso 6 de /admin/customer-status: un «Bloqueado» de la cola OFAC agrega al
// cliente a la lista negra de DNI de Admin. Y la carga de históricos.
//
// Lo que se protege:
//   · SIN `listaNegraDni`, la respuesta es IDÉNTICA a la del Worker de main;
//   · el paso 6 nunca cambia el `ok` del cierre ni lo demora más que su tope;
//   · corre solo con cola OFAC + fully_blocked + cierre ok + actor verificado;
//   · agrega, reactiva o deja como está, sin duplicar (también si el mismo
//     caso se cierra dos veces), con el DNI escrito como Admin escribe los de
//     ese país;
//   · falla cerrada: sin registro durable no se toca Admin;
//   · se registra en los dos esquemas, con el actor verificado.
//
// Correr:
//   echo "export { default } from './src/index'; export { _reiniciarListasNegras } from './src/listasNegras';" \
//     | npx esbuild --bundle --format=esm --platform=neutral --outfile=test/worker_ln.mjs --log-level=warning
//   rm -rf /tmp/lens_main && mkdir -p /tmp/lens_main && git -C ../.. archive main cloudflare services | tar -x -C /tmp/lens_main
//   npx esbuild /tmp/lens_main/cloudflare/empresadocs-proxy/src/index.ts --bundle --format=esm --platform=neutral \
//     --outfile=test/worker_main.mjs --log-level=warning
//   node test/listaNegraDni.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import worker, { _reiniciarListasNegras } from './worker_ln.mjs';
import workerMain from './worker_main.mjs';

const PROYECTO = 'lens-ai-9da63';
const LOG = 'https://log.prueba/';
const COLAS = 'https://colas.prueba/';
const ENV = {
  G66_ADMIN_REFRESH_TOKEN: 'refresh-de-prueba', LISTAS_LOG_URL: LOG, LISTAS_LOG_SECRET: 'secreto-log',
  COLAS_LOGGER_URL: COLAS, COLAS_LOGGER_SECRET: 'secreto-colas', LISTA_NEGRA_SISTEMA_SECRET: 'secreto-sistema',
};
const ORIGEN = 'https://bmackenna-g66.github.io';
const MOTIVO = 'Matriz de delitos y matriz de riesgo flujo cola de trabajo';

const b64u = buf => Buffer.from(buf).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'llave-1', alg: 'RS256', use: 'sig' };
async function firmar(claims = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'llave-1', typ: 'JWT' }));
  const p = b64u(JSON.stringify({
    aud: PROYECTO, iss: `https://securetoken.google.com/${PROYECTO}`, sub: 'uid-analista',
    iat: ahora - 10, auth_time: ahora - 10, exp: ahora + 3600,
    email: 'analista@global66.com', email_verified: true, name: 'Analista Prueba', ...claims,
  }));
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(firma)}`;
}

// ── El mundo de afuera, simulado ────────────────────────────────────────────
let listaDni, admin, registro, colas, perfiles, registroFalla, complianceFalla, demoraListaMs, waitUntils;
function reiniciar(opciones = {}) {
  _reiniciarListasNegras({ sinEsperas: true, ...opciones });
  listaDni = [
    { dni: '12.345.678-5', countryCode: 'CL', countryName: 'Chile', reason: 'antes', blacklistStatus: true },
    { dni: '22.333.444-0', countryCode: 'CL', countryName: 'Chile', reason: 'anterior', blacklistStatus: false },
    { dni: '1020304050', countryCode: 'CO', countryName: 'Colombia', reason: 'x', blacklistStatus: true },
  ];
  admin = [];
  registro = [];
  colas = [];
  perfiles = { 'uid-analista': { role: 'Lider', modules: {} } };
  registroFalla = () => false;
  complianceFalla = false;
  demoraListaMs = 0;
  waitUntils = [];
}

const valorFs = v => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'string' ? { stringValue: v }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valorFs(x)])) } };
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const met = init.method || 'GET';
  if (u.includes('securetoken@system.gserviceaccount.com')) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } });
  }
  if (u.startsWith('https://firestore.googleapis.com/')) {
    const p = perfiles[decodeURIComponent(u.split('/users/')[1])];
    return p ? j({ fields: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, valorFs(v)])) }) : j({}, 404);
  }
  if (u.startsWith(LOG.replace(/\/$/, ''))) {
    const ev = JSON.parse(init.body);
    if (registroFalla(ev)) return j({ error: 'x' }, 503);
    registro.push(ev);
    return j({ ok: true });
  }
  if (u.startsWith(COLAS.replace(/\/$/, ''))) {
    assert.equal(init.headers['x-api-secret'], 'secreto-colas');
    colas.push(...JSON.parse(init.body).eventos);
    return j({ ok: 1 });
  }
  const ruta = u.replace('https://api.global66.com', '');
  if (ruta === '/admin/refresh-token') return j({ idToken: 'x.eyJleHAiOjk5OTk5OTk5OTl9.y' });
  if (ruta === '/beneficiary/compliance/blacklist') {
    if (met === 'GET') {
      if (demoraListaMs) await new Promise(r => setTimeout(r, demoraListaMs));
      return j(listaDni.map(r => ({ ...r })));
    }
    const cuerpo = JSON.parse(init.body);
    admin.push({ met, cuerpo });
    return j({ ok: true });
  }
  if (ruta === '/route/country/enabled') return j([{ countryCode: 'CL', countryName: 'Chile' }, { countryCode: 'CO', countryName: 'Colombia' }]);
  // Los cinco pasos del cierre.
  if (/\/customer\/bo\/customer-info\/\d+\/blacklist$/.test(ruta)) return j({ ok: true });
  if (/\/customer\/bo\/customer-info\/\d+\/compliance\//.test(ruta)) return complianceFalla ? j({ error: 'no' }, 500) : j({ ok: true });
  if (/\/customer\/bo\/\d+\/[A-Z]{2}\/last-step$/.test(ruta)) return j({ ok: true });
  throw new Error(`fetch no esperado: ${met} ${u}`);
};

const CTX = { waitUntil(p) { waitUntils.push(p); } };
const CIERRE = {
  customerIds: ['4000001'], status: 'BLOCKED', comment: 'COMPLIANCE_OFFICER_REQUEST', observation: 'Prueba',
  agent: 'compliance.masivo@global66.com', ofacFlag: false, ofacProvider: 'REGCHECK', countryCode: 'CL',
  lastStep: false, cola: 'ofac',
};
const entrada = (x = {}) => ({ customerId: '4000001', dni: '11111111-1', countryCode: 'CL', numeroCaso: '09000001',
  casoId: '09000001', idInternoUsuario: '4000001', tipologia: 'fully_blocked', ...x });

const cerrar = async (cuerpo, { token, sistema, w = worker } = {}) => {
  const r = await w.fetch(new Request('https://w.prueba/admin/customer-status', {
    method: 'POST',
    headers: { Origin: ORIGEN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
               ...(sistema ? { 'x-lens-sistema': sistema } : {}) },
    body: JSON.stringify(cuerpo),
  }), ENV, CTX);
  return { status: r.status, cuerpo: await r.json() };
};
const paso6 = c => c.cuerpo.results[0].steps.listaNegraDni;
const sinPaso6 = c => ({ ...c.cuerpo, results: c.cuerpo.results.map(r => ({ ...r, steps: Object.fromEntries(
  Object.entries(r.steps).filter(([k]) => k !== 'listaNegraDni')) })) });

let ok = 0;
const prueba = async (nombre, fn) => { reiniciar(); await fn(); ok++; console.log('  ✓', nombre); };

console.log('Sin el campo nuevo, nada cambia:');
await prueba('la respuesta es IDÉNTICA a la del Worker de main', async () => {
  for (const cuerpo of [CIERRE, { ...CIERRE, cola: 'otros' }, { ...CIERRE, status: 'NORMAL', lastStep: true }]) {
    const nuevo = await cerrar(cuerpo, { token: await firmar() });
    const main = await cerrar(cuerpo, { token: await firmar(), w: workerMain });
    assert.deepEqual(nuevo, main);
  }
  complianceFalla = true;
  assert.deepEqual(await cerrar(CIERRE), await cerrar(CIERRE, { w: workerMain }));
  assert.equal(admin.length + registro.length + colas.length, 0);
});
await prueba('con el campo, todo lo demás de la respuesta sigue igual a main', async () => {
  const nuevo = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  const main = await cerrar(CIERRE, { w: workerMain });
  assert.equal(nuevo.status, main.status);
  assert.deepEqual(sinPaso6(nuevo), main.cuerpo);
  assert.equal(paso6(nuevo).resultado, 'AGREGADO');
});

console.log('Cuándo corre:');
for (const [nombre, cuerpo, motivo] of [
  ['cola que no es OFAC', { ...CIERRE, cola: 'otros', listaNegraDni: entrada() }, 'no es un cierre Bloqueado de la cola OFAC'],
  ['otra tipología', { ...CIERRE, listaNegraDni: entrada({ tipologia: 'liberar_ucr' }) }, 'no es un cierre Bloqueado de la cola OFAC'],
]) {
  await prueba(`${nombre}: no corre`, async () => {
    const c = await cerrar(cuerpo, { token: await firmar() });
    assert.deepEqual(paso6(c), { omitido: motivo });
    assert.equal(admin.length + registro.length, 0);
  });
}
await prueba('si el cierre en Admin falló: no corre, y el ok sigue en false', async () => {
  complianceFalla = true;
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  assert.equal(c.cuerpo.ok, false);
  assert.deepEqual(paso6(c), { omitido: 'el cierre en Admin no quedó ok' });
  assert.equal(admin.length, 0);
});
for (const [nombre, opciones] of [
  ['sin token', {}],
  ['con un token de otro dominio', { token: 'otro' }],
  ['con un secreto de sistema equivocado', { sistema: 'no-es' }],
]) {
  await prueba(`${nombre}: sin_actor_verificado, y el cierre igual sale ok`, async () => {
    const o = { ...opciones, token: opciones.token === 'otro' ? await firmar({ email: 'x@gmail.com' }) : opciones.token };
    const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, o);
    assert.equal(c.cuerpo.ok, true);
    assert.deepEqual(paso6(c), { omitido: 'sin_actor_verificado' });
    assert.equal(admin.length + registro.length + colas.length, 0);
  });
}

console.log('Qué hace:');
await prueba('un DNI nuevo se agrega, escrito como Admin escribe los de ese país', async () => {
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  assert.equal(c.cuerpo.ok, true);
  assert.equal(paso6(c).resultado, 'AGREGADO');
  // Los RUT de Chile en Admin van con puntos y guion: el nuevo también.
  assert.deepEqual(admin, [{ met: 'POST', cuerpo: { dni: '11.111.111-1', countryCode: 'CL', countryName: 'Chile', reason: MOTIVO } }]);
});
await prueba('uno inactivo se reactiva con el PUT (la razón queda la de antes)', async () => {
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada({ dni: '22333444-0' }) }, { token: await firmar() });
  assert.equal(paso6(c).resultado, 'ACTIVADO');
  assert.deepEqual(admin, [{ met: 'PUT', cuerpo: { dni: '22.333.444-0', countryCode: 'CL', status: true } }]);
  assert.deepEqual(registro[0].meta, { estadoAnterior: false, reasonAnterior: 'anterior', valor: '22.333.444-0' });
});
await prueba('uno activo no se toca: YA_ACTIVO', async () => {
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada({ dni: '123456785' }) }, { token: await firmar() });
  assert.equal(paso6(c).resultado, 'YA_ACTIVO');
  assert.equal(admin.length, 0);
  assert.equal(registro[0].accion, 'sin_operacion');
  assert.equal(registro[0].filas[0].resultado, 'OMITIDO_YA_EXISTE_ACTIVO');
});
await prueba('sin DNI o sin país: ERROR con su motivo, y nada en Admin', async () => {
  for (const x of [{ dni: '' }, { countryCode: '' }]) {
    reiniciar();
    const c = await cerrar({ ...CIERRE, listaNegraDni: entrada(x) }, { token: await firmar() });
    assert.equal(c.cuerpo.ok, true);
    assert.equal(paso6(c).resultado, 'ERROR');
    assert.match(paso6(c).detalle, /no tiene (DNI|un país)/);
    assert.equal(admin.length, 0);
    assert.equal(registro[0].filas[0].resultado, 'ERROR');
  }
});
await prueba('el mismo caso cerrado dos veces no duplica nada', async () => {
  const t = await firmar();
  await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: t });
  const c2 = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: t });
  assert.equal(paso6(c2).resultado, 'YA_ACTIVO');
  assert.equal(admin.filter(a => a.met === 'POST').length, 1);
});
await prueba('FALLA CERRADA: sin registro durable no se toca Admin', async () => {
  registroFalla = ev => ev.accion === 'intento';
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  assert.equal(c.cuerpo.ok, true, 'el cierre no cambia');
  assert.equal(paso6(c).resultado, 'ERROR');
  assert.equal(paso6(c).registro, 'no_disponible');
  assert.equal(admin.length, 0);
});

console.log('El registro, en los dos esquemas:');
await prueba('listas_negras: el flujo manual, el actor del token y el caso', async () => {
  await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  const [intento, resultado] = registro;
  assert.equal(intento.flujo, 'colas_trabajo.ofac.bloqueado.manual');
  assert.equal(intento.servicio, '/admin/customer-status');
  assert.deepEqual(intento.actor, { email: 'analista@global66.com', nombre: 'Analista Prueba', uid: 'uid-analista' });
  assert.deepEqual(intento.origen, { numeroCaso: '09000001', casoId: '09000001' });
  assert.equal(resultado.accion, 'resultado');
});
await prueba('colas_trabajo: la fila de lista_negra_dni, con el DNI como clave', async () => {
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  assert.equal(colas.length, 1);
  assert.equal(colas[0].tabla, 'lista_negra_dni');
  const d = colas[0].datos;
  assert.equal(d.cambio_id, paso6(c).cambioId);
  assert.deepEqual([d.numero_caso, d.caso_id, d.id_interno_usuario, d.dni, d.country_code, d.tipologia, d.resultado],
    ['09000001', '09000001', '4000001', '111111111', 'CL', 'fully_blocked', 'AGREGADO']);
  assert.deepEqual([d.actor_email, d.automatico, d.flujo], ['analista@global66.com', false, 'colas_trabajo.ofac.bloqueado.manual']);
});
await prueba('el flujo automático se acredita con su secreto: actor de sistema', async () => {
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { sistema: 'secreto-sistema' });
  assert.equal(paso6(c).resultado, 'AGREGADO');
  assert.equal(registro[0].flujo, 'colas_trabajo.ofac.bloqueado.automatico');
  assert.equal(registro[0].actor.email, 'sistema:lens-flujo-autonomo');
  assert.equal(colas[0].datos.automatico, true);
});

console.log('El tope de tiempo:');
await prueba('si Admin tarda, se responde igual: el paso 6 sigue después', async () => {
  reiniciar({ sinEsperas: true, esperaPaso6Ms: 30 });
  demoraListaMs = 200;
  const t0 = Date.now();
  const c = await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
  assert.ok(Date.now() - t0 < 180, `tardó ${Date.now() - t0} ms`);
  assert.equal(c.cuerpo.ok, true);
  assert.equal(paso6(c).en_curso, true);
  assert.equal(waitUntils.length, 1);
  await Promise.all(waitUntils);
  assert.equal(admin.length, 1, 'terminó después de responder');
  assert.equal(colas[0].datos.resultado, 'AGREGADO');
});

console.log('Masivo:');
await prueba('varios clientes en un pedido: cada uno con su paso 6', async () => {
  const c = await cerrar({ ...CIERRE, customerIds: ['4000001', '4000002'], listaNegraDni: [
    entrada(), entrada({ customerId: '4000002', idInternoUsuario: '4000002', dni: '123456785', numeroCaso: '09000002', casoId: '09000002' }),
  ] }, { token: await firmar() });
  assert.deepEqual(c.cuerpo.results.map(r => r.steps.listaNegraDni.resultado), ['AGREGADO', 'YA_ACTIVO']);
});

console.log('Históricos (solo Líder):');
const historico = async (cuerpo, token) => {
  const r = await worker.fetch(new Request('https://w.prueba/admin/listas-negras/dni/bloqueado', {
    method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  }), ENV, CTX);
  return { status: r.status, cuerpo: await r.json() };
};
await prueba('Líder: agrega con el flujo histórico', async () => {
  const { ejecucionId, ...e } = { ejecucionId: 'ej-historico', ...entrada() };
  const r = await historico({ ejecucionId, ...e }, await firmar());
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.resultado, 'AGREGADO');
  assert.equal(r.cuerpo.flujo, 'colas_trabajo.ofac.bloqueado.historico');
  assert.equal(registro[0].ejecucionId, 'ej-historico');
});
await prueba('con el módulo pero sin ser Líder: 403', async () => {
  perfiles['uid-analista'] = { role: 'Analista', modules: { listasNegras: true } };
  assert.equal((await historico(entrada(), await firmar())).status, 403);
  assert.equal(admin.length, 0);
});
await prueba('otra tipología o campos de más: 400', async () => {
  const t = await firmar();
  assert.equal((await historico(entrada({ tipologia: 'liberar_ucr' }), t)).status, 400);
  assert.equal((await historico({ ...entrada(), actor: 'x' }, t)).status, 400);
  assert.equal(admin.length, 0);
});

console.log('Contratos con los Lambdas:');
await prueba('los eventos al registro y las filas de colas, guardados como fixtures', async () => {
  const t = await firmar();
  await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: t });                                   // agrega
  await cerrar({ ...CIERRE, listaNegraDni: entrada({ dni: '22333444-0', numeroCaso: '09000003', casoId: '09000003' }) }, { sistema: 'secreto-sistema' }); // reactiva
  await cerrar({ ...CIERRE, listaNegraDni: entrada({ dni: '123456785', numeroCaso: '09000004', casoId: '09000004' }) }, { token: t });  // ya activo
  await cerrar({ ...CIERRE, listaNegraDni: entrada({ dni: '', numeroCaso: '09000005', casoId: '09000005' }) }, { token: t });         // sin DNI
  assert.deepEqual(registro.map(e => e.accion), ['intento', 'resultado', 'intento', 'resultado', 'sin_operacion', 'sin_operacion']);
  assert.deepEqual(colas.map(c => c.datos.resultado), ['AGREGADO', 'ACTIVADO', 'YA_ACTIVO', 'ERROR']);
  const ids = new Map();
  const estable = o => JSON.stringify(o, null, 1)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, u => ids.get(u) ?? (ids.set(u, `id-${ids.size + 1}`), ids.get(u)))
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '2026-10-23T18:00:00.000Z') + '\n';
  writeFileSync(new URL('../../../aws/listas-negras-log/tests/fixtures/eventos_paso6.json', import.meta.url), estable(registro));
  writeFileSync(new URL('../../../aws/colas-logger/tests/fixtures/lista_negra_dni.json', import.meta.url), estable(colas));
});

console.log('Logs:');
await prueba('sin DNI', async () => {
  const lineas = [];
  const log = console.log;
  console.log = (...a) => lineas.push(a.join(' '));
  try {
    await cerrar({ ...CIERRE, listaNegraDni: entrada() }, { token: await firmar() });
    await cerrar({ ...CIERRE, listaNegraDni: entrada({ dni: '22333444-0' }) }, { token: await firmar() });
  } finally { console.log = log; }
  for (const l of lineas) assert.doesNotMatch(l, /11111111|22333444|22\.333\.444/, l);
});

console.log(`\n  Todo OK. (${ok} pruebas)`);
