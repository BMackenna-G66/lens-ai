// Respuesta de casos hacia Salesforce (flujo inverso de la Bandeja).
// El navegador NO puede hacer el OAuth+PATCH directo (expondría el client_secret
// y CORS lo bloquea). Va por el Worker de Cloudflare (ruta /salesforce/case-update),
// que tiene los secretos y hace client_credentials + PATCH al Apex REST.

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const sfUpdateDisponible = (): boolean => !!PROXY;

// Valores válidos del picklist Product__c (los devolvió Salesforce). Ojo: emoji real.
export const PRODUCT_OPTIONS = [
  '👤 Cuenta Perfil',
  '💰 Cuenta Global',
  '💵  Exchange',
  '💸 Transferencias',
  '👥 Pagos',
  '💳 Tarjeta Digital',
  '💳 Tarjeta Física',
  '❌ S/ Producto',
];

export interface SFCaseUpdate {
  CaseNumber: string;
  C_Review__c?: string;
  Senales_de_Alerta__c?: string;
  C_Status__c?: string;
  CAT_CMPL__c?: string;
  Comments?: string;
  Country__c?: string;
  Product__c?: string;
  Sleep__c?: string | null;
  Tipo_de_Caso_Compliance__c?: string;
  Type?: string;
  PEP__c?: boolean;
  'Customer ID'?: string;
}

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
  let data: Record<string, unknown> = {};
  const text = await res.text();
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

  const success = data['success'] === true;
  return {
    ok: res.ok && success !== false && !data['error'] && !data['errors'],
    status: res.status,
    success: data['success'] as boolean | undefined,
    updatedFields: data['updatedFields'] as string[] | undefined,
    warnings: data['warnings'] as string[] | undefined,
    errors: (data['errors'] as string[] | undefined) ?? (data['error'] ? [String(data['error'])] : undefined),
    errorCode: data['errorCode'] as string | undefined,
    closed: data['closed'] as boolean | undefined,
    caseId: data['caseId'] as string | undefined,
    raw: data,
  };
}
