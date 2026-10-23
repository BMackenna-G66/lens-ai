// /admin/listas-negras/*: alta y edición de las listas negras de Admin G66.
//
// Lo que se protege:
//   · nadie sin ID token de Lens verificado y sin el módulo `listasNegras` llega a Admin;
//   · solo las tres listas y sus campos: nada de passthrough;
//   · un refresh del token de Admin para muchas filas, no uno por fila;
//   · 429 y 5xx con espera, pero un POST que falló con 5xx NO se repite;
//   · sin DNI, cuentas ni dominios en los logs;
//   · las rutas existentes y su CORS, iguales.
//
// Correr:
//   echo "export { default } from './src/index'; export { _reiniciarListasNegras } from './src/listasNegras';" \
//     | npx esbuild --bundle --format=esm --platform=neutral --outfile=test/worker_ln.mjs --log-level=warning
//   node test/listasNegras.mjs
//
// Todos los datos son inventados.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import worker, { _reiniciarListasNegras } from './worker_ln.mjs';

// Los eventos que el Worker le manda al registro, para el test de contrato del
// Lambda (aws/listas-negras-log/tests/test_contrato_worker.py).
const CONTRATO = new URL('../../../aws/listas-negras-log/tests/fixtures/eventos_worker.json', import.meta.url);

const PROYECTO = 'lens-ai-9da63';
const LOG = 'https://log.prueba/';
const ENV = { G66_ADMIN_REFRESH_TOKEN: 'refresh-de-prueba', LISTAS_LOG_URL: LOG, LISTAS_LOG_SECRET: 'secreto-log' };
const CTX = { waitUntil() {} };
const ORIGEN = 'https://bmackenna-g66.github.io';

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

// Un idToken de Admin con `exp` dentro de una hora (no se verifica su firma).
const tokenAdmin = n => `x.${b64u(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, n }))}.y`;

// ── El mundo de afuera, simulado ────────────────────────────────────────────
let perfiles, perfilFalla, refrescos, refrescoFalla, admin, respuestasAdmin, lecturasPerfil, registro, registroFalla;
function reiniciar() {
  _reiniciarListasNegras({ sinEsperas: true });
  perfiles = { 'uid-analista': { role: 'Analista', modules: { listasNegras: true } } };
  perfilFalla = false;
  refrescos = 0;
  refrescoFalla = false;
  admin = [];
  respuestasAdmin = [];
  lecturasPerfil = 0;
  registro = [];
  registroFalla = () => false;
}

const valorFs = v => typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'string' ? { stringValue: v }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valorFs(x)])) } };

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('securetoken@system.gserviceaccount.com')) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } });
  }
  if (u.startsWith('https://firestore.googleapis.com/')) {
    lecturasPerfil++;
    assert.match(init.headers.Authorization, /^Bearer /, 'el perfil se lee con el token del analista');
    if (perfilFalla) return new Response('{}', { status: 500 });
    const uid = decodeURIComponent(u.split('/users/')[1]);
    const p = perfiles[uid];
    if (!p) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ fields: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, valorFs(v)])) }));
  }
  if (u.startsWith(LOG.replace(/\/$/, ''))) {
    assert.equal(init.headers['x-api-secret'], 'secreto-log');
    const ev = JSON.parse(init.body);
    if (registroFalla(ev)) return new Response('{"error":"x"}', { status: 503 });
    registro.push(ev);
    return new Response('{"ok":true}');
  }
  if (u === 'https://api.global66.com/admin/refresh-token') {
    refrescos++;
    assert.equal(init.body, 'refreshToken=refresh-de-prueba');
    if (refrescoFalla) return new Response('{"error":"Forbidden"}', { status: 403 });
    return new Response(JSON.stringify({ idToken: tokenAdmin(refrescos) }));
  }
  if (u.startsWith('https://api.global66.com/')) {
    admin.push({ metodo: init.method, ruta: u.slice('https://api.global66.com'.length), auth: init.headers.Authorization,
                 cuerpo: init.body ? JSON.parse(init.body) : undefined });
    const [status, cuerpo] = respuestasAdmin.shift() ?? [200, [{ dni: '99887766', countryCode: 'CO', blacklistStatus: true }]];
    return new Response(JSON.stringify(cuerpo), { status });
  }
  throw new Error(`fetch no esperado: ${u}`);
};

const META = { ejecucionId: 'ej-prueba' };
// Una escritura: el registro para Admin y lo informativo para el registro.
const escribir = (registro, meta = META) => ({ registro, meta });
const pedir = async (ruta, { token, metodo = 'GET', cuerpo, env = ENV } = {}) => worker.fetch(new Request(`https://w.prueba${ruta}`, {
  method: metodo,
  headers: { Origin: ORIGEN, ...(token ? { Authorization: `Bearer ${token}` } : {}),
             ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  ...(cuerpo !== undefined ? { body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) } : {}),
}), env, CTX);

let ok = 0;
const prueba = async (nombre, fn) => { reiniciar(); await fn(); ok++; console.log('  ✓', nombre); };

console.log('Quién puede:');
await prueba('sin token: 401 y no llega a Admin', async () => {
  const r = await pedir('/admin/listas-negras/dni');
  assert.equal(r.status, 401);
  assert.equal(admin.length + refrescos, 0);
});
await prueba('cuenta de Google de otro dominio: 401', async () => {
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar({ email: 'alguien@gmail.com' }) });
  assert.equal(r.status, 401);
  assert.equal(admin.length, 0);
});
for (const [nombre, perfil] of [
  ['analista sin el módulo (ausente = deshabilitado)', { role: 'Analista', modules: { regcheq: true } }],
  ['analista con el módulo en false', { role: 'Analista', modules: { listasNegras: false } }],
  ['líder desactivado', { role: 'Lider', disabled: true }],
]) {
  await prueba(`${nombre}: 403 y no llega a Admin`, async () => {
    perfiles['uid-analista'] = perfil;
    const r = await pedir('/admin/listas-negras/dni', { token: await firmar() });
    assert.equal(r.status, 403);
    assert.equal(admin.length + refrescos, 0);
  });
}
await prueba('usuario sin perfil en Lens: 403', async () => {
  perfiles = {};
  assert.equal((await pedir('/admin/listas-negras/dni', { token: await firmar() })).status, 403);
});
await prueba('líder: pasa aunque no tenga el módulo', async () => {
  perfiles['uid-analista'] = { role: 'Lider', modules: {} };
  assert.equal((await pedir('/admin/listas-negras/dni', { token: await firmar() })).status, 200);
});
await prueba('si no se puede leer el perfil, se niega (503) y no llega a Admin', async () => {
  perfilFalla = true;
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar() });
  assert.equal(r.status, 503);
  assert.equal(admin.length + refrescos, 0);
});
await prueba('el permiso se lee una vez por minuto, no por fila', async () => {
  const t = await firmar();
  for (let i = 0; i < 5; i++) await pedir('/admin/listas-negras/dni', { token: t });
  assert.equal(lecturasPerfil, 1);
});

console.log('Qué se puede pedir:');
await prueba('GET de cada lista va a su ruta de Admin, con el idToken; vuelve el actor', async () => {
  const t = await firmar();
  for (const [lista, ruta] of [['dni', '/beneficiary/compliance/blacklist'], ['dominio', '/admin/blacklist/domain'],
                               ['cuenta', '/beneficiary/admin/bank-account/black-list'], ['paises', '/route/country/enabled']]) {
    const r = await pedir(`/admin/listas-negras/${lista}`, { token: t });
    assert.equal(r.status, 200);
    const c = await r.json();
    assert.equal(c.actor, 'analista@global66.com');
    assert.equal(c.status, 200);
    assert.ok(Array.isArray(c.datos));
    assert.equal(admin.at(-1).ruta, ruta);
    assert.equal(admin.at(-1).auth, tokenAdmin(1));
  }
});
await prueba('una lista que no existe: 404; paises solo GET', async () => {
  const t = await firmar();
  assert.equal((await pedir('/admin/listas-negras/clientes', { token: t })).status, 404);
  assert.equal((await pedir('/admin/listas-negras/dni/extra', { token: t })).status, 404);
  assert.equal((await pedir('/admin/listas-negras/paises', { token: t, metodo: 'POST', cuerpo: {} })).status, 405);
  assert.equal((await pedir('/admin/listas-negras/dni', { token: t, metodo: 'DELETE' })).status, 405);
  assert.equal(admin.length, 0);
});
await prueba('POST y PUT con los campos de los scripts pasan tal cual', async () => {
  const t = await firmar();
  const casos = [
    ['POST', 'dni', { dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }],
    ['PUT', 'dni', { dni: '99887766', countryCode: 'CO', status: false }],
    ['POST', 'dominio', { email: 'desechable.prueba', reason: 'Prueba' }],
    ['PUT', 'dominio', { id: 7, status: false, reason: 'Prueba' }],
    ['POST', 'cuenta', { countryCode: null, accountNumber: 'LT000000000000000001', accountType: null, enable: true, reason: 'Prueba' }],
    ['PUT', 'cuenta', { id: 9, countryCode: 'CO', accountNumber: '3000000001', accountType: 'Electronic', enable: false, reason: 'Prueba' }],
  ];
  for (const [metodo, lista, cuerpo] of casos) {
    respuestasAdmin.push([200, { ok: true }]);
    const r = await pedir(`/admin/listas-negras/${lista}`, { token: t, metodo, cuerpo: escribir(cuerpo) });
    assert.equal(r.status, 200, `${metodo} ${lista}`);
    assert.equal(admin.at(-1).metodo, metodo);
    assert.deepEqual(admin.at(-1).cuerpo, cuerpo);
  }
});
for (const [nombre, cuerpo] of [
  ['un campo de más', escribir({ dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x', blacklistStatus: true })],
  ['un arreglo', [{ dni: '1' }]],
  ['un valor anidado', escribir({ dni: { $ne: '' }, countryCode: 'CO' })],
  ['un JSON roto', '{dni:'],
  ['un cuerpo enorme', escribir({ dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x'.repeat(5000) })],
  ['el registro suelto, sin sobre', { dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x' }],
  ['sin ejecucionId', escribir({ dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x' }, {})],
  ['el actor en meta', escribir({ dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x' },
                                { ...META, actorEmail: 'otro@global66.com' })],
  ['el actor en el registro', escribir({ dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x',
                                        actor_email: 'otro@global66.com' })],
  ['el actor en el sobre', { ...escribir({ dni: '1', countryCode: 'CO', countryName: 'Colombia', reason: 'x' }),
                             actor: { email: 'otro@global66.com' } }],
]) {
  await prueba(`POST con ${nombre}: 400 y no llega a Admin ni al registro`, async () => {
    const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'POST', cuerpo });
    assert.equal(r.status, 400);
    assert.equal(admin.length, 0);
    assert.equal(registro.length, 0);
  });
}
await prueba('el PUT de DNI no admite los campos del POST', async () => {
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'PUT',
    cuerpo: escribir({ dni: '1', countryCode: 'CO', status: false, reason: 'x' }) });
  assert.equal(r.status, 400);
});

console.log('El token de Admin:');
await prueba('cien filas, un refresh', async () => {
  const t = await firmar();
  for (let i = 0; i < 100; i++) {
    respuestasAdmin.push([200, {}]);
    await pedir('/admin/listas-negras/dni', { token: t, metodo: 'PUT', cuerpo: escribir({ dni: String(i), countryCode: 'CO', status: false }) });
  }
  assert.equal(refrescos, 1);
});
await prueba('cinco pedidos a la vez con el caché vacío: un solo refresh', async () => {
  const t = await firmar();
  await pedir('/admin/listas-negras/dni', { token: t });   // calienta el permiso
  _reiniciarListasNegras({ sinEsperas: true });
  refrescos = 0;
  await Promise.all(Array.from({ length: 5 }, () => pedir('/admin/listas-negras/dni', { token: t })));
  assert.equal(refrescos, 1);
});
await prueba('un 401 de Admin renueva el token una vez y reintenta', async () => {
  respuestasAdmin.push([401, {}], [200, [{ id: 1 }]]);
  const r = await pedir('/admin/listas-negras/dominio', { token: await firmar() });
  assert.equal(r.status, 200);
  assert.equal(refrescos, 2);
  assert.equal(admin.length, 2);
  assert.equal(admin[1].auth, tokenAdmin(2));
});
await prueba('dos 401 seguidos: no insiste más', async () => {
  respuestasAdmin.push([401, {}], [401, {}]);
  const r = await pedir('/admin/listas-negras/dominio', { token: await firmar() });
  assert.equal(r.status, 401);
  assert.equal(admin.length, 2);
  assert.equal(refrescos, 2);
});
await prueba('si el refresh falla: 502 y el mensaje no trae el token', async () => {
  refrescoFalla = true;
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar() });
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /refresh-de-prueba/);
});

console.log('Reintentos:');
await prueba('429: espera y reintenta, también un POST', async () => {
  respuestasAdmin.push([429, {}], [429, {}], [200, { ok: true }]);
  const r = await pedir('/admin/listas-negras/dominio', { token: await firmar(), metodo: 'POST',
    cuerpo: escribir({ email: 'desechable.prueba', reason: 'Prueba' }) });
  assert.equal(r.status, 200);
  assert.equal(admin.length, 3);
});
await prueba('5xx en GET y PUT: reintenta', async () => {
  respuestasAdmin.push([503, {}], [200, []]);
  assert.equal((await pedir('/admin/listas-negras/cuenta', { token: await firmar() })).status, 200);
  respuestasAdmin.push([502, {}], [200, {}]);
  assert.equal((await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'PUT',
    cuerpo: escribir({ dni: '1', countryCode: 'CO', status: true }) })).status, 200);
  assert.equal(admin.length, 4);
});
await prueba('5xx en un POST: NO se repite (podría duplicar el registro)', async () => {
  respuestasAdmin.push([500, { error: 'x' }], [200, {}]);
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'POST',
    cuerpo: escribir({ dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }) });
  assert.equal(r.status, 500);
  assert.equal(admin.length, 1);
});
await prueba('después de tres esperas, devuelve lo último', async () => {
  respuestasAdmin.push([429, {}], [429, {}], [429, {}], [429, {}]);
  assert.equal((await pedir('/admin/listas-negras/dni', { token: await firmar() })).status, 429);
  assert.equal(admin.length, 4);
});

console.log('El registro de cada cambio:');
await prueba('antes de Admin, el intento con el actor del token; después, el resultado', async () => {
  respuestasAdmin.push([200, { id: 44 }]);
  const r = await pedir('/admin/listas-negras/cuenta', { token: await firmar(), metodo: 'POST',
    cuerpo: escribir({ countryCode: 'CO', accountNumber: '3000000001', accountType: 'Electronic', enable: true, reason: 'Prueba' }) });
  assert.equal(r.status, 200);
  const c = await r.json();
  assert.equal(c.registro, 'ok');
  assert.equal(registro.length, 2);
  const [intento, resultado] = registro;
  assert.equal(intento.accion, 'intento');
  assert.deepEqual(intento.actor, { email: 'analista@global66.com', nombre: 'Analista Prueba', uid: 'uid-analista' });
  assert.equal(intento.flujo, 'lens.regcheq.listas_negras.carga');
  assert.equal(intento.servicio, '/admin/listas-negras/cuenta');
  assert.equal(intento.operacion, 'CREAR');
  assert.equal(intento.ejecucionId, 'ej-prueba');
  assert.equal(intento.cambioId, c.cambioId);
  assert.equal(resultado.accion, 'resultado');
  assert.equal(resultado.cambioId, c.cambioId);
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.respuesta, { id: 44 });
});
await prueba('una edición registra el flujo de edición y lo informativo de meta', async () => {
  respuestasAdmin.push([200, {}]);
  await pedir('/admin/listas-negras/dominio', { token: await firmar(), metodo: 'PUT',
    cuerpo: escribir({ id: 7, status: false, reason: 'Prueba' },
                     { ...META, estadoAnterior: true, reasonAnterior: 'Antes', valor: 'desechable.prueba' }) });
  assert.equal(registro[0].flujo, 'lens.regcheq.listas_negras.edicion');
  assert.equal(registro[0].operacion, 'EDITAR');
  assert.deepEqual(registro[0].meta, { estadoAnterior: true, reasonAnterior: 'Antes', valor: 'desechable.prueba' });
});
await prueba('FALLA CERRADA: si el registro no responde, NO se llama a Admin', async () => {
  registroFalla = ev => ev.accion === 'intento';
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'POST',
    cuerpo: escribir({ dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).registro, 'no_disponible');
  assert.equal(admin.length, 0);
});
await prueba('FALLA CERRADA: sin el registro configurado, tampoco', async () => {
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'POST',
    env: { G66_ADMIN_REFRESH_TOKEN: 'refresh-de-prueba' },
    cuerpo: escribir({ dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }) });
  assert.equal(r.status, 503);
  assert.equal(admin.length + refrescos, 0);
});
await prueba('un error de Admin se registra como resultado no ok, con su status', async () => {
  respuestasAdmin.push([400, { message: 'duplicado' }]);
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'POST',
    cuerpo: escribir({ dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }) });
  assert.equal(r.status, 400);
  assert.deepEqual([registro[1].ok, registro[1].httpStatus], [false, 400]);
});
await prueba('si falla registrar el resultado, se reintenta una vez y si no se avisa', async () => {
  let fallas = 0;
  registroFalla = ev => ev.accion === 'resultado' && fallas++ < 5;
  respuestasAdmin.push([200, {}]);
  const r = await pedir('/admin/listas-negras/dni', { token: await firmar(), metodo: 'PUT',
    cuerpo: escribir({ dni: '1', countryCode: 'CO', status: false }) });
  assert.equal(r.status, 200, 'el cambio en Admin se hizo: se informa');
  assert.equal((await r.json()).registro, 'sin_resultado');
  assert.equal(fallas, 2);
});
await prueba('las filas sin operación van al registro con el actor del token y un id del servidor', async () => {
  const r = await pedir('/admin/listas-negras/dni/sin-operacion', { token: await firmar(), metodo: 'POST',
    cuerpo: { ejecucionId: 'ej-prueba', modo: 'carga', filas: [
      { valor: '99887766', countryCode: 'CO', resultado: 'OMITIDO_YA_EXISTE_ACTIVO' },
      { valor: '11', countryCode: 'CO', resultado: 'ERROR', error: 'Falta reason' }] } });
  assert.equal(r.status, 200);
  assert.equal(admin.length, 0);
  const ev = registro[0];
  assert.equal(ev.accion, 'sin_operacion');
  assert.equal(ev.flujo, 'lens.regcheq.listas_negras.carga');
  assert.equal(ev.actor.email, 'analista@global66.com');
  assert.equal(ev.filas.length, 2);
  assert.ok(ev.filas.every(f => /^[0-9a-f-]{36}$/.test(f.cambioId)));
});
for (const [nombre, cuerpo] of [
  ['un resultado que no es de una fila sin operación', { ejecucionId: 'e', modo: 'carga', filas: [{ valor: '1', resultado: 'CREADO' }] }],
  ['un cambioId del navegador', { ejecucionId: 'e', modo: 'carga', filas: [{ valor: '1', resultado: 'SIN_CAMBIOS', cambioId: 'x' }] }],
  ['el actor en una fila', { ejecucionId: 'e', modo: 'carga', filas: [{ valor: '1', resultado: 'SIN_CAMBIOS', actor_email: 'x' }] }],
  ['un modo inventado', { ejecucionId: 'e', modo: 'borrado', filas: [{ valor: '1', resultado: 'SIN_CAMBIOS' }] }],
  ['más de 500 filas', { ejecucionId: 'e', modo: 'carga', filas: Array.from({ length: 501 }, () => ({ valor: '1', resultado: 'SIN_CAMBIOS' })) }],
]) {
  await prueba(`sin-operacion con ${nombre}: 400`, async () => {
    const r = await pedir('/admin/listas-negras/dni/sin-operacion', { token: await firmar(), metodo: 'POST', cuerpo });
    assert.equal(r.status, 400);
    assert.equal(registro.length, 0);
  });
}
await prueba('los ids completados van con el actor del token', async () => {
  const r = await pedir('/admin/listas-negras/cuenta/ids', { token: await firmar(), metodo: 'POST',
    cuerpo: { ids: [{ cambioId: 'c-1', adminId: 55 }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(registro[0], { accion: 'ids', lista: 'CUENTA',
    actor: { email: 'analista@global66.com', nombre: 'Analista Prueba', uid: 'uid-analista' },
    ids: [{ cambioId: 'c-1', adminId: 55 }] });
});
await prueba('las rutas del registro piden el mismo permiso', async () => {
  perfiles['uid-analista'] = { role: 'Analista', modules: {} };
  const r = await pedir('/admin/listas-negras/dni/sin-operacion', { token: await firmar(), metodo: 'POST',
    cuerpo: { ejecucionId: 'e', modo: 'carga', filas: [{ valor: '1', resultado: 'SIN_CAMBIOS' }] } });
  assert.equal(r.status, 403);
  assert.equal(registro.length, 0);
});

await prueba('contrato con el Lambda: una carga, una edición, omitidas e ids', async () => {
  const t = await firmar();
  respuestasAdmin.push([200, { id: 44 }], [200, {}]);
  await pedir('/admin/listas-negras/cuenta', { token: t, metodo: 'POST',
    cuerpo: escribir({ countryCode: 'CO', accountNumber: '3000 0000 01', accountType: 'Electronic', enable: true, reason: 'Prueba' }) });
  await pedir('/admin/listas-negras/cuenta', { token: t, metodo: 'PUT',
    cuerpo: escribir({ id: 44, countryCode: 'CO', accountNumber: '3000000001', accountType: 'Electronic', enable: false, reason: 'Prueba' },
                     { ...META, estadoAnterior: true, reasonAnterior: 'Prueba' }) });
  await pedir('/admin/listas-negras/cuenta/sin-operacion', { token: t, metodo: 'POST',
    cuerpo: { ejecucionId: 'ej-prueba', modo: 'carga', filas: [{ valor: '3000000001', countryCode: 'CO', resultado: 'OMITIDO_YA_EXISTE_ACTIVO' }] } });
  await pedir('/admin/listas-negras/cuenta/ids', { token: t, metodo: 'POST',
    cuerpo: { ids: [{ cambioId: registro[0].cambioId, adminId: 44 }] } });
  assert.deepEqual(registro.map(e => e.accion), ['intento', 'resultado', 'intento', 'resultado', 'sin_operacion', 'ids']);
  // Los uuid del servidor, cambiados por ids estables: el archivo no cambia de una corrida a otra.
  const ids = new Map();
  const estable = JSON.stringify(registro, null, 1).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    u => ids.get(u) ?? (ids.set(u, `cambio-${ids.size + 1}`), ids.get(u)));
  writeFileSync(CONTRATO, estable + '\n');
});

console.log('Logs:');
await prueba('sin DNI, cuentas ni dominios', async () => {
  const lineas = [];
  const log = console.log;
  console.log = (...a) => lineas.push(a.join(' '));
  try {
    const t = await firmar();
    respuestasAdmin.push([200, {}], [200, {}], [500, {}]);
    await pedir('/admin/listas-negras/dni', { token: t, metodo: 'POST',
      cuerpo: escribir({ dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }) });
    await pedir('/admin/listas-negras/cuenta', { token: t, metodo: 'PUT',
      cuerpo: escribir({ id: 9, countryCode: 'CO', accountNumber: '3000000001', accountType: null, enable: false, reason: 'Prueba' }) });
    await pedir('/admin/listas-negras/dominio', { token: t, metodo: 'POST', cuerpo: escribir({ email: 'desechable.prueba', reason: 'Prueba' }) });
    registroFalla = () => true;
    await pedir('/admin/listas-negras/dni', { token: t, metodo: 'POST',
      cuerpo: escribir({ dni: '99887766', countryCode: 'CO', countryName: 'Colombia', reason: 'Prueba' }) });
  } finally { console.log = log; }
  assert.ok(lineas.length >= 3);
  for (const l of lineas) assert.doesNotMatch(l, /99887766|3000000001|desechable|analista@/, l);
});

console.log('Lo que no cambia:');
await prueba('el preflight de estas rutas admite PUT; el de las demás sigue igual', async () => {
  const pre = ruta => worker.fetch(new Request(`https://w.prueba${ruta}`, { method: 'OPTIONS', headers: { Origin: ORIGEN } }), ENV, CTX);
  assert.equal((await pre('/admin/listas-negras/dni')).headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, OPTIONS');
  for (const ruta of ['/admin/customer-status', '/pjud/caso/90000101', '/colas/log', '/relay']) {
    assert.equal((await pre(ruta)).headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS', ruta);
  }
});
await prueba('/admin/customer-status sigue igual: GET es 405, sin pedir token de Lens', async () => {
  const r = await pedir('/admin/customer-status');
  assert.equal(r.status, 405);
  assert.equal(refrescos, 0);
});

console.log(`\n  Todo OK. (${ok} pruebas)`);
