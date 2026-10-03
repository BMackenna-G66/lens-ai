// Prueba del Worker lens-lector-web, contra el Worker REAL armado con esbuild.
//
// No sale a internet: se reemplaza `fetch` por una web falsa. Lo que se prueba es
// lo que, si se pierde, convierte a este Worker en una puerta a la red interna o
// en un proxy abierto: qué URLs acepta, que cada salto de redirección se valide
// igual que la URL original, que no reenvíe nada del cliente, y los topes.
//
// Correr:
//   npm test        (= esbuild src/index.ts → test/worker.mjs  y  node test/lector.mjs)

import worker, {
  validarUrl, leerUna, dentroDeLaTasa, _reiniciarTasa,
  MAX_URLS, MAX_BYTES, MAX_REDIRECCIONES, TASA_POR_MINUTO, TIMEOUT_MS,
} from './worker.mjs';

let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

// ── La web falsa ───────────────────────────────────────────────────────────
let pedidos = [];
const web = {
  'https://empresa.cl/': () => new Response('<html><body>Hola</body></html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Server': 'nginx', 'Set-Cookie': 'sesion=secreta' } }),
  'http://empresa.cl/': () => new Response(null, { status: 301, headers: { Location: 'https://empresa.cl/' } }),
  'https://empresa.cl/terminos': () => new Response('no está', { status: 404, headers: { 'Content-Type': 'text/html' } }),
  'https://salta-a-interno.cl/': () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } }),
  'https://salta-a-localhost.cl/': () => new Response(null, { status: 302, headers: { Location: 'http://localhost:8080/' } }),
  'https://salta-a-puerto.cl/': () => new Response(null, { status: 302, headers: { Location: 'https://otro.cl:8443/' } }),
  'https://bucle.cl/': () => new Response(null, { status: 302, headers: { Location: 'https://bucle.cl/' } }),
  'https://pesada.cl/': () => new Response('x'.repeat(MAX_BYTES + 5_000), { status: 200, headers: { 'Content-Type': 'text/html' } }),
  'https://empresa.cl/folleto.pdf': () => new Response('%PDF-1.4 binario', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
  'https://lenta.cl/': (opt) => new Promise((_, rechazar) => {
    opt.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rechazar(e); });
  }),
};
globalThis.fetch = async (url, opt = {}) => {
  pedidos.push({ url: String(url), opt });
  const h = web[String(url)];
  if (!h) return new Response('no existe', { status: 404, headers: { 'Content-Type': 'text/html' } });
  return h(opt);
};

const llamar = async (cuerpo, { origen = 'https://bmackenna-g66.github.io', metodo = 'POST', ruta = '/leer', ip = '1.1.1.1', headers = {} } = {}) => {
  const req = new Request('https://lens-lector-web.x.workers.dev' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(origen ? { Origin: origen } : {}), 'CF-Connecting-IP': ip, ...headers },
    body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined,
  });
  const res = await worker.fetch(req, {});
  let body = null;
  try { body = await res.json(); } catch { /* 204 */ }
  return { status: res.status, body, headers: res.headers };
};

console.log('── Qué URLs se aceptan ──');
for (const [u, esperado] of [
  ['https://empresa.cl/', true],
  ['http://empresa.cl/contacto', true],
  ['https://empresa.cl:443/', true],
  ['http://empresa.cl:80/', true],
  ['ftp://empresa.cl/', false],
  ['file:///etc/passwd', false],
  ['javascript:alert(1)', false],
  ['https://empresa.cl:8443/', false],
  ['https://usuario:clave@empresa.cl/', false],
  ['http://127.0.0.1/', false],
  ['http://2130706433/', false],          // 127.0.0.1 escrito como entero
  ['http://0x7f000001/', false],          // y en hexadecimal
  ['http://169.254.169.254/latest/meta-data/', false],
  ['http://[::1]/', false],
  ['http://localhost/', false],
  ['http://api.localhost/', false],
  ['http://intranet/', false],            // sin punto: nombre interno
  ['http://servidor.local/', false],
  ['http://app.internal/', false],
  ['', false],
  ['no es una url', false],
]) {
  const v = validarUrl(u);
  ok(`${esperado ? 'acepta ' : 'rechaza'} ${u || '(vacía)'}${v.ok ? '' : '  — ' + v.motivo}`, v.ok === esperado, v);
}

console.log('\n── Una lectura normal ──');
pedidos = [];
let r = await leerUna('https://empresa.cl/');
ok('trae el HTML crudo', r.html?.includes('Hola'), r);
ok('el status y la URL final', r.status === 200 && r.urlFinal === 'https://empresa.cl/', r);
ok('los headers de evidencia', r.headers.server === 'nginx', r.headers);
ok('NUNCA devuelve set-cookie', !('set-cookie' in r.headers), r.headers);
ok('sale con GET', pedidos[0].opt.method === 'GET');
ok('sigue las redirecciones a mano', pedidos[0].opt.redirect === 'manual');
const enviados = Object.keys(pedidos[0].opt.headers || {}).map(h => h.toLowerCase());
ok('no manda cookies ni authorization', !enviados.includes('cookie') && !enviados.includes('authorization'), enviados);

console.log('\n── Las redirecciones se registran y se validan ──');
r = await leerUna('http://empresa.cl/');
ok('registra la cadena', r.redirecciones.length === 1 && r.redirecciones[0].status === 301, r.redirecciones);
ok('y llega a la URL final', r.urlFinal === 'https://empresa.cl/' && r.status === 200, r);
r = await leerUna('https://salta-a-interno.cl/');
ok('un salto a una IP interna se corta', !r.ok && /IP literal/.test(r.error), r.error);
ok('  y NO se pide', !pedidos.some(p => p.url.includes('169.254')));
r = await leerUna('https://salta-a-localhost.cl/');
ok('un salto a localhost se corta', !r.ok && /bloqueada/.test(r.error), r.error);
r = await leerUna('https://salta-a-puerto.cl/');
ok('un salto a otro puerto se corta', !r.ok && /puerto/.test(r.error), r.error);
r = await leerUna('https://bucle.cl/');
ok(`un bucle se corta a las ${MAX_REDIRECCIONES} redirecciones`, !r.ok && /redirecciones/.test(r.error), r.error);

console.log('\n── Los topes ──');
r = await leerUna('https://pesada.cl/');
ok(`el cuerpo se corta en ${MAX_BYTES} bytes`, r.bytes === MAX_BYTES && r.truncado && r.html.length === MAX_BYTES, { bytes: r.bytes, truncado: r.truncado });
r = await leerUna('https://empresa.cl/folleto.pdf');
ok('un PDF se informa sin cuerpo', r.ok && r.status === 200 && r.html === null && /pdf/.test(r.contentType), r);
r = await leerUna('https://empresa.cl/terminos');
ok('un 404 es una respuesta, no un error', r.ok && r.status === 404 && r.error === null, r);
const t0 = Date.now();
r = await leerUna('https://lenta.cl/');
ok(`una página que no responde se corta a los ${TIMEOUT_MS / 1000} s`, !r.ok && /sin respuesta/.test(r.error) && Date.now() - t0 < TIMEOUT_MS + 2_000, { error: r.error, ms: Date.now() - t0 });

console.log('\n── HTTP: origen, método, forma y tasa ──');
_reiniciarTasa();
let h = await llamar({ urls: ['https://empresa.cl/'] });
ok('el origen de Lens puede', h.status === 200 && h.body.lecturas.length === 1, h);
ok('  con CORS para ese origen y nada más', h.headers.get('access-control-allow-origin') === 'https://bmackenna-g66.github.io');
h = await llamar({ urls: ['https://empresa.cl/'] }, { origen: 'https://otro-sitio.com' });
ok('otro origen: 403', h.status === 403, h);
ok('  sin CORS', !h.headers.get('access-control-allow-origin'));
h = await llamar({ urls: ['https://empresa.cl/'] }, { origen: null });
ok('sin origen: 403', h.status === 403, h);
h = await llamar(null, { metodo: 'GET' });
ok('GET /leer: 405', h.status === 405, h);
h = await llamar(null, { metodo: 'OPTIONS' });
ok('el preflight responde 204', h.status === 204, h);
h = await llamar({ urls: [] });
ok('sin URLs: 400', h.status === 400, h);
h = await llamar({ urls: Array.from({ length: MAX_URLS + 1 }, (_, i) => `https://e${i}.cl/`) });
ok(`más de ${MAX_URLS} URLs: 400`, h.status === 400, h);
h = await llamar({ urls: ['http://127.0.0.1/'] });
ok('una URL prohibida vuelve como lectura con error, sin pedirse', h.status === 200 && h.body.lecturas[0].error && !pedidos.some(p => p.url.includes('127.0.0.1')), h.body);
h = await llamar(null, { ruta: '/salud', metodo: 'GET' });
ok('/salud', h.status === 200 && h.body.ok === true, h);
h = await llamar({ urls: ['https://empresa.cl/'] }, { headers: { Cookie: 'sesion=del-analista', Authorization: 'Bearer x' } });
const ultimo = pedidos[pedidos.length - 1].opt.headers || {};
ok('lo que manda el cliente NO se reenvía', !Object.keys(ultimo).some(k => /cookie|authorization/i.test(k)), ultimo);

_reiniciarTasa();
let ultimoStatus = 0;
for (let i = 0; i < TASA_POR_MINUTO + 1; i++) ultimoStatus = (await llamar({ urls: ['https://empresa.cl/'] }, { ip: '9.9.9.9' })).status;
ok(`el pedido ${TASA_POR_MINUTO + 1} del minuto: 429`, ultimoStatus === 429, ultimoStatus);
ok('  otra IP sigue pudiendo', (await llamar({ urls: ['https://empresa.cl/'] }, { ip: '8.8.8.8' })).status === 200);
ok('  y al minuto se libera', dentroDeLaTasa('9.9.9.9', Date.now() + 61_000));

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
