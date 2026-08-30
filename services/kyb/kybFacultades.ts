// Facultades y firma: ¿lo que el cliente DECLARÓ en Admin está respaldado por su
// escritura?
//
// Misma lógica que la actividad económica —la pregunta va de lo declarado hacia
// el documento, no al revés— pero acá Admin declara mucho menos de lo que
// parecía.
//
// ── Lo que Admin declara de verdad ─────────────────────────────────────────
// Consultado contra la API para Ad Astra SPA (companyId 4435115):
//
//   hasJointAdministration                     = false
//   signatureAuthorization                     = true      ← booleano
//   signatureAuthorizationLegalRepresentatives = null
//
// O sea: NO hay una lista de poderes. Hay dos booleanos — si la administración
// es conjunta, y si hay autorización de firma. La escritura, en cambio, enumera
// las facultades una por una.
//
// El mapper tomaba `signatureAuthorization: true` y lo guardaba como una
// facultad LLAMADA "true", que después se comparaba contra el texto de la
// escritura. De ahí salía el "0 % de solapamiento" de la ficha.
//
// Y el comparador devolvía COINCIDE con ese 0 %: la línea era
// `sol >= 80 ? COINCIDE : sol > 0 ? PARCIAL : COINCIDE`. Dos listas con cero en
// común daban los 7 puntos completos. Regalaba el componente.
//
// ── La comparación que sí se puede hacer ───────────────────────────────────
//
//   | Admin declara | La escritura dice | Resultado |
//   |---|---|---|
//   | administración conjunta = X | conjunta = X | coincide |
//   | administración conjunta = X | conjunta = distinto | DISCREPA (dato duro) |
//   | autorización de firma = sí | otorga facultades | cubierta |
//   | autorización de firma = sí | no otorga ninguna | AUSENTE ← el hallazgo |
//   | autorización de firma = no | otorga facultades | no resta: la escritura dice de más |
//
// Las facultades específicas de la escritura (factor de comercio, operaciones
// bancarias, comercio exterior…) NO tienen contraparte en Admin, así que no se
// comparan: se reportan como información. Compararlas contra la nada era lo que
// producía el 0 %.
//
// Si algún día Admin empieza a devolver la lista en
// `signatureAuthorizationLegalRepresentatives`, el camino de lista ya está y se
// evalúa giro por giro igual que las actividades.

import { normalizarTexto } from '../casosComplianceMapper';

export type EstadoFacultad = 'CUBIERTA' | 'PARCIAL' | 'AUSENTE';

export interface CoberturaFacultad {
  declarada: string;
  estado: EstadoFacultad;
  detalle: string;
}

export interface ResultadoFacultades {
  coberturas: CoberturaFacultad[];
  cubiertas: number;
  ausentes: number;
  // La administración conjunta es el único dato duro que las dos fuentes
  // declaran igual, así que se reporta aparte.
  conjuntaDifiere: boolean;
  // Facultades que la escritura otorga y Admin no declara. NO restan: información
  // de más no es contradicción.
  soloEnEscritura: string[];
  comparable: boolean;   // ¿hubo algo que comparar?
  detalle: string;
}

// Valores que NO son una facultad. `mapFacultades` empujaba el booleano de
// `signatureAuthorization` acá como si fuera el nombre de un poder.
const NO_ES_FACULTAD = new Set(['TRUE', 'FALSE', 'NULL', 'SI', 'SÍ', 'NO', '1', '0', '']);

export const esFacultadReal = (v: unknown): boolean => {
  const n = normalizarTexto(v).trim();
  return !!n && !NO_ES_FACULTAD.has(n) && n.length > 3;
};

// ¿La escritura otorga facultades a alguien? Es la pregunta que se puede
// contrastar contra `signatureAuthorization`.
export const escrituraOtorgaFacultades = (facultadesLens: string[] | undefined): boolean =>
  (facultadesLens ?? []).some(esFacultadReal);

export function evaluarFacultades(
  facultadesAdmin: string[] | undefined,
  facultadesLens: string[] | undefined,
  autorizacionFirmaAdmin: boolean | null | undefined,
  conjuntaAdmin: boolean | null | undefined,
  conjuntaLens: boolean | null | undefined,
): ResultadoFacultades {
  const listaAdmin = (facultadesAdmin ?? []).filter(esFacultadReal);
  const listaLens = (facultadesLens ?? []).filter(esFacultadReal);
  const textoLens = listaLens.map(f => normalizarTexto(f)).join(' · ');

  const coberturas: CoberturaFacultad[] = [];

  // 1. Administración conjunta: el único dato que las dos fuentes declaran en el
  // mismo formato.
  const conjuntaDifiere =
    typeof conjuntaAdmin === 'boolean' && typeof conjuntaLens === 'boolean'
    && conjuntaAdmin !== conjuntaLens;

  // 2. Autorización de firma declarada en Admin. Si el cliente dice que hay
  // apoderados, la escritura tiene que otorgar poderes a alguien.
  if (autorizacionFirmaAdmin === true) {
    const otorga = listaLens.length > 0;
    coberturas.push({
      declarada: 'Autorización de firma',
      estado: otorga ? 'CUBIERTA' : 'AUSENTE',
      detalle: otorga
        ? `la escritura otorga ${listaLens.length} facultad(es)`
        : 'Admin declara autorización de firma y la escritura no otorga ninguna facultad',
    });
  }

  // 3. Si Admin llegara a traer la lista, se evalúa una por una, igual que las
  // actividades: por cada facultad declarada, ¿la escritura la respalda?
  for (const f of listaAdmin) {
    const termos = normalizarTexto(f).replace(/[^A-Z0-9ÑÜ ]/g, ' ')
      .split(/\s+/).filter(t => t.length > 3);
    if (!termos.length) continue;
    const presentes = termos.filter(t => textoLens.includes(t)).length;
    const pct = Math.round((presentes / termos.length) * 100);
    coberturas.push({
      declarada: f,
      estado: pct >= 85 ? 'CUBIERTA' : pct >= 50 ? 'PARCIAL' : 'AUSENTE',
      detalle: `${pct}% de los términos aparecen en la escritura`,
    });
  }

  // Lo que la escritura otorga y Admin no declara. Se informa, no resta.
  const soloEnEscritura = autorizacionFirmaAdmin === true || listaAdmin.length
    ? []
    : listaLens.slice(0, 6);

  const cubiertas = coberturas.filter(c => c.estado === 'CUBIERTA').length;
  const ausentes = coberturas.filter(c => c.estado === 'AUSENTE').length;
  const comparable = coberturas.length > 0 || conjuntaDifiere
    || (typeof conjuntaAdmin === 'boolean' && typeof conjuntaLens === 'boolean');

  const partes: string[] = [];
  if (conjuntaDifiere) {
    partes.push(`la administración conjunta no coincide (Admin ${conjuntaAdmin}, escritura ${conjuntaLens})`);
  } else if (typeof conjuntaAdmin === 'boolean' && typeof conjuntaLens === 'boolean') {
    partes.push(`administración conjunta coincide (${conjuntaAdmin})`);
  }
  coberturas.forEach(c => partes.push(`${c.declarada}: ${c.detalle}`));
  if (soloEnEscritura.length) {
    partes.push(`la escritura otorga ${soloEnEscritura.length} facultad(es) que Admin no declara (no resta)`);
  }
  if (!partes.length) partes.push('Admin no declara facultades y la escritura no se puede contrastar.');

  return {
    coberturas, cubiertas, ausentes, conjuntaDifiere, soloEnEscritura, comparable,
    detalle: partes.join(' · '),
  };
}
