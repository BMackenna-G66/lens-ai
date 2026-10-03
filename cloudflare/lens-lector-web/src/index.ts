// lens-lector-web — lee páginas PÚBLICAS para la Revisión web del Analizador.
//
// ── Por qué es un Worker aparte ───────────────────────────────────────────
// La revisión web lee sitios de terceros elegidos por el analista. Hacerlo desde
// `empresadocs-proxy` expondría lo que ese Worker tiene: los secretos de Admin,
// Salesforce y Regcheq y la descarga de S3. Este no tiene NADA: ni secretos, ni
// variables, ni bindings, ni acceso a AWS. Si alguien lo abusa, lo único que
// consigue es leer una página pública que ya podía leer solo.
//
// ── Qué hace ──────────────────────────────────────────────────────────────
//   POST /leer   { "urls": ["https://…", …] }   (hasta MAX_URLS)
//   GET  /salud
//
// Cada URL se lee con GET, siguiendo las redirecciones A MANO —para validar cada
// salto con las mismas reglas que la URL original— y devuelve el HTML crudo, el
// status, la URL final y la cadena de redirecciones. Nunca se reenvían headers
// ni cookies del cliente: la petición sale con los headers de este Worker y nada
// más.
//
// ── Lo que NO se lee ──────────────────────────────────────────────────────
// Solo http y https, solo los puertos 80 y 443, nada de IPs literales, de
// localhost ni de nombres internos, nada con usuario y clave en la URL. Un salto
// de redirección que cae en algo de eso corta la lectura de esa URL.

export interface Env {}

/** Los orígenes que pueden llamar. Lens en GitHub Pages, y Vite en local. */
export const ORIGENES = [
  'https://bmackenna-g66.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
];

export const MAX_URLS = 8;
export const TIMEOUT_MS = 8_000;            // por URL, redirecciones incluidas
export const MAX_BYTES = 1_500_000;         // del cuerpo; lo que pase se corta
export const MAX_REDIRECCIONES = 5;
export const MAX_LARGO_URL = 2_048;

/** Peticiones por minuto por IP. Es por instancia: frena el abuso casual, no un
 *  ataque distribuido — para eso no hay nada que proteger acá adentro. */
export const TASA_POR_MINUTO = 30;

/** Los tipos de contenido cuyo cuerpo se devuelve. Lo demás —PDF, imágenes,
 *  binarios— se informa con su status y su tipo, sin cuerpo. */
const TIPOS_TEXTO = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

/** Nombres que no son de internet. */
const SUFIJOS_INTERNOS = [
  '.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp',
  '.test', '.invalid', '.example', '.onion', '.arpa', '.home.arpa',
];

const UA = 'Mozilla/5.0 (compatible; LensRevisionWeb/1.0; revision de contrapartes de Global66)';

/** Los headers de la respuesta que sirven de evidencia (§16: preservar headers).
 *  No se devuelve `set-cookie`. */
const HEADERS_EVIDENCIA = ['server', 'content-type', 'strict-transport-security', 'x-powered-by', 'last-modified'];

// ── Validación de una URL ──────────────────────────────────────────────────

export type Validacion = { ok: true; url: URL } | { ok: false; motivo: string };

export function validarUrl(cruda: string): Validacion {
  const texto = String(cruda ?? '').trim();
  if (!texto) return { ok: false, motivo: 'URL vacía' };
  if (texto.length > MAX_LARGO_URL) return { ok: false, motivo: 'URL demasiado larga' };
  let u: URL;
  try { u = new URL(texto); } catch { return { ok: false, motivo: 'no es una URL' }; }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, motivo: `protocolo no permitido: ${u.protocol}` };
  if (u.username || u.password) return { ok: false, motivo: 'la URL trae usuario o clave' };
  // `URL` deja el puerto vacío cuando es el de por defecto del protocolo.
  if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, motivo: `puerto no permitido: ${u.port}` };

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, motivo: 'sin nombre de host' };
  // IPv6 literal: `URL` lo deja entre corchetes.
  if (host.startsWith('[') || host.includes(':')) return { ok: false, motivo: 'IP literal no permitida' };
  // IPv4 literal. `URL` ya normaliza las formas raras (`2130706433`, `0x7f.1`) a
  // la notación con puntos, así que con esto alcanza.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, motivo: 'IP literal no permitida' };
  if (host === 'localhost') return { ok: false, motivo: 'localhost no permitido' };
  if (!host.includes('.')) return { ok: false, motivo: 'nombre interno no permitido' };
  if (SUFIJOS_INTERNOS.some(s => host.endsWith(s))) return { ok: false, motivo: 'nombre interno no permitido' };

  return { ok: true, url: u };
}

// ── Lectura de una URL ─────────────────────────────────────────────────────

export interface Salto { url: string; status: number; destino: string }

export interface Lectura {
  pedida: string;
  ok: boolean;                 // hubo respuesta final (cualquier status)
  status: number | null;
  urlFinal: string | null;
  redirecciones: Salto[];
  contentType: string | null;
  headers: Record<string, string>;
  html: string | null;         // solo para tipos de texto
  bytes: number;
  truncado: boolean;
  ms: number;
  error: string | null;
}

async function leerCuerpo(res: Response, tope: number): Promise<{ texto: string; bytes: number; truncado: boolean }> {
  if (!res.body) return { texto: '', bytes: 0, truncado: false };
  const lector = res.body.getReader();
  const partes: Uint8Array[] = [];
  let bytes = 0;
  let truncado = false;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (bytes + value.byteLength > tope) {
      partes.push(value.slice(0, tope - bytes));
      bytes = tope;
      truncado = true;
      await lector.cancel().catch(() => {});
      break;
    }
    partes.push(value);
    bytes += value.byteLength;
  }
  const todo = new Uint8Array(bytes);
  let o = 0;
  for (const p of partes) { todo.set(p, o); o += p.byteLength; }
  const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1] || 'utf-8';
  let texto: string;
  try { texto = new TextDecoder(charset, { fatal: false }).decode(todo); }
  catch { texto = new TextDecoder('utf-8', { fatal: false }).decode(todo); }
  return { texto, bytes, truncado };
}

export async function leerUna(cruda: string, f: typeof fetch = fetch): Promise<Lectura> {
  const t0 = Date.now();
  const r: Lectura = {
    pedida: String(cruda ?? ''), ok: false, status: null, urlFinal: null, redirecciones: [],
    contentType: null, headers: {}, html: null, bytes: 0, truncado: false, ms: 0, error: null,
  };
  const v = validarUrl(cruda);
  if (!v.ok) { r.error = v.motivo; r.ms = Date.now() - t0; return r; }

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
  try {
    let actual = v.url;
    for (let salto = 0; ; salto++) {
      const res = await f(actual.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: corte.signal,
        // Headers PROPIOS. Ni cookies ni nada del cliente.
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'es-CL,es;q=0.9,en;q=0.5' },
      });

      const destino = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && destino) {
        await res.body?.cancel().catch(() => {});
        let siguiente: URL;
        try { siguiente = new URL(destino, actual); } catch { r.error = 'redirección a una URL inválida'; break; }
        r.redirecciones.push({ url: actual.toString(), status: res.status, destino: siguiente.toString() });
        if (salto + 1 > MAX_REDIRECCIONES) { r.error = `más de ${MAX_REDIRECCIONES} redirecciones`; break; }
        const vs = validarUrl(siguiente.toString());
        if (!vs.ok) { r.error = `redirección bloqueada: ${vs.motivo}`; break; }
        actual = vs.url;
        continue;
      }

      r.ok = true;
      r.status = res.status;
      r.urlFinal = actual.toString();
      r.contentType = res.headers.get('content-type');
      for (const h of HEADERS_EVIDENCIA) {
        const val = res.headers.get(h);
        if (val) r.headers[h] = val;
      }
      if (TIPOS_TEXTO.test(r.contentType || 'text/html')) {
        const c = await leerCuerpo(res, MAX_BYTES);
        r.html = c.texto; r.bytes = c.bytes; r.truncado = c.truncado;
      } else {
        await res.body?.cancel().catch(() => {});
      }
      break;
    }
  } catch (e) {
    const err = e as Error;
    r.error = err?.name === 'AbortError' ? `sin respuesta en ${TIMEOUT_MS / 1000} s` : `no se pudo leer: ${err?.message || err}`;
  } finally {
    clearTimeout(reloj);
  }
  r.ms = Date.now() - t0;
  return r;
}

// ── Tasa ───────────────────────────────────────────────────────────────────

const tasa = new Map<string, { inicio: number; n: number }>();

export function dentroDeLaTasa(ip: string, ahora = Date.now()): boolean {
  const e = tasa.get(ip);
  if (!e || ahora - e.inicio >= 60_000) {
    tasa.set(ip, { inicio: ahora, n: 1 });
    if (tasa.size > 5_000) tasa.clear();   // que el mapa no crezca sin fin
    return true;
  }
  e.n += 1;
  return e.n <= TASA_POR_MINUTO;
}

export function _reiniciarTasa(): void { tasa.clear(); }

// ── HTTP ───────────────────────────────────────────────────────────────────

function cors(origen: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

function json(cuerpo: unknown, status: number, origen: string | null): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origen ? cors(origen) : {}) },
  });
}

export default {
  async fetch(req: Request, _env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origen = req.headers.get('Origin');
    const permitido = origen && ORIGENES.includes(origen) ? origen : null;

    if (url.pathname === '/salud' && req.method === 'GET') {
      return json({ ok: true, servicio: 'lens-lector-web' }, 200, permitido);
    }

    // Solo el origen de Lens. Un cliente que no es un navegador puede mentir el
    // Origin, pero entonces le queda la tasa, y lo único que obtiene es una
    // página pública.
    if (!permitido) return json({ error: 'origen no permitido' }, 403, null);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(permitido) });

    if (url.pathname !== '/leer') return json({ error: 'ruta no encontrada' }, 404, permitido);
    if (req.method !== 'POST') return json({ error: 'usá POST' }, 405, permitido);

    const ip = req.headers.get('CF-Connecting-IP') || 'desconocida';
    if (!dentroDeLaTasa(ip)) return json({ error: `más de ${TASA_POR_MINUTO} pedidos por minuto` }, 429, permitido);

    let cuerpo: { urls?: unknown };
    try { cuerpo = await req.json(); } catch { return json({ error: 'el cuerpo no es JSON' }, 400, permitido); }
    const urls = Array.isArray(cuerpo?.urls) ? cuerpo.urls.map(String) : null;
    if (!urls || urls.length === 0) return json({ error: '`urls` tiene que ser una lista con al menos una URL' }, 400, permitido);
    if (urls.length > MAX_URLS) return json({ error: `máximo ${MAX_URLS} URLs por pedido` }, 400, permitido);

    const lecturas = await Promise.all(urls.map(u => leerUna(u)));
    return json({ lecturas, leidoEn: new Date().toISOString() }, 200, permitido);
  },
};
