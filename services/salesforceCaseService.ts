// Respuesta de casos hacia Salesforce (flujo inverso de la Bandeja).
// El navegador NO puede hacer el OAuth+PATCH directo (expondría el client_secret
// y CORS lo bloquea). Va por el Worker de Cloudflare (ruta /salesforce/case-update),
// que tiene los secretos y hace client_credentials + PATCH al Apex REST.

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const sfUpdateDisponible = (): boolean => !!PROXY;

// Los campos y sus valores válidos viven en el MANTENEDOR: salesforceCaseFields.ts
export type SFCaseUpdate = {
  CaseNumber: string;
  PEP__c?: boolean;
} & Record<string, string | boolean | null | undefined>;

export interface SFUpdateResult {
  ok: boolean;                 // success de Salesforce (o 2xx sin errores)
  status: number;              // HTTP del Worker/Salesforce
  success?: boolean;
  updatedFields?: string[];
  warnings?: string[];
  errors?: string[];
  errorCode?: string;
  closed?: boolean;
  caseId?: string;
  raw: unknown;                // respuesta cruda para mostrar/depurar
}

// Envía la actualización del caso a Salesforce vía el Worker.
export async function sendCaseUpdate(payload: SFCaseUpdate): Promise<SFUpdateResult> {
  if (!PROXY) throw new Error('Proxy no configurado (EMPRESADOCS_PROXY_URL).');
  if (!payload.CaseNumber?.trim()) throw new Error('Falta el número de caso (CaseNumber).');

  const res = await fetch(`${PROXY}/salesforce/case-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: unknown = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text }; }
  // Salesforce a veces devuelve el error como array [{errorCode, message}] (ej. recurso
  // Apex REST no desplegado → NOT_FOUND "Could not find a match for URL"), y a veces como
  // objeto {message, errorCode, success}. Lo normalizamos a objeto para leer siempre igual.
  const data: Record<string, unknown> = (Array.isArray(parsed) ? (parsed[0] ?? {}) : parsed) as Record<string, unknown>;

  const success = data['success'] === true;
  return {
    ok: res.ok && success !== false && !data['error'] && !data['errors'],
    status: res.status,
    success: data['success'] as boolean | undefined,
    updatedFields: data['updatedFields'] as string[] | undefined,
    warnings: data['warnings'] as string[] | undefined,
    // Salesforce devuelve el detalle en `message` (ej. 404 CASE_NOT_FOUND); el Worker
    // usa `error`. Los plegamos a `errors` para que la UI siempre muestre la causa.
    errors: (data['errors'] as string[] | undefined)
      ?? (data['error'] ? [String(data['error'])] : undefined)
      ?? (data['message'] ? [String(data['message'])] : undefined),
    errorCode: data['errorCode'] as string | undefined,
    closed: data['closed'] as boolean | undefined,
    caseId: data['caseId'] as string | undefined,
    raw: parsed,
  };
}
