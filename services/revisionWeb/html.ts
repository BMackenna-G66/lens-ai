// REVISIÓN WEB — lectura del HTML CRUDO, con funciones puras.
//
// Sin DOMParser a propósito: corre igual en el navegador y en Node, que es donde
// se testea. El HTML es el que devolvió el Worker, sin ejecutar scripts — por
// eso un sitio armado con JavaScript (un SPA vacío) se declara «no evaluable» y
// no «limpio» (§15.2).

import type { Campo, Formulario, Slot } from './tipos';

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  Ntilde: 'Ñ', uuml: 'ü', copy: '©', reg: '®', ordm: 'º', ordf: 'ª', deg: '°', middot: '·', ndash: '–', mdash: '—',
};

export function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

/** El texto visible, con saltos de línea donde había bloques. */
export function htmlATexto(html: string): string {
  return decodificar(
    String(html || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/footer|\/header)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function atributo(etiqueta: string, nombre: string): string {
  const m = new RegExp(`\\b${nombre}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(etiqueta);
  return decodificar(m ? (m[2] ?? m[3] ?? m[4] ?? '') : '').trim();
}

function absoluta(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return ''; }
}

export interface Enlace { href: string; texto: string }

export function enlaces(html: string, base: string): Enlace[] {
  const salida: Enlace[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html || ''))) && salida.length < 2_000) {
    const crudo = atributo(m[1], 'href');
    if (!crudo) continue;
    const href = /^(mailto|tel):/i.test(crudo) ? crudo : absoluta(crudo, base);
    if (href) salida.push({ href, texto: htmlATexto(m[2]).slice(0, 200) });
  }
  return salida;
}

/** Correos y teléfonos que el sitio publica como enlace (`mailto:` / `tel:`).
 *  Son los más confiables: alguien los escribió a propósito. */
export function contactosDeEnlaces(lista: Enlace[]): { correos: string[]; telefonos: string[] } {
  const correos = new Set<string>();
  const telefonos = new Set<string>();
  for (const e of lista) {
    if (/^mailto:/i.test(e.href)) {
      const c = decodeURIComponent(e.href.slice(7).split('?')[0]).trim().toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) correos.add(c);
    } else if (/^tel:/i.test(e.href)) {
      const t = decodeURIComponent(e.href.slice(4)).trim();
      if (t.replace(/\D/g, '').length >= 6) telefonos.add(t);
    }
  }
  return { correos: [...correos], telefonos: [...telefonos] };
}

/** Los formularios del HTML crudo: a dónde envían y qué campos piden. */
export function formularios(html: string, base: string, pagina: Slot): Formulario[] {
  const salida: Formulario[] = [];
  const h = String(html || '');
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h)) && salida.length < 50) {
    const crudoAction = atributo(m[1], 'action');
    const campos: Campo[] = [];
    const reCampo = /<(input|select|textarea)\b([^>]*)>/gi;
    let c: RegExpExecArray | null;
    while ((c = reCampo.exec(m[2])) && campos.length < 100) {
      const tipo = (c[1].toLowerCase() === 'input' ? atributo(c[2], 'type') || 'text' : c[1]).toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(tipo)) continue;
      const id = atributo(c[2], 'id');
      const etiquetaFor = id ? new RegExp(`<label\\b[^>]*for=["']?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?[^>]*>([\\s\\S]*?)<\\/label>`, 'i').exec(m[2]) : null;
      campos.push({
        tipo,
        nombre: [atributo(c[2], 'name'), id, atributo(c[2], 'autocomplete')].filter(Boolean).join(' '),
        etiqueta: [atributo(c[2], 'placeholder'), atributo(c[2], 'aria-label'), etiquetaFor ? htmlATexto(etiquetaFor[1]) : ''].filter(Boolean).join(' ').slice(0, 200),
      });
    }
    salida.push({
      action: crudoAction ? absoluta(crudoAction, base) : base,
      method: (atributo(m[1], 'method') || 'get').toLowerCase(),
      campos,
      pagina,
    });
  }
  return salida;
}

/** Un sitio armado del lado del cliente: el HTML crudo casi no tiene texto y sí
 *  un contenedor de aplicación. Sobre eso, «no encontré X» no significa nada. */
export function esCascaronJs(html: string): boolean {
  const h = String(html || '');
  const texto = htmlATexto(h);
  const contenedor = /<div\b[^>]*\bid=["']?(root|app|__next|__nuxt|___gatsby)["'\s>]/i.test(h);
  const scripts = (h.match(/<script\b/gi) || []).length;
  return texto.length < 300 && (contenedor || scripts >= 3);
}

/** Palabras que identifican cada página, para encontrarla en los enlaces del
 *  inicio cuando no está en la ruta de §5. */
export const CLAVES_SLOT: Record<Exclude<Slot, 'inicio'>, RegExp> = {
  terminos: /t[eé]rminos|condiciones|terms|legal/i,
  privacidad: /privacidad|privacy|datos personales|tratamiento de datos|habeas data/i,
  nosotros: /nosotros|qui[eé]nes somos|about|contacto|contact|empresa/i,
};

/** El enlace del MISMO sitio que mejor parece la página de ese lugar. */
export function enlaceParaSlot(lista: Enlace[], slot: Exclude<Slot, 'inicio'>, hostSitio: string, excluir: string[] = []): string | null {
  const clave = CLAVES_SLOT[slot];
  for (const e of lista) {
    if (!/^https?:/i.test(e.href)) continue;
    let host = '';
    try { host = new URL(e.href).hostname.replace(/^www\./, ''); } catch { continue; }
    if (host !== hostSitio.replace(/^www\./, '')) continue;
    const sinAncla = e.href.split('#')[0];
    if (excluir.includes(sinAncla)) continue;
    if (clave.test(e.texto) || clave.test(decodeURIComponent(new URL(e.href).pathname))) return sinAncla;
  }
  return null;
}
