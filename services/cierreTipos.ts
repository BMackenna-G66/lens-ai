// MANTENEDOR de tipos de cierre para el cierre masivo de casos en Salesforce.
// Cada tipo define la "tipificación": los campos del case-update que se autocompletan.
//
// ⚠️ EN CONSTRUCCIÓN: los `campos` de abajo son PRELIMINARES (solo lo que ya sabemos
// del mapeo de C_Status__c). El usuario está definiendo la tipificación real de cada
// tipo — para completarla se editan SOLO los `campos` de este archivo (nombres de API
// válidos en services/salesforceCaseFields.ts).

import type { SFCaseUpdate } from './salesforceCaseService';

export interface TipoCierre {
  id: string;
  label: string;
  campos: Partial<SFCaseUpdate>;   // tipificación que se aplica al cerrar
  completo: boolean;               // false = tipificación preliminar (faltan campos)
}

export const TIPOS_CIERRE: TipoCierre[] = [
  {
    id: 'liberar_normal',
    label: 'Liberar Normal',
    campos: { C_Status__c: 'Approved' },
    completo: false,
  },
  {
    id: 'liberar_ucr',
    label: 'Liberar UCR',
    campos: { C_Status__c: 'Approved' },
    completo: false,
  },
  {
    id: 'fully_blocked',
    label: 'Fully blocked',
    campos: { C_Status__c: 'Fully Blocked' },
    completo: false,
  },
  {
    id: 'blocked_pep',
    label: 'Blocked + formulario PEP',
    campos: { C_Status__c: 'Blocked', PEP__c: true },
    completo: false,
  },
];
