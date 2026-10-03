// REVISIÓN WEB — las reglas del screening, en código y puras.
//
// Lo que estos tests protegen son los modos de fallo que no se ven mirando una
// pantalla: un dígito verificador mal calculado (rechaza empresas reales o
// aprueba RUT inventados), una marca imitada que pasa, un `pse` adentro de
// «collapse» que hace pasar un sitio pobre por tienda integrada, un resultado de
// búsqueda sin fuente que puntúa, y la tabla de decisión.
//
// Correr:
//   npx esbuild services/revisionWeb/reglas.ts services/revisionWeb/html.ts \
//     services/revisionWeb/paso0.ts services/revisionWeb/busquedas.ts \
//     services/revisionWeb/evaluacion.ts services/revisionWeb/puntaje.ts \
//     services/revisionWeb/gemini.ts --bundle --format=esm --platform=node \
//     --packages=external --outdir=test/rw --log-level=warning
//   node test/revisionWeb.mjs
//
// `--packages=external` hace falta: `@google/genai` no se deja empaquetar para
// Node en ESM («Dynamic require of child_process»), y así se carga desde
// node_modules.
//
// Los datos son INVENTADOS. Los NIT de referencia del anexo A son públicos.

import {
  dvRut, dvNit, analizarIdentificador, analizarTelefono, analizarDireccion, pasarelasEn,
  analizarDominio, dominioRegistrable, analizarFormularios, senalesPlantilla, analizarPagos,
  soloCredencialesAutodeclaradas, declaraLicencia, mismoNombre, correosVsSitio,
} from './rw/reglas.js';
import { htmlATexto, formularios, enlaces, contactosDeEnlaces, esCascaronJs, enlaceParaSlot } from './rw/html.js';
import { FACTORES_POR_USO, sumaPaso0, riesgoDeSuma, UMBRAL } from './rw/paso0.js';
import { armarConsultas } from './rw/busquedas.js';
import { evaluarRondaA, evaluarRondaB } from './rw/evaluacion.js';
import { calcularDimensiones, acreditacionDe, decidir, lecturaDe, kpi, ordenarHallazgos } from './rw/puntaje.js';
import { armarBusquedas, extraerJson, fuentesDeGrounding, normalizarExtraccion } from './rw/gemini.js';

let f = 0;
const ok = (n, c, extra) => { console.log((c ? '  OK    ' : '  FALLA ') + n + (c ? '' : '  ← ' + JSON.stringify(extra))); if (!c) f++; };

// ════════════════════════════════════════════════════════════════════════════
console.log('── Anexo A · dígitos verificadores (contra el Python del procedimiento) ──');
for (const [n, dv] of [[76354771, 'K'], [11111111, '1'], [77111222, '6'], [12345678, '5'], [99500410, '0']]) ok(`RUT ${n}-${dv}`, dvRut(n) === dv, dvRut(n));
for (const [n, dv] of [[800197268, 4], [890903938, 8], [860034313, 7], [900123456, 8], [830114921, 1]]) ok(`NIT ${n}-${dv}`, dvNit(n) === dv, dvNit(n));

let id = analizarIdentificador('RUT 76.354.771-K');
ok('RUT válido con puntos y K', id.tipo === 'RUT' && id.valido === true && !id.rangoPersonaNatural, id);
id = analizarIdentificador('76.354.771-3');
ok('RUT con DV inválido → valido=false (gatillo 1)', id.valido === false && id.dvEsperado === 'K', id);
id = analizarIdentificador('12.345.678-5', 'RUT');
ok('RUT bajo 50 millones → rango de persona natural', id.valido === true && id.rangoPersonaNatural, id);
id = analizarIdentificador('NIT 900.123.456-8');
ok('NIT válido', id.tipo === 'NIT' && id.valido === true, id);
id = analizarIdentificador('900123456', '', 'CO');
ok('NIT sin DV → no validable (null), no inválido', id.tipo === 'NIT' && id.valido === null, id);
ok('sin identificador → null', analizarIdentificador('') === null);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Anexo B · teléfonos y direcciones ──');
const t = (s) => analizarTelefono(s);
ok('+56 9 8765 4321: móvil CL', t('+56 9 8765 4321').pais === 'CL' && t('+56 9 8765 4321').tipo === 'movil');
ok('+56 2 2345 6789: fijo Santiago', t('+56 2 2345 6789').tipo === 'fijo');
ok('+56 41 234 5678: fijo regional', t('+56 41 234 5678').tipo === 'fijo');
ok('+57 310 123 4567: móvil CO', t('+57 310 123 4567').pais === 'CO' && t('+57 310 123 4567').tipo === 'movil');
ok('601 234 5678: fijo Bogotá', t('601 234 5678').pais === 'CO' && t('601 234 5678').tipo === 'fijo');
ok('(1) 234 5678: formato bogotano anterior a 2022', t('(1) 234 5678').formatoAntiguoBogota);
for (const p of ['555-0123', '+1 234 567 890', '123456789']) ok(`«${p}» es relleno`, t(p).placeholder && !t(p).enPlan, t(p));
ok('Calle 93 # 11-26: nomenclatura CO', analizarDireccion('Calle 93 # 11-26, Bogotá').nomenclaturaCO);
ok('Carrera 7 No. 71-21: nomenclatura CO', analizarDireccion('Carrera 7 No. 71-21').nomenclaturaCO);
ok('1209 Orange St: agente registrado', analizarDireccion('1209 Orange St, Wilmington, DE').agenteUOficinaVirtual);
ok('Av. Providencia 1234: no es agente', !analizarDireccion('Av. Providencia 1234, Of 302, Providencia').agenteUOficinaVirtual);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Anexo C · pasarelas, sin falsos positivos ──');
ok('webpay + transbank', JSON.stringify(pasarelasEn('<script src="https://webpay3g.transbank.cl/x.js">')) === JSON.stringify(['Transbank', 'Webpay']), pasarelasEn('<script src="https://webpay3g.transbank.cl/x.js">'));
ok('botón PSE', pasarelasEn('<button>Pagar con PSE</button>').includes('PSE'));
ok('«collapse» y «each» NO son PSE ni ACH', pasarelasEn('<div class="collapse">for each item</div>').length === 0, pasarelasEn('<div class="collapse">for each item</div>'));
ok('js.stripe.com', pasarelasEn('<script src="https://js.stripe.com/v3/"></script>').includes('Stripe'));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Anexo D · dominios ──');
ok('registrable de www.pagos.acme.com.co', dominioRegistrable('www.pagos.acme.com.co') === 'acme.com.co');
const typo = (h) => analizarDominio(h).typosquatting;
for (const h of ['global66-pagos.com', 'global66.cl', 'g1obal66.com', 'bancolombla.com', 'bancoestado-clientes.com', 'santander-clientes.cl']) ok(`${h} imita una marca (gatillo 3)`, !!typo(h), analizarDominio(h));
for (const h of ['global66.com', 'www.global66.com', 'santander.cl', 'hotelsantander.cl', 'acme.cl', 'bancolombia.com', 'pagosacme.cl']) ok(`${h} NO imita`, !typo(h), typo(h));
ok('xn-- → punycode', analizarDominio('xn--glbal66-0ya.com').punycode);
ok('.top → TLD de bajo costo', analizarDominio('acme.top').tldBajoCosto);
ok('acme-soporte.cl → sufijo sospechoso', analizarDominio('acme-soporte.cl').sufijoSospechoso === 'soporte');

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── HTML crudo ──');
const html = `<html><head><script>var x="lorem ipsum";</script><style>.a{}</style></head><body>
  <h1>ACME Pagos SpA</h1><p>RUT 76.354.771-K &amp; más</p>
  <a href="mailto:contacto@acme.cl">Escribinos</a> <a href="tel:+56987654321">Llamanos</a>
  <a href="/terminos-y-condiciones">Términos y condiciones</a> <a href="https://otro.cl/terminos">Términos de otro</a>
  <form action="https://formspree.io/f/abc"><input name="email" placeholder="Correo"><textarea name="msg"></textarea><input type="hidden" name="csrf"></form>
</body></html>`;
const texto = htmlATexto(html);
ok('el texto no trae scripts ni estilos', !texto.includes('lorem') && !texto.includes('.a{}'), texto);
ok('decodifica entidades', texto.includes('& más'));
const lks = enlaces(html, 'https://acme.cl/');
const ct = contactosDeEnlaces(lks);
ok('mailto y tel', ct.correos[0] === 'contacto@acme.cl' && ct.telefonos[0] === '+56987654321', ct);
ok('encuentra /terminos-y-condiciones del MISMO sitio', enlaceParaSlot(lks, 'terminos', 'acme.cl') === 'https://acme.cl/terminos-y-condiciones');
const fs = formularios(html, 'https://acme.cl/', 'inicio');
ok('lee el formulario y omite los campos ocultos', fs.length === 1 && fs[0].campos.length === 2, fs);
ok('un SPA vacío es cascarón', esCascaronJs('<html><body><div id="root"></div><script src="a.js"></script></body></html>'));
ok('un sitio con texto no lo es', !esCascaronJs(html.replace('ACME', 'ACME '.repeat(80))));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Formularios (gatillo 5) ──');
const form = (action, campos) => ({ action, method: 'post', campos, pagina: 'inicio' });
let af = analizarFormularios([form('https://acme.cl/login', [{ tipo: 'text', nombre: 'otp', etiqueta: 'Clave dinámica' }])], 'acme.cl');
ok('pide clave dinámica → gatillo', af.solicitaCredencialesUOtp.length === 1, af);
af = analizarFormularios([form('https://recolector.xyz/x', [{ tipo: 'text', nombre: 'rut', etiqueta: 'RUT' }, { tipo: 'password', nombre: 'clave', etiqueta: 'Clave' }])], 'acme.cl');
ok('pide clave y la envía a OTRO dominio → gatillo', af.solicitaCredencialesUOtp.length === 1 && af.aOtroDominio.includes('recolector.xyz'), af);
af = analizarFormularios([form('https://acme.cl/ingresar', [{ tipo: 'email', nombre: 'email', etiqueta: '' }, { tipo: 'password', nombre: 'password', etiqueta: '' }])], 'acme.cl');
ok('login hacia el propio dominio → se informa, no rechaza', af.solicitaCredencialesUOtp.length === 0 && af.loginPropio, af);
af = analizarFormularios([form('https://formspree.io/f/abc', [{ tipo: 'email', nombre: 'email', etiqueta: '' }])], 'acme.cl');
ok('formulario de contacto a formspree → normal', af.aOtroDominio.length === 0, af);
af = analizarFormularios([form('https://acme.cl/pago', [{ tipo: 'text', nombre: 'cc-number', etiqueta: 'Número de tarjeta' }])], 'acme.cl');
ok('campos de tarjeta propios → se detectan', af.pideTarjeta && af.solicitaCredencialesUOtp.length === 0, af);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Plantilla, pagos y credenciales ──');
ok('lorem ipsum + teléfono de relleno', senalesPlantilla('Lorem ipsum dolor', ['555-0142']).length === 2);
const base = { razonSocial: 'ACME Pagos SpA', titularCuentaPago: '', identificadorTitularCuentaPago: '', mediosPagoSolicitados: [] };
ok('pide cripto → gatillo 4', !!analizarPagos({ ...base, mediosPagoSolicitados: ['cripto'] }).gatillo);
ok('pide tarjeta de regalo → gatillo 4', !!analizarPagos({ ...base, mediosPagoSolicitados: ['tarjeta_regalo'] }).gatillo);
ok('cuenta a RUT de persona natural → gatillo 4', !!analizarPagos({ ...base, titularCuentaPago: 'Juan Pérez', identificadorTitularCuentaPago: '12.345.678-5' }).gatillo);
ok('titular distinto de la razón social → CRITICO', analizarPagos({ ...base, titularCuentaPago: 'Inversiones Beta Ltda' }).titularDistinto);
ok('mismo titular con otra forma societaria → no', !analizarPagos({ ...base, titularCuentaPago: 'Acme Pagos Limitada' }).titularDistinto);
ok('mismoNombre ignora la forma societaria', mismoNombre('ACME Pagos SpA', 'Acme Pagos Limitada'));
ok('solo MSB → registro autodeclarado', soloCredencialesAutodeclaradas(['Registrada como MSB ante FinCEN']));
ok('vigilada por la Superfinanciera → licencia', declaraLicencia(['Vigilada por la Superfinanciera']) && !soloCredencialesAutodeclaradas(['Vigilada por la Superfinanciera']));
const cv = correosVsSitio(['a@acme.cl', 'b@gmail.com', 'c@otra.com'], 'www.acme.cl');
ok('correos: propio, gratuito y otro', cv.propios.length === 1 && cv.gratuitos.length === 1 && cv.otros.length === 1, cv);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Paso 0 (§4) ──');
for (const [uso, esperado] of [['cliente_b2b', 'MEDIO'], ['proveedor_pagos', 'CRITICO'], ['integracion', 'ALTO'], ['link_reportado', 'BAJO']]) {
  ok(`${uso} → ${esperado}`, riesgoDeSuma(sumaPaso0(FACTORES_POR_USO[uso])) === esperado, sumaPaso0(FACTORES_POR_USO[uso]));
}
ok('bordes: 1 BAJO · 2 MEDIO · 4 MEDIO · 5 ALTO · 7 ALTO · 8 CRITICO',
  [1, 2, 4, 5, 7, 8].map(riesgoDeSuma).join() === 'BAJO,MEDIO,MEDIO,ALTO,ALTO,CRITICO');
ok('umbrales 50 / 65 / 80 / 90', UMBRAL.BAJO === 50 && UMBRAL.MEDIO === 65 && UMBRAL.ALTO === 80 && UMBRAL.CRITICO === 90);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Ronda B: las búsquedas las arma el código (§5) ──');
const ext = normalizarExtraccion({ razonSocial: 'ACME Pagos SpA', identificador: '76.354.771-K', serviciosRegulados: ['pagos'], declaraTrayectoria: true, telefonos: ['555-0142'] });
let q = armarConsultas(ext, 'CL', true);
ok('prioridad 1: el identificador exacto entre comillas', q[0].prioridad === 1 && q[0].consulta === '"76.354.771-K"', q[0]);
ok('regulado en CL: alerta de la CMF, no de la SFC', q.some(x => x.consulta.startsWith('site:cmfchile.cl')) && !q.some(x => x.consulta.includes('superfinanciera')), q);
ok('nunca más de 5, en orden de prioridad', q.length <= 5 && q.every((x, i) => i === 0 || q[i - 1].prioridad <= x.prioridad), q);
q = armarConsultas(normalizarExtraccion({ razonSocial: 'ACME Pagos SpA', serviciosRegulados: ['remesas'] }), 'CO', false);
ok('sin identificador: la razón social; regulado en CO: las dos de la SFC', q[0].consulta === '"ACME Pagos SpA"' && q.filter(x => x.prioridad === 2).length === 2, q);
q = armarConsultas(normalizarExtraccion({ razonSocial: 'ACME Pagos SpA', identificador: '76.354.771-K', serviciosRegulados: ['pagos'] }), '', false);
ok('sin jurisdicción y regulado: CMF + SFC, cortado en 5', q.length === 5 && q.filter(x => x.prioridad === 2).length === 3, q);

// ── Nada se simula ──
const fuentes = fuentesDeGrounding({ groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x', title: 'cmfchile.cl' } }, { web: { uri: 'https://x', title: 'emol.com' } }] });
ok('las fuentes reales salen del grounding', fuentes.has('cmfchile.cl') && fuentes.has('emol.com') && !fuentes.has('vertexaisearch.cloud.google.com'), [...fuentes]);
const consultas = [{ prioridad: 1, consulta: '"76.354.771-K"', motivo: 'id' }, { prioridad: 2, consulta: 'site:cmfchile.cl "ACME Pagos SpA"', motivo: 'cmf' }];
const crudo = extraerJson('```json\n[{"consulta":"\\"76.354.771-K\\"","ejecutada":true,"resultados":[{"titulo":"ACME","url":"https://emol.com/a","dominio":"emol.com","mencionaIdentificador":true},{"titulo":"Inventado","url":"https://inventado.cl","dominio":"inventado.cl","mencionaIdentificador":true}]},{"consulta":"site:cmfchile.cl \\"ACME Pagos SpA\\"","ejecutada":true,"resultados":[{"titulo":"Alerta","url":"https://cmfchile.cl/x","dominio":"cmfchile.cl","esAlertaRegulador":true}]}]\n```');
let bs = armarBusquedas(consultas, crudo, fuentes, ['"76.354.771-K"', 'site:cmfchile.cl "ACME Pagos SpA"']);
ok('un resultado cuyo dominio no vino de la búsqueda NO tiene fuente', bs[0].resultados.find(r => r.dominio === 'inventado.cl').conFuente === false);
ok('el que sí vino, sí', bs[0].resultados.find(r => r.dominio === 'emol.com').conFuente === true);
bs = armarBusquedas(consultas, crudo, fuentes, ['"76.354.771-K"', 'ACME Pagos SpA']);
ok('si Google no corrió el site: tal cual, la búsqueda NO cuenta como ejecutada', bs[1].ejecutada === false && bs[1].resultados.length === 0, bs[1]);
bs = armarBusquedas(consultas, crudo, fuentes, []);
ok('sin búsquedas de Google, nada cuenta como ejecutado', bs.every(b => !b.ejecutada));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Rondas A y B, de punta a punta sobre datos falsos ──');
const pagina = (slot, url, h, status = 200) => ({ slot, url, intentadas: [url], lectura: { pedida: url, ok: true, status, urlFinal: url, redirecciones: [], contentType: 'text/html', headers: {}, html: h, bytes: h.length, truncado: false, ms: 1, error: null } });
const htmlBueno = `<body><h1>ACME Pagos SpA</h1><p>RUT 76.354.771-K. ${'Somos una empresa de servicios. '.repeat(20)}</p><a href="mailto:hola@acme.cl">x</a><a href="tel:+56223456789">y</a></body>`;
const ctxA = (cambios = {}) => {
  const paginas = [pagina('inicio', 'https://acme.cl/', htmlBueno), pagina('terminos', 'https://acme.cl/terminos', '<p>Términos. Leyes de la República de Chile.</p>'), { slot: 'privacidad', url: null, lectura: null, intentadas: [] }, { slot: 'nosotros', url: null, lectura: null, intentadas: [] }];
  return {
    urlPedida: 'https://acme.cl/', jurisdiccionEsperada: 'CL', inicio: paginas[0].lectura, paginas,
    htmlTotal: htmlBueno, textoTotal: htmlATexto(htmlBueno), formularios: [], contactos: { correos: ['hola@acme.cl'], telefonos: ['+56223456789'] },
    extraccion: normalizarExtraccion({ razonSocial: 'ACME Pagos SpA', nombreComercial: 'ACME', identificador: '76.354.771-K', tipoIdentificador: 'RUT', correos: ['hola@acme.cl'], telefonos: ['+56 2 2345 6789'], jurisdiccionTextosLegales: 'República de Chile' }),
    ...cambios,
  };
};
let a = evaluarRondaA(ctxA());
ok('un sitio sano no tiene gatillos', a.gatillos.length === 0, a.hallazgos);
ok('  ni hallazgos MAYOR o CRITICO', !a.hallazgos.some(h => h.severidad === 'MAYOR' || h.severidad === 'CRITICO'), a.hallazgos);
ok('  y siempre declara las sanciones como no verificables', a.noVerificable.some(x => x.includes('sanciones')));

a = evaluarRondaA(ctxA({ extraccion: normalizarExtraccion({ razonSocial: 'ACME Pagos SpA', identificador: '76.354.771-3' }) }));
ok('DV inválido → gatillo 1', a.gatillos.some(g => g.numero === 1), a.gatillos);
a = evaluarRondaA(ctxA({ urlPedida: 'https://global66-pagos.com/' , inicio: { ...pagina('inicio', 'https://global66-pagos.com/', htmlBueno).lectura } }));
ok('typosquatting → gatillo 3', a.gatillos.some(g => g.numero === 3), a.gatillos);
a = evaluarRondaA(ctxA({ inicio: { pedida: 'https://acme.cl/', ok: false, status: null, urlFinal: null, redirecciones: [], contentType: null, headers: {}, html: null, bytes: 0, truncado: false, ms: 8000, error: 'sin respuesta en 8 s' }, extraccion: null, textoTotal: '', htmlTotal: '' }));
ok('sitio que no responde: se declara, no se rechaza', !a.legible && a.gatillos.length === 0 && a.noVerificable.some(x => x.includes('no se pudo leer')), a);

a = evaluarRondaA(ctxA());
const e = ctxA().extraccion;
const bAlerta = evaluarRondaB(armarBusquedas(consultas, crudo, fuentes, ['"76.354.771-K"', 'site:cmfchile.cl "ACME Pagos SpA"']), a, e);
ok('alerta CON fuente en el sitio del regulador → gatillo 2', bAlerta.gatillos.some(g => g.numero === 2), bAlerta);
const sinFuente = armarBusquedas(consultas, crudo, new Set(['emol.com']), ['"76.354.771-K"', 'site:cmfchile.cl "ACME Pagos SpA"']);
ok('la misma alerta SIN fuente real → no hay gatillo', evaluarRondaB(sinFuente, a, e).gatillos.length === 0);
ok('identidad confirmada fuera del sitio', bAlerta.identidadConfirmada && bAlerta.independientes.includes('emol.com'), bAlerta);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Puntaje: lo no verificado vale 0 y no se estima (§7) ──');
let d = calcularDimensiones(a, null, e);
ok('sin Ronda B, el rastro externo es no verificable y vale 0', d.find(x => x.clave === 'rastro').estado === 'no_verificable' && d.find(x => x.clave === 'rastro').puntos === 0);
ok('no regulado: la situación regulatoria no aplica y suma sus 15', d.find(x => x.clave === 'regulatoria').estado === 'no_aplica' && d.find(x => x.clave === 'regulatoria').puntos === 15);
ok('las seis dimensiones suman como máximo 100', d.reduce((s, x) => s + x.max, 0) === 100);
const bSana = evaluarRondaB(armarBusquedas([consultas[0]], crudo, fuentes, ['"76.354.771-K"']), a, e);
d = calcularDimensiones(a, bSana, e);
ok('identidad: publicado + DV + confirmado = 25', d.find(x => x.clave === 'identidad').puntos === 25, d.find(x => x.clave === 'identidad'));
const sinSitio = evaluarRondaA(ctxA({ inicio: null, extraccion: null, textoTotal: '', htmlTotal: '' }));
ok('sin sitio: acreditación 0', acreditacionDe(calcularDimensiones(sinSitio, null, null)) === 0);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Decisión (§8 y §9) ──');
const H = (sev, n = 1) => Array.from({ length: n }, (_, i) => ({ codigo: `X${i}`, severidad: sev, texto: 't', fuente: 'f' }));
const G = [{ numero: 1, nombre: 'n', detalle: 'd', fuente: 'f' }];
const casos = [
  ['gatillo → REJECTED aunque el puntaje sea 100', decidir('BAJO', 100, G, []), 'ONBOARDING_REJECTED'],
  ['1 CRITICO → REJECTED', decidir('BAJO', 100, [], H('CRITICO')), 'ONBOARDING_REJECTED'],
  ['BAJO 49 → CONDITIONAL', decidir('BAJO', 49, [], []), 'ONBOARDING_CONDITIONAL'],
  ['BAJO 50 sin MAYOR → APPROVED', decidir('BAJO', 50, [], []), 'ONBOARDING_APPROVED'],
  ['MEDIO 70 + 1 MAYOR → CONDITIONAL', decidir('MEDIO', 70, [], H('MAYOR')), 'ONBOARDING_CONDITIONAL'],
  ['MEDIO 90 + 2 MAYOR → tope ON_HOLD', decidir('MEDIO', 90, [], H('MAYOR', 2)), 'ONBOARDING_ON_HOLD'],
  ['MEDIO 40 + 2 MAYOR → ON_HOLD (el tope baja el CONDITIONAL)', decidir('MEDIO', 40, [], H('MAYOR', 2)), 'ONBOARDING_ON_HOLD'],
  ['MENOR no topea: MEDIO 70 + 5 MENOR → APPROVED', decidir('MEDIO', 70, [], H('MENOR', 5)), 'ONBOARDING_APPROVED'],
  ['ALTO 79 → ON_HOLD', decidir('ALTO', 79, [], []), 'ONBOARDING_ON_HOLD'],
  ['ALTO 80 → APPROVED', decidir('ALTO', 80, [], []), 'ONBOARDING_APPROVED'],
  ['CRITICO 89 → REJECTED (sin acreditación)', decidir('CRITICO', 89, [], []), 'ONBOARDING_REJECTED'],
  ['CRITICO 95 → ON_HOLD (falta el visto bueno del OC)', decidir('CRITICO', 95, [], []), 'ONBOARDING_ON_HOLD'],
];
for (const [n, v, esperado] of casos) ok(n, v.decision === esperado, v);

console.log('\n── La salida (§12) ──');
const r = { decision: 'ONBOARDING_ON_HOLD', acreditacion: 56, umbral: 80, riesgo: 'ALTO', gatillos: [], hallazgos: [...H('MAYOR', 2)] };
const k = kpi(r);
ok('acreditación como «N / 100» y gatillos como «N de 6»', k.acreditacion === '56 / 100' && k.gatillos === '0 de 6' && k.severos === '2 / 0', k);
const v = decidir('ALTO', 56, [], []);
const lect = lecturaDe(v, 'ALTO', 56, [], [], calcularDimensiones(a, null, e));
ok('la línea dice cuántos puntos faltan y qué bloquea', lect.includes('faltan 24 puntos') && lect.includes('bloquea'), lect);
const ord = ordenarHallazgos([...H('INFO'), ...H('MENOR'), ...H('CRITICO'), ...H('MAYOR')]).map(h => h.severidad).join();
ok('los hallazgos van de más a menos severo', ord === 'CRITICO,MAYOR,MENOR,INFO', ord);

console.log(f ? `\n  ${f} FALLARON` : '\n  Todo OK.');
process.exit(f ? 1 : 0);
