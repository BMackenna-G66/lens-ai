// Cola de trabajo KYB (empresas / B2B). Módulo paralelo e independiente de la
// Bandeja de Casos: colección propia, servicios propios, y no importa nada de
// CasosInbox.
//
// Toda la I/O pasa por los servicios de services/kyb/*; este componente solo
// orquesta estado de UI.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeColaKyb, encolarEmpresas, leerUltimoAnalisis, kybDisponible, setStatusKyb, sacarDeColaMasivo, leerSnapshot, type SnapshotAdmin } from '../../services/kyb/kybQueueService';
import { analizarEmpresa, analisisVigente } from '../../services/kyb/kybAnalysisService';
import { getEmpresaDocsCompany, detalleDesdeCrudo } from '../../services/empresaDocsClient';
import { mapEstadoAdmin } from '../../services/kyb/kybAdminMapper';
import type { EmpresaKyb, AnalisisKyb, TipoDecisionKyb } from '../../types/kyb';
import { DECISIONES_CON_CHECKER } from '../../types/kyb';
import { useAuth } from '../../context/AuthContext';
import { KybFichaFlotante } from './KybFichaFlotante';
import { getPresignedUrl } from '../../services/empresaDocsClient';
import { runPool } from '../../services/casosCriminalService';
import type { DocumentoKyb } from '../../types/kyb';
import { subscribeFlujoKyb, guardarFlujoKyb, FLUJO_KYB_DEFAULT, PAISES_KYB, type FlujoKybConfig } from '../../services/kyb/kybFlujoService';
import { simularBarrido, barrer, barrerEnVivo, barridoDisponible, TOPE_BARRIDO, PRESET_EN_VIVO, type FiltrosBarrido, type ResultadoSimulacion } from '../../services/kyb/kybSweepService';
import { ordenarYFiltrar, sugerenciasPresentes, estadosPresentes, type ColumnaOrden } from '../../services/kyb/kybOrdenCola';

interface Props {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const hayGeminiKey = (): boolean => !!(process.env.GEMINI_API_KEY || process.env.API_KEY);

export const KybQueue: React.FC<Props> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<EmpresaKyb[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [selId, setSelId] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisKyb | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotAdmin | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [progreso, setProgreso] = useState('');

  const [companyIdNuevo, setCompanyIdNuevo] = useState('');
  const [encolando, setEncolando] = useState(false);
  const [msg, setMsg] = useState('');
  const [filtro, setFiltro] = useState('');
  // Orden de la tabla. Arranca por fecha de recepción descendente: lo más nuevo
  // primero, que es cómo se trabaja una cola.
  const [orden, setOrden] = useState<ColumnaOrden>('recibidoEn');
  const [ordenAsc, setOrdenAsc] = useState(false);
  const [fSugerencia, setFSugerencia] = useState('');
  const [fAnalisis, setFAnalisis] = useState('');

  // ── Mantenedor del flujo automático ──
  const [flujo, setFlujo] = useState<FlujoKybConfig>(FLUJO_KYB_DEFAULT);
  const [flujoDraft, setFlujoDraft] = useState<FlujoKybConfig>(FLUJO_KYB_DEFAULT);
  const [verFlujo, setVerFlujo] = useState(false);
  const [guardandoFlujo, setGuardandoFlujo] = useState(false);
  useEffect(() => subscribeFlujoKyb(c => { setFlujo(c); setFlujoDraft(c); }), []);

  // ── Barrido de Admin ──
  // Dos pasos obligatorios: simular y recién después traer. Admin ignora en
  // silencio los filtros que no conoce y devuelve las 72 mil empresas, así que
  // sin la simulación un typo encolaría todo.
  const [verBarrido, setVerBarrido] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosBarrido>({ kycStage1: 'REQUESTED_MANUAL', country: 'CL' });
  const [sim, setSim] = useState<ResultadoSimulacion | null>(null);
  const [barriendo, setBarriendo] = useState(false);
  const [dias, setDias] = useState(PRESET_EN_VIVO.diasAtras);

  // ── Selección y análisis masivo ──
  // Es lo que convierte la cola en una cola de casos: se analizan muchas de una
  // y después el analista solo entra a ver resultados.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [masivo, setMasivo] = useState<{ hechas: number; total: number; actual: string } | null>(null);

  const toggleSel = (id: string) => (setConfirmaSalida(false), setSeleccion(s2 => {
    const n = new Set(s2);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  }));

  // Salida masiva de la cola. Pide confirmación porque son N casos de una: el
  // botón cambia a "Confirmar (N)" en vez de abrir un diálogo del navegador,
  // que en un flujo de cola se clickea sin leer.
  const [confirmaSalida, setConfirmaSalida] = useState(false);

  const sacarSeleccionadas = async () => {
    const ids = [...seleccion];
    if (ids.length === 0) return;
    if (!confirmaSalida) { setConfirmaSalida(true); return; }
    setConfirmaSalida(false);
    const r = await sacarDeColaMasivo(ids);
    setSeleccion(new Set());
    if (sel && ids.includes(sel.companyId)) { setSelId(null); cargadoPara.current = null; }
    setMsg(r.error
      ? `⚠️ Salieron ${r.sacados} de ${ids.length} · se cortó en: ${r.error}`
      : `✅ ${r.sacados} caso(s) fuera de la cola (el histórico se conserva)`);
  };

  const analizarSeleccionadas = async () => {
    const ids = [...seleccion];
    if (ids.length === 0) return;
    setMasivo({ hechas: 0, total: ids.length, actual: '' });
    let ok = 0, err = 0;
    // Concurrencia 2: cada empresa son N descargas + OCR (CPU) + varias llamadas
    // a Gemini + N consultas a Regcheq. Más paralelo no va más rápido, satura.
    await runPool(ids, async id => {
      const emp = items.find(i => i.companyId === id);
      setMasivo(m => m ? { ...m, actual: emp?.razonSocial ?? id } : m);
      try {
        await analizarEmpresa(id, {
          hayApiKey: hayGeminiKey(),
          empresa: emp,
          actor: { uid: user?.uid, nombre: user?.displayName ?? user?.email ?? undefined },
        });
        ok++;
      } catch { err++; }
      setMasivo(m => m ? { ...m, hechas: m.hechas + 1 } : m);
    }, 2);
    setMasivo(null);
    setSeleccion(new Set());
    // Si quedó una ficha abierta, se fuerza la recarga: puede haber sido una de
    // las analizadas y mostraría la corrida anterior.
    cargadoPara.current = null;
    setMsg(`✅ ${ok} analizada(s)${err ? ` · ${err} con error` : ''}`);
  };

  // Preset "cola en vivo": UPLOADED_MANUAL · Chile · todos los estados menos
  // BLOCKED y FULLY_BLOCKED · últimos N días. La exclusión de estados y el corte
  // por fecha se hacen del lado del cliente porque Admin no los soporta.
  const traerEnVivo = async () => {
    setBarriendo(true); setMsg('');
    try {
      const r = await barrerEnVivo({ ...PRESET_EN_VIVO, diasAtras: dias });
      if (r.empresas.length === 0) {
        setMsg(`Sin empresas nuevas en los últimos ${dias} día(s) con ese filtro.`);
        return;
      }
      // El barrido ya trajo el registro completo de cada empresa: se convierte en
      // snapshot acá para poder abrir la ficha sin analizar. Es un snapshot con
      // fecha, no la fuente del análisis.
      const res = await encolarEmpresas(r.empresas.map(e => ({
        ...e,
        origen: 'barrido' as const,
        snapshot: e.crudo ? detalleDesdeCrudo(e.crudo) : undefined,
      })));
      // El reingreso lo detecta `encolarEmpresas`, que es donde se lee el estado
      // anterior de cada empresa. La detección vieja solo miraba las visibles en
      // la cola, y una cerrada justamente NO está ahí: nunca se disparaba.
      setMsg(
        `✅ ${res.nuevas} nueva(s) y ${res.actualizadas} actualizada(s) · desde ${r.desde} · ` +
        `${r.excluidasPorEstado} excluida(s) por estado bloqueado` +
        (res.fueraPorCerradas ? ` · ${res.fueraPorCerradas} ya cerrada(s) NO vuelven a la cola` : '') +
        (r.cortadoPorTope ? ` · cortado en el tope de ${TOPE_BARRIDO}` : '') +
        (res.reingresos.length ? ` · ${res.reingresos.length} marcada(s) para reingreso` : ''),
      );
      setVerBarrido(false);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBarriendo(false); }
  };

  // ── Suscripción a la cola ──
  useEffect(() => {
    if (!kybDisponible()) { setError('Firestore no está configurado en esta instancia.'); setCargando(false); return; }
    const un = subscribeColaKyb(
      d => { setItems(d); setCargando(false); setError(null); },
      m => {
        // El mensaje de Firestore viaja tal cual: si falta el índice compuesto,
        // ahí viene el link para crearlo y esconderlo cuesta media hora.
        setError(m);
        setCargando(false);
      },
    );
    return un;
  }, []);

  const sel = useMemo(() => items.find(i => i.companyId === selId) ?? null, [items, selId]);

  // Al abrir una ficha se lee el último análisis guardado. NO se re-analiza solo:
  // cada corrida cuesta descargas, OCR y llamadas a Gemini.
  const cargadoPara = useRef<string | null>(null);
  useEffect(() => {
    if (!selId || cargadoPara.current === selId) return;
    cargadoPara.current = selId;
    setAnalisis(null);
    setSnapshot(null);
    leerUltimoAnalisis(selId).then(a => {
      setAnalisis(a);
      // El snapshot del barrido se lee SOLO si no hay análisis: es para poder
      // abrir la ficha con datos mientras no se analizó. Vive en la subcolección
      // para no engordar la cola, así que se pide acá y no en la suscripción.
      if (!a) leerSnapshot(selId).then(setSnapshot).catch(() => {});
    }).catch(() => {});
  }, [selId]);

  // ── Encolar por Company ID ──
  const encolar = async () => {
    const id = companyIdNuevo.trim();
    if (!id) return;
    setEncolando(true); setMsg('');
    try {
      // Se consulta Admin antes de encolar para guardar la razón social y el
      // estado en el doc padre: así la cola se puede filtrar y ordenar sin abrir
      // cada ficha ni volver a pegarle a Admin.
      const detalle = await getEmpresaDocsCompany(id);
      const est = mapEstadoAdmin(id, detalle);
      const razonSocial = String((detalle.adminRaw as Record<string, unknown> | undefined)?.name ?? '') || `Empresa ${id}`;
      const r = await encolarEmpresas([{
        companyId: id,
        razonSocial,
        identificacion: String((detalle.adminRaw as Record<string, unknown> | undefined)?.identificationNumber ?? '') || undefined,
        complianceStatus: est.complianceStatus,
        kycStage1: est.kycStage1,
        riskLevel: est.riskLevel,
        institucional: est.institucional,
        origen: 'manual',
        snapshot: detalle,
      }]);
      setMsg(`✅ ${razonSocial} · ${r.nuevas ? 'encolada' : 'ya estaba, actualizada'}`);
      setCompanyIdNuevo('');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEncolando(false);
    }
  };

  // ── Análisis ──
  const correrAnalisis = async (companyId: string) => {
    setAnalizando(true); setProgreso('Iniciando…');
    try {
      const empresa = items.find(i => i.companyId === companyId);
      const a = await analizarEmpresa(companyId, {
        hayApiKey: hayGeminiKey(),
        empresa,
        actor: { uid: user?.uid, nombre: user?.displayName ?? user?.email ?? undefined },
        onProgreso: p => setProgreso(p.detalle ? `${p.fase} · ${p.detalle}` : p.fase),
      });
      setAnalisis(a);
    } catch (e) {
      setMsg(`❌ Análisis: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalizando(false); setProgreso('');
    }
  };

  // ── Decisión ──
  // Se registra en el doc padre. Las que exigen checker quedan
  // PENDIENTE_APROBACION: el sistema no puede aprobar su propia decisión.
  const decidir = async (tipo: TipoDecisionKyb, comentario: string) => {
    if (!sel) return;
    const { registrarDecisionKyb } = await import('../../services/kyb/kybDecisionService');
    try {
      await registrarDecisionKyb(sel.companyId, {
        tipo, comentario,
        actorId: user?.uid ?? 'system',
        actorNombre: user?.displayName ?? user?.email ?? 'system',
        actorTipo: user ? 'USER' : 'SYSTEM',
        automatica: false,
        certidumbre: analisis?.certidumbre ?? null,
      });
      setMsg(`✅ Decisión registrada: ${tipo}${DECISIONES_CON_CHECKER.has(tipo) ? ' (pendiente de aprobación)' : ''}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const abrirDocumento = async (d: DocumentoKyb) => {
    if (!d.link) { setMsg('❌ El documento no tiene clave para abrirlo'); return; }
    try {
      // La URL firmada se pide al momento: si se guardara, expiraría.
      const url = await getPresignedUrl(d.link);
      if (url) window.open(url, '_blank', 'noopener');
      else setMsg('❌ Admin no devolvió la URL del documento');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const eliminarDeCola = async (companyId: string) => {
    try {
      await setStatusKyb(companyId, 'CERRADO');
      setSelId(null); cargadoPara.current = null;
      setMsg('✅ Empresa sacada de la cola (el histórico se conserva)');
    } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
  };

  // Navegación dentro de la ficha: pasar a la empresa siguiente sin cerrarla.
  const irA = (idx: number) => {
    const e = filtrados[idx];
    if (e) { setSelId(e.companyId); cargadoPara.current = null; }
  };

  const filtrados = useMemo(
    () => ordenarYFiltrar(items, {
      texto: filtro, sugerencia: fSugerencia, estadoAnalisis: fAnalisis,
      orden, asc: ordenAsc,
    }),
    [items, filtro, fSugerencia, fAnalisis, orden, ordenAsc],
  );

  const sugerenciasEnCola = useMemo(() => sugerenciasPresentes(items), [items]);
  const estadosEnCola = useMemo(() => estadosPresentes(items), [items]);

  const indiceSel = useMemo(() => filtrados.findIndex(i => i.companyId === selId), [filtrados, selId]);

  // Encabezado ordenable. Un clic ordena por esa columna; el segundo invierte.
  // Al cambiar de columna se arranca descendente, que es lo que se quiere mirar
  // primero en una cola de riesgo (lo más grave / lo más nuevo arriba).
  const Th: React.FC<{ col: ColumnaOrden; children: React.ReactNode }> = ({ col, children }) => (
    <th className="py-3 px-4 font-semibold">
      <button
        onClick={() => { orden === col ? setOrdenAsc(a => !a) : (setOrden(col), setOrdenAsc(false)); }}
        className={`flex items-center gap-1 hover:text-violet-700 dark:hover:text-violet-400 ${
          orden === col ? 'text-violet-700 dark:text-violet-400' : ''
        }`}
        title="Ordenar por esta columna"
      >
        {children}
        <span className="text-[9px] opacity-70">{orden === col ? (ordenAsc ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );

  // PDF con todo lo de la ficha. Se genera desde el análisis guardado, sin
  // re-consultar nada.
  const descargarPdf = async (e: EmpresaKyb) => {
    if (!analisis) { setMsg('❌ Primero hay que analizar la empresa'); return; }
    try {
      const { generarPdfKyb } = await import('../../services/kyb/kybPdfService');
      await generarPdfKyb(e, analisis);
    } catch (err) {
      setMsg(`❌ PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 transition-colors">
      <header className="flex items-center justify-between gap-3 mb-5">
        <button onClick={onBack} className="text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          ← Inicio
        </button>
        <div className="text-center flex-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">🏢 Cola KYB · Empresas</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            KYC de empresas: documentos contra Admin, 12 componentes y certidumbre explicable
          </p>
        </div>
        <button onClick={onToggleDarkMode} className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Encolar + filtro */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={companyIdNuevo}
          onChange={e => setCompanyIdNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') encolar(); }}
          placeholder="Company ID de Admin"
          className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 w-56"
        />
        <button
          onClick={encolar}
          disabled={encolando || !companyIdNuevo.trim()}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold"
        >
          {encolando ? 'Encolando…' : 'Encolar empresa'}
        </button>
        {/* Buscador y filtros. Los desplegables solo ofrecen valores que están
            en la cola: un filtro que no puede filtrar nada es ruido. */}
        <input
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Buscar por nombre, Company ID o RUT"
          className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 ml-auto w-72"
        />
        <select
          value={fSugerencia}
          onChange={e => setFSugerencia(e.target.value)}
          className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          title="Sugerencia del motor criminal"
        >
          <option value="">Sugerencia: todas</option>
          {sugerenciasEnCola.map(x => <option key={x} value={x}>{x}</option>)}
          <option value="SIN">— sin screening —</option>
        </select>
        <select
          value={fAnalisis}
          onChange={e => setFAnalisis(e.target.value)}
          className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          title="Estado del análisis"
        >
          <option value="">Análisis: todos</option>
          {estadosEnCola.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        {(filtro || fSugerencia || fAnalisis) && (
          <button
            onClick={() => { setFiltro(''); setFSugerencia(''); setFAnalisis(''); }}
            className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Mantenedor del flujo automático. Arranca todo apagado y en simulación:
          prender el auto-aprobar de un KYC de empresas sin haberlo medido es un
          incidente regulatorio, no un bug. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setVerFlujo(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            flujo.enabled && !flujo.simulacion
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}
        >
          <span>{verFlujo ? '▾' : '▸'}</span> ⚙️ Flujo automático
          <span className={`px-1.5 py-0.5 rounded-full ${flujo.enabled && !flujo.simulacion ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-700'}`}>
            {!flujo.enabled ? 'OFF'
              : flujo.simulacion ? 'SIMULACIÓN'
              : [flujo.autoAprobar && 'aprobar', flujo.autoRechazar && 'rechazar'].filter(Boolean).join(' + ') || 'sin dirección'}
          </span>
        </button>
        {flujo.enabled && flujo.simulacion && (
          <span className="text-[11px] text-sky-600 dark:text-sky-400">
            En simulación: se registra qué habría hecho, sin ejecutar nada.
          </span>
        )}
      </div>

      {verFlujo && (() => {
        const set = (patch: Partial<FlujoKybConfig>) => setFlujoDraft(d => ({ ...d, ...patch }));
        const sw = (on: boolean) => `relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'}`;
        const knob = (on: boolean) => `inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`;
        const num = 'w-20 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1';
        return (
          <div className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 p-4">
            <div className="flex flex-wrap gap-6">
              <div className="space-y-2">
                <button onClick={() => set({ enabled: !flujoDraft.enabled })} className="flex items-center gap-2">
                  <span className={sw(flujoDraft.enabled)}><span className={knob(flujoDraft.enabled)} /></span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Flujo automático</span>
                </button>
                <button onClick={() => set({ simulacion: !flujoDraft.simulacion })} className="flex items-center gap-2">
                  <span className={sw(flujoDraft.simulacion)}><span className={knob(flujoDraft.simulacion)} /></span>
                  <span className="text-xs text-slate-700 dark:text-slate-300">Modo simulación</span>
                </button>
                <button onClick={() => set({ autoAprobar: !flujoDraft.autoAprobar })} className="flex items-center gap-2">
                  <span className={sw(flujoDraft.autoAprobar)}><span className={knob(flujoDraft.autoAprobar)} /></span>
                  <span className="text-xs text-slate-700 dark:text-slate-300">Auto-aprobar</span>
                </button>
                <button onClick={() => set({ autoRechazar: !flujoDraft.autoRechazar })} className="flex items-center gap-2">
                  <span className={sw(flujoDraft.autoRechazar)}><span className={knob(flujoDraft.autoRechazar)} /></span>
                  <span className="text-xs text-slate-700 dark:text-slate-300">Auto-rechazar</span>
                </button>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Países habilitados</p>
                {PAISES_KYB.map(p => (
                  <label key={p.code} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer mb-1">
                    <input
                      type="checkbox"
                      checked={flujoDraft.paises[p.code] === true}
                      onChange={e => set({ paises: { ...flujoDraft.paises, [p.code]: e.target.checked } })}
                      className="accent-amber-600"
                    />
                    {p.label}
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-700 dark:text-slate-300">
                  Aprueba si la certidumbre es ≥
                  <input type="number" min={0} max={100} value={flujoDraft.umbralAprobar}
                    onChange={e => set({ umbralAprobar: Number(e.target.value) })} className={`${num} ml-2`} />
                </label>
                <label className="block text-xs text-slate-700 dark:text-slate-300">
                  Rechaza si es ≤
                  <input type="number" min={0} max={100} value={flujoDraft.umbralRechazar}
                    onChange={e => set({ umbralRechazar: Number(e.target.value) })} className={`${num} ml-2`} />
                </label>
                <label className="block text-xs text-slate-700 dark:text-slate-300">
                  Cobertura mínima comparada
                  <input type="number" min={0} max={100} value={flujoDraft.coberturaMinima}
                    onChange={e => set({ coberturaMinima: Number(e.target.value) })} className={`${num} ml-2`} />
                </label>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-3">
              Frenos que <b>no se pueden desactivar</b>: delito sensible, PEP, T&C sin firmar,
              alerta crítica abierta y discrepancia de identidad. Los dos últimos frenan las dos
              direcciones — una discrepancia de identidad significa que los datos están mal, no la empresa.
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={async () => {
                  setGuardandoFlujo(true);
                  try {
                    await guardarFlujoKyb(flujoDraft, user?.displayName ?? user?.email ?? undefined);
                    setMsg('✅ Configuración del flujo guardada');
                  } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
                  finally { setGuardandoFlujo(false); }
                }}
                disabled={guardandoFlujo}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {guardandoFlujo ? 'Guardando…' : 'Guardar configuración'}
              </button>
              <button onClick={() => { setFlujoDraft(flujo); setVerFlujo(false); }} className="text-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        );
      })()}

      {/* Barrido de Admin */}
      {barridoDisponible() && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => { setVerBarrido(v => !v); setSim(null); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-violet-300"
          >
            <span>{verBarrido ? '▾' : '▸'}</span> 🧹 Barrer Admin
          </button>
        </div>
      )}

      {verBarrido && (() => {
        const inp = 'text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5';
        const set = (p: Partial<FiltrosBarrido>) => { setFiltros(f => ({ ...f, ...p })); setSim(null); };
        return (
          <div className="mb-4 rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20 p-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Admin tiene <b>72.207</b> empresas y <b>ignora los filtros que no conoce</b>: si un nombre
              está mal escrito devuelve todo sin dar error. Por eso primero se simula y recién después
              se trae — y no se trae nada si el filtro no redujo el universo.
            </p>
            {/* Preset de uso diario. El manual de abajo queda para casos puntuales. */}
            <div className="rounded-xl border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-900 p-3 mb-4">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">🔴 Cola en vivo</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                KYC I = <b>UPLOADED_MANUAL</b> · país <b>Chile</b> · todos los compliance status
                <b> menos BLOCKED y FULLY_BLOCKED</b> · creadas en los últimos
                <input
                  type="number" min={1} max={365} value={dias}
                  onChange={e => setDias(Math.max(1, Number(e.target.value) || 1))}
                  className="mx-1.5 w-16 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
                /> días.
              </p>
              <button
                onClick={traerEnVivo}
                disabled={barriendo}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {barriendo ? 'Trayendo…' : `Traer y encolar (últimos ${dias} días)`}
              </button>
            </div>

            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">Barrido manual</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="block text-slate-500 dark:text-slate-400 mb-1">kycStage1</span>
                <input value={filtros.kycStage1 ?? ''} onChange={e => set({ kycStage1: e.target.value })} className={inp} placeholder="REQUESTED_MANUAL" />
              </label>
              <label className="text-xs">
                <span className="block text-slate-500 dark:text-slate-400 mb-1">complianceStatus</span>
                <input value={filtros.complianceStatus ?? ''} onChange={e => set({ complianceStatus: e.target.value })} className={inp} placeholder="NORMAL" />
              </label>
              <label className="text-xs">
                <span className="block text-slate-500 dark:text-slate-400 mb-1">country</span>
                <input value={filtros.country ?? ''} onChange={e => set({ country: e.target.value })} className={`${inp} w-20`} placeholder="CL" />
              </label>
              <button
                onClick={async () => {
                  setBarriendo(true); setMsg('');
                  try { setSim(await simularBarrido(filtros)); }
                  catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
                  finally { setBarriendo(false); }
                }}
                disabled={barriendo}
                className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 text-xs font-bold disabled:opacity-50"
              >
                {barriendo ? 'Simulando…' : 'Simular'}
              </button>
            </div>

            {sim && (
              <div className={`mt-3 rounded-xl border p-3 ${sim.filtroAplicado
                ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30'}`}>
                <p className="text-xs text-slate-700 dark:text-slate-200">
                  <b>{sim.total.toLocaleString('es-CL')}</b> de {sim.totalSinFiltro.toLocaleString('es-CL')} empresas
                  {sim.filtroAplicado
                    ? ` · el filtro redujo el universo`
                    : ' · ⚠️ el filtro NO redujo nada: probablemente haya un nombre mal escrito'}
                </p>
                {sim.parametrosIgnorados.length > 0 && (
                  <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">
                    Parámetros rechazados: {sim.parametrosIgnorados.join(', ')}
                  </p>
                )}
                {sim.filtroAplicado && sim.total > TOPE_BARRIDO && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Supera el tope de {TOPE_BARRIDO}: afiná el filtro antes de traer.
                  </p>
                )}
                {sim.filtroAplicado && sim.total <= TOPE_BARRIDO && sim.total > 0 && (
                  <button
                    onClick={async () => {
                      setBarriendo(true); setMsg('');
                      try {
                        const r = await barrer(filtros);
                        // El registro completo que ya trajo el barrido se guarda
                        // como snapshot, para poder abrir la ficha sin analizar.
                        const res = await encolarEmpresas(r.empresas.map(e => ({
                          ...e,
                          origen: 'barrido' as const,
                          snapshot: e.crudo ? detalleDesdeCrudo(e.crudo) : undefined,
                        })));
                        setMsg(`✅ ${res.nuevas} nueva(s) y ${res.actualizadas} actualizada(s)` +
                          (res.fueraPorCerradas ? ` · ${res.fueraPorCerradas} ya cerrada(s) NO vuelven a la cola` : '') +
                          (res.reingresos.length ? ` · ${res.reingresos.length} marcada(s) para reingreso` : ''));
                        setSim(null); setVerBarrido(false);
                      } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
                      finally { setBarriendo(false); }
                    }}
                    disabled={barriendo}
                    className="mt-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    {barriendo ? 'Encolando…' : `Encolar ${sim.total} empresa(s)`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {msg && (
        <p className={`text-xs mb-3 ${msg.startsWith('❌') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{msg}</p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">No se pudo leer la cola</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 break-all">{error}</p>
          {error.includes('index') && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              Falta el índice compuesto <code>enCola ASC, recibidoEn DESC</code> en <code>kyb_empresas</code>.
              El mensaje de arriba trae el link para crearlo.
            </p>
          )}
        </div>
      )}

      {(
        <>
          {cargando && <p className="text-sm text-slate-400 py-10 text-center animate-pulse">Cargando cola…</p>}
          {/* Vacío por filtro y vacío de verdad NO son lo mismo: si el mensaje
              dice "la cola está vacía" con un filtro puesto, se busca el
              problema donde no está. */}
          {!cargando && !error && filtrados.length === 0 && (
            <p className="text-sm text-slate-400 py-10 text-center">
              {items.length === 0
                ? 'La cola está vacía. Encolá una empresa con su Company ID de Admin.'
                : `Ninguna de las ${items.length} empresas de la cola coincide con el filtro.`}
            </p>
          )}
          {!cargando && !error && filtrados.length > 0 && filtrados.length !== items.length && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Mostrando <b>{filtrados.length}</b> de {items.length} · filtro activo
            </p>
          )}
          {seleccion.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-3 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/50 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-violet-800 dark:text-violet-300">{seleccion.size} seleccionada(s)</span>
              <button
                onClick={analizarSeleccionadas}
                disabled={!!masivo}
                className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {masivo ? `Analizando ${masivo.hechas}/${masivo.total}…` : `Analizar ${seleccion.size}`}
              </button>
              {masivo?.actual && (
                <span className="text-xs text-violet-700 dark:text-violet-400 truncate">{masivo.actual}</span>
              )}
              <button
                onClick={sacarSeleccionadas}
                disabled={!!masivo}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                  confirmaSalida
                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                    : 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                }`}
                title="Saca los casos de la cola. El documento y su histórico se conservan."
              >
                {confirmaSalida ? `Confirmar: sacar ${seleccion.size}` : `Sacar de la cola (${seleccion.size})`}
              </button>
              <button onClick={() => { setConfirmaSalida(false); setSeleccion(new Set()); }} className="ml-auto text-xs text-slate-500 dark:text-slate-400 hover:underline">
                Limpiar selección
              </button>
            </div>
          )}

          {filtrados.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-left text-xs">
                  <tr>
                    <th className="py-3 px-2">
                      <input
                        type="checkbox"
                        checked={filtrados.length > 0 && filtrados.every(i => seleccion.has(i.companyId))}
                        onChange={e => setSeleccion(e.target.checked ? new Set(filtrados.map(i => i.companyId)) : new Set())}
                        className="accent-violet-600"
                        title="Seleccionar todas las visibles"
                      />
                    </th>
                    <Th col="razonSocial">Empresa</Th>
                    <Th col="companyId">Company ID</Th>
                    <Th col="identificacion">Identificación</Th>
                    <Th col="complianceStatus">Compliance</Th>
                    <Th col="certidumbre">Certidumbre</Th>
                    <th className="py-3 px-4 font-semibold">Screening criminal</th>
                    <Th col="sugerencia">Sugerencia del motor</Th>
                    <Th col="estado">Análisis</Th>
                    <Th col="decision">Decisión</Th>
                    <Th col="recibidoEn">Recibido</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(i => (
                    <tr
                      key={i.companyId}
                      onClick={() => setSelId(i.companyId)}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seleccion.has(i.companyId)}
                          onChange={() => toggleSel(i.companyId)}
                          className="accent-violet-600"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-100">{i.razonSocial}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{i.companyId}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{i.identificacion || '—'}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{i.complianceStatus || '—'}</td>
                      <td className="py-3 px-4 font-bold tabular-nums text-slate-800 dark:text-slate-100">
                        {/* Nunca 0%: sin análisis va guion. */}
                        {i.ultimoAnalisis?.certidumbre === null || i.ultimoAnalisis?.certidumbre === undefined
                          ? '—' : `${i.ultimoAnalisis.certidumbre}%`}
                      </td>
                      {/* La columna que pidió el negocio: si pasó screening y no
                          arrojó nada, hay que poder verlo — no puede quedar igual
                          que "no se consultó". */}
                      <td className="py-3 px-4 text-xs">
                        {!i.ultimoAnalisis?.screeningResumen ? (
                          <span className="text-slate-400">Sin screening</span>
                        ) : (
                          <span className={
                            i.ultimoAnalisis.screeningLimpio ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : /error/i.test(i.ultimoAnalisis.screeningResumen) ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400 font-semibold'
                          }>
                            {i.ultimoAnalisis.screeningResumen}
                          </span>
                        )}
                      </td>
                      {/* Sugerencia del catálogo de delitos de Chile, en su propia
                          columna: es lo que el analista compara contra su decisión. */}
                      <td className="py-3 px-4 text-xs">
                        {i.ultimoAnalisis?.sugerenciaCriminal
                          ? <span className={/blocked|ucr|compliance/i.test(i.ultimoAnalisis.sugerenciaCriminal)
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : /revisar/i.test(i.ultimoAnalisis.sugerenciaCriminal)
                                ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                : 'text-emerald-700 dark:text-emerald-400 font-semibold'}>
                              {i.ultimoAnalisis.sugerenciaCriminal}
                            </span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {i.ultimoAnalisis?.estado ?? 'SIN_ANALIZAR'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {i.decision?.tipo ?? '—'}
                        {i.decision?.aprobacion?.estado === 'PENDIENTE_APROBACION' && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400">pendiente aprobación</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {i.recibidoEn ? new Date(i.recibidoEn).toLocaleDateString('es-CL') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Ficha FLOTANTE: se abre encima de la cola, así al cerrar no hay que
          retroceder ni volver a buscar la empresa. */}
      {sel && (
        <KybFichaFlotante
          empresa={sel}
          analisis={analisis}
          analizando={analizando}
          progreso={progreso}
          onAnalizar={() => correrAnalisis(sel.companyId)}
          onDecidir={decidir}
          onEliminar={() => eliminarDeCola(sel.companyId)}
          onAbrirDocumento={abrirDocumento}
          onDescargarPdf={() => descargarPdf(sel)}
          onCerrar={() => { setSelId(null); cargadoPara.current = null; }}
          onAnterior={indiceSel > 0 ? () => irA(indiceSel - 1) : undefined}
          onSiguiente={indiceSel >= 0 && indiceSel < filtrados.length - 1 ? () => irA(indiceSel + 1) : undefined}
          posicion={indiceSel >= 0 ? `${indiceSel + 1} / ${filtrados.length}` : undefined}
          snapshot={snapshot}
          flujo={flujo}
        />
      )}
    </div>
  );
};

export { analisisVigente };
