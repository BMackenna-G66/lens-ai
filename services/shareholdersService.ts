// Extracción estructurada de la composición societaria (Fase 3).
//
// Le manda el ARCHIVO NATIVO al modelo —no su texto— y pide el JSON del
// contrato `BusinessShareholders` que ms-company ya consume.
//
// NO TOCA LOS 18 CAMPOS. Es una segunda extracción, con su propio prompt y su
// propia salida. Los 18 siguen saliendo del camino de texto exactamente igual.
//
// La regla de oro del contrato (§3.3 del plan):
//   NATURAL en la tabla            → directOwnership
//   JURÍDICA en la tabla           → indirectShareholders, en la raíz
//   NATURAL detrás de una jurídica → indirectShareholders, anidada
//
// Acá NO se "corrige" al modelo moviendo personas de lugar. Se persiste lo que
// devolvió y se CUENTAN las violaciones: mover a alguien en silencio escondería
// justamente el error que hay que medir para calibrar.

import { Type } from '@google/genai';
import { generarConArchivos, TOPE_INLINE_BYTES } from './geminiService';
import { GEMINI_SHAREHOLDERS_PROMPT, GEMINI_SHAREHOLDERS_CADENA_PROMPT } from '../constants';

export type TipoPersona = 'NATURAL' | 'JURIDICA';

export interface PersonaContrato {
  personType?: TipoPersona;
  shareholderName?: string;
  name?: string;
  lastName?: string;
  shareholderId?: string;
  identificationType?: string;
  countryOfOrigin?: string;
  ownershipPercentage?: number | null;
  isPEP?: boolean | null;
  position?: string;                      // solo representantes
  indirectShareholders?: PersonaContrato[];   // solo un nivel de anidación
}

export interface ResultadoShareholders {
  legalRepresentatives: PersonaContrato[];
  directOwnership: PersonaContrato[];
  indirectShareholders: PersonaContrato[];
}

// ── El esquema es PLANO. No hay anidación en ninguna llamada. ──────────────
// Medido sobre 8 corridas del mismo documento: con el esquema anidado la cadena
// salía 6 de 8 veces y una de cada cinco corridas se desbocaba hasta 45.358
// tokens de salida devolviendo JSON truncado. Las corridas malas eran
// EXACTAMENTE las que tocaban el tope de salida: el desborde y la pérdida de la
// cadena eran el mismo problema.
//
// Con dos pasadas planas: 8 de 8, cero JSON roto, y la salida estable en ~640
// tokens (antes iba de 775 a 8.177). Sin anidación no hay dónde desbocarse.
const PERSONA_PLANA = {
  type: Type.OBJECT,
  properties: {
    personType: { type: Type.STRING, enum: ['NATURAL', 'JURIDICA'] },
    shareholderName: { type: Type.STRING },
    name: { type: Type.STRING },
    lastName: { type: Type.STRING },
    shareholderId: { type: Type.STRING },
    identificationType: { type: Type.STRING },
    countryOfOrigin: { type: Type.STRING },
    ownershipPercentage: { type: Type.NUMBER, nullable: true },
    isPEP: { type: Type.BOOLEAN, nullable: true },
    position: { type: Type.STRING },
  },
  required: ['personType', 'shareholderName'],
};

/** Pasada 1: representantes y todos los dueños de la tabla, sin anidar. */
export const ESQUEMA_SHAREHOLDERS = {
  type: Type.OBJECT,
  properties: {
    legalRepresentatives: { type: Type.ARRAY, items: PERSONA_PLANA },
    owners: { type: Type.ARRAY, items: PERSONA_PLANA },
  },
  required: ['legalRepresentatives', 'owners'],
};

/** Pasada 2: los socios de UNA jurídica. */
export const ESQUEMA_CADENA = {
  type: Type.OBJECT,
  properties: { members: { type: Type.ARRAY, items: PERSONA_PLANA } },
  required: ['members'],
};

/**
 * Señales para calibrar. Ya NO cuenta violaciones de la regla de oro: el
 * reparto entre `directOwnership` e `indirectShareholders` ahora lo hace ESTE
 * código a partir de `personType`, así que la regla se cumple por construcción
 * y contarla sería contar cero siempre.
 *
 * Lo que sí importa medir es lo que el modelo puede equivocar o lo que el
 * modelo de datos no cubre.
 */
export interface SenalesShareholders {
  /** Jurídicas encontradas en la tabla de propiedad. */
  juridicas: number;
  /** De esas, cuántas revelaron su composición. El resto queda con [] — y eso
   *  puede ser "el documento no lo dice" o "el modelo no lo encontró". */
  juridicasConCadena: number;
  /** Una jurídica DETRÁS de otra jurídica: la cadena sigue más abajo de lo que
   *  el modelo de datos representa (nivel 0 y 1). Se aplana y se avisa. */
  juridicasEnNivel1: number;
  /** Llamadas al modelo que costó este análisis. */
  llamadas: number;
  /**
   * Suma de participación de los dueños directos (naturales + jurídicas raíz).
   * Tiene que dar ~100.
   *
   * Es el chequeo más barato que existe para el error que más se repite: que el
   * modelo meta en la tabla principal a los socios de OTRA empresa que el
   * documento también describe. Medido: pasaba, y la suma daba 200 con las
   * mismas dos personas duplicadas como directas y como nivel 1.
   */
  sumaParticipacion: number | null;
  /**
   * true cuando la suma se aleja más de 0,5 puntos de 100.
   *
   * LÍMITE, y hay que tenerlo presente antes de apoyarse en esta señal: **no
   * detecta la alucinación de un solo socio**. Medido contra Gemini: cuando al
   * modelo le falta la tabla de propiedad no dice «no sé», le adjudica el 100 %
   * al único socio que ve. Eso suma 100, sale `false` acá, y cumple las tres
   * restricciones de la regla de oro. El dato inventado es internamente
   * consistente y ninguna de nuestras señales estructurales lo delata.
   *
   * Lo único que lo agarra es `contrastarLecturas`, comparando contra la otra
   * lectura del mismo documento. Un `participacionSospechosa: false` NO es
   * garantía de que la composición sea correcta, y no hay que presentarlo así.
   */
  participacionSospechosa: boolean;
}

// ── Cuál de los archivos se le manda al modelo ─────────────────────────────
//
// El contrato es por ANÁLISIS, no por archivo: en un consolidado la escritura
// es la que manda. Elegir "el primer PDF" cumple eso solo si la escritura vino
// primera, y muchas veces no viene primera.
//
// Medido en producción sobre 45 análisis multi-archivo: en 4 (9 %) el primer
// PDF era `company_id_document_*` —una cédula— teniendo al lado el
// `company_deeds_document_*`. A esos análisis se les pidió la tabla de
// propiedad a un documento de identidad. Uno de ellos es MTYF8PY7, que quedó
// con `{"ok":false,"error":"...no es JSON válido"}` en la ficha.
//
// El nombre lo pone el descargador por lote y es estable. Censo completo del
// corpus (507 archivos): 162 `deeds`, 24 `complementary`, 12 `id`, 5
// `trade_chamber_sedpe`, 1 `legal_representative`, y 303 con nombre libre —
// subidas manuales, donde no hay ninguna señal y se respeta el orden, que es
// exactamente lo que se hacía antes.
//
// El certificado de cámara de comercio entra ALTO y no es un detalle: en
// Colombia es la fuente canónica de la composición societaria, y el propio
// prompt de la cadena le dice al modelo que la busque ahí.
const RANGO: [RegExp, number][] = [
  [/company_deeds_document|escritura|constituc/i, 0],    // la escritura
  [/trade_chamber|c[aá]mara_?de_?comercio/i, 1],         // certificado de cámara
  [/company_complementary_document|anexo/i, 3],          // anexos: sirven, después
  [/(company_id_document|legal_representative_document|c[eé]dula|pasaporte|\bdni\b)/i, 4],
];

const rango = (nombre: string): number => {
  for (const [re, n] of RANGO) if (re.test(nombre)) return n;
  return 2;   // sin señal en el nombre: subida manual, se respeta el orden
};

/**
 * El documento al que se le pide la composición societaria.
 *
 * Ordena por qué TAN PROBABLE es que sea la escritura, no por orden de subida,
 * y desempata por el orden original para que dos corridas sobre los mismos
 * archivos elijan siempre el mismo.
 *
 * Devuelve `undefined` si ninguno es PDF, JPG o PNG — el modelo no puede ver
 * otra cosa por la ruta nativa.
 */
export function elegirDocumentoSocietario<T extends { name: string }>(archivos: T[]): T | undefined {
  return elegirDocumentosSocietarios(archivos)[0];
}

/**
 * TODOS los documentos que se le mandan al modelo, en el orden en que los tiene
 * que leer: primero el que más se parece a la escritura.
 *
 * Mandar uno solo perdía datos, y no de a poco. Medido sobre 87 análisis de
 * producción en los que el camino de texto SÍ encontró accionistas —o sea, el
 * documento demostrablemente los tenía—, la extracción estructurada los perdió:
 *
 *     1 archivo         3 de 60    5 %
 *     varios archivos  17 de 27   63 %
 *
 * Doce veces peor en los consolidados, porque el camino de texto concatena
 * todos los documentos y este mandaba uno. La tabla de propiedad vive en la
 * escritura, pero el consolidado trae además anexos y modificaciones donde
 * suele estar la composición vigente.
 *
 * Se acota por peso acumulado: el tope de Google es sobre el request entero.
 * Como van ordenados, si algo queda afuera es siempre lo menos parecido a una
 * escritura.
 */
export function elegirDocumentosSocietarios<T extends { name: string; size?: number }>(
  archivos: T[],
  topeBytes = TOPE_INLINE_BYTES,
): T[] {
  const ordenados = archivos
    .filter(a => /\.(pdf|jpe?g|png)$/i.test(a.name))
    .map((a, i) => ({ a, r: rango(a.name), i }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(x => x.a);

  const salida: T[] = [];
  let acumulado = 0;
  for (const a of ordenados) {
    const peso = a.size ?? 0;
    // El primero entra siempre: si ni él cabe, que falle abajo con el mensaje
    // de tamaño en vez de devolver una lista vacía que parecería "no había
    // documentos".
    if (salida.length > 0 && acumulado + peso > topeBytes) break;
    salida.push(a);
    acumulado += peso;
  }
  return salida;
}

// ── Contraste entre las dos lecturas ───────────────────────────────────────
//
// El mismo documento se lee DOS veces por caminos independientes: los 18 campos
// salen del texto extraído, y la composición societaria sale del PDF nativo con
// otro prompt y otro esquema. Donde las dos coinciden hay confianza alta; donde
// difieren, alguna está adivinando.
//
// Hasta ahora las dos lecturas caían en Redshift y nadie las cruzaba. Al
// cruzarlas sobre 104 análisis de producción: 44 con los mismos documentos y
// **3 que discrepaban**. Dos de esos tres diferían en UN SOLO DÍGITO:
//
//     texto 273340386   estructurada 223340386
//     texto  60894493   estructurada  60894413
//
// No son dos personas distintas: es una de las dos lecturas inventando un
// dígito. Y es la peor clase de error posible acá — un dígito de más o de menos
// en un RUT no es un typo, es una persona distinta a la hora de screenear.
//
// Esto NO corrige nada ni elige un ganador. No hay forma de saber cuál de las
// dos tiene razón sin volver al documento, y elegir en silencio sería fabricar
// certeza. Marca, cuenta, y deja que lo mire un humano.

/** Diferencia de un solo carácter: casi siempre un dígito mal leído, no otra
 *  persona. Se mide sobre la forma canónica, sin puntos ni guiones. */
const difiereEnUno = (a: string, b: string): boolean => {
  if (a.length !== b.length || a === b) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return d === 1;
};

export interface ContrasteLecturas {
  /** Documentos que las dos lecturas vieron igual. */
  coinciden: number;
  /** Los vio el camino de texto y no la extracción estructurada. */
  soloTexto: string[];
  /** Los vio la extracción estructurada y no el camino de texto. */
  soloEstructurada: string[];
  /**
   * Pares que difieren en UN carácter, como `["273340386","223340386"]`.
   * Es el hallazgo más grave y el más accionable: dice exactamente qué mirar.
   */
  posibleDigito: [string, string][];
  /** true si hay algo que un humano tendría que revisar. */
  revisar: boolean;
}

/**
 * Cruza los accionistas del campo de texto contra los de la extracción
 * estructurada, por DOCUMENTO.
 *
 * Se compara por documento y no por nombre porque el nombre admite variantes
 * legítimas —tildes, orden de apellidos, abreviaturas— y el documento no: si
 * dos lecturas del mismo papel dan documentos distintos, hay un error.
 *
 * Las personas sin documento se ignoran: el campo de texto escribe
 * «sin documento» y no hay con qué cruzar.
 */
export function contrastarLecturas(
  accionistasDelTexto: string | undefined,
  r: ResultadoShareholders,
): ContrasteLecturas {
  const delTexto = new Set<string>();
  for (const linea of (accionistasDelTexto ?? '').split('\n')) {
    // Formato del campo: `NOMBRE | DOCUMENTO | PARTICIPACIÓN`.
    const doc = canon(linea.split('|')[1]);
    if (doc) delTexto.add(doc);
  }

  const delEstructurado = new Set<string>();
  for (const p of [...(r.directOwnership ?? []), ...(r.indirectShareholders ?? [])]) {
    const doc = canon(p.shareholderId);
    if (doc) delEstructurado.add(doc);
  }

  const soloTexto = [...delTexto].filter(d => !delEstructurado.has(d));
  const soloEstructurada = [...delEstructurado].filter(d => !delTexto.has(d));

  // De lo que no cruza, ¿hay pares que difieren en un solo carácter? Eso no es
  // "falta uno y sobra otro": es el mismo documento mal leído por un lado.
  const posibleDigito: [string, string][] = [];
  for (const t of soloTexto) {
    const par = soloEstructurada.find(e => difiereEnUno(t, e));
    if (par) posibleDigito.push([t, par]);
  }

  return {
    coinciden: [...delTexto].filter(d => delEstructurado.has(d)).length,
    soloTexto,
    soloEstructurada,
    posibleDigito,
    // Un documento que aparece en una lectura y no en la otra ya amerita mirar;
    // un dígito distinto, con más razón.
    revisar: soloTexto.length > 0 || soloEstructurada.length > 0,
  };
}

const vacio = (): ResultadoShareholders =>
  ({ legalRepresentatives: [], directOwnership: [], indirectShareholders: [] });

const comoJson = (texto: string, que: string): Record<string, unknown> => {
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`El análisis falló. Error: la respuesta de ${que} no es JSON válido.`);
  }
};

/**
 * Extrae la composición societaria en DOS PASADAS PLANAS.
 *
 *   1. representantes + todos los dueños de la tabla (naturales y jurídicas)
 *   2. por CADA jurídica, una pregunta propia: ¿quiénes son sus socios?
 *
 * El resultado se arma acá con la forma del contrato —las tres claves, con la
 * cadena anidada— así que lo que consume ms-company no cambia. Lo que cambió es
 * cómo se consigue.
 *
 * El reparto sale de `personType`, no de dónde el modelo puso a cada uno: NATURAL
 * va a `directOwnership`, JURIDICA a la raíz de `indirectShareholders`. La regla
 * de oro deja de depender de que el modelo la respete.
 */
export async function extraerShareholders(
  archivos: File | File[],
): Promise<{ resultado: ResultadoShareholders; senales: SenalesShareholders; uso?: { promptTokenCount?: number; candidatesTokenCount?: number } }> {
  // Acepta uno o varios: la firma vieja tomaba un File suelto y así ningún
  // llamador que no se haya migrado se rompe.
  const docs = Array.isArray(archivos) ? archivos : [archivos];
  const r1 = await generarConArchivos(docs, GEMINI_SHAREHOLDERS_PROMPT, {
    responseSchema: ESQUEMA_SHAREHOLDERS, operacion: 'Shareholders',
  });
  const p1 = comoJson(r1.texto, 'shareholders') as {
    legalRepresentatives?: PersonaContrato[]; owners?: PersonaContrato[];
  };

  const duenos = p1.owners ?? [];
  const naturales = duenos.filter(p => p.personType !== 'JURIDICA');
  const juridicas = duenos.filter(p => p.personType === 'JURIDICA');

  let entrada = r1.uso?.promptTokenCount ?? 0;
  let salida = r1.uso?.candidatesTokenCount ?? 0;
  let llamadas = 1;
  let juridicasConCadena = 0;
  let juridicasEnNivel1 = 0;

  const indirectos: PersonaContrato[] = [];
  for (const j of juridicas) {
    let miembros: PersonaContrato[] = [];
    try {
      const r2 = await generarConArchivos(
        docs,
        // La empresa se compone ACÁ, no dentro del prompt: el extractor que
        // sincroniza los prompts con la API no puede leer un ternario con
        // backticks anidados.
        GEMINI_SHAREHOLDERS_CADENA_PROMPT(
          `${j.shareholderName ?? ''}${j.shareholderId ? ` (documento ${j.shareholderId})` : ''}`),
        { responseSchema: ESQUEMA_CADENA, operacion: 'Shareholders cadena' },
      );
      llamadas++;
      entrada += r2.uso?.promptTokenCount ?? 0;
      salida += r2.uso?.candidatesTokenCount ?? 0;
      miembros = (comoJson(r2.texto, 'la cadena societaria').members as PersonaContrato[]) ?? [];
    } catch {
      // Que falle la cadena de UNA jurídica no puede tirar abajo el análisis
      // entero: queda con [] y se cuenta como no revelada.
      miembros = [];
    }
    if (miembros.length > 0) juridicasConCadena++;
    juridicasEnNivel1 += miembros.filter(m => m.personType === 'JURIDICA').length;
    indirectos.push({ ...j, indirectShareholders: miembros });
  }

  const resultado: ResultadoShareholders = {
    ...vacio(),
    legalRepresentatives: p1.legalRepresentatives ?? [],
    directOwnership: naturales,
    indirectShareholders: indirectos,
  };
  // La suma solo se evalúa si TODOS los directos traen porcentaje: con uno en
  // null, el total no significa nada y marcarlo sospechoso sería ruido.
  const directos = [...naturales, ...juridicas];
  const todosConPct = directos.length > 0 && directos.every(p => typeof p.ownershipPercentage === 'number');
  const sumaParticipacion = todosConPct
    ? Math.round(directos.reduce((a, p) => a + (p.ownershipPercentage ?? 0), 0) * 100) / 100
    : null;

  return {
    resultado,
    senales: {
      juridicas: juridicas.length, juridicasConCadena, juridicasEnNivel1, llamadas,
      sumaParticipacion,
      participacionSospechosa: sumaParticipacion !== null && Math.abs(sumaParticipacion - 100) > 0.5,
    },
    uso: { promptTokenCount: entrada, candidatesTokenCount: salida },
  };
}

// ── Aplanado a filas de `lens.analisis_persona` ────────────────────────────

export interface FilaPersona {
  persona_uid: string;
  analisis_id: string;
  rol: 'representante' | 'accionista_directo' | 'accionista_indirecto';
  persona_padre_uid?: string;
  nivel: number;
  orden: number;
  person_type?: string;
  nombre_completo?: string;
  nombre?: string;
  apellido?: string;
  documento?: string;
  documento_canon?: string;
  tipo_documento?: string;
  pais_origen?: string;
  participacion_pct?: number | null;
  es_pep?: boolean | null;
  cargo?: string;
  origen: string;
  ejecutado_en: string;
  cargado_en: string;
}

// Misma guarda que en el backfill: la clave de cruce solo se arma si el valor
// tiene DÍGITOS. Hay documentos donde el RUT viene deletreado en palabras, y
// canonizar esa prosa produce una clave inventada.
const canon = (v?: string): string | undefined => {
  const t = (v ?? '').trim();
  if (!t || !/[0-9]/.test(t)) return undefined;
  return t.toUpperCase().replace(/[^0-9A-Z]/g, '');
};
const limpio = (v?: string): string | undefined => (v ?? '').trim() || undefined;

/**
 * Convierte el resultado en filas para `lens.analisis_persona`.
 *
 * El `rol` sale de DÓNDE apareció la persona, no de su `personType`. Si el
 * modelo puso una jurídica en `directOwnership`, la fila dice
 * `accionista_directo` con `person_type = JURIDICA` — y esa contradicción queda
 * visible y contable. Deducir el rol del tipo taparía el error.
 */
export function filasDePersonas(
  analisisId: string,
  r: ResultadoShareholders,
  meta: { origen: string; ejecutadoEn: string },
): FilaPersona[] {
  const ts = (d: string) => new Date(d).toISOString().replace('T', ' ').slice(0, 23);
  const en = ts(meta.ejecutadoEn);
  const cargado = ts(new Date().toISOString());
  const filas: FilaPersona[] = [];

  const base = (p: PersonaContrato, rol: FilaPersona['rol'], ruta: string, nivel: number, orden: number, padre?: string): FilaPersona => ({
    persona_uid: `${analisisId}|${rol}|${ruta}`,
    analisis_id: analisisId,
    rol,
    persona_padre_uid: padre,
    nivel,
    orden,
    person_type: p.personType,
    nombre_completo: limpio(p.shareholderName),
    nombre: limpio(p.name),
    apellido: limpio(p.lastName),
    documento: limpio(p.shareholderId),
    documento_canon: canon(p.shareholderId),
    tipo_documento: limpio(p.identificationType),
    pais_origen: limpio(p.countryOfOrigin),
    participacion_pct: typeof p.ownershipPercentage === 'number' ? p.ownershipPercentage : undefined,
    es_pep: typeof p.isPEP === 'boolean' ? p.isPEP : undefined,
    cargo: limpio(p.position),
    origen: meta.origen,
    ejecutado_en: en,
    cargado_en: cargado,
  });

  (r.legalRepresentatives ?? []).forEach((p, i) =>
    filas.push(base(p, 'representante', String(i), 0, i)));
  (r.directOwnership ?? []).forEach((p, i) =>
    filas.push(base(p, 'accionista_directo', String(i), 0, i)));
  (r.indirectShareholders ?? []).forEach((p, i) => {
    const padre = base(p, 'accionista_indirecto', String(i), 0, i);
    filas.push(padre);
    // La ruta del hijo incluye la del padre: sin eso, dos jurídicas con un
    // socio cada una generarían el mismo uid y una pisaría a la otra.
    (p.indirectShareholders ?? []).forEach((h, j) =>
      filas.push(base(h, 'accionista_indirecto', `${i}|${j}`, 1, j, padre.persona_uid)));
  });

  return filas;
}
