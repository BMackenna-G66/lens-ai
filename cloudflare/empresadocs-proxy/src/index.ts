/**
 * EmpresaDocs S3 relay — Cloudflare Worker
 *
 * El navegador ya obtiene la URL firmada (presigned) de S3 por su cuenta
 * (la API de Global66 sí permite CORS). Lo único que S3 bloquea es la
 * descarga directa desde el navegador. Este Worker actúa como relay:
 * recibe la URL firmada, la descarga del lado servidor (sin CORS) y
 * devuelve los bytes con cabeceras CORS permitidas.
 *
 * NO maneja credenciales de Global66 — solo reenvía URLs ya firmadas.
 *
 * Endpoint:  GET /relay?url=<presigned S3 url encoded>
 */

// Orígenes autorizados a usar el relay (evita que terceros lo abusen).
const ALLOWED_ORIGINS = [
  'https://bmackenna-g66.github.io', // GitHub Pages (producción)
  'http://localhost:5173',           // Vite dev
  'http://localhost:3000',
];

// El relay SOLO reenvía a hosts de S3 (evita SSRF a URLs arbitrarias).
const ALLOWED_HOST_SUFFIXES = ['.amazonaws.com'];

function corsHeaders(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function jsonError(msg: string, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'GET') {
      return jsonError('Método no permitido', 405, cors);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/relay') {
      return jsonError('No encontrado', 404, cors);
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return jsonError('Falta el parámetro "url"', 400, cors);
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return jsonError('URL inválida', 400, cors);
    }

    // Validación anti-SSRF: solo https hacia S3.
    const hostOk = ALLOWED_HOST_SUFFIXES.some(s => parsed.hostname.endsWith(s));
    if (parsed.protocol !== 'https:' || !hostOk) {
      return jsonError('Host no permitido (solo S3)', 403, cors);
    }

    // Descarga server-side (sin restricción CORS) y reenvía los bytes.
    let upstream: Response;
    try {
      upstream = await fetch(parsed.toString());
    } catch {
      return jsonError('Error descargando desde S3', 502, cors);
    }

    if (!upstream.ok) {
      return jsonError(`S3 respondió ${upstream.status}`, upstream.status, cors);
    }

    const headers = new Headers(cors);
    headers.set(
      'Content-Type',
      upstream.headers.get('Content-Type') || 'application/octet-stream'
    );
    const len = upstream.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);
    headers.set('Cache-Control', 'no-store');

    return new Response(upstream.body, { status: 200, headers });
  },
};
