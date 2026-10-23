// Integración con el scraper de PJUD (contrato «Integración Scraper PJUD ↔
// LENS», Bautista, octubre 2026). Puro: lo usan el Lambda lens-flujo-autonomo,
// que encola, y la ficha de la Bandeja, que muestra el resultado.
//
// LENS y el scraper no se llaman por HTTP: se hablan por dos colecciones de
// Firestore, `scraper_casos` y `scraper_jobs`, que viven en una base aparte
// (`pjud`). El navegador NUNCA las toca: lo que escribe Lens lo escribe el
// Lambda, y lo que lee la ficha pasa por el Worker (`/pjud/caso/{id}`), que
// reenvía al Lambda `lens-pjud-lector`.

import { categoriasSensibles } from './delitosSensibles';
import { etiquetaAntiguedad } from './precedentes';

// ── Lo que escribe Lens al encolar (§3.1 del contrato) ─────────────────────

export interface CoincidenciaPjud {
  tipo?: string;
  detalle?: string;
  estado?: string;
  fecha?: string;
  fuente?: string;
}

export interface DelitoScraper {
  delito: string | null;
  ruc: string;
  estado: string | null;
  fecha: string | null;       // AAAA-MM-DD
  antiguedad: string | null;
  fuente: string | null;
}

export interface CasoScraper {
  case_id: string;
  pais: 'CL';
  sujeto: {
    documento: { tipo: 'RUT'; valor: string };
    nombre: string | null;
    apellido: string | null;
  };
  motivo_coincidencia: string;
  delitos: DelitoScraper[];
}

/** El RUC de una coincidencia de Regcheq: viene como «RUC 1900000000-0» en `detalle`. */
export function rucDe(detalle?: string): string {
  const m = (detalle || '').match(/RUC\s*(\S+)/i);
  return m ? m[1] : '';
}

/** `DD/MM/AAAA` (como lo entrega Regcheq) → `AAAA-MM-DD`. Lo que no se entiende va en null. */
export function fechaIso(f?: string): string | null {
  const s = String(f ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * RUT con guion y dígito verificador, sin puntos: `12.345.678-5` → `12345678-5`.
 * Sin guion se asume que el último carácter es el DV. Lo que no tiene forma de
 * RUT va en null: el contrato lo exige y el scraper rechazaría el caso.
 */
export function rutNormalizado(v: unknown): string | null {
  const s = String(v ?? '').replace(/[.\s]/g, '').toUpperCase();
  const conGuion = s.includes('-') ? s : (s.length > 1 ? `${s.slice(0, -1)}-${s.slice(-1)}` : s);
  return /^\d{1,9}-[\dK]$/.test(conGuion) ? conGuion : null;
}

/** El texto de un nombre del payload, tal como viene. Un email en ese campo no es un nombre. */
const nombreDe = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s && !s.includes('@') ? s : null;
};

const ETIQUETA_MOTIVO: Record<string, string> = {
  pep: 'PEP',
  pais_apagado: 'país deshabilitado',
  sin_conclusion: 'conclusión para revisión',
  asignado: 'asignado a un analista',
  standby: 'stand by',
  flujo_apagado: 'flujo automático apagado',
};

/**
 * `motivo_coincidencia` (§3.1): por qué se consultó PJUD por esta persona.
 * Es la condición 1 de legal y queda para auditoría.
 *
 * - Retenido por delito: el texto del banner con la fuente adelante,
 *   `regcheq · Tráfico, Defraudaciones`.
 * - Retenido por otra cosa (PEP, país…) y con causas con RUC: las dos cosas,
 *   `PEP · además regcheq: Defraudaciones`. Si ninguna causa es sensible, se
 *   nombran los delitos, porque igual hay que decir qué se fue a buscar.
 */
export function motivoCoincidencia(
  motivo: string | undefined,
  categorias: string[] | undefined,
  coincidencias: CoincidenciaPjud[],
): string {
  const conRuc = coincidencias.filter(c => rucDe(c.detalle));
  const sensibles = categoriasSensibles(conRuc as never);
  if (motivo === 'delito_sensible') {
    const cats = categorias?.length ? categorias : sensibles;
    return `regcheq · ${cats.join(', ')}`;
  }
  const delitos = [...new Set(conRuc.map(c => (c.tipo || '').trim()).filter(Boolean))].slice(0, 5);
  const que = sensibles.length ? sensibles.join(', ') : delitos.join(', ') || 'causas con RUC';
  return `${ETIQUETA_MOTIVO[motivo ?? ''] ?? motivo ?? 'revisión'} · además regcheq: ${que}`;
}

/**
 * Lo que Lens escribe en `scraper_casos/{caseId}` al encolar, o `null` si el caso
 * no entra: sin causas con RUC no hay nada que buscar en PJUD, y sin RUT el
 * scraper no puede consultar.
 */
export function armarCasoScraper(
  caseId: string,
  datos: Record<string, unknown> | undefined,
  coincidencias: CoincidenciaPjud[] | undefined,
  motivo: string | undefined,
  categorias: string[] | undefined,
): CasoScraper | null {
  const co = coincidencias ?? [];
  const delitos: DelitoScraper[] = co
    .filter(c => rucDe(c.detalle))
    .map(c => ({
      delito: (c.tipo || '').trim() || null,
      ruc: rucDe(c.detalle),
      estado: (c.estado || '').trim() || null,
      fecha: fechaIso(c.fecha),
      antiguedad: c.fecha ? etiquetaAntiguedad(c.fecha) : null,
      fuente: (c.fuente || '').trim() || null,
    }));
  if (!delitos.length) return null;
  const rut = rutNormalizado(datos?.['Número de DNI']);
  if (!rut) return null;
  return {
    case_id: caseId,
    pais: 'CL',
    sujeto: {
      documento: { tipo: 'RUT', valor: rut },
      nombre: nombreDe(datos?.['Nombre']),
      apellido: nombreDe(datos?.['Apellido']),
    },
    motivo_coincidencia: motivoCoincidencia(motivo, categorias, co),
    delitos,
  };
}

// ── Lo que muestra la ficha (§4.2) ─────────────────────────────────────────

/**
 * Lo mínimo que entrega el Worker. NO trae la lista de folios: su `descripcion`
 * puede traer nombres de terceros.
 */
export interface DocPjud {
  en_proceso: { tipo?: string; estado?: string; job_id?: string } | null;
  documentacion: {
    estado: 'Completada' | 'Incompleta' | 'Fallida' | string | null;
    error: string | null;
    ultimo_error: string | null;
    causas_sin_verificar: unknown[];
    avisos_pjud: unknown[];
    documentos_borrados_en: string | null;
  } | null;
  analisis: { texto: string | null; generado: string | null } | null;
  resuelto_en: string | null;
}

export type TipoEstadoPjud =
  | 'nada' | 'resuelto' | 'analizando' | 'actualizando'
  | 'completada' | 'incompleta' | 'fallida' | 'pendiente';

export interface EstadoPjud {
  tipo: TipoEstadoPjud;
  /** La línea de estado, arriba del texto. */
  titulo: string;
  /** El análisis del modelo, si hay. */
  texto: string | null;
  generado: string | null;
  /** Lo que el analista tiene que ver antes de leer el texto. */
  aviso: string | null;
  error: string | null;
  avisosPjud: string[];
  /** ¿Hay que volver a consultar? Solo mientras el scraper trabaja. */
  enCurso: boolean;
}

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : (x as { ruc?: string; texto?: string })?.ruc ?? (x as { texto?: string })?.texto ?? JSON.stringify(x))) : [];

/**
 * La tabla de estados de §4.2, en un solo lugar.
 *
 * LO ÚNICO QUE NO PUEDE PASAR: que `Incompleta` o `Fallida` se lean como «sin
 * antecedentes». Es el bug del sistema heredado: 16 de 33 resúmenes que decían
 * «0 causas» venían de corridas fallidas. Una causa sin verificar es «no
 * sabemos», nunca «no tiene». Por eso ningún estado de esta función dice «sin
 * antecedentes»: cuando no hay análisis, dice que no lo hay.
 */
export function estadoAnalisisPjud(doc: DocPjud | null): EstadoPjud {
  const base = { texto: null, generado: null, aviso: null, error: null, avisosPjud: [], enCurso: false };
  if (!doc) return { ...base, tipo: 'nada', titulo: '' };

  const texto = doc.analisis?.texto?.trim() || null;
  const generado = doc.analisis?.generado ?? null;
  const d = doc.documentacion;
  const sinVerificar = lista(d?.causas_sin_verificar);
  const avisosPjud = lista(d?.avisos_pjud);

  if (doc.resuelto_en) {
    return { ...base, tipo: 'resuelto', titulo: 'Caso resuelto: documentos borrados', texto, generado };
  }
  if (doc.en_proceso) {
    return texto
      ? { ...base, tipo: 'actualizando', titulo: 'Análisis de la documentación de PJUD · actualizándose…', texto, generado, enCurso: true }
      : { ...base, tipo: 'analizando', titulo: 'Analizando la documentación de PJUD…', enCurso: true };
  }
  // Una re-corrida que falló conserva el resultado anterior y deja el error aparte.
  const ultimoError = d?.ultimo_error ? `La última corrida falló: ${d.ultimo_error}` : null;
  if (d?.estado === 'Completada') {
    return { ...base, tipo: 'completada', titulo: 'Análisis de la documentación de PJUD', texto, generado, aviso: ultimoError };
  }
  if (d?.estado === 'Incompleta') {
    const aviso = `Hay ${sinVerificar.length || 'algunas'} causa(s) sin verificar${sinVerificar.length ? ` (${sinVerificar.join(', ')})` : ''}: `
      + 'para esas causas no se sabe si hay antecedentes. No equivale a «sin antecedentes».';
    return { ...base, tipo: 'incompleta', titulo: 'Análisis incompleto de la documentación de PJUD', texto, generado,
             aviso: [aviso, ultimoError].filter(Boolean).join(' '), avisosPjud };
  }
  if (d?.estado === 'Fallida') {
    return { ...base, tipo: 'fallida', titulo: 'No se pudo obtener la documentación',
             error: d.error || 'Sin detalle del error.', avisosPjud,
             aviso: 'No hay análisis: esto no equivale a «sin antecedentes».' };
  }
  // Sin trabajo en curso y sin resultado: no hay nada que esperar, así que no se
  // vuelve a consultar (el polling es solo mientras hay `en_proceso`).
  return { ...base, tipo: 'pendiente', titulo: 'Todavía no hay documentación de PJUD para este caso' };
}
