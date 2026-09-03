// Cierre en Admin de la cola REMESA: cambia el estado de la TRANSACCIÓN en
// api.global66.com — liberarla (DATOS_VERIFICADOS) o rechazarla
// (ENVIO_RECHAZADO). El estado destino lo trae la tipología, así que esta
// función no sabe ni le importa cuál de las dos es.
//
// Inspirado en adminCierreService (cierre del CLIENTE) pero separado a propósito:
// son APIs distintas y no queremos que un cambio acá toque el flujo de OFAC.
// El navegador no puede pegarle directo (CORS + el refresh-token es secreto), así
// que va por el Worker → ruta /admin/transaction-status.
//
// ⚠️ ACCIÓN DE ALTO IMPACTO: mueve transacciones reales, para los dos lados. La
// UI confirma antes, con la advertencia de la tipología elegida.

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const remesaAdminDisponible = (): boolean => !!PROXY;

export interface RemesaAdminPayload {
  transactionIds: (string | number)[];
  targetStatusDB: string;      // DATOS_VERIFICADOS
  targetStatusLabel: string;   // Datos verificados
  // Trazabilidad. NO van en la llamada a la API (el script de referencia manda
  // el objeto de la transacción tal cual, sin campos extra): quedan en la
  // auditoría de Lens y en el espejo de Redshift.
  requestedBy?: string;
  changeTicket?: string;
}

export interface RemesaAdminItem {
  transactionId: string;
  ok: boolean;
  omitido?: boolean;          // ya estaba en el estado objetivo
  paso?: string;
  status?: number;
  estadoAnterior?: string;
  estadoNuevo?: string;
  detalle?: string;
}

export interface RemesaAdminResult {
  ok: boolean;
  results: RemesaAdminItem[];
  error?: string;
}

export async function enviarCierreRemesaAdmin(payload: RemesaAdminPayload): Promise<RemesaAdminResult> {
  if (!PROXY) throw new Error('Proxy no configurado (EMPRESADOCS_PROXY_URL).');
  const ids = payload.transactionIds.map(x => String(x).trim()).filter(Boolean);
  if (!ids.length) throw new Error('Falta el número de transacción.');

  const res = await fetch(`${PROXY}/admin/transaction-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Solo lo que la ruta necesita: requestedBy/changeTicket no viajan a la API.
    body: JSON.stringify({
      transactionIds: ids,
      targetStatusDB: payload.targetStatusDB,
      targetStatusLabel: payload.targetStatusLabel,
    }),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

  if (!res.ok) {
    return { ok: false, results: [], error: (data.error as string) || `HTTP ${res.status}` };
  }
  return {
    ok: data.ok === true,
    results: (data.results as RemesaAdminItem[]) ?? [],
  };
}

// Resumen legible de un resultado, para la ficha y el masivo.
//
// `participio` viene de la tipología aplicada ("liberada(s)", "rechazada(s)").
// El default mantiene el texto que ya había para los llamadores que no lo pasan;
// decir "liberada" sobre un rechazo sería reportar lo contrario de lo que pasó.
export function resumenRemesaAdmin(r: RemesaAdminResult, participio = 'liberada(s)'): string {
  if (r.error) return `❌ ${r.error}`;
  const ok = r.results.filter(x => x.ok && !x.omitido).length;
  const omit = r.results.filter(x => x.omitido).length;
  const err = r.results.filter(x => !x.ok);
  const partes = [
    ok ? `✅ ${ok} ${participio}` : '',
    omit ? `↷ ${omit} ya estaba(n) en el estado` : '',
    err.length ? `❌ ${err.length} con error: ${err.map(e => `${e.transactionId} (${e.status ?? e.paso}) ${e.detalle ?? ''}`.trim()).join(' · ')}` : '',
  ].filter(Boolean);
  return partes.join(' · ') || 'Sin cambios.';
}
