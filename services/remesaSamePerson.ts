// Envío a sí mismo ("same person"): el beneficiario de la remesa ES el cliente
// que la envía.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
// Cuando el DNI del beneficiario es el mismo que el del cliente, la plata no
// cambia de manos: es el cliente moviéndose plata a una cuenta propia. Ese
// cliente YA fue validado en el onboarding y está dentro de la matriz, así que
// volver a screenearlo contra listas negras no aporta información nueva —
// consulta al proveedor que se paga, se demora, y cuyo resultado ya se conoce.
//
// Entonces: **DNI del beneficiario == DNI del cliente ⇒ no se consulta a ningún
// proveedor y la transacción se libera.**
//
// ── Dónde encaja ───────────────────────────────────────────────────────────
// Entre la consulta de la transacción (Redshift) y el análisis de listas. Es un
// atajo ANTES del screening, no una conclusión del screening.
//
//   remesa (Redshift) → [ ¿same person? ] → sí → liberar, sin proveedor
//                                         → no → Regcheq / Inspektor → decisión
//
// ── Las cuatro reglas que lo hacen seguro ──────────────────────────────────
// Esto SALTEA el control de sanciones y libera plata. Cada regla existe para que
// no pueda dispararse por accidente:
//
//   1. **Coincidencia exacta tras normalizar.** Nunca aproximada, nunca por
//      nombre. Un RUT se compara sin puntos ni guion y en mayúscula, que es la
//      misma normalización que ya usa el resto del sistema; nada más.
//   2. **Los dos documentos tienen que existir y ser plausibles.** Dos vacíos
//      son iguales entre sí, y ese es exactamente el bug que liberaría todo lo
//      que no trae documento. Por eso hay un piso de largo.
//   3. **Internacional queda afuera.** Por decisión de negocio: en INTL rara vez
//      viene el documento del beneficiario, así que la regla casi nunca podría
//      aplicar y el riesgo de un match espurio no se justifica.
//   4. **Lo controla un switch, apagado por defecto.** Y el switch gobierna las
//      DOS cosas a la vez —saltear el proveedor y liberar—: si estuviera
//      apagado solo para liberar, se habría salteado el screening sin que nadie
//      pueda decidir con evidencia.
//
// Funciones PURAS: sin red, sin Firestore. Se testean solas.

import type { CasoSF } from './casosService';

// Largo mínimo del documento ya normalizado. Un RUT chileno sin puntos son 8-9
// caracteres; una cédula colombiana, 6-10. Siete es el piso que descarta basura
// ("0", "-", "N/A") sin dejar afuera documentos reales cortos.
export const MIN_LARGO_DNI = 7;

// Valores que la fuente usa para decir "no hay dato" y que NO son un documento.
const NO_ES_DOCUMENTO = new Set(['', 'NULL', 'NONE', 'NA', 'N/A', 'SIN DOCUMENTO', '0', '-', '--']);

/**
 * Normaliza un documento para comparar: sin puntos, guiones, espacios ni
 * símbolos, y en mayúscula (el dígito verificador `k` de un RUT puede venir en
 * cualquier caja).
 *
 * NO valida que el documento sea correcto: solo lo lleva a una forma comparable.
 */
export function canonDocumento(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

/** ¿Esto parece un documento de verdad, o es un hueco disfrazado? */
export function documentoUtilizable(v: unknown): boolean {
  const crudo = String(v ?? '').trim().toUpperCase();
  if (NO_ES_DOCUMENTO.has(crudo)) return false;
  const canon = canonDocumento(v);
  if (canon.length < MIN_LARGO_DNI) return false;
  // Todo ceros, o un solo carácter repetido: no es un documento.
  if (/^(.)\1*$/.test(canon)) return false;
  return true;
}

/**
 * El documento del CLIENTE que envía, desde el payload del caso.
 *
 * Sale del caso y no de la consulta a Redshift a propósito: la tabla de
 * transacciones no trae el documento del remitente (habría que cruzar contra
 * `customer.kyc_document`), y el caso ya lo tiene porque es el sujeto que se
 * screenea en el flujo OFAC.
 */
export function dniDelCliente(caso: Pick<CasoSF, 'datos'> | undefined): string {
  return String(caso?.datos?.['Número de DNI'] ?? '').trim();
}

/** El tipo de documento del cliente, solo para mostrarlo en la evidencia. */
export function tipoDniDelCliente(caso: Pick<CasoSF, 'datos'> | undefined): string {
  return String(caso?.datos?.['Tipo de DNI'] ?? '').trim();
}

export interface ResultadoSamePerson {
  /** true solo si se cumplen TODAS las reglas. */
  esMismaPersona: boolean;
  /** Por qué sí o por qué no. Va a la ficha y a la auditoría. */
  motivo: string;
  /** El documento normalizado con el que se hizo el match (solo si dio true). */
  documento?: string;
  /** Los dos documentos tal cual venían, para poder auditar la comparación. */
  dniClienteCrudo?: string;
  dniBeneficiarioCrudo?: string;
}

export interface EntradaSamePerson {
  dniCliente: unknown;
  dniBeneficiario: unknown;
  /** CL | CO | INTL | SIN_DATO. INTL nunca es same person (regla 3). */
  flujo: string | undefined;
}

/**
 * ¿Es un envío a sí mismo?
 *
 * Devuelve siempre un motivo legible, también cuando la respuesta es no: ese
 * texto es lo que le explica al analista por qué la remesa no tomó el atajo.
 */
export function evaluarSamePerson(e: EntradaSamePerson): ResultadoSamePerson {
  const flujo = String(e.flujo ?? '').toUpperCase();
  const cliente = String(e.dniCliente ?? '').trim();
  const beneficiario = String(e.dniBeneficiario ?? '').trim();
  const base = { dniClienteCrudo: cliente || undefined, dniBeneficiarioCrudo: beneficiario || undefined };

  // Regla 3: internacional queda afuera, antes que nada.
  if (flujo === 'INTL') {
    return { ...base, esMismaPersona: false, motivo: 'Envío internacional: la regla de mismo titular no aplica.' };
  }
  if (!flujo || flujo === 'SIN_DATO') {
    return { ...base, esMismaPersona: false, motivo: 'Sin destino determinado: no se evalúa mismo titular.' };
  }

  // Regla 2: los dos documentos tienen que existir y ser plausibles.
  if (!documentoUtilizable(cliente)) {
    return { ...base, esMismaPersona: false, motivo: 'El caso no trae un documento del cliente utilizable.' };
  }
  if (!documentoUtilizable(beneficiario)) {
    return { ...base, esMismaPersona: false, motivo: 'La transacción no trae un documento del beneficiario utilizable.' };
  }

  // Regla 1: coincidencia exacta tras normalizar. Nada de aproximaciones.
  const a = canonDocumento(cliente);
  const b = canonDocumento(beneficiario);
  if (a !== b) {
    return { ...base, esMismaPersona: false, motivo: 'El documento del beneficiario es distinto al del cliente.' };
  }

  return {
    ...base,
    esMismaPersona: true,
    documento: a,
    motivo: `El beneficiario es el mismo cliente (documento ${beneficiario}): ya validado en el onboarding.`,
  };
}
