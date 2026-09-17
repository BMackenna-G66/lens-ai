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

// ── El modelo nuevo de ms-customer ─────────────────────────────────────────
// Admin dejó de "poner un estado". Ahora se CREA un registro de bloqueo o se
// RESUELVEN los vigentes, y el estado efectivo del cliente es el más restrictivo
// entre los no resueltos.
//
// Como el caso entra siempre en FULLY_BLOCKED (lo crea el bot), tres de las
// cuatro conclusiones BAJAN la restricción y por eso casi todas tienen que
// resolver además de crear.
//
// `status` NO desaparece de acá aunque desaparezca de la API: sigue siendo
// nuestro discriminador interno y de él dependen `ofacFlagPara` (paso 1,
// blacklist, que NO migra) y el last-step (paso 5, tampoco migra). Lo que cambia
// es que ya no viaja en la URL del paso 2.
export type AccionAdmin =
  | 'resolver'           // solo resolver los bloqueos vigentes
  | 'crear'              // solo crear uno nuevo
  | 'crear_y_resolver';  // crear el nuevo y DESPUÉS resolver los viejos

export interface TipoCierreAdmin {
  id: string;
  label: string;
  status: string;        // NORMAL | UNDER_COMPLIANCE_REVIEW | FULLY_BLOCKED
  comment: string;       // NO_COMMENTS | UCR_CRIMINAL_RISK | COMPLIANCE_OFFICER_REQUEST
  observation: string;
  // Qué hacer en el modelo nuevo de ms-customer. El Worker lo usa solo cuando
  // está en modo `nuevo`; en modo `anterior` lo ignora por completo.
  accion: AccionAdmin;
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
    // Liberar del todo: no se crea nada, solo se resuelve lo que hay vigente.
    accion: 'resolver',
    lastStepDefault: true,
  },
  {
    id: 'liberar_ucr',
    label: 'Liberar UCR',
    status: 'UNDER_COMPLIANCE_REVIEW',
    comment: 'UCR_CRIMINAL_RISK',
    observation: 'Cliente puede operar UCR con global66 caso liberado bajo logica de bandeja de casos Dentro de la matriz de riesgo',
    // Baja la restricción: crea el UCR y resuelve el FULLY_BLOCKED del bot.
    accion: 'crear_y_resolver',
    lastStepDefault: true,
  },
  {
    id: 'fully_blocked',
    label: 'Fully blocked',
    status: 'FULLY_BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    observation: 'Cliente NO puede operar con global66 caso liberado bajo logica de bandeja de casos Fuera de la matriz de riesgo',
    // Decisión de negocio (17-09-2026): queda registro propio de que compliance
    // revisó Y se resuelve el del bot, para que NO queden dos bloqueos vigentes
    // sobre el mismo cliente. Con dos, una liberación futura tendría que
    // resolver los dos: si resuelve uno, el cliente sigue bloqueado y parece
    // que la cola falló.
    accion: 'crear_y_resolver',
    lastStepDefault: false,
  },
  {
    id: 'blocked_pep',
    label: 'Blocked + formulario PEP',
    // Bloqueo preventivo por formulario PEP: es BLOCKED, no FULLY_BLOCKED.
    status: 'BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    observation: 'Cliente puede operar con global66 caso liberado bajo logica de bandeja de casos Dentro de la matriz de riesgo',
    // Baja la restricción: crea el BLOCKED y resuelve el FULLY_BLOCKED del bot.
    accion: 'crear_y_resolver',
    pep: true,
    lastStepDefault: false,
  },
];

export const OFAC_PROVIDERS = ['REGCHECK', 'RISK_CONSULTING'] as const;
export const ADMIN_ASSIGNEE_DEFAULT = 'compliance.masivo@global66.com';

// Valores válidos de status/comment de la API de admin (editables en la ficha).
// Si la API acepta otros, agregarlos acá.
export const ADMIN_STATUS_OPTIONS = ['NORMAL', 'UNDER_COMPLIANCE_REVIEW', 'UNDER_COMPLIANCE_REVIEW_2', 'BLOCKED', 'FULLY_BLOCKED'] as const;
export const ADMIN_COMMENT_OPTIONS = ['NO_COMMENTS', 'UCR_CRIMINAL_RISK', 'COMPLIANCE_OFFICER_REQUEST'] as const;

// El flag OFAC / blacklist va en true SOLO cuando el cliente queda Fully Blocked.
// Regla única para el cierre individual, el masivo y el flujo automático.
//
// Sigue dependiendo de `status` y eso está bien: el paso 1 (blacklist) NO migra
// a ms-customer. `status` desaparece de la URL del paso 2, no de nuestro modelo.
export const ofacFlagPara = (status: string): boolean => status === 'FULLY_BLOCKED';

// Risk Level (paso PUT /customer) y provider PEP por defecto (PUT isPep).
export const RISK_LEVELS = ['Bajo', 'Medio', 'Alto'] as const;
export const PEP_PROVIDER_DEFAULT = 'PreLastStep';
