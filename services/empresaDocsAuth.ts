// EmpresaDocs auth — browser equivalent of the Python auth module.
// Refresh Token (SSO priority) → ID Token via POST /admin/refresh-token.
// ID Token is cached in memory; Refresh Tokens are persisted in localStorage.

const BASE_URL = 'https://api.global66.com';

const LS_SSO   = 'empresadocs_sso_refresh_token';
const LS_BASIC = 'empresadocs_basic_refresh_token';

let cachedIdToken: string | null = null;

// ─── Token storage ────────────────────────────────────────────────────────────

export function setSsoRefreshToken(token: string): void {
  localStorage.setItem(LS_SSO, token.trim());
  cachedIdToken = null; // force re-fetch on next call
}

export function setBasicRefreshToken(token: string): void {
  localStorage.setItem(LS_BASIC, token.trim());
  cachedIdToken = null;
}

export function clearTokens(): void {
  localStorage.removeItem(LS_SSO);
  localStorage.removeItem(LS_BASIC);
  cachedIdToken = null;
}

export function getTokenStatus(): { sso: boolean; basic: boolean } {
  return {
    sso:   !!localStorage.getItem(LS_SSO),
    basic: !!localStorage.getItem(LS_BASIC),
  };
}

export function hasAnyToken(): boolean {
  return !!(localStorage.getItem(LS_SSO) || localStorage.getItem(LS_BASIC));
}

// ─── ID Token acquisition ─────────────────────────────────────────────────────

// SSO token has priority over basic, matching Python logic.
export async function getIdToken(forceRefresh = false): Promise<string> {
  if (cachedIdToken && !forceRefresh) return cachedIdToken;

  const refreshToken = localStorage.getItem(LS_SSO) || localStorage.getItem(LS_BASIC);
  if (!refreshToken) {
    throw new Error('No hay Refresh Token configurado. Pega el SSO Token en la sección EmpresaDocs.');
  }

  const res = await fetch(`${BASE_URL}/admin/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Error obteniendo ID Token (${res.status}). Verifica que el Refresh Token sea válido.`);
  }

  const data = await res.json();
  const token: string | undefined = data.idToken ?? data.id_token ?? data.token;
  if (!token) throw new Error('Respuesta inválida del servidor de autenticación.');

  cachedIdToken = token;
  return token;
}

// ─── Authenticated GET ────────────────────────────────────────────────────────

// Mirrors Python api_get(): auto-retries once on 403 with a fresh token.
export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  const doRequest = async (token: string): Promise<Response> =>
    fetch(url.toString(), {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Authorization: token, // no 'Bearer' prefix — matches Python implementation
      },
    });

  let token = await getIdToken();
  let res = await doRequest(token);

  // Auto-refresh on 403 (expired token), same as Python api_get()
  if (res.status === 403) {
    token = await getIdToken(true);
    res = await doRequest(token);
  }

  if (!res.ok) {
    throw new Error(`API Global66 ${res.status}: ${path}`);
  }

  return res.json() as Promise<T>;
}

// ─── Presigned URL (returns plain string, not JSON) ──────────────────────────

export async function getPresignedUrl(fileKey: string): Promise<string> {
  const url = new URL(`${BASE_URL}/company/bo/pre-signed-url`);
  url.searchParams.set('fileKey', fileKey);

  const doRequest = async (token: string) =>
    fetch(url.toString(), {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: token,
      },
    });

  let token = await getIdToken();
  let res = await doRequest(token);
  if (res.status === 403) {
    token = await getIdToken(true);
    res = await doRequest(token);
  }
  if (!res.ok) throw new Error(`Error obteniendo pre-signed URL (${res.status})`);

  // Response may be a plain string URL or a JSON object with url/preSignedUrl/signedUrl
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const signed: string | undefined =
      json.url ?? json.preSignedUrl ?? json.signedUrl ?? json.presignedUrl;
    if (signed) return signed;
  } catch {
    // plain string URL — use directly
  }
  return text.trim().replace(/^"|"$/g, '');
}
