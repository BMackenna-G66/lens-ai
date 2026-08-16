// MANTENEDOR de las tipologías de cierre de la cola REMESA.
//
// Aparte de las de OFAC (cierreTipos.ts / cierreAdminTipos.ts) a propósito: una
// remesa cierra sobre la TRANSACCIÓN (se libera la plata), no sobre el cliente,
// y la tipificación en Salesforce es otra. Se dejan separadas para que tocar una
// cola no pueda romper la otra.
//
// Cada tipología define los dos cierres del caso:
//   · admin → estado al que pasa la transacción en api.global66.com
//   · sf    → campos del case-update de Salesforce
//
// Por ahora existe SOLO "Liberar". Para sumar otra (rechazar, devolver, …),
// agregar una entrada acá; la ficha, el masivo y el flujo automático la toman
// solas.

import type { SFCaseUpdate } from './salesforceCaseService';
import { paisASF } from './cierreTipos';

export interface TipoCierreRemesa {
  id: string;
  label: string;
  // ── Cierre en Admin (transacción) ──
  statusDB: string;      // valor que se guarda (txStatus.statusDB)
  statusLabel: string;   // etiqueta visible (txStatus.status)
  // ── Cierre en Salesforce (caso) ──
  campos: Partial<SFCaseUpdate>;
  paisSegunCaso?: boolean;   // Country__c se toma del país del caso
}

// OJO con los picklists de Salesforce: la API recibe el VALUE, no el label que
// se ve en la pantalla de Salesforce. Verificado contra el describe de
// producción, los dos que importan acá difieren:
//   [C] Review  label "Transacciones Bot"  → value "Beneficiario"
//   Producto    label "💸 Transferencias"  → value "Transactions"
// Mandar el label devuelve INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST.
export const SF_LABEL_DE_VALOR: Record<string, string> = {
  Beneficiario: 'Transacciones Bot',
  Transactions: '💸 Transferencias',
};

export const TIPOS_CIERRE_REMESA: TipoCierreRemesa[] = [
  {
    id: 'liberar',
    label: 'Liberar',
    statusDB: 'DATOS_VERIFICADOS',
    statusLabel: 'Datos verificados',
    paisSegunCaso: true,
    campos: {
      C_Review__c: 'Beneficiario',     // se ve como "Transacciones Bot"
      C_Status__c: 'Approved',
      Status: 'Closed',
      Product__c: 'Transactions',      // se ve como "💸 Transferencias"
      Comments: 'Transaccion liberada dentro de la matriz de riesgo liberada bajo logica de bandeja de casos',
      // CAT_CMPL__c: sin cambio (no se envía)
    },
  },
];

export const tipoRemesaPorId = (id: string): TipoCierreRemesa | undefined =>
  TIPOS_CIERRE_REMESA.find(t => t.id === id);

// Tipificación efectiva para un caso concreto: los campos fijos + Country__c
// resuelto desde el país del caso (mismo criterio que la cola OFAC).
export function camposDeCierreRemesa(tipo: TipoCierreRemesa, pais: string): Partial<SFCaseUpdate> {
  const campos: Partial<SFCaseUpdate> = { ...tipo.campos };
  if (tipo.paisSegunCaso) {
    const sf = paisASF(pais);
    if (sf) campos.Country__c = sf;
  }
  return campos;
}
