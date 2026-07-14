// Enriquecimiento Regcheq para el Analizador de Documentos (individual y batch):
// dado un RUT, crea/refresca la ficha (para que no dé 404) y devuelve el screening
// AML + la situación tributaria (SII). Autocontenido; no toca el flujo del 360.

import { Lens360ListHit, Lens360Tributaria, RegcheqEnrichment } from '../types/lens360';

const REGCHEQ_BASE = 'https://external-api.regcheq.com';
const REGCHEQ_KEY = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

// Subconjunto de listas con nombre visible (mismo mapeo que RegcheqTool / 360).
const NOMBRE_LISTA: Record<string, string> = {
  pepChile: 'PEP Chile', interpol: 'INTERPOL', ofac: 'OFAC', un: 'ONU',
  eu: 'Unión Europea', rtp: 'RTP / PDI', causasPenalesRegcheq: 'Causas Penales Chile',
  pdi: 'PDI Chile', gafi: 'GAFI', screeningGlobal: 'Screening Global',
  interestList: 'Lista de Interés', internationalOrganizations: 'Organismos Internacionales',
  ofacAddressResult: 'OFAC Domicilio', rtpResult: 'RTP / PDI', pdiResult: 'PDI Chile',
  gafiResult: 'GAFI', internList: 'Lista Interna', regcheqList: 'Lista Regcheq',
};

export const hasRegcheqKey = (): boolean => !!REGCHEQ_KEY;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Crea/refresca la ficha en Regcheq (dispara el screening; evita el 404).
async function createRecord(rut: string, nombre: string): Promise<void> {
  const body: Record<string, string> = { dni: rut, personType: 'legal' };
  if (nombre) body.socialReason = nombre;
  await fetch(`${REGCHEQ_BASE}/record/${REGCHEQ_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

export async function fetchRegcheqEnrichment(rut: string, nombre = ''): Promise<RegcheqEnrichment> {
  const empty: RegcheqEnrichment = { consultado: true, encontrado: false, amlHits: [] };
  if (!REGCHEQ_KEY) return { ...empty, error: 'Falta VITE_REGCHEQ_API_KEY' };

  try {
    // Crear/refrescar primero → dispara el screening y la búsqueda del SII.
    await createRecord(rut, nombre);

    // El SII (situacionTributaria) se puebla de forma asíncrona en Regcheq: para una
    // ficha recién creada puede no estar listo en el primer GET. Reintentamos el GET
    // con esperas crecientes hasta que el SII aparezca (o se agoten los intentos).
    const delays = [1500, 2500, 3500, 4500];
    let perfil: Record<string, unknown> | null = null;
    for (let i = 0; i < delays.length; i++) {
      await sleep(delays[i]);
      const resp = await fetch(`${REGCHEQ_BASE}/record/${rut}/${REGCHEQ_KEY}`);
      if (resp.status === 404) continue; // aún no indexada
      if (!resp.ok) {
        if (i === delays.length - 1) return { ...empty, error: `API ${resp.status}: ${resp.statusText}` };
        continue;
      }
      perfil = await resp.json();
      const sitTmp = (perfil?.situacionTributaria ?? {}) as Record<string, unknown>;
      if (Object.keys(sitTmp).length > 0) break; // SII ya poblado → listo
    }
    if (!perfil) return { ...empty, error: 'Regcheq no devolvió la ficha (404).' };

    // Screening AML (smart-merge por nombre visible).
    const listasRaw = (perfil.listas ?? {}) as Record<string, Record<string, unknown>>;
    const merged = new Map<string, Lens360ListHit>();
    for (const [clave, nombreLista] of Object.entries(NOMBRE_LISTA)) {
      const entry = listasRaw[clave];
      if (!entry) continue;
      const hit: Lens360ListHit = { nombre: nombreLista, coincidence: Boolean(entry.coincidence), risk: String(entry.risk ?? '') };
      const existing = merged.get(nombreLista);
      if (!existing || (hit.coincidence && !existing.coincidence)) merged.set(nombreLista, hit);
    }
    const amlHits = [...merged.values()];

    // Situación tributaria (SII).
    const sit = (perfil.situacionTributaria ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (v === null || v === undefined) ? '' : String(v).trim();
    const boolStr = (v: unknown) => v === true ? 'Sí' : v === false ? 'No' : '';
    const actividades = (Array.isArray(sit['Activities']) ? (sit['Activities'] as Record<string, unknown>[]) : []).map(a => ({
      code: s(a['Code']), name: s(a['Name']), category: s(a['Category']), date: s(a['Date']), afectoIva: boolStr(a['SubjectToVAT']),
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
    const hasTributaria = !!(tributariaRaw.rutContribuyente || tributariaRaw.nombreSii || tributariaRaw.fechaInicioActividades || actividades.length || tributariaRaw.situacionesIrregulares.length);

    return {
      consultado: true,
      encontrado: true,
      nombre: (perfil.name ?? perfil.socialReason ?? nombre) as string,
      regcheqRisk: (perfil.effectiveRisk ?? perfil.calculatedRisk ?? '') as string,
      pepLevel: (perfil.pepLevel ?? '') as string,
      amlHits,
      tributaria: hasTributaria ? tributariaRaw : undefined,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}
