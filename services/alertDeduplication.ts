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

// El estado de una alerta lo pone el ANALISTA, no el proveedor. El normalizador
// crea toda alerta como 'ABIERTA' (screeningNormalizer: `estado: 'ABIERTA'`), así
// que al fusionar hay que conservar el estado previo: si no, cada re-consulta
// resucita como ABIERTA una alerta que alguien ya había suprimido o resuelto.
// Es una regresión de compliance, no un detalle cosmético.
const ESTADOS_DEL_ANALISTA = new Set(['EN_REVISION', 'SUPRIMIDA', 'RESUELTA']);

// Fusiona alertas nuevas sobre las existentes, por `dedupKey`.
// - Si la clave ya existe: conserva `creadaEn` y el estado que puso el analista,
//   toma el resto de la nueva y refresca `actualizadaEn`.
// - Si no existe: agrega la nueva.
export function mergeAlertas(existentes: AlertaScreening[], nuevas: AlertaScreening[]): AlertaScreening[] {
  const map = new Map<string, AlertaScreening>();
  for (const a of existentes) map.set(a.dedupKey, a);
  for (const n of nuevas) {
    const prev = map.get(n.dedupKey);
    if (!prev) { map.set(n.dedupKey, n); continue; }
    map.set(n.dedupKey, {
      ...prev, ...n,
      creadaEn: prev.creadaEn,
      // 'ERROR' del proveedor sí gana: es información nueva sobre la consulta.
      estado: ESTADOS_DEL_ANALISTA.has(prev.estado) && n.estado === 'ABIERTA' ? prev.estado : n.estado,
      actualizadaEn: n.actualizadaEn,
    });
  }
  return [...map.values()];
}
