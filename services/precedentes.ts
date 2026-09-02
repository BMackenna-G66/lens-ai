// Precedente vs no precedente: la clasificación del catálogo, en un solo lugar.
//
// ── Comparación EXACTA, nunca por substring ────────────────────────────────
// El catálogo tiene exactamente DOS valores, verificado sobre los 1.488 delitos
// del catálogo de Chile:
//
//   "DELITOS PRECEDENTES"       →   218
//   "DELITOS NO PRECEDENTES"    → 1.270
//
// No hay variantes. Y como uno CONTIENE al otro, cualquier `includes` o
// `contains` se topa: `'DELITOS NO PRECEDENTES'.includes('PRECEDENTE')` es
// `true`, así que un filtro por substring clasifica TODO como precedente.
//
// Por eso acá se compara contra los dos valores fijos y nada más. No es una
// versión más cuidadosa del substring: es no usar substring. Un valor que no sea
// uno de los dos NO se adivina — cae en `sinClasificar`, que es visible y
// obliga a mirar el catálogo en vez de bucketear en silencio.
//
// Es el mismo criterio que ya usaba el catálogo de Colombia
// (`colombiaCatalogo`: `p.tipoDelito === 'DELITOS PRECEDENTES'`).
//
// ── Sobre qué se cuenta ────────────────────────────────────────────────────
// Sobre EVENTOS ÚNICOS, no menciones. Regcheq devuelve una fila por delito y
// una causa puede traer varias, así que sin deduplicar los números salen
// inflados y no cuadran con el "delitos únicos" que ya muestra la ficha.
//
// El criterio de unicidad es el mismo que usa el resto del sistema: RUC, y si
// no hay RUC, el nombre del delito.

/** Los dos únicos valores del catálogo. */
export const TIPO_PRECEDENTE = 'DELITOS PRECEDENTES';
export const TIPO_NO_PRECEDENTE = 'DELITOS NO PRECEDENTES';

// Normaliza SOLO el ruido de transcripción —mayúsculas, espacios de sobra,
// tildes— para que "delitos  precedentes" siga siendo el mismo valor. No abre la
// puerta a coincidencias parciales: después se compara con `===`.
const canon = (tipo: unknown): string =>
  String(tipo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[_\s]+/g, ' ').trim();

/** ¿Es exactamente "DELITOS PRECEDENTES"? */
export const esPrecedente = (tipo: unknown): boolean => canon(tipo) === TIPO_PRECEDENTE;

/** ¿Es exactamente "DELITOS NO PRECEDENTES"? */
export const esNoPrecedente = (tipo: unknown): boolean => canon(tipo) === TIPO_NO_PRECEDENTE;

export interface ConteoPrecedentes {
  precedentes: number;
  noPrecedentes: number;
  /** Eventos cuyo delito no está en el catálogo: no se pueden clasificar. */
  sinClasificar: number;
  /** precedentes + noPrecedentes + sinClasificar. */
  total: number;
}

export interface EventoClasificable {
  /** Etiqueta del catálogo (`catalogType`). */
  catalogType?: string;
  /** Clave de unicidad primaria. */
  ruc?: string;
  /** Respaldo cuando no hay RUC. */
  tipo?: string;
  crimen?: string;
}

/**
 * Cuenta eventos únicos separados por precedente / no precedente.
 *
 * `sinClasificar` NO se reparte ni se suma a ninguno de los dos: un delito que
 * no está en el catálogo no es "no precedente", es un delito sin clasificar. Si
 * se sumara al lado benigno, un catálogo incompleto se leería como ausencia de
 * riesgo — que es exactamente al revés de lo que corresponde.
 */
export function contarPrecedentes(eventos: EventoClasificable[] | undefined): ConteoPrecedentes {
  const vistos = new Set<string>();
  let precedentes = 0, noPrecedentes = 0, sinClasificar = 0;

  for (const e of eventos ?? []) {
    const clave = String(e?.ruc ?? '').trim() || String(e?.tipo ?? e?.crimen ?? '').trim();
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);

    if (esNoPrecedente(e.catalogType)) noPrecedentes++;
    else if (esPrecedente(e.catalogType)) precedentes++;
    else sinClasificar++;
  }

  return { precedentes, noPrecedentes, sinClasificar, total: precedentes + noPrecedentes + sinClasificar };
}

/**
 * Resumen legible para la ficha: "3 precedentes · 5 no precedentes".
 * Omite los tramos en cero para no ensuciar, y solo nombra los sin clasificar
 * cuando existen — que es cuando hay que ir a completar el catálogo.
 */
export function resumenPrecedentes(c: ConteoPrecedentes): string {
  const partes: string[] = [];
  if (c.precedentes) partes.push(`${c.precedentes} precedente${c.precedentes === 1 ? '' : 's'}`);
  if (c.noPrecedentes) partes.push(`${c.noPrecedentes} no precedente${c.noPrecedentes === 1 ? '' : 's'}`);
  if (c.sinClasificar) partes.push(`${c.sinClasificar} sin clasificar en el catálogo`);
  return partes.join(' · ');
}

// ── Antigüedad del delito ──────────────────────────────────────────────────
// Cuántos años pasaron desde el hecho. Es lo que permite ver de un vistazo si
// una causa es de hace dos años o de hace veinte, que cambia por completo cómo
// se lee el perfil.

/** Regcheq entrega DD/MM/YYYY; se acepta también ISO por si cambia el formato. */
export function fechaDelitoAMs(f: unknown): number {
  const s = String(f ?? '').trim();
  if (!s) return 0;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Años completos entre la fecha del delito y `ahora`. `null` si no hay fecha
 * usable — devolver 0 sería afirmar que el delito es de este año.
 *
 * Una fecha futura también devuelve `null`: es un dato malo, no una antigüedad
 * negativa.
 */
export function aniosDesde(fecha: unknown, ahora: number = Date.now()): number | null {
  const ms = fechaDelitoAMs(fecha);
  if (!ms) return null;
  if (ms > ahora) return null;

  // Años de CALENDARIO, no milisegundos divididos.
  //
  // Dividir por 365,2425 días parece equivalente y no lo es: un aniversario
  // exacto da 0,99934 y `floor` lo baja a 0, así que un delito de hace
  // exactamente un año se mostraba como "< 1 año". Es la misma cuenta que se usa
  // para la edad de una persona.
  const d = new Date(ms), h = new Date(ahora);
  let anios = h.getFullYear() - d.getFullYear();
  const meses = h.getMonth() - d.getMonth();
  if (meses < 0 || (meses === 0 && h.getDate() < d.getDate())) anios--;
  return Math.max(0, anios);
}

/** Cómo se muestra en la tabla: "8 años", "1 año", "< 1 año", "—". */
export function etiquetaAntiguedad(fecha: unknown, ahora: number = Date.now()): string {
  const a = aniosDesde(fecha, ahora);
  if (a === null) return '—';
  if (a === 0) return '< 1 año';
  return `${a} año${a === 1 ? '' : 's'}`;
}
