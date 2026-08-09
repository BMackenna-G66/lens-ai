// Deduplicación de alertas de screening (§20). Funciones PURAS.
// `dedupKey` genera un identificador estable; `mergeAlertas` fusiona por esa clave
// (misma alerta → actualiza evidencia/fecha; distinta → agrega). No fusiona PEP con
// OFAC porque el `tipo` forma parte de la clave.

import type { AlertaScreening } from './casosComplianceTypes';
import { normalizarTexto } from './casosComplianceMapper';

// Clave determinista a partir de identificadores estables. Se ignoran vacíos.
export function dedupKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map(p => normalizarTexto(p ?? ''))
    .filter(Boolean)
    .join('|');
}

// Fusiona alertas nuevas sobre las existentes, por `dedupKey`.
// - Si la clave ya existe: conserva `creadaEn`, toma el resto de la nueva y refresca
//   `actualizadaEn`.
// - Si no existe: agrega la nueva.
export function mergeAlertas(existentes: AlertaScreening[], nuevas: AlertaScreening[]): AlertaScreening[] {
  const map = new Map<string, AlertaScreening>();
  for (const a of existentes) map.set(a.dedupKey, a);
  for (const n of nuevas) {
    const prev = map.get(n.dedupKey);
    map.set(n.dedupKey, prev ? { ...prev, ...n, creadaEn: prev.creadaEn, actualizadaEn: n.actualizadaEn } : n);
  }
  return [...map.values()];
}
