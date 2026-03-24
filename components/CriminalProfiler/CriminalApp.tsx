import React, { useState, useMemo, useEffect, useRef } from 'react';
import { processExcelFile, processRegcheqFile, exportToExcel, processCatalogFile, applyEvaluationToProfile } from '../../services/criminalDataProcessor';
import { PersonProfile, CriminalAppState, AnalysisAction, CatalogData } from '../../types/criminalTypes';
import { DEFAULT_CATALOG } from '../../services/defaultCatalogData';
import { CriminalDashboard } from './CriminalDashboard';
import { ProfileDetails } from './ProfileDetails';
import { CatalogManager } from './CatalogManager';
import { ComparisonView } from './ComparisonView';
import { TriageView } from './TriageView';
import {
  FileSpreadsheet, Search, Filter, ChevronRight, ShieldAlert, AlertCircle,
  Download, CheckCircle, ChevronUp, ChevronDown, ArrowUpDown, CheckSquare,
  Square, BookOpen, Database, RotateCcw, LayoutDashboard, Share2, FolderInput,
  Layers, Upload, Settings, ArrowLeft, Sun, Moon, Zap, GitCompare
} from 'lucide-react';

type SortKey = 'rut' | 'nombre' | 'totalCrimes' | 'totalHighRiskCrimes' | 'highestRisk' | 'status';
type SortOrder = 'asc' | 'desc' | null;
const STORAGE_KEY = 'criminal_profile_catalog';

interface CriminalAppProps {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const CriminalApp: React.FC<CriminalAppProps> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [state, setState] = useState<CriminalAppState>({
    profiles: [], catalog: null, loading: false,
    error: null, selectedRut: null, view: 'dashboard'
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRutsWithInfo, setFilterRutsWithInfo] = useState(false);
  const [filterAction, setFilterAction] = useState<string>('All');
  const [filterRisk, setFilterRisk] = useState<string>('All');
  const [selectedRuts, setSelectedRuts] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: SortOrder }>({ key: 'rut', order: null });
  const [flowType, setFlowType] = useState<'emergency' | 'masivo'>('emergency');
  const sessionFileInputRef = useRef<HTMLInputElement>(null);
  const emergencyFileRef = useRef<HTMLInputElement>(null);
  const masivoFileRef = useRef<HTMLInputElement>(null);

  // Load catalog: localStorage override > default built-in catalog
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, catalog: parsed }));
        return;
      } catch {}
    }
    // Fall back to built-in default catalog
    setState(prev => ({ ...prev, catalog: DEFAULT_CATALOG }));
  }, []);

  const handleUpdateCatalog = (newCatalog: CatalogData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCatalog));
    const updatedProfiles = state.profiles.map(p => { const np = { ...p }; applyEvaluationToProfile(np, newCatalog); return np; });
    setState(prev => ({ ...prev, catalog: newCatalog, profiles: updatedProfiles }));
  };

  const handleResetCatalog = () => {
    if (confirm('¿Restaurar el catálogo al predeterminado de fábrica?')) {
      localStorage.removeItem(STORAGE_KEY);
      const updatedProfiles = state.profiles.map(p => { const np = { ...p }; applyEvaluationToProfile(np, DEFAULT_CATALOG); return np; });
      setState(prev => ({ ...prev, catalog: DEFAULT_CATALOG, profiles: updatedProfiles }));
    }
  };

  const handleProfileLoad = async (file: File, flow: 'emergency' | 'masivo') => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = flow === 'masivo'
        ? await processRegcheqFile(file, state.catalog)
        : await processExcelFile(file, state.catalog);
      setState(prev => ({ ...prev, profiles: data, loading: false }));
      setSelectedRuts(new Set());
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: String(err) }));
    }
  };

  const handleEmergencyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFlowType('emergency');
    handleProfileLoad(file, 'emergency');
    e.target.value = '';
  };

  const handleMasivoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFlowType('masivo');
    handleProfileLoad(file, 'masivo');
    e.target.value = '';
  };

  const handleCatalogUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setState(prev => ({ ...prev, loading: true, error: null }));
    try { const catalogData = await processCatalogFile(file); handleUpdateCatalog(catalogData); setState(prev => ({ ...prev, loading: false })); }
    catch (err: any) { setState(prev => ({ ...prev, loading: false, error: err.toString() })); }
  };

  const handleExportSession = () => {
    const sessionData = { profiles: state.profiles, catalog: state.catalog, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `Sesion_Export_${new Date().toISOString().split('T')[0]}.json`; link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSession = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.profiles && data.catalog) {
          setState(prev => ({ ...prev, profiles: data.profiles, catalog: data.catalog }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.catalog));
          setSelectedRuts(new Set());
        }
      } catch { alert("Archivo de sesión inválido."); }
    };
    reader.readAsText(file);
    if (sessionFileInputRef.current) sessionFileInputRef.current.value = '';
  };

  const handleUpdateProfile = (rut: string, updates: Partial<PersonProfile>) => {
    setState(prev => ({ ...prev, profiles: prev.profiles.map(p => p.rut === rut ? { ...p, ...updates } : p) }));
  };

  const handleBulkAction = (action: AnalysisAction | 'Pendiente') => {
    if (selectedRuts.size === 0) return;
    setState(prev => ({ ...prev, profiles: prev.profiles.map(p => {
      if (!selectedRuts.has(p.rut)) return p;
      if (action === 'Pendiente') return { ...p, status: 'Pendiente' as const, selectedAction: '' as AnalysisAction };
      return { ...p, selectedAction: action as AnalysisAction, status: 'Revisado' as const };
    })}));
    setSelectedRuts(new Set());
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({ key, order: prev.key === key ? (prev.order === 'asc' ? 'desc' : (prev.order === 'desc' ? null : 'asc')) : 'asc' }));
  };

  const filteredAndSortedProfiles = useMemo(() => {
    let result = state.profiles.filter(p => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = p.rut.toLowerCase().includes(search) || p.nombre.toLowerCase().includes(search) || p.apellido.toLowerCase().includes(search) || p.customerId.toLowerCase().includes(search);
      const matchesInfo = filterRutsWithInfo ? p.totalCrimes > 0 : true;
      const matchesAction = filterAction === 'All' ? true : (filterAction === 'Pendiente' || filterAction === 'Revisado') ? p.status === filterAction : p.selectedAction === filterAction;
      const matchesRisk = filterRisk === 'All' ? true : p.highestRisk.toLowerCase() === filterRisk.toLowerCase();
      return matchesSearch && matchesInfo && matchesAction && matchesRisk;
    });
    if (sortConfig.key && sortConfig.order) {
      result.sort((a, b) => {
        let valA: any = a[sortConfig.key], valB: any = b[sortConfig.key];
        if (sortConfig.key === 'highestRisk') {
          const w: any = { 'critical':4,'crítico':4,'critico':4,'high':3,'alto':3,'medium':2,'medio':2,'low':1,'bajo':1,'n/a':0 };
          valA = w[valA.toLowerCase()]||0; valB = w[valB.toLowerCase()]||0;
        }
        if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [state.profiles, searchTerm, filterRutsWithInfo, filterAction, filterRisk, sortConfig]);

  const selectedProfile = useMemo(() => state.profiles.find(p => p.rut === state.selectedRut) || null, [state.profiles, state.selectedRut]);
  const currentIndex = useMemo(() => !state.selectedRut ? -1 : filteredAndSortedProfiles.findIndex(p => p.rut === state.selectedRut), [state.selectedRut, filteredAndSortedProfiles]);
  const handleNext = currentIndex >= 0 && currentIndex < filteredAndSortedProfiles.length - 1 ? () => setState(s => ({ ...s, selectedRut: filteredAndSortedProfiles[currentIndex + 1].rut })) : undefined;
  const handlePrev = currentIndex > 0 ? () => setState(s => ({ ...s, selectedRut: filteredAndSortedProfiles[currentIndex - 1].rut })) : undefined;

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 opacity-30" />;
    return sortConfig.order === 'asc' ? <ChevronUp size={12} className="ml-1 text-indigo-400" /> : <ChevronDown size={12} className="ml-1 text-indigo-400" />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-indigo-950 text-slate-900 dark:text-white py-4 px-6 sticky top-0 z-40 shadow-xl border-b border-slate-200 dark:border-indigo-900">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-slate-100 dark:bg-indigo-900/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-indigo-800 hover:border-indigo-400">
              <ArrowLeft size={16} /> Inicio
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl border border-indigo-200 dark:border-indigo-500/30">
                <ShieldAlert size={26} className="text-indigo-600 dark:text-indigo-300" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight leading-none mb-1 text-slate-900 dark:text-white">CriminalProfile AI</h1>
                <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-[0.2em]">Agrupador de Registros Judiciales</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={onToggleDarkMode}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-indigo-900/50 border border-slate-200 dark:border-indigo-800 text-slate-600 dark:text-indigo-300 hover:bg-slate-200 dark:hover:bg-indigo-800 transition-colors"
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="flex bg-slate-100 dark:bg-indigo-900/50 p-1 rounded-xl mr-2 border border-slate-200 dark:border-indigo-800">
              <button onClick={handleExportSession} title="Exportar Sesión" className="p-2.5 text-slate-500 dark:text-indigo-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-indigo-800 rounded-lg transition-all"><Share2 size={18} /></button>
              <input type="file" accept=".json" ref={sessionFileInputRef} onChange={handleImportSession} className="hidden" />
              <button onClick={() => sessionFileInputRef.current?.click()} title="Importar Sesión" className="p-2.5 text-slate-500 dark:text-indigo-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-indigo-800 rounded-lg transition-all"><FolderInput size={18} /></button>
            </div>
            <button
              onClick={() => setState(s => ({ ...s, view: 'triage' }))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all bg-slate-100 dark:bg-indigo-800 text-slate-700 dark:text-indigo-100 border-slate-200 dark:border-indigo-700 hover:bg-amber-100 dark:hover:bg-amber-900 hover:text-amber-700 dark:hover:text-amber-300 hover:border-amber-300"
              title="Modo Triage"
            >
              <Zap size={16} /> Triage
            </button>
            <button
              onClick={() => setState(s => ({ ...s, view: 'comparison' }))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all bg-slate-100 dark:bg-indigo-800 text-slate-700 dark:text-indigo-100 border-slate-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-700 hover:border-indigo-400"
              title="Comparar Períodos"
            >
              <GitCompare size={16} /> Comparar
            </button>
            <button
              onClick={() => setState(s => ({ ...s, view: s.view === 'catalog' ? 'dashboard' : 'catalog' }))}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${state.view === 'catalog' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl' : 'bg-slate-100 dark:bg-indigo-800 text-slate-700 dark:text-indigo-100 border-slate-200 dark:border-indigo-700 hover:bg-slate-200 dark:hover:bg-indigo-700'}`}
            >
              {state.view === 'catalog' ? <><LayoutDashboard size={16} /> Dashboard</> : <><BookOpen size={16} /> Catálogo</>}
            </button>
            {/* Hidden file inputs */}
            <input type="file" accept=".xlsx,.xls,.csv" ref={emergencyFileRef} onChange={handleEmergencyUpload} className="hidden" />
            <input type="file" accept=".xlsx,.xls,.csv" ref={masivoFileRef} onChange={handleMasivoUpload} className="hidden" />
            {/* Flow selector */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-indigo-900/50 p-1 rounded-xl border border-slate-200 dark:border-indigo-800">
              <button
                onClick={() => setFlowType('emergency')}
                title="Flujo de Emergencia — planilla interna"
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${flowType === 'emergency' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
              >⚡ Emergencia</button>
              <button
                onClick={() => setFlowType('masivo')}
                title="Flujo Masivo — planilla Regcheq"
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${flowType === 'masivo' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
              >📊 Masivo</button>
            </div>
            <button
              onClick={() => flowType === 'masivo' ? masivoFileRef.current?.click() : emergencyFileRef.current?.click()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl transition-all shadow-lg text-xs font-black uppercase tracking-widest border border-indigo-500 active:scale-95 text-white"
            >
              <Database size={16} /> Cargar Clientes
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      {state.view === 'comparison' && (
        <ComparisonView onBack={() => setState(s => ({ ...s, view: 'dashboard' }))} />
      )}
      {state.view === 'triage' && (
        <TriageView
          profiles={state.profiles}
          onUpdateProfile={handleUpdateProfile}
          onBack={() => setState(s => ({ ...s, view: 'dashboard' }))}
        />
      )}
      <main className={`flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8 ${state.view === 'comparison' || state.view === 'triage' ? 'hidden' : ''}`}>
        {state.view === 'catalog' ? (
          state.catalog ? (
            <CatalogManager catalog={state.catalog} onUpdate={handleUpdateCatalog} onReset={handleResetCatalog} />
          ) : (
            <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 border-dashed">
              <div className="w-20 h-20 bg-slate-100 dark:bg-indigo-950 rounded-full flex items-center justify-center mb-6"><BookOpen className="text-indigo-500 dark:text-indigo-400" size={32} /></div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Carga tu Matriz de Decisión</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 font-medium">Sube tu Excel con "Catalogo_Delitos", "Parametros" y "Tabla_Decision".</p>
              <label className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-[0.1em] hover:bg-indigo-700 transition-all shadow-xl cursor-pointer flex items-center gap-3 active:scale-95">
                <Upload size={20} /> Seleccionar Catálogo
                <input type="file" accept=".xlsx,.xls" onChange={handleCatalogUpload} className="hidden" />
              </label>
            </div>
          )
        ) : (
          <>
            {state.catalog && (
              <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-6 py-4 rounded-2xl flex items-center gap-3">
                <CheckCircle size={18} /><span className="text-xs font-black uppercase tracking-widest">Motor de Decisión Activo — {state.catalog.items.length} delitos · {state.catalog.decisionTable.length} reglas</span>
              </div>
            )}
            {state.error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-6 py-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="shrink-0 mt-0.5" /><p className="font-bold text-sm">{state.error}</p>
              </div>
            )}
            {state.loading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <div className="w-14 h-14 border-[5px] border-slate-200 dark:border-slate-700 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-slate-500 dark:text-slate-400 font-black animate-pulse tracking-[0.3em] uppercase text-[10px]">Procesando registros...</p>
              </div>
            ) : state.profiles.length > 0 ? (
              <>
                <CriminalDashboard profiles={state.profiles} />
                {selectedRuts.size > 0 && (
                  <div className="bg-indigo-600 p-4 rounded-3xl shadow-2xl shadow-indigo-950 border border-indigo-500 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="bg-white/20 p-2.5 rounded-2xl"><CheckSquare className="text-white" size={20} /></div>
                      <div><h4 className="text-white font-black text-xs uppercase tracking-widest">{selectedRuts.size} Registros seleccionados</h4></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => handleBulkAction('Liberar')} className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">Liberar</button>
                      <button onClick={() => handleBulkAction('Revisar')} className="bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">Revisar</button>
                      <button onClick={() => handleBulkAction('Liberar + UCR')} className="bg-indigo-400 hover:bg-indigo-300 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">Lib + UCR</button>
                      <button onClick={() => handleBulkAction('Fully Blocked')} className="bg-red-500 hover:bg-red-400 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">Blocked</button>
                      <button onClick={() => handleBulkAction('Pendiente')} className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"><RotateCcw size={14} /></button>
                      <button onClick={() => setSelectedRuts(new Set())} className="bg-indigo-800 text-indigo-300 hover:text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[850px]">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 space-y-4 shrink-0">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                      <div className="flex items-center gap-4">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-[0.2em]"><FileSpreadsheet size={18} className="text-indigo-500" /> Agrupamiento Consolidado</h3>
                        <button onClick={() => exportToExcel(state.profiles)} className="flex items-center gap-2 bg-emerald-600 dark:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 dark:hover:bg-emerald-600 transition-all"><Download size={12} /> Exportar</button>
                      </div>
                      <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                        <input type="text" placeholder="Buscar por RUT o Nombre..." className="pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-[11px] font-black uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        <Filter size={12} className="text-slate-400" />
                        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="text-[9px] bg-transparent font-black uppercase focus:outline-none text-slate-600 dark:text-slate-300">
                          <option value="All">Estado</option><option value="Pendiente">Pendiente</option><option value="Revisado">Revisado</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        <Layers size={12} className="text-slate-400" />
                        <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="text-[9px] bg-transparent font-black uppercase focus:outline-none text-slate-600 dark:text-slate-300">
                          <option value="All">Riesgo</option><option value="critical">Crítico</option><option value="high">Alto</option><option value="medium">Medio</option><option value="low">Bajo</option>
                        </select>
                      </div>
                      <button onClick={() => setFilterRutsWithInfo(!filterRutsWithInfo)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${filterRutsWithInfo ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>Solo con Antecedentes</button>
                    </div>
                  </div>
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-20 bg-white dark:bg-slate-900">
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <th className="px-6 py-4 w-10"><button onClick={() => setSelectedRuts(selectedRuts.size === filteredAndSortedProfiles.length ? new Set() : new Set(filteredAndSortedProfiles.map(p => p.rut)))} className="text-slate-400 dark:text-slate-500">{selectedRuts.size === filteredAndSortedProfiles.length && filteredAndSortedProfiles.length > 0 ? <CheckSquare size={20} className="text-indigo-500" /> : <Square size={20} />}</button></th>
                          {([['nombre','Identidad'],['totalCrimes','Delitos'],['totalHighRiskCrimes','Alto Riesgo'],['status','Pre-Sugerencia'],['highestRisk','Riesgo Máx']] as [SortKey, string][]).map(([key,label]) => (
                            <th key={key} className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] cursor-pointer" onClick={() => handleSort(key)}>
                              <div className="flex items-center">{label}<SortIcon column={key} /></div>
                            </th>
                          ))}
                          <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Acción Final</th>
                          <th className="px-6 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] text-right">Ficha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {filteredAndSortedProfiles.map((p) => (
                          <tr key={p.rut} className={`hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors ${selectedRuts.has(p.rut) ? 'bg-indigo-50 dark:bg-indigo-950/60' : ''}`}>
                            <td className="px-6 py-4"><button onClick={() => { const n = new Set(selectedRuts); n.has(p.rut) ? n.delete(p.rut) : n.add(p.rut); setSelectedRuts(n); }}>{selectedRuts.has(p.rut) ? <CheckSquare size={20} className="text-indigo-500" /> : <Square size={20} className="text-slate-300 dark:text-slate-600" />}</button></td>
                            <td className="px-6 py-4"><div className="flex flex-col"><span className="text-xs font-black text-slate-900 dark:text-white uppercase leading-none mb-1">{p.nombre} {p.apellido}</span><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">ID: {p.rut}</span></div></td>
                            <td className="px-6 py-4 text-center"><span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-lg text-[10px] font-black ${p.totalCrimes > 0 ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>{p.totalCrimes}</span></td>
                            <td className="px-6 py-4 text-center"><span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-lg text-[10px] font-black ${p.totalHighRiskCrimes > 0 ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>{p.totalHighRiskCrimes}</span></td>
                            <td className="px-6 py-4"><span className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase border ${p.preEvaluation?.decision.toLowerCase().includes('liber') ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : p.preEvaluation?.decision.toLowerCase().includes('block') ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>{p.preEvaluation?.decision || 'Sin Evaluación'}</span></td>
                            <td className="px-6 py-4"><span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${p.highestRisk.toLowerCase().includes('critical')||p.highestRisk.toLowerCase().includes('crítico') ? 'bg-red-600 text-white border-red-700' : p.highestRisk.toLowerCase().includes('high')||p.highestRisk.toLowerCase().includes('alto') ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}>{p.highestRisk}</span></td>
                            <td className="px-6 py-4">
                              {p.selectedAction ? (
                                <span className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase border ${
                                  p.selectedAction === 'Liberar' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' :
                                  p.selectedAction === 'Fully Blocked' ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' :
                                  p.selectedAction === 'Liberar + UCR' ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' :
                                  'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                }`}>{p.selectedAction}</span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 text-sm font-black">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right"><button onClick={() => setState(s => ({ ...s, selectedRut: p.rut }))} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-[9px] px-4 py-2 rounded-xl hover:bg-indigo-600 hover:text-white transition-all uppercase tracking-widest border border-slate-200 dark:border-slate-700 active:scale-95">Analizar <ChevronRight size={12} className="inline ml-1" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-16 px-4">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Selecciona el Flujo de Carga</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-lg mb-10 text-center leading-relaxed font-medium">
                  El catálogo de decisiones ya está activo. Elige cómo quieres cargar los registros a analizar.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                  {/* Flujo de Emergencia */}
                  <label className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-xl cursor-pointer transition-all group p-8 flex flex-col items-center gap-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-2xl border border-amber-200 dark:border-amber-800">
                      <Zap size={32} className="text-amber-500" />
                    </div>
                    <div className="text-center">
                      <h4 className="font-black text-slate-900 dark:text-white uppercase text-sm mb-2">⚡ Flujo de Emergencia</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                        Planilla interna con formato propio: columna DNI + columnas dinámicas de delitos (crimen_N, estado_N, riesgo_N…).
                      </p>
                    </div>
                    <span className="bg-amber-500 group-hover:bg-amber-400 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all w-full text-center">
                      Seleccionar Archivo
                    </span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleEmergencyUpload} className="hidden" />
                  </label>

                  {/* Flujo Masivo */}
                  <label className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-xl cursor-pointer transition-all group p-8 flex flex-col items-center gap-4">
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl border border-indigo-200 dark:border-indigo-800">
                      <FileSpreadsheet size={32} className="text-indigo-500" />
                    </div>
                    <div className="text-center">
                      <h4 className="font-black text-slate-900 dark:text-white uppercase text-sm mb-2">📊 Flujo Masivo</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                        Planilla Regcheq con hojas "Causas Penales Chile" y "Coincidencias". Detecta PEP automáticamente desde la columna H.
                      </p>
                    </div>
                    <span className="bg-indigo-600 group-hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all w-full text-center">
                      Seleccionar Archivo
                    </span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleMasivoUpload} className="hidden" />
                  </label>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {selectedProfile && (
        <ProfileDetails
          profile={selectedProfile}
          onClose={() => setState(s => ({ ...s, selectedRut: null }))}
          onUpdate={handleUpdateProfile}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
      <footer className="bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-900 py-6 px-6 text-center mt-auto">
        <p className="text-[10px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-[0.4em]">CriminalProfile AI &bull; Compliance Team &copy; 2026</p>
      </footer>
    </div>
  );
};
