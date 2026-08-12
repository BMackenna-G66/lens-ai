// MANTENEDOR de las tipologías del SEGUNDO cierre del caso: el cierre en Admin
// (bloqueo/desbloqueo del cliente en api.global66.com), aparte del cierre en
// Salesforce. Replica el flujo del bot Flujo_emergencia_activo_B2C.
//
// Cada tipología fija `status` / `comment` / `observation` (los 3 valores que sí
// van a la API de admin) y el default de `lastStep`. Los campos de dos valores
// (ofacFlag, provider) y el ticket los elige el analista en la ficha.
//
// ⚠️ `pep` es solo METADATA (el bot no tiene endpoint de PEP): se registra en la
// auditoría, no se envía a la API.

export interface TipoCierreAdmin {
  id: string;
  label: string;
  status: string;        // NORMAL | UNDER_COMPLIANCE_REVIEW | FULLY_BLOCKED
  comment: string;       // NO_COMMENTS | UCR_CRIMINAL_RISK | COMPLIANCE_OFFICER_REQUEST
  observation: string;
  pep?: boolean;         // solo metadata (no va a la API)
  lastStepDefault: boolean; // default del switch last-step según el status
}

export const TIPOS_CIERRE_ADMIN: TipoCierreAdmin[] = [
  {
    id: 'liberar_normal',
    label: 'Liberar Normal',
    status: 'NORMAL',
    comment: 'NO_COMMENTS',
    observation: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
    lastStepDefault: true,
  },
  {
    id: 'liberar_ucr',
    label: 'Liberar UCR',
    status: 'UNDER_COMPLIANCE_REVIEW',
    comment: 'UCR_CRIMINAL_RISK',
    observation: 'Cliente puede operar UCR con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
    lastStepDefault: true,
  },
  {
    id: 'fully_blocked',
    label: 'Fully blocked',
    status: 'FULLY_BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    observation: 'Cliente NO puede operar con global66 caso liberado bajo logica de bandeja de casos - Fuera de la matriz de riesgo',
    lastStepDefault: false,
  },
  {
    id: 'blocked_pep',
    label: 'Blocked + formulario PEP',
    status: 'FULLY_BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    observation: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos - Dentro de la matriz de riesgo',
    pep: true,
    lastStepDefault: false,
  },
];

export const OFAC_PROVIDERS = ['REGCHECK', 'RISK_CONSULTING'] as const;
export const ADMIN_ASSIGNEE_DEFAULT = 'compliance.masivo@global66.com';
