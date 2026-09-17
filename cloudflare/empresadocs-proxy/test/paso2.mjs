// Prueba del PASO 2 migrado a ms-customer, contra el Worker REAL.
//
// No toca nada: se stubea `fetch`, así que ni Admin ni ms-customer se enteran.
// Verifica las reglas que, si se pierden, dejan un cliente en el estado
// equivocado — y el respaldo, que es lo que permite volver atrás.
//
// El contrato replicado acá es el de `ms-customer` carpeta **BO** (17-09-2026):
// rutas bajo `/customer/bo/compliance`, resolver POR complianceId (uno por
// llamada), sin campo `status` en el create, duplicado = error, `history` en vez
// de `/status` + `/comments/unresolved`, y `observation` sin puntuación.
//
// Se usa BO y no Iuse porque Iuse NO está publicada hacia internet: probado, el
// gateway responde lo mismo que para una ruta inexistente.
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
let creado = false;
let resueltos = [];
let cmtCreado = 'COMPLIANCE_OFFICER_REQUEST';
// Lo que queda vigente después de resolver: se quitan los que se resolvieron OK.
const vigentes = () => sinResolver.filter(r => !resueltos.includes(String(r.id)) || modo.resolverFalla || modo.resolverOtraArea);
// Lo que el cliente tiene sin resolver. Por defecto, el escenario REAL del
// cliente de prueba 4535350 al 17-09-2026: dos vigentes, y el del bot con el
// comment genérico de fallback.
let sinResolver = [
  { id: 4223940, comment: 'OTHER_FULLY_BLOCKED', status: 'FULLY_BLOCKED', resolved: false },
  { id: 4223019, comment: 'NORMAL', status: 'NORMAL', resolved: false },
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

  if (u.includes('/customer/bo/compliance')) {
    if (u.includes('/history')) {
      if (modo.listaFalla) return j({ error: 'boom' }, 500);
      // Siempre lo que queda vigente; el creado va primero, como el orden real.
      return j(creado ? [{ id: 99, comment: cmtCreado, status: 'BLOCKED', resolved: false }, ...vigentes()] : vigentes());
    }
    if (u.includes('/resolve')) {
      const cid = u.match(/compliance\/(\d+)\/resolve/)?.[1];
      resueltos.push(cid);
      if (modo.resolverTerminal) return j({ code: 'COMPLIANCE_STATUS_CANNOT_BE_RESOLVED' }, 409);
      if (modo.resolverOtraArea) return j({ code: 'COMPLIANCE_INVALID_RESOLVE_AREA' }, 403);
      if (modo.resolverFalla) return j({ code: 'BOOM' }, 500);
      return j(null, 200);                     // 200 SIN body, como el real
    }
    if (modo.crearDuplicado) return j({ code: 'DUPLICATE_UNRESOLVED_COMMENT' }, 409);
    if (modo.crearFalla) return j({ code: 'COMMENT_NOT_FOUND' }, 400);
    creado = true; return j({ id: 99 }, 201);
  }
  return j({ ok: true });
};

const correr = async (env, status, extra = {}) => {
  llamadas = []; creado = false; resueltos = [];
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

const msc = r => r.llamadas.filter(l => l.u.includes('/customer/bo/compliance'));
let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

const ENV = { G66_ADMIN_REFRESH_TOKEN: 'x', MODELO_ADMIN: 'nuevo' };
const paso = r => r.body.results[0].steps.compliance;

console.log('── Respaldo: sin la variable, el camino VIEJO intacto ──');
let r = await correr({ G66_ADMIN_REFRESH_TOKEN: 'x' }, 'BLOCKED');
ok('pega al endpoint viejo', r.llamadas.some(l => l.u.includes('/customer/bo/customer-info/4535350/compliance/BLOCKED')));
ok('NO toca el modelo nuevo', msc(r).length === 0, msc(r).map(l => l.u));

console.log('\n── Las rutas reales de BO ──');
modo = {}; r = await correr(ENV, 'BLOCKED');
ok('lista con GET .../customers/4535350/history', msc(r).some(l => l.met === 'GET' && l.u.endsWith('/customers/4535350/history')), msc(r).map(l => l.met + ' ' + l.u));
ok('crea con POST /customer/bo/compliance', msc(r).some(l => l.met === 'POST' && l.u === '/customer/bo/compliance'));
ok('resuelve con PATCH /customer/bo/compliance/{id}/resolve', msc(r).some(l => l.met === 'PATCH' && /\/compliance\/\d+\/resolve$/.test(l.u)));
ok('vuelve a consultar history al final', msc(r).filter(l => l.u.endsWith('/history')).length === 2);

console.log('\n── Orden: listar → CREAR → resolver → verificar ──');
const secuencia = msc(r).map(l => l.met === 'GET' ? 'H' : l.met === 'POST' ? 'C' : 'R').join('');
ok('secuencia H C R... H', /^HC R*H$/.test(secuencia.replace(/R+/, ' R*').replace(' R*', 'R*')) || /^HCR+H$/.test(secuencia), secuencia);

console.log('\n── El create manda lo que BO exige (y NADA más) ──');
const crear = msc(r).find(l => l.met === 'POST');
ok('customerId en el BODY', crear.cuerpo.customerId === 4535350, crear.cuerpo);
ok('NO manda status (en BO no existe)', crear.cuerpo.status === undefined, crear.cuerpo);
ok('NO manda createdBy (sale del token)', crear.cuerpo.createdBy === undefined, crear.cuerpo);
ok('observation sin signos de puntuación', /^[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]*$/.test(crear.cuerpo.observation), crear.cuerpo.observation);
ok('manda Claim-Email', crear.headers['Claim-Email'] === 'ana@global66.com', crear.headers);

console.log('\n── Resolver es POR ID, y el NORMAL terminal se saltea ──');
const patches = msc(r).filter(l => l.met === 'PATCH');
ok('resuelve el 4223940 (el del bot)', patches.some(l => l.u.includes('/4223940/')), patches.map(l => l.u));
ok('NO intenta resolver el NORMAL (terminal)', !patches.some(l => l.u.includes('/4223019/')), patches.map(l => l.u));
ok('NO resuelve el que acaba de crear', !patches.some(l => l.u.includes('/99/')), patches.map(l => l.u));
ok('manda resolvedComment', patches.every(l => !!l.cuerpo.resolvedComment));

console.log('\n── Duplicado en BO es error, para nosotros es "ya estaba" ──');
modo = { crearDuplicado: true }; r = await correr(ENV, 'BLOCKED');
ok('sigue adelante y resuelve', msc(r).some(l => l.met === 'PATCH'), msc(r).map(l => l.met + ' ' + l.u));
ok('lo deja anotado', JSON.stringify(paso(r).data).includes('DUPLICATE_UNRESOLVED_COMMENT'));

console.log('\n── Si falla el CREATE de verdad, no se resuelve nada ──');
modo = { crearFalla: true }; r = await correr(ENV, 'BLOCKED');
ok('no se llamó a resolve', !msc(r).some(l => l.met === 'PATCH'));
ok('el paso queda en error', paso(r).ok === false);

console.log('\n── Si no se puede listar, no se toca nada ──');
modo = { listaFalla: true }; r = await correr(ENV, 'BLOCKED');
ok('no crea ni resuelve', !msc(r).some(l => l.met !== 'GET'), msc(r).map(l => l.met));
ok('el paso queda en error', paso(r).ok === false);

console.log('\n── Un bloqueo de OTRA área no se fuerza, pero se nota ──');
modo = { resolverOtraArea: true }; r = await correr(ENV, 'NORMAL');
ok('lo anota como de otra área', JSON.stringify(paso(r).data).includes('ES_DE_OTRA_AREA'));
ok('y el paso FALLA, porque el cliente no quedó liberado', paso(r).ok === false, paso(r).data.discrepancia);

console.log('\n── La verificación final es la que manda ──');
modo = {}; r = await correr(ENV, 'NORMAL');
ok('quedó en NORMAL como se pidió', paso(r).data.estadoEfectivo === 'NORMAL', paso(r).data.estadoEfectivo);
ok('y el paso cierra OK', paso(r).ok === true);

console.log('\n── Liberar Normal: no crea, solo resuelve ──');
ok('no crea bloqueo', !msc(r).some(l => l.met === 'POST'), msc(r).map(l => l.met + ' ' + l.u));

console.log('\n── La evidencia queda en la respuesta ──');
modo = {}; r = await correr(ENV, 'BLOCKED');
const d = paso(r).data;
ok('qué había antes', !!d.historialAntes);
ok('qué se resolvió', !!d.resolver);
ok('cómo quedó después', !!d.historialDespues);
ok('el estado efectivo final', !!d.estadoEfectivo);

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
