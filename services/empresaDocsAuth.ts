// EmpresaDocs auth — browser equivalent of the Python auth module.
// Refresh Token (SSO priority) → ID Token via POST /admin/refresh-token.
// ID Token is cached in memory; Refresh Tokens are persisted in localStorage.
//
// Priority (mirrors Python app):
//   1. SSO token from localStorage     (full permissions — DNI/email search)
//   2. Basic token from localStorage   (user-supplied override)
//   3. DEFAULT_BASIC_TOKEN             (hardcoded default, same as Python GLOBAL66_REFRESH_TOKEN)

const BASE_URL = 'https://api.global66.com';

const LS_SSO   = 'empresadocs_sso_refresh_token';
const LS_BASIC = 'empresadocs_basic_refresh_token';

// Default basic refresh token — same value hardcoded in empresa_docs_app.py.
// Provides immediate access without manual configuration (Company ID search).
// For DNI/email search, upgrade to SSO token via the auth panel.
const DEFAULT_BASIC_TOKEN = 'eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ.hU-KCkwhfQ3_aTuS-WalQdnlZ8_w1-0JRRSuNjILu3PCf0HQl3kr1S-MAV207oex48aAsJejgriGAjfebOZObeQ5NdLrT5aaHD9BPqIvVyY9yEQfCpzOwOUZDYDpvrFlT6F6spQGwwsRqB4xrVXz5viO28cq9toKHg3wRraak7lIPKvAjRDqIrzyVzQ6ZNRxoHF5aidigZiquJoizib0hLowXOY1eUL5jZbBeMr-dI3om_hmyf0fXOKrZpzB6V0nz7EHDO7FyWINiDiEdij91Jh1qbybjza-VCPTinNvE_NCeKowxRFXWlJ_9TETCRZZepKwm8JXC760SmaqOKkgNg.HPpdgV-Rve7go4P3.8DwwHGrjdZvmcXWeWlw8OpwLmE6d7sT_tJ_h2zEOdM5U-jHJgsezubdWsakUOJi4oY10CuAcMYTiz5aJpg6fynHVvt8O4_2kEw3MY_7JSZ5y9l99jeS9OtVr8pk65uRjCVrNtxfsHxZW47xgeMbcRK7vdIC0cjMiweEabjBKPTZvSHlNDEMHZyIK5ZWHhFXp0sVMmd4VqxZ6xsqrV7Y_kV3ZdT0rpRlaW-572EURwMQfxbGULnbX8-0X4NSrulJgsKI4kiWR1IqzWrThxTEnfl2ZRKaWisCvG8WRRdHaXR6Dqvaf53DUDskWXcwAxTQK-F1yRUMvn6KHlBEalv8xbUSbzCWqGhuSf-WZ4bCHmxVZOf-_S6c-bfbqLAkXR40RSJJ3P3Fn8pDotCeDVAkxOe9fJT2uq10-ttCdArX6GZRZaw5QfMdMAfjWEiGxgK1KwBCrWRzGPMECzh-OkPxreDJEPCVQsl6xBckDocZ5N7maQDDrZkm2YMAYdcC7w5UHShiBfCtVmDl3lZHv7As0EHRuuR_u6XNKWrzfWI8fEBg9jmcDC4YcymIZlb-w2fmUGvbNQosZHmBzd1ne_Y3Y-Qrza_crXMi1hJ7h_Cw3AOF8GaL6TnryGvNrfCDyXi5WdN67mZc_Jx9QZ7_XWjJ_1fwBp3SH8lGLrn7ZZ2YoXR0KnJJrhxSt4rW8Rg2s9OMNUopICqgSjjRRcSsWmcag0L6kk7-kNiY9McudKhUCJA1N56FZqZuKFRQy02FwlIGqUx8Iu9zV1ing2PVzonde3eF3lRU0YJ1vqRdgnCoFlFGnVtzQDqweTerOqP8zf32urrUixx7kjuEpkAYMn4jFe8c8PCifPFX12AIF2bub186DPEXofRsTgFFrOCp2AmxeC0OiSFhBJ1Tpfn4Q11HMNCiRAnrJQogGUmNtBSQ6r_K3W3JASpHRi7R6Qjdy6EL6b7n40iHjX7O4EoXG4Ulfc0b5UFEmc678Sz3DImhKehqtz8wwj9HlJudptvRfyXFXyZTCrAIu1hTU4PbBp3Hdbtw9sNki13rAuHfjLGCsw0dRe9ucsJ4x20yJprpgGO6WcW_zfaBhg5smPeihCywO1LHnzQ0NPpEvmVc2NAsFh0_ot0oLzOkrnhZiHqqeBRbVaj_ui60zgTOlTaO0QWDzBiJSyICkupbBbvG0F2OBG8qcMsJaWj5QStkreTwZgrRULaRReTck4m7pnKEyMGuQNGzEQGlBg1DDJY82XiZE7qHqICTkW6QmSc4tQSpZ1Jo_nGlWgxUk.SWEaNfFKH3kaVTBU5SbimA';

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

export function getTokenStatus(): { sso: boolean; basic: boolean; usingDefault: boolean } {
  const sso   = !!localStorage.getItem(LS_SSO);
  const basic = !!localStorage.getItem(LS_BASIC);
  return { sso, basic, usingDefault: !sso && !basic };
}

// Always true — DEFAULT_BASIC_TOKEN is always available as fallback
export function hasAnyToken(): boolean {
  return true;
}

// ─── ID Token acquisition ─────────────────────────────────────────────────────

// SSO token has priority over basic, matching Python logic.
export async function getIdToken(forceRefresh = false): Promise<string> {
  if (cachedIdToken && !forceRefresh) return cachedIdToken;

  // Priority: SSO (localStorage) > Basic (localStorage) > hardcoded default
  const refreshToken =
    localStorage.getItem(LS_SSO) ||
    localStorage.getItem(LS_BASIC) ||
    DEFAULT_BASIC_TOKEN;

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
