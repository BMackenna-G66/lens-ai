// Espejo analítico del KYB a Redshift (schema colas_trabajo).
//
// Va por el mismo camino que las colas: navegador → Worker /colas/log → Lambda
// colas-trabajo-logger → Redshift por Data API. Reusa `enviarLote` de
// colasLogService, así que hereda el buffer de reintento en localStorage: si el
// cluster está pausado, no se pierde.
//
// ⚠️ La Lambda arma el SQL SOLO desde su whitelist TABLAS y descarta en silencio
// lo que no esté ahí. Las cinco tablas de acá ya están agregadas; si se suma otra
// hay que agregarla en aws/colas-logger/src/app.py y redesplegar, o la traza se
// pierde sin ningún error visible.

import { enviarLote } from '../colasLogService';
import type { EmpresaKyb, AnalisisKyb, DecisionKyb } from '../../types/kyb';
import { COMPONENTES_KYB, FACTOR_ESTADO } from '../../types/kybMatriz';
import { coberturaComparada } from './kybCertaintyEngine';

const ahora = (): string => new Date().toISOString().replace('T', ' ').slice(0, 23);
const ts = (iso?: string | null): string | null =>
  iso ? String(iso).replace('T', ' ').slice(0, 23) : null;
const corto = (v: unknown, n: number): string | null => {
  const s = v === null || v === undefined ? '' : String(v);
  return s ? s.slice(0, n) : null;
};

const esIdentidad = (id: string): boolean =>
  COMPONENTES_KYB.find(c => c.id === id)?.esIdentidad === true;

// Fila de la empresa (última foto). Se manda con cada corrida para que la tabla
// no dependa de un job aparte.
function filaEmpresa(e: EmpresaKyb) {
  return {
    tabla: 'kyb_empresa',
    datos: {
      company_id: e.companyId,
      razon_social: corto(e.razonSocial, 300),
      identificacion: corto(e.identificacion, 40),
      pais: corto(e.pais, 60),
      compliance_status: corto(e.complianceStatus, 60),
      kyc_stage1: corto(e.kycStage1, 60),
      risk_level: corto(e.riskLevel, 40),
      institucional: e.institucional ?? null,
      origen: e.origen,
      status_kyb: e.statusKyb,
      recibido_en: ts(e.recibidoEn),
      actualizado_en: ahora(),
    },
  };
}

export interface ActorLog { uid?: string; nombre?: string; esSistema?: boolean }

// Una corrida completa: la cabecera + UNA FILA POR COMPONENTE + una por alerta.
// El detalle por componente es lo que permite responder después qué componente
// discrepa más seguido, sin abrir una sola ficha.
export function logAnalisisKyb(empresa: EmpresaKyb, a: AnalisisKyb, actor?: ActorLog): void {
  const criticas = a.alertas.filter(x => x.evaluable && x.estado === 'ABIERTA' && x.severidad === 'CRITICA').length;
  const preventivas = a.alertas.filter(x => x.evaluable && x.estado === 'ABIERTA' && x.severidad === 'PREVENTIVA').length;
  const noEval = a.alertas.filter(x => !x.evaluable).length;
  const penalizacion = a.razones.filter(r => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0);

  void enviarLote([
    filaEmpresa(empresa),
    {
      tabla: 'kyb_analisis',
      datos: {
        run_id: a.runId,
        company_id: a.companyId,
        corrida_en: ts(a.corridaEn),
        estado: a.estado,
        // Si el análisis no está completo va NULL, no 0: en el reporting un 0 y un
        // NULL se leen distinto y esa diferencia importa.
        certidumbre: a.certidumbre,
        cobertura: coberturaComparada(a.componentes),
        penalizacion: Math.round(penalizacion * 100) / 100,
        hash_documentos: corto(a.hashDocumentos, 20),
        documentos_total: null,
        alertas_criticas: criticas,
        alertas_preventivas: preventivas,
        alertas_no_evaluables: noEval,
        faltantes: corto((a.faltantes ?? []).join(' · '), 2000),
        mensaje_error: corto(a.mensajeError, 1000),
        actor_id: actor?.uid ?? 'system',
        actor_nombre: actor?.nombre ?? 'system',
        actor_tipo: (actor?.esSistema ?? !actor) ? 'SYSTEM' : 'USER',
      },
    },
    ...a.componentes.map(c => ({
      tabla: 'kyb_componente',
      datos: {
        componente_id: `${a.runId}|${c.id}`,
        run_id: a.runId,
        company_id: a.companyId,
        corrida_en: ts(a.corridaEn),
        componente: c.id,
        label: corto(c.label, 80),
        peso: c.peso,
        estado: c.estado,
        aporte: Math.round(c.peso * (FACTOR_ESTADO[c.estado] ?? 0) * 100) / 100,
        es_identidad: esIdentidad(c.id),
        valor_lens: corto(c.valorLens, 500),
        valor_admin: corto(c.valorAdmin, 500),
        emparejados: c.emparejados ?? null,
        solo_en_lens: c.soloEnLens?.length ?? null,
        solo_en_admin: c.soloEnAdmin?.length ?? null,
        detalle: corto(c.detalle, 1000),
      },
    })),
    ...a.alertas.map(x => ({
      tabla: 'kyb_alerta',
      datos: {
        alerta_id: `${a.runId}|${x.codigo}`,
        run_id: a.runId,
        company_id: a.companyId,
        corrida_en: ts(a.corridaEn),
        codigo: x.codigo,
        label: corto(x.label, 200),
        severidad: x.severidad,
        estado: x.estado,
        evaluable: x.evaluable,
        faltante: corto(x.faltante, 300),
        detalle: corto(x.detalle, 1000),
      },
    })),
  ]);
}

// Decisión. `simulacion` distingue lo que el flujo HABRÍA hecho de lo que hizo:
// es lo que permite medir el automático antes de prenderlo.
export function logDecisionKyb(
  empresa: EmpresaKyb,
  d: DecisionKyb,
  extra: { certidumbre?: number | null; simulacion?: boolean } = {},
): void {
  void enviarLote([
    filaEmpresa(empresa),
    {
      tabla: 'kyb_decision',
      datos: {
        decision_id: `${empresa.companyId}|${d.decididaEn}`,
        company_id: empresa.companyId,
        tipo: d.tipo,
        reason_code: corto(d.reasonCode, 60),
        comentario: corto(d.comentario, 1000),
        automatica: d.automatica,
        simulacion: extra.simulacion ?? false,
        certidumbre: extra.certidumbre ?? null,
        maker_id: d.actorId,
        maker_nombre: corto(d.actorNombre, 160),
        checker_id: d.aprobacion?.checkerId ?? null,
        checker_nombre: corto(d.aprobacion?.checkerNombre, 160),
        estado_aprobacion: d.aprobacion?.estado ?? 'NO_REQUIERE',
        decidida_en: ts(d.decididaEn),
        resuelta_en: ts(d.aprobacion?.resueltaEn),
      },
    },
  ]);
}
