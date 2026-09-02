// Precedente vs no precedente: la clasificación del catálogo, en un solo lugar.
//
// ── La trampa ──────────────────────────────────────────────────────────────
// El catálogo usa dos etiquetas y una CONTIENE a la otra:
//
//   "DELITOS PRECEDENTES"
//   "DELITOS NO PRECEDENTES"     ← también contiene la palabra "PRECEDENTE"
//
// Por eso `tipo.includes('PRECEDENTE')` es siempre verdadero y clasifica TODO
// como precedente. Hay que descartar el "NO PRECEDENTE" antes de preguntar por
// el precedente, y ese orden es justamente lo que se olvida cada vez que
// alguien lo reescribe.
//
// Está escrito tres veces en el repo: `criminalDataProcessor` lo hace bien,
// `lens360Service` lo hace bien con un comentario que avisa del riesgo, y
// `pdfGenerator` lo hace MAL —usa `includes('PRECEDENTE')` a secas, así que
// cuenta todos los delitos como precedentes y ninguno como no precedente.
// Este módulo existe para que haya una sola versión.
//
// ── Sobre qué se cuenta ────────────────────────────────────────────────────
// Sobre EVENTOS ÚNICOS, no menciones. Regcheq devuelve una fila por delito y
// una causa puede traer varias, así que sin deduplicar los números salen
// inflados y no cuadran con el "delitos únicos" que ya muestra la ficha.
//
// El criterio de unicidad es el mismo que usa el resto del sistema: RUC, y si
// no hay RUC, el nombre del delito.

/** Etiquetas de catálogo que significan "no precedente". */
export const esNoPrecedente = (tipo: unknown): boolean =>
  /NO[\s_]*PRECEDENTE/.test(String(tipo ?? '').toUpperCase());

/** Etiquetas que significan "precedente". Descarta primero el "no precedente". */
export const esPrecedente = (tipo: unknown): boolean => {
  const t = String(tipo ?? '').toUpperCase();
  return !esNoPrecedente(t) && t.includes('PRECEDENTE');
};

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
