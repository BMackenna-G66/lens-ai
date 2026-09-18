// Las tipologías de Lens contra el catálogo REAL de ms-customer.
//
// Por qué existe: en el modelo nuevo el estado del cliente **se deriva del
// `comment`**, no del `status` que mandamos. Si una tipología declara un status
// y su comment produce otro, no falla nada — el cliente queda en el estado
// equivocado y se guarda perfecto.
//
// Pasó: «Fully blocked» declaraba FULLY_BLOCKED y su comment
// `COMPLIANCE_OFFICER_REQUEST` produce BLOCKED. O sea, el cliente habría
// quedado MENOS bloqueado de lo que el analista decidió, en silencio.
//
// Correr:
//   npx esbuild ../../services/cierreAdminTipos.ts --bundle --format=esm \
//     --platform=node --outfile=test/tipos.mjs
//   node test/tipologias.mjs

import { TIPOS_CIERRE_ADMIN, ofacFlagDe } from './tipos.mjs';

// Catálogo de producción, verificado el 17-09-2026 contra el script de seeding
// (AR-12755, 78 filas) y el selector del Admin. Solo los comments que Lens usa
// o podría usar. Si se agrega uno a una tipología, agregarlo acá también — y si
// no está, este test falla, que es exactamente lo que tiene que pasar.
const CATALOGO = {
  NORMAL:                    { id: 1,  estado: 'NORMAL',                  terminal: true,  area: null },
  OTHER_BLOCKED:             { id: 4,  estado: 'BLOCKED',                 terminal: false, area: null },
  OTHER_FULLY_BLOCKED:       { id: 5,  estado: 'FULLY_BLOCKED',           terminal: false, area: null },
  NO_COMMENTS:               { id: 15, estado: 'BLOCKED',                 terminal: false, area: 'ACCOUNT' },
  UCR_CRIMINAL_RISK:         { id: 32, estado: 'UNDER_COMPLIANCE_REVIEW', terminal: false, area: 'COMPLIANCE' },
  PEP_REQUEST:               { id: 38, estado: 'BLOCKED',                 terminal: false, area: 'COMPLIANCE' },
  COMPLIANCE_OFFICER_REQUEST:{ id: 40, estado: 'BLOCKED',                 terminal: false, area: 'COMPLIANCE' },
  OFAC_CONFIRMED:            { id: 46, estado: 'FULLY_BLOCKED',           terminal: false, area: 'COMPLIANCE' },
  BLACK_LIST_G66:            { id: 53, estado: 'FULLY_BLOCKED',           terminal: false, area: 'COMPLIANCE' },
};

let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

console.log('── El status declarado coincide con el que produce el comment ──');
for (const t of TIPOS_CIERRE_ADMIN) {
  if (t.accion === 'resolver') {
    // No crea nada, así que su `comment` nunca viaja. Igual se avisa si es uno
    // que bloquearía: `NO_COMMENTS` produce BLOCKED, y si alguien cambiara la
    // acción a crear, liberaría bloqueando.
    const c = CATALOGO[t.comment];
    const peligroso = c && c.estado !== 'NORMAL';
    console.log(`  --    ${t.id.padEnd(16)}no crea` +
      (peligroso ? `  ⚠ su comment ${t.comment} produciría ${c.estado} si algún día creara` : ''));
    continue;
  }
  const c = CATALOGO[t.comment];
  ok(`${t.id.padEnd(16)}${t.comment} → ${c ? c.estado : '???'}`, !!c && c.estado === t.status,
     { declara: t.status, produce: c?.estado ?? 'comment fuera del catálogo' });
}

console.log('\n── Los comments que Lens crea son del área COMPLIANCE ──');
// Si no lo son, el resolve puede devolver COMPLIANCE_INVALID_RESOLVE_AREA.
for (const t of TIPOS_CIERRE_ADMIN.filter(x => x.accion !== 'resolver')) {
  const c = CATALOGO[t.comment];
  ok(`${t.id.padEnd(16)}área ${c?.area}`, c?.area === 'COMPLIANCE', c?.area);
}

console.log('\n── Ninguno es terminal (un terminal no se puede resolver nunca) ──');
for (const t of TIPOS_CIERRE_ADMIN.filter(x => x.accion !== 'resolver')) {
  ok(`${t.id.padEnd(16)}${t.comment}`, CATALOGO[t.comment]?.terminal === false);
}

console.log('\n── La marca OFAC es la misma que antes del cambio de status ──');
// Antes se derivaba del status (`=== 'FULLY_BLOCKED'`). Al bajar «Fully blocked»
// a BLOCKED, derivarla la habría apagado sola. Estos son los valores de antes.
const OFAC_ANTES = { liberar_normal: false, liberar_ucr: false, fully_blocked: true, blocked_pep: false };
for (const t of TIPOS_CIERRE_ADMIN) {
  ok(`${t.id.padEnd(16)}OFAC=${ofacFlagDe(t) ? 'Sí' : 'No'}`, ofacFlagDe(t) === OFAC_ANTES[t.id],
     { ahora: ofacFlagDe(t), antes: OFAC_ANTES[t.id] });
}

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
