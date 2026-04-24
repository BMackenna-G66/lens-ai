import React, { useState, useRef } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const INSPEKTOR_BASE = 'https://inspektor.datalaft.com:2121/api';
const INSPEKTOR_USER = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_USER ?? 'WS_Global81';
const INSPEKTOR_PASS = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_INSPEKTOR_PASS ?? 'Risk5397#0ft';
const GRUPO_OBJETIVO = 'LISTAS ASOCIADAS A LA/FT/FPADM, CORRUPCIÓN U OTROS DELITOS (PENAL) Y EXTINCIÓN DE DOMINIO';

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

// ─── API ──────────────────────────────────────────────────────────────────────
async function inspektorLogin(): Promise<string> {
  const resp = await fetch(`${INSPEKTOR_BASE}/Auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: INSPEKTOR_USER, password: INSPEKTOR_PASS }),
  });
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
  const resp = await fetch(`${INSPEKTOR_BASE}/ConsultaPrincipal`, {
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
  });
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

export const InspektorColombia: React.FC<InspektorColombiaProps> = ({ onBack, dark }) => {
  const [nombre, setNombre]       = useState('');
  const [documento, setDocumento] = useState('');
  const [tipoDoc, setTipoDoc]     = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState<InspektorResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await consultarInspektor(nombre.trim(), documento.trim(), tipoDoc);
      setResult(r);
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

  // Derived result data
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
        <div className="ml-auto" />
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

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
      </div>
    </div>
  );
};
