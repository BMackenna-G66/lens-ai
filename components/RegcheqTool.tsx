import React, { useState, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListaEntry {
  coincidence: boolean;
  risk: string;
  data: unknown;
}

interface PerfilResult {
  dni: string;
  nombre: string;
  razon_social: string;
  riesgo_final: string;
  pep_level: string;
  listas: Record<string, ListaEntry>;
  ficha: Record<string, string>;
}

interface ListaInteres {
  dni: string;
  name: string;
  personType: string;
  reason: string;
  status: string;
}

type Tab = 'individual' | 'lista';
type PersonType = 'natural' | 'legal';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE  = 'https://external-api.regcheq.com';
const API_KEY   = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function riskColor(risk: string): string {
  const r = risk.toLowerCase();
  if (r === 'high')   return 'text-red-400';
  if (r === 'medium') return 'text-amber-400';
  if (r === 'low')    return 'text-emerald-400';
  return 'text-slate-400';
}

function riskBadge(risk: string): React.ReactNode {
  const r = (risk || '').toLowerCase();
  const map: Record<string, string> = {
    high:   'bg-red-500/20 text-red-400 border border-red-500/40',
    medium: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    low:    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
  };
  const cls = map[r] ?? 'bg-slate-700 text-slate-400 border border-slate-600';
  const label = { high: '⚠ ALTO', medium: '⚡ MEDIO', low: '✓ BAJO' }[r] ?? (risk || 'N/D');
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function formatDataValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.map(formatDataValue).join(' · ');
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val != null)
      .map(([k, val]) => `${k}: ${val}`)
      .join(' | ');
  }
  return String(v);
}

// ─── Detail Renderer ─────────────────────────────────────────────────────────

function DetailTable({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-xs text-slate-500 italic">Sin detalle adicional disponible</p>;
  }

  let items: Record<string, unknown>[] = [];

  if (Array.isArray(data)) {
    items = data.map(d => (typeof d === 'object' && d !== null ? d as Record<string, unknown> : { valor: d }));
  } else if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Causas penales pattern
    if (Array.isArray(obj.additionalData) && (obj.additionalData[0] as Record<string, unknown>)?.crimen) {
      items = obj.additionalData as Record<string, unknown>[];
    } else {
      items = [obj];
    }
  } else {
    return <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap">{String(data)}</pre>;
  }

  if (items.length === 0) {
    return <p className="text-xs text-slate-500 italic">Sin registros</p>;
  }

  const cols = Array.from(new Set(items.flatMap(r => Object.keys(r))));

  return (
    <div className="overflow-x-auto rounded-lg border border-red-900/30 mt-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-red-950/40">
            {cols.map(c => (
              <th key={c} className="px-3 py-2 text-left font-bold uppercase tracking-wider text-red-400/80 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40">
              {cols.map(c => (
                <td key={c} className="px-3 py-2 text-slate-300 align-top">
                  {formatDataValue(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Lista Row ────────────────────────────────────────────────────────────────

function ListaRow({ name, entry }: { name: string; entry: ListaEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${entry.coincidence ? 'border-red-800/50 bg-red-950/20' : 'border-slate-700/40 bg-slate-800/30'}`}>
      <button
        onClick={() => entry.coincidence && setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${entry.coincidence ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${entry.coincidence ? (entry.risk.toLowerCase() === 'medium' ? 'bg-amber-400 shadow-amber-400/50' : 'bg-red-400 shadow-red-400/50') + ' shadow-lg' : 'bg-emerald-400 shadow-emerald-400/50 shadow-lg'}`} />
        <span className="flex-1 text-sm font-medium text-slate-200">{name}</span>
        {entry.coincidence
          ? <span className={`text-xs font-black uppercase ${riskColor(entry.risk)}`}>{entry.risk.toUpperCase()}</span>
          : <span className="text-xs text-slate-500">Sin coincidencia</span>}
        {entry.coincidence && (
          <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && entry.coincidence && (
        <div className="px-4 pb-4">
          <DetailTable data={entry.data} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RegcheqToolProps {
  onBack: () => void;
}

export const RegcheqTool: React.FC<RegcheqToolProps> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>('individual');

  // Individual form
  const [tipo, setTipo]           = useState<PersonType>('natural');
  const [dni, setDni]             = useState('');
  const [nombre, setNombre]       = useState('');
  const [apellido, setApellido]   = useState('');
  const [apellido2, setApellido2] = useState('');
  const [crearFicha, setCrearFicha] = useState(false);

  // Results
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState<PerfilResult | null>(null);

  // Lista de interés
  const [listaItems, setListaItems]       = useState<ListaInteres[]>([]);
  const [listaLoading, setListaLoading]   = useState(false);
  const [listaError, setListaError]       = useState('');
  const [addDni, setAddDni]               = useState('');
  const [addNombre, setAddNombre]         = useState('');
  const [addTipo, setAddTipo]             = useState<PersonType>('natural');
  const [addRazon, setAddRazon]           = useState('');
  const [addLoading, setAddLoading]       = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  // ─── API calls ──────────────────────────────────────────────────────────────

  async function fetchPerfil() {
    if (!dni.trim()) { setError('Ingresa un RUT o DNI.'); return; }
    if (!API_KEY) { setError('Falta la variable de entorno VITE_REGCHEQ_API_KEY.'); return; }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // 1. Create/update ficha if requested
      if (crearFicha) {
        const fichaBody: Record<string, string> = { dni: dni.trim(), personType: tipo };
        if (tipo === 'natural') {
          if (nombre)    fichaBody.name        = nombre.toUpperCase();
          if (apellido)  fichaBody.fatherName  = apellido.toUpperCase();
          if (apellido2) fichaBody.motherName  = apellido2.toUpperCase();
        }
        await fetch(`${API_BASE}/record/${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fichaBody),
        });
      }

      // 2. Fetch profile
      const resp = await fetch(`${API_BASE}/record/${dni.trim()}/${API_KEY}`);
      if (!resp.ok) throw new Error(`API respondió con ${resp.status}`);
      const perfil = await resp.json();

      // 3. Build normalized result
      const NOMBRE_LISTA: Record<string, string> = {
        pepChile:                'PEP Chile',
        interpol:                'INTERPOL',
        ofac:                    'OFAC',
        un:                      'ONU',
        eu:                      'Unión Europea',
        rtp:                     'RTP / PDI',
        secondCriminalCasesChile:'Causas Penales Chile',
        pdi:                     'PDI Chile',
        gafi:                    'GAFI',
        screeningGlobal:         'Screening Global',
        interestList:            'Lista de Interés',
      };

      const listasRaw = (perfil.listas ?? {}) as Record<string, Record<string, unknown>>;
      const listas: Record<string, ListaEntry> = {};
      for (const [clave, nombreLista] of Object.entries(NOMBRE_LISTA)) {
        const entry = listasRaw[clave];
        if (!entry) continue;
        let rawData = entry.data ?? null;
        if (typeof rawData === 'string' && !(rawData as string).trim()) rawData = null;
        listas[nombreLista] = {
          coincidence: Boolean(entry.coincidence),
          risk:        String(entry.risk ?? ''),
          data:        rawData,
        };
      }

      const FICHA_MAP: [string, string][] = [
        ['name','Nombre'],['fatherName','Apellido paterno'],['motherName','Apellido materno'],
        ['nationality','Nacionalidad'],['country','País'],['email','Email'],
        ['phone','Teléfono'],['position','Cargo'],['employer','Empleador'],
        ['birthDate','Fecha nacimiento'],['socialReason','Razón Social'],['businessType','Tipo empresa'],
      ];
      const ficha: Record<string, string> = {};
      for (const [k, label] of FICHA_MAP) {
        const v = perfil[k];
        if (v) ficha[label] = String(v);
      }

      setResult({
        dni:          dni.trim(),
        nombre:       perfil.name ?? perfil.socialReason ?? '',
        razon_social: perfil.socialReason ?? '',
        riesgo_final: perfil.effectiveRisk ?? perfil.calculatedRisk ?? '',
        pep_level:    perfil.pepLevel ?? '',
        listas,
        ficha,
      });

      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setError('Error de red: la API de Regcheq bloqueó la solicitud del navegador (CORS). Usa la versión local Python en localhost:5050.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function cargarLista() {
    if (!API_KEY) { setListaError('Falta la variable de entorno VITE_REGCHEQ_API_KEY.'); return; }
    setListaLoading(true);
    setListaError('');
    try {
      const resp = await fetch(`${API_BASE}/interest-list/${API_KEY}`);
      if (!resp.ok) throw new Error(`API respondió con ${resp.status}`);
      const data = await resp.json();
      setListaItems(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setListaError(msg.includes('Failed to fetch') ? 'Error de red / CORS. Usa la versión local Python.' : msg);
    } finally {
      setListaLoading(false);
    }
  }

  async function agregarLista() {
    if (!addDni.trim() || !addNombre.trim() || !addRazon.trim()) {
      setListaError('Completa RUT, nombre y razón.'); return;
    }
    setAddLoading(true);
    setListaError('');
    try {
      const resp = await fetch(`${API_BASE}/interest-list/${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: addDni.trim(), name: addNombre.trim(), personType: addTipo, reason: addRazon.trim(), status: 'active' }),
      });
      if (!resp.ok) throw new Error(`API respondió con ${resp.status}`);
      setAddDni(''); setAddNombre(''); setAddRazon('');
      await cargarLista();
    } catch (e: unknown) {
      setListaError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddLoading(false);
    }
  }

  // ─── Hits summary ────────────────────────────────────────────────────────────

  const hitCount = result ? Object.values(result.listas).filter(e => e.coincidence).length : 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-slate-100">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-700/50 px-6 py-3 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Inicio
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <span className="text-sm font-black text-white">Regcheq</span>
        <span className="text-xs text-slate-500 font-medium">Análisis AML / KYC</span>

        {/* Tabs */}
        <div className="ml-auto flex gap-1 bg-slate-800/60 rounded-xl p-1">
          {([['individual', '🔍 Individual'], ['lista', '📋 Lista de Interés']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'lista') cargarLista(); }}
              className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* ── TAB: INDIVIDUAL ──────────────────────────────────────── */}
        {tab === 'individual' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-white">Análisis de Perfil</h2>
              <p className="text-slate-400 text-sm mt-1">Consulta listas de vigilancia, PEP, OFAC, causas penales y más.</p>
            </div>

            {/* Form card */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-5">
              {/* Person type toggle */}
              <div className="flex gap-0 bg-slate-900/50 rounded-xl overflow-hidden w-fit border border-slate-700/50">
                {(['natural', 'legal'] as PersonType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    className={`px-5 py-2.5 text-sm font-bold transition-all ${tipo === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    {t === 'natural' ? '👤 Persona Natural' : '🏢 Persona Jurídica'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {tipo === 'natural' ? 'RUT / DNI *' : 'RUT Empresa *'}
                  </label>
                  <input
                    value={dni}
                    onChange={e => setDni(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchPerfil()}
                    placeholder={tipo === 'natural' ? '12345678-9' : '76543210-K'}
                    className="w-full bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {tipo === 'natural' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nombre</label>
                      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="JUAN" className="w-full bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Apellido Paterno</label>
                      <input value={apellido} onChange={e => setApellido(e.target.value)} placeholder="PÉREZ" className="w-full bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Apellido Materno</label>
                      <input value={apellido2} onChange={e => setApellido2(e.target.value)} placeholder="GÓMEZ" className="w-full bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                    </div>
                  </>
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                <div
                  onClick={() => setCrearFicha(v => !v)}
                  className={`w-10 h-6 rounded-full border transition-all relative ${crearFicha ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-700 border-slate-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${crearFicha ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm text-slate-300">Crear / actualizar ficha antes de consultar</span>
              </label>

              <button
                onClick={fetchPerfil}
                disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Consultando...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Analizar Perfil</>
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300">
                <strong className="font-bold">Error:</strong> {error}
              </div>
            )}

            {/* Result */}
            {result && (
              <div ref={resultRef} className="space-y-4">
                {/* Header */}
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <h3 className="text-xl font-black text-white">{result.nombre || result.razon_social || result.dni}</h3>
                    {riskBadge(result.riesgo_final)}
                    {result.pep_level && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40">
                        PEP Nivel {result.pep_level}
                      </span>
                    )}
                    <code className="ml-auto text-xs font-mono text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700">
                      {result.dni}
                    </code>
                  </div>

                  {/* Alert banner */}
                  {hitCount > 0 ? (
                    <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-300">
                      ⚠ <strong>{hitCount} alerta{hitCount > 1 ? 's' : ''} detectada{hitCount > 1 ? 's' : ''}</strong> — haz clic para ver el detalle
                    </div>
                  ) : (
                    <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-3 text-sm text-emerald-400">
                      ✓ <strong>Sin alertas</strong> — perfil limpio en todas las listas consultadas
                    </div>
                  )}

                  {/* Ficha fields */}
                  {Object.keys(result.ficha).length > 0 && (
                    <>
                      <div className="flex items-center gap-3 mt-5 mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Datos del perfil</span>
                        <div className="flex-1 h-px bg-slate-700/50" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(result.ficha).map(([label, val]) => (
                          <div key={label} className="bg-slate-900/40 border border-slate-700/40 rounded-xl px-3 py-2.5">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</div>
                            <div className="text-sm font-semibold text-slate-200">{val}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Lists */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Listas consultadas</span>
                    <div className="flex-1 h-px bg-slate-700/50" />
                  </div>
                  <div className="space-y-2">
                    {Object.entries(result.listas)
                      .sort((a, b) => (b[1].coincidence ? 1 : 0) - (a[1].coincidence ? 1 : 0))
                      .map(([name, entry]) => (
                        <ListaRow key={name} name={name} entry={entry} />
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: LISTA DE INTERÉS ────────────────────────────────── */}
        {tab === 'lista' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white">Lista de Interés</h2>
                <p className="text-slate-400 text-sm mt-1">Registros activos en la lista interna de Regcheq.</p>
              </div>
              <button
                onClick={cargarLista}
                disabled={listaLoading}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold px-4 py-2 rounded-xl text-sm transition-all"
              >
                <svg className={`w-4 h-4 ${listaLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Actualizar
              </button>
            </div>

            {/* Add form */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-300">Agregar a la lista</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={addDni} onChange={e => setAddDni(e.target.value)} placeholder="RUT / DNI *" className="bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                <input value={addNombre} onChange={e => setAddNombre(e.target.value)} placeholder="Nombre completo *" className="bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                <input value={addRazon} onChange={e => setAddRazon(e.target.value)} placeholder="Razón / motivo *" className="bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                <select value={addTipo} onChange={e => setAddTipo(e.target.value as PersonType)} className="bg-slate-900/60 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors">
                  <option value="natural">Persona Natural</option>
                  <option value="legal">Persona Jurídica</option>
                </select>
              </div>
              <button
                onClick={agregarLista}
                disabled={addLoading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
              >
                {addLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Agregando...</> : '+ Agregar'}
              </button>
            </div>

            {listaError && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300">
                <strong>Error:</strong> {listaError}
              </div>
            )}

            {/* Table */}
            {listaLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-400 rounded-full animate-spin" />
              </div>
            ) : listaItems.length > 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-900/40">
                      {['RUT/DNI', 'Nombre', 'Tipo', 'Razón', 'Estado'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaItems.map((item, i) => (
                      <tr key={i} className="border-t border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{item.dni}</td>
                        <td className="px-4 py-3 font-medium text-slate-200">{item.name}</td>
                        <td className="px-4 py-3 text-slate-400">{item.personType}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{item.reason}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${item.status === 'active' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/40' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-medium">La lista de interés está vacía</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
