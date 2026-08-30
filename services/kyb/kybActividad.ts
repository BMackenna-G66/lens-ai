// Actividad económica: ¿lo que el cliente DECLARÓ está respaldado por lo que
// dice su escritura?
//
// ── Por qué la comparación va en un solo sentido ───────────────────────────
// El objeto social de una escritura chilena es amplio a propósito: enumera todo
// lo que la sociedad podría llegar a hacer. Admin, en cambio, guarda el giro
// declarado, que son uno o dos códigos CIIU. Comparar las dos listas de igual a
// igual castiga lo normal.
//
// Medido sobre Ad Astra SPA:
//
//   documentos → 8 actividades ("servicios de publicidad prestados por
//                empresas", "publicidad y marketing en servicios de productos
//                digitales", "actividades de consultoría de gestión", …)
//   Admin      → 2 ("731001 - Servicios de publicidad prestados por empresas",
//                "Marketing, Publicidad y Comunicaciones")
//   resultado  → 13 % de solapamiento · PARCIAL
//
// Ese 13 % sale de dividir por el lado más largo: 1 coincidencia sobre 8. Pero
// la PRIMERA actividad de Admin está LITERAL en el texto de la escritura y la
// segunda tiene 2 de sus 3 términos. Las dos están respaldadas.
//
// La pregunta correcta no es "¿cuánto se parecen las dos listas?" sino, por cada
// giro declarado: **¿está incluido en lo que dice la escritura?**
//
//   sí                → CUBIERTA
//   sí, pero no todo  → PARCIAL
//   no                → AUSENTE  ← el hallazgo que importa: el cliente declara
//                                  un giro que su escritura no respalda
//
// ── Por qué esto NO le pregunta a un modelo ────────────────────────────────
// Se podría mandar la pregunta a Gemini y tendría mejor semántica. Se decidió
// que no: el puntaje de la matriz alimenta una decisión de compliance y tiene
// que ser REPRODUCIBLE. Con un modelo en el camino, la misma empresa con los
// mismos documentos puede dar distinto en dos corridas y no hay forma de
// explicar por qué. El lugar del modelo es la extracción, no la comparación.
//
// El costo de decidirlo así son los sinónimos, y se paga con una tabla chica y
// auditable (`SINONIMOS`) en vez de con una llamada por empresa.

import { normalizarTexto } from '../casosComplianceMapper';

export type EstadoActividad = 'CUBIERTA' | 'PARCIAL' | 'AUSENTE';

export interface CoberturaActividad {
  declarada: string;        // el giro de Admin, sin el código CIIU
  estado: EstadoActividad;
  puntaje: number;          // 0..100 — cuánto de la actividad está respaldado
  termos: string[];         // los términos con los que se buscó
  faltantes: string[];      // los que no aparecen en la escritura
  literal: boolean;         // el texto entero aparece tal cual
}

// Corte para cada nivel. 85 y 50 salen de la forma de los giros CIIU: son frases
// de 3 a 6 términos, así que perder uno de tres cae a 67 —"sí pero no del
// todo"— y perder dos de tres cae a 33, que ya es otra actividad.
export const CORTES_ACTIVIDAD = { cubierta: 85, parcial: 50 } as const;

// Palabras de relleno de los nombres CIIU. No identifican una actividad: están
// en casi todos los giros y hacen que cualquier par parezca parecido.
const RELLENO = new Set([
  'SERVICIO', 'SERVICIOS', 'ACTIVIDAD', 'ACTIVIDADES', 'OTRAS', 'OTROS', 'TIPO', 'TIPOS',
  'PARA', 'POR', 'CON', 'LAS', 'LOS', 'DEL', 'DE', 'LA', 'EL', 'UNA', 'UNO', 'Y', 'E', 'EN', 'AL',
  'PRESTADO', 'PRESTADOS', 'PRESTADA', 'PRESTADAS', 'REALIZADO', 'REALIZADOS',
  'NCP', 'NEP', 'GENERAL', 'GENERALES', 'DIVERSOS', 'DIVERSAS', 'DEMAS', 'RESTO',
  'EMPRESA', 'EMPRESAS', 'SOCIEDAD', 'SOCIEDADES', 'CLIENTE', 'CLIENTES', 'TERCEROS',
]);

// Sinónimos del vocabulario de giros. Se canonizan a un término, así que
// "asesoría" y "consultoría" cuentan como lo mismo.
//
// Tabla chica y explícita a propósito: cada línea es una decisión de negocio que
// alguien puede discutir. Crece cuando aparece un caso real, no por adelantado.
const SINONIMOS: Record<string, string> = {
  ASESORIA: 'CONSULTORIA', ASESORAMIENTO: 'CONSULTORIA', CONSULTORA: 'CONSULTORIA',
  MERCADEO: 'MARKETING', PUBLICITARIO: 'PUBLICIDAD', PUBLICITARIA: 'PUBLICIDAD',
  COMUNICACION: 'COMUNICACIONES',
  INFORMATICO: 'INFORMATICA', INFORMATICOS: 'INFORMATICA', COMPUTACION: 'INFORMATICA',
  SOFTWARE: 'INFORMATICA', TECNOLOGIA: 'INFORMATICA', TECNOLOGIAS: 'INFORMATICA',
  ENSENANZA: 'EDUCACION', CAPACITACION: 'EDUCACION', FORMACION: 'EDUCACION',
  COMERCIALIZACION: 'VENTA', COMERCIO: 'VENTA', VENTAS: 'VENTA',
  TRANSPORTES: 'TRANSPORTE', CARGA: 'TRANSPORTE',
  INMOBILIARIA: 'INMUEBLES', INMOBILIARIO: 'INMUEBLES',
  CONSTRUCTORA: 'CONSTRUCCION',
  IMPORTACION: 'COMEXT', EXPORTACION: 'COMEXT',
};

// Plural muy simple. No es un lematizador: solo saca la "s"/"es" final de
// palabras largas, que es lo que separa "producto" de "productos".
const singular = (t: string): string =>
  t.length > 5 && t.endsWith('ES') ? t.slice(0, -2)
  : t.length > 4 && t.endsWith('S') ? t.slice(0, -1)
  : t;

const canon = (t: string): string => {
  const s = singular(t);
  return SINONIMOS[t] ?? SINONIMOS[s] ?? s;
};

// Saca el código CIIU del principio: "731001 - Servicios de publicidad" es la
// misma actividad que "Servicios de publicidad", y el número no aporta al cruce
// porque la escritura nunca lo trae.
export const sinCodigoCiiu = (v: unknown): string =>
  String(v ?? '').replace(/^\s*\d[\d.\s]*[-–—:]\s*/, '').trim();

// Términos que IDENTIFICAN una actividad: sin relleno, sin números, canonizados.
export function terminosDeActividad(v: unknown): string[] {
  const base = normalizarTexto(sinCodigoCiiu(v)).replace(/[^A-Z0-9ÑÜ ]/g, ' ');
  const salida = new Set<string>();
  for (const t of base.split(/\s+/)) {
    if (!t || t.length < 3 || RELLENO.has(t) || /^\d+$/.test(t)) continue;
    salida.add(canon(t));
  }
  return [...salida];
}

// ── La pregunta, por cada giro declarado ───────────────────────────────────
export function cubreActividad(declarada: unknown, textoEscritura: string): CoberturaActividad {
  const limpia = sinCodigoCiiu(declarada);
  const termos = terminosDeActividad(declarada);

  // El texto de la escritura, canonizado igual: si no se canoniza el mismo lado,
  // "productos" nunca va a encontrar a "producto".
  const bolsa = new Set(
    normalizarTexto(textoEscritura).replace(/[^A-Z0-9ÑÜ ]/g, ' ')
      .split(/\s+/).filter(Boolean).map(canon),
  );

  // Coincidencia literal de la frase entera: es la señal más fuerte y no
  // necesita términos. Pasa seguido — el redactor de la escritura copia el giro.
  const literal = normalizarTexto(textoEscritura).includes(normalizarTexto(limpia)) && !!limpia;
  if (literal) {
    return { declarada: limpia, estado: 'CUBIERTA', puntaje: 100, termos, faltantes: [], literal: true };
  }

  if (!termos.length) {
    // Un giro que después de sacar relleno y código no deja ningún término
    // propio no se puede evaluar. No se cuenta como ausente: no es un hallazgo
    // sobre la empresa, es un giro sin contenido.
    return { declarada: limpia, estado: 'PARCIAL', puntaje: 50, termos: [], faltantes: [], literal: false };
  }

  const faltantes = termos.filter(t => !bolsa.has(t));
  const puntaje = Math.round(((termos.length - faltantes.length) / termos.length) * 100);
  const estado: EstadoActividad =
    puntaje >= CORTES_ACTIVIDAD.cubierta ? 'CUBIERTA'
    : puntaje >= CORTES_ACTIVIDAD.parcial ? 'PARCIAL'
    : 'AUSENTE';
  return { declarada: limpia, estado, puntaje, termos, faltantes, literal: false };
}

export interface ResultadoActividades {
  coberturas: CoberturaActividad[];
  cubiertas: number;
  parciales: number;
  ausentes: number;
  detalle: string;
}

// Evalúa TODOS los giros declarados contra el texto de la escritura.
export function evaluarActividades(
  declaradasAdmin: string[] | undefined,
  actividadesLens: string[] | undefined,
): ResultadoActividades {
  const texto = (actividadesLens ?? []).join(' · ');
  const coberturas = (declaradasAdmin ?? [])
    .map(a => String(a ?? '').trim())
    .filter(Boolean)
    .map(a => cubreActividad(a, texto));

  const cubiertas = coberturas.filter(c => c.estado === 'CUBIERTA').length;
  const parciales = coberturas.filter(c => c.estado === 'PARCIAL').length;
  const ausentes = coberturas.filter(c => c.estado === 'AUSENTE').length;

  const partes: string[] = [];
  if (cubiertas) partes.push(`${cubiertas} respaldada(s) por la escritura`);
  if (parciales) {
    const cuales = coberturas.filter(c => c.estado === 'PARCIAL' && c.faltantes.length)
      .map(c => `"${c.declarada}" (falta ${c.faltantes.join(', ').toLowerCase()})`);
    partes.push(`${parciales} solo en parte${cuales.length ? `: ${cuales.join(' · ')}` : ''}`);
  }
  if (ausentes) {
    const cuales = coberturas.filter(c => c.estado === 'AUSENTE').map(c => `"${c.declarada}"`);
    partes.push(`${ausentes} SIN respaldo en la escritura: ${cuales.join(' · ')}`);
  }

  return {
    coberturas, cubiertas, parciales, ausentes,
    detalle: partes.join(' · ') || 'Sin actividades declaradas en Admin.',
  };
}
