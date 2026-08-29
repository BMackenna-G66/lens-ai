// Comparador de los 11 componentes del KYB. Funciones PURAS, sin red.
//
// Recibe los dos lados ya en forma canónica (kybAdminMapper para Admin, el
// pipeline de Lens para los documentos) y devuelve un ResultadoComponente por
// cada uno de los 11. NO calcula el porcentaje: eso es del motor de certidumbre.
//
// Reglas transversales:
//   · Si NINGÚN lado aporta el dato → SIN_DATOS (no es culpa de la empresa, pero
//     tampoco es certidumbre: resta).
//   · Si aporta uno solo → SOLO_LENS / SOLO_ADMIN. Vale menos que COINCIDE porque
//     nadie corroboró el dato, pero no es una contradicción.
//   · DISCREPA es el caso grave: los DOS tienen dato y no coinciden.
//   · Los componentes de FUENTE ÚNICA (según COMPONENTES_KYB) no pueden discrepar:
//     se validan (está / no está).

import type { LadoCanonico, PersonaCanonica } from '../../types/kybCanonico';
import {
  COMPONENTES_KYB, type ResultadoComponente, type EstadoComparacion,
  type DefinicionComponente,
} from '../../types/kybMatriz';
import {
  normalizarRazonSocial, similitudNombre, CORTES_NOMBRE, rutValido, limpiarRut,
  huellaDireccion, mismaFecha, fechaAIso, compararMontos, solapamiento,
} from './kybNormalizadores';

const hay = (v: unknown): boolean =>
  v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '') &&
  (!Array.isArray(v) || v.length > 0);

// Estado cuando solo un lado aporta, o ninguno.
function estadoPorPresencia(enLens: boolean, enAdmin: boolean): EstadoComparacion | null {
  if (enLens && enAdmin) return null;      // hay que comparar
  if (enLens) return 'SOLO_LENS';
  if (enAdmin) return 'SOLO_ADMIN';
  return 'SIN_DATOS';
}

// ── Emparejamiento de personas ───────────────────────────────────────────────
// Greedy en dos pasadas: primero documento exacto (es el dato duro), después
// similitud de nombre sobre los que quedaron sueltos. El orden importa: si se
// empareja por nombre primero, un homónimo puede robarle el match a la persona
// correcta que sí tenía el documento.
export interface Emparejamiento {
  pares: { lens: PersonaCanonica; admin: PersonaCanonica; porDocumento: boolean; similitud: number }[];
  soloLens: PersonaCanonica[];
  soloAdmin: PersonaCanonica[];
}

export function emparejarPersonas(
  lens: PersonaCanonica[] = [],
  admin: PersonaCanonica[] = [],
): Emparejamiento {
  const pendientesLens = [...lens];
  const pendientesAdmin = [...admin];
  const pares: Emparejamiento['pares'] = [];

  // Pasada 1 — documento exacto.
  for (let i = pendientesLens.length - 1; i >= 0; i--) {
    const l = pendientesLens[i];
    if (!l.documento) continue;
    const j = pendientesAdmin.findIndex(a => a.documento && a.documento === l.documento);
    if (j < 0) continue;
    pares.push({ lens: l, admin: pendientesAdmin[j], porDocumento: true, similitud: 100 });
    pendientesAdmin.splice(j, 1);
    pendientesLens.splice(i, 1);
  }

  // Pasada 2 — similitud de nombre sobre los sueltos, tomando el mejor par
  // disponible en cada iteración (no el primero que pase el corte).
  let siguio = true;
  while (siguio) {
    siguio = false;
    let mejor = { i: -1, j: -1, sim: 0 };
    for (let i = 0; i < pendientesLens.length; i++) {
      for (let j = 0; j < pendientesAdmin.length; j++) {
        const sim = similitudNombre(pendientesLens[i].nombre, pendientesAdmin[j].nombre);
        if (sim > mejor.sim) mejor = { i, j, sim };
      }
    }
    if (mejor.sim >= CORTES_NOMBRE.bajo && mejor.i >= 0) {
      pares.push({
        lens: pendientesLens[mejor.i], admin: pendientesAdmin[mejor.j],
        porDocumento: false, similitud: mejor.sim,
      });
      pendientesLens.splice(mejor.i, 1);
      pendientesAdmin.splice(mejor.j, 1);
      siguio = true;
    }
  }

  return { pares, soloLens: pendientesLens, soloAdmin: pendientesAdmin };
}

// Estado de un componente de personas a partir del emparejamiento.
function estadoPersonas(e: Emparejamiento): { estado: EstadoComparacion; detalle: string } {
  const total = e.pares.length + e.soloLens.length + e.soloAdmin.length;
  if (total === 0) return { estado: 'SIN_DATOS', detalle: 'Ninguna fuente aporta personas.' };
  if (e.pares.length === 0) {
    if (e.soloAdmin.length === 0) return { estado: 'SOLO_LENS', detalle: `${e.soloLens.length} en documentos, ninguna en Admin.` };
    if (e.soloLens.length === 0) return { estado: 'SOLO_ADMIN', detalle: `${e.soloAdmin.length} en Admin, ninguna en documentos.` };
    // Los dos lados tienen personas y NINGUNA se empareja: es una discrepancia real.
    return { estado: 'DISCREPA', detalle: `${e.soloLens.length} en documentos y ${e.soloAdmin.length} en Admin, sin ninguna coincidencia.` };
  }
  const sueltas = e.soloLens.length + e.soloAdmin.length;
  const todosPorDocumento = e.pares.every(p => p.porDocumento);
  if (sueltas === 0 && todosPorDocumento) {
    return { estado: 'COINCIDE', detalle: `${e.pares.length} emparejada(s) por documento.` };
  }
  const porNombre = e.pares.filter(p => !p.porDocumento).length;
  return {
    estado: 'PARCIAL',
    detalle: [
      `${e.pares.length} emparejada(s)`,
      porNombre ? `${porNombre} solo por nombre` : '',
      e.soloLens.length ? `${e.soloLens.length} solo en documentos` : '',
      e.soloAdmin.length ? `${e.soloAdmin.length} solo en Admin` : '',
    ].filter(Boolean).join(' · '),
  };
}

const nombres = (ps: PersonaCanonica[]): string[] => ps.map(p => p.nombre || p.documento).filter(Boolean);

// Texto para la celda de la matriz: nombres con su documento, no un conteo.
// Antes decía solo "1" y no se podía saber a quién se había comparado.
const listaNombres = (ps: PersonaCanonica[] | undefined): string | undefined => {
  const l = ps ?? [];
  if (l.length === 0) return undefined;
  return l.map(p => {
    const n = p.nombre || '(sin nombre)';
    const pct = p.participacionPct !== null && p.participacionPct !== undefined ? ` ${p.participacionPct}%` : '';
    return p.documento ? `${n} (${p.documento})${pct}` : `${n}${pct}`;
  }).join(' · ');
};

// ── Comparadores por componente ──────────────────────────────────────────────
type Comparador = (lens: LadoCanonico, admin: LadoCanonico, def: DefinicionComponente) => ResultadoComponente;

const base = (def: DefinicionComponente, estado: EstadoComparacion, extra: Partial<ResultadoComponente> = {}): ResultadoComponente =>
  ({ id: def.id, label: def.label, peso: def.peso, estado, ...extra });

// Componente de FUENTE ÚNICA: no se compara, se valida que el dato exista.
function validarFuenteUnica(def: DefinicionComponente, presente: boolean, valor?: string): ResultadoComponente {
  return base(def, presente ? 'COINCIDE' : 'SIN_DATOS', {
    valorLens: def.fuente === 'SOLO_LENS' ? valor : undefined,
    valorAdmin: def.fuente === 'SOLO_ADMIN' ? valor : undefined,
    detalle: presente
      ? 'Fuente única: el dato está presente y no requiere contraparte.'
      : 'Fuente única: el dato no está.',
  });
}

const COMPARADORES: Record<string, Comparador> = {
  razon_social: (l, a, def) => {
    const pre = estadoPorPresencia(hay(l.razonSocial), hay(a.razonSocial));
    if (pre) return base(def, pre, { valorLens: l.razonSocial, valorAdmin: a.razonSocial });
    const nl = normalizarRazonSocial(l.razonSocial), na = normalizarRazonSocial(a.razonSocial);
    const sim = similitudNombre(nl, na);
    const estado: EstadoComparacion = nl === na ? 'COINCIDE' : sim >= CORTES_NOMBRE.medio ? 'PARCIAL' : 'DISCREPA';
    return base(def, estado, {
      valorLens: l.razonSocial, valorAdmin: a.razonSocial,
      detalle: nl === na ? 'Idénticas sin el sufijo societario.' : `Similitud ${sim}%.`,
    });
  },

  identificacion: (l, a, def) => {
    const pre = estadoPorPresencia(hay(l.identificacionNumero), hay(a.identificacionNumero));
    if (pre) return base(def, pre, { valorLens: l.identificacionNumero, valorAdmin: a.identificacionNumero });
    const il = limpiarRut(l.identificacionNumero), ia = limpiarRut(a.identificacionNumero);
    // Un DV inválido no es "distinto": es un dato mal cargado, y hay que decirlo
    // distinto porque la acción es corregir, no revisar a la empresa.
    const avisos: string[] = [];
    if (!rutValido(il)) avisos.push('el de los documentos no pasa el dígito verificador');
    if (!rutValido(ia)) avisos.push('el de Admin no pasa el dígito verificador');
    const estado: EstadoComparacion = il === ia ? 'COINCIDE' : 'DISCREPA';
    return base(def, estado, {
      valorLens: l.identificacionNumero, valorAdmin: a.identificacionNumero,
      detalle: [il === ia ? 'Coinciden.' : 'Identificadores distintos.', ...avisos].join(' '),
    });
  },

  representantes: (l, a, def) => {
    const e = emparejarPersonas(l.representantesLegales, a.representantesLegales);
    const { estado, detalle } = estadoPersonas(e);
    return base(def, estado, {
      detalle, emparejados: e.pares.length,
      soloEnLens: nombres(e.soloLens), soloEnAdmin: nombres(e.soloAdmin),
      // Se muestran los NOMBRES, no un conteo. Un "1" en la matriz no dice nada:
      // el analista necesita ver a quién se comparó.
      valorLens: listaNombres(l.representantesLegales), valorAdmin: listaNombres(a.representantesLegales),
    });
  },

  accionistas: (l, a, def) => {
    const e = emparejarPersonas(l.accionistas, a.accionistas);
    const { estado, detalle } = estadoPersonas(e);
    return base(def, estado, {
      detalle, emparejados: e.pares.length,
      soloEnLens: nombres(e.soloLens), soloEnAdmin: nombres(e.soloAdmin),
      valorLens: listaNombres(l.accionistas), valorAdmin: listaNombres(a.accionistas),
    });
  },

  directorio: (l, a, def) => {
    const e = emparejarPersonas(l.directorio, a.directorio);
    const { estado, detalle } = estadoPersonas(e);
    return base(def, estado, {
      detalle, emparejados: e.pares.length,
      soloEnLens: nombres(e.soloLens), soloEnAdmin: nombres(e.soloAdmin),
      valorLens: listaNombres(l.directorio), valorAdmin: listaNombres(a.directorio),
    });
  },

  constitucion: (l, a, def) => {
    const fechaLens = fechaAIso(l.fechaConstitucion), fechaAdmin = fechaAIso(a.fechaConstitucion);
    const pre = estadoPorPresencia(!!fechaLens, !!fechaAdmin);
    if (pre) return base(def, pre, { valorLens: fechaLens || undefined, valorAdmin: fechaAdmin || undefined });
    const igualFecha = mismaFecha(fechaLens, fechaAdmin);
    // La escritura solo está en los documentos: si coincide la fecha, sumarla no
    // cambia el estado, pero si NO coincide la fecha es discrepancia igual.
    const escritura = hay(l.numeroEscritura) ? `Escritura ${l.numeroEscritura}.` : '';
    return base(def, igualFecha ? 'COINCIDE' : 'DISCREPA', {
      valorLens: fechaLens, valorAdmin: fechaAdmin,
      detalle: [igualFecha ? 'Misma fecha de constitución.' : 'Fechas de constitución distintas.', escritura].filter(Boolean).join(' '),
    });
  },

  domicilio: (l, a, def) => {
    const tl = l.domicilio?.textoCompleto, ta = a.domicilio?.textoCompleto;
    const pre = estadoPorPresencia(hay(tl), hay(ta));
    if (pre) return base(def, pre, { valorLens: tl, valorAdmin: ta });
    const hl = l.domicilio?.huella || huellaDireccion(tl);
    const ha = a.domicilio?.huella || huellaDireccion(ta);
    const sim = similitudNombre(hl, ha);
    const estado: EstadoComparacion = hl === ha ? 'COINCIDE' : sim >= CORTES_NOMBRE.bajo ? 'PARCIAL' : 'DISCREPA';
    return base(def, estado, { valorLens: tl, valorAdmin: ta, detalle: `Huella con ${sim}% de coincidencia.` });
  },

  actividad: (l, a, def) => {
    const listaL = [...(l.actividades ?? []), ...(l.industrias ?? [])];
    const listaA = [...(a.actividades ?? []), ...(a.industrias ?? [])];
    const pre = estadoPorPresencia(listaL.length > 0, listaA.length > 0);
    if (pre) return base(def, pre, { valorLens: listaL.join(' · ') || undefined, valorAdmin: listaA.join(' · ') || undefined });
    const sol = solapamiento(listaL, listaA);
    const estado: EstadoComparacion = sol >= 80 ? 'COINCIDE' : sol > 0 ? 'PARCIAL' : 'DISCREPA';
    return base(def, estado, {
      valorLens: listaL.join(' · '), valorAdmin: listaA.join(' · '),
      detalle: `${sol}% de solapamiento entre las actividades declaradas.`,
    });
  },

  facultades: (l, a, def) => {
    const conjL = l.facultades ?? [], conjA = a.facultades ?? [];
    const admL = l.administracionConjunta, admA = a.administracionConjunta;
    const hayL = conjL.length > 0 || typeof admL === 'boolean';
    const hayA = conjA.length > 0 || typeof admA === 'boolean';
    const pre = estadoPorPresencia(hayL, hayA);
    if (pre) return base(def, pre, {
      valorLens: hayL ? [`conjunta=${admL}`, ...conjL].join(' · ') : undefined,
      valorAdmin: hayA ? [`conjunta=${admA}`, ...conjA].join(' · ') : undefined,
    });
    // La administración conjunta es el dato duro: si difiere, discrepa aunque el
    // texto de las facultades se parezca.
    if (typeof admL === 'boolean' && typeof admA === 'boolean' && admL !== admA) {
      return base(def, 'DISCREPA', {
        valorLens: `conjunta=${admL}`, valorAdmin: `conjunta=${admA}`,
        detalle: 'La administración conjunta declarada no coincide.',
      });
    }
    const sol = solapamiento(conjL, conjA);
    return base(def, sol >= 80 ? 'COINCIDE' : sol > 0 ? 'PARCIAL' : 'COINCIDE', {
      valorLens: [`conjunta=${admL}`, ...conjL].join(' · '),
      valorAdmin: [`conjunta=${admA}`, ...conjA].join(' · '),
      detalle: conjL.length && conjA.length ? `${sol}% de solapamiento en facultades.` : 'Administración conjunta coincide.',
    });
  },

  financiero: (l, a, def) => {
    const campos: [string, number | null | undefined, number | null | undefined][] = [
      ['Facturación anual', l.facturacionAnualEstimada?.valor, a.facturacionAnualEstimada?.valor],
      ['Ingreso mensual', l.ingresoMensual?.valor, a.ingresoMensual?.valor],
      ['Egreso mensual', l.egresoMensual?.valor, a.egresoMensual?.valor],
      ['Activos', l.activosTotales?.valor, a.activosTotales?.valor],
      ['Pasivos', l.pasivosTotales?.valor, a.pasivosTotales?.valor],
    ];
    const comparables = campos.map(([n, x, y]) => [n, compararMontos(x, y)] as const).filter(([, r]) => r !== null);
    if (comparables.length === 0) {
      const hayL = campos.some(([, x]) => x !== null && x !== undefined);
      const hayA = campos.some(([, , y]) => y !== null && y !== undefined);
      return base(def, estadoPorPresencia(hayL, hayA) ?? 'SIN_DATOS', {
        detalle: 'No hay ningún monto con dato en los dos lados.',
      });
    }
    const discrepan = comparables.filter(([, r]) => r === 'DISCREPA');
    const parciales = comparables.filter(([, r]) => r === 'PARCIAL');
    const estado: EstadoComparacion = discrepan.length > 0 ? 'DISCREPA'
      : parciales.length > 0 ? 'PARCIAL' : 'COINCIDE';
    return base(def, estado, {
      detalle: [
        `${comparables.length} monto(s) comparados`,
        discrepan.length ? `fuera de tolerancia: ${discrepan.map(([n]) => n).join(', ')}` : '',
        parciales.length ? `en tolerancia amplia: ${parciales.map(([n]) => n).join(', ')}` : '',
      ].filter(Boolean).join(' · '),
    });
  },

  estructura: (_l, a, def) => validarFuenteUnica(
    def, (a.relaciones ?? []).length > 0,
    `${(a.relaciones ?? []).length} relación(es)`,
  ),
};

// ── Entrada principal ────────────────────────────────────────────────────────
// Devuelve SIEMPRE los 11, en el orden del catálogo. Un componente sin
// comparador definido sale como SIN_DATOS en vez de desaparecer: si falta uno, se
// tiene que ver en la matriz.
export function compararKyb(lens: LadoCanonico, admin: LadoCanonico): ResultadoComponente[] {
  return COMPONENTES_KYB.map(def => {
    const fn = COMPARADORES[def.id];
    if (!fn) {
      return base(def, 'SIN_DATOS', { detalle: 'Componente sin comparador implementado.' });
    }
    try {
      return fn(lens, admin, def);
    } catch (e) {
      return base(def, 'SIN_DATOS', { detalle: `Error comparando: ${e instanceof Error ? e.message : String(e)}` });
    }
  });
}
