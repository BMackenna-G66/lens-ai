// Priorización PEP/OFAC (§21). Función PURA y determinista.
// PRELIMINAR (pre-decisión): al momento del screening solo se conoce el tipo del
// caso y si hay coincidencias. La prioridad CRITICA se reserva para OFAC CONFIRMADO,
// que se define en la fase de decisión (Fase 6) — acá el máximo es ALTA.
// Los umbrales cuantitativos definitivos los define negocio (§29.7).

import type { PrioridadCaso, TipoCasoCompliance } from './casosComplianceTypes';

export function calcularPrioridadPreliminar(
  tipo: TipoCasoCompliance,
  tieneCoincidencias: boolean,
): PrioridadCaso {
  switch (tipo) {
    case 'PEP_OFAC':
      return 'ALTA';
    case 'OFAC':
      return tieneCoincidencias ? 'ALTA' : 'MEDIA';
    case 'PEP':
      return tieneCoincidencias ? 'ALTA' : 'MEDIA';
    default:
      return 'MEDIA'; // NO_DETERMINADO → media hasta clasificar mejor
  }
}
