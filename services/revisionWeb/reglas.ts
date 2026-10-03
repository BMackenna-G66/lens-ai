// REVISIÓN WEB — las reglas, en código y puras.
//
// El modelo solo EXTRAE lo que está escrito. Todo lo que de esto sale —un dígito
// verificador inválido, una pasarela que no está, un dominio que imita a una
// marca— lo decide este archivo, con funciones sin estado que se testean en
// `test/revisionWeb.mjs`. Los anexos son los del procedimiento (§ y anexos A–D).

import type { Campo, Extraccion, Formulario } from './tipos';

// ── Anexo A · identificadores ──────────────────────────────────────────────

/** RUT chileno, módulo 11. */
export function dvRut(cuerpo: string | number): string {
  let s = 0;
  let m = 2;
  for (const d of String(cuerpo).split('').reverse()) {
    s += Number(d) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** NIT colombiano, algoritmo DIAN. */
export function dvNit(base: string | number): number {
  const s = String(base).split('').reverse()
    .reduce((acc, d, i) => acc + Number(d) * PESOS_NIT[i], 0);
  const r = s % 11;
  return r === 0 || r === 1 ? r : 11 - r;
}

export type TipoIdentificador = 'RUT' | 'NIT' | 'desconocido';

export interface Identificador {
  texto: string;
  tipo: TipoIdentificador;
  base: string;
  dv: string | null;
  /** null = no se puede validar (no trae dígito verificador). */
  valido: boolean | null;
  dvEsperado: string | null;
  /** RUT bajo 50 millones: rango de persona natural (anexo A). */
  rangoPersonaNatural: boolean;
}

/** Interpreta el identificador publicado. El tipo sale de lo que el sitio dice
 *  (RUT / NIT) o, si no lo dice, de la jurisdicción y del largo. */
export function analizarIdentificador(texto: string, tipoDeclarado = '', jurisdiccion = ''): Identificador | null {
  const t = String(texto || '').trim();
  if (!t) return null;
  const m = /(\d{1,3}(?:[.\s]?\d{3}){1,3})\s*(?:-\s*([\dkK]))?/.exec(t);
  if (!m) return null;
  const base = m[1].replace(/\D/g, '');
  const dv = m[2] ? m[2].toUpperCase() : null;
  const declarado = `${tipoDeclarado} ${t}`.toUpperCase();
  let tipo: TipoIdentificador = 'desconocido';
  if (/\bNIT\b/.test(declarado)) tipo = 'NIT';
  else if (/\bRUT\b|\bRUN\b/.test(declarado)) tipo = 'RUT';
  else if (jurisdiccion === 'CO') tipo = 'NIT';
  else if (jurisdiccion === 'CL') tipo = 'RUT';
  else if (base.length === 9 && /^[89]/.test(base)) tipo = 'NIT';
  else if (base.length >= 7 && base.length <= 8) tipo = 'RUT';

  let dvEsperado: string | null = null;
  let valido: boolean | null = null;
  if (tipo === 'RUT') {
    dvEsperado = dvRut(base);
    valido = dv === null ? null : dv === dvEsperado;
  } else if (tipo === 'NIT') {
    dvEsperado = String(dvNit(base));
    valido = dv === null ? null : dv === dvEsperado;
  }
  return {
    texto: t, tipo, base, dv, valido, dvEsperado,
    rangoPersonaNatural: tipo === 'RUT' && Number(base) < 50_000_000,
  };
}

// ── Anexo B · teléfonos ────────────────────────────────────────────────────

const CODIGOS_REGION_CL = ['32', '33', '34', '35', '41', '42', '43', '45', '51', '52', '53', '55', '57', '58', '61', '63', '64', '65', '67', '71', '72', '73', '75'];

export interface Telefono {
  texto: string;
  pais: 'CL' | 'CO' | null;
  tipo: 'movil' | 'fijo' | null;
  enPlan: boolean;
  placeholder: boolean;
  /** `(1) 234 5678`: fijo bogotano anterior a 2022, o contenido copiado. */
  formatoAntiguoBogota: boolean;
}

export function analizarTelefono(texto: string): Telefono {
  const t = String(texto || '').trim();
  const d = t.replace(/\D/g, '');
  const placeholder =
    /555[-\s.]?01\d\d\b/.test(t) ||
    /^1?234567890$/.test(d) ||
    d === '123456789' || d === '1234567' ||
    /^(\d)\1{6,}$/.test(d);
  const formatoAntiguoBogota = /\(\s*(?:\+?57\s*)?1\s*\)\s*\d{3}[\s.-]?\d{4}\b/.test(t) || /^(?:57)?1\d{7}$/.test(d);

  let nacional = d;
  let pais: 'CL' | 'CO' | null = null;
  if (d.startsWith('56') && d.length === 11) { pais = 'CL'; nacional = d.slice(2); }
  else if (d.startsWith('57') && d.length === 12) { pais = 'CO'; nacional = d.slice(2); }
  else if (d.length === 9 && /^[2-9]/.test(d)) pais = 'CL';
  else if (d.length === 10 && /^(3|60)/.test(d)) pais = 'CO';

  let tipo: 'movil' | 'fijo' | null = null;
  if (pais === 'CL' && nacional.length === 9) {
    if (nacional[0] === '9') tipo = 'movil';
    else if (/^2[2-9]/.test(nacional) || CODIGOS_REGION_CL.includes(nacional.slice(0, 2))) tipo = 'fijo';
  } else if (pais === 'CO' && nacional.length === 10) {
    if (nacional[0] === '3') tipo = 'movil';
    else if (/^60[1-8]/.test(nacional)) tipo = 'fijo';
  }
  return { texto: t, pais: tipo ? pais : null, tipo, enPlan: tipo !== null && !placeholder, placeholder, formatoAntiguoBogota };
}

// ── Anexo B · direcciones ──────────────────────────────────────────────────

/** `Calle / Carrera / Diagonal / Transversal NN # NN-NN`. */
const NOMENCLATURA_CO = /\b(calle|cl\.?|carrera|cra\.?|kr\.?|cr\.?|diagonal|dg\.?|transversal|tv\.?|avenida|av\.?|ak|ac)\s*\d+\s*[a-z]?\s*(bis)?\s*(#|no\.?|n[°º.])\s*\d+\s*[a-z]?\s*-\s*\d+/i;

const AGENTE_U_OFICINA_VIRTUAL = new RegExp([
  'registered agent', 'agente registrado', 'oficina virtual', 'virtual office', '\\bc/o\\b', 'p\\.?\\s?o\\.?\\s?box',
  '\\bpmb\\s*\\d', '1209 orange st', '251 little falls', '8 the green', '2810 n\\.? church', '30 n\\.? gould',
  '1621 central ave', '16192 coastal h',
].join('|'), 'i');

export interface Direccion { texto: string; nomenclaturaCO: boolean; agenteUOficinaVirtual: boolean }

/** La comuna chilena NO se valida contra el listado oficial: queda como
 *  verificación manual. Lo que sí se mira es la nomenclatura colombiana y el
 *  domicilio de agente registrado u oficina virtual. */
export function analizarDireccion(texto: string): Direccion {
  const t = String(texto || '');
  return { texto: t, nomenclaturaCO: NOMENCLATURA_CO.test(t), agenteUOficinaVirtual: AGENTE_U_OFICINA_VIRTUAL.test(t) };
}

// ── Anexo C · pasarelas ────────────────────────────────────────────────────

/** Sobre el HTML CRUDO. Las cortas (`PSE`, `ACH`) van en mayúsculas y con borde
 *  de palabra: en minúsculas aparecen dentro de cualquier palabra («collapse»,
 *  «each») y el sitio más pobre pasaría por tienda integrada. */
export const PASARELAS: { nombre: string; mercado: 'CL' | 'CO' | 'CL/CO' | 'global'; re: RegExp }[] = [
  { nombre: 'Transbank', mercado: 'CL', re: /transbank/i },
  { nombre: 'Webpay', mercado: 'CL', re: /webpay/i },
  { nombre: 'Flow', mercado: 'CL', re: /\bflow\.cl\b/i },
  { nombre: 'Khipu', mercado: 'CL', re: /khipu/i },
  { nombre: 'Getnet', mercado: 'CL', re: /getnet/i },
  { nombre: 'Kushki', mercado: 'CL', re: /kushki/i },
  { nombre: 'Mercado Pago', mercado: 'CL/CO', re: /mercadopago|mercado\s?pago/i },
  { nombre: 'PSE', mercado: 'CO', re: /\bPSE\b|pse\.com\.co/ },
  { nombre: 'ACH', mercado: 'CO', re: /\bACH\b|achcolombia/i },
  { nombre: 'Wompi', mercado: 'CO', re: /wompi/i },
  { nombre: 'PayU', mercado: 'CO', re: /\bpayu|payulatam/i },
  { nombre: 'ePayco', mercado: 'CO', re: /epayco/i },
  { nombre: 'Bold', mercado: 'CO', re: /\bbold\.co\b/i },
  { nombre: 'Bre-B', mercado: 'CO', re: /\bbre-?b\b/i },
  { nombre: 'Stripe', mercado: 'global', re: /stripe/i },
  { nombre: 'PayPal', mercado: 'global', re: /paypal/i },
  { nombre: 'dLocal', mercado: 'global', re: /dlocal/i },
];

export function pasarelasEn(html: string): string[] {
  const h = String(html || '');
  return PASARELAS.filter(p => p.re.test(h)).map(p => p.nombre);
}

// ── Anexo D · dominio ──────────────────────────────────────────────────────

const SUFIJOS_DOS_NIVELES = new Set([
  'com.co', 'net.co', 'org.co', 'edu.co', 'gov.co', 'mil.co', 'nom.co', 'com.ar', 'com.mx', 'gob.mx', 'com.br',
  'com.pe', 'org.pe', 'gob.pe', 'gob.cl', 'com.ec', 'com.uy', 'com.py', 'com.bo', 'com.ve', 'co.cr', 'com.pa',
  'com.gt', 'com.do', 'co.uk', 'org.uk', 'com.au', 'co.za', 'com.es', 'co.jp', 'com.cn',
]);

/** `www.pagos.acme.com.co` → `acme.com.co`. Sin la lista pública de sufijos: con
 *  los de la región alcanza para comparar dominios entre sí. */
export function dominioRegistrable(host: string): string {
  const partes = String(host || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (partes.length <= 2) return partes.join('.');
  const ultimas2 = partes.slice(-2).join('.');
  return SUFIJOS_DOS_NIVELES.has(ultimas2) ? partes.slice(-3).join('.') : ultimas2;
}

/** La etiqueta que eligió quien registró el dominio: `acme` en `acme.com.co`. */
export function etiquetaDominio(host: string): string {
  return dominioRegistrable(host).split('.')[0] || '';
}

export const TLD_BAJO_COSTO = ['top', 'icu', 'shop', 'online'];
export const SUFIJOS_SOSPECHOSOS = ['pagos', 'soporte', 'seguro', 'clientes', 'login'];

/** Marcas que se suplantan en la región, con sus dominios oficiales. Solo
 *  etiquetas DISTINTIVAS: una sigla de tres letras coincidiría con cualquier cosa. */
export const MARCAS: { marca: string; etiqueta: string; oficiales: string[] }[] = [
  { marca: 'Global66', etiqueta: 'global66', oficiales: ['global66.com'] },
  { marca: 'BancoEstado', etiqueta: 'bancoestado', oficiales: ['bancoestado.cl'] },
  { marca: 'Banco de Chile', etiqueta: 'bancochile', oficiales: ['bancochile.cl'] },
  { marca: 'Banco de Chile', etiqueta: 'bancodechile', oficiales: ['bancodechile.cl'] },
  { marca: 'Santander', etiqueta: 'santander', oficiales: ['santander.cl', 'santander.com', 'santander.com.co', 'bancosantander.es'] },
  { marca: 'Scotiabank', etiqueta: 'scotiabank', oficiales: ['scotiabank.cl', 'scotiabank.com', 'scotiabankchile.cl', 'scotiabankcolpatria.com'] },
  { marca: 'Itaú', etiqueta: 'itau', oficiales: ['itau.cl', 'itau.co', 'itau.com', 'itau.com.br'] },
  { marca: 'Banco Falabella', etiqueta: 'bancofalabella', oficiales: ['bancofalabella.cl', 'bancofalabella.com.co'] },
  { marca: 'Banco Ripley', etiqueta: 'bancoripley', oficiales: ['bancoripley.cl'] },
  { marca: 'Coopeuch', etiqueta: 'coopeuch', oficiales: ['coopeuch.cl'] },
  { marca: 'Tenpo', etiqueta: 'tenpo', oficiales: ['tenpo.cl'] },
  { marca: 'MACH', etiqueta: 'machbank', oficiales: ['machbank.cl'] },
  { marca: 'Mercado Pago', etiqueta: 'mercadopago', oficiales: ['mercadopago.cl', 'mercadopago.com', 'mercadopago.com.co', 'mercadopago.com.ar', 'mercadopago.com.mx', 'mercadopago.com.br'] },
  { marca: 'Transbank', etiqueta: 'transbank', oficiales: ['transbank.cl'] },
  { marca: 'Webpay', etiqueta: 'webpay', oficiales: ['webpay.cl'] },
  { marca: 'Bancolombia', etiqueta: 'bancolombia', oficiales: ['bancolombia.com', 'grupobancolombia.com'] },
  { marca: 'Davivienda', etiqueta: 'davivienda', oficiales: ['davivienda.com'] },
  { marca: 'DaviPlata', etiqueta: 'daviplata', oficiales: ['daviplata.com'] },
  { marca: 'Nequi', etiqueta: 'nequi', oficiales: ['nequi.com.co'] },
  { marca: 'Banco de Bogotá', etiqueta: 'bancodebogota', oficiales: ['bancodebogota.com'] },
  { marca: 'Banco de Occidente', etiqueta: 'bancodeoccidente', oficiales: ['bancodeoccidente.com.co'] },
  { marca: 'AV Villas', etiqueta: 'avvillas', oficiales: ['avvillas.com.co'] },
  { marca: 'BBVA', etiqueta: 'bbva', oficiales: ['bbva.cl', 'bbva.com', 'bbva.com.co', 'bbva.es'] },
  { marca: 'PayPal', etiqueta: 'paypal', oficiales: ['paypal.com'] },
  { marca: 'Binance', etiqueta: 'binance', oficiales: ['binance.com'] },
  { marca: 'Stripe', etiqueta: 'stripe', oficiales: ['stripe.com'] },
];

/** Homoglifos ASCII comunes: `g1obal66` se lee `global66`. */
export function sinHomoglifos(s: string): string {
  return s.toLowerCase().replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l')
    .replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
}

export function levenshtein(a: string, b: string): number {
  const v = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = v[0];
    v[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = v[j];
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = t;
    }
  }
  return v[b.length];
}

export interface Dominio {
  host: string;
  registrable: string;
  punycode: boolean;
  tldBajoCosto: boolean;
  sufijoSospechoso: string | null;
  /** La marca suplantada, si el dominio la imita. Es gatillo 3. */
  typosquatting: { marca: string; como: string } | null;
}

export function analizarDominio(host: string): Dominio {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const registrable = dominioRegistrable(h);
  const etiqueta = etiquetaDominio(h);
  const tld = registrable.split('.').slice(-1)[0] || '';
  const sufijo = SUFIJOS_SOSPECHOSOS.find(s => new RegExp(`(^|-)${s}($|-)`).test(etiqueta)) || null;

  let typosquatting: Dominio['typosquatting'] = null;
  // Un dominio oficial de CUALQUIER marca no imita a nadie: se mira antes que
  // nada, para que el resultado no dependa del orden de la lista.
  const esOficial = MARCAS.some(m => m.oficiales.includes(registrable));
  for (const m of esOficial ? [] : MARCAS) {
    if (typosquatting) break;
    const sinGuiones = etiqueta.replace(/-/g, '');
    const normal = sinHomoglifos(etiqueta);
    if (etiqueta === m.etiqueta) {
      typosquatting = { marca: m.marca, como: `misma marca con otro dominio (${registrable}; oficial: ${m.oficiales[0]})` };
    } else if (etiqueta.includes(m.etiqueta) && (etiqueta.includes('-') || SUFIJOS_SOSPECHOSOS.some(s => sinGuiones.includes(s)))) {
      typosquatting = { marca: m.marca, como: `marca con guion o sufijo agregado (${registrable})` };
    } else if (m.etiqueta.length >= 5 && normal === sinHomoglifos(m.etiqueta)) {
      typosquatting = { marca: m.marca, como: `homoglifos (${registrable} se lee ${m.etiqueta})` };
    } else if (m.etiqueta.length >= 6 && levenshtein(sinGuiones, m.etiqueta) === 1) {
      typosquatting = { marca: m.marca, como: `un carácter distinto de ${m.etiqueta} (${registrable})` };
    }
  }
  return {
    host: h, registrable,
    punycode: h.split('.').some(p => p.startsWith('xn--')),
    tldBajoCosto: TLD_BAJO_COSTO.includes(tld),
    sufijoSospechoso: sufijo,
    typosquatting,
  };
}

// ── Correos ────────────────────────────────────────────────────────────────

export const CORREO_GRATUITO = ['gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'protonmail.com', 'proton.me', 'aol.com', 'gmx.com', 'hotmail.es', 'outlook.es'];

export function correosVsSitio(correos: string[], hostSitio: string): { propios: string[]; gratuitos: string[]; otros: string[] } {
  const sitio = dominioRegistrable(hostSitio);
  const r = { propios: [] as string[], gratuitos: [] as string[], otros: [] as string[] };
  for (const c of correos) {
    const dom = String(c).toLowerCase().split('@')[1] || '';
    if (!dom) continue;
    if (dominioRegistrable(dom) === sitio) r.propios.push(c);
    else if (CORREO_GRATUITO.includes(dom)) r.gratuitos.push(c);
    else r.otros.push(c);
  }
  return r;
}

// ── Formularios ────────────────────────────────────────────────────────────

const PIDE_OTP = /\botp\b|clave din[aá]mica|c[oó]digo de (verificaci[oó]n|seguridad|acceso)|c[oó]digo sms|segundo factor|\b2fa\b|coordenadas|digipass|superclave|multipass|token de seguridad/i;
const PIDE_TARJETA = /\bcvv\b|\bcvc\b|cc-number|cc-csc|card.?number|n[uú]mero de (la )?tarjeta|fecha de (expiraci[oó]n|vencimiento)/i;
const PIDE_CLAVE = /contrase[ñn]a|password|passwd|\bclave\b|\bpin\b/i;

/** Servicios de formularios de terceros: que un formulario de contacto envíe ahí
 *  es lo normal y no se informa como «a otro dominio». */
const SERVICIOS_FORMULARIO = ['formspree.io', 'hsforms.com', 'hubspot.com', 'list-manage.com', 'google.com', 'jotform.com', 'typeform.com', 'wufoo.com', 'netlify.com', 'zoho.com', 'getform.io', 'formsubmit.co'];

export interface Formularios {
  /** Gatillo 5. */
  solicitaCredencialesUOtp: { pagina: string; motivo: string }[];
  /** Hay un ingreso con clave hacia el propio dominio: un portal de clientes. */
  loginPropio: boolean;
  pideTarjeta: boolean;
  aOtroDominio: string[];
}

const textoCampo = (c: Campo) => `${c.tipo} ${c.nombre} ${c.etiqueta}`;

/** Gatillo 5 = un formulario que pide clave dinámica u OTP, o que pide clave y la
 *  ENVÍA A OTRO DOMINIO. Un ingreso con clave hacia el propio dominio es el portal
 *  de clientes de una empresa cualquiera y se informa, no rechaza: el gatillo
 *  apunta a la captura de credenciales (§16), y sin esta distinción cualquier
 *  proveedor con «Iniciar sesión» saldría ONBOARDING_REJECTED. */
export function analizarFormularios(lista: Formulario[], hostSitio: string): Formularios {
  const sitio = dominioRegistrable(hostSitio);
  const r: Formularios = { solicitaCredencialesUOtp: [], loginPropio: false, pideTarjeta: false, aOtroDominio: [] };
  for (const f of lista) {
    let destino = '';
    try { destino = dominioRegistrable(new URL(f.action).hostname); } catch { destino = sitio; }
    const externo = !!destino && destino !== sitio;
    const otp = f.campos.find(c => PIDE_OTP.test(textoCampo(c)));
    const clave = f.campos.find(c => c.tipo === 'password' || PIDE_CLAVE.test(textoCampo(c)));
    if (f.campos.some(c => PIDE_TARJETA.test(textoCampo(c)))) r.pideTarjeta = true;
    if (otp) r.solicitaCredencialesUOtp.push({ pagina: f.pagina, motivo: `pide «${(otp.etiqueta || otp.nombre).slice(0, 60)}» (clave dinámica u OTP)` });
    else if (clave && externo) r.solicitaCredencialesUOtp.push({ pagina: f.pagina, motivo: `pide clave y la envía a ${destino}` });
    else if (clave) r.loginPropio = true;
    if (externo && !SERVICIOS_FORMULARIO.includes(destino) && !r.aOtroDominio.includes(destino)) r.aOtroDominio.push(destino);
  }
  return r;
}

// ── Señales de plantilla ───────────────────────────────────────────────────

const PLANTILLA: { re: RegExp; texto: string }[] = [
  { re: /lorem ipsum/i, texto: 'texto «lorem ipsum»' },
  { re: /\byour company\b|\bcompany name\b|nombre de (la|tu) empresa/i, texto: 'nombre de empresa de ejemplo' },
  { re: /@example\.(com|org)|\bexample\.(com|org)\b/i, texto: 'dominio de ejemplo (example.com)' },
  { re: /just another wordpress site|hello world!|sample page|p[aá]gina de ejemplo|¡hola,? mundo!/i, texto: 'contenido por defecto del gestor del sitio' },
  { re: /123 main st|calle falsa|tu direcci[oó]n aqu[ií]|your address here/i, texto: 'dirección de ejemplo' },
  { re: /texto de ejemplo|insert (your )?text|placeholder text|add your content/i, texto: 'texto de relleno' },
];

export function senalesPlantilla(texto: string, telefonos: string[]): string[] {
  const s = PLANTILLA.filter(p => p.re.test(texto)).map(p => p.texto);
  const falsos = telefonos.filter(t => analizarTelefono(t).placeholder);
  if (falsos.length) s.push(`teléfono de relleno (${falsos.slice(0, 2).join(', ')})`);
  return s;
}

// ── Pagos ──────────────────────────────────────────────────────────────────

const FORMA_SOCIETARIA = /\b(s\.?\s?p\.?\s?a\.?|spa|s\.?\s?a\.?|ltda\.?|limitada|e\.?i\.?r\.?l\.?|s\.?a\.?s\.?|sas|inc\.?|llc|corp\.?|ltd\.?|gmbh|s\.?\s?de\s?r\.?\s?l\.?|sociedad|compa[ñn][ií]a|cooperativa|fundaci[oó]n|corporaci[oó]n)\b/i;

export function normalizarNombre(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(FORMA_SOCIETARIA, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** ¿Dos nombres son la misma entidad? Por palabras de 3+ letras, sin la forma
 *  societaria: «ACME Pagos SpA» y «Acme Pagos Limitada» son la misma. */
export function mismoNombre(a: string, b: string): boolean {
  const pa = new Set(normalizarNombre(a).split(' ').filter(p => p.length >= 3));
  const pb = new Set(normalizarNombre(b).split(' ').filter(p => p.length >= 3));
  if (!pa.size || !pb.size) return false;
  const comunes = [...pa].filter(p => pb.has(p)).length;
  return comunes / Math.min(pa.size, pb.size) >= 0.5;
}

export interface Pagos {
  /** Gatillo 4: cuenta de persona natural (por RUT), cripto o tarjeta de regalo. */
  gatillo: string | null;
  /** Anexo C: titular distinto de la razón social → CRITICO. */
  titularDistinto: boolean;
  /** Titular con nombre de persona y sin identificador: no alcanza para el
   *  gatillo, pero es un hallazgo. */
  titularPareceNatural: boolean;
}

export function analizarPagos(e: Pick<Extraccion, 'titularCuentaPago' | 'identificadorTitularCuentaPago' | 'mediosPagoSolicitados' | 'razonSocial'>): Pagos {
  const medios = (e.mediosPagoSolicitados || []).map(m => String(m).toLowerCase());
  const titular = String(e.titularCuentaPago || '').trim();
  const idTitular = analizarIdentificador(e.identificadorTitularCuentaPago || '', '', 'CL');
  let gatillo: string | null = null;
  if (medios.some(m => m.includes('cripto'))) gatillo = 'solicita pago en criptoactivos';
  else if (medios.some(m => m.includes('regalo'))) gatillo = 'solicita pago con tarjetas de regalo';
  else if (titular && idTitular?.tipo === 'RUT' && idTitular.rangoPersonaNatural) gatillo = `cuenta de pago a nombre de persona natural (${titular}, RUT en rango de persona natural)`;
  const titularDistinto = !!titular && !!e.razonSocial && !mismoNombre(titular, e.razonSocial);
  const titularPareceNatural = !!titular && !FORMA_SOCIETARIA.test(titular) && !gatillo;
  return { gatillo, titularDistinto, titularPareceNatural };
}

// ── Credenciales regulatorias (§7) ─────────────────────────────────────────

const AUTODECLARADA = /\bmsb\b|fincen|c[aá]mara de comercio|constituida legalmente|legalmente constituida|registro mercantil|registered (company|business)|inscrita en/i;
const LICENCIA = /licencia|autorizad[ao] por|supervisad[ao] por|vigilad[ao] por|\bcmf\b|superfinanciera|\bsfc\b|banco central|registro de prestadores|ley fintec/i;

/** Registro ≠ licencia ≠ supervisión. Un registro autodeclarado exhibido como
 *  ÚNICA credencial donde se requiere licencia es MAYOR (§7). */
export function soloCredencialesAutodeclaradas(credenciales: string[]): boolean {
  const c = (credenciales || []).filter(Boolean);
  return c.length > 0 && c.every(x => AUTODECLARADA.test(x) && !LICENCIA.test(x));
}

export function declaraLicencia(credenciales: string[]): boolean {
  return (credenciales || []).some(x => LICENCIA.test(x));
}
