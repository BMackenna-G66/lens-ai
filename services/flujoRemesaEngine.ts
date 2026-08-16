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
//   6. cualquier otra coincidencia (causa penal o lista) → queda al analista
//
// Diferencia deliberada con OFAC: **PEP NO retiene la remesa**. En OFAC un
// cliente PEP no se libera solo porque lo que corresponde es el bloqueo
// preventivo + formulario PEP. Acá se está liberando una transacción puntual, no
// vinculando a un cliente, así que por decisión de negocio la marca PEP del
// beneficiario no frena el flujo.
//
// Funciones PURAS (sin red ni escrituras) para poder testearlas solas.

import type { CasoSF } from './casosService';
import type { FlujoRemesaConfig } from './flujoAutomaticoService';
import { categoriasSensibles } from './delitosSensibles';
import { statusDeCaso } from './caseStatusService';
import { camposDeCierreRemesa, tipoRemesaPorId } from './cierreRemesaTipos';
import { enviarResolucion } from './caseResolutionService';
import { sfUpdateDisponible, type SFCaseUpdate } from './salesforceCaseService';
import { enviarCierreRemesaAdmin, remesaAdminDisponible } from './remesaAdminService';
import { registrarCierreCanal } from './caseStatusService';
import { logCierre } from './colasLogService';
import type { Actor } from './caseWorkflowService';

export type MotivoNoAutoRemesa =
  | 'flujo_apagado'
  | 'ya_cerrado'
  | 'sin_screening'
  | 'sin_nacionalidad'
  | 'delito_sensible'
  | 'con_coincidencias';

export interface EvaluacionRemesa {
  automatizable: boolean;
  motivo?: MotivoNoAutoRemesa;
  tipologia?: string;
  categorias?: string[];   // categorías sensibles detectadas (si retuvo por eso)
}

// Forma mínima del screening del beneficiario que necesita el motor.
export interface ScreeningRemesaParaAuto {
  estado?: string;    // ok | sin_causas | error | na
  flujo?: string;     // CL | CO | INTL | SIN_DATO
  decision?: string;
  pep?: boolean;      // se ignora a propósito (ver cabecera)
  coincidencias?: Array<{ tipo?: string; detalle?: string }>;
  listas?: Array<{ lista?: string }>;
}

export function evaluarRemesaAuto(
  caso: CasoSF,
  screening: ScreeningRemesaParaAuto | undefined,
  cfg: FlujoRemesaConfig,
): EvaluacionRemesa {
  if (!cfg.enabled) return { automatizable: false, motivo: 'flujo_apagado' };
  if (statusDeCaso(caso) === 'CERRADO') return { automatizable: false, motivo: 'ya_cerrado' };

  // Sin screening resuelto no se libera nada. Incluye el caso en que el proveedor
  // devolvió error: un fallo de la API NO puede leerse como "sin hallazgos".
  if (!screening || screening.estado === 'error' || screening.estado === 'loading') {
    return { automatizable: false, motivo: 'sin_screening' };
  }
  if (screening.flujo === 'SIN_DATO' || screening.estado === 'na') {
    return { automatizable: false, motivo: 'sin_nacionalidad' };
  }

  // Freno duro por delito sensible, antes de mirar cualquier conclusión.
  const categorias = categoriasSensibles(screening.coincidencias);
  if (categorias.length > 0) return { automatizable: false, motivo: 'delito_sensible', categorias };

  // OJO: acá NO va el freno por PEP. Es deliberado (ver cabecera del archivo).

  // Cualquier otra coincidencia —causa penal no sensible o lista internacional—
  // la revisa el analista.
  if ((screening.coincidencias?.length ?? 0) > 0) return { automatizable: false, motivo: 'con_coincidencias' };
  if ((screening.listas?.length ?? 0) > 0) return { automatizable: false, motivo: 'con_coincidencias' };

  return { automatizable: true, tipologia: cfg.tipoLiberar };
}

// Categorías sensibles del screening de un beneficiario (para marcar la fila).
export const retenidoPorDelitoRemesa = (s: ScreeningRemesaParaAuto | undefined): string[] =>
  categoriasSensibles(s?.coincidencias);

// Texto corto del motivo, para la cola y la ficha.
export const motivoRemesaLegible = (m: MotivoNoAutoRemesa | undefined): string => ({
  flujo_apagado: 'Flujo automático apagado',
  ya_cerrado: 'El caso ya está cerrado',
  sin_screening: 'Sin screening resuelto (o el proveedor falló)',
  sin_nacionalidad: 'El beneficiario no trae nacionalidad',
  delito_sensible: 'Retenido por delito sensible',
  con_coincidencias: 'Tiene coincidencias: lo revisa el analista',
}[m ?? 'sin_screening'] ?? '—');

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

  return res;
}
