
import React, { useState, useRef } from 'react';
import { CatalogData, CatalogItem, DecisionRule } from '../../types/criminalTypes';
import { processCatalogFile } from '../../services/criminalDataProcessor';
import { BookOpen, Plus, Trash2, Save, X, Settings2, Gavel, AlertCircle, Hash, Info, FileUp, Download, Edit3, RotateCcw } from 'lucide-react';

interface CatalogManagerProps {
  catalog: CatalogData;
  onUpdate: (newCatalog: CatalogData) => void;
  onReset?: () => void;
  readOnly?: boolean;   // catálogo maestro fijo → solo lectura para el analista
}

type TabType = 'delicts' | 'params' | 'decision';

export const CatalogManager: React.FC<CatalogManagerProps> = ({ catalog, onUpdate, onReset, readOnly = false }) => {
  const [activeTab, setActiveTab] = useState<TabType>('delicts');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States locales derivados de props
  const delicts = catalog.items || [];
  const [editDelictIdx, setEditDelictIdx] = useState<number | null>(null);
  const [delictForm, setDelictForm] = useState<CatalogItem | null>(null);

  const params = catalog.parameters || {};
  const [editParamKey, setEditParamKey] = useState<string | null>(null);
  const [editParamValue, setEditParamValue] = useState<string>('');
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamValue, setNewParamValue] = useState('');

  const decisions = catalog.decisionTable || [];
  const [editDecisionIdx, setEditDecisionIdx] = useState<number | null>(null);
  const [decisionForm, setDecisionForm] = useState<DecisionRule | null>(null);

  // --- Handlers para Importación de Excel ---
  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const importedData = await processCatalogFile(file);
      const mergedCatalog = { ...catalog };
      
      if (importedData.items.length > 0) mergedCatalog.items = importedData.items;
      if (Object.keys(importedData.parameters).length > 0) mergedCatalog.parameters = importedData.parameters;
      if (importedData.decisionTable.length > 0) mergedCatalog.decisionTable = importedData.decisionTable;

      onUpdate(mergedCatalog);
    } catch (err) {
      console.error("Error al importar Excel:", err);
      alert("Error al procesar el archivo Excel. Asegúrese de que las hojas tengan los nombres correctos (Catalogo_Delitos, Parametros, Tabla_Decision).");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Handlers para Delitos ---
  const saveDelict = () => {
    if (editDelictIdx !== null && delictForm) {
      const newItems = [...delicts];
      newItems[editDelictIdx] = delictForm;
      onUpdate({ ...catalog, items: newItems });
      setEditDelictIdx(null);
    }
  };

  const addDelict = () => {
    const newItem: CatalogItem = { nombre: 'nuevo delito', riesgoG66: 'BAJO', valor: 0, tipo: 'GENERAL' };
    const newItems = [newItem, ...delicts];
    onUpdate({ ...catalog, items: newItems });
    setEditDelictIdx(0);
    setDelictForm(newItem);
  };

  const deleteDelict = (idx: number) => {
    if (confirm('¿Eliminar registro de delito?')) {
      const newItems = delicts.filter((_, i) => i !== idx);
      onUpdate({ ...catalog, items: newItems });
    }
  };

  // --- Handlers para Parámetros ---
  const addParam = () => {
    if (!newParamKey) return;
    const newParams = { ...params, [newParamKey]: newParamValue };
    onUpdate({ ...catalog, parameters: newParams });
    setNewParamKey('');
    setNewParamValue('');
  };

  const saveParamEdit = (key: string) => {
    const newParams = { ...params, [key]: editParamValue };
    onUpdate({ ...catalog, parameters: newParams });
    setEditParamKey(null);
  };

  const removeParam = (key: string) => {
    if (confirm(`¿Eliminar parámetro "${key}"?`)) {
      const newParams = { ...params };
      delete newParams[key];
      onUpdate({ ...catalog, parameters: newParams });
    }
  };

  // --- Handlers para Tabla Decisión ---
  const saveDecision = () => {
    if (editDecisionIdx !== null && decisionForm) {
      const newTable = [...decisions];
      newTable[editDecisionIdx] = decisionForm;
      onUpdate({ ...catalog, decisionTable: newTable });
      setEditDecisionIdx(null);
    }
  };

  const addDecision = () => {
    const newRule: DecisionRule = { 
      precedentesCount: 0, noPrecedentesCount: 0, preEquivalente: 0, 
      noPreEquivalente: 0, totalEquivalente: 0, decision: 'Revisar', razon: 'Nueva regla' 
    };
    const newTable = [newRule, ...decisions];
    onUpdate({ ...catalog, decisionTable: newTable });
    setEditDecisionIdx(0);
    setDecisionForm(newRule);
  };

  const deleteDecision = (idx: number) => {
    if (confirm('¿Eliminar regla de decisión?')) {
      const newTable = decisions.filter((_, i) => i !== idx);
      onUpdate({ ...catalog, decisionTable: newTable });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      {/* Header & Tabs */}
      <div className="bg-slate-900 text-white p-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500 rounded-2xl shadow-lg shadow-indigo-500/20">
              <Settings2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Suite de Inteligencia</h2>
              <p className="text-xs text-indigo-300 font-bold uppercase tracking-widest">Motor de Decisión Configurable</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
            <button
              onClick={() => setActiveTab('delicts')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'delicts' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <BookOpen size={16} /> Catálogo
            </button>
            <button
              onClick={() => setActiveTab('params')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'params' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Hash size={16} /> Parámetros
            </button>
            <button
              onClick={() => setActiveTab('decision')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'decision' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Gavel size={16} /> Tabla Decisión
            </button>
          </div>
        </div>
      </div>

      <div className="p-8">
        {readOnly && (
          <div className="mb-8 p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-2xl flex items-center gap-3">
            <Info size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-tight">
              Catálogo maestro — solo lectura. Es fijo para todos los usuarios; se actualiza únicamente desde el repositorio.
            </p>
          </div>
        )}
        {/* Herramientas de Carga Excel */}
        {!readOnly && (
        <div className="mb-8 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-indigo-600 dark:text-indigo-400">
              <FileUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Importación de Matriz</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Cargar tablas desde archivo Excel (.xlsx)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" ref={fileInputRef} onChange={handleExcelImport} className="hidden" accept=".xlsx, .xls" />
            {onReset && (
              <button
                onClick={onReset}
                className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-all flex items-center gap-2"
                title="Restaurar catálogo predeterminado"
              >
                <RotateCcw size={14} /> Restaurar defecto
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-600 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? 'Procesando...' : <><Download size={14} className="rotate-180" /> Seleccionar Archivo Excel</>}
            </button>
          </div>
        </div>
        )}

        {/* TAB 1: CATÁLOGO DE DELITOS */}
        {activeTab === 'delicts' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Matriz de Pesos Criminales</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">Define el puntaje individual por tipo de delito</p>
              </div>
              {!readOnly && (
              <button onClick={addDelict} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100">
                <Plus size={16} /> Nuevo Delito
              </button>
              )}
            </div>

            <div className="border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Delito</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Riesgo G66</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Valor</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {delicts.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-300 dark:text-slate-600 font-bold uppercase text-xs tracking-widest">Sin datos en el catálogo</td></tr>
                  ) : delicts.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4">
                        {editDelictIdx === idx ? (
                          <input className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={delictForm?.nombre} onChange={e => setDelictForm(p => p ? {...p, nombre: e.target.value.toLowerCase()} : null)} />
                        ) : <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{item.nombre}</span>}
                      </td>
                      <td className="px-6 py-4">
                        {editDelictIdx === idx ? (
                          <input className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold" value={delictForm?.tipo} onChange={e => setDelictForm(p => p ? {...p, tipo: e.target.value.toUpperCase()} : null)} />
                        ) : <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md uppercase">{item.tipo}</span>}
                      </td>
                      <td className="px-6 py-4">
                        {editDelictIdx === idx ? (
                          <select className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold" value={delictForm?.riesgoG66} onChange={e => setDelictForm(p => p ? {...p, riesgoG66: e.target.value} : null)}>
                            <option value="CRITICO">CRITICO</option><option value="ALTO">ALTO</option><option value="MEDIO">MEDIO</option><option value="BAJO">BAJO</option>
                          </select>
                        ) : <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">{item.riesgoG66}</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {editDelictIdx === idx ? (
                          <input type="number" className="w-20 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={delictForm?.valor} onChange={e => setDelictForm(p => p ? {...p, valor: parseFloat(e.target.value)} : null)} />
                        ) : <span className="text-xs font-black text-indigo-700 dark:text-indigo-400">{item.valor}</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {editDelictIdx === idx ? (
                            <><button onClick={saveDelict} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"><Save size={16} /></button><button onClick={() => setEditDelictIdx(null)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={16} /></button></>
                          ) : (!readOnly && (
                            <><button onClick={() => { setEditDelictIdx(idx); setDelictForm({...item}); }} className="p-2 text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg"><Edit3 size={16} /></button><button onClick={() => deleteDelict(idx)} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"><Trash2 size={16} /></button></>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PARÁMETROS */}
        {activeTab === 'params' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Tabla de Parámetros Globales</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">Variables de configuración del motor de riesgos</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Formulario de Adición */}
              {!readOnly && (
              <div className="xl:col-span-1 bg-slate-50 dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 h-fit shadow-sm">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Plus size={14} /> Añadir Parámetro</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1 ml-1">Clave de Variable</label>
                    <input type="text" placeholder="Ej: score_ucr_limite" className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm placeholder-slate-400" value={newParamKey} onChange={e => setNewParamKey(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1 ml-1">Valor</label>
                    <input type="text" placeholder="Ej: 15.5" className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm placeholder-slate-400" value={newParamValue} onChange={e => setNewParamValue(e.target.value)} />
                  </div>
                  <button onClick={addParam} disabled={!newParamKey} className="w-full bg-indigo-600 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">Guardar Variable</button>
                </div>
              </div>
              )}

              {/* Tabla de Parámetros */}
              <div className="xl:col-span-2 border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-800">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Parámetro</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Valor Actual</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {Object.entries(params).length === 0 ? (
                      <tr><td colSpan={3} className="py-24 text-center text-slate-300 dark:text-slate-600">
                        <Hash size={48} className="mx-auto mb-4 opacity-10" />
                        <p className="text-xs font-black uppercase tracking-widest">No hay parámetros cargados</p>
                      </td></tr>
                    ) : Object.entries(params).map(([key, val]) => (
                      <tr key={key} className="hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{key}</span>
                        </td>
                        <td className="px-6 py-4">
                          {editParamKey === key ? (
                            <input
                              autoFocus
                              className="bg-white dark:bg-slate-700 border border-indigo-200 dark:border-indigo-700 text-slate-800 dark:text-white rounded-lg px-3 py-1 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-full shadow-inner"
                              value={editParamValue}
                              onChange={e => setEditParamValue(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveParamEdit(key)}
                            />
                          ) : <span className="text-sm font-black text-slate-800 dark:text-slate-200">{String(val)}</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {editParamKey === key ? (
                              <><button onClick={() => saveParamEdit(key)} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"><Save size={16} /></button><button onClick={() => setEditParamKey(null)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={16} /></button></>
                            ) : (!readOnly && (
                              <><button onClick={() => { setEditParamKey(key); setEditParamValue(String(val)); }} className="p-2 text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Edit3 size={16} /></button><button onClick={() => removeParam(key)} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button></>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TABLA DE DECISIÓN */}
        {activeTab === 'decision' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Matriz de Umbrales de Decisión</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">Asigna acciones automáticas basadas en el score total acumulado</p>
              </div>
              {!readOnly && (
              <button onClick={addDecision} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100">
                <Plus size={16} /> Nueva Regla
              </button>
              )}
            </div>

            <div className="border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-emerald-50/50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900">
                  <tr>
                    <th className="px-6 py-4 text-[9px] font-black text-emerald-600/60 dark:text-emerald-500/60 uppercase tracking-widest">Score Mínimo</th>
                    <th className="px-6 py-4 text-[9px] font-black text-emerald-600/60 dark:text-emerald-500/60 uppercase tracking-widest">Recomendación</th>
                    <th className="px-6 py-4 text-[9px] font-black text-emerald-600/60 dark:text-emerald-500/60 uppercase tracking-widest">Razón / Justificación</th>
                    <th className="px-6 py-4 text-[9px] font-black text-emerald-600/60 dark:text-emerald-500/60 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {decisions.length === 0 ? (
                    <tr><td colSpan={4} className="py-12 text-center text-slate-300 dark:text-slate-600 font-bold uppercase text-xs tracking-widest">Sin reglas de decisión definidas</td></tr>
                  ) : decisions.map((rule, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 transition-colors">
                      <td className="px-6 py-4">
                        {editDecisionIdx === idx ? (
                          <input type="number" className="w-24 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={decisionForm?.totalEquivalente} onChange={e => setDecisionForm(p => p ? {...p, totalEquivalente: parseFloat(e.target.value)} : null)} />
                        ) : <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">{rule.totalEquivalente} pts</span>}
                      </td>
                      <td className="px-6 py-4">
                        {editDecisionIdx === idx ? (
                          <select className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold" value={decisionForm?.decision} onChange={e => setDecisionForm(p => p ? {...p, decision: e.target.value} : null)}>
                            <option value="Liberar">Liberar</option><option value="Revisar">Revisar</option><option value="Liberar + UCR">Liberar + UCR</option><option value="Fully Blocked">Fully Blocked</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            rule.decision.toLowerCase().includes('liber') ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' :
                            rule.decision.toLowerCase().includes('block') ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                          }`}>
                            {rule.decision}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editDecisionIdx === idx ? (
                          <input className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white rounded-lg px-3 py-1.5 text-xs font-bold" value={decisionForm?.razon} onChange={e => setDecisionForm(p => p ? {...p, razon: e.target.value} : null)} />
                        ) : <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">{rule.razon}</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {editDecisionIdx === idx ? (
                            <><button onClick={saveDecision} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"><Save size={16} /></button><button onClick={() => setEditDecisionIdx(null)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={16} /></button></>
                          ) : (!readOnly && (
                            <><button onClick={() => { setEditDecisionIdx(idx); setDecisionForm({...rule}); }} className="p-2 text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"><Edit3 size={16} /></button><button onClick={() => deleteDecision(idx)} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"><Trash2 size={16} /></button></>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-2xl flex items-start gap-3 border border-indigo-100 dark:border-indigo-900">
              <Info size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold leading-relaxed uppercase tracking-tight">
                El motor evalúa las reglas de forma descendente. El sistema aplica la primera regla donde el score del cliente sea mayor o igual al "Score Mínimo". Asegúrese de ordenar sus reglas por score de mayor a menor.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle size={18} className="text-amber-500" />
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Los cambios se guardan automáticamente.</p>
        </div>
        <div className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">CriminalProfile Intelligence Suite v3.0</div>
      </div>
    </div>
  );
};
