// Motor del flujo automático (cola OFAC): cierra un caso aplicando la tipología
// que le corresponde según la conclusión del screening.
//
// Reusa EXACTAMENTE los mismos servicios que el cierre manual (mismas tipologías,
// mismo Worker, misma idempotencia), así que un caso cerrado a mano y uno cerrado
// por el flujo automático terminan igual. Solo corre si el mantenedor está
// prendido; el llamador se encarga de eso.

import { TIPOS_CIERRE, camposDeCierre } from './cierreTipos';
import { TIPOS_CIERRE_ADMIN, ADMIN_ASSIGNEE_DEFAULT, PEP_PROVIDER_DEFAULT } from './cierreAdminTipos';
import { enviarResolucion } from './caseResolutionService';
import { enviarCierreAdmin, adminCierreDisponible } from './adminCierreService';
import { sfUpdateDisponible } from './salesforceCaseService';
import { registrarCierreCanal, statusDeCaso } from './caseStatusService';
import { registrarAuditoria } from './caseAuditService';
import { tipologiaParaDecision } from './flujoAutomaticoService';
import type { FlujoOfacConfig } from './flujoAutomaticoService';
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

// ¿Este caso es candidato al cierre automático? (puro, sin efectos)
export function esCandidatoAuto(caso: CasoSF, decision: string | undefined, cfg: FlujoOfacConfig): string | null {
  if (!cfg.enabled) return null;
  if (statusDeCaso(caso) === 'CERRADO') return null;
  return tipologiaParaDecision(decision, cfg);
}

// Cierra un caso automáticamente. Devuelve null si no era candidato.
export async function procesarCasoAuto(
  caso: CasoSF,
  decision: string | undefined,
  cfg: FlujoOfacConfig,
  actor?: Actor,
): Promise<ResultadoAuto | null> {
  const tipoId = esCandidatoAuto(caso, decision, cfg);
  if (!tipoId) return null;

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
            agent: ADMIN_ASSIGNEE_DEFAULT, ofacFlag: false, ofacProvider: 'REGCHECK',
            countryCode: cc, lastStep: tipo.lastStepDefault,
            pepEnabled: tipo.pepValue !== undefined, pepValue: !!tipo.pepValue,
            pepProvider: PEP_PROVIDER_DEFAULT, pepCountryCode: cc, pepPosition: null,
            riskEnabled: !!tipo.riskLevel, riskLevel: tipo.riskLevel || undefined,
          });
          if (r.ok) {
            res.admin = 'ok';
            await registrarCierreCanal(caso.id, 'admin', { ok: true, tipologia: tipoId }, actor).catch(() => {});
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
