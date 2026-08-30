// MANTENEDOR de las alertas del KYB. 35 alertas con predicado PURO.
//
// Cada alerta es una función que mira el contexto del análisis y devuelve si
// dispara y con qué detalle. Nada de red, nada de estado.
//
// Regla del inventario: las alertas que HOY no se pueden evaluar por falta de
// fuente van igual, con `evaluable: false` y `faltante` poblado. Así el
// inventario siempre es 35 de 35 y nadie confunde "no se pudo evaluar" con "no
// hay hallazgos" — que es exactamente el error que llevó a los falsos negativos
// de Regcheq.
//
// Severidades y su efecto:
//   CRITICA     → penaliza 25 (tope 60) y frena el flujo automático
//   PREVENTIVA  → penaliza 8 (tope 24)
//   INFORMATIVA → no penaliza, solo informa
//
// Para agregar una alerta: sumar una entrada acá. El motor, la ficha y el
// inventario la toman solos.

import type { LadoCanonico, EstadoAdminEmpresa, PersonaCanonica } from '../../types/kybCanonico';
import type { EmpresaDocsContexto, EmpresaDocsDocument } from '../../types/empresaDocs';
import type { ResultadoComponente } from '../../types/kybMatriz';
import type { AlertaKyb, SeveridadAlertaKyb } from '../../types/kyb';
import { compararMontos } from './kybNormalizadores';
import { normalizarTexto } from '../casosComplianceMapper';
import { rutValido, limpiarRut, fechaAIso } from './kybNormalizadores';
import { categoriasSensibles } from '../delitosSensibles';

// Todo lo que un predicado puede mirar.
export interface ContextoAlerta {
  lens: LadoCanonico;
  admin: LadoCanonico;
  estadoAdmin: EstadoAdminEmpresa;
  contexto?: EmpresaDocsContexto;
  componentes: ResultadoComponente[];
  documentos: EmpresaDocsDocument[];
  // Screening criminal de la empresa y de sus personas, si ya se corrió.
  // Todavía no lo alimenta nadie: por eso las alertas que dependen de esto van
  // como no evaluables en vez de desaparecer.
  screeningPersonas?: { nombre: string; coincidencias?: { tipo?: string; detalle?: string }[]; pep?: boolean }[];
}

// Un predicado devuelve `null` si no dispara, o el detalle si dispara.
type Predicado = (c: ContextoAlerta) => string | null;

export interface DefinicionAlerta {
  codigo: string;
  label: string;
  severidad: SeveridadAlertaKyb;
  // Qué fuente necesita. Si falta, la alerta sale no evaluable con este texto.
  requiere?: (c: ContextoAlerta) => string | null;
  predicado: Predicado;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const comp = (c: ContextoAlerta, id: string): ResultadoComponente | undefined =>
  c.componentes.find(x => x.id === id);

const estadoDe = (c: ContextoAlerta, id: string): string => comp(c, id)?.estado ?? 'SIN_DATOS';

const sinDocumentos = (c: ContextoAlerta): string | null =>
  c.documentos.length === 0 ? 'La empresa no tiene documentos cargados en Admin' : null;

const sinLens = (c: ContextoAlerta): string | null =>
  Object.keys(c.lens).length === 0 ? 'No se pudo leer ningún documento' : null;

const sinScreening = (c: ContextoAlerta): string | null =>
  !c.screeningPersonas ? 'Falta el screening criminal de la empresa y sus personas' : null;

// Quienes pueden OBLIGAR a la sociedad: representantes legales y directorio.
//
// Los accionistas quedan afuera a propósito. Son dos preguntas distintas: de
// quien administra necesitamos el documento para poder screenearlo y saber si
// puede firmar; de quien es dueño interesa la cadena de beneficiario final, que
// es otro análisis y no se resuelve con la misma alerta. Mezclarlos hacía que
// DOC_028 disparara por un socio sin RUT cuando el representante estaba
// perfectamente identificado.
const conPoderDeAdministracion = (l: LadoCanonico): PersonaCanonica[] => [
  ...(l.representantesLegales ?? []), ...(l.directorio ?? []),
];

const mesesDesde = (iso: string): number | null => {
  const f = fechaAIso(iso);
  if (!f) return null;
  const d = new Date(f).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44));
};

// Umbrales. Se agrupan acá para poder calibrarlos en un solo lugar.
export const UMBRALES = {
  empresaNuevaMeses: 6,
  documentoViejoMeses: 12,
  pasivoSobreActivo: 1,          // pasivos > activos
  egresoSobreIngreso: 1.2,       // egresos 20% arriba de ingresos
  minAccionistas: 1,
  maxAccionistasSinMalla: 5,     // muchos socios y sin malla societaria
} as const;

// ── Las 36 ───────────────────────────────────────────────────────────────────
export const ALERTAS_KYB: DefinicionAlerta[] = [
  // ── Identidad (críticas: si la identidad no cuadra, nada más importa) ──
  {
    codigo: 'DOC_001', label: 'Razón social no coincide con Admin', severidad: 'CRITICA',
    predicado: c => estadoDe(c, 'razon_social') === 'DISCREPA'
      ? `Documentos: "${comp(c, 'razon_social')?.valorLens}" · Admin: "${comp(c, 'razon_social')?.valorAdmin}"` : null,
  },
  {
    codigo: 'DOC_002', label: 'Identificación tributaria no coincide con Admin', severidad: 'CRITICA',
    predicado: c => estadoDe(c, 'identificacion') === 'DISCREPA'
      ? `Documentos: ${comp(c, 'identificacion')?.valorLens} · Admin: ${comp(c, 'identificacion')?.valorAdmin}` : null,
  },
  {
    codigo: 'DOC_003', label: 'Identificación tributaria con dígito verificador inválido', severidad: 'CRITICA',
    predicado: c => {
      const malos: string[] = [];
      for (const [origen, v] of [['documentos', c.lens.identificacionNumero], ['Admin', c.admin.identificacionNumero]] as const) {
        const r = limpiarRut(v);
        // Solo aplica a RUT chileno: el NIT colombiano tiene otra validación.
        if (r && /^\d+[\dK]$/.test(r) && r.length >= 8 && !rutValido(r)) malos.push(`${origen} (${v})`);
      }
      return malos.length ? `No pasa módulo 11: ${malos.join(' · ')}` : null;
    },
  },
  {
    codigo: 'DOC_004', label: 'Representante legal no coincide con Admin', severidad: 'CRITICA',
    predicado: c => estadoDe(c, 'representantes') === 'DISCREPA' ? comp(c, 'representantes')?.detalle ?? 'Sin coincidencias' : null,
  },

  // ── Actividad sensible: bloqueadas por falta de catálogo (§4 del plan) ──
  {
    codigo: 'DOC_005', label: 'Actividad económica en rubro sensible', severidad: 'CRITICA',
    requiere: () => 'No existe el catálogo de actividades sensibles',
    predicado: () => null,
  },
  {
    codigo: 'DOC_006', label: 'Objeto social incluye actividad restringida', severidad: 'CRITICA',
    requiere: () => 'No existe el catálogo de actividades sensibles',
    predicado: () => null,
  },

  // ── Screening criminal y PEP (dependen del screening, todavía sin alimentar) ──
  {
    codigo: 'DOC_007', label: 'Delito sensible en la empresa o sus personas', severidad: 'CRITICA',
    requiere: sinScreening,
    predicado: c => {
      const cats = new Set<string>();
      for (const p of c.screeningPersonas ?? []) {
        for (const cat of categoriasSensibles(p.coincidencias)) cats.add(cat);
      }
      return cats.size ? `Categorías: ${[...cats].join(', ')}` : null;
    },
  },
  {
    codigo: 'DOC_008', label: 'Persona vinculada marcada como PEP', severidad: 'PREVENTIVA',
    requiere: sinScreening,
    predicado: c => {
      const peps = (c.screeningPersonas ?? []).filter(p => p.pep).map(p => p.nombre);
      return peps.length ? `PEP: ${peps.join(', ')}` : null;
    },
  },
  {
    codigo: 'DOC_009', label: 'Coincidencia en listas para alguna persona vinculada', severidad: 'PREVENTIVA',
    requiere: sinScreening,
    predicado: c => {
      const conHallazgos = (c.screeningPersonas ?? []).filter(p => (p.coincidencias?.length ?? 0) > 0);
      return conHallazgos.length ? `${conHallazgos.length} persona(s) con coincidencias` : null;
    },
  },

  // ── Términos y condiciones ──
  {
    codigo: 'DOC_010', label: 'Términos y condiciones sin firmar', severidad: 'CRITICA',
    requiere: c => !c.contexto ? 'No se pudo consultar el contexto de Admin' : null,
    predicado: c => {
      const t = c.contexto?.terminos ?? [];
      if (t.length === 0) return 'Admin no devuelve ningún T&C para la empresa';
      const sinFirmar = t.filter(x => !x?.dateSignature).length;
      return sinFirmar ? `${sinFirmar} de ${t.length} sin fecha de firma` : null;
    },
  },

  // ── Estado en Admin ──
  {
    codigo: 'DOC_011', label: 'Empresa bloqueada en Admin', severidad: 'CRITICA',
    predicado: c => /BLOCK/i.test(c.estadoAdmin.complianceStatus ?? '')
      ? `complianceStatus = ${c.estadoAdmin.complianceStatus}` : null,
  },
  {
    codigo: 'DOC_012', label: 'KYC de la empresa rechazado en Admin', severidad: 'PREVENTIVA',
    predicado: c => {
      const etapas = [['KYC1', c.estadoAdmin.kycStage1], ['KYC2', c.estadoAdmin.kycStage2], ['KYC3', c.estadoAdmin.kycStage3]] as const;
      const rech = etapas.filter(([, v]) => /REJECT|DENIED|RECHAZ/i.test(v ?? '')).map(([k, v]) => `${k}=${v}`);
      return rech.length ? rech.join(' · ') : null;
    },
  },
  {
    codigo: 'DOC_013', label: 'Riesgo alto asignado en Admin', severidad: 'PREVENTIVA',
    predicado: c => /ALTO|HIGH/i.test(c.estadoAdmin.riskLevel ?? '') || /ALTO|HIGH/i.test(c.estadoAdmin.riskLevelRegcheq ?? '')
      ? `riskLevel=${c.estadoAdmin.riskLevel ?? '—'} · regcheq=${c.estadoAdmin.riskLevelRegcheq ?? '—'}` : null,
  },
  {
    codigo: 'DOC_014', label: 'Comentario de compliance con observaciones', severidad: 'INFORMATIVA',
    predicado: c => {
      const t = c.estadoAdmin.complianceStatusComment;
      return t && !/^(NO_COMMENTS|SIN|OK|NORMAL)/i.test(normalizarTexto(t)) ? t : null;
    },
  },
  {
    codigo: 'DOC_015', label: 'Empresa marcada como institucional', severidad: 'INFORMATIVA',
    predicado: c => c.estadoAdmin.institucional === true ? 'Requiere el tratamiento de cliente institucional' : null,
  },
  {
    codigo: 'DOC_016', label: 'Pasos del onboarding con errores en Admin', severidad: 'PREVENTIVA',
    requiere: c => !c.contexto?.validacion ? 'No se pudo consultar la validación del onboarding' : null,
    predicado: c => {
      const v = c.contexto?.validacion ?? {};
      const conErr = Object.values(v).filter(p => p?.hasErrors === true).map(p => p?.step ?? '?');
      return conErr.length ? `Pasos con error: ${conErr.join(', ')}` : null;
    },
  },

  // ── Documentos ──
  {
    codigo: 'DOC_017', label: 'La empresa no tiene documentos cargados', severidad: 'CRITICA',
    predicado: c => c.documentos.length === 0 ? 'Admin no devuelve ningún documento' : null,
  },
  {
    codigo: 'DOC_018', label: 'No se pudo leer ningún documento', severidad: 'CRITICA',
    predicado: c => c.documentos.length > 0 && Object.keys(c.lens).length === 0
      ? `${c.documentos.length} documento(s) cargados y ninguno legible` : null,
  },
  {
    codigo: 'DOC_019', label: 'Documentos con antigüedad mayor a la esperada', severidad: 'PREVENTIVA',
    requiere: sinDocumentos,
    predicado: c => {
      const viejos = c.documentos.filter(d => {
        const m = d.date ? mesesDesde(d.date) : null;
        return m !== null && m > UMBRALES.documentoViejoMeses;
      });
      return viejos.length ? `${viejos.length} de ${c.documentos.length} con más de ${UMBRALES.documentoViejoMeses} meses` : null;
    },
  },
  // DOC_020 ("Documentos en estado no aprobado") se eliminó: con la cola de
  // trabajo los documentos llegan directo y ya no pasan por una aprobación
  // previa, así que el estado PENDING dejó de significar algo. Disparaba en
  // todas las empresas y restaba 8 puntos por un flujo que ya no existe.
  {
    codigo: 'DOC_021', label: 'Falta la escritura de constitución', severidad: 'PREVENTIVA',
    requiere: sinLens,
    predicado: c => !c.lens.numeroEscritura && !c.lens.fechaConstitucion
      ? 'No se extrajo número ni fecha de escritura de los documentos' : null,
  },

  // ── Constitución y antigüedad ──
  {
    codigo: 'DOC_022', label: 'Fecha de constitución no coincide con Admin', severidad: 'PREVENTIVA',
    predicado: c => estadoDe(c, 'constitucion') === 'DISCREPA' ? comp(c, 'constitucion')?.detalle ?? null : null,
  },
  {
    codigo: 'DOC_023', label: 'Empresa de constitución reciente', severidad: 'PREVENTIVA',
    predicado: c => {
      const f = c.admin.fechaConstitucion || c.lens.fechaConstitucion;
      const m = f ? mesesDesde(f) : null;
      return m !== null && m < UMBRALES.empresaNuevaMeses ? `Constituida hace ${m} mes(es)` : null;
    },
  },

  // ── Personas y estructura ──
  {
    codigo: 'DOC_024', label: 'Accionistas de los documentos no están en Admin', severidad: 'PREVENTIVA',
    predicado: c => {
      const x = comp(c, 'accionistas');
      return x?.soloEnLens?.length ? `Solo en documentos: ${x.soloEnLens.join(', ')}` : null;
    },
  },
  {
    codigo: 'DOC_025', label: 'Accionistas en Admin que no están en los documentos', severidad: 'PREVENTIVA',
    predicado: c => {
      const x = comp(c, 'accionistas');
      return x?.soloEnAdmin?.length ? `Solo en Admin: ${x.soloEnAdmin.join(', ')}` : null;
    },
  },
  {
    codigo: 'DOC_026', label: 'La empresa no declara accionistas', severidad: 'CRITICA',
    predicado: c => {
      const n = (c.admin.accionistas ?? []).length + (c.lens.accionistas ?? []).length;
      return n < UMBRALES.minAccionistas ? 'Ninguna fuente informa socios ni beneficiarios finales' : null;
    },
  },
  {
    codigo: 'DOC_027', label: 'Sin representante legal identificado', severidad: 'CRITICA',
    predicado: c => {
      const n = (c.admin.representantesLegales ?? []).length + (c.lens.representantesLegales ?? []).length;
      return n === 0 ? 'Ninguna fuente informa representante legal' : null;
    },
  },
  {
    codigo: 'DOC_028', label: 'Representante legal o administrador sin documento de identidad', severidad: 'PREVENTIVA',
    predicado: c => {
      const sinDoc = conPoderDeAdministracion(c.admin)
        .concat(conPoderDeAdministracion(c.lens))
        .filter(p => !p.documento);
      if (!sinDoc.length) return null;
      const nombres = [...new Set(sinDoc.map(p => p.nombre).filter(Boolean))];
      return `${nombres.length} sin documento: ${nombres.slice(0, 4).join(', ')}${nombres.length > 4 ? '…' : ''}`;
    },
  },
  {
    codigo: 'DOC_029', label: 'Estructura societaria sin malla en Admin', severidad: 'PREVENTIVA',
    predicado: c => {
      const socios = (c.admin.accionistas ?? []).length;
      const malla = (c.admin.relaciones ?? []).length;
      return socios > UMBRALES.maxAccionistasSinMalla && malla === 0
        ? `${socios} socios y ninguna relación societaria registrada` : null;
    },
  },
  {
    codigo: 'DOC_030', label: 'Administración conjunta declarada de forma distinta', severidad: 'PREVENTIVA',
    predicado: c => {
      const l = c.lens.administracionConjunta, a = c.admin.administracionConjunta;
      return typeof l === 'boolean' && typeof a === 'boolean' && l !== a
        ? `Documentos: ${l ? 'conjunta' : 'individual'} · Admin: ${a ? 'conjunta' : 'individual'}` : null;
    },
  },
  {
    codigo: 'DOC_031', label: 'Participación accionaria no informada', severidad: 'INFORMATIVA',
    predicado: c => {
      const socios = [...(c.admin.accionistas ?? []), ...(c.lens.accionistas ?? [])];
      if (!socios.length) return null;
      const sinPct = socios.filter(p => p.participacionPct === null || p.participacionPct === undefined).length;
      return sinPct === socios.length ? 'Ninguna fuente informa el porcentaje de participación' : null;
    },
  },

  // ── Financiero ──
  {
    codigo: 'DOC_032', label: 'Pasivos superan los activos', severidad: 'PREVENTIVA',
    predicado: c => {
      const act = c.admin.activosTotales?.valor ?? c.lens.activosTotales?.valor;
      const pas = c.admin.pasivosTotales?.valor ?? c.lens.pasivosTotales?.valor;
      if (act === null || act === undefined || pas === null || pas === undefined || act === 0) return null;
      return pas / act > UMBRALES.pasivoSobreActivo
        ? `Pasivos ${pas.toLocaleString('es-CL')} sobre activos ${act.toLocaleString('es-CL')}` : null;
    },
  },
  {
    codigo: 'DOC_033', label: 'Egresos mensuales superan los ingresos', severidad: 'PREVENTIVA',
    predicado: c => {
      const ing = c.admin.ingresoMensual?.valor ?? c.lens.ingresoMensual?.valor;
      const egr = c.admin.egresoMensual?.valor ?? c.lens.egresoMensual?.valor;
      if (!ing || egr === null || egr === undefined) return null;
      return egr / ing > UMBRALES.egresoSobreIngreso
        ? `Egresos ${egr.toLocaleString('es-CL')} vs ingresos ${ing.toLocaleString('es-CL')}` : null;
    },
  },
  {
    codigo: 'DOC_034', label: 'Cifras financieras fuera de tolerancia entre fuentes', severidad: 'PREVENTIVA',
    // Lee los VALORES, no el componente. El componente `financiero` se sacó de la
    // matriz porque ninguna fuente lo informaba en la práctica y aportaba 0
    // puntos siempre; si esta alerta siguiera leyéndolo, dejaría de dispararse en
    // silencio. La comparación de montos vale igual aunque no pese en el score.
    predicado: c => {
      const campos: [string, number | null | undefined, number | null | undefined][] = [
        ['Facturación anual', c.lens.facturacionAnualEstimada?.valor, c.admin.facturacionAnualEstimada?.valor],
        ['Ingreso mensual', c.lens.ingresoMensual?.valor, c.admin.ingresoMensual?.valor],
        ['Egreso mensual', c.lens.egresoMensual?.valor, c.admin.egresoMensual?.valor],
        ['Activos', c.lens.activosTotales?.valor, c.admin.activosTotales?.valor],
        ['Pasivos', c.lens.pasivosTotales?.valor, c.admin.pasivosTotales?.valor],
      ];
      const fuera = campos.filter(([, x, y]) => compararMontos(x, y) === 'DISCREPA').map(([n]) => n);
      return fuera.length ? `Fuera de tolerancia: ${fuera.join(', ')}` : null;
    },
  },
  {
    codigo: 'DOC_035', label: 'Sin información financiera en ninguna fuente', severidad: 'PREVENTIVA',
    // Lee los VALORES, no el estado del componente. Antes leía el componente y
    // podía contradecir a DOC_032 ("pasivos superan activos"), que sí lee valores:
    // dos alertas que se contradicen destruyen la confianza en el panel entero.
    predicado: c => {
      const campos = [
        c.admin.facturacionAnualEstimada?.valor, c.lens.facturacionAnualEstimada?.valor,
        c.admin.ingresoMensual?.valor, c.lens.ingresoMensual?.valor,
        c.admin.egresoMensual?.valor, c.lens.egresoMensual?.valor,
        c.admin.activosTotales?.valor, c.lens.activosTotales?.valor,
        c.admin.pasivosTotales?.valor, c.lens.pasivosTotales?.valor,
      ];
      return campos.every(v => v === null || v === undefined)
        ? 'Ni los documentos ni Admin informan cifras financieras' : null;
    },
  },

  // ── Actividad y domicilio ──
  {
    codigo: 'DOC_036', label: 'Domicilio no coincide con Admin', severidad: 'PREVENTIVA',
    predicado: c => estadoDe(c, 'domicilio') === 'DISCREPA'
      ? `Documentos: ${comp(c, 'domicilio')?.valorLens} · Admin: ${comp(c, 'domicilio')?.valorAdmin}` : null,
  },
];

// ── Evaluación ───────────────────────────────────────────────────────────────
// Devuelve SIEMPRE las 36. Las que no se pueden evaluar salen con
// `evaluable: false` y no penalizan; las que no disparan salen RESUELTA para que
// el inventario se pueda mostrar completo sin ensuciar la penalización.
export function evaluarAlertas(c: ContextoAlerta): AlertaKyb[] {
  return ALERTAS_KYB.map(def => {
    const faltante = def.requiere?.(c) ?? null;
    if (faltante) {
      return {
        id: `${def.codigo}`, codigo: def.codigo, label: def.label,
        severidad: def.severidad, estado: 'ABIERTA' as const,
        evaluable: false, faltante,
      };
    }
    let detalle: string | null = null;
    try { detalle = def.predicado(c); } catch (e) {
      return {
        id: def.codigo, codigo: def.codigo, label: def.label, severidad: def.severidad,
        estado: 'ABIERTA' as const, evaluable: false,
        faltante: `Error evaluando: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    return {
      id: def.codigo, codigo: def.codigo, label: def.label, severidad: def.severidad,
      // Dispara → ABIERTA (penaliza). No dispara → RESUELTA (no penaliza pero se
      // puede mostrar para que el inventario sea completo).
      estado: detalle ? ('ABIERTA' as const) : ('RESUELTA' as const),
      evaluable: true,
      detalle: detalle ?? undefined,
    };
  });
}

// Resumen para la cola y la ficha.
export function resumenAlertas(alertas: AlertaKyb[]): {
  criticas: number; preventivas: number; informativas: number; noEvaluables: number; total: number;
} {
  const abiertas = alertas.filter(a => a.evaluable && a.estado === 'ABIERTA');
  return {
    criticas: abiertas.filter(a => a.severidad === 'CRITICA').length,
    preventivas: abiertas.filter(a => a.severidad === 'PREVENTIVA').length,
    informativas: abiertas.filter(a => a.severidad === 'INFORMATIVA').length,
    noEvaluables: alertas.filter(a => !a.evaluable).length,
    total: alertas.length,
  };
}
