// Dispara la situación tributaria (SII) de una ficha vía el Cloudflare Worker,
// que replica el botón "situación tributaria" de la plataforma usando un token
// de sesión guardado como secret. La external-api NO expone este disparo.
//
// Devuelve el objeto de situación tributaria (mismo shape que
// perfil.situacionTributaria del external-api) si el Worker lo devuelve, o null.
// En cualquier caso, el disparo hace que el external-api GET posterior traiga el
// SII (el llamador reconsulta como fallback).

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const siiProxyDisponible = (): boolean => !!PROXY;

export async function triggerSiiViaProxy(
  fichaId: string,
  rut: string,
  companyId = ''
): Promise<Record<string, unknown> | null> {
  if (!PROXY || !fichaId || !rut) return null;
  try {
    const res = await fetch(`${PROXY}/regcheq/sii`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichaId, rut, companyId }),
    });
    if (!res.ok) return null; // token vencido / error → el llamador cae al fallback
    const data = (await res.json()) as { response?: Record<string, unknown> } | Record<string, unknown>;
    const resp = (data as { response?: Record<string, unknown> }).response;
    if (resp && typeof resp === 'object' && Object.keys(resp).length > 0) return resp;
    return null;
  } catch {
    return null;
  }
}
