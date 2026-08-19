// Motor del flujo automático del KYB. Función PURA.
//
// Los 14 cortes en el orden del plan. Lo importante es el ORDEN: todos los frenos
// duros van ANTES de mirar el número. Un porcentaje alto no puede pasar por
// encima de una alerta crítica ni de una discrepancia de identidad.
//
//   1. Flujo apagado
//   2. Dirección apagada (auto-aprobar / auto-rechazar, por separado)
//   3. País no habilitado
//   4. Ya cerrado
//   5. Decisión ya registrada
//   6. Análisis incompleto — nunca decidir a ciegas
//   7. Delito sensible
//   8. PEP
//   9. Términos y condiciones pendientes
//  10. Alerta crítica abierta
//  11. Discrepancia de identidad
//  12. Cobertura bajo el mínimo
//  13. Zona gris entre umbrales
//  14. Recién acá decide el porcentaje
//
// Los cortes 10 y 11 frenan LAS DOS direcciones: una alerta crítica es lo que un
// humano tiene que confirmar, y una discrepancia de identidad significa que los
// DATOS están mal, no la empresa — auto-rechazar por datos mal cargados sería
// castigar a la empresa por un error nuestro.

import type { EmpresaKyb, AnalisisKyb, TipoDecisionKyb } from '../../types/kyb';
import type { FlujoKybConfig } from './kybFlujoService';
import { paisHabilitadoKyb } from './kybFlujoService';
import { COMPONENTES_KYB } from '../../types/kybMatriz';
import { coberturaComparada, discrepanciasDeIdentidad } from './kybCertaintyEngine';

export type MotivoNoAutoKyb =
  | 'flujo_apagado'
  | 'direccion_apagada'
  | 'pais_no_habilitado'
  | 'ya_cerrado'
  | 'decision_registrada'
  | 'analisis_incompleto'
  | 'delito_sensible'
  | 'pep'
  | 'terminos_pendientes'
  | 'alerta_critica'
  | 'discrepancia_identidad'
  | 'cobertura_insuficiente'
  | 'zona_gris';

export interface EvaluacionKyb {
  automatizable: boolean;
  decision?: TipoDecisionKyb;      // APROBAR o RECHAZAR
  motivo?: MotivoNoAutoKyb;
  detalle?: string;
  // true = la config está en simulación: se evaluó pero NO hay que ejecutar.
  simulacion?: boolean;
}

// Códigos de alerta que son frenos duros por sí mismos, más allá de su severidad.
const ALERTA_DELITO = 'DOC_007';
const ALERTA_PEP = 'DOC_008';
const ALERTA_TERMINOS = 'DOC_010';

const IDS_IDENTIDAD = COMPONENTES_KYB.filter(c => c.esIdentidad).map(c => c.id);

const abierta = (a: AnalisisKyb['alertas'][number]): boolean =>
  a.evaluable && (a.estado === 'ABIERTA' || a.estado === 'EN_REVISION');

export function evaluarKybAuto(
  empresa: EmpresaKyb,
  analisis: AnalisisKyb | undefined,
  cfg: FlujoKybConfig,
): EvaluacionKyb {
  // 1 — Flujo apagado
  if (!cfg.enabled) return { automatizable: false, motivo: 'flujo_apagado' };

  // 2 — ¿Hay alguna dirección prendida? (la que corresponda se chequea al final)
  if (!cfg.autoAprobar && !cfg.autoRechazar) {
    return { automatizable: false, motivo: 'direccion_apagada', detalle: 'Ni auto-aprobar ni auto-rechazar están prendidos.' };
  }

  // 3 — País
  if (!paisHabilitadoKyb(empresa.pais, cfg)) {
    return { automatizable: false, motivo: 'pais_no_habilitado', detalle: `País: ${empresa.pais ?? '—'}` };
  }

  // 4 — Ya cerrado
  if (empresa.statusKyb === 'CERRADO') return { automatizable: false, motivo: 'ya_cerrado' };

  // 5 — Decisión ya registrada
  if (empresa.decision) {
    return { automatizable: false, motivo: 'decision_registrada', detalle: `Ya tiene ${empresa.decision.tipo}.` };
  }

  // 6 — Análisis incompleto. Nunca decidir a ciegas.
  if (!analisis || analisis.estado !== 'COMPLETO' || analisis.certidumbre === null) {
    return {
      automatizable: false, motivo: 'analisis_incompleto',
      detalle: analisis ? `Estado del análisis: ${analisis.estado}` : 'Sin análisis',
    };
  }

  const alertas = analisis.alertas ?? [];

  // 7 — Delito sensible
  const delito = alertas.find(a => a.codigo === ALERTA_DELITO && abierta(a));
  if (delito) return { automatizable: false, motivo: 'delito_sensible', detalle: delito.detalle };

  // 8 — PEP
  const pep = alertas.find(a => a.codigo === ALERTA_PEP && abierta(a));
  if (pep) return { automatizable: false, motivo: 'pep', detalle: pep.detalle };

  // 9 — Términos y condiciones pendientes
  const terminos = alertas.find(a => a.codigo === ALERTA_TERMINOS && abierta(a));
  if (terminos) return { automatizable: false, motivo: 'terminos_pendientes', detalle: terminos.detalle };

  // 10 — Cualquier alerta crítica abierta. Frena LAS DOS direcciones.
  const criticas = alertas.filter(a => a.severidad === 'CRITICA' && abierta(a));
  if (criticas.length > 0) {
    return {
      automatizable: false, motivo: 'alerta_critica',
      detalle: `${criticas.length} crítica(s): ${criticas.map(a => a.codigo).join(', ')}`,
    };
  }

  // 11 — Discrepancia de identidad. Frena LAS DOS direcciones: los datos están
  // mal, no la empresa.
  const identidad = discrepanciasDeIdentidad(analisis.componentes, IDS_IDENTIDAD);
  if (identidad.length > 0) {
    return { automatizable: false, motivo: 'discrepancia_identidad', detalle: identidad.join(', ') };
  }

  // 12 — Cobertura mínima: cuánto se pudo comparar de verdad.
  const cobertura = coberturaComparada(analisis.componentes);
  if (cobertura < cfg.coberturaMinima) {
    return {
      automatizable: false, motivo: 'cobertura_insuficiente',
      detalle: `Solo ${cobertura} de ${cfg.coberturaMinima} puntos de peso comparados en las dos fuentes.`,
    };
  }

  // 13 y 14 — Recién acá entra el número.
  const cert = analisis.certidumbre;
  if (cert >= cfg.umbralAprobar) {
    if (!cfg.autoAprobar) {
      return { automatizable: false, motivo: 'direccion_apagada', detalle: 'Auto-aprobar está apagado.' };
    }
    return {
      automatizable: true, decision: 'APROBAR', simulacion: cfg.simulacion,
      detalle: `Certidumbre ${cert}% ≥ ${cfg.umbralAprobar}% · cobertura ${cobertura}`,
    };
  }
  if (cert <= cfg.umbralRechazar) {
    if (!cfg.autoRechazar) {
      return { automatizable: false, motivo: 'direccion_apagada', detalle: 'Auto-rechazar está apagado.' };
    }
    return {
      automatizable: true, decision: 'RECHAZAR', simulacion: cfg.simulacion,
      detalle: `Certidumbre ${cert}% ≤ ${cfg.umbralRechazar}% · cobertura ${cobertura}`,
    };
  }

  // Zona gris: entre los dos umbrales decide el analista.
  return {
    automatizable: false, motivo: 'zona_gris',
    detalle: `Certidumbre ${cert}% entre ${cfg.umbralRechazar}% y ${cfg.umbralAprobar}%.`,
  };
}

export const motivoKybLegible = (m: MotivoNoAutoKyb | undefined): string => ({
  flujo_apagado: 'Flujo automático apagado',
  direccion_apagada: 'La dirección que correspondía está apagada',
  pais_no_habilitado: 'País no habilitado para automático',
  ya_cerrado: 'El caso ya está cerrado',
  decision_registrada: 'Ya tiene una decisión registrada',
  analisis_incompleto: 'Análisis incompleto: no se decide a ciegas',
  delito_sensible: 'Delito sensible en la empresa o sus personas',
  pep: 'Persona vinculada marcada como PEP',
  terminos_pendientes: 'Términos y condiciones sin firmar',
  alerta_critica: 'Hay una alerta crítica abierta',
  discrepancia_identidad: 'Discrepancia de identidad: los datos están mal',
  cobertura_insuficiente: 'Se comparó muy poco para poder decidir',
  zona_gris: 'Certidumbre en zona gris: la revisa el analista',
}[m ?? 'flujo_apagado'] ?? '—');
