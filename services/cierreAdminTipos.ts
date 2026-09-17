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
  // Si el paso 1 (blacklist/OFAC) marca al cliente. Es EXPLÍCITO por tipología y
  // ya no se deriva del status: al bajar «Fully blocked» a BLOCKED, derivarlo
  // habría apagado la marca en silencio. El paso 1 no migra y no cambia.
  ofacFlag?: boolean;
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
    // El id NO cambia: `flujoDecision.ts` y `cierreTipos.ts` lo referencian, y
    // es lo que se guarda en la auditoría. Cambiarlo rompería el histórico.
    label: 'Bloqueado',
    // Decisión del 17-09-2026: baja de FULLY_BLOCKED a BLOCKED "de momento",
    // hasta medir la gravedad real del bloqueo total.
    //
    // Además queda ALINEADO con el catálogo nuevo, que era el problema de
    // fondo: `COMPLIANCE_OFFICER_REQUEST` es id 40 y produce **BLOCKED**, no
    // FULLY_BLOCKED. Como en el modelo nuevo el estado se DERIVA del comment,
    // mandar FULLY_BLOCKED con ese comment dejaba al cliente en BLOCKED igual,
    // sin fallar — o sea, menos bloqueado de lo que el analista decidió.
    //
    // Para volver a bloqueo total hay que cambiar las DOS cosas: el status y el
    // comment (a uno FULLY_BLOCKED del área COMPLIANCE, p. ej. `OFAC_CONFIRMED`
    // o `BLACK_LIST_G66`). Cambiar solo el status no hace nada.
    status: 'BLOCKED',
    comment: 'COMPLIANCE_OFFICER_REQUEST',
    // Se mantiene la marca de blacklist que tenía cuando era FULLY_BLOCKED: el
    // paso 1 no migra y esta decisión no era sobre él.
    ofacFlag: true,
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
    // `PEP_REQUEST` y no `COMPLIANCE_OFFICER_REQUEST`: en el modelo viejo las
    // dos conclusiones compartían comment y se distinguían por `status`. El
    // catálogo nuevo es una matriz 1:1 status × comment, así que ahora Admin
    // puede separarlas en su propio registro.
    //
    // PENDIENTE: confirmar el nombre exacto contra el volcado de
    // `GET /customer/bo/compliance/comments/all`. Si no existe, NO falla
    // ruidosamente: cae al genérico `OTHER_BLOCKED` y se pierde la distinción
    // en silencio, salvo por la alerta en #compliance-status-comment-alerts.
    comment: 'PEP_REQUEST',
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
export const ADMIN_COMMENT_OPTIONS = ['NO_COMMENTS', 'UCR_CRIMINAL_RISK', 'COMPLIANCE_OFFICER_REQUEST', 'PEP_REQUEST'] as const;

// El flag OFAC / blacklist del paso 1. Regla única para el cierre individual, el
// masivo y el flujo automático.
//
// Sale del campo `ofacFlag` de la tipología y NO del status. Antes se derivaba
// (`status === 'FULLY_BLOCKED'`), y eso ataba dos decisiones que no tienen por
// qué ir juntas: al bajar «Fully blocked» a BLOCKED, la marca de blacklist se
// habría apagado sola, sin que nadie lo pidiera ni lo viera.
export const ofacFlagDe = (tipo: Pick<TipoCierreAdmin, 'ofacFlag'> | undefined): boolean =>
  tipo?.ofacFlag === true;

/** @deprecated Derivaba el flag del status. Usar `ofacFlagDe(tipo)`. */
export const ofacFlagPara = (status: string): boolean => status === 'FULLY_BLOCKED';

// Risk Level (paso PUT /customer) y provider PEP por defecto (PUT isPep).
export const RISK_LEVELS = ['Bajo', 'Medio', 'Alto'] as const;
export const PEP_PROVIDER_DEFAULT = 'PreLastStep';
