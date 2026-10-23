// /pjud/caso/{id}: la única ruta del Worker con verificación de ID token.
//
// Se generan llaves RSA propias y se firman tokens con la forma de Firebase:
// el Worker baja las llaves públicas de un `fetch` simulado, así que ni Google
// ni el Lambda lector se enteran.
//
// Correr:
//   npx esbuild src/index.ts --bundle --format=esm --platform=neutral \
//     --outfile=test/worker.mjs
//   node test/pjud.mjs

import assert from 'node:assert/strict';
import worker from './worker.mjs';

const PROYECTO = 'lens-ai-9da63';
const LECTOR = 'https://lector.prueba/';
const ENV = { PJUD_LECTOR_URL: LECTOR, PJUD_LECTOR_SECRET: 'secreto-lector' };
const CTX = { waitUntil() {} };

const b64u = buf => Buffer.from(buf).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const otra = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'llave-1', alg: 'RS256', use: 'sig' };

async function firmar(claims = {}, { cab = {}, clave = privateKey } = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'llave-1', typ: 'JWT', ...cab }));
  const p = b64u(JSON.stringify({
    aud: PROYECTO, iss: `https://securetoken.google.com/${PROYECTO}`, sub: 'uid-prueba',
    iat: ahora - 10, auth_time: ahora - 10, exp: ahora + 3600,
    email: 'analista@global66.com', email_verified: true, ...claims,
  }));
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(firma)}`;
}

let lector = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('securetoken@system.gserviceaccount.com')) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } });
  }
  if (u.startsWith(LECTOR.replace(/\/$/, ''))) {
    lector.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ existe: true, en_proceso: null }), { status: 200 });
  }
  throw new Error(`fetch no esperado: ${u}`);
};

const pedir = (ruta, { token, metodo = 'GET', env = ENV } = {}) => worker.fetch(new Request(`https://w.prueba${ruta}`, {
  method: metodo, headers: { Origin: 'https://bmackenna-g66.github.io', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
}), env, CTX);

let ok = 0;
const prueba = async (nombre, fn) => { lector = []; await fn(); ok++; console.log('  ✓', nombre); };
const motivo = async r => (await r.json()).motivo;

console.log('Autenticación:');
await prueba('sin token: 401 y no llega al lector', async () => {
  const r = await pedir('/pjud/caso/90000101');
  assert.equal(r.status, 401);
  assert.equal(lector.length, 0);
});
await prueba('token válido de @global66.com: 200, reenviado con el secreto y solo el caseId', async () => {
  const r = await pedir('/pjud/caso/90000101', { token: await firmar() });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { existe: true, en_proceso: null });
  assert.equal(lector.length, 1);
  assert.equal(lector[0].headers['x-pjud-lector'], 'secreto-lector');
  assert.deepEqual(lector[0].body, { caseId: '90000101' });
});
const rechazos = [
  ['cuenta de Google de otro dominio (el alta está abierta)', { email: 'alguien@gmail.com' }, {}, 'dominio no autorizado'],
  ['email sin verificar', { email_verified: false }, {}, 'email sin verificar'],
  ['token vencido', { exp: Math.floor(Date.now() / 1000) - 5 }, {}, 'token vencido'],
  ['otra audiencia (otro proyecto de Firebase)', { aud: 'otro-proyecto' }, {}, 'audiencia inválida'],
  ['otro emisor', { iss: 'https://securetoken.google.com/otro-proyecto' }, {}, 'emisor inválido'],
  ['firmado con otra llave', {}, { clave: otra.privateKey }, 'firma inválida'],
  ['algoritmo distinto de RS256', {}, { cab: { alg: 'HS256' } }, 'algoritmo no admitido'],
  ['llave desconocida', {}, { cab: { kid: 'no-existe' } }, 'llave desconocida'],
];
for (const [nombre, claims, opts, esperado] of rechazos) {
  await prueba(`${nombre}: 401`, async () => {
    const r = await pedir('/pjud/caso/90000101', { token: await firmar(claims, opts) });
    assert.equal(r.status, 401);
    assert.equal(await motivo(r), esperado);
    assert.equal(lector.length, 0);
  });
}
await prueba('un token cualquiera (no JWT): 401', async () => {
  assert.equal((await pedir('/pjud/caso/90000101', { token: 'abc' })).status, 401);
});

console.log('Ruta:');
await prueba('un caseId que no es un número de caso: 404, sin pedir token ni llegar al lector', async () => {
  assert.equal((await pedir('/pjud/caso/..%2Fconfig')).status, 404);
  assert.equal((await pedir('/pjud/caso/abc')).status, 404);
  assert.equal(lector.length, 0);
});
await prueba('otro método: 405', async () => {
  assert.equal((await pedir('/pjud/caso/90000101', { metodo: 'POST', token: await firmar() })).status, 405);
});
await prueba('sin el lector configurado: 503', async () => {
  assert.equal((await pedir('/pjud/caso/90000101', { token: await firmar(), env: {} })).status, 503);
});

console.log('Las demás rutas no cambian:');
await prueba('/colas/log sigue sin pedir token (responde lo de siempre, no 401)', async () => {
  const r = await worker.fetch(new Request('https://w.prueba/colas/log', { method: 'POST', body: '{}' }), {}, CTX);
  assert.notEqual(r.status, 401);
  assert.match((await r.json()).error, /Logger no configurado/);
});
await prueba('el preflight OPTIONS de /pjud permite el header Authorization', async () => {
  const r = await pedir('/pjud/caso/90000101', { metodo: 'OPTIONS' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

console.log(`\n  Todo OK. (${ok} pruebas)`);
