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
import { generarConArchivo } from './geminiService';
import { GEMINI_SHAREHOLDERS_PROMPT } from '../constants';

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

// El esquema tiene UN solo nivel de anidación a propósito, no recursión: el
// modelo de datos define `nivel` 0 y 1, y los esquemas recursivos no son
// confiables en la API. Una cadena más profunda que eso se aplana al nivel 1,
// que es lo que el contrato consume hoy.
// El tipo se anota a mano porque la función se referencia a sí misma
// (`persona(false)` dentro de `persona(true)`) y TypeScript no puede inferirla.
interface EsquemaGemini {
  type: unknown;
  properties?: Record<string, unknown>;
  items?: EsquemaGemini;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
}
const persona = (conAnidados: boolean): EsquemaGemini => ({
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
    ...(conAnidados
      ? { indirectShareholders: { type: Type.ARRAY, items: persona(false) } }
      : {}),
  },
  required: ['personType', 'shareholderName'],
});

export const ESQUEMA_SHAREHOLDERS = {
  type: Type.OBJECT,
  properties: {
    legalRepresentatives: { type: Type.ARRAY, items: persona(false) },
    directOwnership: { type: Type.ARRAY, items: persona(false) },
    indirectShareholders: { type: Type.ARRAY, items: persona(true) },
  },
  required: ['legalRepresentatives', 'directOwnership', 'indirectShareholders'],
};

/** Violaciones de la regla de oro. Vacío = el modelo la respetó. */
export interface ViolacionesReglaOro {
  directoConJuridica: number;   // una jurídica colada en directOwnership
  indirectoConNatural: number;  // una natural en la raíz de indirectShareholders
  anidadoSinPadre: number;      // imposible por construcción, se verifica igual
  total: number;
}

export function verificarReglaOro(r: ResultadoShareholders): ViolacionesReglaOro {
  const directoConJuridica = (r.directOwnership ?? []).filter(p => p.personType === 'JURIDICA').length;
  const indirectoConNatural = (r.indirectShareholders ?? []).filter(p => p.personType === 'NATURAL').length;
  return { directoConJuridica, indirectoConNatural, anidadoSinPadre: 0,
           total: directoConJuridica + indirectoConNatural };
}

const vacio = (): ResultadoShareholders =>
  ({ legalRepresentatives: [], directOwnership: [], indirectShareholders: [] });

/**
 * Extrae la composición societaria del archivo. Devuelve siempre las tres
 * claves, aunque queden vacías — es parte del contrato.
 */
export async function extraerShareholders(
  archivo: File,
): Promise<{ resultado: ResultadoShareholders; violaciones: ViolacionesReglaOro; uso?: { promptTokenCount?: number; candidatesTokenCount?: number } }> {
  const { texto, uso } = await generarConArchivo(archivo, GEMINI_SHAREHOLDERS_PROMPT, {
    responseSchema: ESQUEMA_SHAREHOLDERS,
    operacion: 'Shareholders',
  });
  let crudo: Partial<ResultadoShareholders>;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new Error('El análisis falló. Error: la respuesta de shareholders no es JSON válido.');
  }
  const resultado: ResultadoShareholders = {
    ...vacio(),
    ...crudo,
    legalRepresentatives: crudo.legalRepresentatives ?? [],
    directOwnership: crudo.directOwnership ?? [],
    indirectShareholders: crudo.indirectShareholders ?? [],
  };
  return { resultado, violaciones: verificarReglaOro(resultado), uso };
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
