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

import { screenChileCriminal } from './lens360Service';
import { screenColombia } from './casosCriminalService';
import type { Coincidencia } from './casosCriminalService';
import type { RemesaRow } from './remesasService';

const REGCHEQ_BASE = 'https://external-api.regcheq.com';
const REGCHEQ_KEY = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

export type FlujoRemesa = 'CL' | 'CO' | 'INTL';
export type EstadoRemesaScreening = 'ok' | 'sin_causas' | 'error' | 'na';

// Una lista de Regcheq con coincidencia (lo que importa en el flujo internacional).
export interface ListaCoincidencia {
  clave: string;      // key cruda de la API
  lista: string;      // nombre legible
  riesgo?: string;    // nivel que reporta Regcheq
  detalle?: string;   // resumen del match
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
};

const etiqueta = (k: string): string => ETIQUETA_LISTA[k] ?? k;

// Las causas penales se tratan aparte (tienen su propio motor), no como "lista".
const NO_ES_LISTA = new Set(['causasPenalesRegcheq']);

const limpiar = (v: unknown): string => String(v ?? '').trim();
const normalizar = (v: string): string =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// País del beneficiario → flujo de screening.
export function flujoDeBeneficiario(row: Pick<RemesaRow, 'beneficiary_country_name' | 'beneficiary_dni_type'>): FlujoRemesa {
  const pais = normalizar(limpiar(row?.beneficiary_country_name));
  const tipoDni = normalizar(limpiar(row?.beneficiary_dni_type));
  if (/chile/.test(pais) || pais === 'cl' || tipoDni === 'rut') return 'CL';
  if (/colombia/.test(pais) || pais === 'co') return 'CO';
  return 'INTL';
}

// Nombre completo del beneficiario (la API internacional busca por nombre).
export function nombreBeneficiario(row: Partial<RemesaRow>): string {
  const compuesto = [row?.beneficiary_first_name, row?.beneficiary_last_name]
    .map(limpiar).filter(Boolean).join(' ');
  return limpiar(row?.beneficiary_name) || compuesto;
}

// ── Flujo internacional: Regcheq solo por nombre ─────────────────────────────
// Crea/actualiza la ficha con el nombre y la nacionalidad y devuelve las listas
// que dieron coincidencia. Sin catálogo: no concluye, solo reporta.
async function screenInternacional(nombre: string, dni: string, nacionalidad: string): Promise<RemesaScreening> {
  const base: RemesaScreening = {
    estado: 'error', flujo: 'INTL', fuente: 'Regcheq', decision: '—',
    delitosUnicos: 0, coincidencias: [], listas: [],
  };
  if (!REGCHEQ_KEY) return { ...base, mensaje: 'Falta la key de Regcheq' };
  if (!nombre) return { ...base, estado: 'na', mensaje: 'El beneficiario no tiene nombre' };

  // Sin DNI utilizable se usa el nombre como referencia de la ficha.
  const ref = dni.replace(/[.\s-]/g, '').toUpperCase() || nombre.replace(/\s+/g, '_').toUpperCase();

  try {
    await fetch(`${REGCHEQ_BASE}/record/${REGCHEQ_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dni: ref, personType: 'natural',
        name: nombre.toUpperCase(),
        ...(nacionalidad ? { nationality: nacionalidad } : {}),
      }),
    });
  } catch { /* si ya existe, la API responde 400: se consulta igual */ }

  let perfil: Record<string, unknown>;
  try {
    let resp = await fetch(`${REGCHEQ_BASE}/record/${ref}/${REGCHEQ_KEY}`);
    if (resp.status === 404) {   // la ficha recién creada tarda en indexarse
      await new Promise(r => setTimeout(r, 1500));
      resp = await fetch(`${REGCHEQ_BASE}/record/${ref}/${REGCHEQ_KEY}`);
    }
    if (!resp.ok) return { ...base, mensaje: `Regcheq ${resp.status}` };
    perfil = await resp.json();
  } catch (e) {
    return { ...base, mensaje: e instanceof Error ? e.message : String(e) };
  }

  const listasRaw = (perfil.listas ?? {}) as Record<string, Record<string, unknown>>;
  const listas: ListaCoincidencia[] = [];
  for (const [clave, entrada] of Object.entries(listasRaw)) {
    if (NO_ES_LISTA.has(clave) || !entrada?.coincidence) continue;
    const data = entrada.data as Record<string, unknown> | unknown[] | undefined;
    const detalle = Array.isArray(data)
      ? `${data.length} coincidencia(s)`
      : limpiar((data as Record<string, unknown>)?.['name'] ?? (data as Record<string, unknown>)?.['description']) || undefined;
    listas.push({ clave, lista: etiqueta(clave), riesgo: limpiar(entrada.risk) || undefined, detalle });
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
        listas: [], mensaje: r.mensaje,
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

    return await screenInternacional(nombre, dni, limpiar(row?.beneficiary_country_name));
  } catch (e) {
    return {
      estado: 'error', flujo,
      fuente: flujo === 'CO' ? 'Inspektor' : 'Regcheq',
      decision: '—', delitosUnicos: 0, coincidencias: [], listas: [],
      mensaje: e instanceof Error ? e.message : String(e),
    };
  }
}
