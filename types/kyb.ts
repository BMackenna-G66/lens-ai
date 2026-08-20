// Tipos de la cola de trabajo KYB (empresas / B2B).
//
// Módulo PARALELO al de la Bandeja de Casos: colección propia (`kyb_empresas`),
// servicios de escritura propios y decisiones propias. Comparte solo los motores
// puros y los catálogos que no tienen estado (delitos sensibles, normalizadores).
//
// La decisión NO reusa `TipoDecision` de la Bandeja a propósito: esa union está
// consumida por switches exhaustivos en CasosInbox.tsx (3225 líneas) y ampliarla
// arrastraría todo ese archivo. Acá va una union propia.

import type { LadoCanonico, EstadoAdminEmpresa } from './kybCanonico';
import type { ResultadoComponente } from './kybMatriz';

export const KYB_COLLECTION = 'kyb_empresas';

// ── Estado en la cola ────────────────────────────────────────────────────────
export type StatusKyb = 'ABIERTO' | 'GESTIONANDO' | 'CERRADO';
export type EstadoAnalisisKyb = 'SIN_ANALIZAR' | 'ANALIZANDO' | 'COMPLETO' | 'INCOMPLETO' | 'ERROR';

// ── Decisión del analista ────────────────────────────────────────────────────
export type TipoDecisionKyb =
  | 'APROBAR'
  | 'RECHAZAR'
  | 'FALTA_INFORMACION'
  | 'APETITO_RIESGO'
  | 'INSTITUCIONAL';

// Cuáles exigen checker (maker ≠ approver). Aprobar queda final por decisión de
// negocio; el resto y TODO lo automático necesitan un segundo par de ojos.
export const DECISIONES_CON_CHECKER: ReadonlySet<TipoDecisionKyb> = new Set<TipoDecisionKyb>([
  'RECHAZAR', 'APETITO_RIESGO', 'INSTITUCIONAL',
]);

export interface DecisionKyb {
  tipo: TipoDecisionKyb;
  // Razón tipificada. OJO: Admin NO expone un catálogo de razones de rechazo
  // (el endpoint `rejections/reasons` es el estado del onboarding, verificado),
  // así que el catálogo es propio — ver services/kyb/kybRazonesRechazo.ts.
  reasonCode?: string | null;
  comentario?: string;
  actorId: string;
  actorNombre: string;
  actorTipo: 'USER' | 'SYSTEM';
  automatica: boolean;
  decididaEn: string;              // ISO
  // Aprobación del checker cuando corresponde.
  aprobacion?: {
    estado: 'PENDIENTE_APROBACION' | 'APROBADA' | 'RECHAZADA';
    checkerId?: string | null;
    checkerNombre?: string | null;
    resueltaEn?: string | null;
    motivo?: string | null;
  };
}

// ── Resultado de una corrida de análisis ─────────────────────────────────────
// Vive en la SUBCOLECCIÓN `kyb_empresas/{companyId}/analisis/{runId}`, no en el
// doc padre: Firestore topa en 1 MiB por documento y la matriz completa con las
// personas de las cuatro fuentes no cabe. El `rawText` del OCR no se persiste.
export interface AnalisisKyb {
  runId: string;
  companyId: string;
  corridaEn: string;               // ISO
  estado: EstadoAnalisisKyb;
  // Hash de los documentos analizados. Si el cliente sube uno nuevo, el hash
  // cambia y el análisis se marca desactualizado sin tener que re-analizar.
  hashDocumentos?: string;
  certidumbre: number | null;      // 0..100 · null = sin analizar, NUNCA 0
  razones: RazonCertidumbre[];     // suman exactamente `certidumbre`
  componentes: ResultadoComponente[];
  alertas: AlertaKyb[];
  lens?: LadoCanonico;
  admin?: LadoCanonico;
  estadoAdmin?: EstadoAdminEmpresa;
  // Screening criminal de la empresa y sus relacionados, con el catálogo de
  // delitos de Chile (el mismo que usa la cola de Salesforce). Se guarda completo
  // porque su ausencia y su resultado limpio NO son lo mismo.
  screening?: unknown;
  // Qué faltó, cuando el estado es INCOMPLETO. Es lo que impide decidir a ciegas.
  faltantes?: string[];
  mensajeError?: string;
}

// Cada línea que explica el porcentaje. Invariante del motor:
// `razones.reduce((s, r) => s + r.delta, 0) === certidumbre`.
export interface RazonCertidumbre {
  concepto: string;
  delta: number;                   // puede ser negativo (penalizaciones)
  detalle?: string;
}

// ── Alertas KYB ──────────────────────────────────────────────────────────────
export type SeveridadAlertaKyb = 'CRITICA' | 'PREVENTIVA' | 'INFORMATIVA';
export type EstadoAlertaKyb = 'ABIERTA' | 'EN_REVISION' | 'SUPRIMIDA' | 'RESUELTA';

export interface AlertaKyb {
  id: string;
  codigo: string;                  // DOC_001, etc.
  label: string;
  severidad: SeveridadAlertaKyb;
  estado: EstadoAlertaKyb;
  detalle?: string;
  // false = la alerta existe en el catálogo pero HOY no se puede evaluar por
  // falta de fuente. Se muestra igual, para que el inventario sea completo y no
  // parezca que no hay hallazgos.
  evaluable: boolean;
  faltante?: string;               // qué falta para poder evaluarla
}

// ── Item de la cola ─────────────────────────────────────────────────────────
// Doc PADRE, liviano a propósito: lo que se lista en la cola y nada más. El
// análisis completo vive en la subcolección.
export interface EmpresaKyb {
  companyId: string;               // = doc id
  razonSocial: string;
  identificacion?: string;
  pais?: string;
  // Denormalizado desde Admin para poder filtrar la cola sin abrir cada ficha.
  complianceStatus?: string;
  kycStage1?: string;
  riskLevel?: string;
  institucional?: boolean | null;

  // Cola
  enCola: boolean;                 // se indexa: `enCola ASC, recibidoEn DESC`
  statusKyb: StatusKyb;
  recibidoEn: string;              // ISO
  origen: 'manual' | 'barrido' | 'salesforce';
  prioridad?: string;
  estadoCaso?: string;
  asignacion?: {
    analistaId?: string | null;
    analistaNombre?: string | null;
    asignadoEn?: string | null;
    asignadoPor?: string | null;
  };

  // Resumen del último análisis, para la fila de la cola. El detalle está en la
  // subcolección; acá va solo lo que se muestra en la tabla.
  ultimoAnalisis?: {
    runId: string;
    corridaEn: string;
    estado: EstadoAnalisisKyb;
    certidumbre: number | null;
    alertasCriticas: number;
    hashDocumentos?: string;
    // Sugerencia del motor criminal y si el screening quedó verificado limpio.
    // Van en el doc padre para poder mostrarlos en la cola sin abrir la ficha.
    sugerenciaCriminal?: string;
    screeningLimpio?: boolean;
    screeningResumen?: string;
  };

  decision?: DecisionKyb;

  // Salidas: qué canales se aplicaron. `no_aplica` para los que no corresponden
  // en esta empresa (por ejemplo Salesforce si el caso no vino de ahí).
  canales?: {
    lens?: EstadoCanalKyb;
    admin?: EstadoCanalKyb;
    salesforce?: EstadoCanalKyb;
  };

  // Si cambia el kycStage de una empresa ya cerrada NO se reabre sola: se marca
  // acá y se notifica, para que la reapertura sea una decisión de alguien.
  reingresoPendiente?: boolean;
  reingresoMotivo?: string | null;
}

export interface EstadoCanalKyb {
  estado: 'pendiente' | 'ok' | 'error' | 'no_aplica' | 'manual';
  en?: string | null;
  detalle?: string | null;
}

// El caso está cerrado cuando todos los canales REQUERIDOS quedaron ok o manual.
// `no_aplica` no bloquea. Es la generalización que la Bandeja no tiene (allá el
// cierre está atado a exactamente dos canales).
export function canalesCompletos(c: EmpresaKyb['canales'] | undefined): boolean {
  const vals = Object.values(c ?? {});
  if (vals.length === 0) return false;
  return vals.every(v => v?.estado === 'ok' || v?.estado === 'manual' || v?.estado === 'no_aplica');
}
