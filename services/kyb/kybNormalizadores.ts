// Normalizadores del KYB. Funciones PURAS, sin red ni estado.
//
// Son la base de todo el comparador: sin esto, "AV. PROVIDENCIA 1234" y
// "Avenida Providencia N° 1234" serían una discrepancia, y "COMERCIAL FRUNA SPA"
// no matchearía con "Comercial Fruna S.P.A.".
//
// Los cortes de similitud de nombre (95 / 85 / 70) NO son inventados: son los
// mismos que ya están calibrados en colombiaCriminalModel
// (CRIMINAL_CONFIG_DEFAULT.identity.nameHighCut/nameMedCut/nameLowCut). Se
// replican acá porque allá son privados, y se mantienen iguales a propósito para
// que "nombres parecidos" signifique lo mismo en los dos módulos.

import { normalizarTexto } from '../casosComplianceMapper';

// ── Razón social ─────────────────────────────────────────────────────────────
// Los sufijos societarios no aportan a la identidad y varían de escritura
// ("SPA", "S.P.A.", "SpA"), así que se quitan antes de comparar. El tipo
// societario se compara aparte, en su propio componente.
const SUFIJOS_SOCIETARIOS = [
  'SOCIEDAD POR ACCIONES SIMPLIFICADA', 'SOCIEDAD ANONIMA CERRADA', 'SOCIEDAD ANONIMA',
  'SOCIEDAD DE RESPONSABILIDAD LIMITADA', 'EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA',
  'SPA', 'S P A', 'SAS', 'S A S', 'SA', 'S A', 'LTDA', 'LIMITADA', 'EIRL', 'E I R L',
  'SRL', 'S R L', 'INC', 'CORP', 'LLC', 'SAC', 'S A C',
];

export function normalizarRazonSocial(v: unknown): string {
  let s = normalizarTexto(v).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  // Se quitan solo al FINAL: "SA" en medio puede ser parte del nombre.
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const suf of SUFIJOS_SOCIETARIOS) {
      if (s.endsWith(' ' + suf) || s === suf) {
        s = s.slice(0, s.length - suf.length).trim();
        cambio = true;
        break;
      }
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

// ── RUT chileno · dígito verificador (módulo 11) ─────────────────────────────
// Un RUT con DV inválido no es "distinto", es un dato MAL CARGADO. La distinción
// importa: una discrepancia manda a revisión, un RUT inválido manda a corregir.
export function limpiarRut(v: unknown): string {
  return normalizarTexto(v).replace(/[^0-9K]/g, '');
}

export function rutValido(v: unknown): boolean {
  const s = limpiarRut(v);
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1);
  const dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado;
}

// ── Similitud de nombre ──────────────────────────────────────────────────────
export const CORTES_NOMBRE = { alto: 95, medio: 85, bajo: 70 } as const;

const tokensNombre = (v: unknown): string[] =>
  normalizarTexto(v).replace(/[^A-Z0-9ÑÜ ]/g, ' ').split(/\s+/).filter(t => t.length > 1);

// Cobertura de tokens, igual que colombiaCriminalModel: cuántos tokens comparten
// sobre el máximo de los dos. No es Levenshtein a propósito — con nombres de
// persona el orden y los apellidos compuestos hacen ruido.
export function similitudNombre(a: unknown, b: unknown): number {
  const ta = tokensNombre(a), tb = tokensNombre(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const inter = ta.filter(t => setB.has(t)).length;
  return Math.round((inter / Math.max(ta.length, tb.length)) * 100);
}

// ── Direcciones ──────────────────────────────────────────────────────────────
// Huella: tipo de vía normalizado + palabras significativas + número. Con esto
// "Av. Providencia 1234, of. 501" y "AVENIDA PROVIDENCIA N 1234 OFICINA 501"
// dan la misma huella.
const SINONIMOS_VIA: Record<string, string> = {
  AV: 'AVENIDA', AVDA: 'AVENIDA', AVE: 'AVENIDA',
  CL: 'CALLE', CLL: 'CALLE', CA: 'CALLE',
  PSJE: 'PASAJE', PJE: 'PASAJE',
  KM: 'KILOMETRO', CRA: 'CARRERA', KR: 'CARRERA', CR: 'CARRERA',
  DG: 'DIAGONAL', TV: 'TRANSVERSAL', TRV: 'TRANSVERSAL',
  OF: 'OFICINA', OFIC: 'OFICINA', DPTO: 'DEPARTAMENTO', DEPTO: 'DEPARTAMENTO',
  PISO: 'PISO', LOC: 'LOCAL',
};

// Palabras que no aportan a la identidad de una dirección.
const RUIDO_DIRECCION = new Set(['N', 'NRO', 'NUM', 'NUMERO', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SN']);

export function huellaDireccion(v: unknown): string {
  const bruto = normalizarTexto(v).replace(/[^A-Z0-9ÑÜ ]/g, ' ');
  const salida: string[] = [];
  for (const t of bruto.split(/\s+/)) {
    if (!t || RUIDO_DIRECCION.has(t)) continue;
    salida.push(SINONIMOS_VIA[t] ?? t);
  }
  // Se ordena para que el orden de los componentes no genere falsas discrepancias.
  return salida.sort().join(' ');
}

// ── Fechas ───────────────────────────────────────────────────────────────────
// Acepta ISO, dd/mm/yyyy, dd-mm-yyyy y timestamps con hora. Devuelve yyyy-mm-dd
// o '' si no se pudo interpretar.
export function fechaAIso(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return '';
}

export function mismaFecha(a: unknown, b: unknown): boolean {
  const fa = fechaAIso(a), fb = fechaAIso(b);
  return !!fa && fa === fb;
}

// ── Montos ───────────────────────────────────────────────────────────────────
// Los montos declarados nunca coinciden al peso: se comparan con tolerancia
// RELATIVA. 5% para "coincide", 25% para "parcial".
export const TOLERANCIA_MONTO = { coincide: 0.05, parcial: 0.25 } as const;

export type ResultadoMonto = 'COINCIDE' | 'PARCIAL' | 'DISCREPA';

export function compararMontos(a: number | null | undefined, b: number | null | undefined): ResultadoMonto | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (a === 0 && b === 0) return 'COINCIDE';
  const mayor = Math.max(Math.abs(a), Math.abs(b));
  if (mayor === 0) return 'COINCIDE';
  const dif = Math.abs(a - b) / mayor;
  if (dif <= TOLERANCIA_MONTO.coincide) return 'COINCIDE';
  if (dif <= TOLERANCIA_MONTO.parcial) return 'PARCIAL';
  return 'DISCREPA';
}

// ── Conjuntos de texto (actividades, industrias, facultades) ──────────────────
// Se comparan como conjuntos normalizados: importa si se solapan, no el orden.
export function solapamiento(a: string[] | undefined, b: string[] | undefined): number {
  const na = (a ?? []).map(normalizarTexto).filter(Boolean);
  const nb = (b ?? []).map(normalizarTexto).filter(Boolean);
  if (!na.length || !nb.length) return 0;
  const setB = new Set(nb);
  // Se cuenta como solape si un texto contiene al otro: "TRANSPORTE DE CARGA" y
  // "TRANSPORTE" son la misma actividad a este nivel.
  const inter = na.filter(x => setB.has(x) || nb.some(y => y.includes(x) || x.includes(y))).length;
  return Math.round((inter / Math.max(na.length, nb.length)) * 100);
}

// ── Forma legal ──────────────────────────────────────────────────────────────
// "Sociedad por Acciones" y "SpA" son lo MISMO, y compararlos como texto daba
// DISCREPA — un falso positivo que hace desconfiar de toda la matriz. Se
// canonizan a una sigla antes de comparar.
const FORMAS_LEGALES: { sigla: string; patrones: RegExp }[] = [
  { sigla: 'SPA',  patrones: /^(SPA|S ?P ?A|SOCIEDAD POR ACCIONES)$/ },
  { sigla: 'SAS',  patrones: /^(SAS|S ?A ?S|SOCIEDAD POR ACCIONES SIMPLIFICADA)$/ },
  { sigla: 'SA',   patrones: /^(SA|S ?A|SOCIEDAD ANONIMA( CERRADA| ABIERTA)?)$/ },
  { sigla: 'LTDA', patrones: /^(LTDA|LIMITADA|SOCIEDAD (DE RESPONSABILIDAD )?LIMITADA|SRL|S ?R ?L)$/ },
  { sigla: 'EIRL', patrones: /^(EIRL|E ?I ?R ?L|EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA)$/ },
  { sigla: 'SCOM', patrones: /^(SOCIEDAD (EN )?COMANDITA.*)$/ },
  { sigla: 'SCOL', patrones: /^(SOCIEDAD COLECTIVA.*)$/ },
];

// La forma legal DESDE la razón social. En una escritura chilena no existe un
// campo rotulado "Forma legal": el tipo societario va dentro del nombre
// ("TURISMO CENTINELA LIMITADA") o en prosa. Buscar la etiqueta es buscar algo
// que el documento no tiene.
//
// No es una suposición: si el nombre termina en LIMITADA, el documento está
// diciendo que la sociedad es una limitada. Se devuelve '' cuando el sufijo no
// se reconoce, para no inventar una forma.
export function formaLegalDesdeRazonSocial(v: unknown): string {
  const t = normalizarTexto(v).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Los sufijos ya están ordenados de más largo a más corto, así que
  // "SOCIEDAD ANONIMA CERRADA" gana antes que "SA".
  for (const suf of SUFIJOS_SOCIETARIOS) {
    if (t === suf || t.endsWith(' ' + suf)) {
      const sigla = canonizarFormaLegal(suf);
      // Solo si se reconoce como forma conocida; si no, no se afirma nada.
      return FORMAS_LEGALES.some(f => f.sigla === sigla) ? sigla : '';
    }
  }
  return '';
}

// Devuelve la sigla canónica, o el texto normalizado si no se reconoce (así una
// forma nueva no se convierte en coincidencia falsa con otra).
export function canonizarFormaLegal(v: unknown): string {
  const t = normalizarTexto(v).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  for (const f of FORMAS_LEGALES) if (f.patrones.test(t)) return f.sigla;
  return t;
}
