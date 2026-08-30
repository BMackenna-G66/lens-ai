// Domicilio: cuánto se confirman entre sí las dos direcciones, sabiendo que
// casi nunca van a estar completas.
//
// ── El problema ────────────────────────────────────────────────────────────
// El domicilio no está en el 100 % de los casos. Puede cambiar de un documento
// a otro —una sociedad se muda y la modificación posterior trae otra dirección—
// o simplemente venir en null porque el cliente no lo declaró. Tratarlo como un
// campo que tiene que calzar exacto produce discrepancias que no lo son.
//
// Medido sobre Ad Astra SPA:
//
//   Admin      → "10 norte 882, Viña del Mar, Valparaíso"
//   documentos → "Viña del Mar, Región de Valparaíso, Chile"
//   resultado  → DISCREPA · "Huella con 50 % de coincidencia"
//
// Las dos dicen Viña del Mar, Valparaíso. A la escritura le falta la calle: dice
// MENOS, no dice otra cosa. Pero la métrica dividía por el lado más largo, así
// que la información de más del lado de Admin bajaba el puntaje.
//
// ── La regla ───────────────────────────────────────────────────────────────
// Por pedido explícito del negocio: **40 % o más pasa como positivo**; por
// debajo, baja el puntaje. Es un umbral bajo a propósito, porque el caso normal
// es que un lado tenga la calle y el otro solo la comuna.
//
// Se puntúa por CONTENCIÓN sobre el lado que trae MENOS: la pregunta es
// "¿lo que sé de un lado se confirma del otro?", no "¿son idénticos?".
//
// Y la ausencia NO es discrepancia: si un lado no trae domicilio, el componente
// queda en SOLO_ADMIN / SOLO_LENS (que ya vale 0.35) y no en DISCREPA. Un dato
// que el cliente no declaró no es un dato que contradiga.

import { normalizarTexto } from '../casosComplianceMapper';
import { huellaDireccion } from './kybNormalizadores';
import type { DomicilioCanonico } from '../../types/kybCanonico';

// El corte que pidió el negocio.
export const CORTE_DOMICILIO_POSITIVO = 40;

export type EstadoDomicilio = 'COINCIDE' | 'PARCIAL' | 'DISCREPA' | 'SIN_DATOS';

export interface ParecidoDomicilio {
  puntaje: number;                 // 0..100 — cuánto se confirma
  estado: EstadoDomicilio;
  coinciden: string[];             // partes que dicen lo mismo
  difieren: string[];              // partes que dicen cosas distintas
  soloEnUno: string[];             // partes que solo un lado trae
  detalle: string;
}

// Las partes de una dirección, de más a menos identificatoria. El peso refleja
// cuánto dice cada una sobre "es el mismo lugar": dos direcciones en la misma
// calle y número son la misma; dos en el mismo país no dicen nada.
const PARTES: { clave: keyof DomicilioCanonico; label: string; peso: number; esVia?: boolean }[] = [
  { clave: 'calle',  label: 'calle',   peso: 35, esVia: true },
  { clave: 'numero', label: 'número',  peso: 20 },
  { clave: 'ciudad', label: 'comuna',  peso: 30 },
  { clave: 'region', label: 'región',  peso: 12 },
  { clave: 'pais',   label: 'país',    peso: 3 },
];

const norm = (v: unknown): string =>
  normalizarTexto(v).replace(/[^A-Z0-9ÑÜ ]/g, ' ').replace(/\s+/g, ' ').trim();

// "REGION DE VALPARAISO" y "VALPARAISO" son la misma región; "VIÑA DEL MAR" y
// "VINA DEL MAR" la misma comuna. Se comparan por contención de texto, que es lo
// que tolera el prefijo administrativo sin inventar un diccionario de regiones.
//
// La CALLE pasa además por `huellaDireccion`, que ya expande las abreviaturas de
// vía. Sin eso "Av. Providencia" y "AVENIDA PROVIDENCIA" se leían como calles
// distintas y una dirección idéntica bajaba a 64 %.
const mismaParte = (a: string, b: string, esVia = false): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (esVia) {
    const ha = normalizarTexto(huellaDireccion(a)), hb = normalizarTexto(huellaDireccion(b));
    if (ha && hb && (ha === hb || ha.includes(hb) || hb.includes(ha))) return true;
  }
  const la = a.replace(/^(REGION|PROVINCIA|COMUNA|CIUDAD|DEPARTAMENTO)( DE| DEL)? /, '');
  const lb = b.replace(/^(REGION|PROVINCIA|COMUNA|CIUDAD|DEPARTAMENTO)( DE| DEL)? /, '');
  return la === lb || la.includes(lb) || lb.includes(la);
};

// ¿Este domicilio tiene algo? Mira TODAS las partes, no solo `textoCompleto`.
//
// Antes la presencia se decidía con `textoCompleto` a secas, así que un
// domicilio con comuna y región pero sin ese campo se leía como ausente y el
// componente caía en SIN_DATOS — 0 de 9 puntos con el dato ahí.
export const hayDomicilio = (d: DomicilioCanonico | undefined): boolean =>
  !!d && (PARTES.some(p => !!norm(d[p.clave])) || !!norm(d.textoCompleto));

// Reconstruye las partes desde el texto libre cuando vienen sueltas. La
// escritura nunca trae campos: trae una frase.
function partesDe(d: DomicilioCanonico | undefined): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const p of PARTES) {
    const v = norm(d?.[p.clave]);
    if (v) out[p.label] = v;
  }
  return out;
}

export function compararDomicilio(
  lens: DomicilioCanonico | undefined,
  admin: DomicilioCanonico | undefined,
): ParecidoDomicilio {
  const hayL = hayDomicilio(lens), hayA = hayDomicilio(admin);
  if (!hayL || !hayA) {
    return {
      puntaje: 0, estado: 'SIN_DATOS', coinciden: [], difieren: [], soloEnUno: [],
      detalle: 'Al menos una de las fuentes no trae domicilio.',
    };
  }

  const pl = partesDe(lens), pa = partesDe(admin);
  const coinciden: string[] = [], difieren: string[] = [], soloEnUno: string[] = [];
  let pesoComparable = 0, pesoQueCoincide = 0;

  for (const p of PARTES) {
    const a = pl[p.label] ?? '', b = pa[p.label] ?? '';
    if (a && b) {
      // Solo las partes que están en LOS DOS lados entran al denominador. Es lo
      // que hace que "a la escritura le falta la calle" no reste: si un lado no
      // la trae, esa parte no se puede confirmar ni desmentir.
      pesoComparable += p.peso;
      if (mismaParte(a, b, p.esVia)) { pesoQueCoincide += p.peso; coinciden.push(p.label); }
      else difieren.push(p.label);
    } else if (a || b) {
      soloEnUno.push(p.label);
    }
  }

  // Sin ninguna parte comparable se cae al texto libre, que es lo único que
  // queda cuando la escritura trae la dirección en una frase sin desglosar.
  if (pesoComparable === 0) {
    const hl = lens?.huella || huellaDireccion(lens?.textoCompleto);
    const ha = admin?.huella || huellaDireccion(admin?.textoCompleto);
    const ta = new Set(norm(hl).split(' ').filter(Boolean));
    const tb = norm(ha).split(' ').filter(Boolean);
    if (!ta.size || !tb.length) {
      return {
        puntaje: 0, estado: 'SIN_DATOS', coinciden, difieren, soloEnUno,
        detalle: 'El domicilio no viene desglosado en ninguna de las dos fuentes.',
      };
    }
    // Contención sobre el lado más corto, igual criterio que las partes.
    const corto = ta.size <= tb.length ? [...ta] : tb;
    const largo = new Set(ta.size <= tb.length ? tb : [...ta]);
    const puntaje = Math.round((corto.filter(t => largo.has(t)).length / corto.length) * 100);
    const estado: EstadoDomicilio = puntaje >= CORTE_DOMICILIO_POSITIVO ? 'COINCIDE' : 'DISCREPA';
    return {
      puntaje, estado, coinciden, difieren, soloEnUno,
      detalle: `${puntaje}% de coincidencia comparando el texto libre (ninguna fuente lo trae desglosado).`,
    };
  }

  const puntaje = Math.round((pesoQueCoincide / pesoComparable) * 100);

  // 40 % o más pasa como positivo. Debajo baja el puntaje, y se distingue si la
  // diferencia es total —dos direcciones distintas— o si quedó algo en común.
  const estado: EstadoDomicilio =
    puntaje >= CORTE_DOMICILIO_POSITIVO ? 'COINCIDE'
    : puntaje > 0 ? 'PARCIAL'
    : 'DISCREPA';

  const partesDetalle: string[] = [`${puntaje}% de confirmación`];
  if (coinciden.length) partesDetalle.push(`coinciden ${coinciden.join(', ')}`);
  if (difieren.length) partesDetalle.push(`difieren ${difieren.join(', ')}`);
  // Lo que solo trae un lado se DICE, pero no resta: es información faltante, no
  // contradictoria, y confundir las dos cosas es lo que rompía este componente.
  if (soloEnUno.length) partesDetalle.push(`solo en una fuente: ${soloEnUno.join(', ')} (no resta)`);

  return { puntaje, estado, coinciden, difieren, soloEnUno, detalle: partesDetalle.join(' · ') };
}
