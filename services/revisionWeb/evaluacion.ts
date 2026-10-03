// REVISIÓN WEB — de lo leído y lo extraído, a hallazgos y gatillos. Puro.
//
// La severidad de cada hallazgo la fija ESTE archivo (§8), no el modelo. La tabla
// está acá abajo, hallazgo por hallazgo, para que se pueda revisar y discutir sin
// leer el resto del código.

import { analizarDireccion, analizarDominio, analizarFormularios, analizarIdentificador, analizarPagos,
  analizarTelefono, correosVsSitio, dominioRegistrable, mismoNombre, pasarelasEn, senalesPlantilla,
  soloCredencialesAutodeclaradas, type Dominio, type Identificador } from './reglas';
import { nombreDe, ofreceRegulados } from './busquedas';
import { esCascaronJs } from './html';
import type { Busqueda, Extraccion, Formulario, Gatillo, Hallazgo, Jurisdiccion, LecturaWorker, Pagina } from './tipos';

export const NOMBRE_GATILLO: Record<Gatillo['numero'], string> = {
  1: 'Identificador tributario con dígito verificador inválido',
  2: 'Alerta vigente de regulador sobre la entidad',
  3: 'Typosquatting de una marca conocida',
  4: 'Pago solicitado a cuenta de persona natural, cripto o tarjeta de regalo',
  5: 'Formulario que solicita credenciales, clave dinámica u OTP',
  6: 'Coincidencia en listas de sanciones',
};

export interface ContextoRondaA {
  urlPedida: string;
  jurisdiccionEsperada: Jurisdiccion;
  inicio: LecturaWorker | null;
  paginas: Pagina[];
  htmlTotal: string;
  textoTotal: string;
  formularios: Formulario[];
  contactos: { correos: string[]; telefonos: string[] };
  extraccion: Extraccion | null;
}

export interface EvaluacionA {
  hallazgos: Hallazgo[];
  gatillos: Gatillo[];
  legible: boolean;
  cascaronJs: boolean;
  hostSitio: string;
  dominio: Dominio;
  identificador: Identificador | null;
  correos: string[];
  telefonos: string[];
  plantilla: string[];
  pasarelas: string[];
  regulado: boolean;
  /** La jurisdicción con la que se compara y se busca: la que cargó el
   *  analista o, si no cargó ninguna, la que se infiere del sitio. */
  jurisdiccion: Jurisdiccion;
  noVerificable: string[];
}

const hostDe = (u: string | null | undefined): string => {
  try { return new URL(String(u)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

function jurisdiccionDeTexto(s: string): Jurisdiccion {
  const t = String(s || '').toLowerCase();
  if (/chile|chilen|santiago/.test(t)) return 'CL';
  if (/colombia|bogot[aá]|medell[ií]n/.test(t)) return 'CO';
  return t.trim() ? 'OTRA' : '';
}

export function evaluarRondaA(c: ContextoRondaA): EvaluacionA {
  const h: Hallazgo[] = [];
  const g: Gatillo[] = [];
  const nv: string[] = [];
  const add = (codigo: string, severidad: Hallazgo['severidad'], texto: string, fuente: string) => h.push({ codigo, severidad, texto, fuente });
  const gatillo = (numero: Gatillo['numero'], detalle: string, fuente: string) => {
    g.push({ numero, nombre: NOMBRE_GATILLO[numero], detalle, fuente });
    add(`GATILLO_${numero}`, 'CRITICO', `${NOMBRE_GATILLO[numero]}: ${detalle}`, fuente);
  };

  const e = c.extraccion;
  const hostPedido = hostDe(c.urlPedida);
  const urlFinal = c.inicio?.urlFinal || c.urlPedida;
  const hostSitio = hostDe(urlFinal) || hostPedido;
  const fuenteSitio = urlFinal;
  const legible = !!(c.inicio?.ok && c.inicio.status && c.inicio.status < 400 && c.inicio.html);
  const cascaronJs = legible && esCascaronJs(c.inicio?.html || '');

  // ── Dominio, TLS y redirecciones (anexo D) ──────────────────────────────
  const dominio = analizarDominio(hostSitio);
  const dominioPedido = analizarDominio(hostPedido);
  const imitada = dominioPedido.typosquatting || dominio.typosquatting;
  if (imitada) gatillo(3, `${imitada.marca}: ${imitada.como}`, `dominio ${dominioPedido.typosquatting ? hostPedido : hostSitio}`);
  if (dominio.punycode || dominioPedido.punycode) add('PUNYCODE', 'MAYOR', 'Dominio en punycode (xn--): posible uso de homoglifos.', `dominio ${hostSitio}`);
  if (dominio.tldBajoCosto) add('TLD_BAJO_COSTO', 'MENOR', `Dominio en TLD de bajo costo (.${dominio.registrable.split('.').pop()}).`, `dominio ${hostSitio}`);
  if (dominio.sufijoSospechoso && !imitada) add('SUFIJO_SOSPECHOSO', 'MENOR', `Dominio con sufijo «-${dominio.sufijoSospechoso}».`, `dominio ${hostSitio}`);
  if (legible && /^http:/i.test(urlFinal)) add('SIN_TLS', 'MAYOR', 'El sitio se sirve sin TLS (http).', fuenteSitio);
  if (legible && hostPedido && dominioRegistrable(hostPedido) !== dominioRegistrable(hostSitio)) {
    add('REDIRIGE_OTRO_DOMINIO', 'MAYOR', `${hostPedido} redirige a otro dominio (${hostSitio}).`, `redirecciones de ${c.urlPedida}`);
  }

  if (!legible) {
    const motivo = c.inicio?.error || (c.inicio?.status ? `HTTP ${c.inicio.status}` : 'sin respuesta');
    add('SITIO_NO_LEGIBLE', 'INFO', `El sitio no se pudo leer (${motivo}).`, c.urlPedida);
    nv.push(`Contenido del sitio: no se pudo leer (${motivo}).`);
  } else if (cascaronJs) {
    add('CASCARON_JS', 'INFO', 'El sitio se arma con JavaScript: el HTML leído casi no tiene texto.', fuenteSitio);
    nv.push('Señales que dependen del DOM (formularios, scripts, pasarelas): sin navegador quedan no evaluables (§15.2).');
  }

  // ── Identificador (anexo A) ─────────────────────────────────────────────
  const identificador = e ? analizarIdentificador(e.identificador, e.tipoIdentificador, c.jurisdiccionEsperada) : null;
  const jurisdiccion: Jurisdiccion = c.jurisdiccionEsperada
    || (identificador?.tipo === 'RUT' ? 'CL' : identificador?.tipo === 'NIT' ? 'CO' : '')
    || jurisdiccionDeTexto((e?.mercadosDeclarados || []).join(' '))
    || (/\.cl$/.test(dominio.registrable) ? 'CL' : /\.co$/.test(dominio.registrable) ? 'CO' : '');

  if (legible && e) {
    if (!identificador) add('SIN_IDENTIFICADOR', 'MENOR', 'El sitio no publica identificador tributario.', fuenteSitio);
    else if (identificador.valido === false) gatillo(1, `${identificador.tipo} ${identificador.texto}: el dígito verificador debería ser ${identificador.dvEsperado}`, fuenteSitio);
    else if (identificador.valido === null) add('IDENTIFICADOR_SIN_DV', 'INFO', `${identificador.tipo === 'desconocido' ? 'Identificador' : identificador.tipo} ${identificador.texto} publicado sin dígito verificador: no validable.`, fuenteSitio);
    if (identificador?.rangoPersonaNatural && identificador.valido !== false) {
      add('RUT_RANGO_NATURAL', 'MAYOR', `RUT ${identificador.texto} en rango de persona natural (bajo 50 millones) para una empresa.`, fuenteSitio);
    }
  }

  // ── Correos, teléfonos, direcciones ─────────────────────────────────────
  const correos = [...new Set([...(c.contactos.correos || []), ...(e?.correos || [])].map(x => x.toLowerCase()))];
  const telefonos = [...new Set([...(c.contactos.telefonos || []), ...(e?.telefonos || [])])];
  if (legible && e) {
    const cv = correosVsSitio(correos, hostSitio);
    if (!correos.length) add('SIN_CORREO', 'INFO', 'El sitio no publica correo de contacto.', fuenteSitio);
    else if (!cv.propios.length && cv.gratuitos.length) add('CORREO_GRATUITO', 'MENOR', `Correo de contacto en proveedor gratuito (${cv.gratuitos[0]}), no en ${dominio.registrable}.`, fuenteSitio);
    else if (!cv.propios.length && cv.otros.length) add('CORREO_OTRO_DOMINIO', 'MENOR', `Correo de contacto en otro dominio (${cv.otros[0]}).`, fuenteSitio);

    for (const t of telefonos.map(analizarTelefono)) {
      if (t.placeholder) continue;   // va en señales de plantilla
      if (t.formatoAntiguoBogota) { add('TELEFONO_FORMATO_ANTIGUO', 'MENOR', `Teléfono ${t.texto} con el formato bogotano anterior a 2022: contenido antiguo o copiado.`, fuenteSitio); break; }
      if (!t.enPlan && (jurisdiccion === 'CL' || jurisdiccion === 'CO')) { add('TELEFONO_FUERA_DE_PLAN', 'MENOR', `Teléfono ${t.texto} fuera del plan de numeración CL / CO.`, fuenteSitio); break; }
    }
    const agente = (e.direcciones || []).map(analizarDireccion).find(d => d.agenteUOficinaVirtual);
    if (agente) add('DIRECCION_AGENTE', 'MENOR', `Domicilio de agente registrado u oficina virtual: ${agente.texto.slice(0, 80)}.`, fuenteSitio);
    if (jurisdiccion === 'CL' && (e.direcciones || []).length) nv.push('Comuna de la dirección: no se valida contra el listado oficial; verificación manual.');
  }

  // ── Textos legales ──────────────────────────────────────────────────────
  const hayLegal = c.paginas.some(p => (p.slot === 'terminos' || p.slot === 'privacidad') && p.lectura?.ok && (p.lectura.status ?? 500) < 400);
  const regulado = !!e && ofreceRegulados(e);
  if (legible && !cascaronJs && !hayLegal) add('SIN_TEXTOS_LEGALES', 'MENOR', 'Sin términos ni política de privacidad publicados.', fuenteSitio);
  if (legible && e?.jurisdiccionTextosLegales) {
    const jl = jurisdiccionDeTexto(e.jurisdiccionTextosLegales);
    if ((jurisdiccion === 'CL' || jurisdiccion === 'CO') && jl && jl !== jurisdiccion) {
      add('JURISDICCION_LEGAL_DISTINTA', regulado ? 'MAYOR' : 'MENOR',
        `Los textos legales citan ${e.jurisdiccionTextosLegales} y el mercado es ${jurisdiccion}.`, 'textos legales del sitio');
    }
  }

  // ── Plantilla ───────────────────────────────────────────────────────────
  const plantilla = legible ? senalesPlantilla(c.textoTotal, telefonos) : [];
  if (plantilla.length) add('PLANTILLA', 'MENOR', `Señales de plantilla: ${plantilla.join('; ')}.`, fuenteSitio);

  // ── Pagos (anexo C) ─────────────────────────────────────────────────────
  const pasarelas = legible ? pasarelasEn(c.htmlTotal) : [];
  if (legible && e) {
    if (e.declaraVentaEnLinea && !pasarelas.length && !cascaronJs) {
      add('TIENDA_DECORATIVA', 'MAYOR', 'Declara venta en línea sin integrar ninguna pasarela de pago.', `código fuente de ${hostSitio}`);
    }
    const p = analizarPagos(e);
    if (p.gatillo) gatillo(4, p.gatillo, fuenteSitio);
    if (p.titularDistinto) add('TITULAR_DISTINTO', 'CRITICO', `Titular de la cuenta de pago (${e.titularCuentaPago}) distinto de la razón social (${e.razonSocial}).`, fuenteSitio);
    else if (p.titularPareceNatural) add('TITULAR_PARECE_NATURAL', 'MAYOR', `La cuenta de pago está a nombre de ${e.titularCuentaPago}, sin forma societaria.`, fuenteSitio);
    if (regulado && soloCredencialesAutodeclaradas(e.credencialesRegulatorias)) {
      add('SOLO_REGISTRO_AUTODECLARADO', 'MAYOR', `Ofrece servicios regulados y exhibe como única credencial un registro autodeclarado (${e.credencialesRegulatorias.join('; ')}).`, fuenteSitio);
    }
  }

  // ── Formularios ─────────────────────────────────────────────────────────
  if (legible && !cascaronJs) {
    const f = analizarFormularios(c.formularios, hostSitio);
    for (const s of f.solicitaCredencialesUOtp.slice(0, 1)) gatillo(5, s.motivo, `formulario en ${s.pagina} de ${hostSitio}`);
    if (f.pideTarjeta) add('FORMULARIO_TARJETA', 'MAYOR', 'Un formulario propio pide datos de tarjeta (número, CVV o vencimiento).', fuenteSitio);
    if (f.loginPropio && !f.solicitaCredencialesUOtp.length) add('LOGIN_PROPIO', 'INFO', 'Portal de clientes con ingreso por clave en el propio dominio.', fuenteSitio);
    if (f.aOtroDominio.length) add('FORMULARIO_OTRO_DOMINIO', 'MENOR', `Formulario que envía a otro dominio (${f.aOtroDominio.join(', ')}).`, fuenteSitio);
  }

  // Gatillo 6: no hay fuente de listas de sanciones en el screening —el
  // módulo no usa Regcheq ni nada de AWS— así que se declara, no se supone.
  nv.push('Listas de sanciones (gatillo 6): sin fuente en el screening; verificación manual en Regcheq / Inspektor.');

  return {
    hallazgos: h, gatillos: g, legible, cascaronJs, hostSitio, dominio, identificador, correos, telefonos,
    plantilla, pasarelas, regulado, jurisdiccion, noVerificable: nv,
  };
}

// ── Ronda B ────────────────────────────────────────────────────────────────

const DOMINIOS_REGULADOR = ['cmfchile.cl', 'superfinanciera.gov.co', 'svs.cl', 'sbif.cl', 'bcentral.cl', 'banrep.gov.co', 'sec.gov', 'fca.org.uk', 'cnmv.es'];

export interface EvaluacionB {
  hallazgos: Hallazgo[];
  gatillos: Gatillo[];
  /** Resultados con fuente real, de dominios que no son el del sitio. */
  independientes: string[];
  identidadConfirmada: boolean;
  nombreConfirmado: boolean;
  autorizacionConfirmada: boolean;
  busquedaAlertasEjecutada: boolean;
  noVerificable: string[];
}

export function evaluarRondaB(busquedas: Busqueda[], a: EvaluacionA, e: Extraccion): EvaluacionB {
  const h: Hallazgo[] = [];
  const g: Gatillo[] = [];
  const nv: string[] = [];
  const sitio = a.dominio.registrable;
  const ajeno = (dom: string) => !!dom && dominioRegistrable(dom) !== sitio;
  const nombre = nombreDe(e);

  for (const b of busquedas) {
    if (!b.ejecutada) nv.push(`Búsqueda ${b.prioridad} (${b.motivo}): no se ejecutó${b.nota ? ` — ${b.nota}` : ''}.`);
  }

  const conFuente = busquedas.flatMap(b => b.ejecutada ? b.resultados.filter(r => r.conFuente).map(r => ({ ...r, prioridad: b.prioridad })) : []);

  // Gatillo 2: una alerta, con fuente real, en el sitio de un regulador.
  const alerta = conFuente.find(r => r.prioridad === 2 && r.esAlertaRegulador && DOMINIOS_REGULADOR.includes(dominioRegistrable(r.dominio)));
  if (alerta) {
    g.push({ numero: 2, nombre: NOMBRE_GATILLO[2], detalle: alerta.titulo || alerta.extracto.slice(0, 120), fuente: alerta.url });
    h.push({ codigo: 'GATILLO_2', severidad: 'CRITICO', texto: `${NOMBRE_GATILLO[2]}: ${alerta.titulo || alerta.extracto.slice(0, 120)}`, fuente: alerta.url });
  }

  const identidadConfirmada = conFuente.some(r => r.prioridad === 1 && r.mencionaIdentificador && ajeno(r.dominio));
  const nombreConfirmado = conFuente.some(r => r.mencionaNombre && ajeno(r.dominio));
  const autorizacionConfirmada = conFuente.some(r => r.prioridad === 2 && r.esAutorizacionRegulador && DOMINIOS_REGULADOR.includes(dominioRegistrable(r.dominio)));
  const busquedaAlertasEjecutada = busquedas.some(b => b.prioridad === 2 && b.ejecutada);

  const p1 = busquedas.find(b => b.prioridad === 1);
  if (p1?.ejecutada && !identidadConfirmada && !nombreConfirmado) {
    h.push({ codigo: 'SIN_RASTRO_IDENTIFICADOR', severidad: 'INFO', texto: `Sin rastro externo de ${p1.consulta} (para empresas nuevas o micro tiene bajo valor probatorio).`, fuente: `búsqueda ${p1.consulta}` });
  }

  // Prioridad 3: el dato de contacto aparece en sitios ajenos que no son de la
  // empresa — teléfono o dirección reciclados.
  const p3 = busquedas.find(b => b.prioridad === 3 && b.ejecutada);
  if (p3) {
    const ajenos = [...new Set(p3.resultados.filter(r => r.conFuente && ajeno(r.dominio) && !r.mencionaNombre).map(r => dominioRegistrable(r.dominio)))];
    if (ajenos.length >= 2) h.push({ codigo: 'CONTACTO_REUTILIZADO', severidad: 'MAYOR', texto: `El dato de contacto ${p3.consulta} aparece en ${ajenos.length} sitios ajenos (${ajenos.slice(0, 3).join(', ')}).`, fuente: `búsqueda ${p3.consulta}` });
    else if (ajenos.length === 1) h.push({ codigo: 'CONTACTO_REUTILIZADO', severidad: 'MENOR', texto: `El dato de contacto ${p3.consulta} aparece en un sitio ajeno (${ajenos[0]}).`, fuente: `búsqueda ${p3.consulta}` });
  }

  // Prioridad 4: la trayectoria declarada contra la encontrada.
  const p4 = busquedas.find(b => b.prioridad === 4 && b.ejecutada);
  const declarado = Number(/\b(19|20)\d{2}\b/.exec(e.anioFundacion || '')?.[0] || NaN);
  const encontrado = Number(/\b(19|20)\d{2}\b/.exec(p4?.anioFundacion || '')?.[0] || NaN);
  if (p4 && Number.isFinite(declarado) && Number.isFinite(encontrado) && Math.abs(declarado - encontrado) > 2 && p4.resultados.some(r => r.conFuente)) {
    h.push({ codigo: 'TRAYECTORIA_NO_COINCIDE', severidad: 'MENOR', texto: `Declara fundación en ${declarado}; las fuentes externas indican ${encontrado}.`, fuente: `búsqueda ${p4.consulta}` });
  }

  // Prioridad 5: reclamos.
  const p5 = busquedas.find(b => b.prioridad === 5 && b.ejecutada);
  const reclamos = p5 ? p5.resultados.filter(r => r.conFuente && r.esReclamo && (r.mencionaNombre || !nombre)) : [];
  if (reclamos.length) h.push({ codigo: 'RECLAMOS', severidad: 'MENOR', texto: `${reclamos.length} resultado(s) con reclamos de clientes (${reclamos[0].dominio}).`, fuente: reclamos[0].url });

  const independientes = [...new Set(conFuente.filter(r => ajeno(r.dominio) && (r.mencionaNombre || r.mencionaIdentificador)).map(r => dominioRegistrable(r.dominio)))];

  return { hallazgos: h, gatillos: g, independientes, identidadConfirmada, nombreConfirmado, autorizacionConfirmada, busquedaAlertasEjecutada, noVerificable: nv };
}

/** ¿El nombre de la empresa calza con el dominio? `acmepagos.cl` y «ACME Pagos SpA». */
export function nombreCalzaConDominio(e: Pick<Extraccion, 'razonSocial' | 'nombreComercial'>, registrable: string): boolean {
  const etiqueta = registrable.split('.')[0].replace(/-/g, '');
  const palabras = `${e.razonSocial} ${e.nombreComercial}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(p => p.length >= 4);
  return palabras.some(p => etiqueta.includes(p)) || (!!e.nombreComercial && mismoNombre(e.nombreComercial, etiqueta));
}
