// REGCHEQ · PERUANOS — lo que, si se pierde, deja mal una ficha sin avisar.
//
//   · un DNI que pierde su cero en Excel y consulta a otra persona;
//   · un refresco que manda el nombre y Regcheq lo pisa;
//   · una creación —también la automática del masivo— que sale con el body
//     por defecto de Chile y deja la ficha como chilena;
//   · las listas de Perú, que hoy se pierden, y el nivel PEP, que en la raíz
//     viene null aunque haya coincidencia.
//
// Las respuestas son SINTÉTICAS: copian solo la ESTRUCTURA de una ficha
// peruana real. Ningún DNI ni nombre de acá existe.
//
// Correr:
//   npx esbuild services/regcheqPeru.ts --bundle --format=esm --platform=node \
//     --outfile=test/regcheqPeru.bundle.mjs --log-level=warning
//   node test/regcheqPeru.mjs

import {
  normalizaDniPeru, esDniPeruValido, bodyRefrescoPeru, bodyCreacionPeru, DNI_TYPE_PERU,
  listasPeru, derivarNivelPepPeru, resumenPepPeru, filaMasivoPeru, columnaDniPeru,
  consultarPeru, procesarFilaPeru, FichaNoExiste, NOMBRE_LISTA_PERU,
} from './regcheqPeru.bundle.mjs';

let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

// ── La ficha sintética ───────────────────────────────────────────────────────
const DNI = '01234567';
const listasSinteticas = () => ({
  lastChecked: '2026-10-05T12:00:00.000Z',
  pepPeru: { coincidence: true, risk: 'high', data: { additionalData: [{
    nombreLista: 'Lista PEP de prueba', origenLista: 'Origen de prueba', conclusion: 'Coincidencia exacta',
    porcentajeCoincidencia: 100, nroresolucionnombramiento: 'RES-0001-2020', nroresolucionretirocargo: 'RES-0002-2022',
    fechaUpdate: '2026-01-01', tipoDocumento: 'DNI', nroIdentificacion: DNI,
  }] } },
  pepPeruConsanguineos: { coincidence: true, risk: 'medium', data: { additionalData: [{
    relation: 'Hermano', namePep: 'PERSONA DE PRUEBA', dniPep: '07654321', level: 2, linkedPep: 'Sí',
    relativeWorkplace: 'Entidad de prueba', regulatoryBasis: 'Norma de prueba', veracity: 'Alta', risk: 'medium',
  }] } },
  pepPeruRegcheq: { coincidence: true, risk: 'high', data: { pepLevel: 2 } },
  funcPeru: { coincidence: false, risk: '', data: null },
  screeningGlobal: { coincidence: false, risk: '', data: null },
  internationalOrganizations: { coincidence: false, risk: '', data: null },
  listaNuevaDePeru: { coincidence: true, risk: 'low', data: { additionalData: [{ x: 1 }] } },
});
const fichaSintetica = (listas = listasSinteticas()) => ({
  dni: DNI, personType: 'natural', nationality: 'Peru', pepLevel: null,
  dniType: { ...DNI_TYPE_PERU }, name: 'NOMBRE', fatherName: 'PATERNO', motherName: 'MATERNO', listas,
});

// El mapa de Chile, como lo tiene RegcheqTool (las claves que importan acá).
const NOMBRE_LISTA_CHILE = {
  pepChile: 'PEP Chile', causasPenalesRegcheq: 'Causas Penales Chile', screeningGlobal: 'Screening Global',
  internationalOrganizations: 'Organismos Internacionales', gafiResult: 'GAFI', rtpResult: 'RTP / PDI',
};

// ════════════════════════════════════════════════════════════════════════════
console.log('── DNI: 8 dígitos, siempre string, con los ceros que Excel se come ──');
for (const [entra, sale] of [[1234567, '01234567'], ['1234567', '01234567'], [' 12.345.678 ', '12345678'], ['1234567.0', '01234567'], ['00001234', '00001234'], [12345678, '12345678']]) {
  const d = normalizaDniPeru(entra);
  ok(`${JSON.stringify(entra)} → "${sale}"`, d === sale && typeof d === 'string' && esDniPeruValido(d), d);
}
for (const malo of ['', 'ABC123', '123456789', null, undefined]) ok(`${JSON.stringify(malo)} no es válido`, !esDniPeruValido(normalizaDniPeru(malo)), normalizaDniPeru(malo));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Bodies ──');
const refresco = bodyRefrescoPeru(DNI);
ok('refresco: SIN name, fatherName ni motherName', !('name' in refresco) && !('fatherName' in refresco) && !('motherName' in refresco), refresco);
ok('refresco: nationality Peru y dniType de Perú', refresco.nationality === 'Peru' && JSON.stringify(refresco.dniType) === '{"country":"Peru","person":"natural","document":"DNI"}', refresco);
ok('refresco: natural y el DNI como string', refresco.personType === 'natural' && refresco.dni === DNI);
const creacion = bodyCreacionPeru(DNI, { nombres: 'Juan Carlos', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', email: 'a@b.pe', telefono: '+51900000000' });
ok('creación: nombre completo en mayúsculas', creacion.name === 'JUAN CARLOS' && creacion.fatherName === 'QUISPE' && creacion.motherName === 'MAMANI', creacion);
ok('creación: lleva nationality Peru y dniType', creacion.nationality === 'Peru' && creacion.dniType?.document === 'DNI' && creacion.dniType?.country === 'Peru', creacion);
ok('creación: email y teléfono', creacion.email === 'a@b.pe' && creacion.phone === '+51900000000');
const soloCompleto = bodyCreacionPeru(DNI, { nombreCompleto: 'Juan Quispe Mamani' });
ok('solo «nombre completo» → entero en name', soloCompleto.name === 'JUAN QUISPE MAMANI' && !soloCompleto.fatherName, soloCompleto);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Listas de Perú ──');
let l = listasPeru(listasSinteticas(), NOMBRE_LISTA_CHILE);
for (const etiqueta of Object.values(NOMBRE_LISTA_PERU)) ok(`aparece «${etiqueta}»`, etiqueta in l);
ok('pepPeru con coincidencia', l['PEP Perú'].coincidence === true);
ok('una lista desconocida se captura con su clave', l['listaNuevaDePeru']?.coincidence === true, Object.keys(l));
ok('lastChecked NO es una lista', !('lastChecked' in l), Object.keys(l));
ok('las globales que vinieron, con su nombre', 'Screening Global' in l && 'Organismos Internacionales' in l);
ok('las de Chile que NO vinieron, no aparecen como consultadas', !('PEP Chile' in l) && !('Causas Penales Chile' in l), Object.keys(l));
l = listasPeru({}, NOMBRE_LISTA_CHILE);
ok('sin listas: las cuatro de Perú igual, sin coincidencia', Object.values(NOMBRE_LISTA_PERU).every(e => l[e] && l[e].coincidence === false), l);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Nivel PEP: el de la raíz viene null, se deriva ──');
ok('pepPeruRegcheq.data.pepLevel 2 → "2"', derivarNivelPepPeru(listasSinteticas()) === '2');
const sinNivel = { ...listasSinteticas(), pepPeruRegcheq: { coincidence: false, data: { pepLevel: 0 } } };
ok('nivel 0 y pepPeru con coincidencia → "PEP"', derivarNivelPepPeru(sinNivel) === 'PEP');
const soloFamiliar = { ...sinNivel, pepPeru: { coincidence: false, data: null } };
ok('solo familiares → "Familiar de PEP"', derivarNivelPepPeru(soloFamiliar) === 'Familiar de PEP');
ok('nada → vacío', derivarNivelPepPeru({ pepPeruRegcheq: { data: { pepLevel: null } } }) === '');
ok('pepLevel null no rompe', derivarNivelPepPeru({ pepPeruRegcheq: { data: {} }, pepPeru: { coincidence: true } }) === 'PEP');

const r = resumenPepPeru(listasSinteticas());
ok('es PEP y familiar de PEP', r.esPep && r.familiarDePep && !r.funcionarioPublico, r);
const c = r.coincidencias[0];
ok('detalle pepPeru: lista, origen, conclusión, %, resoluciones', c.lista === 'Lista PEP de prueba' && c.origen === 'Origen de prueba' && c.conclusion === 'Coincidencia exacta' && c.porcentaje === '100' && c.resolucionNombramiento === 'RES-0001-2020' && c.resolucionRetiro === 'RES-0002-2022', c);
const fam = r.familiares[0];
ok('detalle familiares: relación, PEP vinculado y su DNI, nivel, base regulatoria', fam.relacion === 'Hermano' && fam.pepVinculado === 'PERSONA DE PRUEBA' && fam.dniPep === '07654321' && fam.nivel === '2' && fam.baseRegulatoria === 'Norma de prueba', fam);
ok('solo el nivel de Regcheq ya cuenta como PEP', resumenPepPeru({ pepPeruRegcheq: { coincidence: true, data: { pepLevel: 3 } } }).esPep);
ok('sin coincidencia no se muestran detalles', resumenPepPeru({ pepPeru: { coincidence: false, data: { additionalData: [{ nombreLista: 'x' }] } } }).coincidencias.length === 0);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Masivo: columnas ──');
ok('columna dni por alias «nro documento»', columnaDniPeru(['nro documento', 'nombres']) === 'nro documento');
ok('sin columna de DNI → null', columnaDniPeru(['rut', 'nombre']) === null);
let fila = filaMasivoPeru({ 'documento': '1234567', 'nombre': 'Ana', 'apellido paterno': 'Rojas', 'apellido materno': 'Vega' });
ok('alias «documento» y «nombre», y el cero de vuelta', fila.dni === '01234567' && fila.datos.nombres === 'Ana' && fila.datos.apellidoPaterno === 'Rojas' && fila.datos.apellidoMaterno === 'Vega', fila);
fila = filaMasivoPeru({ 'dni': '87654321', 'nombre completo': 'Ana Rojas Vega' });
ok('solo «nombre completo»', fila.datos.nombreCompleto === 'Ana Rojas Vega' && !fila.datos.nombres, fila);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Las llamadas a Regcheq (fetch simulado) ──');
function regcheqFalso({ existe = true, postOk = true, postConListas = true } = {}) {
  const llamadas = [];
  const fetch = async (url, opt = {}) => {
    const metodo = opt.method || 'GET';
    const body = opt.body ? JSON.parse(opt.body) : null;
    llamadas.push({ metodo, url: String(url), body });
    const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (metodo === 'GET') return existe ? j(fichaSintetica()) : j({ message: 'not found' }, 404);
    if (!postOk) return j({ message: 'boom' }, 500);
    existe = true;
    return j(postConListas ? fichaSintetica() : { ok: true });
  };
  return { llamadas, deps: { fetch, base: 'https://regcheq.test', key: 'CLAVE-DE-PRUEBA', esperar: async () => {} } };
}
const posts = (ll) => ll.filter(x => x.metodo === 'POST');

let s = regcheqFalso();
let perfil = await consultarPeru(DNI, false, { nombres: 'NO DEBE VIAJAR' }, s.deps);
ok('consultar: GET para ver que existe y POST de refresco', s.llamadas.map(x => x.metodo).join() === 'GET,POST', s.llamadas.map(x => x.metodo));
ok('  el refresco va SIN nombre', !('name' in posts(s.llamadas)[0].body) && !('fatherName' in posts(s.llamadas)[0].body), posts(s.llamadas)[0].body);
ok('  con nationality Peru y dniType', posts(s.llamadas)[0].body.nationality === 'Peru' && posts(s.llamadas)[0].body.dniType.document === 'DNI');
ok('  y las listas salen de la respuesta del POST', !!perfil.listas?.pepPeru);

s = regcheqFalso({ existe: false });
let error = null;
try { await consultarPeru(DNI, false, {}, s.deps); } catch (e) { error = e; }
ok('consultar un DNI sin ficha avisa y NO crea una ficha sin nombre', error instanceof FichaNoExiste && posts(s.llamadas).length === 0, { error: String(error), llamadas: s.llamadas.map(x => x.metodo) });

s = regcheqFalso({ existe: false });
perfil = await consultarPeru(DNI, true, { nombres: 'Juan', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani' }, s.deps);
const b = posts(s.llamadas)[0].body;
ok('crear: POST con el nombre en mayúsculas, nationality Peru y dniType', b.name === 'JUAN' && b.fatherName === 'QUISPE' && b.motherName === 'MAMANI' && b.nationality === 'Peru' && b.dniType.country === 'Peru', b);
ok('  sin GET si la respuesta ya trae las listas', s.llamadas.length === 1 && !!perfil.listas);

s = regcheqFalso({ postOk: false });
error = null;
try { await consultarPeru(DNI, false, {}, s.deps); } catch (e) { error = e; }
ok('si el refresco falla se dice, y NO se muestran listas viejas', error && /refrescar/.test(error.message), String(error));

s = regcheqFalso({ postConListas: false });
perfil = await consultarPeru(DNI, false, {}, s.deps);
ok('si el POST no trae listas, se leen con un GET', s.llamadas.map(x => x.metodo).join() === 'GET,POST,GET' && !!perfil.listas, s.llamadas.map(x => x.metodo));

console.log('\n── Masivo: la creación automática ante un 404 es PERUANA ──');
s = regcheqFalso({ existe: false });
const avisos = [];
perfil = await procesarFilaPeru({ dni: DNI, datos: { nombres: 'Ana', apellidoPaterno: 'Rojas' } }, false, s.deps, t => avisos.push(t));
const auto = posts(s.llamadas)[0]?.body;
ok('404 → se crea la ficha automáticamente', !!auto && avisos.some(a => a.includes('404')), { auto, avisos });
ok('  con nationality Peru y dniType de Perú (nunca el body de Chile)', auto.nationality === 'Peru' && auto.dniType?.document === 'DNI', auto);
ok('  con el nombre del Excel', auto.name === 'ANA' && auto.fatherName === 'ROJAS', auto);
s = regcheqFalso();
await procesarFilaPeru({ dni: DNI, datos: { nombres: 'Ana' } }, false, s.deps);
ok('si ya existe, se refresca sin nombre', !('name' in posts(s.llamadas)[0].body), posts(s.llamadas)[0].body);
s = regcheqFalso();
await procesarFilaPeru({ dni: DNI, datos: { nombres: 'Ana', apellidoPaterno: 'Rojas' } }, true, s.deps);
ok('con «crear fichas», POST con nombre y body peruano', posts(s.llamadas)[0].body.name === 'ANA' && posts(s.llamadas)[0].body.nationality === 'Peru');
ok('la clave va en la URL, nunca en el body', s.llamadas.every(x => !JSON.stringify(x.body || {}).includes('CLAVE-DE-PRUEBA')));

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
