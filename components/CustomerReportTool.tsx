import React, { useState, useRef, useEffect } from 'react';

// ── URL del backend desplegado ───────────────────────────────────────────────
// Actualiza esta URL después de hacer deploy en Fly.io / Railway
const API_BASE = (import.meta.env.VITE_CUSTOMER_REPORT_API as string || '').replace(/\/$/, '');

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Customer {
  customer_id: number;
  name: string | null;
  last_name: string | null;
  email: string | null;
}

const SECTIONS = [
  { key: 'info_basica',        label: 'Información básica' },
  { key: 'kyc',                label: 'Estado KYC' },
  { key: 'compliance',         label: 'Compliance' },
  { key: 'kyc_verificaciones', label: 'Verificaciones KYC' },
  { key: 'direccion',          label: 'Dirección' },
  { key: 'transacciones',      label: 'Transacciones' },
  { key: 'beneficiarios',      label: 'Beneficiarios' },
];

interface Props { onBack: () => void; }

// ── Pantalla de configuración (cuando no hay API_BASE) ───────────────────────
const SetupScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col">
    <Header onBack={onBack} />
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center bg-slate-800/50 border border-slate-700/50 rounded-3xl p-10">
        <div className="text-5xl mb-6">⚙️</div>
        <h2 className="text-2xl font-black text-white mb-3">Backend no configurado</h2>
        <p className="text-slate-400 text-sm leading-relaxed mb-4">
          Esta herramienta necesita la variable de entorno{' '}
          <code className="bg-slate-900 text-blue-400 px-2 py-0.5 rounded font-mono text-xs">
            VITE_CUSTOMER_REPORT_API
          </code>{' '}
          apuntando al servidor de reportes desplegado.
        </p>
        <div className="bg-slate-900/80 rounded-xl p-4 text-left text-xs font-mono text-slate-400 mb-6 space-y-1">
          <p className="text-slate-500"># En .env.local o variable de entorno del build:</p>
          <p className="text-blue-300">VITE_CUSTOMER_REPORT_API=https://tu-app.fly.dev</p>
        </div>
        <p className="text-slate-500 text-xs">Contacta al administrador del sistema.</p>
      </div>
    </div>
  </div>
);

// ── Header reutilizable ──────────────────────────────────────────────────────
const Header: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 active:scale-95"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Inicio
    </button>
    <div>
      <h1 className="text-white font-bold text-lg leading-none">Reporte de Cliente</h1>
      <p className="text-slate-500 text-xs mt-0.5">Genera y descarga reportes PDF de clientes</p>
    </div>
  </div>
);

// ── Componente principal ─────────────────────────────────────────────────────
export const CustomerReportTool: React.FC<Props> = ({ onBack }) => {
  const [query, setQuery]                     = useState('');
  const [results, setResults]                 = useState<Customer[]>([]);
  const [ddOpen, setDdOpen]                   = useState(false);
  const [ddLoading, setDdLoading]             = useState(false);
  const [selected, setSelected]               = useState<{ id: string; label: string } | null>(null);
  const [sections, setSections]               = useState<Set<string>>(new Set());
  const [txDays, setTxDays]                   = useState<5 | 10 | 15>(5);
  const [downloading, setDownloading]         = useState(false);
  const [toast, setToast]                     = useState<{ msg: string; error: boolean } | null>(null);
  const timerRef                              = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef                               = useRef<HTMLDivElement>(null);

  if (!API_BASE) return <SetupScreen onBack={onBack} />;

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDdOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3200);
  };

  // ── Búsqueda ──
  const handleSearch = (val: string) => {
    setQuery(val);
    setSelected(null);
    clearTimeout(timerRef.current);
    if (val.trim().length < 2) { setDdOpen(false); return; }
    setDdOpen(true);
    setDdLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(val.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
      setDdLoading(false);
    }, 350);
  };

  const pickCustomer = (c: Customer) => {
    const name = [c.name, c.last_name].filter(Boolean).join(' ');
    setSelected({
      id: String(c.customer_id),
      label: `#${c.customer_id} · ${name || '—'} · ${c.email ?? '—'}`,
    });
    setQuery(`${c.customer_id} — ${name} (${c.email ?? ''})`);
    setDdOpen(false);
  };

  // ── Secciones ──
  const toggleSection = (key: string) =>
    setSections(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const selectAll   = () => setSections(new Set(SECTIONS.map(s => s.key)));
  const deselectAll = () => setSections(new Set());

  // ── Descarga PDF ──
  const canDownload = !!selected && sections.size > 0;

  const download = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/api/download_pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier:       selected!.id,
          sections:         [...sections],
          transaction_days: txDays,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Error al generar el PDF', true);
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `cliente_${selected!.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✓ PDF descargado correctamente');
    } catch {
      showToast('Error de conexión con el servidor', true);
    } finally {
      setDownloading(false);
    }
  };

  // ── Render ──
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header onBack={onBack} />

      <div className="flex-1 flex flex-col items-center p-6">
        <div className="w-full max-w-2xl flex flex-col gap-5">

          {/* ── Buscador ── */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
              Buscar cliente
            </p>
            <div className="relative" ref={wrapRef}>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                <input
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Customer ID o email del cliente..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
                  autoComplete="off"
                />
              </div>

              {/* Dropdown */}
              {ddOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                  {ddLoading ? (
                    <div className="p-4 text-center text-slate-500 text-sm">Buscando...</div>
                  ) : results.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-sm">Sin resultados</div>
                  ) : results.map(c => (
                    <button
                      key={c.customer_id}
                      onMouseDown={() => pickCustomer(c)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-700/80 border-b border-slate-700/40 last:border-0 transition-colors"
                    >
                      <div className="text-xs text-blue-400 font-bold">#{c.customer_id}</div>
                      <div className="text-sm text-white font-medium">
                        {[c.name, c.last_name].filter(Boolean).join(' ') || '—'}
                      </div>
                      <div className="text-xs text-slate-400">{c.email ?? '—'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cliente seleccionado */}
            {selected && (
              <div className="mt-3 flex items-center justify-between bg-blue-950/40 border border-blue-700/40 rounded-xl px-4 py-2.5">
                <span className="text-sm text-blue-300 font-medium truncate pr-2">{selected.label}</span>
                <button
                  onClick={() => { setSelected(null); setQuery(''); }}
                  className="text-slate-500 hover:text-white transition-colors text-xs shrink-0"
                >
                  ✕ Limpiar
                </button>
              </div>
            )}
          </div>

          {/* ── Secciones ── */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Secciones a incluir en el PDF
              </p>
              <div className="flex gap-4">
                <button onClick={selectAll}   className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">Todas</button>
                <button onClick={deselectAll} className="text-xs text-slate-500 hover:text-slate-300 font-semibold transition-colors">Ninguna</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SECTIONS.map(s => {
                const active = sections.has(s.key);
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleSection(s.key)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm font-medium active:scale-[0.98] ${
                      active
                        ? 'bg-blue-600/20 border-blue-500/50 text-white'
                        : 'bg-slate-900/40 border-slate-700/40 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      active ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                    }`}>
                      {active && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Filtro de días (solo si transacciones está activo) */}
            {sections.has('transacciones') && (
              <div className="mt-4 pt-4 border-t border-slate-700/40">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                  Período de transacciones
                </p>
                <div className="flex gap-2">
                  {([5, 10, 15] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setTxDays(d)}
                      className={`px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                        txDays === d
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                          : 'bg-slate-900/60 border border-slate-700/40 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {d} días
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Botón descargar ── */}
          <button
            onClick={download}
            disabled={!canDownload || downloading}
            className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 ${
              canDownload && !downloading
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white active:scale-[0.98] shadow-lg shadow-blue-900/30'
                : 'bg-slate-800 border border-slate-700/40 text-slate-600 cursor-not-allowed'
            }`}
          >
            {downloading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando PDF...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-2xl z-50 transition-all ${
          toast.error ? 'bg-red-700' : 'bg-slate-700 border border-slate-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
};
