// Screening criminal EN VIVO de la cola de casos, enrutado por el campo "País":
//   Chile    → Regcheq (reusa lens360Service.screenChileCriminal)
//   Colombia → Inspektor + modelo criminal Colombia (Capas 1-6) vía Worker
// Devuelve, para cada caso, la cantidad de delitos únicos y la conclusión.

import { screenChileCriminal } from './lens360Service';
import { evaluarColombia } from './colombiaCatalogo';
import { evaluateLegalPolicy } from './legalPolicyGate';
import { analyzeCriminalProfile, type RawResult as CriminalInput } from './colombiaCriminalModel';

// Inspektor por el Worker (evita CORS), igual que InspektorColombia.
const INSPEKTOR_DIRECT = 'https://inspektor.datalaft.com:2121/api';
const INSPEKTOR_PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');
const INSPEKTOR_BASE = INSPEKTOR_PROXY ? `${INSPEKTOR_PROXY}/inspektor` : INSPEKTOR_DIRECT;
const INSPEKTOR_USER = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_USER ?? 'WS_Global81';
const INSPEKTOR_PASS = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_PASS ?? 'Risk5397#0ft';

export type ScreeningEstado = 'ok' | 'sin_causas' | 'error' | 'na';

// Coincidencia / delito detectado (forma unificada Chile + Colombia).
export interface Coincidencia {
  tipo: string;       // delito / tipo de evidencia
  detalle: string;    // descripción / RUC
  estado?: string;
  fecha?: string;
  fuente?: string;    // tribunal (Chile) / provider (Colombia)
  riesgo?: string;
}

export interface CasoScreening {
  estado: ScreeningEstado;
  fuente: 'Regcheq' | 'Inspektor' | '—';
  delitosUnicos: number;
  decision: string;   // conclusión
  razon: string;
  coincidencias: Coincidencia[];
  pep?: boolean;      // ¿PEP? (hoy desde Regcheq/Chile)
  // Coincidencias en listas que NO entran en la conclusión (OFAC, GAFI, ONU…).
  // El catálogo de Chile concluye solo con causas penales + PEP; estas se
  // reportan aparte para que el analista las vea.
  otrasListas?: Array<{ clave: string; lista: string; riesgo?: string }>;
  mensaje?: string;
}

// ¿El valor parece un email? (los payloads a veces traen el correo en "Apellido").
const pareceEmail = (v: string): boolean => /@/.test(v);

interface CasoMin { datos?: Record<string, unknown>; pais?: string }

const paisDe = (c: CasoMin): string => String((c.datos?.['País'] ?? c.pais ?? '')).trim();
const esChile = (p: string): boolean => /chile|^cl$/i.test(p);
const esColombia = (p: string): boolean => /colombia|^co$/i.test(p);

// ¿El caso se puede screenear hoy? (Chile o Colombia). El resto → "na".
export const esScreenable = (c: CasoMin): boolean => {
  const p = paisDe(c);
  return esChile(p) || esColombia(p);
};

// Etiqueta en español de la recomendación del modelo Colombia.
const RECO_LABEL: Record<string, string> = {
  RELEASE_UNDER_CURRENT_POLICY: 'Liberar',
  REVIEW: 'Revisar',
  PRIORITY_REVIEW: 'Revisión prioritaria',
};

async function inspektorLogin(): Promise<string> {
  const resp = await fetch(`${INSPEKTOR_BASE}/Auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: INSPEKTOR_USER, password: INSPEKTOR_PASS }),
  });
  if (!resp.ok) throw new Error(`Login Inspektor ${resp.status}`);
  return ((await resp.json()) as { token: { access_token: string } }).token.access_token;
}

export async function screenColombia(nombre: string, dni: string, tipoDocumento: number): Promise<CasoScreening> {
  const token = await inspektorLogin();
  const resp = await fetch(`${INSPEKTOR_BASE}/ConsultaPrincipal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre, identificacion: dni, tipoDocumento,
      tienePrioridad_4: true, cantidadPalabras: '3',
      procuraduria: true, ramaJudicial: true, ramaJEPMS: true,
    }),
  });
  if (!resp.ok) throw new Error(`Consulta Inspektor ${resp.status}`);
  const data = (await resp.json()) as Record<string, unknown> & {
    listas?: unknown[]; listas_propias?: unknown[]; ramaJudicialJEPMS?: unknown;
  };

  const listItems = [...(data.listas ?? []), ...(data.listas_propias ?? [])] as Record<string, unknown>[];
  const jepmsRaw = data.ramaJudicialJEPMS as { data?: unknown[] } | unknown[] | undefined;
  const jepmsArr = Array.isArray(jepmsRaw) ? jepmsRaw : Array.isArray(jepmsRaw?.data) ? jepmsRaw.data : [];
  const jepmsIds = jepmsArr.map(j => String((j as Record<string, unknown>)?.['identificationNumberResult'] ?? ''));
  const dniN = dni.replace(/[.\s-]/g, '').toUpperCase();

  const gate = evaluateLegalPolicy(listItems, jepmsIds, dniN);
  const outcome = analyzeCriminalProfile(data as unknown as CriminalInput, { nombre, documento: dni }, gate.result ?? undefined);

  const coincidencias: Coincidencia[] = (outcome.records ?? []).map(r => ({
    tipo: r.evidence_type || 'Coincidencia',
    detalle: r.raw_offense || r.raw_description || r.provider_category || '—',
    estado: r.legal_status || r.evidence_status || undefined,
    fecha: r.event_date || undefined,
    fuente: r.provider_source || undefined,
    riesgo: r.provider_severity || undefined,
  }));

  // Catálogo de Colombia: clasifica las coincidencias, descarta lo que no es
  // antecedente penal y concluye con la MISMA tabla de decisión que Chile.
  //
  // Esto reemplaza la recomendación del proveedor como conclusión. Motivo: esa
  // recomendación contaba como evidencia criminal cosas que no lo son (personas
  // desaparecidas, cadáveres en medicina legal, funcionarios públicos, procesos
  // civiles) y por eso el 95% de los casos caía en "Revisar" y casi nada
  // liberaba. Medido sobre la cola real: 69% de las coincidencias era ruido.
  //
  // Además el vocabulario del catálogo (Liberar / UNDER_COMPLIANCE_REVIEW /
  // Fully Blocked) es el que entiende el flujo automático, así que Colombia pasa
  // a ser automatizable igual que Chile.
  const cat = evaluarColombia(coincidencias);

  // Lo excluido se reporta aparte, agrupado, para que el analista lo vea.
  const porEtiqueta = new Map<string, number>();
  for (const e of cat.excluidas) porEtiqueta.set(e.etiqueta, (porEtiqueta.get(e.etiqueta) ?? 0) + 1);
  if (cat.indeterminadas.length) porEtiqueta.set('Sin clasificar', cat.indeterminadas.length);
  const otrasListas = [...porEtiqueta.entries()].map(([lista, n]) => ({
    clave: lista, lista: `${lista} (${n})`,
  }));

  return {
    estado: cat.penales.length > 0 ? 'ok' : 'sin_causas',
    fuente: 'Inspektor',
    delitosUnicos: cat.precedentes + cat.noPrecedentes,   // eventos únicos, no menciones
    decision: cat.decision,
    // Se conserva la lectura del proveedor como contexto, no como conclusión.
    razon: [cat.razon, (outcome.risk_factors ?? []).join('; '),
      `proveedor: ${RECO_LABEL[outcome.recommendation] ?? outcome.recommendation}`]
      .filter(Boolean).join(' · '),
    coincidencias: cat.penales.map(p => ({
      tipo: p.etiqueta,
      detalle: p.texto,
      riesgo: p.riesgoG66,
      fuente: 'Inspektor',
    })) as Coincidencia[],
    otrasListas,
  };
}

// Screening de UN caso, según su país. No lanza: los errores vuelven como estado 'error'.
export async function screenCaso(caso: CasoMin): Promise<CasoScreening> {
  const pais = paisDe(caso);
  const dni = String(caso.datos?.['Número de DNI'] ?? '');
  // Nombre: descarta correos (a veces vienen en "Apellido") para no ensuciar Inspektor.
  const rawNombre = `${caso.datos?.['Nombre'] ?? ''} ${caso.datos?.['Apellido'] ?? ''}`.trim();
  const nombre = pareceEmail(rawNombre) ? '' : rawNombre;
  try {
    if (esChile(pais)) {
      const r = await screenChileCriminal(dni, nombre);
      const coincidencias: Coincidencia[] = (r.crimes ?? []).map(c => ({
        tipo: c.crimen || 'Causa penal',
        detalle: c.ruc ? `RUC ${c.ruc}` : (c.crimen || '—'),
        estado: c.estado || undefined,
        fecha: c.fecha || undefined,
        fuente: c.tribunal || undefined,
        riesgo: undefined,
      }));
      return { estado: r.estado, fuente: 'Regcheq', delitosUnicos: r.delitosUnicos, decision: r.decision, razon: r.razon, coincidencias, pep: r.pep, otrasListas: r.otrasListas, mensaje: r.mensaje };
    }
    if (esColombia(pais)) {
      const tipo = String(caso.datos?.['Tipo de DNI'] ?? '');
      const tipoDocumento = /NIT/i.test(tipo) ? 3 : 1; // 3 = NIT (jurídica); 1 = cédula
      return await screenColombia(nombre, dni, tipoDocumento);
    }
    return { estado: 'na', fuente: '—', delitosUnicos: 0, decision: '', razon: '', coincidencias: [] };
  } catch (e) {
    return { estado: 'error', fuente: esChile(pais) ? 'Regcheq' : 'Inspektor', delitosUnicos: 0, decision: '', razon: '', coincidencias: [], mensaje: e instanceof Error ? e.message : String(e) };
  }
}

// Ejecuta `worker` sobre los items con concurrencia limitada (para no disparar
// cientos de llamadas a Regcheq/Inspektor de golpe cuando la cola trae muchos casos).
export async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 4): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  });
  await Promise.all(runners);
}
