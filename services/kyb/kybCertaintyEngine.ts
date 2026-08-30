// Motor de certidumbre del KYB. Función PURA.
//
// Convierte los 8 componentes comparados en un porcentaje EXPLICABLE. La
// invariante que hace que sea auditable:
//
//     razones.reduce((s, r) => s + r.delta, 0) === certidumbre
//
// Si esa suma no da, el número no es defendible y el motor lo marca como error en
// vez de devolver un porcentaje que nadie puede reconstruir. Un porcentaje de
// certidumbre en KYC de empresas termina en un expediente: tiene que poder
// explicarse línea por línea.
//
// Decisiones de diseño:
//   · Denominador FIJO en 100. Un componente que no aplica NO redistribuye su
//     peso: si redistribuyera, una empresa con pocos datos podría sacar 90%
//     comparando tres cosas, y un 70% no significaría lo mismo entre empresas.
//   · Las alertas PENALIZAN sobre el resultado, con topes por severidad y un tope
//     global, para que una lluvia de alertas informativas no hunda un caso limpio.
//   · Nunca devuelve 0 por falta de análisis: eso es `null`. Un 0% dice "está
//     todo mal"; un null dice "no sabemos todavía". No es lo mismo.

import type { ResultadoComponente } from '../../types/kybMatriz';
import { FACTOR_ESTADO, PESO_TOTAL_KYB } from '../../types/kybMatriz';
import type { AlertaKyb, RazonCertidumbre, SeveridadAlertaKyb } from '../../types/kyb';

// Penalización por alerta y tope acumulado por severidad.
export const PENALIZACION = {
  CRITICA:     { porAlerta: 25, tope: 60 },
  PREVENTIVA:  { porAlerta: 8,  tope: 24 },
  INFORMATIVA: { porAlerta: 0,  tope: 0 },
} as const satisfies Record<SeveridadAlertaKyb, { porAlerta: number; tope: number }>;

// Tope global de penalización: por muchas alertas que haya, el porcentaje no baja
// más de esto respecto de la cobertura. Evita que todo termine en 0 y que el
// número pierda capacidad de discriminar entre un caso malo y uno peor.
export const TOPE_PENALIZACION_GLOBAL = 70;

export interface ResultadoCertidumbre {
  certidumbre: number;              // 0..100, entero
  razones: RazonCertidumbre[];      // suman exactamente `certidumbre`
  cobertura: number;                // el % antes de penalizar
  penalizacion: number;             // lo que restaron las alertas (positivo)
  invarianteOk: boolean;            // razones.sum === certidumbre
}

// Solo las alertas ABIERTAS o EN_REVISION penalizan: una suprimida o resuelta ya
// fue gestionada por alguien y volver a restarla sería castigar dos veces.
const PENALIZA = new Set(['ABIERTA', 'EN_REVISION']);

export function calcularCertidumbre(
  componentes: ResultadoComponente[],
  alertas: AlertaKyb[] = [],
): ResultadoCertidumbre {
  const razones: RazonCertidumbre[] = [];

  // ── Cobertura: aporte de cada componente ───────────────────────────────────
  let cobertura = 0;
  for (const c of componentes) {
    const factor = FACTOR_ESTADO[c.estado] ?? 0;
    const aporte = c.peso * factor;
    cobertura += aporte;
    // Se registra SIEMPRE, incluso con aporte 0: la razón de que no sume es
    // justamente lo que hay que poder mostrar.
    razones.push({
      concepto: `${c.label} · ${c.estado}`,
      delta: aporte,
      detalle: aporte === c.peso
        ? `Aporta los ${c.peso} puntos completos.`
        : `Aporta ${redondear(aporte)} de ${c.peso} (factor ${factor.toFixed(2)}). ${c.detalle ?? ''}`.trim(),
    });
  }

  // ── Penalización por alertas ───────────────────────────────────────────────
  let penalizacion = 0;
  const activas = alertas.filter(a => a.evaluable && PENALIZA.has(a.estado));
  for (const sev of ['CRITICA', 'PREVENTIVA', 'INFORMATIVA'] as SeveridadAlertaKyb[]) {
    const cfg = PENALIZACION[sev];
    if (cfg.porAlerta === 0) continue;
    const n = activas.filter(a => a.severidad === sev).length;
    if (n === 0) continue;
    const bruto = n * cfg.porAlerta;
    const aplicado = Math.min(bruto, cfg.tope);
    penalizacion += aplicado;
    razones.push({
      concepto: `${n} alerta(s) ${sev.toLowerCase()}(s)`,
      delta: -aplicado,
      detalle: bruto > cfg.tope
        ? `${n} × ${cfg.porAlerta} = ${bruto}, limitado al tope de ${cfg.tope}.`
        : `${n} × ${cfg.porAlerta}.`,
    });
  }

  // Tope global: si se pasa, se agrega una razón con la devolución para que la
  // suma siga cuadrando con el número final.
  if (penalizacion > TOPE_PENALIZACION_GLOBAL) {
    const devuelto = penalizacion - TOPE_PENALIZACION_GLOBAL;
    razones.push({
      concepto: 'Tope global de penalización',
      delta: devuelto,
      detalle: `La penalización acumulada (${penalizacion}) se limita a ${TOPE_PENALIZACION_GLOBAL}.`,
    });
    penalizacion = TOPE_PENALIZACION_GLOBAL;
  }

  // ── Resultado ──────────────────────────────────────────────────────────────
  let certidumbre = cobertura - penalizacion;

  // Recorte a [0, 100]. El ajuste se registra como razón para no romper la
  // invariante: si no, la suma no daría el número mostrado.
  if (certidumbre < 0) {
    razones.push({ concepto: 'Piso en 0%', delta: -certidumbre, detalle: 'La certidumbre no baja de 0.' });
    certidumbre = 0;
  } else if (certidumbre > PESO_TOTAL_KYB) {
    const exceso = certidumbre - PESO_TOTAL_KYB;
    razones.push({ concepto: 'Techo en 100%', delta: -exceso, detalle: 'La certidumbre no pasa de 100.' });
    certidumbre = PESO_TOTAL_KYB;
  }

  // Redondeo al final, y el residuo también se registra. Sin esto la suma de las
  // razones difiere del número por los decimales de los factores (0.60, 0.35).
  const certRedondeada = Math.round(certidumbre);
  const residuo = certRedondeada - certidumbre;
  if (Math.abs(residuo) > 1e-9) {
    razones.push({ concepto: 'Redondeo', delta: residuo, detalle: 'Ajuste al entero más cercano.' });
  }

  const suma = razones.reduce((s, r) => s + r.delta, 0);
  const invarianteOk = Math.abs(suma - certRedondeada) < 1e-6;

  return {
    certidumbre: certRedondeada,
    razones: razones.map(r => ({ ...r, delta: redondear(r.delta) })),
    cobertura: redondear(cobertura),
    penalizacion: redondear(penalizacion),
    invarianteOk,
  };
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

// ── Cobertura mínima ─────────────────────────────────────────────────────────
// Cuánto del peso total se pudo COMPARAR de verdad (los dos lados con dato). Es
// distinto de la certidumbre: un caso puede tener 60% de certidumbre con solo
// tres componentes comparados, y eso no alcanza para decidir nada solo.
export function coberturaComparada(componentes: ResultadoComponente[]): number {
  const comparados = componentes.filter(c => c.estado === 'COINCIDE' || c.estado === 'PARCIAL' || c.estado === 'DISCREPA');
  return redondear(comparados.reduce((s, c) => s + c.peso, 0));
}

// Componentes de identidad que discrepan. Es el freno duro más importante: si la
// razón social, el identificador o el representante legal no coinciden, el
// problema son los DATOS, y por eso frena las dos direcciones del automático.
export function discrepanciasDeIdentidad(
  componentes: ResultadoComponente[],
  idsIdentidad: string[],
): string[] {
  return componentes
    .filter(c => idsIdentidad.includes(c.id) && c.estado === 'DISCREPA')
    .map(c => c.label);
}
