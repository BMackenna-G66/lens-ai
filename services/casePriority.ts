// Priorización PEP/OFAC (§21). Función PURA y determinista.
// PRELIMINAR (pre-decisión): al momento del screening solo se conoce el tipo del
// caso y si hay coincidencias penales. CRITICA no se asigna sola: es una marca
// MANUAL del analista (se edita en la ficha). El máximo automático es ALTA.
//
// Matriz (definida por negocio):
//   Tipo              Sin coincidencias   Con coincidencias
//   OFAC              MEDIA               ALTA
//   PEP               MEDIA               ALTA
//   PEP + OFAC        ALTA                ALTA
//   No determinado    MEDIA               ALTA

import type { PrioridadCaso, TipoCasoCompliance } from './casosComplianceTypes';

export function calcularPrioridadPreliminar(
  tipo: TipoCasoCompliance,
  tieneCoincidencias: boolean,
): PrioridadCaso {
  switch (tipo) {
    case 'PEP_OFAC':
      return 'ALTA';
    case 'OFAC':
    case 'PEP':
    default: // NO_DETERMINADO
      return tieneCoincidencias ? 'ALTA' : 'MEDIA';
  }
}
