// La WHITELIST DE CLIENTES: normalización, búsqueda y enganche con la decisión.
//
// Por qué existe este archivo. La whitelist PERDONA TODO: un cliente de la lista
// se libera aunque el screening traiga coincidencia en listas de sanciones y
// aunque traiga un delito sensible. Con esa potencia, los dos modos de fallo que
// importan son silenciosos:
//
//   1. Una entrada sin llaves utilizables coincidiría con todo caso que tampoco
//      las traiga —dos vacíos son iguales entre sí— y liberaría la cola entera.
//   2. Agregar la whitelist podría cambiar el comportamiento de los casos que NO
//      están en ella. Con el flujo apagado hoy no se libera nada; si eso cambia
//      sin que nadie lo pida, se libera plata.
//
// Los dos se prueban acá abajo.
//
// Correr:
//   npx esbuild services/whitelistClientes.ts --bundle --format=esm \
//     --platform=node --outfile=test/wl.mjs
//   npx esbuild services/flujoDecision.ts --bundle --format=esm \
//     --platform=node --outfile=test/decision.mjs
//   node test/whitelist.mjs

import {
  normalizarWhitelist, buscarEnWhitelist, construirEntrada, entradaVigente,
  parsearPegado, fusionarEntradas, whitelistACsv, TOPE_ENTRADAS,
  documentoParaWhitelist,
} from './wl.mjs';
import {
  evaluarCasoAuto, evaluarRemesaAuto, FLUJO_CONFIG_DEFAULT, enStandby,
} from './decision.mjs';

let fallas = 0;
const ok = (n, c, extra) => {
  console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra)));
  if (!c) fallas++;
};
const titulo = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 68 - t.length)));

// ── Ayudas ──────────────────────────────────────────────────────────────────
const entrada = (p = {}) => ({
  documento: '123456789', customerId: '9990001', nombre: 'Cliente Prueba',
  motivo: 'Homonimia verificada', referencia: 'CASE-1',
  vigenciaHasta: null, agregadoPor: 'test', agregadoEn: '2026-09-20T00:00:00.000Z',
  ...p,
});
const lista = (entradas, enabled = true) => normalizarWhitelist({ enabled, entradas }).wl;
// Los casos de prueba son de REMESA: la whitelist es exclusiva de esa cola.
const caso = (datos = {}, resto = {}) => ({
  id: 'c1', numeroCaso: '02646256', asunto: 'DETIENE TX 998877',
  nombreCuenta: 'X', pais: 'Chile', recibidoEn: '', origen: 'sf',
  datos: { 'Número de DNI': '12.345.678-9', 'Id interno del usuario': '9990001', ...datos },
  ...resto,
});

// ════════════════════════════════════════════════════════════════════════════
titulo('Normalización: qué entra y qué se descarta');

{
  const n = normalizarWhitelist({ enabled: true, entradas: [entrada({ documento: '12.345.678-9' })] });
  ok('una entrada completa entra', n.wl.entradas.length === 1, n.descartadas);
  ok('el documento queda canónico', n.wl.entradas[0].documento === '123456789', n.wl.entradas[0]);
}

{
  // EL caso que rompería todo: sin ninguna llave utilizable.
  const n = normalizarWhitelist({ enabled: true, entradas: [entrada({ documento: '', customerId: '' })] });
  ok('sin documento NI customerId se descarta', n.wl.entradas.length === 0, n.wl.entradas);
  ok('…y dice por qué', /documento ni customerId/i.test(n.descartadas[0]?.motivo ?? ''), n.descartadas);
}

{
  const basura = ['', '0', '-', 'N/A', '000000000', '   '];
  const n = normalizarWhitelist({
    enabled: true,
    entradas: basura.map(v => entrada({ documento: v, customerId: v })),
  });
  ok('los huecos disfrazados se descartan todos', n.wl.entradas.length === 0,
    { entraron: n.wl.entradas });
}

{
  // Un customerId CORTO es válido. Va fijado acá porque la primera versión puso
  // el piso en 4 dígitos "por si acaso" y rechazó 6 clientes reales de una carga
  // de 7.829: los ids viejos tienen dos dígitos. Un piso inventado sin mirar los
  // datos rechaza cosas buenas y le echa la culpa al archivo.
  const cortos = lista([
    entrada({ documento: '', customerId: '11' }),
    entrada({ documento: '', customerId: '20', motivo: 'otro' }),
    entrada({ documento: '', customerId: '948', motivo: 'otro mas' }),
  ]);
  ok('un customerId de dos dígitos entra', cortos.entradas.length === 3, cortos.entradas.length);
  ok('…y coincide con el caso',
    buscarEnWhitelist(caso({ 'Número de DNI': '', 'Id interno del usuario': '11' }), cortos)?.valor === '11');
}

{
  // LA trampa de las bases masivas, pinchada acá para que quede visible: el
  // match es EXACTO tras normalizar, así que un RUT cargado sin el dígito
  // verificador NO coincide con el caso, que sí lo trae. No se hace match
  // difuso a propósito —esta lista perdona todo y adivinar documentos es
  // exactamente lo que no puede hacer—, así que el aviso es de la UI: el
  // mantenedor cuenta cuántos casos de la cola coincidirían antes de guardar.
  const sinDV = lista([entrada({ documento: '12345678', customerId: '' })]);
  ok('un RUT sin dígito verificador NO coincide con el caso que sí lo trae',
    buscarEnWhitelist(caso({ 'Id interno del usuario': '' }), sinDV) === null);
  const conDV = lista([entrada({ documento: '12345678-9', customerId: '' })]);
  ok('…y con el DV sí coincide, escrito como sea',
    buscarEnWhitelist(caso({ 'Id interno del usuario': '' }), conDV)?.valor === '123456789');
}

{
  // Un documento sin NINGÚN dígito no sirve de llave: una celda con «SIN DATO»,
  // «PENDIENTE» o «NO SIRVE» pasa el largo mínimo de la función compartida y
  // entraría a la lista como si fuera un documento. No liberaría a nadie, pero
  // ensucia una lista donde importa saber exactamente qué hay.
  const textos = ['no-sirve', 'SIN DATO', 'PENDIENTE', 'POR VALIDAR'];
  ok('un documento sin dígitos no sirve de llave',
    textos.every(t => documentoParaWhitelist(t) === false), textos.filter(documentoParaWhitelist));
  ok('…y con dígitos sí', documentoParaWhitelist('12345678-9') === true);
  ok('…y un pasaporte alfanumérico sigue sirviendo', documentoParaWhitelist('AB1234567') === true);
  const n2 = normalizarWhitelist({ enabled: true, entradas: [entrada({ documento: 'no-sirve', customerId: '' })] });
  ok('una entrada con ese texto como única llave se descarta', n2.wl.entradas.length === 0, n2.descartadas);
}

{
  const n = normalizarWhitelist({ enabled: true, entradas: [entrada({ motivo: '' })] });
  ok('sin motivo se descarta', n.wl.entradas.length === 0, n.descartadas);
}

{
  const n = normalizarWhitelist({ enabled: true, entradas: [entrada({ vigenciaHasta: '31/12/2026' })] });
  ok('una vigencia con formato raro descarta la ENTRADA (no se ignora la fecha)',
    n.wl.entradas.length === 0, n.descartadas);
}

{
  const n = normalizarWhitelist({ enabled: true, entradas: [entrada(), entrada()] });
  ok('la duplicada exacta se descarta', n.wl.entradas.length === 1, n.wl.entradas);
}

{
  // `enabled` ausente ⇒ apagado. Un campo que falta no puede prender la lista.
  ok('enabled ausente ⇒ apagada', normalizarWhitelist({ entradas: [entrada()] }).wl.enabled === false);
  ok('enabled "true" (string) ⇒ apagada', normalizarWhitelist({ enabled: 'true' }).wl.enabled === false);
  ok('doc inexistente ⇒ apagada y vacía',
    normalizarWhitelist(undefined).wl.enabled === false && normalizarWhitelist(undefined).wl.entradas.length === 0);
}

{
  const n = normalizarWhitelist({ enabled: true, entradas: [{ documento: '12345678-9', motivo: 'x' }] });
  ok('con una llave y un motivo alcanza', n.wl.entradas.length === 1, n.descartadas);
}

// ════════════════════════════════════════════════════════════════════════════
titulo('Búsqueda');

{
  const wl = lista([entrada()]);
  ok('apagada nunca coincide', buscarEnWhitelist(caso(), lista([entrada()], false)) === null);
  ok('coincide por documento con otra puntuación',
    buscarEnWhitelist(caso({ 'Id interno del usuario': '' }), wl)?.por === 'documento');
  ok('coincide por customerId cuando el documento no está',
    buscarEnWhitelist(caso({ 'Número de DNI': '' }), wl)?.por === 'customerId');
  ok('el documento gana cuando están los dos',
    buscarEnWhitelist(caso(), wl)?.por === 'documento');
}

{
  // Un caso SIN los campos no puede coincidir con nada. Es la otra mitad de la
  // regla de las llaves vacías: la entrada se valida al cargar, el caso acá.
  const wl = lista([entrada()]);
  ok('un caso sin documento ni customerId no coincide',
    buscarEnWhitelist(caso({ 'Número de DNI': '', 'Id interno del usuario': '' }), wl) === null);
  ok('un caso con basura en los campos no coincide',
    buscarEnWhitelist(caso({ 'Número de DNI': 'N/A', 'Id interno del usuario': '0' }), wl) === null);
}

{
  const wl = lista([entrada({ vigenciaHasta: '2026-09-19' })]);
  ok('vencida ayer: no aplica', buscarEnWhitelist(caso(), wl, '2026-09-20') === null);
  ok('el día del vencimiento todavía aplica',
    !!buscarEnWhitelist(caso(), wl, '2026-09-19'));
  ok('sin vigencia, siempre', entradaVigente(entrada(), '2099-01-01') === true);
}

{
  // El índice se memoiza por identidad del array. Una lista nueva con otro
  // contenido tiene que dar otro resultado, no el cacheado.
  const a = lista([entrada({ documento: '123456789' })]);
  const b = lista([entrada({ documento: '876543210', customerId: '9999999' })]);
  ok('el caché del índice no se pega entre listas distintas',
    !!buscarEnWhitelist(caso(), a) && buscarEnWhitelist(caso(), b) === null);
}

// ════════════════════════════════════════════════════════════════════════════
titulo('Enganche con la decisión: SIN whitelist nada cambia');

{
  // La regresión que más importa. Hoy la cola corre con los flujos apagados: si
  // agregar la whitelist hiciera que algo se libere solo, sería plata movida sin
  // que nadie lo pidiera.
  const cfg = FLUJO_CONFIG_DEFAULT.remesa;      // enabled: false, destinos apagados
  const limpio = { estado: 'ok', flujo: 'CL', decision: 'Liberar', coincidencias: [], listas: [] };
  ok('sin whitelist y flujo apagado: no se automatiza',
    evaluarRemesaAuto(caso(), limpio, cfg).automatizable === false);
  ok('…y el motivo sigue siendo flujo_apagado',
    evaluarRemesaAuto(caso(), limpio, cfg).motivo === 'flujo_apagado');
  ok('con whitelist VACÍA tampoco cambia',
    evaluarRemesaAuto(caso(), limpio, cfg, lista([])).motivo === 'flujo_apagado');
  ok('con whitelist APAGADA tampoco cambia',
    evaluarRemesaAuto(caso(), limpio, cfg, lista([entrada()], false)).motivo === 'flujo_apagado');
  const ajena = lista([entrada({ documento: '876543210', customerId: '9999999' })]);
  ok('un cliente ajeno a la lista no se libera',
    evaluarRemesaAuto(caso(), limpio, cfg, ajena).motivo === 'flujo_apagado');
}

{
  // LA COLA DE OFAC NO TIENE WHITELIST. `evaluarCasoAuto` ni siquiera la recibe;
  // esto fija que la decisión de OFAC sigue siendo la de siempre.
  const cfg = { ...FLUJO_CONFIG_DEFAULT.ofac, enabled: true, paises: { CL: true, CO: true } };
  const ofac = caso({}, { asunto: 'Coincidencia OFAC' });
  const sensible = { decision: 'Liberar', coincidencias: [{ tipo: 'penal', detalle: 'lavado de activos' }] };
  ok('en OFAC el delito sensible sigue reteniendo',
    evaluarCasoAuto(ofac, sensible, cfg).motivo === 'delito_sensible');
  ok('en OFAC el PEP sigue reteniendo',
    evaluarCasoAuto(ofac, { decision: 'Liberar', pep: true }, cfg).motivo === 'pep');
  ok('en OFAC un caso limpio se libera como siempre',
    evaluarCasoAuto(ofac, { decision: 'Liberar', coincidencias: [] }, cfg).automatizable === true);
  ok('evaluarCasoAuto toma 3 argumentos (la whitelist no llega a OFAC)',
    evaluarCasoAuto.length === 3, { largo: evaluarCasoAuto.length });
}

// ════════════════════════════════════════════════════════════════════════════
titulo('Enganche con la decisión: CON whitelist perdona todo');

{
  const cfg = FLUJO_CONFIG_DEFAULT.remesa;        // flujo APAGADO a propósito
  const wl = lista([entrada()]);
  const r = caso();

  const sinWl = evaluarRemesaAuto(r, undefined, cfg, lista([]));
  ok('sin whitelist, la remesa no se libera', sinWl.automatizable === false, sinWl);

  const conWl = evaluarRemesaAuto(r, undefined, cfg, wl);
  ok('libera con el flujo APAGADO y el destino apagado (switch propio)',
    conWl.automatizable === true && conWl.tipologia === cfg.tipoLiberar, conWl);
  ok('deja dicho que fue por whitelist', conWl.whitelist?.por === 'documento', conWl.whitelist);
  ok('…con el motivo de la entrada',
    conWl.whitelist?.entrada?.motivo === 'Homonimia verificada', conWl.whitelist);

  const todoMal = evaluarRemesaAuto(r, {
    estado: 'ok', flujo: 'INTL', pep: true,
    listas: [{ lista: 'OFAC SDN' }],
    coincidencias: [{ tipo: 'penal', detalle: 'trafico de drogas' }],
  }, cfg, wl);
  ok('libera pese a listas de sanciones + delito sensible + PEP',
    todoMal.automatizable === true, todoMal);
}

{
  // Los dos frenos que la whitelist NO pasa por encima.
  const cfg = FLUJO_CONFIG_DEFAULT.remesa;
  const wl = lista([entrada()]);
  ok('un caso con analista asignado no se cierra solo',
    evaluarRemesaAuto(caso({}, { asignacion: { analistaId: 'u1' } }), undefined, cfg, wl).motivo === 'asignado');
  ok('un caso ya cerrado no se reabre',
    evaluarRemesaAuto(caso({}, { statusCaso: 'CERRADO' }), undefined, cfg, wl).motivo === 'ya_cerrado');
}

// ════════════════════════════════════════════════════════════════════════════
titulo('STAND BY: frena todo, incluso la whitelist');

{
  const frenado = { standby: { activo: true, motivo: 'revisión pendiente', por: 'ana', en: '2026-09-20T00:00:00.000Z' } };
  ok('enStandby detecta el freno', enStandby(caso({}, frenado)) === true);
  ok('…y un caso sin el campo no está frenado', enStandby(caso()) === false);
  ok('…ni uno con activo:false',
    enStandby(caso({}, { standby: { activo: false, motivo: '', por: '', en: '' } })) === false);

  // OFAC: con el flujo prendido y un caso que se liberaría solo.
  const cfgO = { ...FLUJO_CONFIG_DEFAULT.ofac, enabled: true, paises: { CL: true, CO: true } };
  const limpioO = { decision: 'Liberar', coincidencias: [] };
  const ofacFrenado = caso({}, { ...frenado, asunto: 'Coincidencia OFAC' });
  ok('en OFAC frena un caso que si no se cerraría',
    evaluarCasoAuto(ofacFrenado, limpioO, cfgO).motivo === 'standby',
    evaluarCasoAuto(ofacFrenado, limpioO, cfgO));

  // Remesa: con el flujo prendido Y el destino habilitado.
  const cfgR = { ...FLUJO_CONFIG_DEFAULT.remesa, enabled: true, paises: { CL: true, CO: true, INTL: true } };
  const limpioR = { estado: 'ok', flujo: 'CL', coincidencias: [], listas: [] };
  ok('en remesas frena una que si no se liberaría',
    evaluarRemesaAuto(caso({}, frenado), limpioR, cfgR).motivo === 'standby');

  // LO QUE MÁS IMPORTA: el stand by gana sobre la whitelist.
  const wl = lista([entrada()]);
  ok('el stand by GANA sobre la whitelist',
    evaluarRemesaAuto(caso({}, frenado), undefined, FLUJO_CONFIG_DEFAULT.remesa, wl).motivo === 'standby');
  ok('…y sin el freno, esa misma lista sí libera',
    evaluarRemesaAuto(caso(), undefined, FLUJO_CONFIG_DEFAULT.remesa, wl).automatizable === true);
}

// ════════════════════════════════════════════════════════════════════════════
titulo('Carga masiva');

{
  const op = { agregadoPor: 'test' };
  const r = parsearPegado(
    'documento\tcustomerId\tnombre\tmotivo\n'
    + '12.345.678-9\t9990001\tJuan Perez\tHomonimia\n'
    + '9.876.543-K\t9990002\tAna Soto\tHomonimia\n',
    op);
  ok('saltea el encabezado', r.encabezadoSalteado === true, r);
  ok('lee las dos filas', r.entradas.length === 2, r);
  ok('normaliza el documento', r.entradas[0].documento === '123456789', r.entradas[0]);
  ok('conserva el motivo de cada fila', r.entradas[0].motivo === 'Homonimia', r.entradas[0]);
}

{
  // El encabezado solo se saltea si NINGUNA celda parece una llave: una primera
  // fila que YA es un cliente no se puede perder.
  const r = parsearPegado('12345678\t9990001\tRut Motivo Nombre\tHomonimia\n',
    { agregadoPor: 't' });
  ok('una primera fila que es un cliente no se confunde con encabezado',
    r.encabezadoSalteado === false && r.entradas.length === 1, r);
}

{
  const r = parsearPegado('12345678;;Juan;;;\nbasura;;;;;\n',
    { agregadoPor: 't', motivoPorDefecto: 'Base masiva AR-1' });
  ok('el motivo por defecto salva las filas sin motivo', r.entradas.length === 1, r);
  ok('…y la fila inválida se reporta, no se traga', r.errores.length === 1, r.errores);
}

{
  const r = parsearPegado('12345678\t\t\t\n', { agregadoPor: 't' });
  ok('sin motivo ni default, la fila NO entra', r.entradas.length === 0 && r.errores.length === 1, r);
}

{
  const viejas = [entrada({ documento: '11111111', customerId: '1111111', motivo: 'vieja' })];
  const nuevas = [
    entrada({ documento: '11111111', customerId: '1111111', motivo: 'corregida' }),
    entrada({ documento: '22222222', customerId: '2222222', motivo: 'nueva' }),
  ];
  const f = fusionarEntradas(viejas, nuevas);
  ok('la nueva pisa a la vieja con la misma llave', f.reemplazadas === 1 && f.agregadas === 1, f);
  ok('…y queda el motivo corregido', f.entradas[0].motivo === 'corregida', f.entradas[0]);
  ok('el total es 2, no 3', f.entradas.length === 2, f.entradas);
}

{
  // Volumen: la fusión no puede ser cuadrática o el navegador se cuelga.
  const n = 8000;
  const gen = i => entrada({ documento: String(10000000 + i), customerId: String(4000000 + i) });
  const viejas = Array.from({ length: n }, (_, i) => gen(i));
  const t0 = Date.now();
  const f = fusionarEntradas(viejas, Array.from({ length: n }, (_, i) => gen(i)));
  const ms = Date.now() - t0;
  ok(`fusionar ${n}×${n} no duplica`, f.entradas.length === n && f.reemplazadas === n, { total: f.entradas.length });
  ok(`…y tarda poco (${ms} ms)`, ms < 2000, { ms });
}

{
  const n = normalizarWhitelist({
    enabled: true,
    entradas: Array.from({ length: TOPE_ENTRADAS + 5 }, (_, i) =>
      entrada({ documento: String(10000000 + i), customerId: String(4000000 + i) })),
  });
  ok('el tope corta', n.wl.entradas.length === TOPE_ENTRADAS, { quedaron: n.wl.entradas.length });
  ok('…y lo que sobra se reporta, no se traga', n.descartadas.length === 5, { descartadas: n.descartadas.length });
}

{
  const csv = whitelistACsv([entrada({ motivo: 'Tiene, coma' })]);
  ok('el CSV escapa las comas', csv.includes('"Tiene, coma"'), csv.split('\n')[1]);
  ok('el CSV trae encabezado', csv.startsWith('documento,customerId,'), csv.split('\n')[0]);
}

{
  const r = construirEntrada({ documento: '12.345.678-9', motivo: 'x' }, 'yo');
  ok('construirEntrada acepta una llave sola', r.ok === true && r.entrada.customerId === '', r);
  // Basura de verdad: documento corto y customerId que no es un número.
  // (OJO: un customerId de UN dígito sí es válido — hay clientes con id 11 y 20.)
  const mal = construirEntrada({ documento: '123', customerId: 'N/A', motivo: 'x' }, 'yo');
  ok('…y rechaza llaves basura con un mensaje', mal.ok === false && /documento/.test(mal.error), mal);
  const ceros = construirEntrada({ documento: '', customerId: '000', motivo: 'x' }, 'yo');
  ok('…y un customerId de puros ceros tampoco sirve', ceros.ok === false, ceros);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + (fallas === 0 ? '✅ todo en orden' : `❌ ${fallas} falla(s)`));
process.exit(fallas === 0 ? 0 : 1);
