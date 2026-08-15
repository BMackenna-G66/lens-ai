// Motor del flujo automático (cola OFAC): cierra un caso aplicando la tipología
// que le corresponde según la conclusión del screening.
//
// Reusa EXACTAMENTE los mismos servicios que el cierre manual (mismas tipologías,
// mismo Worker, misma idempotencia), así que un caso cerrado a mano y uno cerrado
// por el flujo automático terminan igual. Solo corre si el mantenedor está
// prendido; el llamador se encarga de eso.

import { TIPOS_CIERRE, camposDeCierre } from './cierreTipos';
import { TIPOS_CIERRE_ADMIN, ADMIN_ASSIGNEE_DEFAULT, PEP_PROVIDER_DEFAULT, ofacFlagPara } from './cierreAdminTipos';
import { enviarResolucion } from './caseResolutionService';
import { enviarCierreAdmin, adminCierreDisponible } from './adminCierreService';
import { sfUpdateDisponible } from './salesforceCaseService';
import { registrarCierreCanal, statusDeCaso } from './caseStatusService';
import { registrarAuditoria } from './caseAuditService';
import { logCierre, ACTOR_SISTEMA } from './colasLogService';
import { tipologiaParaDecision, paisHabilitado } from './flujoAutomaticoService';
import type { FlujoOfacConfig } from './flujoAutomaticoService';
import { categoriasSensibles } from './delitosSensibles';
import type { CasoSF } from './casosService';
import type { SFCaseUpdate } from './salesforceCaseService';
import type { Actor } from './caseWorkflowService';

export type EstadoCanal = 'ok' | 'error' | 'omitido' | 'ya_cerrado' | 'sin_customer_id';

export interface ResultadoAuto {
  caseId: string;
  numeroCaso: string;
  tipologia: string;
  sf: EstadoCanal;
  admin: EstadoCanal;
  detalle?: string;
}

const paisCC = (p: string): string => (/colombia|^co$/i.test(p) ? 'CO' : 'CL');

export type MotivoNoAuto =
  | 'flujo_apagado'
  | 'pais_apagado'
  | 'ya_cerrado'
  | 'sin_conclusion'      // screening sin resolver, o conclusión de revisión
  | 'delito_sensible'     // freno duro: tráfico/defraudaciones/armas/lavado/terrorismo
  | 'pep';                // freno duro: coincidencia PEP

export interface EvaluacionAuto {
  automatizable: boolean;
  tipologia?: string;
  motivo?: MotivoNoAuto;
  categorias?: string[];  // categorías sensibles que retuvieron el caso
}

// Screening mínimo que necesita la evaluación.
export interface ScreeningParaAuto {
  decision?: string;
  pep?: boolean;
  coincidencias?: Array<{ tipo?: string; detalle?: string }>;
}

// ¿Este caso se puede cerrar automáticamente? PURO, sin efectos.
// El orden de los cortes importa: el freno por delito sensible se evalúa SIEMPRE,
// incluso si la conclusión dice "Liberar".
export function evaluarCasoAuto(caso: CasoSF, screening: ScreeningParaAuto | undefined, cfg: FlujoOfacConfig): EvaluacionAuto {
  if (!cfg.enabled) return { automatizable: false, motivo: 'flujo_apagado' };
  if (!paisHabilitado(caso.pais, cfg)) return { automatizable: false, motivo: 'pais_apagado' };
  if (statusDeCaso(caso) === 'CERRADO') return { automatizable: false, motivo: 'ya_cerrado' };

  // Freno duro por delito sensible (antes de mirar la conclusión).
  const categorias = categoriasSensibles(screening?.coincidencias);
  if (categorias.length > 0) return { automatizable: false, motivo: 'delito_sensible', categorias };

  // Freno duro por PEP: un cliente PEP NO se libera solo. Su tratamiento correcto
  // es el bloqueo preventivo + formulario PEP, que hoy no está automatizado, así
  // que el caso queda entero para el analista (tampoco se bloquea solo).
  if (screening?.pep === true) return { automatizable: false, motivo: 'pep', categorias: ['PEP'] };

  const tipologia = tipologiaParaDecision(screening?.decision, cfg);
  if (!tipologia) return { automatizable: false, motivo: 'sin_conclusion' };
  return { automatizable: true, tipologia };
}

// Retención por delito sensible, independiente de la config (para mostrarla en la
// UI aunque el flujo esté apagado).
export const retenidoPorDelito = (screening: ScreeningParaAuto | undefined): string[] =>
  categoriasSensibles(screening?.coincidencias);

// TODOS los motivos por los que un caso queda fuera del automático (delitos + PEP).
// Es lo que muestra la UI: al analista le importa que está retenido y por qué.
export const motivosRetencion = (screening: ScreeningParaAuto | undefined): string[] => [
  ...categoriasSensibles(screening?.coincidencias),
  ...(screening?.pep === true ? ['PEP'] : []),
];

// Cierra un caso automáticamente. Devuelve null si no era candidato (flujo o país
// apagado, ya cerrado, conclusión no automatizable, o retenido por delito sensible).
export async function procesarCasoAuto(
  caso: CasoSF,
  screening: ScreeningParaAuto | undefined,
  cfg: FlujoOfacConfig,
  actor?: Actor,
): Promise<ResultadoAuto | null> {
  const evaluacion = evaluarCasoAuto(caso, screening, cfg);
  if (!evaluacion.automatizable || !evaluacion.tipologia) return null;
  const tipoId = evaluacion.tipologia;
  const decision = screening?.decision;

  const res: ResultadoAuto = { caseId: caso.id, numeroCaso: caso.numeroCaso, tipologia: tipoId, sf: 'omitido', admin: 'omitido' };

  // ── Canal Salesforce ────────────────────────────────────────────────────────
  if (cfg.cerrarSF) {
    if (caso.cierres?.sf?.ok === true) res.sf = 'ya_cerrado';
    else if (!sfUpdateDisponible()) { res.sf = 'error'; res.detalle = 'Proxy no configurado'; }
    else {
      const tipo = TIPOS_CIERRE.find(t => t.id === tipoId);
      if (!tipo) { res.sf = 'error'; res.detalle = `Tipología SF desconocida: ${tipoId}`; }
      else {
        try {
          const payload = { CaseNumber: caso.numeroCaso, ...camposDeCierre(tipo, caso.pais) } as SFCaseUpdate;
          const r = await enviarResolucion(caso.id, payload, actor);
          if (r.yaEnviada || r.sf?.ok) {
            res.sf = 'ok';
            await registrarCierreCanal(caso.id, 'sf', { ok: true, tipologia: tipoId }, actor).catch(() => {});
            logCierre(caso, 'ofac', { canal: 'SF', ok: true, automatico: true, tipologia: tipoId }, ACTOR_SISTEMA);
          } else {
            res.sf = 'error';
            res.detalle = r.sf?.errors?.join('; ') ?? `HTTP ${r.sf?.status ?? 0}`;
          }
        } catch (e) { res.sf = 'error'; res.detalle = (e as Error).message; }
      }
    }
  }

  // ── Canal Admin (bloqueo/desbloqueo del cliente) ────────────────────────────
  if (cfg.cerrarAdmin) {
    const customerId = String(caso.datos?.['Id interno del usuario'] ?? '').trim();
    if (caso.cierres?.admin?.ok === true) res.admin = 'ya_cerrado';
    else if (!customerId) res.admin = 'sin_customer_id';
    else if (!adminCierreDisponible()) { res.admin = 'error'; res.detalle = res.detalle ?? 'Proxy no configurado'; }
    else {
      const tipo = TIPOS_CIERRE_ADMIN.find(t => t.id === tipoId);
      if (!tipo) { res.admin = 'error'; res.detalle = `Tipología Admin desconocida: ${tipoId}`; }
      else {
        const cc = paisCC(caso.pais);
        try {
          const r = await enviarCierreAdmin({
            customerIds: [customerId], status: tipo.status, comment: tipo.comment, observation: tipo.observation,
            agent: ADMIN_ASSIGNEE_DEFAULT, ofacFlag: ofacFlagPara(tipo.status), ofacProvider: 'REGCHECK',
            countryCode: cc, lastStep: tipo.lastStepDefault,
            pepEnabled: tipo.pepValue !== undefined, pepValue: !!tipo.pepValue,
            pepProvider: PEP_PROVIDER_DEFAULT, pepCountryCode: cc, pepPosition: null,
            riskEnabled: !!tipo.riskLevel, riskLevel: tipo.riskLevel || undefined,
          });
          if (r.ok) {
            res.admin = 'ok';
            await registrarCierreCanal(caso.id, 'admin', { ok: true, tipologia: tipoId }, actor).catch(() => {});
            logCierre(caso, 'ofac', {
              canal: 'ADMIN', ok: true, automatico: true, tipologia: tipoId,
              statusEnviado: tipo.status, ofacFlag: ofacFlagPara(tipo.status), lastStep: tipo.lastStepDefault,
            }, ACTOR_SISTEMA);
          } else {
            res.admin = 'error';
            res.detalle = r.error ?? res.detalle ?? 'Admin devolvió error';
          }
        } catch (e) { res.admin = 'error'; res.detalle = (e as Error).message; }
      }
    }
  }

  await registrarAuditoria(caso.id, {
    tipo: 'CIERRE_AUTOMATICO', actorId: actor?.uid ?? 'system', actorTipo: 'SYSTEM',
    correlationId: caso.id, versionCaso: 1,
    metadata: { tipologia: tipoId, decision: decision ?? null, sf: res.sf, admin: res.admin, detalle: res.detalle ?? null },
  }).catch(() => {});

  return res;
}
