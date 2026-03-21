import React, { useState, useMemo, useRef } from 'react';
import { PersonProfile } from '../../types/criminalTypes';
import { processExcelFile } from '../../services/criminalDataProcessor';
import {
  ArrowLeft, Upload, Users, TrendingUp, TrendingDown, UserPlus, UserMinus,
  GitCompare, AlertTriangle, CheckCircle2
} from 'lucide-react';

interface ComparisonViewProps {
  onBack: () => void;
}

type ChangeType = 'Nuevo' | 'Removido' | 'Empeoró' | 'Mejoró' | 'Sin cambio';
type FilterTab = 'Todos' | 'Nuevos' | 'Empeorados' | 'Mejorados' | 'Removidos';

interface ProfileDiff {
  rut: string;
  nombre: string;
  apellido: string;
  estadoBase: string;
  estadoActual: string;
  deltaDelitos: number;
  deltaRiesgo: 'up' | 'down' | 'same';
  cambio: ChangeType;
}

const riskWeight = (risk: string): number => {
  const r = (risk || '').toLowerCase();
  if (r.includes('critical') || r.includes('crítico') || r.includes('critico')) return 4;
  if (r.includes('high') || r.includes('alto')) return 3;
  if (r.includes('medium') || r.includes('medio')) return 2;
  if (r.includes('low') || r.includes('bajo')) return 1;
  return 0;
};

const CHANGE_BADGE: Record<ChangeType, string> = {
  'Nuevo': 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700',
  'Removido': 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  'Empeoró': 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700',
  'Mejoró': 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  'Sin cambio': 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-700',
};

type LoadedPeriod = { profiles: PersonProfile[] } | null;

export const ComparisonView: React.FC<ComparisonViewProps> = ({ onBack }) => {
  const [baseData, setBaseData] = useState<LoadedPeriod>(null);
  const [currentData, setCurrentData] = useState<LoadedPeriod>(null);
  const [loadingBase, setLoadingBase] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [errorCurrent, setErrorCurrent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('Todos');

  const baseRef = useRef<HTMLInputElement>(null);
  const currentRef = useRef<HTMLInputElement>(null);

  const handleLoadFile = async (
    file: File,
    setData: (d: LoadedPeriod) => void,
    setLoading: (b: boolean) => void,
    setError: (s: string | null) => void
  ) => {
    setLoading(true);
    setError(null);
    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const profiles: PersonProfile[] = parsed.profiles ?? parsed;
        setData({ profiles });
      } else {
        const profiles = await processExcelFile(file, null);
        setData({ profiles });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const diffs = useMemo<ProfileDiff[]>(() => {
    if (!baseData || !currentData) return [];

    const baseMap = new Map<string, PersonProfile>(baseData.profiles.map(p => [p.rut, p]));
    const currentMap = new Map<string, PersonProfile>(currentData.profiles.map(p => [p.rut, p]));
    const allRuts = new Set([...baseMap.keys(), ...currentMap.keys()]);

    const result: ProfileDiff[] = [];
    for (const rut of allRuts) {
      const base = baseMap.get(rut);
      const cur = currentMap.get(rut);

      if (!base && cur) {
        result.push({
          rut,
          nombre: cur.nombre,
          apellido: cur.apellido,
          estadoBase: '—',
          estadoActual: cur.preEvaluation?.decision || cur.selectedAction || 'Sin evaluación',
          deltaDelitos: cur.totalCrimes,
          deltaRiesgo: 'up',
          cambio: 'Nuevo',
        });
      } else if (base && !cur) {
        result.push({
          rut,
          nombre: base.nombre,
          apellido: base.apellido,
          estadoBase: base.preEvaluation?.decision || base.selectedAction || 'Sin evaluación',
          estadoActual: '—',
          deltaDelitos: -base.totalCrimes,
          deltaRiesgo: 'down',
          cambio: 'Removido',
        });
      } else if (base && cur) {
        const deltaDelitos = cur.totalCrimes - base.totalCrimes;
        const baseRisk = riskWeight(base.highestRisk);
        const curRisk = riskWeight(cur.highestRisk);
        const deltaRiesgo: 'up' | 'down' | 'same' = curRisk > baseRisk ? 'up' : curRisk < baseRisk ? 'down' : 'same';
        let cambio: ChangeType = 'Sin cambio';
        if (deltaDelitos > 0 || deltaRiesgo === 'up') cambio = 'Empeoró';
        else if (deltaDelitos < 0 || deltaRiesgo === 'down') cambio = 'Mejoró';

        result.push({
          rut,
          nombre: cur.nombre,
          apellido: cur.apellido,
          estadoBase: base.preEvaluation?.decision || base.selectedAction || 'Sin evaluación',
          estadoActual: cur.preEvaluation?.decision || cur.selectedAction || 'Sin evaluación',
          deltaDelitos,
          deltaRiesgo,
          cambio,
        });
      }
    }
    return result;
  }, [baseData, currentData]);

  const stats = useMemo(() => ({
    nuevos: diffs.filter(d => d.cambio === 'Nuevo').length,
    removidos: diffs.filter(d => d.cambio === 'Removido').length,
    empeorados: diffs.filter(d => d.cambio === 'Empeoró').length,
    mejorados: diffs.filter(d => d.cambio === 'Mejoró').length,
  }), [diffs]);

  const filteredDiffs = useMemo(() => {
    if (activeTab === 'Todos') return diffs;
    if (activeTab === 'Nuevos') return diffs.filter(d => d.cambio === 'Nuevo');
    if (activeTab === 'Empeorados') return diffs.filter(d => d.cambio === 'Empeoró');
    if (activeTab === 'Mejorados') return diffs.filter(d => d.cambio === 'Mejoró');
    if (activeTab === 'Removidos') return diffs.filter(d => d.cambio === 'Removido');
    return diffs;
  }, [diffs, activeTab]);

  const UploadPanel = ({
    label,
    data,
    loading,
    error,
    inputRef,
    onFileChange,
  }: {
    label: string;
    data: LoadedPeriod;
    loading: boolean;
    error: string | null;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onFileChange: (f: File) => void;
  }) => (
    <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center justify-center gap-4 min-h-[220px] transition-all hover:border-indigo-400 dark:hover:border-indigo-500">
      <div className="p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl">
        {data ? <CheckCircle2 size={28} className="text-emerald-500" /> : <Upload size={28} className="text-indigo-500" />}
      </div>
      <div className="text-center">
        <h3 className="font-black text-slate-800 dark:text-white text-sm uppercase tracking-widest mb-1">{label}</h3>
        {data ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">{data.profiles.length} perfiles cargados</p>
        ) : (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Arrastra un archivo JSON o Excel aquí</p>
        )}
      </div>
      {error && <p className="text-[10px] text-red-500 font-bold text-center">{error}</p>}
      {loading ? (
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      ) : (
        <label className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95">
          {data ? 'Cambiar archivo' : 'Seleccionar archivo'}
          <input
            type="file"
            accept=".json,.xlsx,.xls,.csv"
            className="hidden"
            ref={inputRef}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f); }}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      <header className="bg-white dark:bg-indigo-950 text-slate-900 dark:text-white py-4 px-6 sticky top-0 z-40 shadow-xl border-b border-slate-200 dark:border-indigo-900">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-slate-100 dark:bg-indigo-900/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-indigo-800"
          >
            <ArrowLeft size={16} /> Volver
          </button>
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl border border-indigo-200 dark:border-indigo-500/30">
            <GitCompare size={22} className="text-indigo-600 dark:text-indigo-300" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Análisis Comparativo entre Períodos</h1>
            <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-[0.2em]">Diferencias entre dos bases de datos</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
        {/* Upload panels */}
        <div className="flex flex-col md:flex-row gap-6">
          <UploadPanel
            label="Período Base"
            data={baseData}
            loading={loadingBase}
            error={errorBase}
            inputRef={baseRef}
            onFileChange={f => handleLoadFile(f, setBaseData, setLoadingBase, setErrorBase)}
          />
          <div className="hidden md:flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <GitCompare size={20} className="text-slate-500 dark:text-slate-400" />
            </div>
          </div>
          <UploadPanel
            label="Período Actual"
            data={currentData}
            loading={loadingCurrent}
            error={errorCurrent}
            inputRef={currentRef}
            onFileChange={f => handleLoadFile(f, setCurrentData, setLoadingCurrent, setErrorCurrent)}
          />
        </div>

        {baseData && currentData && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Nuevos Perfiles', value: stats.nuevos, icon: <UserPlus size={20} />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950', border: 'border-indigo-100 dark:border-indigo-900' },
                { label: 'Perfiles Removidos', value: stats.removidos, icon: <UserMinus size={20} />, color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800', border: 'border-slate-100 dark:border-slate-700' },
                { label: 'Empeorados', value: stats.empeorados, icon: <TrendingUp size={20} />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-100 dark:border-red-900' },
                { label: 'Mejorados', value: stats.mejorados, icon: <TrendingDown size={20} />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-100 dark:border-emerald-900' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5 flex items-center gap-4`}>
                  <div className={`p-2.5 bg-white dark:bg-slate-900 rounded-xl ${s.color}`}>{s.icon}</div>
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">{s.label}</p>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                {(['Todos', 'Nuevos', 'Empeorados', 'Mejorados', 'Removidos'] as FilterTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                      activeTab === tab
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {tab} {tab === 'Todos' ? `(${diffs.length})` : ''}
                  </button>
                ))}
              </div>

              <div className="overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white dark:bg-slate-900 sticky top-0 z-10">
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      {['Identidad', 'Estado Base', 'Estado Actual', 'Δ Delitos', 'Δ Riesgo', 'Cambio'].map(h => (
                        <th key={h} className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredDiffs.map(d => (
                      <tr key={d.rut} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{d.nombre} {d.apellido}</span>
                            <span className="text-[10px] text-slate-400 font-bold">{d.rut}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[10px] text-slate-500 dark:text-slate-400 font-bold">{d.estadoBase}</td>
                        <td className="px-6 py-4 text-[10px] text-slate-700 dark:text-slate-300 font-bold">{d.estadoActual}</td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-black ${d.deltaDelitos > 0 ? 'text-red-600 dark:text-red-400' : d.deltaDelitos < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                            {d.deltaDelitos > 0 ? `+${d.deltaDelitos}` : d.deltaDelitos === 0 ? '0' : d.deltaDelitos}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {d.deltaRiesgo === 'up' && <TrendingUp size={16} className="text-red-500" />}
                          {d.deltaRiesgo === 'down' && <TrendingDown size={16} className="text-emerald-500" />}
                          {d.deltaRiesgo === 'same' && <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] px-2.5 py-1 rounded-lg font-black uppercase border ${CHANGE_BADGE[d.cambio]}`}>
                            {d.cambio}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredDiffs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm font-medium">
                          No hay registros para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {(!baseData || !currentData) && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-slate-500 gap-3">
            <AlertTriangle size={32} className="text-amber-400" />
            <p className="font-black uppercase text-xs tracking-widest">Carga ambos períodos para ver el análisis comparativo</p>
          </div>
        )}
      </main>
    </div>
  );
};
