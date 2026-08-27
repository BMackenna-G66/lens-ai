// Screening del BENEFICIARIO de una remesa (cola Remesa de la Bandeja).
//
// A diferencia de OFAC, acá no se screenea al cliente del caso sino a quien
// recibe la plata, y el flujo depende de su país:
//
//   · Chile     → Regcheq, mismo perfil criminal que usa OFAC (causas penales
//                 contra el catálogo de delitos + flag PEP).
//   · Colombia  → Inspektor, mismo modelo criminal de Colombia (Legal Policy
//                 Gate + capas), con las mismas conclusiones.
//   · Resto     → envío internacional: Regcheq **solo por nombre** contra las
//                 listas. No hay catálogo todavía, así que NO se concluye nada:
//                 se reporta EN QUÉ LISTAS coincide y de qué tipo, para que el
//                 analista lo revise.
//
// Reusa los motores ya probados de Chile y Colombia (no los reimplementa) y trae
// la lógica internacional del módulo Regcheq replicándola acá, sin tocarlo.

import { screenRemesaInternacional } from './remesaInternacionalCatalogo';
import { screenChileCriminal } from './lens360Service';
import { screenColombia } from './casosCriminalService';
import type { Coincidencia } from './casosCriminalService';
import type { RemesaRow } from './remesasService';

const REGCHEQ_BASE = 'https://external-api.regcheq.com';
const REGCHEQ_KEY = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

export type FlujoRemesa = 'CL' | 'CO' | 'INTL' | 'SIN_DATO';
export type EstadoRemesaScreening = 'ok' | 'sin_causas' | 'error' | 'na';

// Un match concreto dentro de una lista (Screening Global trae varios).
export interface HitLista {
  nombre?: string;
  tipos?: string[];       // adverse-media, sanction, pep, narcotics-aml-cft, …
  fuentes?: string[];
  score?: number;
  matchTypes?: string[];  // name_exact, name_fuzzy, …
}

// Una lista de Regcheq con coincidencia (lo que importa en el flujo internacional).
export interface ListaCoincidencia {
  clave: string;      // key cruda de la API
  lista: string;      // nombre legible
  riesgo?: string;    // nivel que reporta Regcheq
  detalle?: string;   // resumen del match
  // Screening Global devuelve los matches en additionalData.hits[]: nombre, tipos
  // (incluye cosas como narcotics-aml-cft), fuente y score. Sin esto la ficha
  // mostraba solo "Screening Global · medium" y se perdía TODO el contenido.
  hits?: HitLista[];
  totalHits?: number;
  estadoMatch?: string;   // match_status que reporta el proveedor
}

export interface RemesaScreening {
  estado: EstadoRemesaScreening;
  flujo: FlujoRemesa;
  fuente: 'Regcheq' | 'Inspektor' | '—';
  decision: string;            // conclusión (CL/CO) o resumen de listas (INTL)
  razon?: string;
  delitosUnicos: number;
  pep?: boolean;
  coincidencias: Coincidencia[];   // delitos/causas (CL y CO)
  listas: ListaCoincidencia[];     // listas con match (INTL)
  mensaje?: string;                // error legible
  // Trazabilidad del cruce internacional: con qué datos se consultó y qué se
  // encontró. Solo lo llena el camino INTL.
  cruceInternacional?: {
    porNombre: boolean; porDocumento: boolean; pais?: string;
    totalCoincidencias: number; nombreExacto: number; soloParciales: number;
    restrictivas: number; informativas: number;
  };
}

// Nombres legibles de las listas (replicado del módulo Regcheq).
const ETIQUETA_LISTA: Record<string, string> = {
  ofac: 'OFAC', onu: 'ONU', ue: 'Unión Europea', pep: 'PEP',
  rtp: 'RTP / PDI', rtpResult: 'RTP / PDI', pdi: 'PDI Chile', pdiResult: 'PDI Chile',
  gafi: 'GAFI', gafiResult: 'GAFI', screeningGlobal: 'Screening Global',
  interestList: 'Lista de Interés', internationalOrganizations: 'Organismos Internacionales',
  ofacAddressResult: 'OFAC Domicilio', bicResult: 'BIC', keywordsResult: 'Palabras Clave',
  riskComments: 'Comentarios de Riesgo', internList: 'Lista Interna',
  regcheqList: 'Lista Regcheq', causasPenalesRegcheq: 'Causas Penales Chile',
  // Faltaban: sin etiqueta la ficha mostraba la key cruda ("pepChile", etc.).
  pepChile: 'PEP Chile', funcPublicChile: 'Función Pública Chile',
  secondCriminalCasesChile: 'Causas Penales Chile',
};

const etiqueta = (k: string): string => ETIQUETA_LISTA[k] ?? k;

// Extrae el contenido real de una lista. Screening Global —la que importa en los
// envíos internacionales— guarda los matches en `additionalData.hits[]`; antes se
// buscaba `data.name`, que ahí no existe, así que la ficha mostraba la lista sin
// ningún detalle. El resto de las listas sí traen name/description.
function detalleDeLista(data: unknown): Pick<ListaCoincidencia, 'detalle' | 'hits' | 'totalHits' | 'estadoMatch'> {
  if (Array.isArray(data)) return { detalle: `${data.length} coincidencia(s)` };
  const d = (data ?? {}) as Record<string, unknown>;
  const ad = (d.additionalData ?? d) as Record<string, unknown>;
  const crudos = Array.isArray(ad.hits) ? (ad.hits as Record<string, unknown>[]) : null;

  if (crudos?.length) {
    const hits: HitLista[] = crudos.slice(0, 10).map(h => {   // top 10: puede traer 100
      const doc = (h.doc ?? {}) as Record<string, unknown>;
      return {
        nombre: limpiar(doc.name) || undefined,
        tipos: Array.isArray(doc.types) ? (doc.types as string[]) : undefined,
        fuentes: Array.isArray(doc.sources)
          ? (doc.sources as Array<Record<string, unknown> | string>).map(s => limpiar(typeof s === 'string' ? s : s?.name)).filter(Boolean)
          : undefined,
        score: typeof h.score === 'number' ? h.score : undefined,
        matchTypes: Array.isArray(h.match_types) ? (h.match_types as string[]) : undefined,
      };
    });
    const total = Number(ad.total_matches ?? ad.total_hits ?? crudos.length);
    return {
      detalle: `${total} coincidencia(s)`,
      hits, totalHits: total,
      estadoMatch: limpiar(ad.match_status) || undefined,
    };
  }

  const info = (d.info ?? {}) as Record<string, unknown>;
  return { detalle: limpiar(d.name ?? d.description ?? info.name) || undefined };
}

// Las causas penales se tratan aparte (tienen su propio motor), no como "lista".
const NO_ES_LISTA = new Set(['causasPenalesRegcheq', 'secondCriminalCasesChile']);

const limpiar = (v: unknown): string => String(v ?? '').trim();
const normalizar = (v: string): string =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// NACIONALIDAD del beneficiario → flujo de screening. Es lo único que decide:
//   Chile → CL · Colombia → CO · cualquier otra → INTL · vacía/nula → SIN_DATO
// SIN_DATO no se screenea: sin nacionalidad no se puede elegir proveedor, así que
// el caso queda marcado "Sin revisión" para que el analista lo mire.
export function flujoDeBeneficiario(row: Pick<RemesaRow, 'beneficiary_country_name'>): FlujoRemesa {
  const pais = normalizar(limpiar(row?.beneficiary_country_name));
  if (!pais || pais === 'null' || pais === 'n/a' || pais === '-') return 'SIN_DATO';
  if (/chile/.test(pais) || pais === 'cl' || pais === 'chl') return 'CL';
  if (/colombia/.test(pais) || pais === 'co' || pais === 'col') return 'CO';
  return 'INTL';
}

// Nombre completo del beneficiario (la API internacional busca por nombre).
export function nombreBeneficiario(row: Partial<RemesaRow>): string {
  const compuesto = [row?.beneficiary_first_name, row?.beneficiary_last_name]
    .map(limpiar).filter(Boolean).join(' ');
  return limpiar(row?.beneficiary_name) || compuesto;
}

// ── Camino viejo de internacional: Regcheq por ficha ────────────────────────
// YA NO SE USA para el flujo internacional. Se conserva a propósito, no por
// olvido: es la vía de rollback y sigue siendo válida para un beneficiario que
// tenga RUT chileno.
//
// Por qué se dejó de usar: Regcheq no busca por nombre, busca fichas, y valida
// el `dni` de la ficha como RUT chileno. Probado contra la API — pasaporte
// (`XX1234567`), dígitos sueltos, alfanumérico, el nombre con guiones bajos y un
// RUT con DV incorrecto devuelven todos `400 dni invalid-554`; un RUT válido
// devuelve 200 con `dniType: { country: "Chile", document: "RUT" }`.
//
// Con eso, el fallback de armar el `dni` desde el nombre no podía funcionar
// nunca. Medido sobre la cola: 7 de 9 internacionales abiertos quedaban en
// `estado: 'error'`, y eran exactamente los 7 sin documento.
//
// El reemplazo es `screenRemesaInternacional` en
// `services/remesaInternacionalCatalogo.ts`, que cruza por nombre completo.
export async function screenInternacional(nombre: string, dni: string, nacionalidad: string): Promise<RemesaScreening> {
  const base: RemesaScreening = {
    estado: 'error', flujo: 'INTL', fuente: 'Regcheq', decision: '—',
    delitosUnicos: 0, coincidencias: [], listas: [],
  };
  if (!REGCHEQ_KEY) return { ...base, mensaje: 'Falta la key de Regcheq' };
  if (!nombre) return { ...base, estado: 'na', mensaje: 'El beneficiario no tiene nombre' };

  // Sin DNI utilizable se usa el nombre como referencia de la ficha.
  const ref = dni.replace(/[.\s-]/g, '').toUpperCase() || nombre.replace(/\s+/g, '_').toUpperCase();

  // Se refresca la ficha SIEMPRE (si no, el GET devuelve lo que quedó guardado el
  // día que se creó). Pero si YA existe se manda solo el dni + su personType: con
  // el nombre, la API lo pisa partiéndolo en name/fatherName y destroza las
  // razones sociales. El nombre solo va cuando la ficha se crea de cero.
  let postEstado = 0;
  let postDetalle = '';
  try {
    let cuerpo: Record<string, string> = {
      dni: ref, personType: 'natural',
      name: nombre.toUpperCase(),
      ...(nacionalidad ? { nationality: nacionalidad } : {}),
    };
    const previa = await fetch(`${REGCHEQ_BASE}/record/${ref}/${REGCHEQ_KEY}`);
    if (previa.ok) {
      const p = await previa.json().catch(() => ({})) as { personType?: string };
      cuerpo = { dni: ref, personType: String(p.personType ?? 'natural') };
    }
    const post = await fetch(`${REGCHEQ_BASE}/record/${REGCHEQ_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    postEstado = post.status;
    if (!post.ok) postDetalle = (await post.text()).slice(0, 200);
  } catch (e) {
    postDetalle = e instanceof Error ? e.message : String(e);
  }

  // La ficha recién creada tarda en indexarse: se reintenta con esperas crecientes
  // (mismo criterio que el módulo Regcheq, que espera hasta ~3s).
  let perfil: Record<string, unknown> | null = null;
  let ultimoEstado = 0;
  for (const espera of [postEstado >= 200 && postEstado < 300 ? 1000 : 300, 2000, 3000]) {
    await new Promise(r => setTimeout(r, espera));
    try {
      const resp = await fetch(`${REGCHEQ_BASE}/record/${ref}/${REGCHEQ_KEY}`);
      ultimoEstado = resp.status;
      if (resp.ok) { perfil = await resp.json(); break; }
      if (resp.status !== 404) break;   // 404 = todavía no indexada; otro código no se reintenta
    } catch (e) {
      return { ...base, mensaje: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!perfil) {
    // Mensaje accionable: distingue "no se pudo crear la ficha" de "no se indexó".
    const motivo = postEstado && (postEstado < 200 || postEstado >= 300)
      ? `no se pudo crear la ficha en Regcheq (POST ${postEstado}${postDetalle ? `: ${postDetalle}` : ''})`
      : `la ficha no quedó disponible a tiempo (GET ${ultimoEstado})`;
    return { ...base, mensaje: `${motivo} · ref ${ref}` };
  }

  const listasRaw = (perfil.listas ?? {}) as Record<string, Record<string, unknown>>;
  const listas: ListaCoincidencia[] = [];
  for (const [clave, entrada] of Object.entries(listasRaw)) {
    if (NO_ES_LISTA.has(clave) || !entrada?.coincidence) continue;
    listas.push({
      clave, lista: etiqueta(clave),
      riesgo: limpiar(entrada.risk) || undefined,
      ...detalleDeLista(entrada.data),
    });
  }
  // Dedup por nombre legible (la API repite claves con alias: rtp / rtpResult).
  const vistas = new Set<string>();
  const unicas = listas.filter(l => (vistas.has(l.lista) ? false : (vistas.add(l.lista), true)));

  return {
    estado: unicas.length > 0 ? 'ok' : 'sin_causas',
    flujo: 'INTL', fuente: 'Regcheq',
    // Sin catálogo internacional: se describe el hallazgo, no se concluye.
    decision: unicas.length > 0 ? `${unicas.length} lista(s) con coincidencia` : 'Sin coincidencias',
    razon: unicas.map(l => l.lista).join(', '),
    delitosUnicos: 0, coincidencias: [], listas: unicas,
  };
}

// ── Entrada única ────────────────────────────────────────────────────────────
// Screening del beneficiario según su país. No lanza: los errores vuelven como
// estado 'error' con el mensaje.
export async function screenBeneficiario(row: RemesaRow): Promise<RemesaScreening> {
  const flujo = flujoDeBeneficiario(row);
  const nombre = nombreBeneficiario(row);
  const dni = limpiar(row?.beneficiary_dni);

  if (flujo === 'SIN_DATO') {
    return {
      estado: 'na', flujo, fuente: '—', decision: 'Sin revisión',
      delitosUnicos: 0, coincidencias: [], listas: [],
      mensaje: 'El beneficiario no trae nacionalidad: no se puede determinar el flujo.',
    };
  }

  try {
    if (flujo === 'CL') {
      const r = await screenChileCriminal(dni, nombre);
      return {
        estado: r.estado, flujo, fuente: 'Regcheq',
        decision: r.decision, razon: r.razon,
        delitosUnicos: r.delitosUnicos, pep: r.pep,
        coincidencias: (r.crimes ?? []).map(c => ({
          tipo: c.crimen || 'Causa penal',
          detalle: c.ruc || c.tribunal || '—',
          estado: c.estado, fecha: c.fecha, fuente: 'Regcheq',
        })) as Coincidencia[],
        // El catálogo de Chile concluye con causas penales + PEP, pero el
        // beneficiario puede coincidir en OFAC/GAFI/etc. sin tener causas: esas
        // listas se reportan igual para que el analista las vea.
        listas: (r.otrasListas ?? []).map(l => ({ clave: l.clave, lista: l.lista, riesgo: l.riesgo })),
        mensaje: r.mensaje,
      };
    }

    if (flujo === 'CO') {
      const tipo = normalizar(limpiar(row?.beneficiary_dni_type));
      const tipoDocumento = /nit/.test(tipo) ? 3 : 1;   // 3 = NIT (jurídica) · 1 = cédula
      const r = await screenColombia(nombre, dni, tipoDocumento);
      return {
        estado: r.estado === 'na' ? 'na' : r.estado, flujo, fuente: 'Inspektor',
        decision: r.decision, razon: r.razon, delitosUnicos: r.delitosUnicos,
        coincidencias: r.coincidencias, listas: [], mensaje: r.mensaje,
      };
    }

    // Internacional: cruce por NOMBRE COMPLETO con su catálogo propio. Ver el
    // comentario de `screenInternacional` para por qué ya no va por Regcheq.
    const r = await screenRemesaInternacional(nombre, dni, limpiar(row?.beneficiary_country_name));
    return {
      estado: r.estado, flujo: 'INTL', fuente: 'Inspektor',
      decision: r.decision, razon: r.razon,
      delitosUnicos: r.delitosUnicos,
      coincidencias: r.coincidencias,
      listas: r.listas.map(l => ({
        clave: l.clave,
        lista: l.informativa ? `${l.lista} (informativa)` : l.lista,
        riesgo: l.riesgo,
        detalle: l.matches > 1 ? `${l.detalle ?? '—'} · ${l.matches} coincidencias` : l.detalle,
      })),
      mensaje: r.mensaje,
      cruceInternacional: r.cruce,
    };
  } catch (e) {
    return {
      estado: 'error', flujo,
      fuente: flujo === 'CO' ? 'Inspektor' : 'Regcheq',
      decision: '—', delitosUnicos: 0, coincidencias: [], listas: [],
      mensaje: e instanceof Error ? e.message : String(e),
    };
  }
}
