// Persistencia de la extracción en el schema `lens` de Redshift.
//
// POR QUÉ EXISTE. Hoy lo que extrae el analizador vive SOLO en el IndexedDB del
// navegador de quien lo corrió. Si cambia de máquina o limpia el navegador, se
// perdió, y no hay forma de responder "¿qué extrajimos de esta empresa en
// marzo?" ni "¿qué campo falla más el modelo?".
//
// NO ARMA TRANSPORTE PROPIO. Reusa el camino que ya está probado y es
// idempotente —`enviarLote` de `colasLogService`: Worker → `colas-logger` →
// Redshift, con whitelist de tablas y columnas, valores como parámetros y
// DELETE+INSERT por clave—. Eso trae gratis el buffer de reintento del
// navegador: el cluster se pausa 18:30–04:00, y lo que se manda en esa ventana
// queda guardado y se reintenta solo cuando Redshift vuelve. Reenviar de más
// nunca duplica.
//
// ES BEST-EFFORT Y NO PUEDE ROMPER NADA. Todo lo de acá va envuelto y sin await
// desde el llamador: si la persistencia falla, el análisis siguió igual. Guardar
// el registro no puede costarle el trabajo a un analista.

import { enviarLote } from './colasLogService';
import { PREDEFINED_FIELDS } from '../constants';
import type { ExtractedField } from '../types';

export type OrigenAnalisis = 'analizador' | 'batch' | 'api' | 'kyb';

/** Fila tal como la espera el logger. Coincide con su tipo interno. */
type Fila = { tabla: string; datos: Record<string, unknown> };

// Formato que acepta Redshift en una columna TIMESTAMP, el mismo que ya usa
// `colasLogService`: 'YYYY-MM-DD HH:MM:SS.mmm'.
const ts = (d: Date | string = new Date()): string =>
  new Date(d).toISOString().replace('T', ' ').slice(0, 23);

/**
 * ID de la ejecución, ordenable por tiempo.
 *
 * No es un ULID canónico —no quiero sumar una dependencia por esto— pero
 * cumple lo que importa: el prefijo es el timestamp en base36, así que ordenar
 * por id ordena por fecha, y la cola aleatoria evita colisiones entre dos
 * analistas que arrancan en el mismo milisegundo.
 */
export const nuevoAnalisisId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`.toUpperCase();

/** El RUT como clave de cruce: sin puntos ni guion, DV pegado. */
export const rutCanonico = (v: unknown): string =>
  String(v ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

const valorDe = (campos: ExtractedField[], nombre: string): string =>
  campos.find(c => c.field === nombre)?.value ?? '';

// "No especificado" es lo que devuelve el modelo cuando no encontró el dato: no
// es un valor, es la ausencia de uno. Se marca aparte para poder medir cobertura
// sin tener que conocer esa convención en cada consulta.
const esVacio = (v: string): boolean => {
  const t = v.trim();
  return t === '' || t.toLowerCase() === 'no especificado';
};

export interface ActorPersistencia {
  uid?: string;
  nombre?: string;
  email?: string;
  esSistema?: boolean;
}

export interface EntradaAnalisis {
  analisisId: string;
  origen: OrigenAnalisis;
  actor?: ActorPersistencia | null;
  ejecutadoEn?: string;              // ISO; por defecto ahora
  campos: ExtractedField[];
  // Qué se analizó
  archivos?: string[];
  consolidado?: boolean;
  proposito?: string;
  // Resultado
  estado?: string;                   // COMPLETO | PARCIAL | ERROR
  paisDetectado?: string;
  error?: string;
  avisos?: unknown[];
  // Cómo se leyó / cuánto costó
  paginasTotales?: number;
  paginasPorCapa?: number;
  paginasPorOcr?: number;
  caracteres?: number;
  modelo?: string;
  tokensPrompt?: number;
  tokensSalida?: number;
  duracionMs?: number;
  /** El JSON completo de la ficha. SIN el texto del documento (ver el DDL). */
  ficha?: unknown;
  hashDocumentos?: string;
}

export interface EntradaBatchDocumento {
  analisisId: string;
  documentoId: string;
  nombreArchivo?: string;
  fuente?: string;
  slot?: string;
  estadoDocumento?: string;
  ok?: boolean;
  metodo?: string;
  paginasTotales?: number;
  paginasLeidas?: number;
  paginasPorOcr?: number;
  caracteres?: number;
  error?: string;
  ejecutadoEn?: string;
}

/** Cabecera + un registro por campo + la ficha completa. */
export function filasDeAnalisis(e: EntradaAnalisis): Fila[] {
  const en = ts(e.ejecutadoEn ?? new Date());
  const cargado = ts();
  const actorTipo = e.actor ? (e.actor.esSistema ? 'sistema' : 'persona') : undefined;

  const filas: Fila[] = [{
    tabla: 'lens_analisis',
    datos: {
      analisis_id: e.analisisId,
      origen: e.origen,
      actor_tipo: actorTipo,
      actor_id: e.actor?.uid ?? e.actor?.nombre,
      actor_email: e.actor?.email,
      ejecutado_en: en,
      n_archivos: e.archivos?.length,
      archivos: e.archivos?.length ? e.archivos : undefined,
      consolidado: e.consolidado,
      proposito: e.proposito,
      estado: e.estado,
      pais_detectado: e.paisDetectado,
      // Salen de la propia extracción, así que son cruce DE CONVENIENCIA: los
      // sacó un modelo de un PDF. El cruce autoritativo es `analisis_id`.
      rut_sociedad: rutCanonico(valorDe(e.campos, 'RUT de la sociedad')) || undefined,
      razon_social: valorDe(e.campos, 'Razón Social') || undefined,
      paginas_totales: e.paginasTotales,
      paginas_por_capa: e.paginasPorCapa,
      paginas_por_ocr: e.paginasPorOcr,
      caracteres: e.caracteres,
      modelo: e.modelo,
      tokens_prompt: e.tokensPrompt,
      tokens_salida: e.tokensSalida,
      duracion_ms: e.duracionMs,
      error: e.error,
      avisos: e.avisos?.length ? e.avisos : undefined,
      cargado_en: cargado,
    },
  }];

  for (const c of e.campos) {
    const orden = PREDEFINED_FIELDS.indexOf(c.field);
    filas.push({
      tabla: 'lens_analisis_campo',
      datos: {
        // Clave sintética, NO compuesta: la ruta batcheada del logger borra por
        // la primera columna de la PK, así que con una PK compuesta escribir un
        // campo habría borrado los otros 17 del mismo análisis.
        campo_id: `${e.analisisId}|${c.field}`,
        analisis_id: e.analisisId,
        campo: c.field,
        orden: orden >= 0 ? orden : undefined,
        valor: c.value,
        vacio: esVacio(c.value ?? ''),
        origen: e.origen,
        ejecutado_en: en,
        cargado_en: cargado,
      },
    });
  }

  if (e.ficha !== undefined) {
    filas.push({
      tabla: 'lens_analisis_ficha',
      datos: {
        analisis_id: e.analisisId,
        origen: e.origen,
        ejecutado_en: en,
        ficha: e.ficha,
        hash_documentos: e.hashDocumentos,
        cargado_en: cargado,
      },
    });
  }

  return filas;
}

/** Una fila por documento de una corrida batch. */
export function filasDeBatchDocumentos(docs: EntradaBatchDocumento[]): Fila[] {
  const cargado = ts();
  return docs.map(d => ({
    tabla: 'lens_batch_documento',
    datos: {
      documento_uid: `${d.analisisId}|${d.documentoId}`,
      analisis_id: d.analisisId,
      documento_id: d.documentoId,
      nombre_archivo: d.nombreArchivo,
      fuente: d.fuente,
      slot: d.slot,
      estado_documento: d.estadoDocumento,
      ok: d.ok,
      metodo: d.metodo,
      paginas_totales: d.paginasTotales,
      paginas_leidas: d.paginasLeidas,
      paginas_por_ocr: d.paginasPorOcr,
      caracteres: d.caracteres,
      error: d.error,
      ejecutado_en: d.ejecutadoEn ? ts(d.ejecutadoEn) : cargado,
      cargado_en: cargado,
    },
  }));
}

/**
 * Manda todo. Best-effort y sin lanzar: quien lo llama no tiene que defenderse.
 *
 * No se hace `await` desde la UI a propósito — persistir es un efecto, no parte
 * del análisis. Si Redshift está dormido, las filas quedan en el buffer del
 * navegador y entran cuando vuelve.
 */
export async function persistirAnalisis(
  e: EntradaAnalisis,
  documentos?: EntradaBatchDocumento[],
): Promise<{ escritas: number; fallidas: number; error?: string }> {
  try {
    const filas = [...filasDeAnalisis(e), ...(documentos?.length ? filasDeBatchDocumentos(documentos) : [])];
    const r = await enviarLote(filas);
    return { escritas: r.escritas, fallidas: r.fallidas, error: r.error };
  } catch (err) {
    return { escritas: 0, fallidas: 0, error: (err as Error).message };
  }
}
