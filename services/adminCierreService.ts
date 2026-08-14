// Segundo cierre del caso: bloqueo/desbloqueo del cliente en Admin (api.global66.com).
// El navegador NO puede pegarle directo (CORS + el refresh-token es secreto), así que
// va por el Worker de Cloudflare (ruta /admin/customer-status), que hace
// refresh-token → idToken y los 3 pasos (blacklist, compliance, last-step).
//
// ⚠️ ACCIÓN DE ALTO IMPACTO: cambia el estado de clientes reales. La UI confirma
// explícitamente antes de llamar acá.

import { sanitizarTexto } from './textSanitizer';

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const adminCierreDisponible = (): boolean => !!PROXY;

export interface AdminCierrePayload {
  customerIds: string[];   // ids numéricos del cliente en admin
  status: string;          // NORMAL | UNDER_COMPLIANCE_REVIEW | FULLY_BLOCKED
  comment: string;
  observation: string;
  agent: string;           // = assignee (compliance.masivo@global66.com)
  ofacFlag: boolean;       // blacklistFlag
  ofacProvider: string;    // REGCHECK | RISK_CONSULTING
  countryCode: string;     // CL | CO (para el last-step)
  lastStep: boolean;       // disparar el last-step si el status lo permite
  // Paso PEP (PUT isPep) — opcional; se ejecuta solo si pepEnabled.
  pepEnabled?: boolean;
  pepValue?: boolean;      // isPep
  pepProvider?: string;    // default PreLastStep
  pepCountryCode?: string; // default = countryCode
  pepPosition?: string | null;
  // Paso Risk Level (PUT /customer) — opcional; se ejecuta solo si riskEnabled.
  riskEnabled?: boolean;
  riskLevel?: string;      // Bajo | Medio | Alto
}

export interface AdminStepResult { ok: boolean; status: number; data: unknown; }
export interface AdminCustomerResult { customerId: string; ok: boolean; steps: Record<string, AdminStepResult>; }
export interface AdminCierreResult { ok: boolean; results: AdminCustomerResult[]; error?: string; }

export async function enviarCierreAdmin(payload: AdminCierrePayload): Promise<AdminCierreResult> {
  if (!PROXY) throw new Error('Proxy no configurado (EMPRESADOCS_PROXY_URL).');
  if (!payload.customerIds.length) throw new Error('Falta el customerId.');

  // La API de Admin no responde con éxito si la observación trae caracteres
  // especiales (guiones, etc.), así que se sanea justo antes de enviar.
  const limpio: AdminCierrePayload = { ...payload, observation: sanitizarTexto(payload.observation) };

  const res = await fetch(`${PROXY}/admin/customer-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limpio),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

  if (!res.ok) {
    return { ok: false, results: [], error: (data.error as string) || `HTTP ${res.status}` };
  }
  return {
    ok: data.ok === true,
    results: (data.results as AdminCustomerResult[]) || [],
    error: data.error as string | undefined,
  };
}
