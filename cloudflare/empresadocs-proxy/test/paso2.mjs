// Prueba del PASO 2 migrado a ms-customer, contra el Worker REAL.
//
// No toca nada: se stubea `fetch`, así que ni Admin ni ms-customer se enteran.
// Verifica las reglas que, si se pierden, dejan un cliente en el estado
// equivocado — y el respaldo, que es lo que permite volver atrás.
//
// El contrato replicado acá es el de `ms-customer` v2 (17-09-2026): rutas bajo
// `/customer/iuse/**`, resolver POR COMMENT vía PATCH, `status` obligatorio en
// el create y `observation` sin signos de puntuación.
//
// Correr:
//   npx esbuild src/index.ts --bundle --format=esm --platform=neutral \
//     --outfile=test/worker.mjs
//   node test/paso2.mjs
//
// (el bundle es temporal y está en .gitignore)

import worker from './worker.mjs';

let llamadas = [];
let modo = {};
// Lo que el cliente tiene sin resolver. Por defecto, el escenario REAL del
// cliente de prueba 4535350 al 17-09-2026: dos vigentes, y el del bot con el
// comment genérico de fallback.
let sinResolver = [
  { complianceId: 4223940, comment: 'OTHER_FULLY_BLOCKED', status: 'FULLY_BLOCKED' },
  { complianceId: 4223019, comment: 'NORMAL', status: 'NORMAL' },
];

globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  const met = opt.method || 'GET';
  let cuerpo = {};
  try { cuerpo = opt.body ? JSON.parse(opt.body) : {}; } catch { /* form-urlencoded */ }
  llamadas.push({ met, u: u.replace('https://api.global66.com', ''), cuerpo, headers: opt.headers || {} });

  const j = (o, s = 200) => new Response(o === null ? '' : JSON.stringify(o), {
    status: s, headers: { 'Content-Type': 'application/json' },
  });

  if (u.includes('/admin/refresh-token')) return j({ idToken: 'tok' });
  if (u.includes('/blacklist')) return j({ ok: true });

  if (u.includes('/customer/iuse/compliance')) {
    if (u.includes('/comments/unresolved')) {
      return modo.listaFalla ? j({ error: 'boom' }, 500) : j(sinResolver);
    }
    if (u.includes('/resolve')) {
      if (modo.resolverVacio) return j({ code: 'UNRESOLVED_COMPLIANCE_NOT_FOUND' }, 404);
      if (modo.resolverFalla) return j({ code: 'COMPLIANCE_STATUS_CANNOT_BE_RESOLVED' }, 409);
      return j(null, 200);                     // 200 SIN body, como el real
    }
    if (u.includes('/status')) return j({ status: 'FULLY_BLOCKED', comment: 'COMPLIANCE_OFFICER_REQUEST' });
    return modo.crearFalla ? j({ code: 'COMMENT_NOT_FOUND' }, 400) : j({ id: 99 }, 201);
  }
  return j({ ok: true });
};

const correr = async (env, status, extra = {}) => {
  llamadas = [];
  const req = new Request('https://w/admin/customer-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
    body: JSON.stringify({
      customerIds: ['4535350'], status, comment: 'COMPLIANCE_OFFICER_REQUEST',
      observation: 'Cliente revisado, sin hallazgos.', agent: 'ana@global66.com',
      countryCode: 'CL', ofacFlag: true, ...extra,
    }),
  });
  const res = await worker.fetch(req, env, { waitUntil() {} });
  return { body: await res.json(), llamadas: [...llamadas] };
};

const msc = r => r.llamadas.filter(l => l.u.includes('/customer/iuse/compliance'));
let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

const ENV = { G66_ADMIN_REFRESH_TOKEN: 'x', MODELO_ADMIN: 'nuevo' };

console.log('── Respaldo: sin la variable, el camino VIEJO intacto ──');
let r = await correr({ G66_ADMIN_REFRESH_TOKEN: 'x' }, 'FULLY_BLOCKED');
ok('pega al endpoint viejo', r.llamadas.some(l => l.u.includes('/customer/bo/customer-info/4535350/compliance/FULLY_BLOCKED')));
ok('NO toca /customer/iuse', msc(r).length === 0, msc(r).map(l => l.u));

console.log('\n── Las rutas reales ──');
r = await correr(ENV, 'FULLY_BLOCKED');
ok('crea con POST /customer/iuse/compliance', msc(r).some(l => l.met === 'POST' && l.u === '/customer/iuse/compliance'), msc(r).map(l => l.met + ' ' + l.u));
ok('resuelve con PATCH .../customers/4535350/resolve', msc(r).some(l => l.met === 'PATCH' && l.u.endsWith('/customers/4535350/resolve')));
ok('consulta el estado al final', msc(r).some(l => l.u.endsWith('/customers/4535350/status')));

console.log('\n── Regla: CREAR antes de RESOLVER ──');
const iC = msc(r).findIndex(l => l.met === 'POST');
const iR = msc(r).findIndex(l => l.met === 'PATCH');
ok('crear ocurre ANTES que resolver', iC >= 0 && iR > iC, msc(r).map(l => l.met + ' ' + l.u));

console.log('\n── El create manda lo que el contrato exige ──');
const crear = msc(r).find(l => l.met === 'POST');
ok('customerId en el BODY, no en la ruta', crear.cuerpo.customerId === 4535350, crear.cuerpo);
ok('status SIEMPRE (fallback de catálogo)', crear.cuerpo.status === 'FULLY_BLOCKED', crear.cuerpo);
ok('createdBy es un actor, no un email', crear.cuerpo.createdBy === 'OPERATION_BOT', crear.cuerpo);
ok('observation sin signos de puntuación',
   /^[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]*$/.test(crear.cuerpo.observation), crear.cuerpo.observation);

console.log('\n── Resolver es POR COMMENT, y hay que barrer los que están ──');
const patches = msc(r).filter(l => l.met === 'PATCH');
ok('resuelve OTHER_FULLY_BLOCKED (el del bot)', patches.some(l => l.cuerpo.comment === 'OTHER_FULLY_BLOCKED'), patches.map(l => l.cuerpo.comment));
ok('resuelve también el NORMAL vigente', patches.some(l => l.cuerpo.comment === 'NORMAL'), patches.map(l => l.cuerpo.comment));
ok('NO resuelve el que acaba de crear', !patches.some(l => l.cuerpo.comment === 'COMPLIANCE_OFFICER_REQUEST'), patches.map(l => l.cuerpo.comment));
ok('manda resolvedComment (obligatorio)', patches.every(l => !!l.cuerpo.resolvedComment), patches.map(l => l.cuerpo));

console.log('\n── Si falla el CREATE, no se resuelve nada ──');
modo = { crearFalla: true }; r = await correr(ENV, 'FULLY_BLOCKED');
ok('no se llamó a resolve', !msc(r).some(l => l.met === 'PATCH'), msc(r).map(l => l.met + ' ' + l.u));
ok('el paso queda en error', r.body.results[0].steps.compliance.ok === false);

console.log('\n── Si no se puede listar lo vigente, tampoco se resuelve a ciegas ──');
modo = { listaFalla: true }; r = await correr(ENV, 'FULLY_BLOCKED');
ok('no se llamó a resolve', !msc(r).some(l => l.met === 'PATCH'));
ok('el paso queda en error', r.body.results[0].steps.compliance.ok === false);

console.log('\n── "Ya no estaba" es ÉXITO; otro error no ──');
modo = { resolverVacio: true }; r = await correr(ENV, 'NORMAL');
ok('el paso cierra OK igual', r.body.results[0].steps.compliance.ok === true, r.body.results[0].steps.compliance);
modo = { resolverFalla: true }; r = await correr(ENV, 'NORMAL');
ok('pero CANNOT_BE_RESOLVED SÍ falla', r.body.results[0].steps.compliance.ok === false);

console.log('\n── Liberar Normal: no crea, solo resuelve ──');
modo = {}; r = await correr(ENV, 'NORMAL');
ok('no crea bloqueo', !msc(r).some(l => l.met === 'POST'), msc(r).map(l => l.met + ' ' + l.u));
ok('resuelve los DOS vigentes', msc(r).filter(l => l.met === 'PATCH').length === 2, msc(r).filter(l => l.met === 'PATCH').map(l => l.cuerpo.comment));

console.log('\n── Cliente sin nada vigente: no explota ──');
sinResolver = []; r = await correr(ENV, 'NORMAL');
ok('no llama a resolve', !msc(r).some(l => l.met === 'PATCH'));
ok('cierra OK', r.body.results[0].steps.compliance.ok === true, r.body.results[0].steps.compliance);

console.log('\n── La evidencia queda en la respuesta ──');
sinResolver = [{ complianceId: 1, comment: 'OTHER_FULLY_BLOCKED', status: 'FULLY_BLOCKED' }];
r = await correr(ENV, 'FULLY_BLOCKED');
const d = r.body.results[0].steps.compliance.data;
ok('qué había antes', !!d.sinResolverAntes);
ok('qué se resolvió', !!d.resolver);
ok('cómo quedó después', !!d.estadoDespues);

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
