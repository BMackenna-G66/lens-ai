// Lo que se escribe en config/flujoAutomatico, armado en funciones puras.
//
// Dos pantallas escriben ese documento y ninguna puede pisar lo de la otra:
//   · el panel del flujo automático (Bandeja) escribe `ofac` y `remesa`;
//   · el switch del scraper de PJUD (Administración) escribe solo `pjud.*`.
// Las dos van con `setDoc(…, { merge: true })`, así que cada una toca solo las
// claves que manda. Están acá, sin Firestore, para poder probarlo.

import type { FlujoConfig } from './flujoDecision';

export interface ActorConfig { nombre?: string | null; email?: string | null }

/** Lo que guarda el panel del flujo automático. No incluye `pjud`. */
export function payloadFlujoConfig(cfg: FlujoConfig, actor?: ActorConfig, ahora: Date = new Date()) {
  return {
    ofac: cfg.ofac,
    remesa: cfg.remesa,
    actualizadoEn: ahora.toISOString(),
    actualizadoPor: actor?.nombre ?? 'system',
  };
}

/**
 * El switch del scraper de PJUD. Solo `pjud.enabled` y quién y cuándo: la base
 * (`pjud.database`) no se toca y sigue en su default. El Lambda lo toma en la
 * corrida siguiente.
 */
export function payloadSwitchPjud(enabled: boolean, actor?: ActorConfig, ahora: Date = new Date()) {
  return {
    pjud: {
      enabled,
      actualizadoPor: actor?.email || actor?.nombre || 'desconocido',
      actualizadoEn: ahora.toISOString(),
    },
  };
}
