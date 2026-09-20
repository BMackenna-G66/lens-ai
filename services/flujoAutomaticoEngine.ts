// Motor del flujo automático (cola OFAC): cierra un caso aplicando la tipología
// que le corresponde según la conclusión del screening.
//
// Reusa EXACTAMENTE los mismos servicios que el cierre manual (mismas tipologías,
// mismo Worker, misma idempotencia), así que un caso cerrado a mano y uno cerrado
// por el flujo automático terminan igual. Solo corre si el mantenedor está
// prendido; el llamador se encarga de eso.

import { TIPOS_CIERRE, camposDeCierre } from './cierreTipos';
import { TIPOS_CIERRE_ADMIN, ADMIN_ASSIGNEE_DEFAULT, PEP_PROVIDER_DEFAULT, ofacFlagDe } from './cierreAdminTipos';
import { enviarResolucion } from './caseResolutionService';
import { enviarCierreAdmin, adminCierreDisponible } from './adminCierreService';
import { sfUpdateDisponible } from './salesforceCaseService';
import { registrarCierreCanal } from './caseStatusService';
import { registrarAuditoria } from './caseAuditService';
import { logCierre, ACTOR_SISTEMA } from './colasLogService';
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
  /** El cierre salió de la whitelist de clientes, no de la conclusión del screening. */
  porWhitelist?: string;
}

const paisCC = (p: string): string => (/colombia|^co$/i.test(p) ? 'CO' : 'CL');

// La DECISIÓN vive en `flujoDecision.ts`: es el mismo módulo que importa el
// Lambda desatendido, así que las reglas no pueden divergir entre el camino del
// navegador y el del servidor. Acá queda solo la EJECUCIÓN de los cierres, que
// sí depende de servicios con red y Firestore.
export {
  evaluarCasoAuto, retenidoPorDelito, motivosRetencion,
} from './flujoDecision';
export type { MotivoNoAuto, EvaluacionAuto, ScreeningParaAuto } from './flujoDecision';
import { evaluarCasoAuto } from './flujoDecision';
import type { ScreeningParaAuto } from './flujoDecision';
import { motivoWhitelistLegible } from './whitelistClientes';
import type { WhitelistClientes } from './whitelistClientes';

export async function procesarCasoAuto(
  caso: CasoSF,
  screening: ScreeningParaAuto | undefined,
  cfg: FlujoOfacConfig,
  actor?: Actor,
  // Opcional y al final: los llamadores que no la pasan se comportan igual que
  // antes de que la whitelist existiera.
  wl?: WhitelistClientes,
): Promise<ResultadoAuto | null> {
  const evaluacion = evaluarCasoAuto(caso, screening, cfg, wl);
  if (!evaluacion.automatizable || !evaluacion.tipologia) return null;
  const tipoId = evaluacion.tipologia;
  const decision = screening?.decision;

  // Por qué se cerró: la conclusión del screening, o una excepción cargada a
  // mano. Viaja al `detalle` de cada canal en Firestore y a la auditoría del
  // caso, que es donde queda buscable.
  //
  // NO se agrega una columna nueva a Redshift: el logger arma el SQL desde su
  // whitelist `TABLAS` y descarta en silencio lo que no conoce, así que una
  // columna nueva exige desplegar la DDL y el Lambda juntos. Eso es un cambio
  // aparte, no un efecto colateral de este.
  const porWhitelist = evaluacion.whitelist ? motivoWhitelistLegible(evaluacion.whitelist) : undefined;

  const res: ResultadoAuto = {
    caseId: caso.id, numeroCaso: caso.numeroCaso, tipologia: tipoId,
    sf: 'omitido', admin: 'omitido', porWhitelist,
  };

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
            await registrarCierreCanal(caso.id, 'sf', { ok: true, tipologia: tipoId, detalle: porWhitelist }, actor).catch(() => {});
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
            agent: ADMIN_ASSIGNEE_DEFAULT, ofacFlag: ofacFlagDe(tipo), ofacProvider: 'REGCHECK',
            countryCode: cc, lastStep: tipo.lastStepDefault,
            pepEnabled: tipo.pepValue !== undefined, pepValue: !!tipo.pepValue,
            pepProvider: PEP_PROVIDER_DEFAULT, pepCountryCode: cc, pepPosition: null,
            riskEnabled: !!tipo.riskLevel, riskLevel: tipo.riskLevel || undefined,
          });
          if (r.ok) {
            res.admin = 'ok';
            await registrarCierreCanal(caso.id, 'admin', { ok: true, tipologia: tipoId, detalle: porWhitelist }, actor).catch(() => {});
            logCierre(caso, 'ofac', {
              canal: 'ADMIN', ok: true, automatico: true, tipologia: tipoId,
              statusEnviado: tipo.status, ofacFlag: ofacFlagDe(tipo), lastStep: tipo.lastStepDefault,
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
    metadata: {
      tipologia: tipoId, decision: decision ?? null, sf: res.sf, admin: res.admin,
      detalle: res.detalle ?? null,
      // La traza de la excepción: quién la autorizó, por qué y con qué llave.
      // Sin esto, un cierre por whitelist es indistinguible de uno por screening
      // limpio, que es justo lo que no puede pasar con una lista que perdona todo.
      whitelist: evaluacion.whitelist
        ? {
            por: evaluacion.whitelist.por,
            valor: evaluacion.whitelist.valor,
            motivo: evaluacion.whitelist.entrada.motivo,
            referencia: evaluacion.whitelist.entrada.referencia || null,
            agregadoPor: evaluacion.whitelist.entrada.agregadoPor,
            agregadoEn: evaluacion.whitelist.entrada.agregadoEn || null,
          }
        : null,
    },
  }).catch(() => {});

  return res;
}
