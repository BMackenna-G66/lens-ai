// Compatibilidad Firestore v1/v2 + inferencia de tipo de caso (PEP/OFAC).
// FASE 1: funciones PURAS (sin red, sin escrituras). No cambian la UI ni la
// clasificación de colas; solo derivan metadatos y rellenan defaults para que los
// casos históricos/incompletos sigan siendo válidos. Ref: documento maestro §§16-17.

import type { CasoSF, StoredScreening } from './casosService';
import type {
  TipoCasoCompliance, EstadoCaso, PrioridadCaso, NivelRiesgo,
  AsignacionCaso, SlaCaso, InvestigacionCaso, DecisionCompliance, RespuestaSalesforce,
} from './casosComplianceTypes';

// ─── Normalización de texto (mayúsculas, sin acentos) ────────────────────────────
export const normalizarTexto = (v: unknown): string =>
  (v === null || v === undefined ? '' : String(v))
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// ─── Inferencia de tipoCasoCompliance (PURA, §16) ────────────────────────────────
// Orden: (1) campo explícito del payload si existe; (2) inferir del Asunto
// normalizado; (3) PEP+OFAC → PEP_OFAC; (4) si no se puede, NO_DETERMINADO.
// NO cambia el criterio de la tab OFAC: es metadato/observabilidad aditiva.
export function inferirTipoCaso(caso: Pick<CasoSF, 'asunto' | 'datos'>): TipoCasoCompliance {
  const datos = caso.datos ?? {};
  // (1) Campo explícito (por si Salesforce ya lo envía; hoy no está garantizado).
  const explicito = normalizarTexto(
    datos['tipoCasoCompliance'] ?? datos['Tipo de Caso Compliance'] ?? datos['Tipo de Caso'] ?? '',
  );
  if (explicito) {
    const tienePepE = /\bPEP\b/.test(explicito);
    const tieneOfacE = /\bOFAC\b/.test(explicito);
    if (tienePepE && tieneOfacE) return 'PEP_OFAC';
    if (tieneOfacE) return 'OFAC';
    if (tienePepE) return 'PEP';
  }
  // (2) Inferir del Asunto.
  const a = normalizarTexto(caso.asunto);
  const tienePep = /\bPEP\b/.test(a);
  const tieneOfac = /\bOFAC\b/.test(a);
  if (tienePep && tieneOfac) return 'PEP_OFAC';
  if (tieneOfac) return 'OFAC';
  if (tienePep) return 'PEP';
  return 'NO_DETERMINADO';
}

// ─── Versión del bloque screening ────────────────────────────────────────────────
// v1 = shape actual (sin schemaVersion). v2 = shape extendido (con alertas, etc.).
export function screeningSchemaVersion(s?: StoredScreening | null): 1 | 2 {
  if (!s) return 1;
  const v = (s as { schemaVersion?: number }).schemaVersion;
  return v && v >= 2 ? 2 : 1;
}

// ─── Documento extendido con defaults (§17) ──────────────────────────────────────
// Vista de solo-lectura del caso con los bloques operacionales garantizados. NO
// persiste nada: es para que la UI/lógica trabajen sin condicionar cada campo.
// La escritura perezosa (guardar defaults) se hace en fases posteriores.
export interface CasoComplianceExt extends CasoSF {
  tipoCasoCompliance: TipoCasoCompliance;
  estadoCaso: EstadoCaso;
  prioridad: PrioridadCaso;
  nivelRiesgo: NivelRiesgo;
  asignacion: AsignacionCaso;
  sla: SlaCaso;
  investigacion: InvestigacionCaso;
  decisionCompliance: DecisionCompliance;
  respuestaSalesforce: RespuestaSalesforce;
  versionCaso: number;
}

type ConBloques = CasoSF & Partial<Omit<CasoComplianceExt, keyof CasoSF>>;

export function conDefaultsCompliance(caso: CasoSF): CasoComplianceExt {
  const c = caso as ConBloques;
  return {
    ...caso,
    tipoCasoCompliance: c.tipoCasoCompliance ?? inferirTipoCaso(caso),
    // Prioridad/riesgo: default conservador; el cálculo real es Fase 4 (§21).
    estadoCaso: c.estadoCaso ?? 'NUEVO',
    prioridad: c.prioridad ?? 'MEDIA',
    nivelRiesgo: c.nivelRiesgo ?? 'MEDIO',
    asignacion: c.asignacion ?? {
      cola: 'Coincidencia OFAC', analistaId: null, analistaNombre: null, asignadoEn: null, asignadoPor: null,
    },
    sla: c.sla ?? {
      iniciadoEn: caso.recibidoEn || null, venceEn: null, pausadoEn: null, minutosPausados: 0, estado: 'SIN_CONFIGURAR',
    },
    investigacion: c.investigacion ?? {
      version: 1, estado: 'NO_INICIADA', analistaId: null, iniciadaEn: null, actualizadaEn: null,
      resumen: null, hallazgos: [], evidencias: [], informacionSolicitada: [], recomendacion: null,
    },
    decisionCompliance: c.decisionCompliance ?? {
      estado: 'BORRADOR', tipo: null, reasonCode: null, justificacion: null,
      decididoPor: null, decididoEn: null, requiereAprobacion: false, aprobadoPor: null, aprobadoEn: null,
    },
    respuestaSalesforce: c.respuestaSalesforce ?? {
      estado: 'NO_ENVIADA', idempotencyKey: null, intentos: 0, ultimoIntentoEn: null,
      completadoEn: null, codigoError: null, referencia: null,
    },
    versionCaso: c.versionCaso ?? 1,
  };
}
