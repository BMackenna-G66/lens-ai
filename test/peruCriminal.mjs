// PERÚ EN EL CRIMINAL PROFILE — el export del masivo, el parser y el botón.
//
// Lo que protegen estos tests:
//   · el export arreglado: la veracidad legible (no «[object Object]»), el
//     funcionario con su cargo y dependencia, el `record` del PEP (cargo,
//     dependencia, fechas, fuente), y la hoja «Otras coincidencias» con los hits
//     del screening global y la SANCIÓN aparte;
//   · el parser: DNI string de 8 dígitos aunque Excel lo vuelva número,
//     duplicados fusionados y contados, el detalle agrupado por DNI, columnas
//     que faltan, y el export viejo;
//   · el botón: el archivo que manda es el MISMO workbook del export, y el
//     Criminal Profile lo lee igual que si se hubiera descargado y subido.
//
// Datos SINTÉTICOS: copian la ESTRUCTURA de una ficha peruana, ningún valor real.
// Las claves dinámicas de `source_notes` son inventadas.
//
// Correr:
//   npx esbuild services/regcheqPeru.ts services/peruCriminalParser.ts services/envioCriminal.ts \
//     --bundle --format=esm --platform=node --packages=external --outdir=test/pc --log-level=warning
//   node test/peruCriminal.mjs

import XLSX from 'xlsx';
import {
  listasPeru, resumenPepPeru, otrasCoincidencias, armarWorkbookPeru, HOJAS_PERU, legible, NOMBRE_LISTA_PERU,
} from './pc/regcheqPeru.js';
import { parsePeruWorkbook, parsePeruMasivo, otrasListas, tieneSancion, rangoRiesgo, pasaFiltros, FILTROS_PERU_TODOS } from './pc/peruCriminalParser.js';
import { archivoDesdeWorkbook, confirmarEnvio } from './pc/envioCriminal.js';

let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

// ── Una ficha peruana sintética, con la estructura real ──────────────────────
const listasSinteticas = () => ({
  lastChecked: '2026-10-06T00:00:00.000Z',
  pepPeru: { coincidence: true, risk: 'high', data: { additionalData: [{
    nroIdentificacion: '', tipoDocumento: '', nombreCompleto: 'PERSONA DE PRUEBA', origenLista: 'Origen X',
    nombreLista: 'Lista PEP X', fechaUpdate: '2026-01-01', coincidencia: 'SI', porcentajeCoincidencia: 75,
    fechaConsulta: '2026-10-01', conclusion: 'Coincidencia parcial', nroresolucionnombramiento: '', nroresolucionretirocargo: '',
    record: { dependencia: 'Ministerio de Prueba', cargoRelacionado: 'Director General', fechaInicio: '2020-01-01', fechaFin: '2022-12-31', fuente: 'Fuente X' },
  }] } },
  pepPeruConsanguineos: { coincidence: true, risk: 'medium', data: { additionalData: [{
    relation: 'Hermano', namePep: 'PEP DE PRUEBA', dniPep: '07654321', level: 2, regulatoryBasis: 'Norma X', risk: 'medium',
    relativeWorkplace: 'Empresa X', score: 80,
    veracity: { evidenceType: 'declaracion jurada', confidence: 'alta', matchMethod: 'nombre y apellidos', note: 'Nota de prueba' },
    linkedPep: { position: 'Viceministro', organism: 'Organismo X', pepStatus: 'activo', name: 'PEP DE PRUEBA', dni: '07654321' },
    provenance: { linkConfidence: 'media', source: 'fuente', sourceRef: { cargo: 'Viceministro', entidad: 'Organismo X' } },
  }] } },
  pepPeruRegcheq: { coincidence: true, risk: 'high', data: { pepLevel: 2 } },
  funcPeru: { coincidence: true, risk: 'low', data: { additionalData: [{
    nombreCompleto: 'PERSONA DE PRUEBA', cargoPersonal: 'Analista', dependencia: 'Municipalidad X', fechaRegistro: '2025-05-05',
    vinculadoIdTipoIdentificacion: 'DNI', vinculadoNroIdentificacion: '', porcentajeCoincidencia: 90, coincidencia: 'SI', fechaConsulta: '2026-10-01',
  }] } },
  screeningGlobal: { coincidence: true, risk: 'high', data: {
    info: { name: 'PERSONA DE PRUEBA', total_matches: 2, types: ['pep', 'sanction'], entityTypes: ['person'] },
    additionalData: { client_ref: null, id: 1, match_status: 'potential_match', risk_level: 'high', search_term: 'x', total_hits: 2, hits: [
      { doc: { id: 'a', name: 'HIT PEP', entity_type: 'person', types: ['pep', 'pep-class-1'], sources: ['fuente-a'],
        source_notes: { 'fuente-inventada-a': { name: 'Fuente A', url: 'https://ejemplo.test/a', aml_types: ['pep'], country_codes: ['PE'] } } },
        match_types: ['name_exact'], score: 1.5 },
      { doc: { id: 'b', name: 'HIT SANCION', entity_type: 'person', types: ['sanction'], sources: ['fuente-b'],
        source_notes: { 'fuente-inventada-b': { name: 'Fuente B', url: 'https://ejemplo.test/b', listing_ended_utc: '2024-03-01T00:00:00Z', country_codes: ['US', 'PE'] } } },
        match_types: ['name_fuzzy'], score: 0.8 },
    ] } } },
});

const NOMBRE_LISTA = { screeningGlobal: 'Screening Global', ofac: 'OFAC' };
const filaExport = (dni, listasRaw, extra = {}) => {
  const listas = listasPeru(listasRaw, NOMBRE_LISTA);
  return { dni, nombre: 'NOMBRE DE PRUEBA', nombres: 'NOMBRE', apellidoPaterno: 'DE', apellidoMaterno: 'PRUEBA',
    riesgoFinal: 'High', nivelPep: '2', pep: resumenPepPeru(listasRaw), listas, alertasTexto: '', ...extra };
};

// ════════════════════════════════════════════════════════════════════════════
console.log('── Bugs del export, con la estructura real ──');
const r = resumenPepPeru(listasSinteticas());
const fam = r.familiares[0];
ok('1 · veracidad legible: «confianza · evidencia · método», sin [object Object]', fam.veracidad === 'alta · declaracion jurada · nombre y apellidos' && !fam.veracidad.includes('[object'), fam.veracidad);
ok('  la nota aparte', fam.notaVeracidad === 'Nota de prueba');
ok('  y de qué es PEP el vinculado: cargo, organismo, estado, confianza', fam.pepCargo === 'Viceministro' && fam.pepOrganismo === 'Organismo X' && fam.pepEstado === 'activo' && fam.confianzaVinculo === 'media', fam);
const func = r.funcionario[0];
ok('2 · funcionario: cargo, dependencia, fecha de registro y %', func.cargo === 'Analista' && func.entidad === 'Municipalidad X' && func.fechaUpdate === '2025-05-05' && func.porcentaje === '90', func);
const pep = r.coincidencias[0];
ok('4 · el PEP con su `record`: cargo, dependencia, fechas y fuente', pep.cargo === 'Director General' && pep.entidad === 'Ministerio de Prueba' && pep.fechaInicio === '2020-01-01' && pep.fechaFin === '2022-12-31' && pep.fuente === 'Fuente X', pep);
ok('  las resoluciones se leen de su clave real (vacías en el dato, no mal nombradas)', pep.resolucionNombramiento === '' && pep.resolucionRetiro === '');
ok('  con la clave en otras mayúsculas también', resumenPepPeru({ pepPeru: { coincidence: true, data: { additionalData: [{ NroResolucionNombramiento: 'R-1' }] } } }).coincidencias[0].resolucionNombramiento === 'R-1');
ok('legible: un objeto anidado sale «clave: valor»', legible({ a: 1, b: { c: 'x' } }) === 'a: 1 · b: (c: x)', legible({ a: 1, b: { c: 'x' } }));

const otras = otrasCoincidencias(listasPeru(listasSinteticas(), NOMBRE_LISTA));
ok('3 · «Otras coincidencias»: un hit por fila del screening global', otras.length === 2 && otras.every(o => o.lista === 'Screening Global'), otras.map(o => o.nombre));
const sancion = otras.find(o => o.nombre === 'HIT SANCION');
ok('  la sanción se marca, y el PEP no', sancion?.sancion === true && otras.find(o => o.nombre === 'HIT PEP')?.sancion === false);
ok('  fuentes desde source_notes (claves dinámicas), con URL y «dejó de listar»', sancion.fuentes.includes('Fuente B') && sancion.fuentes.includes('https://ejemplo.test/b') && sancion.fuentes.includes('dejó de listar: 2024-03-01'), sancion.fuentes);
ok('  países, tipos, score y estado del match', sancion.paises === 'US, PE' && sancion.tipos === 'sanction' && sancion.score === '0.80' && sancion.estadoMatch === 'potential_match', sancion);
ok('  las listas PEP no van a «Otras»', otras.every(o => !Object.values(NOMBRE_LISTA_PERU).includes(o.lista)));
ok('  lista con coincidencia y sin detalle: igual deja su fila', otrasCoincidencias({ OFAC: { coincidence: true, risk: 'high', data: null } })[0]?.detalle.includes('no trae detalle'));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── El export y el parser hablan el mismo idioma ──');
const filas = [
  filaExport('01234567', listasSinteticas()),
  filaExport('01234567', listasSinteticas(), { riesgoFinal: 'Medium' }),   // duplicado del Excel de entrada
  filaExport('87654321', { pepPeru: { coincidence: false }, funcPeru: { coincidence: false } }, { riesgoFinal: 'Low', nivelPep: '' }),
];
const { wb, nombre } = armarWorkbookPeru(filas, new Date('2026-10-06T12:00:00'));
ok('el workbook trae las cuatro hojas', [HOJAS_PERU.resultados, HOJAS_PERU.pep, HOJAS_PERU.otras, HOJAS_PERU.resumen].every(h => wb.SheetNames.includes(h)), wb.SheetNames);
ok('el nombre del archivo es el de siempre', /^resultado_regcheq_peru_20261006_\d{6}\.xlsx$/.test(nombre), nombre);
const carga = parsePeruWorkbook(wb);
ok('dedupe: 3 filas → 2 DNIs, 1 fusionada y avisada', carga.perfiles.length === 2 && carga.duplicados === 1 && carga.avisos.some(a => a.includes('fusionaron')), carga);
const p = carga.perfiles.find(x => x.dni === '01234567');
ok('fusión: queda el riesgo más severo', p.riesgoFinal === 'High');
ok('banderas y nivel', p.esPep && p.familiarDePep && p.funcionarioPublico && p.nivelPep === '2', p);
ok('detalle agrupado y SIN repetir pese al duplicado', p.pep.length === 1 && p.familiares.length === 1 && p.funcionario.length === 1 && p.otras.length === 2, { pep: p.pep.length, fam: p.familiares.length, func: p.funcionario.length, otras: p.otras.length });
ok('% de coincidencia como número (75: posible homónimo)', p.pep[0].porcentaje === 75);
ok('el PEP trae su cargo y fechas', p.pep[0].cargo === 'Director General' && p.pep[0].fechaInicio === '2020-01-01');
ok('el familiar trae veracidad legible y el cargo del PEP', p.familiares[0].veracidad.startsWith('alta') && p.familiares[0].pepCargo === 'Viceministro');
ok('el funcionario trae cargo y dependencia', p.funcionario[0].cargo === 'Analista' && p.funcionario[0].entidad === 'Municipalidad X');
ok('la sanción llega al Criminal Profile', tieneSancion(p) && otrasListas(p).includes('Screening Global'));
ok('sin «Otras coincidencias» de más en quien no tiene', carga.perfiles.find(x => x.dni === '87654321').otras.length === 0);

console.log('\n── El botón: el archivo que manda es el del export ──');
const archivo = archivoDesdeWorkbook(wb, nombre);
ok('es un .xlsx con el mismo nombre', archivo.name === nombre && /spreadsheetml/.test(archivo.type));
const releido = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
ok('mismas hojas', JSON.stringify(releido.SheetNames) === JSON.stringify(wb.SheetNames));
ok('mismas filas en cada hoja', wb.SheetNames.every(h => JSON.stringify(XLSX.utils.sheet_to_json(releido.Sheets[h])) === JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[h]))));
const porArchivo = await parsePeruMasivo(archivo);
ok('el Criminal Profile lo lee igual que el workbook (= descargar y subir)', JSON.stringify(porArchivo) === JSON.stringify(carga));

console.log('\n── El parser con lo que viene del mundo real ──');
const hoja = (rows) => XLSX.utils.json_to_sheet(rows);
const wbViejo = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbViejo, hoja([
  { 'DNI': 1234567, 'Nombre completo': 'UNO', 'Riesgo final Ficha': 'Low', 'Es PEP': 'No', 'Familiar de PEP': 'Sí', 'Coincidencia_Screening Global': 'True' },
  { 'DNI': '1234567', 'Nombre completo': 'UNO', 'Riesgo final Ficha': 'High', 'Es PEP': 'Sí', 'Familiar de PEP': 'No' },
  { 'DNI': 'ABC', 'Nombre completo': 'SIN DNI' },
]), 'Resultados Regcheq Perú');
XLSX.utils.book_append_sheet(wbViejo, hoja([
  { 'DNI': '01234567', 'Tipo': 'Familiar de PEP', 'Relación': 'Madre', 'Veracidad': '[object Object]' },
  { 'DNI': '99999999', 'Tipo': 'PEP', 'Lista': 'X' },
]), 'PEP Perú');
const viejo = parsePeruWorkbook(wbViejo);
ok('DNI como NÚMERO (Excel se comió el cero) → "01234567"', viejo.perfiles[0]?.dni === '01234567' && typeof viejo.perfiles[0].dni === 'string', viejo.perfiles[0]);
ok('fusiona y se queda con High y con PEP de cualquiera de las filas', viejo.perfiles.length === 1 && viejo.perfiles[0].riesgoFinal === 'High' && viejo.perfiles[0].esPep && viejo.perfiles[0].familiarDePep);
ok('columnas que faltan: vacías, sin romper', viejo.perfiles[0].nivelPep === '' && viejo.perfiles[0].apellidoMaterno === '');
ok('una fila sin DNI válido se omite y se avisa', viejo.avisos.some(a => a.includes('sin un DNI válido')));
ok('«[object Object]» del export viejo: no se muestra y se avisa', viejo.perfiles[0].familiares[0].veracidad === '' && viejo.avisos.some(a => a.includes('[object Object]')));
ok('detalle de un DNI que no está en resultados: se omite y se avisa', viejo.avisos.some(a => a.includes('de detalle')));
ok('sin la hoja «Otras coincidencias»: se avisa', viejo.avisos.some(a => a.includes('Otras coincidencias')));
let error = null;
try { parsePeruWorkbook(XLSX.utils.book_new()); } catch (e) { error = e; }
ok('un archivo que no es el del masivo de Perú se rechaza con un motivo', error && /Resultados Regcheq Perú/.test(error.message), String(error));

console.log('\n── Riesgo final tal como viene: «High Risk», «Medium Risk», «Low Risk» ──');
for (const [v, n] of [['High Risk', 3], ['Medium Risk', 2], ['Low Risk', 1], ['High', 3], ['medio', 2], ['', 0]]) ok(`rangoRiesgo(«${v}») = ${n}`, rangoRiesgo(v) === n, rangoRiesgo(v));
const wbR = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbR, hoja([
  { 'DNI': '11111111', 'Riesgo final Ficha': 'High Risk' },
  { 'DNI': '22222222', 'Riesgo final Ficha': 'Medium Risk' },
  { 'DNI': '33333333', 'Riesgo final Ficha': 'Low Risk' },
  { 'DNI': '44444444', 'Riesgo final Ficha': 'Low Risk' },
  { 'DNI': '55555555', 'Riesgo final Ficha': 'Medium Risk' },   // fusión: Medium y después Low
  { 'DNI': '55555555', 'Riesgo final Ficha': 'Low Risk' },
  { 'DNI': '66666666', 'Riesgo final Ficha': 'Low Risk' },      // fusión: Low y después Medium
  { 'DNI': '66666666', 'Riesgo final Ficha': 'Medium Risk' },
]), 'Resultados Regcheq Perú');
const perR = parsePeruWorkbook(wbR).perfiles;
const filtrar = (riesgo) => perR.filter(x => pasaFiltros(x, { ...FILTROS_PERU_TODOS, riesgo })).map(x => x.dni).sort();
ok('filtro High → 1', JSON.stringify(filtrar('High')) === '["11111111"]', filtrar('High'));
ok('filtro Medium → los 3 Medium (antes daba 0)', JSON.stringify(filtrar('Medium')) === '["22222222","55555555","66666666"]', filtrar('Medium'));
ok('filtro Low → los 2 Low (antes daba 0)', JSON.stringify(filtrar('Low')) === '["33333333","44444444"]', filtrar('Low'));
ok('fusión Medium + Low → Medium, en cualquier orden', perR.find(x => x.dni === '55555555').riesgoFinal === 'Medium Risk' && perR.find(x => x.dni === '66666666').riesgoFinal === 'Medium Risk');
ok('el orden por riesgo ya no empata Medium con Low', rangoRiesgo('Medium Risk') > rangoRiesgo('Low Risk'));

console.log('\n── Sanción con un export viejo (sin «Otras coincidencias») ──');
const wbS = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbS, hoja([{ 'DNI': '12121212', 'Coincidencia_OFAC': 'True' }]), 'Resultados Regcheq Perú');
const pS = parsePeruWorkbook(wbS).perfiles[0];
ok('una lista OFAC con coincidencia cuenta como sanción aunque no haya hits', pS.otras.length === 0 && tieneSancion(pS));
ok('  y el filtro «Con sanción» la encuentra', pasaFiltros(pS, { ...FILTROS_PERU_TODOS, otras: 'Con sanción' }));
ok('sin listas de sanción, no', !tieneSancion(parsePeruWorkbook(wbR).perfiles[0]));

console.log('\n── El aviso antes de navegar ──');
let descargado = 0;
const resp = (...r) => { const c = [...r]; return () => c.shift(); };
ok('Aceptar en la primera: descarga y sigue', confirmarEnvio(() => descargado++, resp(true)) === true && descargado === 1);
ok('Cancelar y después Aceptar: sigue sin descargar', confirmarEnvio(() => descargado++, resp(false, true)) === true && descargado === 1);
ok('Cancelar las dos: no navega', confirmarEnvio(() => descargado++, resp(false, false)) === false && descargado === 1);

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
