// Servicio de la Vista 360° — consulta EN VIVO (sin persistencia).
// Autocontenido: replica las llamadas a Regcheq e Inspektor y reutiliza el
// motor de decisión criminal (DEFAULT_CATALOG) para no tocar los módulos existentes.

import { DEFAULT_CATALOG } from './defaultCatalogData';
import { applyEvaluationToProfile } from './criminalDataProcessor';
import { CatalogData, PersonProfile, Crime } from '../types/criminalTypes';
import {
  Lens360Result, Lens360ListHit, Lens360Crime,
  Lens360CriminalDecision, Lens360InspektorHit, Lens360Verdict, Lens360PersonType, Lens360RelatedPerson,
  Lens360Tributaria,
} from '../types/lens360';
import { evaluateValidationRules } from './validationRules';
import { triggerSiiViaProxy, siiProxyDisponible } from './regcheqSii';

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

// ─── Catálogo criminal ──────────────────────────────────────────────────────────
// Usa el MISMO catálogo que el módulo Criminal Profiler (localStorage), con
// fallback al de fábrica. Así el 360 respeta los parámetros y la tabla de decisión
// que el usuario haya configurado.
const CATALOG_STORAGE_KEY = 'criminal_profile_catalog';
function loadCriminalCatalog(): CatalogData {
  try {
    const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (saved) return JSON.parse(saved) as CatalogData;
  } catch { /* JSON inválido → usar default */ }
  return DEFAULT_CATALOG;
}

// Lectura de campo tolerante a mayúsculas/variantes (la API en vivo usa DELITO, RUC…).
function pick(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  const lower = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real) { const v = obj[real]; if (v != null && String(v).trim()) return String(v).trim(); }
  }
  return '';
}

// Evalúa las causas penales con el motor real del Criminal Profiler.
// Devuelve los crímenes, la decisión (con conteo precedentes/no precedentes) y el
// PersonProfile completo (para la ficha detallada reutilizando ProfileDetails).
function evaluateCriminal(rut: string, nombre: string, additionalData: Record<string, unknown>[]): {
  crimes: Lens360Crime[]; decision?: Lens360CriminalDecision; profile?: PersonProfile;
} {
  const engineCrimes: Crime[] = additionalData.map((c, idx) => ({
    id:       pick(c, 'RUC', 'RIT') || `c${idx}`,
    tipo:     pick(c, 'Delito', 'delito', 'crimen', 'Crimen', 'crime'),
    estado:   pick(c, 'Estado', 'estado') || 'S/E',
    fecha:    pick(c, 'Fecha', 'FECHA_INGRESO', 'FECHA_CAMBIO_ESTADO', 'fecha'),
    riesgo:   pick(c, 'Riesgo Delito', 'Riesgo', 'riesgo') || 'N/A',
    rit:      pick(c, 'RIT', 'rit'),
    ruc:      pick(c, 'RUC', 'ruc'),
    tribunal: pick(c, 'Tribunal', 'tribunal'),
  })).filter(c => c.tipo && c.tipo !== '0');

  const crimes: Lens360Crime[] = engineCrimes.map(c => ({
    crimen: c.tipo,
    estado: c.estado !== 'S/E' ? c.estado : undefined,
    fecha: c.fecha || undefined,
    tribunal: c.tribunal || undefined,
    ruc: c.ruc || undefined,
  }));

  if (engineCrimes.length === 0) return { crimes };

  const [first = '', ...rest] = nombre.trim().split(/\s+/);
  const profile: PersonProfile = {
    rut, nombre: nombre ? first : rut, apellido: rest.join(' '),
    nombreCuenta: nombre || rut, customerId: rut,
    conInfo: true, isPep: false, crimes: engineCrimes,
    totalCrimes: engineCrimes.length, totalHighRiskCrimes: 0, highestRisk: 'n/a',
    status: 'Pendiente', selectedAction: '',
  };
  applyEvaluationToProfile(profile, loadCriminalCatalog());

  // Conteo precedentes / no precedentes.
  // OJO: "DELITOS NO PRECEDENTES" también contiene "PRECEDENTE", así que hay que
  // excluir explícitamente los "NO PRECEDENTE" antes de contar los precedentes.
  const cat = (c: Crime) => (c.catalogType || '').toUpperCase();
  const isNoPre = (c: Crime) => /NO[\s_]*PRECEDENTE/.test(cat(c));
  const isPre = (c: Crime) => !isNoPre(c) && cat(c).includes('PRECEDENTE');
  const precedentes = profile.crimes.filter(isPre);
  const noPrecedentes = profile.crimes.filter(isNoPre);
  const sum = (arr: Crime[]) => arr.reduce((s, c) => s + (c.catalogValue || 0), 0);

  const decision = profile.preEvaluation ? {
    decision: profile.preEvaluation.decision,
    razon: profile.preEvaluation.razon,
    totalEquivalente: profile.preEvaluation.scoreTotal,
    precedentes: precedentes.length,
    noPrecedentes: noPrecedentes.length,
    preScore: sum(precedentes),
    noPreScore: sum(noPrecedentes),
  } : undefined;

  return { crimes, decision, profile };
}

// ─── Regcheq (GET /record/{dni}/{key}) ──────────────────────────────────────────
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Crea/actualiza el registro en Regcheq (necesario si el RUT nunca fue consultado).
async function createRegcheqRecord(rut: string, nombre: string, personType: Lens360PersonType): Promise<void> {
  const body: Record<string, string> = { dni: rut, personType };
  if (nombre) {
    if (personType === 'legal') body.socialReason = nombre;
    else {
      // Nombre → name / fatherName (heurística simple: primer token = nombre, resto = apellidos)
      const parts = nombre.trim().split(/\s+/);
      body.name = (parts[0] ?? '').toUpperCase();
      if (parts.length > 1) body.fatherName = parts.slice(1).join(' ').toUpperCase();
    }
  }
  await fetch(`${REGCHEQ_BASE}/record/${REGCHEQ_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

// Crea/refresca el registro SIEMPRE antes de consultar — dispara el screening real
// (mismo efecto que marcar "crear ficha" en el módulo Regcheq). Sin este POST, el GET
// puede devolver un registro existente pero sin coincidencias, aunque sí las tenga.
async function fetchRegcheq(rut: string, nombre: string, personType: Lens360PersonType) {
  // Normaliza el RUT: sin puntos/guiones/espacios y dígito verificador en MAYÚSCULA
  // (Regcheq es sensible a la 'k'). Evita 404 por formato ("77139759k" vs "77139759K").
  const rutN = rut.replace(/[.\s-]/g, '').toUpperCase();
  const GET = `${REGCHEQ_BASE}/record/${rutN}/${REGCHEQ_KEY}`;
  // GET primero: si la ficha ya existe, la devuelve al instante (no se queda sin datos).
  let resp = await fetch(GET);
  if (resp.status === 404) {
    // No existe → crear/refrescar y reintentar hasta que se indexe.
    await createRegcheqRecord(rutN, nombre, personType);
    await sleep(1500); resp = await fetch(GET);
    if (resp.status === 404) { await sleep(2500); resp = await fetch(GET); }
  }
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  const perfil = await resp.json();

  // Si la ficha no trae situación tributaria, dispararla vía el Worker (equivale al
  // botón de la plataforma; la external-api no lo hace sola). Usa el _id como fichaId.
  const tieneSii = Object.keys((perfil.situacionTributaria ?? {}) as Record<string, unknown>).length > 0;
  if (!tieneSii && siiProxyDisponible()) {
    const fichaId = String(perfil._id ?? perfil.id ?? '');
    if (fichaId) {
      const sii = await triggerSiiViaProxy(fichaId, rutN, String(perfil.companyId ?? ''));
      if (sii) perfil.situacionTributaria = sii;
      else { // fallback: reconsultar tras el disparo
        await sleep(2500);
        try { const r = await fetch(GET); if (r.ok) { const p2 = await r.json(); if (Object.keys((p2.situacionTributaria ?? {})).length) perfil.situacionTributaria = p2.situacionTributaria; } } catch { /* ignore */ }
      }
    }
  }

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

  // Causas Penales Chile → crímenes + decisión criminal (motor real del Criminal Profiler)
  const causas = listasRaw['causasPenalesRegcheq'];
  let crimes: Lens360Crime[] = [];
  let criminalDecision: Lens360CriminalDecision | undefined;
  let criminalProfile: PersonProfile | undefined;
  const perfilNombre = (perfil.name ?? perfil.socialReason ?? nombre ?? '') as string;
  if (causas?.coincidence && causas.data) {
    const raw = causas.data as Record<string, unknown>;
    const additionalData = Array.isArray(raw['additionalData']) ? (raw['additionalData'] as Record<string, unknown>[]) : [];
    const evaluated = evaluateCriminal(rut, perfilNombre, additionalData);
    crimes = evaluated.crimes;
    criminalDecision = evaluated.decision;
    criminalProfile = evaluated.profile;
  }

  // Situación tributaria (SII) — misma respuesta, sin consulta extra.
  const sit = (perfil.situacionTributaria ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined) ? '' : String(v).trim();
  const boolStr = (v: unknown) => v === true ? 'Sí' : v === false ? 'No' : '';
  const actividades = (Array.isArray(sit['Activities']) ? (sit['Activities'] as Record<string, unknown>[]) : []).map(a => ({
    code: s(a['Code']), name: s(a['Name']), category: s(a['Category']),
    date: s(a['Date']), afectoIva: boolStr(a['SubjectToVAT']),
  }));
  const tributariaRaw: Lens360Tributaria = {
    rutContribuyente: s(sit['rut_contribuyente']),
    nombreSii: s(sit['Name']),
    presentaInicioActividades: boolStr(sit['presenta_inicio_actividades']),
    fechaInicioActividades: s(sit['fecha_inicio_actividades']),
    empresaMenorTamano: boolStr(sit['es_empresa_menor_tamano']),
    monedaExtranjera: boolStr(sit['autorizado_moneda_extranjera']),
    ultimaActualizacion: s(sit['ultima_actualizacion']),
    situacionesIrregulares: Array.isArray(sit['situaciones_irregulares']) ? (sit['situaciones_irregulares'] as string[]) : [],
    actividades,
  };
  // Solo si trae algo útil (evita mostrar la sección vacía para personas naturales).
  const hasTributaria = !!(tributariaRaw.rutContribuyente || tributariaRaw.nombreSii || tributariaRaw.fechaInicioActividades || actividades.length || tributariaRaw.situacionesIrregulares.length);
  const tributaria = hasTributaria ? tributariaRaw : undefined;

  // Personas relacionadas (representantes legales, beneficiarios finales, etc.)
  const related: Lens360RelatedPerson[] = ((perfil.personsRelations ?? []) as Record<string, unknown>[]).map(p => ({
    dni: String(p['dni'] ?? '').trim(),
    name: String(p['name'] ?? '').trim(),
    roles: Array.isArray(p['type']) ? (p['type'] as unknown[]).map(String) : (p['type'] ? [String(p['type'])] : []),
    percentage: typeof p['percentage'] === 'number' ? (p['percentage'] as number) : undefined,
    country: p['country'] ? String(p['country']) : undefined,
  })).filter(p => p.dni || p.name);

  return {
    nombre: perfilNombre,
    personType: String(perfil.personType ?? ''),
    regcheqRisk: (perfil.effectiveRisk ?? perfil.calculatedRisk ?? '') as string,
    pepLevel: (perfil.pepLevel ?? '') as string,
    amlHits, crimes, criminalDecision, criminalProfile, related, tributaria,
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

  // Antecedentes penales: si hay causas, SIEMPRE se reporta (con la decisión si existe).
  if (r.crimes.length > 0) {
    const d = (r.criminalDecision?.decision ?? '').toUpperCase();
    if (/BLOCK|BLOQ|FORZAR/.test(d)) bump('ALTO');
    else if (/REVIS|UCR|COMPLIANCE/.test(d)) bump('MEDIO');
    else bump('MEDIO'); // hay causas penales → al menos riesgo medio
    const decTxt = r.criminalDecision ? ` — decisión: ${r.criminalDecision.decision}` : '';
    reasons.push(`${r.crimes.length} causa(s) penal(es)${decTxt}`);
  }

  const otherHits = r.amlHits.filter(h => h.coincidence && !SANCTION_LISTS.has(h.nombre) && h.nombre !== 'Causas Penales Chile');
  if (otherHits.length) { bump('MEDIO'); reasons.push(`Coincidencias en: ${otherHits.map(h => h.nombre).join(', ')}`); }

  if (r.inspektor && r.inspektor.coincidencias > 0) {
    bump('ALTO'); reasons.push(`Inspektor Colombia: ${r.inspektor.coincidencias} coincidencia(s)`);
  }

  if (r.regcheqRisk) {
    const rr = r.regcheqRisk.toUpperCase();
    const isHigh = rr.includes('HIGH') || rr.includes('ALTO');
    const isMed = rr.includes('MEDIUM') || rr.includes('MEDIO');
    if (isHigh) bump('ALTO');
    else if (isMed) bump('MEDIO');
    if ((isHigh || isMed) && !reasons.some(x => x.includes('Regcheq'))) {
      reasons.push(`Riesgo calculado por Regcheq: ${r.regcheqRisk}`);
    }
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
    amlHits: [], crimes: [], related: [], verdict: 'SIN_DATOS', verdictReasons: [],
    sources: { regcheq: false, inspektor: false },
  };

  // 1) Regcheq (siempre): AML Chile + causas penales + decisión criminal
  try {
    const rc = await fetchRegcheq(rut, nombre, personType);
    result.nombre = rc.nombre || result.nombre;
    result.personType = rc.personType || personType;
    result.regcheqRisk = rc.regcheqRisk;
    result.pepLevel = rc.pepLevel;
    result.amlHits = rc.amlHits;
    result.crimes = rc.crimes;
    result.criminalDecision = rc.criminalDecision;
    result.criminalProfile = rc.criminalProfile;
    result.related = rc.related;
    result.tributaria = rc.tributaria;
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

  // Alertas del motor de reglas de validación (solo visual + PDF/Excel).
  result.alerts = evaluateValidationRules({
    regcheqRisk: result.regcheqRisk,
    pepLevel: result.pepLevel,
    amlHits: result.amlHits,
    tributaria: result.tributaria,
    penalCoincidencia: result.crimes.length > 0,
  });

  return result;
}
