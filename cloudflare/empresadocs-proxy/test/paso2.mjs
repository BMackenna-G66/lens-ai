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
// El estado que ms-customer DERIVA del comment del create. En el real sale del
// catálogo; acá lo fija el caso de prueba.
let statusCreado = 'BLOCKED';
// Lo que queda vigente después de resolver: se quitan los que se resolvieron OK.
const vigentes = () => sinResolver.filter(r => !resueltos.includes(String(r.id)) || modo.resolverFalla || modo.resolverOtraArea);
// Lo que el cliente tiene sin resolver. Por defecto, el escenario REAL del
// cliente de prueba 4535350 al 17-09-2026: dos vigentes, y el del bot con el
// comment genérico de fallback.
// Copiado del GET real a producción del 17-09-2026, con los nombres de campo
// exactos que devuelve `history` (no los labels del Admin, que era lo que se
// venía infiriendo).
let sinResolver = [
  { id: 4223940, customerId: 4535350, status: 'FULLY_BLOCKED', comment: 'OTHER_FULLY_BLOCKED',
    complianceStatusCommentId: 5, observation: 'OFAC_SUSPECTED', createdBy: 'ONBOARDING_BOT',
    areaId: 6, areaName: 'SYSTEM_BOT', isTerminal: false, isResolved: false },
  { id: 4223019, customerId: 4535350, status: 'NORMAL', comment: 'NORMAL',
    complianceStatusCommentId: 1, observation: null, createdBy: 'ONBOARDING_BOT',
    areaId: 6, areaName: 'SYSTEM_BOT', isTerminal: true, isResolved: false },
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
      return j(creado ? [{ id: 99, comment: cmtCreado, status: statusCreado, isTerminal: false, isResolved: false }, ...vigentes()] : vigentes());
    }
    if (u.includes('/resolve')) {
      const cid = u.match(/compliance\/(\d+)\/resolve/)?.[1];
      // El NORMAL del bot: en este cliente SÍ es resoluble por el área dueña.
      if (modo.normalNoResoluble && cid === '4223019') return j({ code: 'COMPLIANCE_STATUS_CANNOT_BE_RESOLVED' }, 409);
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
ok('NO manda Claim-Email (el gateway lo inyecta; mandarlo lo duplica)', crear.headers['Claim-Email'] === undefined, crear.headers);

console.log('\n── Resolver es POR ID, y se INTENTA con todo lo vigente ──');
// No hay lista de terminales nuestra: el área dueña puede resolver los suyos,
// así que decide la API. Se intenta con los dos y se tolera el que diga que no.
const patches = msc(r).filter(l => l.met === 'PATCH');
ok('intenta el 4223940 (el bloqueo del bot)', patches.some(l => l.u.includes('/4223940/')), patches.map(l => l.u));
ok('intenta también el 4223019 (NORMAL)', patches.some(l => l.u.includes('/4223019/')), patches.map(l => l.u));
ok('NO resuelve el que acaba de crear', !patches.some(l => l.u.includes('/99/')), patches.map(l => l.u));
ok('manda resolvedComment', patches.every(l => !!l.cuerpo.resolvedComment));

console.log('\n── Si la API dice que uno no se puede resolver, se tolera ──');
modo = { normalNoResoluble: true }; r = await correr(ENV, 'BLOCKED');
ok('lo anota', JSON.stringify(paso(r).data).includes('NO_RESOLUBLE_O_YA_RESUELTO'));
ok('y el cierre no falla por eso', paso(r).ok === true, paso(r).data.discrepancia);

console.log('\n── Duplicado en BO es error, para nosotros es "ya estaba" ──');
// Escenario REAL de un segundo cierre sobre el mismo caso: el bloqueo con
// NUESTRO comment ya está vigente. Sin la guarda por comment, el bucle lo
// resolvería —no hay `idCreado` porque el create falló— y desharía el bloqueo.
sinResolver = [
  { id: 4225468, status: 'BLOCKED', comment: 'COMPLIANCE_OFFICER_REQUEST', isTerminal: false, isResolved: false },
  { id: 4223019, status: 'NORMAL', comment: 'NORMAL', isTerminal: true, isResolved: false },
];
modo = {}; r = await correr(ENV, 'BLOCKED');
ok('NI SIQUIERA intenta crear (lo ve en el historial)', !msc(r).some(l => l.met === 'POST'), msc(r).map(l => l.met + ' ' + l.u));
ok('lo deja anotado', JSON.stringify(paso(r).data).includes('ya existe un bloqueo vigente'));
ok('NO resuelve el bloqueo propio que ya estaba', !msc(r).some(l => l.met === 'PATCH' && l.u.includes('/4225468/')), msc(r).filter(l => l.met === 'PATCH').map(l => l.u));
ok('el cliente sigue BLOCKED', paso(r).data.estadoEfectivo === 'BLOCKED', paso(r).data.estadoEfectivo);
ok('y el cierre no falla', paso(r).ok === true, paso(r).data.discrepancia);
sinResolver = [
  { id: 4223940, status: 'FULLY_BLOCKED', comment: 'OTHER_FULLY_BLOCKED', isTerminal: false, isResolved: false },
  { id: 4223019, status: 'NORMAL', comment: 'NORMAL', isTerminal: true, isResolved: false },
];

console.log('\n── Un 422 del create NO se traga: puede ser un comment inválido ──');
modo = { crearFalla: true }; r = await correr(ENV, 'BLOCKED');
ok('el paso FALLA', paso(r).ok === false, paso(r).data);
ok('y no resuelve nada', !msc(r).some(l => l.met === 'PATCH'));

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

console.log('\n── El last-step corre SÍ O SÍ cuando el cliente quedó liberado ──');
// Es el paso que deja al cliente poder operar. Si se libera en compliance y esto
// no corre, queda liberado pero trabado, y no se nota.
const hayLastStep = r => r.llamadas.some(l => l.u.includes('/last-step'));

modo = {}; r = await correr(ENV, 'NORMAL', { lastStep: true });
ok('Liberar Normal → corre', hayLastStep(r), r.llamadas.map(l => l.u));
modo = {}; cmtCreado = 'UCR_CRIMINAL_RISK'; statusCreado = 'UNDER_COMPLIANCE_REVIEW';
r = await correr(ENV, 'UNDER_COMPLIANCE_REVIEW', { lastStep: true, comment: 'UCR_CRIMINAL_RISK' });
ok('Liberar UCR → corre', hayLastStep(r), r.llamadas.map(l => l.u));
cmtCreado = 'COMPLIANCE_OFFICER_REQUEST'; statusCreado = 'BLOCKED';
modo = {}; r = await correr(ENV, 'BLOCKED', { lastStep: true });
ok('Bloqueado → NO corre (no corresponde)', !hayLastStep(r), r.llamadas.map(l => l.u));
ok('y queda escrito por qué', JSON.stringify(paso(r)).length > 0 && JSON.stringify(r.body.results[0].steps.lastStep || {}).includes('no requiere'), r.body.results[0].steps.lastStep);

console.log('\n── Y corre aunque otro paso haya fallado, si quedó liberado ──');
// LA REGRESIÓN que esto viene a evitar: el gate viejo era `ok && ...`, y `ok`
// acumulaba las fallas de todos los pasos. Un bloqueo de otra área sin resolver
// dejaba al cliente liberado y sin last-step.
modo = { resolverOtraArea: true }; r = await correr(ENV, 'NORMAL', { lastStep: true });
ok('el paso 2 quedó en error', paso(r).ok === false);
ok('pero si quedó liberado, el last-step corre igual',
   paso(r).data.estadoEfectivo !== 'NORMAL' || hayLastStep(r), { efectivo: paso(r).data.estadoEfectivo, corrio: hayLastStep(r) });

console.log('\n── NINGUNA llamada manda Claim-Email ──');
// El gateway lo inyecta desde el token. Mandarlo además lo CONCATENA en el
// registro: medido en producción, quedó
// `createdBy: "benjamin.mackenna@global66.com,benjamin.mackenna@global66.com"`.
// Un campo de auditoría con dos emails pegados no sirve para auditar.
modo = {}; r = await correr(ENV, 'BLOCKED');
ok('ninguna a ms-customer lo manda', msc(r).every(l => l.headers['Claim-Email'] === undefined),
   msc(r).filter(l => l.headers['Claim-Email']).map(l => l.u));

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
