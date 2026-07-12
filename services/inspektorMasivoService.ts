// Lógica del proceso masivo de Inspektor (Colombia): normalización, deduplicación,
// validación, clasificación por prioridad, reintentos, caché de reanudación
// (IndexedDB propio, aislado del resto) y generación del Excel de salida.
// Autocontenido: NO toca el cliente Inspektor ni otros módulos.

import Dexie, { Table } from 'dexie';
import * as XLSX from 'xlsx';

// ─── Tipos estructurales de la respuesta (compatibles con InspektorColombia) ────
export interface InspektorListaItemLike {
  nombreGrupoLista?: string; grupoLista?: string; grupo?: string;
  categoria?: string; nombreCategoria?: string; tipoLista?: string; nombreTipoLista?: string;
  Prioridad?: string; prioridad?: string;
  nombreCompleto?: string; documentoIdentidad?: string;
  peps?: string; delito?: string; fuenteConsulta?: string; zona?: string; fechaActualizacion?: string;
}
export interface InspektorResultLike {
  cantCoincidencias?: number;
  listas?: InspektorListaItemLike[];
  listas_propias?: InspektorListaItemLike[];
}

export type Resultado =
  | 'SIN_HALLAZGOS' | 'REVISAR' | 'ALERTA' | 'ERROR_VALIDACION' | 'ERROR_CONSULTA';

export interface NormalizedRow {
  idx: number;              // orden original en el archivo
  nombreCompleto: string;   // normalizado (uppercase, espacios colapsados)
  numeroDni: string;        // normalizado (sin puntos/guiones/espacios, string)
  tipoDoc: number;          // mapeado al catálogo (1-5)
  tipoLabel: string;
  validationError?: string; // si está → ERROR_VALIDACION (no se consulta)
}

export interface Coincidencia {
  nombre: string; identificacion: string; prioridad: number | null;
  grupoLista: string; nombreLista: string; delito: string;
  zona: string; fuente: string; estado: string;
}

export interface Classification {
  resultado: Resultado;
  totalCoincidencias: number;
  prioridadMaxima: number | null; // menor = más severa
  listas: string[];
  coincidencias: Coincidencia[];
}

// ─── Normalización ──────────────────────────────────────────────────────────────
export function normalizeName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

// String siempre (preserva ceros a la izquierda); sin puntos, guiones ni espacios.
export function normalizeDni(raw: unknown): string {
  return String(raw ?? '').trim().replace(/[.\-\s]/g, '');
}

// Mapea el tipo de documento al catálogo (CC=1, CE=2, NIT=3, Pasaporte=4, TI=5).
// Devuelve null si el valor no mapea → la fila se marca ERROR_VALIDACION.
export function mapTipoDoc(raw: unknown): { tipo: number; label: string } | null {
  const v = String(raw ?? '').toLowerCase().trim();
  const LABELS: Record<number, string> = { 1: 'CC', 2: 'CE', 3: 'NIT', 4: 'PASAPORTE', 5: 'TI' };
  if (v === '') return { tipo: 1, label: LABELS[1] }; // vacío → CC por defecto (Colombia)
  const n = Number(v);
  if (!isNaN(n) && n >= 1 && n <= 5) return { tipo: n, label: LABELS[n] };
  if (/(cédula de ciudadan|cedula de ciudadan|\bcc\b)/.test(v)) return { tipo: 1, label: LABELS[1] };
  if (/(extranjer|\bce\b)/.test(v)) return { tipo: 2, label: LABELS[2] };
  if (/nit/.test(v)) return { tipo: 3, label: LABELS[3] };
  if (/(pasaporte|passport|\bpa\b)/.test(v)) return { tipo: 4, label: LABELS[4] };
  if (/(tarjeta|\bti\b)/.test(v)) return { tipo: 5, label: LABELS[5] };
  return null; // no mapea
}

// Enmascara PII para logs (12****89).
export function maskPii(s: string): string {
  const v = String(s ?? '');
  if (v.length <= 4) return v ? '****' : '';
  return `${v.slice(0, 2)}****${v.slice(-2)}`;
}

// ─── Deduplicación por (tipo, número) ─────────────────────────────────────────────
export function dedupeKey(tipo: number, numero: string): string {
  return `${tipo}|${numero}`;
}

// Devuelve las filas únicas a consultar y el mapa clave → índices originales.
// Genérico: acepta cualquier fila con {idx, tipoDoc, validationError?} y un
// extractor del número de documento (para no acoplar el nombre del campo).
export function dedupe<T extends { idx: number; tipoDoc: number; validationError?: string }>(
  rows: T[],
  getDni: (r: T) => string = (r) => (r as { numeroDni?: string }).numeroDni ?? '',
): { unique: T[]; groups: Map<string, number[]> } {
  const groups = new Map<string, number[]>();
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const dni = getDni(r);
    if (r.validationError || !dni) continue; // inválidas no se consultan/deduplican
    const key = dedupeKey(r.tipoDoc, dni);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.idx);
    if (!seen.has(key)) { seen.add(key); unique.push(r); }
  }
  return { unique, groups };
}

// ─── Clasificación por prioridad ──────────────────────────────────────────────────
function grupoLista(item: InspektorListaItemLike): string {
  return (item.nombreGrupoLista ?? item.grupoLista ?? item.grupo ??
    item.categoria ?? item.nombreCategoria ?? item.tipoLista ?? item.nombreTipoLista ?? '').trim();
}
function nombreLista(item: InspektorListaItemLike): string {
  return (item.nombreTipoLista ?? item.tipoLista ?? item.categoria ?? item.nombreCategoria ?? '').trim();
}
function parsePrioridad(item: InspektorListaItemLike): number | null {
  const raw = String(item.Prioridad ?? item.prioridad ?? '').match(/[1-4]/);
  return raw ? Number(raw[0]) : null;
}
// Listas restrictivas/vinculantes (OFAC/SDN, ONU, UE) o el grupo objetivo LA/FT.
function esRestrictiva(item: InspektorListaItemLike): boolean {
  const t = `${grupoLista(item)} ${nombreLista(item)}`.toUpperCase();
  return /OFAC|SDN|ONU|NACIONES UNIDAS|UNIÓN EUROPEA|UNION EUROPEA|\bUE\b|\bEU\b|VINCULANTE|RESTRICTIV|LA\/FT|LAFT|\bFT\b|FPADM|CORRUPCIÓN|CORRUPCION|EXTINCIÓN DE DOMINIO|EXTINCION DE DOMINIO/.test(t);
}

export function classify(result: InspektorResultLike | undefined): Classification {
  const items = [...(result?.listas ?? []), ...(result?.listas_propias ?? [])];
  const coincidencias: Coincidencia[] = items.map(it => ({
    nombre: (it.nombreCompleto ?? '').trim(),
    identificacion: (it.documentoIdentidad ?? '').trim(),
    prioridad: parsePrioridad(it),
    grupoLista: grupoLista(it),
    nombreLista: nombreLista(it),
    delito: (it.delito ?? it.peps ?? '').trim(),
    zona: (it.zona ?? '').trim(),
    fuente: (it.fuenteConsulta ?? '').trim(),
    estado: (it.fechaActualizacion ?? '').trim(),
  }));
  const total = result?.cantCoincidencias ?? coincidencias.length;
  const prioridades = coincidencias.map(c => c.prioridad).filter((p): p is number => p != null);
  const prioridadMaxima = prioridades.length ? Math.min(...prioridades) : null;
  const listas = [...new Set(coincidencias.map(c => c.nombreLista || c.grupoLista).filter(Boolean))];

  let resultado: Resultado;
  if ((total ?? 0) === 0 && coincidencias.length === 0) resultado = 'SIN_HALLAZGOS';
  else if (prioridades.some(p => p <= 2) || items.some(esRestrictiva)) resultado = 'ALERTA';
  else resultado = 'REVISAR';

  return { resultado, totalCoincidencias: coincidencias.length || total || 0, prioridadMaxima, listas, coincidencias };
}

// ─── Reintentos con backoff exponencial + jitter ──────────────────────────────────
export async function retry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; onRetry?: (attempt: number, err: unknown) => void } = {},
): Promise<T> {
  const { retries = 3, baseMs = 600, onRetry } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      onRetry?.(attempt, err);
      const backoff = baseMs * 2 ** (attempt - 1);
      const jitter = backoff * 0.3 * ((attempt * 7919) % 100) / 100; // determinista, sin Math.random
      await new Promise(r => setTimeout(r, backoff + jitter));
    }
  }
  throw lastErr;
}

// ─── Caché de reanudación (IndexedDB propio, aislado de dbService) ─────────────────
interface CacheRow { key: string; raw: InspektorResultLike; at: number; }
class InspektorMasivoDB extends Dexie {
  results!: Table<CacheRow, string>;
  constructor() {
    super('InspektorMasivoCache');
    this.version(1).stores({ results: 'key, at' });
  }
}
let _db: InspektorMasivoDB | null = null;
function db(): InspektorMasivoDB { return (_db ??= new InspektorMasivoDB()); }

export async function cacheGet(tipo: number, numero: string): Promise<InspektorResultLike | undefined> {
  try { return (await db().results.get(dedupeKey(tipo, numero)))?.raw; }
  catch { return undefined; }
}
export async function cachePut(tipo: number, numero: string, raw: InspektorResultLike, at: number): Promise<void> {
  try { await db().results.put({ key: dedupeKey(tipo, numero), raw, at }); } catch { /* no crítico */ }
}
export async function cacheClear(): Promise<void> {
  try { await db().results.clear(); } catch { /* no crítico */ }
}

// ─── Excel de salida (2 hojas: Resumen + Detalle) ─────────────────────────────────
export interface SummaryRow {
  nombre_completo: string; tipo_dni: string; numero_dni: string;
  resultado: Resultado; total_coincidencias: number | string;
  prioridad_maxima: number | string; listas: string;
  fecha_consulta: string; observaciones: string;
}

function autofit(ws: XLSX.WorkSheet, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  ws['!cols'] = keys.map(k => {
    const maxLen = Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length));
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
}

export function buildMasivoWorkbook(summary: SummaryRow[], detail: Record<string, unknown>[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.json_to_sheet(summary);
  autofit(wsResumen, summary as unknown as Record<string, unknown>[]);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  const wsDetalle = XLSX.utils.json_to_sheet(detail.length ? detail : [{ Sin: 'coincidencias' }]);
  autofit(wsDetalle, detail);
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');
  return wb;
}
