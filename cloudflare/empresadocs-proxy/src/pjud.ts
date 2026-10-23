// /pjud/* — lo que la ficha de la Bandeja necesita del scraper de PJUD.
//
// Contrato «Integración Scraper PJUD ↔ LENS» (Bautista, oct-2026), §4.2. El
// navegador nunca lee `scraper_casos`: pide `GET /pjud/caso/{caseId}` acá, y
// el Worker reenvía al Lambda `lens-pjud-lector` con un secreto de servidor, el
// mismo patrón que /colas/log.
//
// ── AUTENTICACIÓN, solo en esta ruta ───────────────────────────────────────
// Lo que devuelve son análisis penales de clientes, y los ids de caso son
// números correlativos: sin autenticación, cualquiera los recorre. Se exige el
// ID token de Firebase de Lens y se verifica entero:
//   · firma RS256 contra las llaves públicas de securetoken@system.gserviceaccount.com;
//   · `aud` = el proyecto, `iss` = securetoken.google.com/<proyecto>, `exp`, `iat`;
//   · `email_verified` y dominio @global66.com.
// El dominio NO es opcional: el alta de Firebase Auth del proyecto está abierta
// con Google como proveedor, así que CUALQUIER cuenta de Google obtiene un ID
// token válido. Un token válido no alcanza. El Origin no cuenta como
// autenticación: lo pone el que hace el pedido.

export interface EnvPjud {
  PJUD_LECTOR_URL?: string;
  PJUD_LECTOR_SECRET?: string;
  FIREBASE_PROJECT_ID?: string;
}

const PROYECTO_DEFAULT = 'lens-ai-9da63';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DOMINIO = '@global66.com';
const TOLERANCIA_S = 300;   // diferencia de reloj aceptada en iat / auth_time

// Las llaves públicas rotan; se guardan mientras Google diga (Cache-Control).
let jwks: { llaves: Record<string, JsonWebKey>; vence: number } | null = null;

/** Solo para los tests. */
export function _reiniciarJwks(): void { jwks = null; }

async function llaves(): Promise<Record<string, JsonWebKey>> {
  if (jwks && Date.now() < jwks.vence) return jwks.llaves;
  const r = await fetch(JWK_URL);
  if (!r.ok) throw new Error(`JWK HTTP ${r.status}`);
  const cuerpo = await r.json() as { keys?: Array<JsonWebKey & { kid?: string }> };
  const max = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] ?? 3600);
  const mapa: Record<string, JsonWebKey> = {};
  for (const k of cuerpo.keys ?? []) if (k.kid) mapa[k.kid] = k;
  jwks = { llaves: mapa, vence: Date.now() + Math.min(max, 6 * 3600) * 1000 };
  return mapa;
}

const b64url = (s: string): Uint8Array => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
};
const json = (s: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(b64url(s)));

export type Verificacion = { ok: true; email: string; uid: string; nombre: string } | { ok: false; motivo: string };

/** Verifica un ID token de Firebase de Lens. No lanza: devuelve el motivo. */
export async function verificarIdToken(token: string, proyecto = PROYECTO_DEFAULT): Promise<Verificacion> {
  const partes = (token || '').split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'token mal formado' };
  let cab: Record<string, unknown>, pl: Record<string, unknown>;
  try { cab = json(partes[0]); pl = json(partes[1]); } catch { return { ok: false, motivo: 'token mal formado' }; }
  if (cab.alg !== 'RS256' || typeof cab.kid !== 'string') return { ok: false, motivo: 'algoritmo no admitido' };

  let jwk: JsonWebKey | undefined;
  try { jwk = (await llaves())[cab.kid]; } catch { return { ok: false, motivo: 'no se pudieron obtener las llaves' }; }
  if (!jwk) {
    // Puede ser una llave recién rotada: se refresca una vez.
    jwks = null;
    try { jwk = (await llaves())[cab.kid]; } catch { /* sigue sin llave */ }
    if (!jwk) return { ok: false, motivo: 'llave desconocida' };
  }
  try {
    const clave = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const firmaOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, b64url(partes[2]),
      new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
    if (!firmaOk) return { ok: false, motivo: 'firma inválida' };
  } catch { return { ok: false, motivo: 'firma inválida' }; }

  const ahora = Math.floor(Date.now() / 1000);
  if (pl.aud !== proyecto) return { ok: false, motivo: 'audiencia inválida' };
  if (pl.iss !== `https://securetoken.google.com/${proyecto}`) return { ok: false, motivo: 'emisor inválido' };
  if (typeof pl.exp !== 'number' || pl.exp <= ahora) return { ok: false, motivo: 'token vencido' };
  if (typeof pl.iat !== 'number' || pl.iat > ahora + TOLERANCIA_S) return { ok: false, motivo: 'token del futuro' };
  if (typeof pl.auth_time === 'number' && pl.auth_time > ahora + TOLERANCIA_S) return { ok: false, motivo: 'token del futuro' };
  if (typeof pl.sub !== 'string' || !pl.sub || pl.sub.length > 128) return { ok: false, motivo: 'sujeto inválido' };
  const email = typeof pl.email === 'string' ? pl.email.toLowerCase() : '';
  if (pl.email_verified !== true) return { ok: false, motivo: 'email sin verificar' };
  if (!email.endsWith(DOMINIO)) return { ok: false, motivo: 'dominio no autorizado' };
  return { ok: true, email, uid: String(pl.sub), nombre: typeof pl.name === 'string' ? pl.name.slice(0, 256) : '' };
}

const responder = (cuerpo: unknown, status: number, cors: Record<string, string>): Response =>
  new Response(JSON.stringify(cuerpo), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** `GET /pjud/caso/{caseId}`. Devuelve null si la ruta no es de /pjud/. */
export async function manejarPjud(
  request: Request, url: URL, env: EnvPjud, cors: Record<string, string>,
  fetchTimeout: (u: string, i: RequestInit, ms: number) => Promise<Response>,
): Promise<Response | null> {
  if (!url.pathname.startsWith('/pjud/')) return null;
  const m = url.pathname.match(/^\/pjud\/caso\/(\d{6,12})$/);
  if (!m) return responder({ error: 'Ruta no encontrada' }, 404, cors);
  if (request.method !== 'GET') return responder({ error: 'Método no permitido' }, 405, cors);

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return responder({ error: 'no autorizado', motivo: 'falta el token' }, 401, cors);
  const v = await verificarIdToken(token, env.FIREBASE_PROJECT_ID || PROYECTO_DEFAULT);
  if (!v.ok) return responder({ error: 'no autorizado', motivo: v.motivo }, 401, cors);

  const destino = (env.PJUD_LECTOR_URL || '').replace(/\/$/, '');
  const secreto = env.PJUD_LECTOR_SECRET || '';
  if (!destino || !secreto) return responder({ error: 'PJUD no está configurado en el Worker' }, 503, cors);
  try {
    const r = await fetchTimeout(destino, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pjud-lector': secreto },
      body: JSON.stringify({ caseId: m[1] }),
    }, 10000);
    const texto = await r.text();
    // Un 401 del lector es una configuración rota del Worker, no del analista.
    if (r.status === 401) return responder({ error: 'el lector rechazó al Worker' }, 502, cors);
    return new Response(texto || '{}', {
      status: r.status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return responder({ error: 'no se pudo leer el análisis' }, 502, cors);
  }
}
