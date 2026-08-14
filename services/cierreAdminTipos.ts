// MANTENEDOR de las tipologías del SEGUNDO cierre del caso: el cierre en Admin
// (bloqueo/desbloqueo del cliente en api.global66.com), aparte del cierre en
// Salesforce. Replica el flujo del bot Flujo_emergencia_activo_B2C.
//
// Cada tipología fija `status` / `comment` / `observation` (los 3 valores que sí
// van a la API de admin) y el default de `lastStep`. Los campos de dos valores
// (ofacFlag, provider) y el ticket los elige el analista en la ficha.
//
// PEP y Risk Level SÍ se envían a la API (pasos PUT en el Worker), replicando el
// script de descarte masivo. Cada uno es opcional: si `pep`/`riskLevel` no está
// definido en la tipología (o el analista lo deja en "no tocar"), ese paso se omite.

export interface TipoCierreAdmin {
  id: string;
  label: string;
  status: string;        // NORMAL | UNDER_COMPLIANCE_REVIEW | FULLY_BLOCKED
  comment: string;       // NO_COMMENTS | UCR_CRIMINAL_RISK | COMPLIANCE_OFFICER_REQUEST
  observation: string;
  pep?: boolean;         // etiqueta legacy ("requiere formulario PEP"); NO dispara el PUT
  pepValue?: boolean;    // si está definido, ejecuta el paso PEP con este isPep
  riskLevel?: string;    // si está definido, ejecuta Risk Level (Bajo | Medio | Alto)
  lastStepDefault: boolean; // default del switch last-step según el status
}

export const TIPOS_CIERRE_ADMIN: TipoCierreAdmin[] = [
  {
    id: 'liberar_normal',
    label: 'Liberar Normal',
    status: 'NORMAL',
    comment: 'NO_COMMENTS',
    observation: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos Dentro de la matriz de riesgo',
    lastStepDefault: true,
  },
  {
    id: 'liberar_ucr',
    label: 'Liberar UCR',
    status: 'UNDER_COMPLIANCE_REVIEW',
    comment: 'UCR_CRIMINAL_RISK',
    observation: 'Cliente puede operar UCR con global66 caso liberado bajo logica de bandeja de casos Dentro de la matriz de riesgo',
    lastStepDefault: true,
  },
  {
    id: 'fully_blocked',
    label: 'Fully blocked',
    status: 'FULLY_BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    observation: 'Cliente NO puede operar con global66 caso liberado bajo logica de bandeja de casos Fuera de la matriz de riesgo',
    lastStepDefault: false,
  },
  {
    id: 'blocked_pep',
    label: 'Blocked + formulario PEP',
    status: 'FULLY_BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    observation: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos Dentro de la matriz de riesgo',
    pep: true,
    lastStepDefault: false,
  },
];

export const OFAC_PROVIDERS = ['REGCHECK', 'RISK_CONSULTING'] as const;
export const ADMIN_ASSIGNEE_DEFAULT = 'compliance.masivo@global66.com';

// Valores válidos de status/comment de la API de admin (editables en la ficha).
// Si la API acepta otros, agregarlos acá.
export const ADMIN_STATUS_OPTIONS = ['NORMAL', 'UNDER_COMPLIANCE_REVIEW', 'UNDER_COMPLIANCE_REVIEW_2', 'FULLY_BLOCKED'] as const;
export const ADMIN_COMMENT_OPTIONS = ['NO_COMMENTS', 'UCR_CRIMINAL_RISK', 'COMPLIANCE_OFFICER_REQUEST'] as const;

// Risk Level (paso PUT /customer) y provider PEP por defecto (PUT isPep).
export const RISK_LEVELS = ['Bajo', 'Medio', 'Alto'] as const;
export const PEP_PROVIDER_DEFAULT = 'PreLastStep';
