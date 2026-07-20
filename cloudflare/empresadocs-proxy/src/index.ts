/**
 * Cloudflare Worker — relays para Lens AI.
 *
 * 1) EmpresaDocs S3:  GET /relay?url=<presigned S3 url>
 *    Descarga el archivo de S3 server-side y lo devuelve con CORS.
 *
 * 2) Inspektor (Colombia):  ANY /inspektor/<path>
 *    Reenvía la petición a https://inspektor.datalaft.com:2121/api/<path>
 *    desde los servidores de Cloudflare (evita CORS y problemas de ruta de red
 *    del navegador). Reenvía body + Authorization tal cual.
 *
 * 3) Regcheq situación tributaria (SII):  POST /regcheq/sii  body {fichaId, rut}
 *    Dispara el mismo endpoint que el botón "situación tributaria" de la plataforma
 *    (API interna api.regcheq.com), usando un TOKEN DE SESIÓN guardado como secret
 *    (REGCHEQ_SESSION_TOKEN). El token se obtiene logueándose en la plataforma
 *    (dura ~24h) y hay que refrescarlo periódicamente. La external-api NO expone
 *    este disparo; por eso se usa la interna con el token de sesión.
 */

interface Env {
  REGCHEQ_SESSION_TOKEN?: string;
}

const ALLOWED_ORIGINS = [
  'https://bmackenna-g66.github.io', // GitHub Pages (producción)
  'http://localhost:5173',           // Vite dev
  'http://localhost:3000',
];

const ALLOWED_HOST_SUFFIXES = ['.amazonaws.com']; // anti-SSRF para /relay
const INSPEKTOR_BASE = 'https://inspektor.datalaft.com:2121/api';
const REGCHEQ_INTERNAL_BASE = 'https://api.regcheq.com';

// Decodifica el payload de un JWT (base64url) sin validar la firma — solo para
// leer companyId y exp del token de sesión.
function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((part.length + 3) % 4);
  try { return JSON.parse(atob(b64)); } catch { return {}; }
}

function corsHeaders(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function jsonError(msg: string, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);

    // ── Regcheq situación tributaria: POST /regcheq/sii  body {fichaId, rut} ─────
    if (url.pathname === '/regcheq/sii') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const token = env.REGCHEQ_SESSION_TOKEN;
      if (!token) return jsonError('Falta el secret REGCHEQ_SESSION_TOKEN en el Worker', 500, cors);

      // Token vencido → avisar claramente para que se refresque.
      const payload = decodeJwt(token);
      const exp = Number(payload['exp'] ?? 0);
      const now = Math.floor(Date.now() / 1000);
      if (exp && exp < now) return jsonError('REGCHEQ_SESSION_TOKEN expirado — refrescarlo', 401, cors);
      const companyId = String(payload['companyId'] ?? '');

      let body: { fichaId?: string; rut?: string };
      try { body = await request.json(); } catch { return jsonError('Body JSON inválido', 400, cors); }
      const fichaId = (body.fichaId || '').trim();
      const rut = (body.rut || '').replace(/[.\s-]/g, '').toUpperCase();
      if (!fichaId || !rut || !companyId) return jsonError('Faltan fichaId, rut o companyId', 400, cors);

      const target = `${REGCHEQ_INTERNAL_BASE}/fichas-clientes/${encodeURIComponent(fichaId)}/situacion-tributaria`
        + `?companyId=${encodeURIComponent(companyId)}&rut=${encodeURIComponent(rut)}`;
      let upstream: Response;
      try {
        upstream = await fetchTimeout(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        }, 30000);
      } catch (e) {
        return jsonError(`No se pudo disparar situación tributaria: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
      const text = await upstream.text();
      const headers = new Headers(cors);
      headers.set('Content-Type', 'application/json');
      headers.set('Cache-Control', 'no-store');
      return new Response(text, { status: upstream.status, headers });
    }

    // ── Relay Inspektor: /inspektor/<path> → INSPEKTOR_BASE/<path> ──────────────
    if (url.pathname.startsWith('/inspektor/')) {
      const path = url.pathname.slice('/inspektor'.length); // ej: /Auth/login
      const target = INSPEKTOR_BASE + path + url.search;
      const fwHeaders: Record<string, string> = {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      };
      const auth = request.headers.get('Authorization');
      if (auth) fwHeaders['Authorization'] = auth;

      let upstream: Response;
      try {
        upstream = await fetchTimeout(target, {
          method: request.method,
          headers: fwHeaders,
          body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : await request.text(),
        }, 30000);
      } catch (e) {
        return jsonError(`No se pudo conectar con Inspektor desde el proxy: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }

      const bodyText = await upstream.text();
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      return new Response(bodyText, { status: upstream.status, headers });
    }

    // ── Relay EmpresaDocs S3: GET /relay?url=… ─────────────────────────────────
    if (url.pathname === '/relay') {
      if (request.method !== 'GET') return jsonError('Método no permitido', 405, cors);
      const target = url.searchParams.get('url');
      if (!target) return jsonError('Falta el parámetro "url"', 400, cors);
      let parsed: URL;
      try { parsed = new URL(target); } catch { return jsonError('URL inválida', 400, cors); }
      const hostOk = ALLOWED_HOST_SUFFIXES.some(s => parsed.hostname.endsWith(s));
      if (parsed.protocol !== 'https:' || !hostOk) return jsonError('Host no permitido (solo S3)', 403, cors);
      let upstream: Response;
      try { upstream = await fetch(parsed.toString()); }
      catch { return jsonError('Error descargando desde S3', 502, cors); }
      if (!upstream.ok) return jsonError(`S3 respondió ${upstream.status}`, upstream.status, cors);
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
      const len = upstream.headers.get('Content-Length');
      if (len) headers.set('Content-Length', len);
      headers.set('Cache-Control', 'no-store');
      return new Response(upstream.body, { status: 200, headers });
    }

    return jsonError('No encontrado', 404, cors);
  },
};
