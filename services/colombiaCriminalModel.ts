// Modelo de Decisión Criminal — Colombia (Inspektor) · Capas 1–6, V1 provider-driven.
//
// Motor PURO (sin UI, sin red). Consume una respuesta de Inspektor y produce un
// CriminalProfileOutcome con evidencia normalizada, identidad, severidad provider,
// contexto, dedup, riesgo criminal y recomendación. Corre en SHADOW respecto de la
// Capa 0 (Legal Policy Gate, en legalPolicyGate.ts): NO modifica ni reemplaza la
// decisión legal; solo la complementa.
//
// Decisión de diseño V1: NO hay catálogo manual de delitos. La severidad se deriva
// de la prioridad P1–P4 de Inspektor; el texto del delito (raw_offense) se conserva
// tal cual para trazabilidad. Umbrales/pesos están centralizados y versionados
// (CONFIG) para calibración futura (B05/B06/B15) sin tocar la lógica.

// ─── Versión y configuración centralizada (parametrizable / calibrable) ─────────
export const CRIMINAL_MODEL_VERSION = 'criminal-decision-co-v1';

export const GRUPO_OBJETIVO_CRIMINAL =
  'LISTAS ASOCIADAS A LA/FT/FPADM, CORRUPCIÓN U OTROS DELITOS (PENAL) Y EXTINCIÓN DE DOMINIO';

// Configuración por defecto ("matriz"). Es editable/persistible por el analista
// (ver getCriminalConfig/saveCriminalConfig); los cambios aplican a los PRÓXIMOS
// masivos/consultas (no recalcula Excel ya exportados).
export const CRIMINAL_CONFIG_DEFAULT = {
  // Capa 1 — Identidad (§5, valores propuestos, calibrar B05)
  identity: {
    docExact: 70, nameHigh: 30, nameMed: 20, nameLow: 10, docDifferent: -80,
    nameHighCut: 95, nameMedCut: 85, nameLowCut: 70,
    confHigh: 80, confMedium: 40, // score→confianza
    probableNameMin: 90,          // PROBABLE requiere nombre ≥ esto + doc MISSING + corroboración
  },
  // Capa 3 — Severidad por prioridad (§3)
  severityByPriority: { 1: 'CRITICAL', 2: 'HIGH', 3: 'MEDIUM', 4: 'LOW' } as Record<number, ProviderSeverity>,
  // Capa 5 — Pesos de riesgo (§9, propuestos, calibrar B15)
  risk: {
    identity: { CONFIRMED: 20, PROBABLE: 8, UNRESOLVED: 0, EXCLUDED: 0 } as Record<string, number>,
    evidence: { VERY_HIGH: 25, HIGH: 18, MEDIUM: 10, LOW: 3, UNKNOWN: 0 } as Record<string, number>,
    severity: { CRITICAL: 30, HIGH: 22, MEDIUM: 12, LOW: 4, UNKNOWN: 8 } as Record<string, number>,
    status: { CONVICTED: 20, EXECUTING_SENTENCE: 20, SANCTIONED: 18, CHARGED: 10, ACTIVE_PROCEEDING: 8, INVESTIGATED: 5, CLOSED: 2, UNKNOWN: 2, ACQUITTED: -15, DISMISSED: -15 } as Record<string, number>,
    recency: { '<2y': 10, '2-5y': 7, '5-10y': 3, '>10y': 0, UNKNOWN: 2 } as Record<string, number>,
    recurrenceDistinct: 8,
    bands: { low: 24, medium: 49, high: 74 }, // 0-24 LOW, 25-49 MED, 50-74 HIGH, 75+ CRITICAL
  },
};

export type CriminalConfig = typeof CRIMINAL_CONFIG_DEFAULT;
const CRIMINAL_CONFIG_KEY = 'colombia_criminal_config';

// Lee la config activa (localStorage sobre el default). Merge de 2 niveles para
// tolerar configs guardadas parciales.
export function getCriminalConfig(): CriminalConfig {
  try {
    const raw = localStorage.getItem(CRIMINAL_CONFIG_KEY);
    if (!raw) return CRIMINAL_CONFIG_DEFAULT;
    const s = JSON.parse(raw) as Partial<CriminalConfig>;
    const d = CRIMINAL_CONFIG_DEFAULT;
    return {
      identity: { ...d.identity, ...(s.identity ?? {}) },
      severityByPriority: { ...d.severityByPriority, ...(s.severityByPriority ?? {}) },
      risk: {
        ...d.risk, ...(s.risk ?? {}),
        identity: { ...d.risk.identity, ...(s.risk?.identity ?? {}) },
        evidence: { ...d.risk.evidence, ...(s.risk?.evidence ?? {}) },
        severity: { ...d.risk.severity, ...(s.risk?.severity ?? {}) },
        status: { ...d.risk.status, ...(s.risk?.status ?? {}) },
        recency: { ...d.risk.recency, ...(s.risk?.recency ?? {}) },
        bands: { ...d.risk.bands, ...(s.risk?.bands ?? {}) },
      },
    };
  } catch { return CRIMINAL_CONFIG_DEFAULT; }
}
export function saveCriminalConfig(cfg: CriminalConfig): void {
  try { localStorage.setItem(CRIMINAL_CONFIG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}
export function resetCriminalConfig(): void {
  try { localStorage.removeItem(CRIMINAL_CONFIG_KEY); } catch { /* ignore */ }
}

// Config activa usada por el motor durante una evaluación (se refresca al inicio
// de analyzeCriminalProfile).
let ACTIVE_CONFIG: CriminalConfig = CRIMINAL_CONFIG_DEFAULT;

// ─── Tipos ──────────────────────────────────────────────────────────────────────
export type SourceType = 'LIST' | 'INTERNAL_LIST' | 'PROCURADURIA' | 'RAMA_JUDICIAL' | 'JEPMS';
export type EvidenceType =
  | 'WATCHLIST' | 'SANCTION' | 'INELIGIBILITY' | 'OFFENSE_REFERENCE' | 'JUDICIAL_PROCESS'
  | 'INVESTIGATION' | 'CONVICTION' | 'EXECUTION_OF_SENTENCE' | 'PEP' | 'ADVERSE_INFORMATION' | 'UNKNOWN';
export type EvidenceStrength = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type ProviderSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type DocumentMatch = 'EXACT' | 'DIFFERENT' | 'MISSING' | 'INVALID';
export type IdentityResolution = 'CONFIRMED' | 'PROBABLE' | 'UNRESOLVED' | 'EXCLUDED';
export type IdentityConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';
export type CriminalRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type CriminalRecommendation = 'RELEASE_UNDER_CURRENT_POLICY' | 'REVIEW' | 'PRIORITY_REVIEW';

export interface EvidenceRecord {
  // Fuente
  source_type: SourceType;
  source_name: string;
  source_record_id: string;
  provider_source: string;
  // Capa 2 — Evidencia
  evidence_type: EvidenceType;
  evidence_strength: EvidenceStrength;
  evidence_status: string;
  detail_required: boolean;
  raw_description: string;
  // Capa 3 — Severidad provider
  serious_criminal_group: boolean;
  raw_offense: string;
  provider_priority: string;         // 'P1'..'P4' | 'UNKNOWN'
  provider_severity: ProviderSeverity;
  provider_group: string;
  provider_category: string;
  provider_list_type: string;
  // Capa 1 — Identidad
  document_match: DocumentMatch;
  name_similarity: number;
  identity_score: number;
  identity_confidence: IdentityConfidence;
  identity_resolution: IdentityResolution;
  cluster_id: string;
  cross_source_corroboration: number;
  data_quality_flags: string[];
  // Capa 4 — Contexto
  legal_status: string;
  procedural_role: string;
  finality: string;
  event_date: string;
  last_update_date: string;
  active_flag: 'TRUE' | 'FALSE' | 'UNKNOWN';
  recency_days: number | null;
  recency_years: number | null;
  recency_band: string;
  // Dedup
  event_key: string;
  record_risk?: number;
}

export interface CriminalProfileOutcome {
  version: string;
  records: EvidenceRecord[];
  identity_summary: Record<IdentityResolution, number>;
  distinct_event_count: number;
  repeat_pattern: 'NONE' | 'MULTIPLE_SAME_EVENT' | 'REPEAT_DISTINCT' | 'PATTERN_UNKNOWN';
  serious_criminal_group: boolean;
  provider_severity_max: ProviderSeverity;
  criminal_risk: CriminalRisk;
  risk_score: number;
  risk_factors: string[];
  risk_reason_codes: string[];
  recommendation: CriminalRecommendation;
}

// ─── Helpers de normalización ────────────────────────────────────────────────────
const S = (v: unknown): string => (v === null || v === undefined) ? '' : String(v).trim();
const normDoc = (v: unknown): string => S(v).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'DA', 'DO']);

function nameTokens(raw: unknown): string[] {
  return S(raw).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(t => t && !PARTICULAS.has(t));
}
function nameSimilarity(a: unknown, b: unknown): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const inter = ta.filter(t => setB.has(t)).length;
  return Math.round((inter / Math.max(ta.length, tb.length)) * 100); // cobertura de tokens
}

// Accesores tolerantes a las 3 formas de los bloques judiciales (§ doc).
function unwrap(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (typeof data === 'object' && data !== null && 'hasError' in (data as object) && (data as { hasError: boolean }).hasError) return [];
  const d = Array.isArray(data) ? data : (data as { data?: unknown })?.data;
  if (Array.isArray(d)) return d.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null);
  if (typeof d === 'object' && d !== null) return [d as Record<string, unknown>];
  return [];
}

// ─── Capa 1 — Identity Resolution (por hit) ──────────────────────────────────────
function resolveIdentity(recDoc: string, recName: string, qDni: string, qName: string): {
  document_match: DocumentMatch; name_similarity: number; identity_score: number;
  identity_confidence: IdentityConfidence; identity_resolution: IdentityResolution; data_quality_flags: string[];
} {
  const c = ACTIVE_CONFIG.identity;
  const flags: string[] = [];
  const dn = normDoc(recDoc);
  let document_match: DocumentMatch;
  if (!dn) document_match = 'MISSING';
  else if (/^0+$/.test(dn)) { document_match = 'INVALID'; flags.push('DOC_INVALID'); }
  else if (dn === qDni) document_match = 'EXACT';
  else document_match = 'DIFFERENT';

  const name_similarity = nameSimilarity(recName, qName);
  if (!recName) flags.push('NAME_EMPTY');

  let score = 0;
  if (document_match === 'EXACT') score += c.docExact;
  if (document_match === 'DIFFERENT') score += c.docDifferent;
  if (name_similarity >= c.nameHighCut) score += c.nameHigh;
  else if (name_similarity >= c.nameMedCut) score += c.nameMed;
  else if (name_similarity >= c.nameLowCut) score += c.nameLow;

  const identity_confidence: IdentityConfidence =
    score >= c.confHigh ? 'HIGH' : score >= c.confMedium ? 'MEDIUM' : score >= 1 ? 'LOW' : 'NO_MATCH';

  // Resolución determinística (§5.2, criterios iniciales).
  let identity_resolution: IdentityResolution;
  if (document_match === 'DIFFERENT') identity_resolution = 'EXCLUDED';               // exclusión fuerte
  else if (document_match === 'EXACT') identity_resolution = 'CONFIRMED';             // identidad fuerte
  else if (document_match === 'MISSING' && name_similarity >= c.probableNameMin) identity_resolution = 'PROBABLE';
  else identity_resolution = 'UNRESOLVED';                                            // solo nombre / insuficiente

  return { document_match, name_similarity, identity_score: score, identity_confidence, identity_resolution, data_quality_flags: flags };
}

// ─── Capa 3 — Provider Severity ──────────────────────────────────────────────────
function providerSeverity(prioridadRaw: unknown): { provider_priority: string; provider_severity: ProviderSeverity; flag?: string } {
  const m = S(prioridadRaw).match(/[1-4]/);
  if (!m) return { provider_priority: 'UNKNOWN', provider_severity: 'UNKNOWN', flag: 'PRIORITY_MISSING' };
  const p = Number(m[0]);
  return { provider_priority: `P${p}`, provider_severity: ACTIVE_CONFIG.severityByPriority[p] ?? 'UNKNOWN' };
}

// ─── Capa 4 — Contexto temporal ──────────────────────────────────────────────────
function recencyBand(dateStr: string): { days: number | null; years: number | null; band: string } {
  const t = Date.parse(dateStr);
  if (!dateStr || Number.isNaN(t)) return { days: null, years: null, band: 'UNKNOWN' };
  const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  const years = +(days / 365).toFixed(1);
  const band = years < 2 ? '<2y' : years < 5 ? '2-5y' : years < 10 ? '5-10y' : '>10y';
  return { days, years, band };
}

// ─── Construcción de EvidenceRecords (Capa 2 + 3 + 1 + 4 por registro) ───────────
export interface RawResult {
  listas?: Record<string, unknown>[]; listas_propias?: Record<string, unknown>[];
  procuraduria?: unknown; ramaJudicial?: unknown; ramaJudicialJEPMS?: unknown;
}

function grupoDe(it: Record<string, unknown>): string {
  return S(it['nombreGrupoLista'] ?? it['grupoLista'] ?? it['grupo'] ?? it['categoria'] ?? it['nombreCategoria'] ?? it['tipoLista'] ?? it['nombreTipoLista']);
}

export function buildEvidenceRecords(result: RawResult, qName: string, qDni: string): EvidenceRecord[] {
  const numeroDni = normDoc(qDni);
  const out: EvidenceRecord[] = [];

  type BaseOpts = Partial<EvidenceRecord> & { grupo?: string; prioridad?: unknown; recordId: string; raw: string; date?: string; status?: string };
  const baseFrom = (
    source_type: SourceType, evidence_type: EvidenceType, evidence_strength: EvidenceStrength,
    recDoc: string, recName: string, opts: BaseOpts,
  ): EvidenceRecord => {
    const id = resolveIdentity(recDoc, recName, numeroDni, qName);
    const sev = providerSeverity(opts.prioridad);
    const grupo = opts.grupo ?? '';
    const rec = recencyBand(opts.date ?? '');
    const flags = [...id.data_quality_flags];
    if (sev.flag) flags.push(sev.flag);
    return {
      source_type, source_name: opts.source_name ?? source_type, source_record_id: opts.recordId, provider_source: source_type,
      evidence_type, evidence_strength, evidence_status: opts.status ?? 'UNKNOWN',
      detail_required: opts.detail_required ?? (evidence_type === 'JUDICIAL_PROCESS' || evidence_type === 'UNKNOWN'),
      raw_description: opts.raw,
      serious_criminal_group: grupo.toUpperCase() === GRUPO_OBJETIVO_CRIMINAL.toUpperCase(),
      raw_offense: opts.raw_offense ?? '',
      provider_priority: sev.provider_priority, provider_severity: sev.provider_severity,
      provider_group: grupo, provider_category: opts.provider_category ?? '', provider_list_type: opts.provider_list_type ?? '',
      document_match: id.document_match, name_similarity: id.name_similarity, identity_score: id.identity_score,
      identity_confidence: id.identity_confidence, identity_resolution: id.identity_resolution,
      cluster_id: normDoc(recDoc) ? `DOC:${normDoc(recDoc)}` : `NAME:${nameTokens(recName).join('_') || 'NA'}`,
      cross_source_corroboration: 0, data_quality_flags: flags,
      legal_status: opts.legal_status ?? 'UNKNOWN', procedural_role: opts.procedural_role ?? 'UNKNOWN',
      finality: opts.finality ?? 'UNKNOWN', event_date: opts.date ?? '', last_update_date: opts.last_update_date ?? (opts.date ?? ''),
      active_flag: opts.active_flag ?? 'UNKNOWN', recency_days: rec.days, recency_years: rec.years, recency_band: rec.band,
      event_key: opts.event_key ?? `${source_type}:${normDoc(recDoc)}:${opts.recordId}`,
    };
  };

  // Listas / listas propias
  const listItem = (it: Record<string, unknown>, src: SourceType) => {
    const grupo = grupoDe(it);
    const esInformativa = /INFORMATIVA/i.test(`${grupo} ${S(it['tipoLista'])} ${S(it['nombreTipoLista'])}`);
    const esPep = !!S(it['peps']);
    const evType: EvidenceType = esPep ? 'PEP' : esInformativa ? 'ADVERSE_INFORMATION' : 'WATCHLIST';
    const strength: EvidenceStrength = esInformativa ? 'LOW' : (src === 'INTERNAL_LIST' ? 'MEDIUM' : 'HIGH');
    out.push(baseFrom(src, evType, strength, S(it['documentoIdentidad']), S(it['nombreCompleto']), {
      recordId: `${src}:${S(it['documentoIdentidad'])}:${S(it['delito']) || grupo}`,
      raw: S(it['delito']) || grupo, raw_offense: S(it['delito']), grupo, prioridad: it['Prioridad'] ?? it['prioridad'],
      provider_category: S(it['categoria'] ?? it['nombreCategoria']), provider_list_type: S(it['tipoLista'] ?? it['nombreTipoLista']),
      date: S(it['fechaActualizacion']), status: 'ACTIVE', source_name: S(it['fuenteConsulta']) || src,
      event_key: `LIST:${normDoc(S(it['documentoIdentidad']))}:${S(it['delito']) || grupo}`,
    }));
  };
  (result.listas ?? []).forEach(it => listItem(it, 'LIST'));
  (result.listas_propias ?? []).forEach(it => listItem(it, 'INTERNAL_LIST'));

  // Procuraduría → descomponer (sanciones / inhabilidades / delitos)
  for (const rec of unwrap(result.procuraduria)) {
    const doc = S(rec['identification']); const nom = S(rec['name']); const siri = S(rec['num_siri']);
    const push = (evType: EvidenceType, strength: EvidenceStrength, raw: string, extra: Partial<BaseOpts> = {}) =>
      out.push(baseFrom('PROCURADURIA', evType, strength, doc, nom, {
        recordId: `PROC:${siri || doc}:${evType}:${raw.slice(0, 24)}`, raw, source_name: 'Procuraduría',
        event_key: `PROC:${siri || normDoc(doc)}`, ...extra,
      }));
    for (const s of (Array.isArray(rec['sanciones']) ? rec['sanciones'] as Record<string, unknown>[] : []))
      push('SANCTION', 'HIGH', S(s['sancion']) || 'Sanción', { legal_status: 'SANCTIONED', active_flag: 'UNKNOWN' });
    for (const inh of (Array.isArray(rec['inhabilidades']) ? rec['inhabilidades'] as Record<string, unknown>[] : []))
      push('INELIGIBILITY', 'HIGH', S(inh['inhabilidad_legal']) || 'Inhabilidad', { legal_status: 'SANCTIONED', last_update_date: S(inh['fecha_inicio']), date: S(inh['fecha_inicio']) });
    for (const d of (Array.isArray(rec['delitos']) ? rec['delitos'] as Record<string, unknown>[] : []))
      push('OFFENSE_REFERENCE', 'MEDIUM', S(d['descripcion']) || 'Delito', {});
    if (!rec['sanciones'] && !rec['inhabilidades'] && !rec['delitos']) push('ADVERSE_INFORMATION', 'LOW', nom || 'Registro Procuraduría');
  }

  // Rama Judicial → JUDICIAL_PROCESS (nunca condena inferida)
  for (const p of unwrap(result.ramaJudicial)) {
    const suj = S(p['sujetosProcesales']);
    out.push(baseFrom('RAMA_JUDICIAL', 'JUDICIAL_PROCESS', 'MEDIUM', '', suj, {
      recordId: `RJ:${S(p['idProceso']) || S(p['llaveProceso'])}`, raw: `Proceso ${S(p['llaveProceso'] ?? p['idProceso'])} · ${S(p['despacho'])}`,
      source_name: 'Rama Judicial', legal_status: 'ACTIVE_PROCEEDING', procedural_role: 'UNKNOWN', finality: 'NOT_FINAL',
      detail_required: true, date: S(p['fechaProceso']), last_update_date: S(p['fechaUltimaActuacion']),
      event_key: `RJ:${S(p['idProceso']) || S(p['llaveProceso'])}`,
    }));
  }

  // JEPMS → evidencia especialmente relevante (sin inventar delito)
  for (const j of unwrap(result.ramaJudicialJEPMS)) {
    out.push(baseFrom('JEPMS', 'EXECUTION_OF_SENTENCE', 'HIGH', S(j['identificationNumberResult']), S(j['nameResult']), {
      recordId: `JEPMS:${S(j['identificationNumberResult'])}:${S(j['cityName'])}`, raw: `JEPMS ${S(j['cityName'])}`,
      source_name: 'JEPMS', legal_status: 'UNKNOWN', detail_required: true, date: S(j['queryDate']),
      event_key: `JEPMS:${normDoc(S(j['identificationNumberResult']))}:${S(j['cityName'])}`,
    }));
  }

  return out;
}

// ─── Dedup + corroboración (§9) ──────────────────────────────────────────────────
function dedupAndCorroborate(records: EvidenceRecord[]): { distinct_event_count: number; repeat_pattern: CriminalProfileOutcome['repeat_pattern'] } {
  // Solo cuentan eventos de registros que no están EXCLUDED.
  const relevantes = records.filter(r => r.identity_resolution !== 'EXCLUDED');
  const byEvent = new Map<string, EvidenceRecord[]>();
  for (const r of relevantes) {
    if (!byEvent.has(r.event_key)) byEvent.set(r.event_key, []);
    byEvent.get(r.event_key)!.push(r);
  }
  // corroboración cruzada: nº de source_types distintos por evento
  for (const [, recs] of byEvent) {
    const srcs = new Set(recs.map(r => r.source_type)).size;
    recs.forEach(r => { r.cross_source_corroboration = srcs; });
  }
  const distinct = byEvent.size;
  const repeat_pattern = distinct === 0 ? 'NONE' : distinct === 1
    ? (relevantes.length > 1 ? 'MULTIPLE_SAME_EVENT' : 'NONE')
    : 'REPEAT_DISTINCT';
  return { distinct_event_count: distinct, repeat_pattern };
}

// ─── Capa 5 — Risk Aggregation V1 (explicable, config-driven) ────────────────────
function scoreRecord(r: EvidenceRecord): number {
  const c = ACTIVE_CONFIG.risk;
  let s = 0;
  s += c.identity[r.identity_resolution] ?? 0;
  s += c.evidence[r.evidence_strength] ?? 0;
  s += c.severity[r.provider_severity] ?? 0;
  s += c.status[r.legal_status] ?? c.status.UNKNOWN;
  s += c.recency[r.recency_band] ?? c.recency.UNKNOWN;
  return Math.max(0, s);
}

function aggregateRisk(records: EvidenceRecord[], distinctEvents: number): {
  criminal_risk: CriminalRisk; risk_score: number; risk_factors: string[]; risk_reason_codes: string[];
} {
  const c = ACTIVE_CONFIG.risk;
  const usable = records.filter(r => r.identity_resolution === 'CONFIRMED' || r.identity_resolution === 'PROBABLE');
  const factors: string[] = []; const codes: string[] = [];
  if (!usable.length) {
    // Sin identidad confirmada/probable: no hay riesgo criminal atribuible al cliente.
    const anyHit = records.length > 0;
    if (anyHit) codes.push('NO_CONFIRMED_IDENTITY');
    return { criminal_risk: anyHit ? 'UNKNOWN' : 'LOW', risk_score: 0, risk_factors: factors, risk_reason_codes: codes };
  }
  usable.forEach(r => { r.record_risk = scoreRecord(r); });
  // El riesgo del cliente parte del MÁXIMO riesgo confirmado (no suma ciega).
  let score = Math.max(...usable.map(r => r.record_risk ?? 0));
  // Recurrencia de eventos distintos suma controlada.
  if (distinctEvents > 1) { score += c.recurrenceDistinct; factors.push(`RECURRENCE_${distinctEvents}`); codes.push('REPEAT_DISTINCT'); }

  const top = usable.reduce((a, b) => (b.record_risk ?? 0) > (a.record_risk ?? 0) ? b : a);
  if (top.serious_criminal_group) { factors.push('SERIOUS_CRIMINAL_GROUP'); codes.push('SERIOUS_CRIMINAL_GROUP'); }
  if (top.provider_severity !== 'UNKNOWN') factors.push(`SEVERITY_${top.provider_severity}`);
  if (top.evidence_type) factors.push(`EVIDENCE_${top.evidence_type}`);
  if (top.identity_resolution === 'CONFIRMED') codes.push('ID_CONFIRMED_DOC_EXACT');
  else codes.push('ID_PROBABLE');
  if (records.some(r => r.detail_required)) codes.push('DETAIL_REQUIRED');

  const b = c.bands;
  const criminal_risk: CriminalRisk =
    score <= b.low ? 'LOW' : score <= b.medium ? 'MEDIUM' : score <= b.high ? 'HIGH' : 'CRITICAL';
  return { criminal_risk, risk_score: score, risk_factors: factors, risk_reason_codes: codes };
}

// ─── Capa 6 — Recomendación (separada de LEGAL_POLICY_RESULT; sin AUTO_REJECT) ────
function recommend(criminal: CriminalRisk, legalPolicyResult?: string): CriminalRecommendation {
  if (legalPolicyResult === 'REVIEW_CRITICAL' || criminal === 'CRITICAL') return 'PRIORITY_REVIEW';
  if (legalPolicyResult === 'REVIEW_WARNING' || criminal === 'HIGH' || legalPolicyResult === 'MANUAL_REVIEW') return 'REVIEW';
  return 'RELEASE_UNDER_CURRENT_POLICY';
}

// ─── Orquestación ────────────────────────────────────────────────────────────────
const SEV_ORDER: Record<ProviderSeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

export function analyzeCriminalProfile(
  result: RawResult,
  query: { nombre: string; documento: string },
  legalPolicyResult?: string,
): CriminalProfileOutcome {
  ACTIVE_CONFIG = getCriminalConfig();   // config activa (editable, aplica a esta corrida)
  const records = buildEvidenceRecords(result, query.nombre, query.documento);
  const { distinct_event_count, repeat_pattern } = dedupAndCorroborate(records);
  const { criminal_risk, risk_score, risk_factors, risk_reason_codes } = aggregateRisk(records, distinct_event_count);

  const identity_summary: Record<IdentityResolution, number> = { CONFIRMED: 0, PROBABLE: 0, UNRESOLVED: 0, EXCLUDED: 0 };
  for (const r of records) identity_summary[r.identity_resolution]++;

  const notExcluded = records.filter(r => r.identity_resolution !== 'EXCLUDED');
  const serious_criminal_group = notExcluded.some(r => r.serious_criminal_group);
  const provider_severity_max = notExcluded.reduce<ProviderSeverity>(
    (acc, r) => SEV_ORDER[r.provider_severity] > SEV_ORDER[acc] ? r.provider_severity : acc, 'UNKNOWN');

  return {
    version: CRIMINAL_MODEL_VERSION, records, identity_summary, distinct_event_count, repeat_pattern,
    serious_criminal_group, provider_severity_max, criminal_risk, risk_score, risk_factors, risk_reason_codes,
    recommendation: recommend(criminal_risk, legalPolicyResult),
  };
}

// Metadatos de presentación (UI/export).
export const CRIMINAL_RISK_META: Record<CriminalRisk, { label: string; hex: string; emoji: string }> = {
  CRITICAL: { label: 'Crítico', hex: '#dc2626', emoji: '🔴' },
  HIGH: { label: 'Alto', hex: '#ea580c', emoji: '🟠' },
  MEDIUM: { label: 'Medio', hex: '#ca8a04', emoji: '🟡' },
  LOW: { label: 'Bajo', hex: '#16a34a', emoji: '🟢' },
  UNKNOWN: { label: 'Desconocido', hex: '#64748b', emoji: '⚪' },
};
