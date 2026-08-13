// MANTENEDOR de tipos de cierre para el cierre (masivo o individual) de casos en
// Salesforce. Cada tipo define la "tipificación": los campos del case-update que
// se autocompletan al elegirlo.
//
// Los nombres de API y los valores de picklist deben coincidir EXACTO con
// services/salesforceCaseFields.ts (y con Salesforce). Para cambiar la
// tipificación de un tipo, editar SOLO los `campos` de este archivo.
//
// `Country__c` NO se fija acá: es "según caso" → se resuelve desde el país del
// caso con `camposDeCierre()` (ver abajo). `CAT_CMPL__c` ausente = "sin cambio".

import type { SFCaseUpdate } from './salesforceCaseService';

export interface TipoCierre {
  id: string;
  label: string;
  campos: Partial<SFCaseUpdate>;   // tipificación fija que se aplica al cerrar
  paisSegunCaso?: boolean;         // true = Country__c se toma del país del caso
  completo: boolean;               // false = tipificación preliminar (faltan campos)
}

export const TIPOS_CIERRE: TipoCierre[] = [
  {
    id: 'liberar_normal',
    label: 'Liberar Normal',
    paisSegunCaso: true,
    completo: true,
    campos: {
      C_Review__c: '(K) - OFAC',
      C_Status__c: 'Approved',
      Status: 'Closed',
      Product__c: '👤 Cuenta Perfil',
      Tipo_de_Caso_Compliance__c: 'OFAC + Coinc c/delito no escalado',
      Type: 'CMPL',
      Comments: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
      razon_3_dias__c: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
      // CAT_CMPL__c: sin cambio (no se envía)
    },
  },
  {
    id: 'liberar_ucr',
    label: 'Liberar UCR',
    paisSegunCaso: true,
    completo: true,
    campos: {
      C_Review__c: '(K) - OFAC',
      C_Status__c: 'Approved',
      Status: 'Closed',
      Product__c: '👤 Cuenta Perfil',
      Tipo_de_Caso_Compliance__c: 'OFAC + Coinc c/delito no escalado',
      Type: 'CMPL',
      Comments: 'Cliente puede operar UNDER_COMPLIANCE_REVIEW con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
      razon_3_dias__c: 'Cliente puede operar UNDER_COMPLIANCE_REVIEW con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
      // CAT_CMPL__c: sin cambio (no se envía)
    },
  },
  {
    id: 'fully_blocked',
    label: 'Fully blocked',
    paisSegunCaso: true,
    completo: true,
    campos: {
      C_Review__c: '(K) - OFAC',
      C_Status__c: 'Fully Blocked',
      CAT_CMPL__c: '(K) No escalado: 4 o + Delitos precedentes',
      Status: 'Closed',
      Product__c: '👤 Cuenta Perfil',
      Tipo_de_Caso_Compliance__c: 'OFAC + Coinc c/delito no escalado',
      Type: 'CMPL',
      Comments: 'Cliente puede NO operar con global66 caso liberado bajo logica de bandeja de casos - FUERA de la matriz de riesgo',
      razon_3_dias__c: 'Cliente puede NO operar con global66 caso liberado bajo logica de bandeja de casos - FUERA de la matriz de riesgo',
    },
  },
  {
    id: 'blocked_pep',
    label: 'Blocked + formulario PEP',
    paisSegunCaso: true,
    completo: true,
    campos: {
      C_Review__c: '(K) - PEP',
      C_Status__c: 'Requested',
      CAT_CMPL__c: '(K) Bloqueo preventivo form PEP',
      Status: 'Closed',
      Product__c: '👤 Cuenta Perfil',
      Tipo_de_Caso_Compliance__c: 'INDIRECTO G81',
      Type: 'CMPL',
      Comments: 'Cliente debe completar formulario de KYC PEP caso liberado bajo logica de bandeja de casos',
      razon_3_dias__c: 'Cliente debe completar formulario de KYC PEP caso liberado bajo logica de bandeja de casos',
    },
  },
];

// País del caso → valor exacto del picklist Country__c de Salesforce (con emoji).
// Si el país no se reconoce, devuelve '' (no se envía Country__c, para no pisar
// con un valor equivocado).
const PAIS_A_SF: Record<string, string> = {
  argentina: 'Argentina 🇦🇷', brasil: 'Brasil 🇧🇷', brazil: 'Brasil 🇧🇷',
  chile: 'Chile 🇨🇱', colombia: 'Colombia 🇨🇴', 'costa rica': 'Costa Rica 🇨🇷',
  ecuador: 'Ecuador 🇪🇨', espana: 'España 🇪🇸', 'estados unidos': 'Estados Unidos 🇺🇸',
  usa: 'Estados Unidos 🇺🇸', mexico: 'México 🇲🇽', paraguay: 'Paraguay 🇵🇾',
  peru: 'Perú 🇵🇪',
};

export function paisASF(pais: string): string {
  const k = (pais || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita tildes
  return PAIS_A_SF[k] ?? '';
}

// Tipificación efectiva de un tipo para un caso concreto: los `campos` fijos +
// Country__c resuelto desde el país del caso (si aplica y se reconoce).
export function camposDeCierre(tipo: TipoCierre, pais: string): Partial<SFCaseUpdate> {
  const campos: Partial<SFCaseUpdate> = { ...tipo.campos };
  if (tipo.paisSegunCaso) {
    const sf = paisASF(pais);
    if (sf) campos.Country__c = sf;
  }
  return campos;
}
