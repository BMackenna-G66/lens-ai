// Tipos y catálogos centrales de la evolución PEP/OFAC de la Bandeja de Casos.
// FASE 1: solo tipos + estados + transiciones (sin lógica de red ni cambios de UI).
// Todos los bloques operacionales son OPCIONALES: los casos históricos siguen válidos.
// Ref: documento maestro §§16-18.

// ─── Clasificación de compliance ────────────────────────────────────────────────
export type TipoCasoCompliance = 'OFAC' | 'PEP' | 'PEP_OFAC' | 'NO_DETERMINADO';

// ─── Estados operacionales del caso ─────────────────────────────────────────────
export type EstadoCaso =
  | 'NUEVO'
  | 'EN_COLA'
  | 'ASIGNADO'
  | 'EN_REVISION'
  | 'PENDIENTE_INFORMACION'
  | 'PENDIENTE_APROBACION'
  | 'ESCALADO'
  | 'CERRADO'
  | 'CANCELADO';

export type PrioridadCaso = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export type EstadoAlerta = 'ABIERTA' | 'EN_REVISION' | 'SUPRIMIDA' | 'RESUELTA' | 'ERROR';

export type TipoDecision =
  | 'FALSO_POSITIVO'
  | 'PEP_CONFIRMADO'
  | 'OFAC_CONFIRMADO'
  | 'INCONCLUSO'
  | 'DUPLICADO'
  | 'ESCALAR';

export type EstadoDecision = 'BORRADOR' | 'PENDIENTE_APROBACION' | 'APROBADA' | 'RECHAZADA';
export type EstadoRespuesta = 'NO_ENVIADA' | 'ENVIANDO' | 'ENVIADA' | 'ERROR';

// ─── Transiciones válidas del caso (§18) ────────────────────────────────────────
// Máquina de estados. Se USA en Fase 4 (caseWorkflowService); acá solo se declara.
export const TRANSICIONES_CASO: Record<EstadoCaso, EstadoCaso[]> = {
  NUEVO: ['EN_COLA'],
  EN_COLA: ['ASIGNADO'],
  ASIGNADO: ['EN_REVISION'],
  EN_REVISION: ['PENDIENTE_INFORMACION', 'PENDIENTE_APROBACION', 'ESCALADO', 'CERRADO'],
  PENDIENTE_INFORMACION: ['EN_REVISION'],
  PENDIENTE_APROBACION: ['EN_REVISION', 'CERRADO'],
  ESCALADO: ['EN_REVISION'],
  CERRADO: [],
  CANCELADO: [],
};

export const esTransicionValida = (desde: EstadoCaso, hacia: EstadoCaso): boolean =>
  (TRANSICIONES_CASO[desde] ?? []).includes(hacia);

// ─── Bloques operacionales del documento extendido (§17) ─────────────────────────
export interface AsignacionCaso {
  cola: string;
  analistaId: string | null;
  analistaNombre: string | null;
  asignadoEn: string | null;
  asignadoPor: string | null;
}

export interface SlaCaso {
  iniciadoEn: string | null;
  venceEn: string | null;
  pausadoEn: string | null;
  minutosPausados: number;
  estado: 'SIN_CONFIGURAR' | 'EN_CURSO' | 'VENCIDO' | 'PAUSADO' | 'CUMPLIDO';
}

export interface AlertaScreening {
  alertaId: string;
  dedupKey: string;
  tipo: TipoCasoCompliance;
  fuente: string;
  providerMatchId: string | null;
  lista: string;
  nombreCoincidente: string;
  aliases: string[];
  scoreProveedor: number | null;
  scoreNormalizado: number | null;
  riesgo: NivelRiesgo;
  estado: EstadoAlerta;
  coincidencia: {
    fechaNacimiento: string | null;
    nacionalidades: string[];
    paises: string[];
    documentosEnmascarados: string[];
  };
  evidencias: unknown[];
  creadaEn: string;
  actualizadaEn: string;
}

export interface InvestigacionCaso {
  version: number;
  estado: 'NO_INICIADA' | 'EN_CURSO' | 'COMPLETA';
  analistaId: string | null;
  iniciadaEn: string | null;
  actualizadaEn: string | null;
  resumen: string | null;
  hallazgos: unknown[];
  evidencias: unknown[];
  informacionSolicitada: unknown[];
  recomendacion: string | null;
}

export interface DecisionCompliance {
  estado: EstadoDecision;
  tipo: TipoDecision | null;
  reasonCode: string | null;
  justificacion: string | null;
  decididoPor: string | null;
  decididoEn: string | null;
  requiereAprobacion: boolean;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
}

export interface RespuestaSalesforce {
  estado: EstadoRespuesta;
  idempotencyKey: string | null;
  intentos: number;
  ultimoIntentoEn: string | null;
  completadoEn: string | null;
  codigoError: string | null;
  referencia: string | null;
}

// ─── Auditoría operacional (§22) ─────────────────────────────────────────────────
export type TipoEventoAuditoria =
  | 'CASO_RECIBIDO'
  | 'SCREENING_INICIADO'
  | 'SCREENING_COMPLETADO'
  | 'SCREENING_ERROR'
  | 'CASO_ASIGNADO'
  | 'CASO_LIBERADO'
  | 'ESTADO_CAMBIADO'
  | 'PRIORIDAD_CAMBIADA'
  | 'INVESTIGACION_ACTUALIZADA'
  | 'DECISION_REGISTRADA'
  | 'DECISION_APROBADA'
  | 'RESPUESTA_SF_INICIADA'
  | 'RESPUESTA_SF_COMPLETADA'
  | 'RESPUESTA_SF_ERROR'
  | 'CIERRE_ADMIN'
  | 'CASO_RECONSULTADO'
  | 'STATUS_CAMBIADO'
  | 'CIERRE_AUTOMATICO';

export interface EventoAuditoriaCaso {
  eventId: string;
  numeroCaso: string;
  tipo: TipoEventoAuditoria;
  actorId: string;
  actorTipo: 'USER' | 'SYSTEM';
  timestamp: string;
  correlationId: string;
  versionCaso: number;
  cambios?: Record<string, { anterior: unknown; nuevo: unknown }>;
  metadata?: Record<string, unknown>;
}
