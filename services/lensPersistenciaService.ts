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

// ── Material crudo: la entrada y la salida textual del modelo ───────────────
// Para recalibrar no alcanza con la ficha: hay que poder volver a correr el
// modelo sobre EXACTAMENTE el mismo texto y comparar contra exactamente lo que
// había respondido.
//
// Va en trozos por dos límites medidos contra el cluster:
//   · la Data API rechaza un request de más de 200 kB, y el texto viaja como
//     parámetro ("Query string size exceeds 200 kB")
//   · VARCHAR en Redshift topa en 65.535 BYTES, y una escritura de 41 páginas
//     son 73.759 caracteres
//
// 20.000 caracteres por trozo deja margen para los acentos, que ocupan 2 bytes.
export const TROZO_CHARS = 20_000;
// Cuántos trozos entran en un request. 8 × 20.000 ≈ 160 kB, bajo el techo de 200
// kB con margen. El logger agrupa las filas de una misma tabla en UN INSERT, así
// que este número es el que decide el tamaño del request, no el del trozo.
const TROZOS_POR_LOTE = 8;

export type TipoTexto = 'documento' | 'respuesta_modelo';

/** sha256 en hex. Identifica el documento sin tener que rearmarlo. */
export async function sha256Hex(texto: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';   // sin WebCrypto (contexto no seguro): se guarda sin hash
  }
}

export const trocear = (texto: string, tam = TROZO_CHARS): string[] => {
  const partes: string[] = [];
  for (let i = 0; i < texto.length; i += tam) partes.push(texto.slice(i, i + tam));
  return partes;
};

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

/** Los trozos de un texto, listos para mandar. */
export function filasDeTexto(
  analisisId: string, tipo: TipoTexto, texto: string, sha: string,
  origen: OrigenAnalisis, ejecutadoEn?: string,
): Fila[] {
  const partes = trocear(texto);
  const en = ts(ejecutadoEn ?? new Date());
  const cargado = ts();
  return partes.map((t, i) => ({
    tabla: 'lens_analisis_texto',
    datos: {
      texto_id: `${analisisId}|${tipo}|${i}`,
      analisis_id: analisisId,
      tipo, orden: i, partes: partes.length,
      texto: t, caracteres: t.length,
      sha256: sha || undefined,
      origen, ejecutado_en: en, cargado_en: cargado,
    },
  }));
}

/**
 * Manda todo. Best-effort y sin lanzar: quien lo llama no tiene que defenderse.
 *
 * No se hace `await` desde la UI a propósito — persistir es un efecto, no parte
 * del análisis. Si Redshift está dormido, las filas quedan en el buffer del
 * navegador y entran cuando vuelve.
 *
 * OJO con reenviar: el logger hace DELETE + INSERT de la fila entera con LAS
 * COLUMNAS QUE LLEGAN, no un merge. Reenviar una fila con menos columnas BORRA
 * las que faltan. Por eso `persistirFicha` manda siempre la fila completa.
 */
export async function persistirAnalisis(
  e: EntradaAnalisis,
  documentos?: EntradaBatchDocumento[],
  crudo?: { textoDocumento?: string; respuestaModelo?: string },
): Promise<{ escritas: number; fallidas: number; error?: string }> {
  try {
    // El hash del documento se calcula acá y viaja también en la ficha: sirve
    // para cruzar dos análisis del mismo archivo sin rearmar el texto.
    const sha = crudo?.textoDocumento ? await sha256Hex(crudo.textoDocumento) : '';
    const filas = [
      ...filasDeAnalisis({ ...e, hashDocumentos: e.hashDocumentos ?? (sha || undefined) }),
      ...(documentos?.length ? filasDeBatchDocumentos(documentos) : []),
    ];
    let escritas = 0, fallidas = 0, error: string | undefined;
    const r = await enviarLote(filas);
    escritas += r.escritas; fallidas += r.fallidas; error ??= r.error;

    // Los textos van aparte y en lotes chicos: son lo único que puede pasarse
    // del techo de 200 kB por request.
    const textos = [
      ...(crudo?.textoDocumento ? filasDeTexto(e.analisisId, 'documento', crudo.textoDocumento, sha, e.origen, e.ejecutadoEn) : []),
      ...(crudo?.respuestaModelo ? filasDeTexto(e.analisisId, 'respuesta_modelo', crudo.respuestaModelo, '', e.origen, e.ejecutadoEn) : []),
    ];
    for (let i = 0; i < textos.length; i += TROZOS_POR_LOTE) {
      const rt = await enviarLote(textos.slice(i, i + TROZOS_POR_LOTE));
      escritas += rt.escritas; fallidas += rt.fallidas; error ??= rt.error;
    }
    return { escritas, fallidas, error };
  } catch (err) {
    return { escritas: 0, fallidas: 0, error: (err as Error).message };
  }
}

/**
 * Reescribe SOLO la ficha completa. Para cuando terminan análisis que corren
 * después de la extracción —riesgo, integridad— y que hasta ahora no quedaban
 * en ninguna parte.
 *
 * Manda la fila ENTERA a propósito: el logger borra e inserta con las columnas
 * que recibe, así que mandar solo `ficha` dejaría `origen`, `ejecutado_en` y el
 * hash en NULL.
 */
export async function persistirFicha(
  analisisId: string, origen: OrigenAnalisis, ficha: unknown,
  opciones?: { ejecutadoEn?: string; hashDocumentos?: string },
): Promise<void> {
  try {
    await enviarLote([{
      tabla: 'lens_analisis_ficha',
      datos: {
        analisis_id: analisisId,
        origen,
        ejecutado_en: ts(opciones?.ejecutadoEn ?? new Date()),
        ficha,
        hash_documentos: opciones?.hashDocumentos,
        cargado_en: ts(),
      },
    }]);
  } catch { /* best-effort */ }
}
