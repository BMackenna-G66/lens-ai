// Servicio de la Vista 360° — consulta EN VIVO (sin persistencia).
// Autocontenido: replica las llamadas a Regcheq e Inspektor y reutiliza el
// motor de decisión criminal (DEFAULT_CATALOG) para no tocar los módulos existentes.

import { DEFAULT_CATALOG } from './defaultCatalogData';
import {
  Lens360Result, Lens360ListHit, Lens360Crime,
  Lens360CriminalDecision, Lens360InspektorHit, Lens360Verdict, Lens360PersonType,
} from '../types/lens360';

// ─── Config (mismas fuentes que RegcheqTool / InspektorColombia) ────────────────
const REGCHEQ_BASE = 'https://external-api.regcheq.com';
const REGCHEQ_KEY  = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

const INSPEKTOR_BASE = 'https://inspektor.datalaft.com:2121/api';
const INSPEKTOR_USER = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_USER ?? 'WS_Global81';
const INSPEKTOR_PASS = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_PASS ?? 'Risk5397#0ft';

// Mapa de claves de lista → nombre visible (subconjunto del usado en RegcheqTool).
const NOMBRE_LISTA: Record<string, string> = {
  pepChile: 'PEP Chile', interpol: 'INTERPOL', ofac: 'OFAC', un: 'ONU',
  eu: 'Unión Europea', rtp: 'RTP / PDI', causasPenalesRegcheq: 'Causas Penales Chile',
  pdi: 'PDI Chile', gafi: 'GAFI', screeningGlobal: 'Screening Global',
  interestList: 'Lista de Interés', internationalOrganizations: 'Organismos Internacionales',
  ofacAddressResult: 'OFAC Domicilio', rtpResult: 'RTP / PDI', pdiResult: 'PDI Chile',
  gafiResult: 'GAFI', internList: 'Lista Interna', regcheqList: 'Lista Regcheq',
};

// Listas que, ante coincidencia, elevan el riesgo a ALTO automáticamente.
const SANCTION_LISTS = new Set([
  'OFAC', 'ONU', 'INTERPOL', 'Unión Europea', 'Organismos Internacionales', 'OFAC Domicilio',
]);

export const hasRegcheqKey = (): boolean => !!REGCHEQ_KEY;

// ─── Motor de decisión criminal (mismo cálculo que RegcheqTool) ─────────────────
function computeCriminalDecision(additionalData: Record<string, unknown>[]): Lens360CriminalDecision | undefined {
  if (!additionalData || additionalData.length === 0) return undefined;
  const catalog = DEFAULT_CATALOG;
  if (!catalog.items.length || !catalog.decisionTable.length) return undefined;

  const catalogMap = new Map(catalog.items.map(i => [i.nombre.toLowerCase(), i]));
  let scoreTotal = 0;
  for (const crime of additionalData) {
    const nombre = String(crime['crimen'] ?? crime['Crimen'] ?? crime['delito'] ?? '').toLowerCase().trim();
    if (!nombre) continue;
    const match = catalogMap.get(nombre);
    if (match) scoreTotal += match.valor;
  }

  const sorted = [...catalog.decisionTable].sort((a, b) => b.totalEquivalente - a.totalEquivalente);
  const rule = sorted.find(r => scoreTotal >= r.totalEquivalente);
  if (!rule) return undefined;
  return { decision: rule.decision, razon: rule.razon, totalEquivalente: scoreTotal };
}

// ─── Regcheq (GET /record/{dni}/{key}) ──────────────────────────────────────────
async function fetchRegcheq(rut: string) {
  const resp = await fetch(`${REGCHEQ_BASE}/record/${rut}/${REGCHEQ_KEY}`);
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  const perfil = await resp.json();

  const listasRaw = (perfil.listas ?? {}) as Record<string, Record<string, unknown>>;
  // Smart-merge: si dos claves comparten nombre visible, gana la que tiene coincidencia.
  const merged = new Map<string, Lens360ListHit>();
  for (const [clave, nombre] of Object.entries(NOMBRE_LISTA)) {
    const entry = listasRaw[clave];
    if (!entry) continue;
    const hit: Lens360ListHit = { nombre, coincidence: Boolean(entry.coincidence), risk: String(entry.risk ?? '') };
    const existing = merged.get(nombre);
    if (!existing || (hit.coincidence && !existing.coincidence)) merged.set(nombre, hit);
  }
  const amlHits = [...merged.values()];

  // Causas Penales Chile → crímenes + decisión criminal
  const causas = listasRaw['causasPenalesRegcheq'];
  let crimes: Lens360Crime[] = [];
  let criminalDecision: Lens360CriminalDecision | undefined;
  if (causas?.coincidence && causas.data) {
    const raw = causas.data as Record<string, unknown>;
    const additionalData = Array.isArray(raw['additionalData']) ? (raw['additionalData'] as Record<string, unknown>[]) : [];
    crimes = additionalData.map(c => ({
      crimen:   String(c['crimen'] ?? c['Crimen'] ?? c['delito'] ?? '—'),
      estado:   c['estado']   ? String(c['estado'])   : undefined,
      fecha:    c['fecha']    ? String(c['fecha'])    : undefined,
      tribunal: c['tribunal'] ? String(c['tribunal']) : undefined,
      ruc:      c['ruc']      ? String(c['ruc'])      : undefined,
    }));
    criminalDecision = computeCriminalDecision(additionalData);
  }

  return {
    nombre: (perfil.name ?? perfil.socialReason ?? '') as string,
    personType: String(perfil.personType ?? ''),
    regcheqRisk: (perfil.effectiveRisk ?? perfil.calculatedRisk ?? '') as string,
    pepLevel: (perfil.pepLevel ?? '') as string,
    amlHits, crimes, criminalDecision,
  };
}

// ─── Inspektor (login + ConsultaPrincipal) ──────────────────────────────────────
async function fetchInspektor(nombre: string, identificacion: string, tipoDocumento: number) {
  const login = await fetch(`${INSPEKTOR_BASE}/Auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: INSPEKTOR_USER, password: INSPEKTOR_PASS }),
  });
  if (!login.ok) throw new Error(`Login Inspektor ${login.status}`);
  const token = ((await login.json()) as { token: { access_token: string } }).token.access_token;

  const resp = await fetch(`${INSPEKTOR_BASE}/ConsultaPrincipal`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre, identificacion, tipoDocumento,
      tienePrioridad_4: true, cantidadPalabras: '3',
      procuraduria: true, ramaJudicial: true, ramaJEPMS: true,
    }),
  });
  if (!resp.ok) throw new Error(`Consulta Inspektor ${resp.status}`);
  const data = (await resp.json()) as { cantCoincidencias?: number; listas?: Record<string, unknown>[]; listas_propias?: Record<string, unknown>[] };

  const lists = [...(data.listas ?? []), ...(data.listas_propias ?? [])];
  const hits: Lens360InspektorHit[] = lists.map(item => ({
    grupo: String(item['nombreGrupoLista'] ?? item['grupoLista'] ?? item['grupo'] ?? item['categoria'] ?? item['tipoLista'] ?? '—'),
    detalle: String(item['nombreCompleto'] ?? item['name'] ?? item['nombre'] ?? ''),
  }));
  return { coincidencias: data.cantCoincidencias ?? hits.length, hits };
}

// ─── Consolidación del veredicto ────────────────────────────────────────────────
const ORDER: Record<Lens360Verdict, number> = { SIN_DATOS: 0, BAJO: 1, MEDIO: 2, ALTO: 3 };

function computeVerdict(r: Lens360Result): void {
  const reasons: string[] = [];
  let level: Lens360Verdict = 'BAJO';
  const bump = (lvl: Lens360Verdict) => { if (ORDER[lvl] > ORDER[level]) level = lvl; };

  const sanctionHits = r.amlHits.filter(h => h.coincidence && SANCTION_LISTS.has(h.nombre));
  if (sanctionHits.length) { bump('ALTO'); reasons.push(`Coincidencia en listas de sanción: ${sanctionHits.map(h => h.nombre).join(', ')}`); }

  if (r.pepLevel && r.pepLevel.trim() && !['none', 'no', 'n/a'].includes(r.pepLevel.toLowerCase())) {
    bump('MEDIO'); reasons.push(`Persona Expuesta Políticamente (PEP): ${r.pepLevel}`);
  }

  if (r.criminalDecision) {
    const d = r.criminalDecision.decision.toUpperCase();
    if (/BLOQ|FORZAR/.test(d)) { bump('ALTO'); reasons.push(`Decisión penal: ${r.criminalDecision.decision}`); }
    else if (/REVIS|UCR|COMPLIANCE/.test(d)) { bump('MEDIO'); reasons.push(`Decisión penal: ${r.criminalDecision.decision}`); }
  } else if (r.crimes.length) {
    bump('MEDIO'); reasons.push(`${r.crimes.length} causa(s) penal(es) registrada(s)`);
  }

  const otherHits = r.amlHits.filter(h => h.coincidence && !SANCTION_LISTS.has(h.nombre) && h.nombre !== 'Causas Penales Chile');
  if (otherHits.length) { bump('MEDIO'); reasons.push(`Coincidencias en: ${otherHits.map(h => h.nombre).join(', ')}`); }

  if (r.inspektor && r.inspektor.coincidencias > 0) {
    bump('ALTO'); reasons.push(`Inspektor Colombia: ${r.inspektor.coincidencias} coincidencia(s)`);
  }

  if (r.regcheqRisk) {
    const rr = r.regcheqRisk.toUpperCase();
    if (rr.includes('HIGH') || rr.includes('ALTO')) bump('ALTO');
    else if (rr.includes('MEDIUM') || rr.includes('MEDIO')) bump('MEDIO');
  }

  if (!r.sources.regcheq && !r.sources.inspektor) {
    level = 'SIN_DATOS';
    reasons.push('No se obtuvo respuesta de ninguna fuente.');
  } else if (reasons.length === 0) {
    reasons.push('Sin coincidencias ni antecedentes detectados en las fuentes consultadas.');
  }

  r.verdict = level;
  r.verdictReasons = reasons;
}

// ─── Orquestador público ────────────────────────────────────────────────────────
export async function search360(params: {
  rut: string; nombre?: string; country: string; personType: Lens360PersonType;
}): Promise<Lens360Result> {
  const { rut, nombre = '', country, personType } = params;

  const result: Lens360Result = {
    rut, nombre: nombre || rut, personType, country,
    amlHits: [], crimes: [], verdict: 'SIN_DATOS', verdictReasons: [],
    sources: { regcheq: false, inspektor: false },
  };

  // 1) Regcheq (siempre): AML Chile + causas penales + decisión criminal
  try {
    const rc = await fetchRegcheq(rut);
    result.nombre = rc.nombre || result.nombre;
    result.personType = rc.personType || personType;
    result.regcheqRisk = rc.regcheqRisk;
    result.pepLevel = rc.pepLevel;
    result.amlHits = rc.amlHits;
    result.crimes = rc.crimes;
    result.criminalDecision = rc.criminalDecision;
    result.sources.regcheq = true;
  } catch (e) {
    result.verdictReasons.push(`Regcheq no disponible: ${(e as Error).message}`);
  }

  // 2) Inspektor (solo Colombia): screening AML/judicial CO
  if (country === 'CO') {
    try {
      const ins = await fetchInspektor(nombre || rut, rut, personType === 'legal' ? 3 : 1);
      result.inspektor = ins;
      result.sources.inspektor = true;
    } catch (e) {
      result.inspektor = { coincidencias: 0, hits: [], error: (e as Error).message };
    }
  }

  computeVerdict(result);
  return result;
}
