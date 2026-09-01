// Consulta de remesas en Redshift (vía el endpoint del otro sistema).
// Se llama DIRECTO desde el navegador: el endpoint ya tiene CORS habilitado para
// el origin de Lens (GitHub Pages). Latencia típica ~3-8s (consulta a Redshift).

const REMESAS_URL = 'https://qwvd2t33uc.execute-api.us-east-1.amazonaws.com/remesas/search';

export interface RemesaRow {
  transaction_id: number;
  customer_id: number;
  beneficiary_country_name: string;
  tipo_envio: string;
  beneficiary_dni: string;
  beneficiary_dni_type: string;
  beneficiary_name: string;
  beneficiary_first_name: string;
  beneficiary_last_name: string;
  beneficiary_email: string;
  beneficiary_id: string;
  origin_country: string;
  destiny_country: string;
  destiny_amount_usd: string;
  tx_status: string;
  start_date: string;
}

export type RemesaEstado = 'ok' | 'not_found' | 'cluster_unavailable' | 'error';

export interface RemesaResult {
  estado: RemesaEstado;
  row?: RemesaRow;            // la remesa encontrada (para una TX)
  notFound: (number | string)[];
  mensaje?: string;          // detalle de error / cluster no disponible
}

// Normaliza la remesa a un transaction_id numérico (la columna ya es el número).
const aTxId = (v: string | number): number => Number(String(v).replace(/\D/g, ''));

// Consulta UNA remesa por su transaction_id.
export async function buscarRemesa(remesa: string | number): Promise<RemesaResult> {
  const id = aTxId(remesa);
  if (!id) return { estado: 'error', notFound: [], mensaje: 'transaction_id inválido' };

  let res: Response;
  try {
    res = await fetch(REMESAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: id }),
    });
  } catch (e) {
    return { estado: 'error', notFound: [], mensaje: `No se pudo contactar el servicio: ${(e as Error).message}` };
  }

  let data: {
    rows?: RemesaRow[]; count?: number; not_found?: (number | string)[];
    error?: string; message?: string;
  };
  try { data = await res.json(); } catch { return { estado: 'error', notFound: [], mensaje: `Respuesta no válida (HTTP ${res.status})` }; }

  // El cluster caído viene con HTTP 200 pero error en el body.
  if (data.error === 'cluster_unavailable') {
    return { estado: 'cluster_unavailable', notFound: [], mensaje: data.message || 'Cluster no disponible' };
  }
  if (data.error) return { estado: 'error', notFound: [], mensaje: data.error };

  const rows = data.rows ?? [];
  const notFound = data.not_found ?? [];
  // OJO con el texto: esto NO significa que la transacción no exista.
  //
  // La consulta va contra el ESPEJO de Redshift, no contra Admin. Una remesa
  // recién creada existe en Admin y todavía no replicó — se vio con la TX
  // 14818703, visible en Admin y ausente acá mientras la 14818600 ya estaba.
  // Decir "no existe" es afirmar algo falso sobre la operación del cliente, y
  // un analista puede rechazar el caso por eso. Es el mismo error que ya se
  // corrigió con el cluster pausado: infraestructura nuestra presentada como
  // dato del cliente.
  if (rows.length === 0) {
    return {
      estado: 'not_found', notFound,
      mensaje: 'La transacción todavía no está en el espejo de Redshift. Si es reciente, es demora de replicación: se reintenta solo en la próxima corrida.',
    };
  }
  return { estado: 'ok', row: rows[0], notFound };
}

// Consulta VARIAS remesas (para poblar la tabla). El endpoint acepta hasta 50
// transaction_ids por llamada; acá se parte en lotes. Devuelve un mapa
// txId(string) → RemesaRow con las encontradas (las no halladas simplemente no
// aparecen en el mapa). No lanza: los lotes que fallen se omiten.
export async function buscarRemesas(remesas: (string | number)[]): Promise<Record<string, RemesaRow>> {
  const ids = [...new Set(remesas.map(aTxId).filter(n => n > 0))];
  const out: Record<string, RemesaRow> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const res = await fetch(REMESAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: chunk }),
      });
      const data = await res.json() as { rows?: RemesaRow[]; error?: string };
      if (data.error) continue; // cluster_unavailable u otro → se omite el lote
      for (const row of data.rows ?? []) out[String(row.transaction_id)] = row;
    } catch { /* lote omitido */ }
  }
  return out;
}
