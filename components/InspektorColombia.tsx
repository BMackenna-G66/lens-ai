import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  normalizeName, normalizeDni, mapTipoDoc, maskPii, dedupe, dedupeKey,
  classify, retry, cacheGet, cachePut, cacheClear, buildMasivoWorkbook,
  type Resultado, type Classification,
} from '../services/inspektorMasivoService';
import { evaluateLegalPolicy, LP_META, type LegalPolicyOutcome } from '../services/legalPolicyGate';

// ─── Config ───────────────────────────────────────────────────────────────────
const INSPEKTOR_DIRECT = 'https://inspektor.datalaft.com:2121/api';
const INSPEKTOR_USER = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_USER ?? 'WS_Global81';
const INSPEKTOR_PASS = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_PASS ?? 'Risk5397#0ft';
// Si hay proxy (Cloudflare Worker) configurado, se enrutan las llamadas por él
// (evita CORS y problemas de ruta de red del navegador hacia Inspektor).
const INSPEKTOR_PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');
const INSPEKTOR_BASE = INSPEKTOR_PROXY ? `${INSPEKTOR_PROXY}/inspektor` : INSPEKTOR_DIRECT;
const GRUPO_OBJETIVO = 'LISTAS ASOCIADAS A LA/FT/FPADM, CORRUPCIÓN U OTROS DELITOS (PENAL) Y EXTINCIÓN DE DOMINIO';

// fetch con timeout — evita que el proceso masivo se "pegue" si Inspektor no responde.
async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${ms / 1000}s): Inspektor no respondió`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface InspektorListaItem {
  nombreGrupoLista?: string; grupoLista?: string; grupo?: string;
  categoria?: string; nombreCategoria?: string;
  tipoLista?: string; nombreTipoLista?: string;
  Prioridad?: string; prioridad?: string;
  nombreCompleto?: string; documentoIdentidad?: string;
  peps?: string; delito?: string; fuenteConsulta?: string;
  zona?: string; fechaActualizacion?: string;
}

interface InspektorProcSancion { sancion?: string; termino?: string; clase?: string; }
interface InspektorProcDelito  { descripcion?: string; }
interface InspektorProcInstancia {
  nombre?: string; autoridad?: string;
  fecha_provincia?: string; fecha_efecto_juridicos?: string;
}
interface InspektorProcInhabilidad {
  modulo?: string; inhabilidad_legal?: string;
  fecha_inicio?: string; fecha_fin?: string;
}
interface InspektorProcRecord {
  identification?: string; name?: string; num_siri?: string;
  sanciones?: InspektorProcSancion[];
  delitos?: InspektorProcDelito[];
  instancias?: InspektorProcInstancia[];
  inhabilidades?: InspektorProcInhabilidad[];
}

interface InspektorRJProceso {
  idProceso?: string; llaveProceso?: string; despacho?: string;
  departamento?: string; fechaProceso?: string;
  fechaUltimaActuacion?: string; esPrivado?: unknown; sujetosProcesales?: string;
}

interface InspektorJEPMSItem {
  cityName?: string; nameResult?: string; identificationNumberResult?: string;
  isSuccess?: unknown; queryDate?: string; link?: string;
}

interface InspektorResult {
  numConsulta?: string | number;
  cantCoincidencias?: number;
  usuario?: { usuario?: string; idEmpresa?: string; idRol?: string };
  listas?: InspektorListaItem[];
  listas_propias?: InspektorListaItem[];
  procuraduria?: unknown;
  ramaJudicial?: unknown;
  ramaJudicialJEPMS?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clean(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = String(v).trim();
  return s || '—';
}

function getGrupoLista(item: InspektorListaItem): string {
  return (
    item.nombreGrupoLista ?? item.grupoLista ?? item.grupo ??
    item.categoria ?? item.nombreCategoria ?? item.tipoLista ??
    item.nombreTipoLista ?? '—'
  ).trim();
}

function esGrupoObjetivo(item: InspektorListaItem): boolean {
  return getGrupoLista(item).toUpperCase() === GRUPO_OBJETIVO.toUpperCase();
}

function getRiesgo(cant: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (cant === 0) return 'LOW';
  if (cant <= 2) return 'MEDIUM';
  return 'HIGH';
}

function getProcuraduriaRecords(data: unknown): InspektorProcRecord[] {
  if (!data) return [];
  if (typeof data === 'object' && data !== null && 'hasError' in (data as object) && (data as { hasError: boolean }).hasError) return [];
  const d = (data as { data?: unknown })?.data ?? data;
  if (Array.isArray(d)) return d.filter((i): i is InspektorProcRecord => typeof i === 'object' && i !== null);
  if (typeof d === 'object' && d !== null) return [d as InspektorProcRecord];
  return [];
}

function getRamaJudicialProcesos(data: unknown): InspektorRJProceso[] {
  if (!data) return [];
  if (typeof data === 'object' && data !== null && 'hasError' in (data as object) && (data as { hasError: boolean }).hasError) return [];
  const d = Array.isArray(data) ? data : (data as { data?: unknown })?.data;
  if (Array.isArray(d)) return d.filter((i): i is InspektorRJProceso => typeof i === 'object' && i !== null);
  return [];
}

function getJEPMSItems(data: unknown): InspektorJEPMSItem[] {
  if (!data) return [];
  if (typeof data === 'object' && data !== null && 'hasError' in (data as object) && (data as { hasError: boolean }).hasError) return [];
  const d = Array.isArray(data) ? data : (data as { data?: unknown })?.data;
  if (Array.isArray(d)) return d.filter((i): i is InspektorJEPMSItem => typeof i === 'object' && i !== null);
  return [];
}

// Capa 0 — Legal Policy Gate desde una respuesta de Inspektor.
function gateFromResult(res: InspektorResult | undefined, numeroDni: string): LegalPolicyOutcome | undefined {
  if (!res) return undefined;
  const listItems = [...(res.listas ?? []), ...(res.listas_propias ?? [])];
  const jepmsIds = getJEPMSItems(res.ramaJudicialJEPMS).map(j => j.identificationNumberResult ?? '');
  return evaluateLegalPolicy(listItems, jepmsIds, numeroDni);
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function inspektorLogin(): Promise<string> {
  const resp = await fetchWithTimeout(`${INSPEKTOR_BASE}/Auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: INSPEKTOR_USER, password: INSPEKTOR_PASS }),
  }, 20000);
  if (!resp.ok) throw new Error(`Login error ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();
  return (data as { token: { access_token: string } }).token.access_token;
}

async function consultarInspektor(
  nombre: string,
  identificacion: string,
  tipoDocumento = 1,
): Promise<InspektorResult> {
  const token = await inspektorLogin();
  const resp = await fetchWithTimeout(`${INSPEKTOR_BASE}/ConsultaPrincipal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre,
      identificacion,
      tipoDocumento,
      tienePrioridad_4: true,
      cantidadPalabras: '3',
      procuraduria: true,
      ramaJudicial: true,
      ramaJEPMS: true,
    }),
  }, 30000);
  if (!resp.ok) throw new Error(`Consulta error ${resp.status}: ${resp.statusText}`);
  return (await resp.json()) as InspektorResult;
}

// Versión para masivo: recibe el token ya obtenido (evita un login por consulta).
// Lanza 'TOKEN_EXPIRED' si recibe 401 para que el loop pueda refrescar y reintentar.
async function consultarConToken(
  token: string,
  nombre: string,
  identificacion: string,
  tipoDocumento = 1,
): Promise<InspektorResult> {
  const resp = await fetchWithTimeout(`${INSPEKTOR_BASE}/ConsultaPrincipal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre, identificacion, tipoDocumento,
      tienePrioridad_4: true, cantidadPalabras: '3',
      procuraduria: true, ramaJudicial: true, ramaJEPMS: true,
    }),
  }, 30000);
  if (resp.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!resp.ok) throw new Error(`Consulta error ${resp.status}: ${resp.statusText}`);
  return (await resp.json()) as InspektorResult;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskBadge({ riesgo }: { riesgo: string }) {
  const r = riesgo.toUpperCase();
  const cls =
    r === 'HIGH'   ? 'bg-red-900/40 text-red-400 border-red-700/60' :
    r === 'MEDIUM' ? 'bg-amber-900/40 text-amber-400 border-amber-700/60' :
                     'bg-emerald-900/30 text-emerald-400 border-emerald-700/50';
  const label = r === 'HIGH' ? '⚠ ALTO' : r === 'MEDIUM' ? '⚡ MEDIO' : '✓ BAJO';
  return (
    <span className={`text-[11px] font-black uppercase px-3 py-1 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function Section({ title, dark, children }: { title: string; dark: boolean; children: React.ReactNode }) {
  const muted = dark ? 'text-slate-500' : 'text-violet-600';
  const divider = dark ? 'bg-slate-700/50' : 'bg-violet-200/60';
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>{title}</span>
        <div className={`flex-1 h-px ${divider}`} />
      </div>
      {children}
    </div>
  );
}

function ListaCard({ item, idx, dark }: { item: InspektorListaItem; idx: number; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const borderCls = dark ? 'border-red-800/50 bg-red-950/20' : 'border-red-300 bg-red-50/70';
  return (
    <div className={`rounded-xl border ${borderCls}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-red-400 shadow-red-400/50 shadow-lg" />
        <span className={`flex-1 text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
          {clean(item.nombreCompleto) !== '—' ? clean(item.nombreCompleto) : `Coincidencia #${idx + 1}`}
        </span>
        <span className={`text-xs font-black uppercase text-red-400 mr-2`}>
          {clean(item.Prioridad ?? item.prioridad)}
        </span>
        <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs`}>
          {[
            ['Grupo Lista', getGrupoLista(item)],
            ['Lista', clean(item.nombreTipoLista)],
            ['Nombre detectado', clean(item.nombreCompleto)],
            ['Documento', clean(item.documentoIdentidad)],
            ['PEP', clean(item.peps)],
            ['Delito', clean(item.delito)],
            ['Fuente', clean(item.fuenteConsulta)],
            ['Zona', clean(item.zona)],
            ['Fecha actualización', clean(item.fechaActualizacion)],
          ].map(([label, value]) => (
            <div key={label} className={`rounded-lg px-3 py-2 border ${dark ? 'border-slate-700/40 bg-slate-900/40' : 'border-violet-200/60 bg-violet-50/40'}`}>
              <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${dark ? 'text-slate-500' : 'text-violet-500'}`}>{label}</div>
              <div className={`font-medium ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProcRecord({ rec, idx, dark }: { rec: InspektorProcRecord; idx: number; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-violet-200/70';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const text = dark ? 'text-slate-200' : 'text-slate-700';
  return (
    <div className={`rounded-xl border ${cardBg}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`text-sm font-bold ${text}`}>Registro #{idx + 1} — {clean(rec.name)}</span>
        <span className={`text-xs ml-auto ${muted}`}>{clean(rec.identification)}</span>
        <svg className={`w-3 h-3 ml-2 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs">
          <div className={`${muted}`}>N° SIRI: <span className={text}>{clean(rec.num_siri)}</span></div>
          {['sanciones','delitos','instancias','inhabilidades'].map(key => {
            const arr = (rec as Record<string, unknown>)[key] as unknown[];
            if (!arr?.length) return (
              <div key={key} className={muted}>
                <strong className="capitalize">{key}:</strong> Sin datos
              </div>
            );
            return (
              <div key={key}>
                <div className={`font-bold uppercase tracking-widest text-[9px] mb-1 ${muted}`}>{key}</div>
                <div className="space-y-1">
                  {arr.map((s, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 border ${dark ? 'border-slate-700/40 bg-slate-900/40' : 'border-violet-100 bg-violet-50/50'}`}>
                      {typeof s === 'object' && s !== null
                        ? Object.entries(s as Record<string,unknown>).filter(([,v]) => v != null).map(([k,v]) => (
                            <span key={k} className={`mr-3 ${text}`}><span className={muted}>{k}:</span> {String(v)}</span>
                          ))
                        : <span className={text}>{String(s)}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface InspektorColombiaProps {
  onBack: () => void;
  dark: boolean;
}

type TabMode = 'individual' | 'masivo';

interface MasivoRow {
  idx: number;
  documento: string;        // numeroDni normalizado
  nombre: string;           // nombreCompleto normalizado
  tipoDoc: number;
  tipoLabel: string;
  status: 'pending' | 'processing' | 'done' | 'error' | 'skipped';
  result?: InspektorResult;
  classification?: Classification;
  legalPolicy?: LegalPolicyOutcome;   // Capa 0 — Legal Policy Gate (informativo)
  resultado?: Resultado;    // SIN_HALLAZGOS / REVISAR / ALERTA / ERROR_*
  error?: string;
  validationError?: string; // si está → ERROR_VALIDACION (no se consulta)
}
interface LogLine { type: 'ok' | 'err' | 'info'; text: string; }

export const InspektorColombia: React.FC<InspektorColombiaProps> = ({ onBack, dark }) => {
  // ── Individual state ─────────────────────────────────────────────────────────
  const [tab, setTab]             = useState<TabMode>('individual');
  const [nombre, setNombre]       = useState('');
  const [documento, setDocumento] = useState('');
  const [tipoDoc, setTipoDoc]     = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState<InspektorResult | null>(null);
  const [indGate, setIndGate]     = useState<LegalPolicyOutcome | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── Masivo state ─────────────────────────────────────────────────────────────
  const [masivoFile, setMasivoFile]       = useState<File | null>(null);
  const [masivoRows, setMasivoRows]       = useState<MasivoRow[]>([]);
  const [masivoRunning, setMasivoRunning] = useState(false);
  const [masivoIsPaused, setMasivoIsPaused] = useState(false);
  const [masivoProgress, setMasivoProgress] = useState(0);
  const [masivoTotal, setMasivoTotal]     = useState(0);
  const [logs, setLogs]                   = useState<LogLine[]>([]);
  const [masivoError, setMasivoError]     = useState('');
  const [delay, setDelay]                 = useState(1.5);
  const [concurrency, setConcurrency]     = useState(3);
  const [reanudar, setReanudar]           = useState(true);
  const [isDrag, setIsDrag]               = useState(false);
  const abortRef  = useRef(false);
  const pausedRef = useRef(false);
  const logRef    = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((type: LogLine['type'], text: string) => {
    setLogs(l => [...l.slice(-300), { type, text }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }, []);

  const bg       = dark ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950' : 'bg-gradient-to-br from-white via-violet-50/40 to-white';
  const cardBg   = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-violet-200/70 shadow-sm';
  const textMain = dark ? 'text-slate-100' : 'text-slate-900';
  const textMuted = dark ? 'text-slate-400' : 'text-slate-600';
  const inputCls = dark
    ? 'bg-slate-900/60 border-slate-600/50 text-white placeholder-slate-600 focus:border-indigo-500'
    : 'bg-white border-violet-200 text-slate-800 placeholder-slate-400 focus:border-violet-500';
  const labelCls = dark ? 'text-slate-400' : 'text-violet-600';

  async function buscar() {
    if (!nombre.trim() || !documento.trim()) {
      setError('Nombre completo y número de documento son obligatorios.');
      return;
    }
    setLoading(true); setError(''); setResult(null); setIndGate(undefined);
    try {
      const r = await consultarInspektor(nombre.trim(), documento.trim(), tipoDoc);
      setResult(r);
      setIndGate(gateFromResult(r, normalizeDni(documento.trim())));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? 'Error de red. La API de Inspektor puede no permitir acceso desde el navegador (CORS). Verifica la configuración del servidor.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Masivo: parse Excel ──────────────────────────────────────────────────────
  // Soporta la plantilla estándar (filas 1-3 = metadata, fila 4 = headers)
  // y cualquier Excel genérico con columnas de documento/nombre.
  // Permite filas con solo nombre (sin número de identificación).
  function handleMasivoFile(file: File) {
    setMasivoFile(file);
    setMasivoRows([]); setLogs([]); setMasivoError(''); setMasivoProgress(0);
    file.arrayBuffer().then(buf => {
      try {
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // ── Detectar si es la plantilla estándar ─────────────────────────────
        // La plantilla tiene filas de metadatos (No./Nombre/Fecha) antes de
        // los headers reales. Detectamos esto leyendo la primera celda A1.
        const rawAll = (XLSX.utils.sheet_to_json(ws, {
          defval: '', header: 1,
        }) as unknown) as unknown[][];

        // Buscar la fila que contiene los headers reales (Tipo de identificación,
        // Número de identificación, Nombre completo) — puede estar en cualquier fila
        // de las primeras 10.
        let headerRowIdx = 0;
        const HEADER_KEYWORDS = ['tipo', 'número', 'numero', 'nombre', 'identificación', 'identificacion'];
        for (let i = 0; i < Math.min(10, rawAll.length); i++) {
          const rowStr = rawAll[i].map(c => String(c ?? '').toLowerCase());
          const matches = HEADER_KEYWORDS.filter(kw => rowStr.some(c => c.includes(kw)));
          if (matches.length >= 2) { headerRowIdx = i; break; }
        }

        // Reconstruir el JSON usando la fila de headers detectada
        const headers = (rawAll[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim());
        const dataRows = rawAll.slice(headerRowIdx + 1);

        const norm: Record<string, string>[] = dataRows
          .map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => {
              obj[h.toLowerCase()] = String((row as unknown[])[i] ?? '').trim();
            });
            return obj;
          })
          .filter(r => Object.values(r).some(v => v !== ''));

        if (norm.length === 0) {
          setMasivoError('No se encontraron filas con datos después de los encabezados.');
          return;
        }

        // ── Mapear columnas ──────────────────────────────────────────────────
        // Número de identificación
        const docColKey = Object.keys(norm[0]).find(k =>
          k.includes('número') || k.includes('numero') || k.includes('identificación') ||
          k.includes('identificacion') || k.includes('documento') || k.includes('cedula') ||
          k.includes('dni') || k.includes('nit') || k.includes('pasaporte')
        ) ?? null;

        // Nombre completo
        const nomColKey = Object.keys(norm[0]).find(k =>
          k.includes('nombre')
        ) ?? null;

        // Tipo de identificación
        const tipoColKey = Object.keys(norm[0]).find(k =>
          k.includes('tipo')
        ) ?? null;

        // ── Construir filas: normalizar + validar (vía inspektorMasivoService) ─
        const rows: MasivoRow[] = norm.map((r, idx): MasivoRow => {
          const numeroDni = normalizeDni(docColKey ? r[docColKey] : '');
          const nombre    = normalizeName(nomColKey ? r[nomColKey] : '');
          const tipoRaw   = tipoColKey ? (r[tipoColKey] ?? '') : '';
          const mapped    = mapTipoDoc(tipoRaw);

          const base = { idx, documento: numeroDni, nombre, tipoDoc: mapped?.tipo ?? 1, tipoLabel: mapped?.label ?? '—' };
          // Validaciones → ERROR_VALIDACION (no se consultan, no abortan)
          if (!numeroDni && !nombre)
            return { ...base, status: 'error', resultado: 'ERROR_VALIDACION', validationError: 'Fila vacía (sin nombre ni número)' };
          if (!numeroDni)
            return { ...base, status: 'error', resultado: 'ERROR_VALIDACION', validationError: 'Falta número de identificación' };
          if (mapped === null)
            return { ...base, status: 'error', resultado: 'ERROR_VALIDACION', validationError: `Tipo de documento no reconocido: "${tipoRaw}"` };
          return { ...base, status: 'pending' };
        });

        const validas = rows.filter(r => !r.validationError);
        if (validas.length === 0) {
          setMasivoError('No se encontraron filas válidas (todas quedaron con ERROR_VALIDACION).');
          setMasivoRows(rows); setMasivoTotal(rows.length);
          return;
        }
        const invalidas = rows.length - validas.length;
        const unicas = dedupe(rows, r => r.documento).unique.length;
        setMasivoRows(rows);
        setMasivoTotal(rows.length);
        addLog('info', `📂 ${file.name} — ${rows.length} filas · ${unicas} únicas a consultar${invalidas > 0 ? ` · ${invalidas} con error de validación` : ''}`);
      } catch (e) {
        setMasivoError(`Error leyendo Excel: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  // ── Masivo: process loop (dedup + concurrencia + reintentos + reanudación) ─────
  async function procesarMasivo() {
    if (masivoRows.length === 0) return;
    setMasivoRunning(true); setMasivoIsPaused(false);
    abortRef.current = false; pausedRef.current = false;
    setLogs([]); setMasivoProgress(0);

    // Partimos del estado actual: las filas ERROR_VALIDACION se conservan.
    const results: MasivoRow[] = masivoRows.map(r =>
      r.validationError ? r : { ...r, status: 'pending' as const, result: undefined, classification: undefined, resultado: undefined, error: undefined });
    setMasivoRows([...results]);

    // Deduplicación por (tipo, número): una consulta por documento único.
    const { unique, groups } = dedupe(results, r => r.documento);
    addLog('info', `🔎 ${unique.length} documento(s) único(s) · ${results.length - unique.length - results.filter(r => r.validationError).length} duplicado(s) omitidos`);

    if (unique.length === 0) {
      const invalidas = results.filter(r => r.validationError).length;
      addLog('err', invalidas > 0
        ? `✗ No hay documentos válidos para consultar (${invalidas} con error de validación). Revisa que el Excel tenga columnas de nombre, tipo y número.`
        : '✗ No se detectaron documentos. Verifica el formato del Excel (encabezados de nombre, tipo y número).');
      setMasivoRunning(false); return;
    }

    // Token compartido, con refresco serializado (evita múltiples logins en paralelo).
    let token = '';
    let refreshing: Promise<string> | null = null;
    const refreshToken = () => (refreshing ??= inspektorLogin().finally(() => { refreshing = null; }));
    try {
      addLog('info', '🔑 Obteniendo token Inspektor…');
      token = await refreshToken();
      addLog('info', '✓ Token obtenido');
    } catch (e) {
      addLog('err', `✗ No se pudo autenticar con Inspektor: ${e instanceof Error ? e.message : String(e)}`);
      setMasivoRunning(false); return;
    }

    // Una consulta (con refresco de token en 401) para un documento.
    const queryOne = async (row: MasivoRow): Promise<InspektorResult> => {
      try {
        return await consultarConToken(token, row.nombre || row.documento, row.documento, row.tipoDoc);
      } catch (e) {
        if (e instanceof Error && e.message === 'TOKEN_EXPIRED') {
          token = await refreshToken();
          return await consultarConToken(token, row.nombre || row.documento, row.documento, row.tipoDoc);
        }
        throw e;
      }
    };

    // Aplica un resultado (o error) a TODAS las filas del grupo duplicado.
    const applyToGroup = (key: string, patch: Partial<MasivoRow>) => {
      const idxs = new Set(groups.get(key) ?? []);
      for (let j = 0; j < results.length; j++) if (idxs.has(results[j].idx)) results[j] = { ...results[j], ...patch };
      setMasivoRows([...results]);
    };

    let done = 0, alerts = 0, revisar = 0, errors = 0, cacheHits = 0;
    let cursor = 0;

    const worker = async () => {
      while (true) {
        if (abortRef.current) return;
        while (pausedRef.current && !abortRef.current) await new Promise(r => setTimeout(r, 300));
        if (abortRef.current) return;
        const i = cursor++;
        if (i >= unique.length) return;

        const row = unique[i];
        const key = dedupeKey(row.tipoDoc, row.documento);
        applyToGroup(key, { status: 'processing' });
        const label = maskPii(row.documento);
        const at = Date.now();

        try {
          // Reanudación: si ya está en caché, no volvemos a consultar (protege el cupo).
          let r = reanudar ? (await cacheGet(row.tipoDoc, row.documento)) as InspektorResult | undefined : undefined;
          if (r) { cacheHits++; }
          else {
            r = await retry(() => queryOne(row), { retries: 3, baseMs: 700, onRetry: (a) => addLog('info', `  ↳ reintento ${a}/3 · ${label}`) });
            await cachePut(row.tipoDoc, row.documento, r, at);
            if (delay > 0) await new Promise(res => setTimeout(res, delay * 1000));
          }

          const cls = classify(r);
          const legalPolicy = gateFromResult(r, row.documento);
          if (cls.resultado === 'ALERTA') alerts++; else if (cls.resultado === 'REVISAR') revisar++;
          applyToGroup(key, { status: 'done', result: r, classification: cls, legalPolicy, resultado: cls.resultado });
          addLog(cls.resultado === 'ALERTA' ? 'err' : 'ok',
            `${cls.resultado === 'ALERTA' ? '⚠' : '✓'} ${label} — ${cls.resultado} · ${cls.totalCoincidencias} coincidencia(s)${cls.prioridadMaxima ? ` · P${cls.prioridadMaxima}` : ''}${r === undefined ? '' : ''}`);
        } catch (e) {
          errors++;
          applyToGroup(key, { status: 'error', resultado: 'ERROR_CONSULTA', error: e instanceof Error ? e.message : String(e) });
          addLog('err', `✗ ${label} — ERROR_CONSULTA: ${results.find(x => x.documento === row.documento)?.error ?? ''}`);
        }
        done++;
        setMasivoProgress(done);
      }
    };

    const pool = Math.max(1, Math.min(concurrency, 8));
    await Promise.all(Array.from({ length: pool }, () => worker()));

    if (abortRef.current) addLog('info', '⛔ Proceso cancelado');
    addLog('info', `✅ ${done}/${unique.length} consultados${cacheHits ? ` (${cacheHits} desde caché)` : ''} — ${alerts} alertas, ${revisar} a revisar, ${errors} errores`);
    setMasivoRunning(false); setMasivoIsPaused(false);
  }

  // ── Masivo: export Excel (extracción completa, 5 hojas) ───────────────────────
  function exportarExcelMasivo() {
    if (masivoRows.length === 0) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fecha = now.toLocaleString('es-CL');
    const S = (v: unknown) => (v === null || v === undefined) ? '' : String(v);
    const join = (arr: unknown[]) => arr.filter(x => x != null && String(x).trim() !== '').join(' / ');

    const idOf = (r: MasivoRow) => ({ nombre_completo: r.nombre, tipo_dni: r.tipoLabel, numero_dni: r.documento });

    // Hoja "Resumen": una fila por registro de entrada, en orden original.
    const summary: Record<string, unknown>[] = [...masivoRows].sort((a, b) => a.idx - b.idx).map(r => {
      const cls = r.classification;
      const res = r.result;
      const resultado = r.resultado
        ?? (r.status === 'done' ? (cls?.resultado ?? 'SIN_HALLAZGOS')
          : r.status === 'error' ? 'ERROR_CONSULTA' : 'NO_CONSULTADO');
      const lp = r.legalPolicy;
      return {
        ...idOf(r),
        resultado,
        politica_legal: lp?.result ? LP_META[lp.result].short : '',
        politica_legal_regla: lp?.ruleId ?? '',
        politica_legal_detalle: lp ? `crítica:${lp.counts.REVIEW_CRITICAL} warning:${lp.counts.REVIEW_WARNING} release:${lp.counts.RELEASE} manual:${lp.counts.MANUAL_REVIEW}` : '',
        total_coincidencias: cls ? cls.totalCoincidencias : '',
        prioridad_maxima: cls?.prioridadMaxima ?? '',
        listas: cls ? cls.listas.join('; ') : '',
        total_procuraduria: res ? getProcuraduriaRecords(res.procuraduria).length : '',
        total_rama_judicial: res ? getRamaJudicialProcesos(res.ramaJudicial).length : '',
        total_jepms: res ? getJEPMSItems(res.ramaJudicialJEPMS).length : '',
        n_consulta: S(res?.numConsulta),
        fecha_consulta: r.status === 'done' ? fecha : '',
        observaciones: r.validationError ?? r.error ?? '',
      };
    });

    // Hoja "Detalle_Listas": una fila por coincidencia (listas + listas_propias).
    const detalleListas: Record<string, unknown>[] = [];
    for (const r of masivoRows) {
      const push = (item: InspektorListaItem, origen: string) => detalleListas.push({
        ...idOf(r), origen,
        coincidencia_nombre: S(item.nombreCompleto),
        coincidencia_identificacion: S(item.documentoIdentidad),
        prioridad: S(item.Prioridad ?? item.prioridad),
        grupo_lista: getGrupoLista(item),
        nombre_lista: S(item.nombreTipoLista ?? item.tipoLista ?? item.nombreCategoria ?? item.categoria),
        delito: S(item.delito),
        pep: S(item.peps),
        zona: S(item.zona),
        fuente: S(item.fuenteConsulta),
        fecha_actualizacion: S(item.fechaActualizacion),
        raw_json: JSON.stringify(item),
      });
      (r.result?.listas ?? []).forEach(it => push(it, 'lista'));
      (r.result?.listas_propias ?? []).forEach(it => push(it, 'lista_propia'));
    }

    // Hoja "Procuraduria": una fila por registro, con sub-arrays serializados completos.
    const procuraduria: Record<string, unknown>[] = [];
    for (const r of masivoRows) {
      for (const rec of getProcuraduriaRecords(r.result?.procuraduria)) {
        procuraduria.push({
          ...idOf(r),
          registro_nombre: S(rec.name),
          registro_identificacion: S(rec.identification),
          num_siri: S(rec.num_siri),
          sanciones: (rec.sanciones ?? []).map(s => join([s.sancion, s.clase, s.termino])).join(' | '),
          delitos: (rec.delitos ?? []).map(d => S(d.descripcion)).join(' | '),
          instancias: (rec.instancias ?? []).map(i => join([i.nombre, i.autoridad, i.fecha_provincia, i.fecha_efecto_juridicos])).join(' | '),
          inhabilidades: (rec.inhabilidades ?? []).map(i => join([i.modulo, i.inhabilidad_legal, i.fecha_inicio, i.fecha_fin])).join(' | '),
          raw_json: JSON.stringify(rec),
        });
      }
    }

    // Hoja "Rama_Judicial": una fila por proceso.
    const ramaJudicial: Record<string, unknown>[] = [];
    for (const r of masivoRows) {
      for (const p of getRamaJudicialProcesos(r.result?.ramaJudicial)) {
        ramaJudicial.push({
          ...idOf(r),
          id_proceso: S(p.idProceso), llave_proceso: S(p.llaveProceso),
          despacho: S(p.despacho), departamento: S(p.departamento),
          fecha_proceso: S(p.fechaProceso), fecha_ultima_actuacion: S(p.fechaUltimaActuacion),
          es_privado: S(p.esPrivado), sujetos_procesales: S(p.sujetosProcesales),
          raw_json: JSON.stringify(p),
        });
      }
    }

    // Hoja "JEPMS": una fila por resultado.
    const jepms: Record<string, unknown>[] = [];
    for (const r of masivoRows) {
      for (const j of getJEPMSItems(r.result?.ramaJudicialJEPMS)) {
        jepms.push({
          ...idOf(r),
          ciudad: S(j.cityName), nombre_resultado: S(j.nameResult),
          identificacion_resultado: S(j.identificationNumberResult),
          exito: S(j.isSuccess), fecha_consulta: S(j.queryDate), link: S(j.link),
          raw_json: JSON.stringify(j),
        });
      }
    }

    const wb = buildMasivoWorkbook([
      { name: 'Resumen', rows: summary },
      { name: 'Detalle_Listas', rows: detalleListas },
      { name: 'Procuraduria', rows: procuraduria },
      { name: 'Rama_Judicial', rows: ramaJudicial },
      { name: 'JEPMS', rows: jepms },
    ]);
    XLSX.writeFile(wb, `inspektor_masivo_${ts}.xlsx`);
  }

  // ── Masivo: reiniciar (empezar de cero) ──────────────────────────────────────
  async function reiniciarMasivo() {
    if (!confirm('¿Reiniciar y empezar de cero?\n\nSe borrará el archivo cargado, los resultados y la caché de consultas (las próximas consultas se volverán a pedir a Inspektor).')) return;
    abortRef.current = true; pausedRef.current = false;
    setMasivoRunning(false); setMasivoIsPaused(false);
    setMasivoFile(null); setMasivoRows([]); setLogs([]);
    setMasivoProgress(0); setMasivoTotal(0); setMasivoError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    await cacheClear();
    addLog('info', '🔄 Proceso reiniciado — caché limpiada, listo para empezar de cero.');
  }

  // ── Derived result data (individual) ────────────────────────────────────────
  const cant = result?.cantCoincidencias ?? 0;
  const riesgo = getRiesgo(cant);
  const listasAll = result?.listas ?? [];
  const grupoObjetivo = listasAll.filter(esGrupoObjetivo);
  const otrasListas = listasAll.filter(i => !esGrupoObjetivo(i));
  const listasPropias = result?.listas_propias ?? [];
  const procRecords = getProcuraduriaRecords(result?.procuraduria);
  const rjProcesos = getRamaJudicialProcesos(result?.ramaJudicial);
  const jepmsItems = getJEPMSItems(result?.ramaJudicialJEPMS);

  return (
    <div className={`min-h-screen ${bg} ${textMain} transition-colors`}>
      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur border-b px-6 py-3 flex items-center gap-3 flex-wrap ${
        dark ? 'bg-slate-900/90 border-slate-700/50' : 'bg-white/95 border-violet-200/70 shadow-sm'
      }`}>
        <button
          onClick={onBack}
          className={`flex items-center gap-2 text-xs font-semibold transition-colors ${textMuted} hover:text-indigo-400`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Países
        </button>
        <div className={`h-4 w-px ${dark ? 'bg-slate-700' : 'bg-violet-200'}`} />
        <span className="text-sm font-black">🇨🇴 Colombianos</span>
        <span className={`text-xs font-medium ${textMuted}`}>Inspektor · DataLAFT</span>

        <div className={`flex gap-1 rounded-xl p-1 ml-2 ${dark ? 'bg-slate-800/60' : 'bg-violet-100/70'}`}>
          {([['individual', '🔍 Individual'], ['masivo', '📊 Masivo']] as [TabMode, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                tab === t ? 'bg-indigo-600 text-white' : dark ? `${textMuted} hover:text-indigo-400` : 'text-violet-700 hover:text-violet-900'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto" />
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── TAB: MASIVO ────────────────────────────────────────────────────── */}
        {tab === 'masivo' && (
          <div className="space-y-6">
            <div>
              <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>Consulta Masiva · Inspektor</h2>
              <p className={`text-sm mt-1 ${textMuted}`}>
                Usa la <strong>plantilla estándar</strong> (columnas: Tipo de identificación · Número de identificación · Nombre completo)
                o cualquier Excel con esas columnas. Puedes dejar el número en blanco si solo tienes el nombre.
              </p>
            </div>

            {/* Drop zone */}
            <div className={`border rounded-2xl p-6 space-y-5 ${cardBg}`}>
              <div
                onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={e => { e.preventDefault(); setIsDrag(false); const f = e.dataTransfer.files[0]; if (f) handleMasivoFile(f); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDrag ? 'border-indigo-500 bg-indigo-500/10' :
                  masivoFile ? (dark ? 'border-emerald-600/50 bg-emerald-950/20' : 'border-emerald-400 bg-emerald-50') :
                  dark ? 'border-slate-600 hover:border-indigo-500 hover:bg-indigo-500/5' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >
                <div className="text-4xl mb-3">{masivoFile ? '📊' : '📂'}</div>
                <p className={`text-base font-semibold mb-1 ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {masivoFile ? masivoFile.name : 'Arrastra tu Excel aquí o haz clic para seleccionar'}
                </p>
                <p className={`text-xs ${textMuted}`}>
                  Formato <code className="font-mono text-indigo-400">.xlsx</code> · Plantilla estándar o Excel con columnas de identificación y nombre
                </p>
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
                  onChange={e => e.target.files?.[0] && handleMasivoFile(e.target.files[0])} />
              </div>

              {/* Config: delay, concurrencia, reanudar */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap ${dark ? 'text-slate-400' : 'text-violet-600'}`}>Delay (seg)</label>
                  <input type="number" value={delay} step={0.5} min={0} disabled={masivoRunning}
                    onChange={e => setDelay(parseFloat(e.target.value) || 0)}
                    className={`w-20 border rounded-lg px-3 py-1.5 text-sm focus:outline-none disabled:opacity-50 ${inputCls}`} />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap ${dark ? 'text-slate-400' : 'text-violet-600'}`}>Concurrencia</label>
                  <input type="number" value={concurrency} step={1} min={1} max={8} disabled={masivoRunning}
                    onChange={e => setConcurrency(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                    className={`w-16 border rounded-lg px-3 py-1.5 text-sm focus:outline-none disabled:opacity-50 ${inputCls}`} />
                </div>
                <label className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer ${dark ? 'text-slate-400' : 'text-violet-600'}`}>
                  <input type="checkbox" checked={reanudar} disabled={masivoRunning}
                    onChange={e => setReanudar(e.target.checked)} className="rounded" />
                  Reanudar (usar caché)
                </label>
                {masivoRows.length > 0 && (
                  <span className={`text-xs ${textMuted}`}>{masivoRows.length} registros cargados</span>
                )}
              </div>

              {/* Controls */}
              <div className="flex gap-3 flex-wrap">
                <button onClick={procesarMasivo}
                  disabled={masivoRows.length === 0 || masivoRunning}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all">
                  {masivoRunning
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando…</>
                    : '⚡ Procesar'}
                </button>

                {masivoRunning && !masivoIsPaused && (
                  <button onClick={() => { setMasivoIsPaused(true); pausedRef.current = true; }}
                    className={`font-bold px-5 py-2.5 rounded-xl text-sm border transition-all ${dark ? 'border-amber-600/50 text-amber-400 hover:bg-amber-950/40' : 'border-amber-500 text-amber-700 hover:bg-amber-50'}`}>
                    ⏸ Pausar
                  </button>
                )}
                {masivoRunning && masivoIsPaused && (
                  <button onClick={() => { setMasivoIsPaused(false); pausedRef.current = false; }}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                    ▶ Reanudar
                  </button>
                )}
                {masivoRunning && (
                  <button onClick={() => { abortRef.current = true; }}
                    className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                    ⛔ Cancelar
                  </button>
                )}
                {masivoRows.length > 0 && !masivoRunning && (
                  <button onClick={exportarExcelMasivo}
                    className={`flex items-center gap-2 border font-bold px-5 py-2.5 rounded-xl text-sm transition-all ${dark ? 'border-emerald-600/50 text-emerald-400 hover:bg-emerald-950/40' : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'}`}>
                    📥 Exportar Excel
                  </button>
                )}
                {(masivoRows.length > 0 || masivoFile) && !masivoRunning && (
                  <button onClick={reiniciarMasivo}
                    className={`flex items-center gap-2 border font-bold px-5 py-2.5 rounded-xl text-sm transition-all ${dark ? 'border-slate-600/50 text-slate-300 hover:bg-slate-800/60' : 'border-slate-400 text-slate-600 hover:bg-slate-100'}`}>
                    🔄 Reiniciar
                  </button>
                )}
              </div>
            </div>

            {masivoError && (
              <div className={`border rounded-xl px-5 py-4 text-sm ${dark ? 'bg-red-950/40 border-red-800/50 text-red-300' : 'bg-red-50 border-red-300 text-red-700'}`}>
                <strong>Error:</strong> {masivoError}
              </div>
            )}

            {/* Progress + log */}
            {(masivoRunning || logs.length > 0) && (
              <div className={`border rounded-2xl p-6 space-y-4 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-widest ${textMuted}`}>Progreso</span>
                  <span className={`text-sm font-bold ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {masivoProgress} / {masivoTotal}
                    {masivoIsPaused && <span className="ml-2 text-amber-400">⏸ En pausa</span>}
                  </span>
                </div>
                <div className={`w-full h-2 rounded-full ${dark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <div className="h-2 rounded-full bg-indigo-600 transition-all"
                    style={{ width: masivoTotal > 0 ? `${(masivoProgress / masivoTotal) * 100}%` : '0%' }} />
                </div>
                <div ref={logRef}
                  className={`h-48 overflow-y-auto rounded-xl p-3 font-mono text-xs space-y-0.5 ${dark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
                  {logs.map((l, i) => (
                    <p key={i} className={
                      l.type === 'ok'   ? 'text-emerald-400' :
                      l.type === 'err'  ? 'text-red-400' :
                      dark ? 'text-slate-500' : 'text-slate-400'
                    }>{l.text}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Results summary table */}
            {masivoRows.some(r => r.status === 'done' || r.status === 'error') && (
              <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
                <div className={`px-6 py-4 border-b flex items-center justify-between ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                  <h3 className={`text-base font-black ${dark ? 'text-white' : 'text-slate-800'}`}>Resultados</h3>
                  <div className="flex gap-4 text-xs">
                    {[
                      ['✓', masivoRows.filter(r => r.resultado === 'SIN_HALLAZGOS').length, 'text-emerald-400'],
                      ['🔍', masivoRows.filter(r => r.resultado === 'REVISAR').length, 'text-amber-400'],
                      ['⚠', masivoRows.filter(r => r.resultado === 'ALERTA').length, 'text-red-400'],
                      ['✗', masivoRows.filter(r => r.status === 'error' && r.resultado !== 'ALERTA').length, 'text-slate-500'],
                    ].map(([icon, count, cls]) => (
                      <span key={String(icon)} className={`font-bold ${cls}`}>{icon} {String(count)}</span>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-slate-200/40 dark:divide-slate-700/30 max-h-96 overflow-y-auto">
                  {masivoRows.filter(r => r.status !== 'pending').map(r => {
                    const hasAlert = r.resultado === 'ALERTA';
                    const statusIcon = r.status === 'processing' ? '⏳' : r.status === 'error' ? (r.validationError ? '⚠' : '✗') : hasAlert ? '⚠' : r.resultado === 'REVISAR' ? '🔍' : '✓';
                    return (
                      <div key={r.idx} className={`px-6 py-3 flex items-center gap-4 text-sm ${
                        hasAlert ? (dark ? 'bg-red-950/20' : 'bg-red-50/50') : ''
                      }`}>
                        <span className={r.status === 'error' ? 'text-slate-400' : hasAlert ? 'text-red-400' : 'text-emerald-400'}>
                          {statusIcon}
                        </span>
                        <code className={`font-mono text-xs flex-shrink-0 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{r.documento}</code>
                        <span className={`flex-1 text-xs truncate ${textMuted}`}>{r.nombre || '—'}</span>
                        {r.status === 'done' && r.classification && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            r.resultado === 'ALERTA' ? (dark ? 'text-red-400 bg-red-900/30' : 'text-red-700 bg-red-100')
                            : r.resultado === 'REVISAR' ? (dark ? 'text-amber-400 bg-amber-900/30' : 'text-amber-700 bg-amber-100')
                            : (dark ? 'text-emerald-400 bg-emerald-900/30' : 'text-emerald-700 bg-emerald-100')
                          }`}>
                            {r.resultado} · {r.classification.totalCoincidencias} coincidencia{r.classification.totalCoincidencias !== 1 ? 's' : ''}
                            {r.classification.prioridadMaxima ? ` · P${r.classification.prioridadMaxima}` : ''}
                          </span>
                        )}
                        {r.status === 'done' && r.legalPolicy?.result && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                            title={`Política legal: ${r.legalPolicy.ruleId}`}
                            style={{ color: LP_META[r.legalPolicy.result].hex, backgroundColor: `${LP_META[r.legalPolicy.result].hex}22` }}>
                            {LP_META[r.legalPolicy.result].emoji} {LP_META[r.legalPolicy.result].short}
                          </span>
                        )}
                        {r.status === 'error' && (
                          <span className={`text-xs ${r.validationError ? (dark ? 'text-amber-400' : 'text-amber-600') : (dark ? 'text-red-400' : 'text-red-600')} truncate max-w-[240px]`}>
                            {r.resultado ?? 'ERROR'} · {r.validationError ?? r.error}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: INDIVIDUAL ────────────────────────────────────────────────── */}
        {tab === 'individual' && <>

        {/* Search form */}
        <div className={`border rounded-2xl p-6 ${cardBg}`}>
          <h2 className={`text-xl font-black mb-1 ${dark ? 'text-white' : 'text-slate-800'}`}>
            Consulta Individual · Colombia
          </h2>
          <p className={`text-sm mb-6 ${textMuted}`}>
            Búsqueda contra Procuraduría, Rama Judicial, JEPMS y listas AML/KYC de Colombia.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>
                Nombre completo *
              </label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="Ej: Jorge Enrique Lopez Benavides"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}
              />
            </div>

            {/* Documento */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>
                Número de documento *
              </label>
              <input
                value={documento}
                onChange={e => setDocumento(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="Ej: 79788626"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}
              />
            </div>
          </div>

          {/* Tipo documento */}
          <div className="mb-5 space-y-1.5 max-w-xs">
            <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>
              Tipo de documento
            </label>
            <select
              value={tipoDoc}
              onChange={e => setTipoDoc(Number(e.target.value))}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}
            >
              <option value={1}>1 — Cédula de Ciudadanía</option>
              <option value={2}>2 — Cédula de Extranjería</option>
              <option value={3}>3 — NIT</option>
              <option value={4}>4 — Pasaporte</option>
              <option value={5}>5 — Tarjeta de Identidad</option>
            </select>
          </div>

          <button
            onClick={buscar}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Consultando Inspektor…</>
              : '🔍 Consultar'
            }
          </button>

          {error && (
            <div className={`mt-4 border rounded-xl px-5 py-4 text-sm ${
              dark ? 'bg-red-950/40 border-red-800/50 text-red-300' : 'bg-red-50 border-red-300 text-red-700'
            }`}>
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div ref={resultRef} className="space-y-5">

            {/* Header card */}
            <div className={`border rounded-2xl p-6 ${cardBg}`}>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h3 className={`text-xl font-black ${dark ? 'text-white' : 'text-slate-900'}`}>
                  {nombre}
                </h3>
                <RiskBadge riesgo={riesgo} />
                <code className={`ml-auto text-xs font-mono px-3 py-1.5 rounded-lg border ${
                  dark ? 'text-slate-400 bg-slate-900/60 border-slate-700' : 'text-slate-500 bg-slate-100 border-slate-200'
                }`}>
                  {documento}
                </code>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  ['N° Consulta', clean(result.numConsulta)],
                  ['Coincidencias totales', String(cant)],
                  ['Grupo Objetivo', String(grupoObjetivo.length)],
                  ['Otras listas', String(otrasListas.length)],
                ].map(([label, value]) => (
                  <div key={label} className={`border rounded-xl px-3 py-2.5 ${dark ? 'border-slate-700/40 bg-slate-900/40' : 'border-violet-200/60 bg-violet-50/60'}`}>
                    <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${dark ? 'text-slate-500' : 'text-violet-500'}`}>{label}</div>
                    <div className={`text-base font-bold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>{value}</div>
                  </div>
                ))}
              </div>

              {cant === 0 ? (
                <div className={`mt-4 border rounded-xl px-4 py-3 text-sm font-medium ${
                  dark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                }`}>
                  ✓ <strong>Sin coincidencias</strong> — perfil limpio en todas las fuentes consultadas
                </div>
              ) : (
                <div className={`mt-4 border rounded-xl px-4 py-3 text-sm font-medium ${
                  dark ? 'bg-red-950/40 border-red-800/50 text-red-300' : 'bg-red-50 border-red-300 text-red-700'
                }`}>
                  ⚠ <strong>{cant} coincidencia{cant !== 1 ? 's' : ''} detectada{cant !== 1 ? 's' : ''}</strong> — revisa el detalle de cada sección
                </div>
              )}

              {/* Capa 0 — Legal Policy Gate (informativo) */}
              {indGate?.result && (
                <div className={`mt-4 border rounded-xl px-4 py-3 ${dark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Política legal (Capa 0)</span>
                    <span className="text-xs font-black px-2 py-0.5 rounded-lg" style={{ color: LP_META[indGate.result].hex, backgroundColor: `${LP_META[indGate.result].hex}22` }}>
                      {LP_META[indGate.result].emoji} {LP_META[indGate.result].label}
                    </span>
                    <span className={`text-[10px] font-mono ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{indGate.ruleId}</span>
                  </div>
                  <div className="space-y-0.5">
                    {indGate.hits.filter(h => h.result !== 'RELEASE').slice(0, 12).map((h, i) => (
                      <div key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: LP_META[h.result].hex }}>
                        <span>{LP_META[h.result].emoji}</span>
                        <span><span className="font-bold">{LP_META[h.result].short}</span><span className={dark ? 'text-slate-400' : 'text-slate-500'}> · {h.prioridad ? `P${h.prioridad} · ` : ''}{h.grupo || '—'}{h.nombre ? ` · ${h.nombre}` : ''}</span></span>
                      </div>
                    ))}
                    <p className={`text-[10px] mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Crítica {indGate.counts.REVIEW_CRITICAL} · Warning {indGate.counts.REVIEW_WARNING} · Release {indGate.counts.RELEASE} · Manual {indGate.counts.MANUAL_REVIEW}. Informativo, no bloquea.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Listas — Grupo Objetivo */}
            {listasAll.length > 0 && (
              <Section title={`Grupo Objetivo — ${grupoObjetivo.length} coincidencia${grupoObjetivo.length !== 1 ? 's' : ''}`} dark={dark}>
                <div className={`rounded-xl border px-4 py-2 mb-3 text-[10px] font-medium ${
                  dark ? 'border-slate-700/40 bg-slate-900/40 text-slate-400' : 'border-violet-200 bg-violet-50/60 text-violet-600'
                }`}>
                  {GRUPO_OBJETIVO}
                </div>
                {grupoObjetivo.length === 0 ? (
                  <div className={`rounded-xl border px-4 py-3 text-sm ${
                    dark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                    ✓ Sin coincidencias en el grupo objetivo
                  </div>
                ) : (
                  <div className="space-y-2">
                    {grupoObjetivo.map((item, i) => <ListaCard key={i} item={item} idx={i} dark={dark} />)}
                  </div>
                )}
              </Section>
            )}

            {/* Listas — Otras */}
            {otrasListas.length > 0 && (
              <Section title={`Otras coincidencias en listas — ${otrasListas.length}`} dark={dark}>
                <div className="space-y-2">
                  {otrasListas.map((item, i) => <ListaCard key={i} item={item} idx={i} dark={dark} />)}
                </div>
              </Section>
            )}

            {/* Listas propias */}
            <Section title={`Listas propias — ${listasPropias.length}`} dark={dark}>
              {listasPropias.length === 0 ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${
                  dark ? 'border-slate-700/40 text-slate-500' : 'border-violet-200 text-slate-400'
                }`}>
                  Sin coincidencias en listas propias
                </div>
              ) : (
                <div className="space-y-2">
                  {listasPropias.map((item, i) => <ListaCard key={i} item={item} idx={i} dark={dark} />)}
                </div>
              )}
            </Section>

            {/* Procuraduría */}
            <Section title={`Procuraduría — ${procRecords.length} registro${procRecords.length !== 1 ? 's' : ''}`} dark={dark}>
              {procRecords.length === 0 ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${
                  dark ? 'border-slate-700/40 text-slate-500' : 'border-violet-200 text-slate-400'
                }`}>
                  Sin registros en Procuraduría
                </div>
              ) : (
                <div className="space-y-2">
                  {procRecords.map((rec, i) => <ProcRecord key={i} rec={rec} idx={i} dark={dark} />)}
                </div>
              )}
            </Section>

            {/* Rama Judicial */}
            <Section title={`Rama Judicial — ${rjProcesos.length} proceso${rjProcesos.length !== 1 ? 's' : ''}`} dark={dark}>
              {rjProcesos.length === 0 ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${
                  dark ? 'border-slate-700/40 text-slate-500' : 'border-violet-200 text-slate-400'
                }`}>
                  Sin procesos en Rama Judicial
                </div>
              ) : (
                <div className="space-y-2">
                  {rjProcesos.slice(0, 15).map((p, i) => (
                    <div key={i} className={`border rounded-xl px-4 py-3 text-xs ${
                      dark ? 'border-slate-700/40 bg-slate-900/40' : 'border-violet-200/60 bg-violet-50/40'
                    }`}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                        {[
                          ['ID Proceso', clean(p.idProceso)],
                          ['Llave proceso', clean(p.llaveProceso)],
                          ['Despacho', clean(p.despacho)],
                          ['Departamento', clean(p.departamento)],
                          ['Fecha proceso', clean(p.fechaProceso)],
                          ['Última actuación', clean(p.fechaUltimaActuacion)],
                          ['Privado', clean(p.esPrivado)],
                          ['Sujetos procesales', clean(p.sujetosProcesales)],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <span className={`${dark ? 'text-slate-500' : 'text-violet-500'} mr-1`}>{label}:</span>
                            <span className={`font-medium ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {rjProcesos.length > 15 && (
                    <p className={`text-xs text-center py-2 ${textMuted}`}>
                      … y {rjProcesos.length - 15} procesos más
                    </p>
                  )}
                </div>
              )}
            </Section>

            {/* JEPMS */}
            <Section title={`JEPMS — ${jepmsItems.length} resultado${jepmsItems.length !== 1 ? 's' : ''}`} dark={dark}>
              {jepmsItems.length === 0 ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${
                  dark ? 'border-slate-700/40 text-slate-500' : 'border-violet-200 text-slate-400'
                }`}>
                  Sin resultados en JEPMS
                </div>
              ) : (
                <div className="space-y-2">
                  {jepmsItems.map((item, i) => (
                    <div key={i} className={`border rounded-xl px-4 py-3 text-xs ${
                      dark ? 'border-slate-700/40 bg-slate-900/40' : 'border-violet-200/60 bg-violet-50/40'
                    }`}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                        {[
                          ['Ciudad', clean(item.cityName)],
                          ['Nombre resultado', clean(item.nameResult)],
                          ['Documento resultado', clean(item.identificationNumberResult)],
                          ['Exitoso', clean(item.isSuccess)],
                          ['Fecha consulta', clean(item.queryDate)],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <span className={`${dark ? 'text-slate-500' : 'text-violet-500'} mr-1`}>{label}:</span>
                            <span className={`font-medium ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{value}</span>
                          </div>
                        ))}
                        {item.link && item.link !== '—' && (
                          <div>
                            <span className={`${dark ? 'text-slate-500' : 'text-violet-500'} mr-1`}>Link:</span>
                            <a href={item.link} target="_blank" rel="noreferrer" className="text-indigo-400 underline break-all">
                              {item.link}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

          </div>
        )}
        </> /* end tab individual */}
      </div>
    </div>
  );
};
