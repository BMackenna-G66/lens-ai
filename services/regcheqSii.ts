// Dispara la consulta de situación tributaria (SII) en la API interna de Regcheq
// a través del Cloudflare Worker. La API externa (external-api) NO expone este
// trigger, así que el Worker hace login + POST /fichas-clientes/{fichaId}/situacion-tributaria
// y devuelve el resultado. Devuelve el objeto de situación tributaria (el mismo
// shape que perfil.situacionTributaria del external-api) o null si no se pudo.

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const siiProxyDisponible = (): boolean => !!PROXY;

export async function triggerSiiViaProxy(
  fichaId: string,
  rut: string
): Promise<Record<string, unknown> | null> {
  if (!PROXY || !fichaId || !rut) return null;
  try {
    const res = await fetch(`${PROXY}/regcheq/sii`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichaId, rut }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: Record<string, unknown>; status?: string };
    // El endpoint interno devuelve { status, response: {...SII...} }.
    if (data && typeof data === 'object' && data.response && typeof data.response === 'object') {
      return data.response as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
