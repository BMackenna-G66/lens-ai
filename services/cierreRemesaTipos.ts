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
// Para sumar otra (devolver, por ejemplo) se agrega una entrada acá y la ficha,
// el masivo y los textos la toman solas. Lo único que NO se toma solo es el
// flujo automático: eso lo gobierna `automatico` (ver abajo).

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
  // ¿El flujo AUTOMÁTICO puede aplicar esta tipología?
  //
  // Es un freno, no una preferencia. El flujo desatendido decide una sola cosa
  // —"este caso no tiene hallazgos"— y de ahí saca la tipología de la config. Si
  // «Rechazar» fuera elegible ahí, alguien que cambia un desplegable en el
  // mantenedor haría que el cron rechace en masa todo lo que está limpio, que es
  // el error exactamente opuesto al que este flujo intenta evitar.
  //
  // Rechazar es una decisión sobre un caso puntual: la toma una persona.
  automatico: boolean;
  // Cómo se nombra el resultado en los mensajes: "3 liberada(s)" / "3 rechazada(s)".
  participio: string;
  // Qué se le advierte a quien confirma. Cada tipología dice su propia
  // consecuencia: liberar y rechazar mueven la plata para lados distintos y un
  // texto genérico ("libera plata real") sería falso en la mitad de los casos.
  advertencia: string;
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

// El ORDEN importa: «Liberar» va primera porque la ficha pre-selecciona
// `TIPOS_CIERRE_REMESA[0]`. Rechazar no puede quedar preseleccionado.
export const TIPOS_CIERRE_REMESA: TipoCierreRemesa[] = [
  {
    id: 'liberar',
    label: 'Liberar',
    statusDB: 'DATOS_VERIFICADOS',
    statusLabel: 'Datos verificados',
    paisSegunCaso: true,
    automatico: true,
    participio: 'liberada(s)',
    advertencia: 'Libera plata real.',
    campos: {
      C_Review__c: 'Beneficiario',     // se ve como "Transacciones Bot"
      C_Status__c: 'Approved',
      Status: 'Closed',
      Product__c: 'Transactions',      // se ve como "💸 Transferencias"
      Comments: 'Transaccion liberada dentro de la matriz de riesgo liberada bajo logica de bandeja de casos',
      // CAT_CMPL__c: sin cambio (no se envía)
    },
  },
  {
    id: 'rechazar',
    label: 'Rechazar',
    statusDB: 'ENVIO_RECHAZADO',
    statusLabel: 'Envío rechazado',
    paisSegunCaso: true,
    // SOLO MANUAL. Ver el comentario de `automatico` arriba.
    automatico: false,
    participio: 'rechazada(s)',
    advertencia: 'Rechaza el envío: la plata NO se entrega al beneficiario.',
    campos: {
      // Misma tipificación que liberar salvo el status: es el mismo tipo de
      // revisión sobre el mismo producto, con la conclusión opuesta.
      C_Review__c: 'Beneficiario',     // se ve como "Transacciones Bot"
      C_Status__c: 'Rejected',         // el opuesto de 'Approved' en el picklist
      Status: 'Closed',
      Product__c: 'Transactions',      // se ve como "💸 Transferencias"
      Comments: 'Transaccion rechazada bajo logica de bandeja de casos',
    },
  },
];

export const tipoRemesaPorId = (id: string): TipoCierreRemesa | undefined =>
  TIPOS_CIERRE_REMESA.find(t => t.id === id);

// Las que el flujo desatendido puede aplicar. El mantenedor ofrece SOLO estas
// como tipología activa, y los dos ejecutores lo vuelven a verificar antes de
// tocar nada: si esto se filtrara únicamente en la UI, un documento de config
// editado a mano alcanzaría para que el cron rechace transacciones solo.
export const TIPOS_REMESA_AUTOMATICOS = (): TipoCierreRemesa[] =>
  TIPOS_CIERRE_REMESA.filter(t => t.automatico);

export const tipoRemesaEsAutomatico = (id: string | undefined): boolean =>
  !!id && tipoRemesaPorId(id)?.automatico === true;

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
