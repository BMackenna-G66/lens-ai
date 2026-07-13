import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeft, Sun, Moon, FileSpreadsheet, Download, Search, X, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, ArrowUpDown, Clock, List } from 'lucide-react';
import { AnalysisAction } from '../../types/criminalTypes';
import { parseColombiaMasivo, buildTimeline, ColombiaProfile } from '../../services/colombiaCriminalParser';
import { generateColombiaProfilePdf } from '../../services/pdfGenerator';

type SortKey = 'nombre' | 'numeroDni' | 'resultado' | 'totalCoincidencias' | 'accion' | 'estado';
type SortOrder = 'asc' | 'desc' | null;

interface Props { onBack: () => void; darkMode: boolean; onToggleDarkMode: () => void; }

const ACCIONES: AnalysisAction[] = ['Liberar', 'Revisar', 'Liberar + UCR', 'Fully Blocked'];

const RES_STYLE: Record<string, string> = {
  ALERTA: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  REVISAR: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SIN_HALLAZGOS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};
const ACC_STYLE: Record<string, string> = {
  'Liberar': 'text-emerald-700 dark:text-emerald-400',
  'Revisar': 'text-amber-700 dark:text-amber-400',
  'Liberar + UCR': 'text-blue-700 dark:text-blue-400',
  'Fully Blocked': 'text-red-700 dark:text-red-400',
};

const SortTh: React.FC<{ label: string; k: SortKey; sort: { key: SortKey; order: SortOrder }; onSort: (k: SortKey) => void; center?: boolean }> = ({ label, k, sort, onSort, center }) => (
  <th onClick={() => onSort(k)} className={`px-4 py-3 font-bold cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 ${center ? 'text-center' : ''}`}>
    <span className={`inline-flex items-center gap-1 ${center ? 'justify-center' : ''}`}>
      {label}
      {sort.key !== k || !sort.order ? <ArrowUpDown size={12} className="opacity-40" /> : sort.order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </span>
  </th>
);

export const ColombiaCriminalApp: React.FC<Props> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [profiles, setProfiles] = useState<ColombiaProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterAccion, setFilterAccion] = useState('All');
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({ key: 'nombre', order: null });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleSort = (key: SortKey) => setSort(s =>
    s.key !== key ? { key, order: 'asc' } : { key, order: s.order === 'asc' ? 'desc' : s.order === 'desc' ? null : 'asc' });

  const handleFile = async (file: File) => {
    setLoading(true); setError(null);
    try {
      const data = await parseColombiaMasivo(file);
      setProfiles(data);
      if (data.length === 0) setError('No se encontraron registros en la hoja Resumen.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const update = (dni: string, patch: Partial<ColombiaProfile>) =>
    setProfiles(prev => prev.map(p => p.numeroDni === dni ? { ...p, ...patch } : p));

  const setAccion = (dni: string, accion: AnalysisAction) =>
    update(dni, { accion, estado: accion ? 'Revisado' : 'Pendiente' });

  const filtered = useMemo(() => {
    const list = profiles.filter(p => {
      const q = search.trim().toLowerCase();
      if (q && !(`${p.nombre} ${p.numeroDni}`.toLowerCase().includes(q))) return false;
      if (filterAccion !== 'All' && p.accion !== filterAccion) return false;
      return true;
    });
    if (!sort.order) return list;
    const dir = sort.order === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'es') * dir;
    });
  }, [profiles, search, filterAccion, sort]);

  const selectedProfile = profiles.find(p => p.numeroDni === selected) ?? null;
  const revisados = profiles.filter(p => p.estado === 'Revisado').length;

  // Navegación entre fichas (según el orden filtrado actual)
  const selIdx = selectedProfile ? filtered.findIndex(p => p.numeroDni === selectedProfile.numeroDni) : -1;
  const goPrev = selIdx > 0 ? () => setSelected(filtered[selIdx - 1].numeroDni) : undefined;
  const goNext = selIdx >= 0 && selIdx < filtered.length - 1 ? () => setSelected(filtered[selIdx + 1].numeroDni) : undefined;

  // Selección masiva
  const toggleCheck = (dni: string) => setChecked(s => { const n = new Set(s); n.has(dni) ? n.delete(dni) : n.add(dni); return n; });
  const allChecked = filtered.length > 0 && filtered.every(p => checked.has(p.numeroDni));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map(p => p.numeroDni)));
  const bulkSetAccion = (accion: AnalysisAction) => {
    setProfiles(prev => prev.map(p => checked.has(p.numeroDni) ? { ...p, accion, estado: accion ? 'Revisado' : 'Pendiente' } : p));
    setChecked(new Set());
  };

  const exportar = () => {
    if (profiles.length === 0) return;
    const rows = profiles.map(p => ({
      numero_dni: p.numeroDni, nombre: p.nombre, tipo_dni: p.tipoDni,
      resultado_inspektor: p.resultado, total_coincidencias: p.totalCoincidencias,
      prioridad_maxima: p.prioridadMaxima, listas: p.listas,
      accion_manual: p.accion || 'Pendiente', estado: p.estado, notas: p.notas,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(50, Math.max(12, k.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Revisión Colombia');
    const now = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
    XLSX.writeFile(wb, `revision_colombia_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      <header className="bg-white dark:bg-indigo-950 py-4 px-6 sticky top-0 z-40 shadow-xl border-b border-slate-200 dark:border-indigo-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white text-xs font-black uppercase tracking-widest bg-slate-100 dark:bg-indigo-900/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-indigo-800">
              <ArrowLeft size={16} /> País
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white leading-none mb-1">🇨🇴 Colombia — Perfiles</h1>
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-[0.2em]">Revisión manual · Inspektor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profiles.length > 0 && (
              <button onClick={exportar} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500">
                <Download size={16} /> Exportar
              </button>
            )}
            <button onClick={onToggleDarkMode} className="p-2.5 rounded-xl bg-slate-100 dark:bg-indigo-900/50 border border-slate-200 dark:border-indigo-800 text-slate-600 dark:text-indigo-300">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8">
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-5 py-4 text-sm">{error}</div>
        )}

        {profiles.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Flujo de Emergencia — Colombia</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-lg mb-10 text-center font-medium">
              Carga el Excel exportado por la <strong>Consulta Masiva de Inspektor</strong>. Se agruparán las coincidencias por persona para revisión y decisión manual.
            </p>
            <label className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:shadow-xl cursor-pointer transition-all group p-10 flex flex-col items-center gap-4 max-w-md w-full">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl border border-indigo-200 dark:border-indigo-800">
                <FileSpreadsheet size={32} className="text-indigo-500" />
              </div>
              <div className="text-center">
                <h4 className="font-black text-slate-900 dark:text-white uppercase text-sm mb-2">⚡ Cargar resultado Inspektor</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Excel con hojas Resumen, Detalle_Listas, Procuraduria, Rama_Judicial y JEPMS.</p>
              </div>
              <span className="bg-indigo-600 group-hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest w-full text-center">
                {loading ? 'Procesando…' : 'Seleccionar Archivo'}
              </span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
        ) : (
          <>
            {/* Controles */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o documento…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" />
              </div>
              <select value={filterAccion} onChange={e => setFilterAccion(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                <option value="All">Todas las acciones</option>
                {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
                <option value="">Sin acción</option>
              </select>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{revisados}/{profiles.length} revisados</span>
            </div>

            {/* Barra de acción masiva */}
            {checked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2.5">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{checked.size} seleccionado(s) → aplicar:</span>
                {ACCIONES.map(a => (
                  <button key={a} onClick={() => bulkSetAccion(a)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 ${ACC_STYLE[a]}`}>
                    {a}
                  </button>
                ))}
                <button onClick={() => setChecked(new Set())} className="text-xs text-slate-500 hover:text-slate-700 ml-1">✕ Limpiar</button>
              </div>
            )}

            {/* Tabla */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="px-3 py-3 w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded" /></th>
                      <SortTh label="Nombre" k="nombre" sort={sort} onSort={toggleSort} />
                      <SortTh label="Documento" k="numeroDni" sort={sort} onSort={toggleSort} />
                      <SortTh label="Inspektor" k="resultado" sort={sort} onSort={toggleSort} />
                      <SortTh label="Coinc." k="totalCoincidencias" sort={sort} onSort={toggleSort} center />
                      <SortTh label="Acción manual" k="accion" sort={sort} onSort={toggleSort} />
                      <SortTh label="Estado" k="estado" sort={sort} onSort={toggleSort} />
                      <th className="px-4 py-3 font-bold text-right">Ficha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map(p => (
                      <tr key={p.numeroDni} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${checked.has(p.numeroDni) ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}>
                        <td className="px-3 py-3"><input type="checkbox" checked={checked.has(p.numeroDni)} onChange={() => toggleCheck(p.numeroDni)} className="rounded" /></td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{p.nombre || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{p.numeroDni} · {p.tipoDni}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full ${RES_STYLE[p.resultado] ?? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                            {p.resultado}{p.prioridadMaxima ? ` · P${p.prioridadMaxima}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{p.totalCoincidencias}</td>
                        <td className="px-4 py-3">
                          <select value={p.accion} onChange={e => setAccion(p.numeroDni, e.target.value as AnalysisAction)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${ACC_STYLE[p.accion] ?? 'text-slate-500'}`}>
                            <option value="">— Seleccionar —</option>
                            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.estado === 'Revisado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                            {p.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setSelected(p.numeroDni)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                            Ver <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {selectedProfile && (
        <ProfileDetalleColombia
          profile={selectedProfile}
          onClose={() => setSelected(null)}
          onUpdate={update}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </div>
  );
};

// ─── Ficha detallada (sin chat IA; con línea de tiempo) ───────────────────────────
const ProfileDetalleColombia: React.FC<{
  profile: ColombiaProfile;
  onClose: () => void;
  onUpdate: (dni: string, patch: Partial<ColombiaProfile>) => void;
  onPrev?: () => void;
  onNext?: () => void;
}> = ({ profile: p, onClose, onUpdate, onPrev, onNext }) => {
  const [tab, setTab] = useState<'listas' | 'procuraduria' | 'rama' | 'jepms' | 'timeline'>('listas');
  const [pdfLoading, setPdfLoading] = useState(false);
  const timeline = useMemo(() => buildTimeline(p), [p]);

  const downloadPdf = async () => {
    setPdfLoading(true);
    try { await generateColombiaProfilePdf(p); } finally { setPdfLoading(false); }
  };

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: 'listas', label: 'Listas', count: p.coincidencias.length },
    { key: 'procuraduria', label: 'Procuraduría', count: p.procuraduria.length },
    { key: 'rama', label: 'Rama Judicial', count: p.ramaJudicial.length },
    { key: 'jepms', label: 'JEPMS', count: p.jepms.length },
    { key: 'timeline', label: 'Línea de tiempo', count: timeline.length },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-5xl h-[92vh] overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800">
        {/* Header */}
        <div className="p-5 px-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-white dark:bg-slate-900 shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{p.nombre || p.numeroDni}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{p.numeroDni} · {p.tipoDni} · Inspektor: {p.resultado}{p.prioridadMaxima ? ` (P${p.prioridadMaxima})` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadPdf} disabled={pdfLoading}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-600 hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl transition-all disabled:opacity-50">
              <Download size={14} /> {pdfLoading ? '…' : 'PDF'}
            </button>
            <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-1">
              <button onClick={onPrev} disabled={!onPrev} className={`p-1.5 rounded-lg ${onPrev ? 'text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-slate-700' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}><ChevronLeft size={18} /></button>
              <button onClick={onNext} disabled={!onNext} className={`p-1.5 rounded-lg ${onNext ? 'text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-slate-700' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}><ChevronRight size={18} /></button>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><X size={20} /></button>
          </div>
        </div>

        {/* Decisión manual */}
        <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Decisión manual</span>
          <select value={p.accion} onChange={e => onUpdate(p.numeroDni, { accion: e.target.value as AnalysisAction, estado: e.target.value ? 'Revisado' : 'Pendiente' })}
            className={`px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${ACC_STYLE[p.accion] ?? 'text-slate-500'}`}>
            <option value="">— Seleccionar —</option>
            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input value={p.notas} onChange={e => onUpdate(p.numeroDni, { notas: e.target.value })}
            placeholder="Notas del analista…"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" />
        </div>

        {/* Tabs */}
        <div className="px-8 pt-3 flex gap-2 flex-wrap shrink-0 border-b border-slate-100 dark:border-slate-800">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold ${tab === t.key ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
              {t.key === 'timeline' ? <Clock size={13} /> : <List size={13} />}{t.label} <span className="opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-grow overflow-y-auto px-8 py-5 text-sm">
          {tab === 'listas' && (
            p.coincidencias.length === 0 ? <Empty /> :
            <div className="space-y-2">
              {p.coincidencias.map((c, i) => (
                <div key={i} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{c.nombreLista || c.grupoLista || '—'}</span>
                    {c.prioridad && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">P{c.prioridad}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {[c.nombre, c.delito, c.pep, c.zona, c.fuente, c.fechaActualizacion].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          )}
          {tab === 'procuraduria' && (
            p.procuraduria.length === 0 ? <Empty /> :
            <div className="space-y-2">
              {p.procuraduria.map((r, i) => (
                <div key={i} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{r.nombre || '—'} {r.numSiri && `· SIRI ${r.numSiri}`}</p>
                  {r.sanciones && <p className="text-[11px] text-slate-500"><b>Sanciones:</b> {r.sanciones}</p>}
                  {r.delitos && <p className="text-[11px] text-slate-500"><b>Delitos:</b> {r.delitos}</p>}
                  {r.inhabilidades && <p className="text-[11px] text-slate-500"><b>Inhabilidades:</b> {r.inhabilidades}</p>}
                  {r.instancias && <p className="text-[11px] text-slate-500"><b>Instancias:</b> {r.instancias}</p>}
                  {!r.sanciones && !r.delitos && !r.inhabilidades && <p className="text-[11px] text-amber-500">Registro en Procuraduría (detalle en el raw_json del Excel).</p>}
                </div>
              ))}
            </div>
          )}
          {tab === 'rama' && (
            p.ramaJudicial.length === 0 ? <Empty /> :
            <div className="space-y-2">
              {p.ramaJudicial.map((r, i) => (
                <div key={i} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{r.despacho || r.llave || '—'}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {[r.departamento, r.fechaProceso && `Inicio: ${r.fechaProceso.slice(0, 10)}`, r.fechaUltimaActuacion && `Últ: ${r.fechaUltimaActuacion.slice(0, 10)}`].filter(Boolean).join(' · ')}
                  </p>
                  {r.sujetos && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{r.sujetos}</p>}
                </div>
              ))}
            </div>
          )}
          {tab === 'jepms' && (
            p.jepms.length === 0 ? <Empty /> :
            <div className="space-y-2">
              {p.jepms.map((j, i) => (
                <div key={i} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-300">{j.ciudad || '—'} {j.fechaConsulta && <span className="text-[11px] text-slate-400">· {j.fechaConsulta.slice(0, 10)}</span>}</span>
                  {j.link && <a href={j.link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-500 underline shrink-0">abrir ↗</a>}
                </div>
              ))}
            </div>
          )}
          {tab === 'timeline' && (
            timeline.length === 0 ? <Empty msg="Sin eventos con fecha." /> :
            <ol className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-2 space-y-4">
              {timeline.map((e, i) => (
                <li key={i} className="ml-4">
                  <div className="absolute -left-[7px] w-3 h-3 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{e.fecha.slice(0, 10)} · <span className="text-indigo-600 dark:text-indigo-400">{e.tipo}</span></p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{e.descripcion || '—'}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

const Empty: React.FC<{ msg?: string }> = ({ msg = 'Sin registros en esta categoría.' }) => (
  <p className="text-xs text-slate-400 text-center py-8">{msg}</p>
);
