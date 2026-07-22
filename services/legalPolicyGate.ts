// Capa 0 — Legal Policy Gate (Colombia / Inspektor).
// Implementa la política legal v1 aprobada (P1–P4 + JEPMS + DNI + lista
// informativa / sanción administrativa) sobre CADA coincidencia de listas, y
// agrega un resultado por persona. Es SOLO informativo: clasifica el enrutamiento
// operativo exigido por política; no bloquea ni decide (no es AUTO_REJECT).
//
// Fuente: "Modelo de decisión criminal para Colombia" (Lens AI + Inspektor), §4.

export type LegalPolicyResult = 'REVIEW_CRITICAL' | 'REVIEW_WARNING' | 'RELEASE' | 'MANUAL_REVIEW';

export interface LegalPolicyHitInput {
  Prioridad?: string; prioridad?: string;
  nombreGrupoLista?: string; grupoLista?: string; grupo?: string;
  categoria?: string; nombreCategoria?: string; tipoLista?: string; nombreTipoLista?: string;
  nombreCompleto?: string; documentoIdentidad?: string;
}

export interface LegalPolicyHit {
  result: LegalPolicyResult;
  ruleId: string;
  grupo: string;
  prioridad: string;      // '1'..'4' o ''
  nombre: string;
  documento: string;
  docExact: boolean;
}

export interface LegalPolicyOutcome {
  result: LegalPolicyResult | null;   // null = sin coincidencias de listas para clasificar
  ruleId: string;
  hits: LegalPolicyHit[];
  counts: Record<LegalPolicyResult, number>;
}

// Metadatos de presentación (UI + export), según §4.3 del modelo.
export const LP_META: Record<LegalPolicyResult, { label: string; short: string; emoji: string; hex: string }> = {
  REVIEW_CRITICAL: { label: 'Revisión crítica', short: 'CRÍTICA', emoji: '🔴', hex: '#dc2626' },
  REVIEW_WARNING:  { label: 'Revisión (warning)', short: 'WARNING', emoji: '🟠', hex: '#ea580c' },
  RELEASE:         { label: 'Liberar', short: 'RELEASE', emoji: '🟢', hex: '#16a34a' },
  MANUAL_REVIEW:   { label: 'Revisión manual', short: 'MANUAL', emoji: '🟡', hex: '#ca8a04' },
};

const SEVERITY: Record<LegalPolicyResult, number> = {
  REVIEW_CRITICAL: 3, REVIEW_WARNING: 2, MANUAL_REVIEW: 1, RELEASE: 0,
};

const normDoc = (v: unknown): string => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

const grupoDe = (h: LegalPolicyHitInput): string =>
  (h.nombreGrupoLista ?? h.grupoLista ?? h.grupo ?? h.categoria ?? h.nombreCategoria ?? h.tipoLista ?? h.nombreTipoLista ?? '').trim();

const prioridadNum = (h: LegalPolicyHitInput): number | null => {
  const m = String(h.Prioridad ?? h.prioridad ?? '').match(/[1-4]/);
  return m ? Number(m[0]) : null;
};

// Clasifica una coincidencia según la precedencia del §4.1 (la primera regla que
// aplica gana). jepmsExacto es señal a nivel persona (algún JEPMS con DNI exacto).
function classifyHit(h: LegalPolicyHitInput, numeroDni: string, jepmsExacto: boolean): LegalPolicyHit {
  const grupo = grupoDe(h);
  const p = prioridadNum(h);
  const docHit = normDoc(h.documentoIdentidad);
  const docExact = !!docHit && docHit === numeroDni;
  const tipo = `${grupo} ${h.tipoLista ?? ''} ${h.nombreTipoLista ?? ''}`.toUpperCase();
  const esInformativa = /INFORMATIVA/.test(tipo);
  const esSancionAdmin = /SANCI[OÓ]N\s+ADMINISTRATIVA|ADMINISTRATIVA/.test(tipo);

  let result: LegalPolicyResult, ruleId: string;
  if (p === 1)                              { result = 'REVIEW_CRITICAL'; ruleId = 'LP_P1_ALWAYS_REVIEW'; }
  else if (p === 3 && jepmsExacto)          { result = 'REVIEW_CRITICAL'; ruleId = 'LP_P3_JEPMS_DNI_EXACT'; }
  else if (p === 2)                         { result = 'REVIEW_WARNING';  ruleId = 'LP_P2_WARNING'; }
  else if (esInformativa && docExact)       { result = 'REVIEW_WARNING';  ruleId = 'LP_INFO_LIST_DNI_EXACT'; }
  else if (esSancionAdmin && docExact)      { result = 'REVIEW_WARNING';  ruleId = 'LP_ADMIN_SANCTION_DNI_EXACT'; }
  else if (p === 3)                         { result = 'RELEASE';         ruleId = 'LP_P3_NON_JEPMS_RELEASE'; }
  else if (p === 4)                         { result = 'RELEASE';         ruleId = 'LP_P4_RELEASE'; }
  else                                      { result = 'MANUAL_REVIEW';   ruleId = 'LP_FAIL_SAFE_MANUAL_REVIEW'; }

  return { result, ruleId, grupo, prioridad: p ? String(p) : '', nombre: String(h.nombreCompleto ?? ''), documento: docHit, docExact };
}

// Evalúa la política sobre todas las coincidencias (listas + listas_propias) de
// una persona. jepmsIdentificaciones = documentos encontrados en el bloque JEPMS.
export function evaluateLegalPolicy(
  listItems: LegalPolicyHitInput[],
  jepmsIdentificaciones: string[],
  numeroDniRaw: string,
): LegalPolicyOutcome {
  const numeroDni = normDoc(numeroDniRaw);
  const jepmsExacto = !!numeroDni && jepmsIdentificaciones.some(j => normDoc(j) === numeroDni);

  const hits = (listItems ?? []).map(h => classifyHit(h, numeroDni, jepmsExacto));
  const counts: Record<LegalPolicyResult, number> = { REVIEW_CRITICAL: 0, REVIEW_WARNING: 0, RELEASE: 0, MANUAL_REVIEW: 0 };
  for (const h of hits) counts[h.result]++;

  // Resultado agregado por persona = el más severo entre las coincidencias.
  let result: LegalPolicyResult | null = null;
  let ruleId = '';
  for (const h of hits) {
    if (result === null || SEVERITY[h.result] > SEVERITY[result]) { result = h.result; ruleId = h.ruleId; }
  }
  return { result, ruleId, hits, counts };
}
