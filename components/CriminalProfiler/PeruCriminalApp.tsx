// PERÚ — sección del Criminal Profile. SOLO PEP: Perú no tiene catálogo de
// delitos ni motor de decisión. Se carga el resultado del masivo de Perú de
// Regcheq (subiéndolo o con «Enviar al Criminal Profile») y la revisión es
// manual, con acción, estado y notas, igual que Colombia.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeft, Sun, Moon, FileSpreadsheet, Download, Search, X, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, ArrowUpDown, AlertTriangle } from 'lucide-react';
import type { AnalysisAction } from '../../types/criminalTypes';
import { parsePeruMasivo, otrasListas, tieneSancion, rangoNivel, rangoRiesgo, pasaFiltros, type PeruProfile } from '../../services/peruCriminalParser';
import { generatePeruProfilePdf } from '../../services/pdfGenerator';

interface Props {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  /** El archivo que llega desde el botón de un masivo. Se carga una vez. */
  archivoInicial?: File | null;
}

type SortKey = 'nombre' | 'dni' | 'riesgoFinal' | 'nivelPep' | 'totalCoincidencias' | 'accion' | 'estado';
type SortOrder = 'asc' | 'desc' | null;

const ACCIONES: AnalysisAction[] = ['Liberar', 'Revisar', 'Liberar + UCR', 'Fully Blocked'];
const ACC_STYLE: Record<string, string> = {
  'Liberar': 'text-emerald-700 dark:text-emerald-400',
  'Revisar': 'text-amber-700 dark:text-amber-400',
  'Liberar + UCR': 'text-blue-700 dark:text-blue-400',
  'Fully Blocked': 'text-red-700 dark:text-red-400',
};
const RIESGO_STYLE = (r: string) => {
  const n = rangoRiesgo(r);
  return n === 3 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : n === 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    : n === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
};
const SELECT = 'px-3 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100';

const SortTh: React.FC<{ label: string; k: SortKey; sort: { key: SortKey; order: SortOrder }; onSort: (k: SortKey) => void; center?: boolean }> = ({ label, k, sort, onSort, center }) => (
  <th onClick={() => onSort(k)} className={`px-4 py-3 font-bold cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 ${center ? 'text-center' : ''}`}>
    <span className={`inline-flex items-center gap-1 ${center ? 'justify-center' : ''}`}>
      {label}
      {sort.key !== k || !sort.order ? <ArrowUpDown size={12} className="opacity-40" /> : sort.order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </span>
  </th>
);

export const PeruCriminalApp: React.FC<Props> = ({ onBack, darkMode, onToggleDarkMode, archivoInicial }) => {
  const [perfiles, setPerfiles] = useState<PeruProfile[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [fTipo, setFTipo] = useState('Todos');
  const [fNivel, setFNivel] = useState('Todos');
  const [fRiesgo, setFRiesgo] = useState('Todos');
  const [fOtras, setFOtras] = useState('Todas');
  const [fEstado, setFEstado] = useState('Todos');
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({ key: 'nombre', order: null });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const cargadoInicial = useRef(false);

  const cargar = async (file: File) => {
    setCargando(true); setError(null);
    try {
      const r = await parsePeruMasivo(file);
      setPerfiles(r.perfiles);
      setAvisos(r.avisos);
      setChecked(new Set());
      if (r.perfiles.length === 0) setError('El archivo no trae registros con DNI válido.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setCargando(false); }
  };

  // El archivo del botón «Enviar al Criminal Profile»: misma ruta que subirlo.
  useEffect(() => {
    if (archivoInicial && !cargadoInicial.current) { cargadoInicial.current = true; cargar(archivoInicial); }
  }, [archivoInicial]);

  const update = (dni: string, patch: Partial<PeruProfile>) => setPerfiles(prev => prev.map(p => p.dni === dni ? { ...p, ...patch } : p));
  const setAccion = (dni: string, accion: AnalysisAction) => update(dni, { accion, estado: accion ? 'Revisado' : 'Pendiente' });
  const toggleSort = (key: SortKey) => setSort(s => s.key !== key ? { key, order: 'asc' } : { key, order: s.order === 'asc' ? 'desc' : s.order === 'desc' ? null : 'asc' });

  const niveles = useMemo(() => [...new Set(perfiles.map(p => p.nivelPep).filter(Boolean))].sort((a, b) => rangoNivel(b) - rangoNivel(a)), [perfiles]);
  const listasOtras = useMemo(() => [...new Set(perfiles.flatMap(otrasListas))].sort(), [perfiles]);

  const contadores = useMemo(() => ({
    total: perfiles.length,
    pep: perfiles.filter(p => p.esPep).length,
    familiar: perfiles.filter(p => p.familiarDePep).length,
    funcionario: perfiles.filter(p => p.funcionarioPublico).length,
    high: perfiles.filter(p => rangoRiesgo(p.riesgoFinal) === 3).length,
    screening: perfiles.filter(p => p.listasConCoincidencia.includes('Screening Global')).length,
    revisados: perfiles.filter(p => p.estado === 'Revisado').length,
  }), [perfiles]);

  const filtrados = useMemo(() => {
    // La lógica vive en el parser (pasaFiltros), pura y testeada.
    const filtros = { busqueda, tipo: fTipo, nivel: fNivel, riesgo: fRiesgo, otras: fOtras, estado: fEstado };
    const lista = perfiles.filter(p => pasaFiltros(p, filtros));
    if (!sort.order) return lista;
    const dir = sort.order === 'asc' ? 1 : -1;
    const val = (p: PeruProfile): string | number =>
      sort.key === 'riesgoFinal' ? rangoRiesgo(p.riesgoFinal)
      : sort.key === 'nivelPep' ? rangoNivel(p.nivelPep)
      : sort.key === 'totalCoincidencias' ? p.totalCoincidencias
      : String(p[sort.key] ?? '');
    return [...lista].sort((a, b) => {
      const av = val(a), bv = val(b);
      return typeof av === 'number' && typeof bv === 'number' ? (av - bv) * dir : String(av).localeCompare(String(bv), 'es') * dir;
    });
  }, [perfiles, busqueda, fTipo, fNivel, fRiesgo, fOtras, fEstado, sort]);

  const sel = perfiles.find(p => p.dni === seleccionado) ?? null;
  const idx = sel ? filtrados.findIndex(p => p.dni === sel.dni) : -1;
  const goPrev = idx > 0 ? () => setSeleccionado(filtrados[idx - 1].dni) : undefined;
  const goNext = idx >= 0 && idx < filtrados.length - 1 ? () => setSeleccionado(filtrados[idx + 1].dni) : undefined;

  const todosMarcados = filtrados.length > 0 && filtrados.every(p => checked.has(p.dni));
  const toggleCheck = (dni: string) => setChecked(s => { const n = new Set(s); n.has(dni) ? n.delete(dni) : n.add(dni); return n; });
  const toggleTodos = () => setChecked(todosMarcados ? new Set() : new Set(filtrados.map(p => p.dni)));
  const accionMasiva = (accion: AnalysisAction) => {
    setPerfiles(prev => prev.map(p => checked.has(p.dni) ? { ...p, accion, estado: accion ? 'Revisado' : 'Pendiente' } : p));
    setChecked(new Set());
  };

  const exportar = () => {
    if (perfiles.length === 0) return;
    const filas = perfiles.map(p => ({
      dni: p.dni, nombre: p.nombre, riesgo_final: p.riesgoFinal,
      es_pep: p.esPep ? 'Sí' : 'No', familiar_de_pep: p.familiarDePep ? 'Sí' : 'No',
      funcionario_publico: p.funcionarioPublico ? 'Sí' : 'No', nivel_pep: p.nivelPep,
      total_coincidencias: p.totalCoincidencias, listas_con_coincidencia: p.listasConCoincidencia.join('; '),
      alertas_validacion: p.alertasValidacion, filas_fusionadas: p.filasFusionadas,
      accion_manual: p.accion || 'Pendiente', estado: p.estado, notas: p.notas,
    }));
    const detalle = perfiles.flatMap(p => [
      ...p.pep.map(c => ({ dni: p.dni, nombre: p.nombre, tipo: 'PEP', lista: c.lista, origen: c.origen, conclusion: c.conclusion, porcentaje: c.porcentaje ?? '', cargo: c.cargo, entidad: c.entidad, inicio_cargo: c.fechaInicio, fin_cargo: c.fechaFin, fuente: c.fuente, res_nombramiento: c.resolucionNombramiento, res_retiro: c.resolucionRetiro, actualizado: c.actualizado, detalle: c.detalle })),
      ...p.funcionario.map(c => ({ dni: p.dni, nombre: p.nombre, tipo: 'Funcionario público', cargo: c.cargo, entidad: c.entidad, porcentaje: c.porcentaje ?? '', actualizado: c.actualizado, detalle: c.detalle })),
      ...p.familiares.map(f => ({ dni: p.dni, nombre: p.nombre, tipo: 'Familiar de PEP', relacion: f.relacion, pep_vinculado: f.pepVinculado, dni_pep: f.dniPep, cargo_del_pep: f.pepCargo, organismo_del_pep: f.pepOrganismo, estado_pep: f.pepEstado, nivel: f.nivel, base_regulatoria: f.baseRegulatoria, veracidad: f.veracidad, nota_veracidad: f.notaVeracidad, confianza_vinculo: f.confianzaVinculo, riesgo: f.riesgo })),
      ...p.otras.map(o => ({ dni: p.dni, nombre: p.nombre, tipo: o.sancion ? 'SANCIÓN' : 'Otra coincidencia', lista: o.lista, riesgo: o.riesgo, nombre_hit: o.nombre, tipos: o.tipos, tipo_entidad: o.tipoEntidad, score: o.score, estado_match: o.estadoMatch, fuentes: o.fuentes, paises: o.paises, detalle: o.detalle })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Revisión Perú');
    if (detalle.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle');
    const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
    XLSX.writeFile(wb, `revision_peru_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xlsx`);
  };

  const tarjeta = (titulo: string, n: number, clase = '') => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{titulo}</div>
      <div className={`text-2xl font-black ${clase || 'text-slate-900 dark:text-white'}`}>{n}</div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      <header className="bg-white dark:bg-indigo-950 py-4 px-6 sticky top-0 z-40 shadow-xl border-b border-slate-200 dark:border-indigo-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white text-xs font-black uppercase tracking-widest bg-slate-100 dark:bg-indigo-900/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-indigo-800">
              <ArrowLeft size={16} /> País
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white leading-none mb-1">🇵🇪 Perú — Perfiles PEP</h1>
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-[0.2em]">Revisión manual · Regcheq</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {perfiles.length > 0 && (
              <>
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-100 dark:bg-indigo-900/50 border border-slate-200 dark:border-indigo-800 text-slate-600 dark:text-indigo-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-indigo-900">
                  <FileSpreadsheet size={16} /> Cargar otro
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) cargar(f); e.target.value = ''; }} />
                </label>
                <button onClick={exportar} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500">
                  <Download size={16} /> Exportar
                </button>
              </>
            )}
            <button onClick={onToggleDarkMode} className="p-2.5 rounded-xl bg-slate-100 dark:bg-indigo-900/50 border border-slate-200 dark:border-indigo-800 text-slate-600 dark:text-indigo-300">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8">
        {error && <div className="mb-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-5 py-4 text-sm">{error}</div>}
        {avisos.length > 0 && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl px-5 py-3 text-xs space-y-1">
            {avisos.map((a, i) => <div key={i} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{a}</span></div>)}
          </div>
        )}

        {perfiles.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Perú — PEP</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-lg mb-10 text-center font-medium">
              Carga el Excel del <strong>masivo de Perú de Regcheq</strong>, o usa «Enviar al Criminal Profile» desde el masivo. Se agrupan las coincidencias PEP por persona para revisión y decisión manual.
            </p>
            <label className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-slate-700 hover:border-red-400 hover:shadow-xl cursor-pointer transition-all group p-10 flex flex-col items-center gap-4 max-w-md w-full">
              <div className="p-4 bg-red-50 dark:bg-red-950 rounded-2xl border border-red-200 dark:border-red-800"><FileSpreadsheet size={32} className="text-red-500" /></div>
              <div className="text-center">
                <h4 className="font-black text-slate-900 dark:text-white uppercase text-sm mb-2">Cargar resultado del masivo</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Hojas «Resultados Regcheq Perú», «PEP Perú» y, si está, «Otras coincidencias».</p>
              </div>
              <span className="bg-indigo-600 group-hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest w-full text-center">{cargando ? 'Procesando…' : 'Seleccionar Archivo'}</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) cargar(f); e.target.value = ''; }} />
            </label>
          </div>
        ) : (
          <>
            {/* Contadores */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {tarjeta('Personas', contadores.total)}
              {tarjeta('PEP', contadores.pep, 'text-purple-600 dark:text-purple-400')}
              {tarjeta('Familiar de PEP', contadores.familiar, 'text-purple-500 dark:text-purple-300')}
              {tarjeta('Funcionario público', contadores.funcionario, 'text-indigo-600 dark:text-indigo-400')}
              {tarjeta('High Risk', contadores.high, 'text-red-600 dark:text-red-400')}
              {tarjeta('Screening Global', contadores.screening, 'text-amber-600 dark:text-amber-400')}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por DNI o nombre…" className={`w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100`} />
              </div>
              <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={SELECT}>
                <option value="Todos">Todo tipo PEP</option><option value="PEP">PEP</option><option value="Familiar">Familiar de PEP</option><option value="Funcionario">Funcionario público</option><option value="Sin PEP">Sin PEP</option>
              </select>
              <select value={fNivel} onChange={e => setFNivel(e.target.value)} className={SELECT}>
                <option value="Todos">Todo nivel</option>
                {niveles.map(n => <option key={n} value={n}>{/^\d+$/.test(n) ? `Nivel ${n}` : n}</option>)}
                <option value="sin">Sin nivel</option>
              </select>
              <select value={fRiesgo} onChange={e => setFRiesgo(e.target.value)} className={SELECT}>
                <option value="Todos">Todo riesgo final</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
              </select>
              <select value={fOtras} onChange={e => setFOtras(e.target.value)} className={SELECT}>
                <option value="Todas">Otras listas: todas</option><option value="Con otras">Con otras coincidencias</option><option value="Con sanción">Con sanción</option><option value="Sin otras">Sin otras</option>
                {listasOtras.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={fEstado} onChange={e => setFEstado(e.target.value)} className={SELECT}>
                <option value="Todos">Todo estado / acción</option><option value="Pendiente">Pendiente</option><option value="Revisado">Revisado</option>
                {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}<option value="Sin acción">Sin acción</option>
              </select>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{contadores.revisados}/{contadores.total} revisados · {filtrados.length} en vista</span>
            </div>

            {checked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2.5">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{checked.size} seleccionado(s) → aplicar:</span>
                {ACCIONES.map(a => (
                  <button key={a} onClick={() => accionMasiva(a)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 ${ACC_STYLE[a]}`}>{a}</button>
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
                      <th className="px-3 py-3 w-8"><input type="checkbox" checked={todosMarcados} onChange={toggleTodos} className="rounded" /></th>
                      <SortTh label="Nombre" k="nombre" sort={sort} onSort={toggleSort} />
                      <SortTh label="DNI" k="dni" sort={sort} onSort={toggleSort} />
                      <SortTh label="Riesgo final" k="riesgoFinal" sort={sort} onSort={toggleSort} />
                      <th className="px-4 py-3 font-bold">PEP</th>
                      <SortTh label="Nivel" k="nivelPep" sort={sort} onSort={toggleSort} />
                      <SortTh label="Coinc." k="totalCoincidencias" sort={sort} onSort={toggleSort} center />
                      <SortTh label="Acción" k="accion" sort={sort} onSort={toggleSort} />
                      <SortTh label="Estado" k="estado" sort={sort} onSort={toggleSort} />
                      <th className="px-4 py-3 font-bold text-right">Ficha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtrados.map(p => (
                      <tr key={p.dni} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${checked.has(p.dni) ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}>
                        <td className="px-3 py-3"><input type="checkbox" checked={checked.has(p.dni)} onChange={() => toggleCheck(p.dni)} className="rounded" /></td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{p.nombre || '—'}{p.filasFusionadas > 0 && <span className="ml-2 text-[10px] text-slate-400" title="Filas repetidas en el archivo, fusionadas">×{p.filasFusionadas + 1}</span>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{p.dni}</td>
                        <td className="px-4 py-3"><span className={`text-[10px] font-black px-2 py-1 rounded-full ${RIESGO_STYLE(p.riesgoFinal)}`}>{p.riesgoFinal || '—'}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {tieneSancion(p) && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white">SANCIÓN</span>}
                            {p.esPep && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">PEP</span>}
                            {p.familiarDePep && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300">FAMILIAR</span>}
                            {p.funcionarioPublico && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">FUNC.</span>}
                            {otrasListas(p).length > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300" title={otrasListas(p).join(', ')}>+{otrasListas(p).length} LISTA</span>}
                            {!p.esPep && !p.familiarDePep && !p.funcionarioPublico && otrasListas(p).length === 0 && <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{p.nivelPep ? (/^\d+$/.test(p.nivelPep) ? `Nivel ${p.nivelPep}` : p.nivelPep) : '—'}</td>
                        <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{p.totalCoincidencias}</td>
                        <td className="px-4 py-3">
                          <select value={p.accion} onChange={e => setAccion(p.dni, e.target.value as AnalysisAction)} className={`px-2 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${ACC_STYLE[p.accion] ?? 'text-slate-500'}`}>
                            <option value="">— Seleccionar —</option>{ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.estado === 'Revisado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{p.estado}</span></td>
                        <td className="px-4 py-3 text-right"><button onClick={() => setSeleccionado(p.dni)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Ver <ChevronRight size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {sel && <FichaPeru p={sel} onClose={() => setSeleccionado(null)} onUpdate={update} onPrev={goPrev} onNext={goNext} />}
    </div>
  );
};

// ─── Ficha ────────────────────────────────────────────────────────────────────

/** Una tabla que oculta las columnas sin ningún dato. */
function TablaDetalle<T extends object>({ titulo, filas, columnas }: { titulo: string; filas: T[]; columnas: { k: keyof T; t: string; render?: (f: T) => React.ReactNode }[] }) {
  if (filas.length === 0) return null;
  const conDato = columnas.filter(c => filas.some(f => { const v = f[c.k]; return v !== null && v !== undefined && String(v).trim() !== ''; }));
  return (
    <div className="mb-5">
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">{titulo} ({filas.length})</h4>
      <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">{conDato.map(c => <th key={String(c.k)} className="px-3 py-2 font-bold">{c.t}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((f, i) => (
              <tr key={i} className="align-top">{conDato.map(c => <td key={String(c.k)} className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[420px] break-words">{c.render ? c.render(f) : String(f[c.k] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** El % de coincidencia, bien visible: bajo 90 puede ser un homónimo. */
const Porcentaje: React.FC<{ v: number | null }> = ({ v }) => v === null ? <span className="text-slate-400">—</span> : (
  <span className={`inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-full ${v >= 100 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : v >= 90 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}
    title={v < 90 ? 'Coincidencia parcial: puede ser un homónimo' : undefined}>
    {v}%{v < 90 && <AlertTriangle size={11} />}
  </span>
);

const FichaPeru: React.FC<{ p: PeruProfile; onClose: () => void; onUpdate: (dni: string, patch: Partial<PeruProfile>) => void; onPrev?: () => void; onNext?: () => void }> = ({ p, onClose, onUpdate, onPrev, onNext }) => {
  const [pdf, setPdf] = useState(false);
  const bandera = (on: boolean, t: string, clase: string) => (
    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${on ? clase : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>{t}: {on ? 'Sí' : 'No'}</span>
  );
  const descargarPdf = async () => { setPdf(true); try { await generatePeruProfilePdf(p); } finally { setPdf(false); } };
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-5xl h-[92vh] overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800">
        <div className="p-5 px-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{p.nombre || p.dni}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">DNI {p.dni}{p.filasFusionadas ? ` · ${p.filasFusionadas + 1} filas en el archivo, fusionadas` : ''}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-[10px] font-black px-2 py-1 rounded-full ${RIESGO_STYLE(p.riesgoFinal)}`}>Riesgo final: {p.riesgoFinal || '—'}</span>
              {bandera(p.esPep, 'PEP', 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300')}
              {bandera(p.familiarDePep, 'Familiar de PEP', 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300')}
              {bandera(p.funcionarioPublico, 'Funcionario público', 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300')}
              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Nivel PEP: {p.nivelPep || '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={descargarPdf} disabled={pdf} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-600 hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl disabled:opacity-50">
              <Download size={14} /> {pdf ? '…' : 'PDF'}
            </button>
            <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-1">
              <button onClick={onPrev} disabled={!onPrev} className={`p-1.5 rounded-lg ${onPrev ? 'text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-slate-700' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}><ChevronLeft size={18} /></button>
              <button onClick={onNext} disabled={!onNext} className={`p-1.5 rounded-lg ${onNext ? 'text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-slate-700' : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}><ChevronRight size={18} /></button>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><X size={20} /></button>
          </div>
        </div>

        <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Decisión manual</span>
          <select value={p.accion} onChange={e => onUpdate(p.dni, { accion: e.target.value as AnalysisAction, estado: e.target.value ? 'Revisado' : 'Pendiente' })}
            className={`px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${ACC_STYLE[p.accion] ?? 'text-slate-500'}`}>
            <option value="">— Seleccionar —</option>{ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input value={p.notas} onChange={e => onUpdate(p.dni, { notas: e.target.value })} placeholder="Notas del analista…"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" />
        </div>

        <div className="flex-grow overflow-y-auto px-8 py-5 text-sm">
          {tieneSancion(p) && (
            <div className="mb-4 bg-red-600 text-white rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2">
              <AlertTriangle size={16} /> SANCIÓN — {p.otras.some(o => o.sancion)
                ? `${p.otras.filter(o => o.sancion).length} hit(s) del tipo «sanction» en otras listas`
                : `coincidió una lista de sanciones: ${p.listasConCoincidencia.filter(l => /ofac|sanci/i.test(l)).join(', ')}`}. Se lee aparte de PEP.
            </div>
          )}
          {p.listasConCoincidencia.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Listas con coincidencia</span>
              {p.listasConCoincidencia.map(l => <span key={l} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{l}</span>)}
            </div>
          )}
          {p.alertasValidacion && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
              <strong>Alertas de validación:</strong> {p.alertasValidacion}
            </div>
          )}
          <TablaDetalle titulo="Coincidencias PEP" filas={p.pep} columnas={[
            { k: 'lista', t: 'Lista' }, { k: 'origen', t: 'Origen' }, { k: 'conclusion', t: 'Conclusión' },
            { k: 'porcentaje', t: '% coincidencia', render: f => <Porcentaje v={f.porcentaje} /> },
            { k: 'cargo', t: 'Cargo' }, { k: 'entidad', t: 'Entidad' }, { k: 'fechaInicio', t: 'Inicio' }, { k: 'fechaFin', t: 'Fin' },
            { k: 'fuente', t: 'Fuente' }, { k: 'resolucionNombramiento', t: 'Res. nombramiento' }, { k: 'resolucionRetiro', t: 'Res. retiro' },
            { k: 'actualizado', t: 'Actualizado' }, { k: 'detalle', t: 'Detalle' },
          ]} />
          <TablaDetalle titulo="Familiares de PEP" filas={p.familiares} columnas={[
            { k: 'relacion', t: 'Relación' }, { k: 'pepVinculado', t: 'PEP vinculado' }, { k: 'dniPep', t: 'DNI PEP' },
            { k: 'pepCargo', t: 'Cargo del PEP' }, { k: 'pepOrganismo', t: 'Organismo' }, { k: 'pepEstado', t: 'Estado PEP' },
            { k: 'nivel', t: 'Nivel' }, { k: 'baseRegulatoria', t: 'Base regulatoria' }, { k: 'veracidad', t: 'Veracidad' },
            { k: 'notaVeracidad', t: 'Nota' }, { k: 'confianzaVinculo', t: 'Confianza del vínculo' }, { k: 'riesgo', t: 'Riesgo' },
          ]} />
          <TablaDetalle titulo="Funcionario público" filas={p.funcionario} columnas={[
            { k: 'cargo', t: 'Cargo' }, { k: 'entidad', t: 'Dependencia' },
            { k: 'porcentaje', t: '% coincidencia', render: f => <Porcentaje v={f.porcentaje} /> },
            { k: 'actualizado', t: 'Fecha registro' }, { k: 'detalle', t: 'Detalle' },
          ]} />
          <TablaDetalle titulo="Otras coincidencias" filas={[...p.otras].sort((a, b) => Number(b.sancion) - Number(a.sancion))} columnas={[
            { k: 'sancion', t: 'Tipo', render: f => f.sancion
              ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white">SANCIÓN</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{/pep/i.test(f.tipos) ? 'PEP' : 'otra'}</span> },
            { k: 'lista', t: 'Lista' }, { k: 'nombre', t: 'Nombre del hit' }, { k: 'tipos', t: 'Tipos' },
            { k: 'tipoEntidad', t: 'Entidad' }, { k: 'score', t: 'Score' }, { k: 'estadoMatch', t: 'Estado' },
            { k: 'fuentes', t: 'Fuentes' }, { k: 'paises', t: 'Países' }, { k: 'riesgo', t: 'Riesgo' }, { k: 'detalle', t: 'Detalle' },
          ]} />
          {p.pep.length + p.familiares.length + p.funcionario.length + p.otras.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">
              {p.esPep || p.funcionarioPublico || p.familiarDePep || otrasListas(p).length
                ? 'El archivo no trae el detalle de estas coincidencias (por ejemplo, PEP solo por el nivel de Regcheq).'
                : 'Sin coincidencias PEP ni en otras listas.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
