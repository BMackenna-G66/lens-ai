// Comparador de los 8 componentes del KYB. Funciones PURAS, sin red.
//
// Recibe los dos lados ya en forma canónica (kybAdminMapper para Admin, el
// pipeline de Lens para los documentos) y devuelve un ResultadoComponente por
// cada uno de los 8. NO calcula el porcentaje: eso es del motor de certidumbre.
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
import { evaluarActividades } from './kybActividad';
import { compararDomicilio, hayDomicilio } from './kybDomicilio';
import { evaluarFacultades, esFacultadReal } from './kybFacultades';
import {
  compararIdentidad, separarIdentidad, canonDocumento,
  type Identidad, type CoincidenciaIdentidad, type EstadoIdentidad,
} from './kybIdentidad';
import {
  normalizarRazonSocial, similitudNombre, CORTES_NOMBRE, rutValido, limpiarRut,
  mismaFecha, fechaAIso,
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
  pares: {
    lens: PersonaCanonica; admin: PersonaCanonica;
    porDocumento: boolean;
    // Confianza propia en que son la misma persona, 0..100. Antes era la
    // cobertura de tokens; ahora sale de `compararIdentidad`, que saca el cargo,
    // puntúa por contención y tolera OCR.
    similitud: number;
    estadoIdentidad?: EstadoIdentidad;
    // Por qué se parecen, en palabras. Un número solo no le sirve a nadie.
    motivoIdentidad?: string;
    documentoSospechoso?: boolean;
  }[];
  soloLens: PersonaCanonica[];
  soloAdmin: PersonaCanonica[];
}

// El cargo y el documento se sacan del nombre ANTES de comparar. Sin esto,
// "Víctor Manuel Fernández Gómez (Gerente General)" contra "Víctor Manuel
// Fernández Gómez" daba 67 % —el cargo aportaba dos tokens— y caía debajo del
// corte. Es la misma persona.
const aIdentidad = (p: PersonaCanonica): Identidad => {
  const sep = separarIdentidad(p.nombre, p.documento ?? '');
  return { nombre: sep.nombre || p.nombre, cargo: sep.cargo, documento: sep.documento };
};

export function emparejarPersonas(
  lens: PersonaCanonica[] = [],
  admin: PersonaCanonica[] = [],
): Emparejamiento {
  const pendientesLens = [...lens];
  const pendientesAdmin = [...admin];
  const pares: Emparejamiento['pares'] = [];

  // Pasada 1 — documento exacto, con los documentos normalizados igual de los
  // dos lados (sin puntos, guiones ni ceros a la izquierda). Antes se comparaba
  // el string crudo y "19.454.161-9" no era igual a "194541619".
  for (let i = pendientesLens.length - 1; i >= 0; i--) {
    const l = aIdentidad(pendientesLens[i]);
    if (!l.documento) continue;
    const dl = canonDocumento(l.documento);
    if (!dl) continue;
    const j = pendientesAdmin.findIndex(a => canonDocumento(aIdentidad(a).documento) === dl);
    if (j < 0) continue;
    pares.push({
      lens: pendientesLens[i], admin: pendientesAdmin[j], porDocumento: true,
      similitud: 100, estadoIdentidad: 'EXACTO', motivoIdentidad: 'mismo documento',
    });
    pendientesAdmin.splice(j, 1);
    pendientesLens.splice(i, 1);
  }

  // Pasada 2 — puntaje de identidad sobre los sueltos, tomando el mejor par
  // disponible en cada iteración (no el primero que pase el corte).
  let siguio = true;
  while (siguio) {
    siguio = false;
    let mejor = { i: -1, j: -1, r: null as CoincidenciaIdentidad | null };
    for (let i = 0; i < pendientesLens.length; i++) {
      for (let j = 0; j < pendientesAdmin.length; j++) {
        const r = compararIdentidad(aIdentidad(pendientesLens[i]), aIdentidad(pendientesAdmin[j]));
        if (!mejor.r || r.puntaje > mejor.r.puntaje) mejor = { i, j, r };
      }
    }
    const r = mejor.r;
    if (r && mejor.i >= 0 && r.estado !== 'DISTINTO') {
      pares.push({
        lens: pendientesLens[mejor.i], admin: pendientesAdmin[mejor.j],
        porDocumento: r.porDocumento, similitud: r.puntaje,
        estadoIdentidad: r.estado, motivoIdentidad: r.motivo,
        documentoSospechoso: r.documentoSospechoso,
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

  // COINCIDE también cuando no sobra nadie y todos los pares son EXACTOS aunque
  // se hayan emparejado por nombre. Antes esto caía en PARCIAL y le restaba
  // puntos a una empresa donde las dos fuentes dicen exactamente lo mismo: la
  // única "falta" era que las escrituras no repiten el RUT del representante,
  // que es lo normal.
  const todosExactos = e.pares.every(p => p.porDocumento || p.estadoIdentidad === 'EXACTO');
  if (sueltas === 0 && todosExactos) {
    return {
      estado: 'COINCIDE',
      detalle: `${e.pares.length} emparejada(s) · mismo nombre, sin documento en los documentos.`,
    };
  }

  const aprox = e.pares.filter(p => p.estadoIdentidad === 'APROXIMADO');
  const sospechosos = e.pares.filter(p => p.documentoSospechoso);
  const partes = [`${e.pares.length} emparejada(s)`];
  // La aproximación se DICE, con su puntaje y su motivo. Es lo que permite ver
  // que "1 en documentos y 1 en Admin sin coincidencia" en realidad era la misma
  // persona con el cargo pegado al nombre.
  if (aprox.length) {
    partes.push(aprox.map(p => `aproximada ${p.similitud}% (${p.motivoIdentidad ?? 'parecido de nombre'})`).join(' · '));
  }
  if (sospechosos.length) partes.push(`${sospechosos.length} con dígito verificador distinto: revisar`);
  if (e.soloLens.length) partes.push(`${e.soloLens.length} solo en documentos`);
  if (e.soloAdmin.length) partes.push(`${e.soloAdmin.length} solo en Admin`);
  return { estado: 'PARCIAL', detalle: partes.join(' · ') };
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

// Detalle por par emparejado: quién con quién, con qué confianza y por qué.
// La matriz mostraba un conteo; un "1 emparejada" no deja auditar nada.
const identidadesDe = (e: Emparejamiento): ResultadoComponente['identidades'] =>
  e.pares.length
    ? e.pares.map(p => ({
        lens: p.lens.nombre || p.lens.documento || '(sin nombre)',
        admin: p.admin.nombre || p.admin.documento || '(sin nombre)',
        puntaje: p.similitud,
        estado: (p.estadoIdentidad === 'APROXIMADO' ? 'APROXIMADO' : 'EXACTO') as 'EXACTO' | 'APROXIMADO',
        porDocumento: p.porDocumento,
        motivo: p.motivoIdentidad ?? (p.porDocumento ? 'mismo documento' : 'parecido de nombre'),
        documentoSospechoso: p.documentoSospechoso,
      }))
    : undefined;

// ── Comparadores por componente ──────────────────────────────────────────────
type Comparador = (lens: LadoCanonico, admin: LadoCanonico, def: DefinicionComponente) => ResultadoComponente;

const base = (def: DefinicionComponente, estado: EstadoComparacion, extra: Partial<ResultadoComponente> = {}): ResultadoComponente =>
  ({ id: def.id, label: def.label, peso: def.peso, estado, ...extra });

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
      detalle, emparejados: e.pares.length, identidades: identidadesDe(e),
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
      detalle, emparejados: e.pares.length, identidades: identidadesDe(e),
      soloEnLens: nombres(e.soloLens), soloEnAdmin: nombres(e.soloAdmin),
      valorLens: listaNombres(l.accionistas), valorAdmin: listaNombres(a.accionistas),
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

  // El domicilio casi nunca está completo: puede cambiar entre documentos o
  // venir en null porque el cliente no lo declaró. Se compara por CONTENCIÓN
  // parte por parte y el corte positivo es 40 %, por decisión de negocio.
  // Ver `kybDomicilio.ts`.
  domicilio: (l, a, def) => {
    const tl = l.domicilio?.textoCompleto, ta = a.domicilio?.textoCompleto;
    // La presencia mira TODAS las partes, no solo `textoCompleto`. Antes un
    // domicilio con comuna y región pero sin ese campo se leía como ausente y el
    // componente caía en SIN_DATOS con el dato ahí.
    const pre = estadoPorPresencia(hayDomicilio(l.domicilio), hayDomicilio(a.domicilio));
    const texto = (d: typeof l.domicilio, t: string | undefined): string | undefined =>
      t || [d?.calle, d?.numero, d?.ciudad, d?.region, d?.pais].filter(Boolean).join(', ') || undefined;
    if (pre) return base(def, pre, {
      valorLens: texto(l.domicilio, tl), valorAdmin: texto(a.domicilio, ta),
      // Se dice CUÁL lado falta. Un domicilio que el cliente no declaró no es
      // una discrepancia, y la celda tiene que decirlo en vez de quedar vacía.
      detalle: pre === 'SOLO_ADMIN' ? 'Los documentos no traen domicilio: Admin sí. No es una discrepancia.'
        : pre === 'SOLO_LENS' ? 'Admin no trae domicilio: los documentos sí. No es una discrepancia.'
        : 'Ninguna de las dos fuentes trae domicilio.',
    });

    const r = compararDomicilio(l.domicilio, a.domicilio);
    const estado: EstadoComparacion =
      r.estado === 'SIN_DATOS' ? 'SIN_DATOS' : r.estado as EstadoComparacion;
    return base(def, estado, {
      valorLens: texto(l.domicilio, tl), valorAdmin: texto(a.domicilio, ta),
      detalle: r.detalle,
    });
  },

  // La comparación va en UN SOLO SENTIDO: por cada giro DECLARADO en Admin se
  // pregunta si la escritura lo respalda. Ver `kybActividad.ts` para por qué.
  //
  // Antes era un solapamiento simétrico y dividía por el lado más largo. Sobre
  // Ad Astra daba 13 % —1 de 8— cuando las dos actividades declaradas estaban en
  // la escritura, una de ellas literal. Un objeto social amplio es lo normal y
  // no puede leerse como discrepancia.
  actividad: (l, a, def) => {
    const listaL = [...(l.actividades ?? []), ...(l.industrias ?? [])];
    const listaA = [...(a.actividades ?? []), ...(a.industrias ?? [])];
    const pre = estadoPorPresencia(listaL.length > 0, listaA.length > 0);
    if (pre) return base(def, pre, { valorLens: listaL.join(' · ') || undefined, valorAdmin: listaA.join(' · ') || undefined });

    const r = evaluarActividades(listaA, listaL);
    // Un giro declarado que la escritura NO respalda es el hallazgo que importa:
    // el cliente dice operar en algo que su constitución no lo habilita a hacer.
    // Por eso pesa más que "coincide a medias".
    const estado: EstadoComparacion =
      r.ausentes > 0 ? 'DISCREPA'
      : r.parciales > 0 ? 'PARCIAL'
      : 'COINCIDE';
    return base(def, estado, {
      valorLens: listaL.join(' · '), valorAdmin: listaA.join(' · '),
      detalle: r.detalle,
      actividades: r.coberturas.map(c => ({
        declarada: c.declarada, estado: c.estado, puntaje: c.puntaje,
        faltantes: c.faltantes, literal: c.literal,
      })),
    });
  },

  // Misma dirección que la actividad: de lo DECLARADO hacia el documento. Pero
  // Admin no declara una lista de poderes — declara dos booleanos. Ver
  // `kybFacultades.ts`.
  //
  // El estado ya no puede ser COINCIDE sin nada comparado: la línea anterior era
  // `sol >= 80 ? COINCIDE : sol > 0 ? PARCIAL : COINCIDE`, así que dos listas con
  // CERO en común daban los 7 puntos completos.
  facultades: (l, a, def) => {
    const conjL = (l.facultades ?? []).filter(esFacultadReal);
    const conjA = (a.facultades ?? []).filter(esFacultadReal);
    const admL = l.administracionConjunta, admA = a.administracionConjunta;
    const firmaA = a.autorizacionFirma;
    const hayL = conjL.length > 0 || typeof admL === 'boolean';
    const hayA = conjA.length > 0 || typeof admA === 'boolean' || typeof firmaA === 'boolean';
    const pre = estadoPorPresencia(hayL, hayA);
    const verL = () => (hayL ? [typeof admL === 'boolean' ? `conjunta=${admL}` : '', ...conjL].filter(Boolean).join(' · ') : undefined);
    const verA = () => (hayA ? [
      typeof admA === 'boolean' ? `conjunta=${admA}` : '',
      typeof firmaA === 'boolean' ? `autorización de firma=${firmaA}` : '',
      ...conjA,
    ].filter(Boolean).join(' · ') : undefined);
    if (pre) return base(def, pre, {
      valorLens: verL(), valorAdmin: verA(),
      // Se dice qué falta. Ojo con el caso de abajo: Admin declara autorización
      // de firma y de los documentos no se extrajo ninguna facultad. Eso NO se
      // marca como discrepancia porque no se puede distinguir "la escritura no
      // otorga poderes" de "no se pudo leer": es ausencia de evidencia. Queda en
      // SOLO_ADMIN (0.35) y el texto lo explica para que el analista lo mire.
      detalle: pre === 'SOLO_ADMIN'
        ? (firmaA === true
          ? 'Admin declara autorización de firma y de los documentos no se extrajo ninguna facultad: no se puede confirmar ni desmentir.'
          : 'Los documentos no traen facultades: Admin sí.')
        : pre === 'SOLO_LENS' ? 'Admin no declara facultades ni administración conjunta: los documentos sí.'
        : 'Ninguna de las dos fuentes trae facultades.',
    });

    const r = evaluarFacultades(conjA, conjL, firmaA, admA, admL);

    // La administración conjunta es el dato duro: si difiere, discrepa aunque el
    // texto de las facultades se parezca.
    if (r.conjuntaDifiere) {
      return base(def, 'DISCREPA', { valorLens: verL(), valorAdmin: verA(), detalle: r.detalle });
    }
    if (!r.comparable) {
      // Nada que contrastar NO es coincidir. Antes acá se devolvían los 7 puntos.
      return base(def, 'SIN_DATOS', { valorLens: verL(), valorAdmin: verA(), detalle: r.detalle });
    }
    const estado: EstadoComparacion =
      r.ausentes > 0 ? 'DISCREPA'
      : r.coberturas.some(c => c.estado === 'PARCIAL') ? 'PARCIAL'
      : 'COINCIDE';
    return base(def, estado, { valorLens: verL(), valorAdmin: verA(), detalle: r.detalle });
  },

};

// ── Entrada principal ────────────────────────────────────────────────────────
// Devuelve SIEMPRE los 8, en el orden del catálogo. Un componente sin
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
