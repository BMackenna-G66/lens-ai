// Motor del flujo automático de la cola REMESA.
//
// Aparte del de OFAC (flujoAutomaticoEngine.ts) a propósito: acá se libera la
// TRANSACCIÓN, no se toca al cliente, y los frenos no son los mismos.
//
// Frenos (en orden). El primero que aplica detiene el caso:
//   1. flujo apagado
//   2. caso ya cerrado
//   3. sin screening resuelto (o el proveedor falló) → nunca se libera a ciegas
//   4. beneficiario sin nacionalidad → no se pudo elegir proveedor
//   5. DELITO SENSIBLE → freno duro, igual que en OFAC
//   6. coincidencia en listas de sanciones (OFAC/ONU/UE/GAFI) → queda al analista
//
// Dos diferencias deliberadas con OFAC, las dos porque acá se libera una
// transacción puntual y no se vincula a un cliente:
//   · **PEP NO retiene la remesa.** En OFAC un cliente PEP no se libera solo
//     porque lo que corresponde es el bloqueo preventivo + formulario PEP.
//   · **Las causas penales no sensibles tampoco retienen.** La cola de remesas
//     tiene un apetito de riesgo más amplio: un antecedente viejo y no sensible
//     no dice nada sobre esta transferencia. Los delitos sensibles sí retienen.
//
// Funciones PURAS (sin red ni escrituras) para poder testearlas solas.

import type { CasoSF } from './casosService';
import type { FlujoRemesaConfig } from './flujoAutomaticoService';
import { camposDeCierreRemesa, tipoRemesaPorId } from './cierreRemesaTipos';
import { enviarResolucion } from './caseResolutionService';
import { sfUpdateDisponible, type SFCaseUpdate } from './salesforceCaseService';
import { enviarCierreRemesaAdmin, remesaAdminDisponible } from './remesaAdminService';
import { registrarCierreCanal } from './caseStatusService';
import { logCierre, logLiberacionRemesa } from './colasLogService';
import type { Actor } from './caseWorkflowService';

// La DECISIÓN vive en `flujoDecision.ts`, el mismo módulo que importa el Lambda
// desatendido: incluido el matiz de que PEP no retiene la remesa, que es justo lo
// que se perdería si se reimplementara del otro lado. Acá queda la EJECUCIÓN.
export {
  evaluarRemesaAuto, retenidoPorDelitoRemesa, motivoRemesaLegible,
} from './flujoDecision';
export type { MotivoNoAutoRemesa, EvaluacionRemesa, ScreeningRemesaParaAuto } from './flujoDecision';
import { evaluarRemesaAuto } from './flujoDecision';
import type { ScreeningRemesaParaAuto } from './flujoDecision';

// ── Ejecución ────────────────────────────────────────────────────────────────
// Cierra el caso en Salesforce y libera la transacción en Admin, según config.
// Devuelve null si el caso NO era automatizable (no hace nada).



export type EstadoCanalRemesa = 'ok' | 'error' | 'omitido' | 'ya_cerrado' | 'sin_transaccion';

export interface ResultadoRemesaAuto {
  caseId: string;
  numeroCaso: string;
  tipologia: string;
  sf: EstadoCanalRemesa;
  admin: EstadoCanalRemesa;
  detalle?: string;
}

const ACTOR_SISTEMA = { uid: 'system', nombre: 'flujo automático' } as unknown as Actor;

export async function procesarRemesaAuto(
  caso: CasoSF,
  transaccion: string,
  screening: ScreeningRemesaParaAuto | undefined,
  cfg: FlujoRemesaConfig,
  actor?: Actor,
): Promise<ResultadoRemesaAuto | null> {
  const evaluacion = evaluarRemesaAuto(caso, screening, cfg);
  if (!evaluacion.automatizable || !evaluacion.tipologia) return null;
  const tipo = tipoRemesaPorId(evaluacion.tipologia);
  if (!tipo) return null;

  const res: ResultadoRemesaAuto = {
    caseId: caso.id, numeroCaso: caso.numeroCaso, tipologia: tipo.id, sf: 'omitido', admin: 'omitido',
  };

  // ── Canal Salesforce ──
  if (cfg.cerrarSF) {
    if (caso.cierres?.sf?.ok === true) res.sf = 'ya_cerrado';
    else if (!sfUpdateDisponible()) { res.sf = 'error'; res.detalle = 'Proxy no configurado'; }
    else {
      try {
        const payload = { CaseNumber: caso.numeroCaso, ...camposDeCierreRemesa(tipo, caso.pais) } as SFCaseUpdate;
        const r = await enviarResolucion(caso.id, payload, actor);
        if (r.yaEnviada || r.sf?.ok) {
          res.sf = 'ok';
          await registrarCierreCanal(caso.id, 'sf', { ok: true, tipologia: tipo.id }, actor).catch(() => {});
          logCierre(caso, 'remesa', { canal: 'SF', ok: true, automatico: true, tipologia: tipo.id }, ACTOR_SISTEMA);
        } else {
          res.sf = 'error';
          res.detalle = r.sf?.errors?.join('; ') ?? `HTTP ${r.sf?.status ?? 0}`;
        }
      } catch (e) { res.sf = 'error'; res.detalle = (e as Error).message; }
    }
  }

  // ── Canal Admin (libera la transacción) ──
  if (cfg.cerrarAdmin) {
    if (caso.cierres?.admin?.ok === true) res.admin = 'ya_cerrado';
    else if (!transaccion) res.admin = 'sin_transaccion';
    else if (!remesaAdminDisponible()) { res.admin = 'error'; res.detalle = res.detalle ?? 'Proxy no configurado'; }
    else {
      try {
        const r = await enviarCierreRemesaAdmin({
          transactionIds: [transaccion],
          targetStatusDB: tipo.statusDB,
          targetStatusLabel: tipo.statusLabel,
          requestedBy: actor?.nombre ?? 'flujo automático',
        });
        if (r.ok) {
          res.admin = 'ok';
          await registrarCierreCanal(caso.id, 'admin', { ok: true, tipologia: tipo.id }, actor).catch(() => {});
          logCierre(caso, 'remesa', { canal: 'ADMIN', ok: true, automatico: true, tipologia: tipo.id, statusEnviado: tipo.statusDB }, ACTOR_SISTEMA);
        } else {
          res.admin = 'error';
          res.detalle = r.error ?? r.results.find(x => !x.ok)?.detalle ?? 'error en Admin';
        }
      } catch (e) { res.admin = 'error'; res.detalle = (e as Error).message; }
    }
  }

  // Auditoría de la liberación automática: misma tabla que la manual, con
  // automatico = true para poder separarlas al reportar.
  logLiberacionRemesa(caso, {
    transaccionId: transaccion || null,
    tipologia: tipo.id,
    automatico: true,
    adminOk: res.admin === 'ok' || res.admin === 'ya_cerrado',
    sfOk: res.sf === 'ok' || res.sf === 'ya_cerrado',
    estadoNuevo: res.admin === 'ok' ? tipo.statusDB : null,
    requestedBy: actor?.nombre ?? 'flujo automático',
    detalleError: res.detalle ?? null,
  }, undefined, screening as Parameters<typeof logLiberacionRemesa>[3], ACTOR_SISTEMA as unknown as Parameters<typeof logLiberacionRemesa>[4]);

  return res;
}
