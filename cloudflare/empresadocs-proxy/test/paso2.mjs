// Prueba del PASO 2 migrado a ms-customer, contra el Worker REAL.
//
// No toca nada: se stubea `fetch`, así que ni Admin ni ms-customer se enteran.
// Lo que verifica son las cuatro reglas que, si se pierden, dejan un cliente en
// el estado equivocado — y el respaldo, que es lo que permite volver atrás.
//
// Correr:
//   npx esbuild src/index.ts --bundle --format=esm --platform=neutral \
//     --outfile=test/worker.mjs
//   node test/paso2.mjs
//
// (el bundle es temporal y está en .gitignore)

import worker from './worker.mjs';

// ms-customer y api.global66.com de mentira: registran qué se llamó y en qué orden.
let llamadas = [];
let modo = {};
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  llamadas.push(`${opt.method || 'GET'} ${u.replace('https://api.global66.com','ADMIN').replace('https://ms-customer.test','MSC')}`);
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('/admin/refresh-token')) return j({ idToken: 'tok' });
  if (u.includes('/blacklist')) return j({ ok: true });
  if (u.includes('MSC') || u.includes('ms-customer')) {
    if (u.includes('/compliance/resolve')) {
      if (modo.resolverVacio) return j({ errors: [{ code: 'UNRESOLVED_COMPLIANCE_NOT_FOUND' }] }, 404);
      if (modo.resolverFalla)  return j({ errors: [{ code: 'FORBIDDEN' }] }, 403);
      return j({ resueltos: 1 });
    }
    if (u.includes('/compliance')) return modo.crearFalla ? j({ error: 'boom' }, 500) : j({ id: 99 });
    if (u.includes('/status'))     return j({ effective: 'FULLY_BLOCKED', unresolved: 1 });
  }
  return j({ ok: true });
};

const correr = async (env, status) => {
  llamadas = [];
  const req = new Request('https://w/admin/customer-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
    body: JSON.stringify({ customerIds: ['4535350'], status, comment: 'COMPLIANCE_OFFICER_REQUEST',
                           observation: 'obs', agent: 'a@g66.com', countryCode: 'CL', ofacFlag: true }),
  });
  const res = await worker.fetch(req, env, { waitUntil() {} });
  return { body: await res.json(), llamadas: [...llamadas] };
};

let f = 0; const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

console.log('── Respaldo: sin la variable, el camino VIEJO intacto ──');
let r = await correr({ G66_ADMIN_REFRESH_TOKEN: 'x' }, 'FULLY_BLOCKED');
ok('pega a ADMIN /compliance/FULLY_BLOCKED', r.llamadas.some(l => l.includes('ADMIN/customer/bo/customer-info/4535350/compliance/FULLY_BLOCKED')), r.llamadas);
ok('NO toca ms-customer', !r.llamadas.some(l => l.includes('MSC')), r.llamadas);

console.log('\n── Modo nuevo SIN la URL base: aborta sin llamar a nadie ──');
r = await correr({ G66_ADMIN_REFRESH_TOKEN: 'x', MODELO_ADMIN: 'nuevo' }, 'FULLY_BLOCKED');
ok('no llama a compliance', !r.llamadas.some(l => l.includes('compliance')), r.llamadas);
ok('el error lo explica', JSON.stringify(r.body).includes('MS_CUSTOMER_BASE'));

const ENV = { G66_ADMIN_REFRESH_TOKEN: 'x', MODELO_ADMIN: 'nuevo', MS_CUSTOMER_BASE: 'https://ms-customer.test' };

console.log('\n── Regla 1: CREAR antes de RESOLVER ──');
modo = {}; r = await correr(ENV, 'FULLY_BLOCKED');
const iCrear = r.llamadas.findIndex(l => l.includes('MSC') && l.includes('/compliance') && !l.includes('resolve'));
const iRes   = r.llamadas.findIndex(l => l.includes('/compliance/resolve'));
ok('crear ocurre ANTES que resolver', iCrear >= 0 && iRes > iCrear, r.llamadas);

console.log('\n── Si falla el CREATE, no se resuelve nada ──');
modo = { crearFalla: true }; r = await correr(ENV, 'FULLY_BLOCKED');
ok('no se llamó a resolve', !r.llamadas.some(l => l.includes('resolve')), r.llamadas);
ok('el paso queda en error', r.body.results[0].steps.compliance.ok === false);

console.log('\n── Regla 2: UNRESOLVED_COMPLIANCE_NOT_FOUND es ÉXITO ──');
modo = { resolverVacio: true }; r = await correr(ENV, 'NORMAL');
ok('el paso cierra OK igual', r.body.results[0].steps.compliance.ok === true, r.body.results[0].steps.compliance);
modo = { resolverFalla: true }; r = await correr(ENV, 'NORMAL');
ok('pero otro error SÍ falla', r.body.results[0].steps.compliance.ok === false);

console.log('\n── Liberar Normal: solo resuelve, no crea ──');
modo = {}; r = await correr(ENV, 'NORMAL');
ok('no crea bloqueo', !r.llamadas.some(l => l.includes('MSC') && l.includes('/compliance') && !l.includes('resolve') && !l.includes('status')), r.llamadas);
ok('sí resuelve', r.llamadas.some(l => l.includes('resolve')));

console.log('\n── Regla 3 y 4 ──');
modo = {}; r = await correr(ENV, 'FULLY_BLOCKED');
ok('usa la carpeta Iuse', r.llamadas.filter(l => l.includes('MSC')).every(l => l.includes('/iuse/') || l.includes('/status')), r.llamadas);
ok('verifica el estado después', r.llamadas.some(l => l.includes('/status')), r.llamadas);
ok('la evidencia queda en la respuesta', !!r.body.results[0].steps.compliance.data.estadoDespues);

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK: las cuatro reglas y el respaldo.');
process.exit(f ? 1 : 0);
