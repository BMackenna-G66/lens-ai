import React, { useEffect, useMemo, useState } from 'react';
import { subscribeCasos, isCasosAvailable, CasoSF } from '../services/casosService';
import {
  sendCaseUpdate, sfUpdateDisponible, SFCaseUpdate, SFUpdateResult,
} from '../services/salesforceCaseService';
import { SF_CASE_FIELDS } from '../services/salesforceCaseFields';
import { buscarRemesa, buscarRemesas, RemesaResult, RemesaRow } from '../services/remesasService';
import { screenChileCriminal } from '../services/lens360Service';

// Estado del screening criminal por caso (cola OFAC/PEP).
interface ScreeningState {
  estado: 'loading' | 'ok' | 'sin_causas' | 'error' | 'na';  // na = no aplica (no es Chile)
  delitosUnicos?: number;
  decision?: string;
  razon?: string;
}

const paisOrigenChile = (c: QueuedCaso): boolean =>
  /chile|^cl$/i.test(String(c.datos?.['País Origen'] ?? '').trim());

type FormState = Record<string, string | boolean>;

// Colas de trabajo (clasificación de casos entrantes por asunto).
type QueueKey = 'ofac' | 'remesa' | 'otros';
type QueuedCaso = CasoSF & { remesa: string };
const QUEUES: { key: QueueKey; label: string }[] = [
  { key: 'ofac', label: 'Coincidencia OFAC' },
  { key: 'remesa', label: 'Remesa' },
  { key: 'otros', label: 'Otros' },
];

// Formulario por defecto: todo vacío salvo el número de caso (prefijado) y PEP.
function defaultForm(c: CasoSF | null): FormState {
  const f: FormState = {};
  for (const field of SF_CASE_FIELDS) f[field.apiName] = field.type === 'checkbox' ? false : '';
  f.CaseNumber = c?.numeroCaso ?? '';
  return f;
}

// Arma el payload final: CaseNumber + solo los campos con valor (omite vacíos),
// más los checkboxes como booleanos. Así el analista cambia solo lo que quiere.
function buildPayload(form: FormState): SFCaseUpdate {
  const payload: SFCaseUpdate = { CaseNumber: String(form.CaseNumber ?? '').trim() };
  for (const field of SF_CASE_FIELDS) {
    if (field.apiName === 'CaseNumber') continue;
    const v = form[field.apiName];
    if (field.type === 'checkbox') payload[field.apiName] = !!v;
    else if (typeof v === 'string' && v.trim() !== '') payload[field.apiName] = v;
  }
  return payload;
}

interface CasosInboxProps {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const fmtFecha = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};

// Texto plano de un valor del payload para una celda de tabla.
const cellText = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export const CasosInbox: React.FC<CasosInboxProps> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [casos, setCasos] = useState<CasoSF[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [activeQueue, setActiveQueue] = useState<QueueKey>('ofac');

  useEffect(() => {
    if (!isCasosAvailable()) {
      setError('Firestore no está configurado en esta instancia.');
      setLoading(false);
      return;
    }
    const unsub = subscribeCasos(
      data => { setCasos(data); setLoading(false); },
      msg => { setError(msg); setLoading(false); },
    );
    return () => unsub();
  }, []);

  // ── Clasificación en colas por asunto ──────────────────────────────────────
  // OFAC: asunto = "Coincidencia OFAC" (exacto). Remesa: asunto del bot que
  // detiene una TX ("...DETIENE TX <n>..."). Resto → "Otros" (no se pierde nada).
  const clasificar = (c: QueuedCaso): QueueKey => {
    const a = (c.asunto || '').trim();
    if (a.toLowerCase() === 'coincidencia ofac') return 'ofac';
    if (/DETIENE\s+TX/i.test(a)) return 'remesa';
    return 'otros';
  };
  // Extrae SOLO el número de la TX del asunto para la columna "remesa".
  const extraerRemesa = (asunto: string): string => {
    const m = (asunto || '').match(/TX\s*(\d+)/i);
    return m ? m[1] : '';
  };

  // Agrupa en colas y ordena cada una por fecha de llegada (asc = FIFO).
  const colas = useMemo(() => {
    const g: Record<QueueKey, QueuedCaso[]> = { ofac: [], remesa: [], otros: [] };
    for (const c of casos) {
      const qc: QueuedCaso = { ...c, remesa: extraerRemesa(c.asunto) };
      g[clasificar(qc)].push(qc);
    }
    (Object.keys(g) as QueueKey[]).forEach(k =>
      g[k].sort((a, b) => (a.recibidoEn || '').localeCompare(b.recibidoEn || '')));
    return g;
  }, [casos]);

  // Filtro aplicado dentro de la cola activa.
  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = colas[activeQueue];
    if (!q) return base;
    return base.filter(c =>
      [c.numeroCaso, c.asunto, c.nombreCuenta, c.pais, c.remesa].some(v => (v || '').toLowerCase().includes(q)));
  }, [colas, activeQueue, filtro]);

  // Columnas dinámicas = unión de TODOS los campos recibidos en la cola activa.
  const columnas = useMemo(() => {
    const keys: string[] = [];
    for (const c of filtrados) for (const k of Object.keys(c.datos || {})) if (!keys.includes(k)) keys.push(k);
    return keys;
  }, [filtrados]);

  const sel = useMemo(() => filtrados.find(c => c.id === selId) ?? null, [filtrados, selId]);

  // ── Responder en Salesforce ────────────────────────────────────────────────
  const [showResponder, setShowResponder] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm(null));
  const [sending, setSending] = useState(false);
  const [sfResult, setSfResult] = useState<SFUpdateResult | null>(null);

  // Al cambiar de caso, reinicia el formulario con los datos de ese caso.
  useEffect(() => {
    setForm(defaultForm(sel));
    setSfResult(null);
  }, [sel?.id]);

  const setField = (k: string, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  // ── Consulta de remesa en Redshift (cola Remesa) ────────────────────────────
  const [remesaData, setRemesaData] = useState<RemesaResult | null>(null);
  const [remesaLoading, setRemesaLoading] = useState(false);

  // Al seleccionar un caso de la cola Remesa, consulta la TX en Redshift.
  useEffect(() => {
    setRemesaData(null);
    if (activeQueue !== 'remesa' || !sel?.remesa) return;
    let cancelado = false;
    setRemesaLoading(true);
    buscarRemesa(sel.remesa)
      .then(r => { if (!cancelado) setRemesaData(r); })
      .catch(e => { if (!cancelado) setRemesaData({ estado: 'error', notFound: [], mensaje: (e as Error).message }); })
      .finally(() => { if (!cancelado) setRemesaLoading(false); });
    return () => { cancelado = true; };
  }, [sel?.id, sel?.remesa, activeQueue]);

  // Consulta en LOTE de todas las remesas de la cola (para columnas de la tabla).
  const [remesaMap, setRemesaMap] = useState<Record<string, RemesaRow>>({});
  const [remesaMapLoading, setRemesaMapLoading] = useState(false);
  const remesaIdsKey = colas.remesa.map(c => c.remesa).filter(Boolean).join(',');
  useEffect(() => {
    if (activeQueue !== 'remesa') return;
    const faltantes = colas.remesa.map(c => c.remesa).filter(id => id && !(id in remesaMap));
    if (faltantes.length === 0) return;
    let cancelado = false;
    setRemesaMapLoading(true);
    buscarRemesas(faltantes)
      .then(m => { if (!cancelado) setRemesaMap(prev => ({ ...prev, ...m })); })
      .finally(() => { if (!cancelado) setRemesaMapLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, remesaIdsKey]);

  // ── Screening criminal EN VIVO de la cola OFAC/PEP ──────────────────────────
  // Chile → Regcheq (solo DNI) + motor de decisión. Colombia queda pendiente
  // (Inspektor). Se procesa cada caso apenas cae, incrementalmente.
  const [screenMap, setScreenMap] = useState<Record<string, ScreeningState>>({});
  const ofacIdsKey = colas.ofac.map(c => c.id).join(',');
  useEffect(() => {
    if (activeQueue !== 'ofac') return;
    const pendientes = colas.ofac.filter(c => !(c.id in screenMap));
    if (pendientes.length === 0) return;
    let cancelado = false;

    // Estado inicial: loading para Chile, 'na' para el resto (Inspektor pendiente).
    setScreenMap(prev => {
      const next = { ...prev };
      for (const c of pendientes) next[c.id] = { estado: paisOrigenChile(c) ? 'loading' : 'na' };
      return next;
    });

    // Procesa los de Chile (Regcheq). Concurrencia natural; cada uno actualiza al terminar.
    for (const c of pendientes.filter(paisOrigenChile)) {
      const dni = String(c.datos?.['Número de DNI'] ?? '');
      const nombre = `${c.datos?.['Nombre'] ?? ''} ${c.datos?.['Apellido'] ?? ''}`.trim();
      screenChileCriminal(dni, nombre)
        .then(r => {
          if (cancelado) return;
          setScreenMap(prev => ({ ...prev, [c.id]: { estado: r.estado, delitosUnicos: r.delitosUnicos, decision: r.decision, razon: r.razon } }));
        })
        .catch(() => { if (!cancelado) setScreenMap(prev => ({ ...prev, [c.id]: { estado: 'error' } })); });
    }
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, ofacIdsKey]);

  // Color de la conclusión según la decisión del motor.
  const decisionColor = (d?: string): string => {
    const s = (d || '').toUpperCase();
    if (/BLOCK|BLOQ|FORZAR|RECHAZ/.test(s)) return 'text-red-600 dark:text-red-400';
    if (/REVIS|UCR|COMPLIANCE|MANUAL/.test(s)) return 'text-amber-600 dark:text-amber-400';
    if (/LIBER|APROB|OK|SIN CAUSAS/.test(s)) return 'text-emerald-600 dark:text-emerald-400';
    return 'text-slate-600 dark:text-slate-300';
  };

  const enviarRespuesta = async () => {
    setSending(true);
    setSfResult(null);
    try {
      const res = await sendCaseUpdate(buildPayload(form));
      setSfResult(res);
    } catch (e) {
      setSfResult({ ok: false, status: 0, errors: [(e as Error).message], raw: null });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Inicio
        </button>
        <div className="text-center flex-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">📥 Bandeja de Casos</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Casos OFAC/PEP + Transacciones recibidos desde Salesforce · en vivo
          </p>
        </div>
        <button onClick={onToggleDarkMode} className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Tabs de colas */}
      {!loading && !error && casos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {QUEUES.filter(q => q.key !== 'otros' || colas.otros.length > 0).map(q => {
            const activa = activeQueue === q.key;
            return (
              <button
                key={q.key}
                onClick={() => { setActiveQueue(q.key); setSelId(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${activa
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-300'}`}
              >
                {q.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activa ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  {colas[q.key].length}
                </span>
              </button>
            );
          })}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> en vivo
          </span>
        </div>
      )}

      {/* Filtro */}
      {!loading && !error && casos.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <input
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Filtrar en esta cola por número, asunto, cuenta, país o remesa…"
            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {filtrados.length} caso(s) en la cola
          </span>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">Cargando bandeja…</p>}
      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && casos.length === 0 && (
        <div className="text-center text-slate-400 dark:text-slate-500 py-16 text-sm">
          Todavía no llegó ningún caso. Cuando Salesforce haga <code>POST /casos</code>, aparecerán acá al instante.
        </div>
      )}

      {!loading && !error && casos.length > 0 && (
        <>
          {/* Tabla de la cola de trabajo (ordenada por fecha de llegada) */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 font-bold whitespace-nowrap">Fecha llegada ↑</th>
                  {activeQueue === 'remesa' && (
                    <>
                      <th className="px-3 py-2 font-bold whitespace-nowrap">remesa</th>
                      <th className="px-3 py-2 font-bold whitespace-nowrap">Beneficiario</th>
                      <th className="px-3 py-2 font-bold whitespace-nowrap">DNI</th>
                      <th className="px-3 py-2 font-bold whitespace-nowrap">Tipo de envío</th>
                    </>
                  )}
                  {activeQueue === 'ofac' && (
                    <>
                      <th className="px-3 py-2 font-bold whitespace-nowrap text-center">Delitos únicos</th>
                      <th className="px-3 py-2 font-bold whitespace-nowrap">Conclusión</th>
                    </>
                  )}
                  {columnas.map(k => <th key={k} className="px-3 py-2 font-bold whitespace-nowrap">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={columnas.length + (activeQueue === 'remesa' ? 4 : activeQueue === 'ofac' ? 3 : 1)} className="py-8 text-center text-slate-400">
                      Sin casos en esta cola.
                    </td>
                  </tr>
                )}
                {filtrados.map(c => {
                  const activo = sel?.id === c.id;
                  const r = c.remesa ? remesaMap[c.remesa] : undefined;
                  const rCell = (v: string | undefined) => r ? (v || '—') : (remesaMapLoading ? '…' : '—');
                  const s = screenMap[c.id];
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelId(c.id)}
                      className={`cursor-pointer border-b border-slate-100 dark:border-slate-700/50 ${activo ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(c.recibidoEn)}</td>
                      {activeQueue === 'remesa' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-sky-700 dark:text-sky-400">{c.remesa || '—'}</td>
                          <td className="px-3 py-2 max-w-[220px] truncate text-slate-700 dark:text-slate-200" title={r?.beneficiary_name}>{rCell(r?.beneficiary_name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{r ? `${r.beneficiary_dni_type} ${r.beneficiary_dni}` : (remesaMapLoading ? '…' : '—')}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{rCell(r?.tipo_envio)}</td>
                        </>
                      )}
                      {activeQueue === 'ofac' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap text-center font-bold text-slate-800 dark:text-slate-200">
                            {!s || s.estado === 'loading' ? '…' : s.estado === 'na' ? '—' : s.estado === 'error' ? '⚠️' : (s.delitosUnicos ?? 0)}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap font-semibold ${decisionColor(s?.decision)}`} title={s?.razon}>
                            {!s || s.estado === 'loading' ? 'consultando…'
                              : s.estado === 'na' ? 'Pendiente (Inspektor)'
                              : s.estado === 'error' ? 'Error'
                              : (s.decision || '—')}
                          </td>
                        </>
                      )}
                      {columnas.map(k => {
                        const t = cellText(c.datos[k]);
                        return <td key={k} title={t} className="px-3 py-2 max-w-[220px] truncate text-slate-700 dark:text-slate-200">{t}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detalle + responder (al seleccionar una fila) */}
          {sel && (
            <div className="mt-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">{sel.numeroCaso || '(sin número)'}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Recibido {fmtFecha(sel.recibidoEn)} · origen {sel.origen}</p>
                  </div>
                </div>

                {/* Datos de la remesa desde Redshift (solo cola Remesa) */}
                {activeQueue === 'remesa' && (
                  <div className="mb-5 rounded-xl border border-sky-200 dark:border-sky-800/50 bg-sky-50/60 dark:bg-sky-950/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-black text-sky-800 dark:text-sky-300">
                        💸 Remesa {sel.remesa || '—'} · datos de Redshift
                      </h3>
                      {remesaLoading && <span className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Consultando… (~3-8s)</span>}
                    </div>

                    {!sel.remesa && <p className="text-xs text-amber-600 dark:text-amber-400">No se pudo extraer el nº de TX del asunto.</p>}

                    {!remesaLoading && remesaData?.estado === 'ok' && remesaData.row && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                        {([
                          ['Beneficiario', remesaData.row.beneficiary_name],
                          ['DNI', `${remesaData.row.beneficiary_dni_type} ${remesaData.row.beneficiary_dni}`],
                          ['Customer ID', remesaData.row.customer_id],
                          ['Email', remesaData.row.beneficiary_email],
                          ['Tipo de envío', remesaData.row.tipo_envio],
                          ['Origen → Destino', `${remesaData.row.origin_country} → ${remesaData.row.destiny_country}`],
                          ['Monto USD', remesaData.row.destiny_amount_usd],
                          ['Estado TX', remesaData.row.tx_status],
                          ['Fecha TX', remesaData.row.start_date],
                        ] as [string, string | number][]).map(([k, v]) => (
                          <div key={k}>
                            <p className="font-semibold text-slate-500 dark:text-slate-400">{k}</p>
                            <p className="text-slate-800 dark:text-slate-200 break-words">{v === '' || v == null ? '—' : String(v)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!remesaLoading && remesaData?.estado === 'not_found' && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">La transacción <b>{sel.remesa}</b> no existe en la base.</p>
                    )}
                    {!remesaLoading && remesaData?.estado === 'cluster_unavailable' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Redshift no disponible: {remesaData.mensaje}</p>
                    )}
                    {!remesaLoading && remesaData?.estado === 'error' && (
                      <p className="text-xs text-red-600 dark:text-red-400">Error: {remesaData.mensaje}</p>
                    )}
                  </div>
                )}

                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(sel.datos).length === 0 && (
                      <tr><td className="py-2 text-slate-400">Sin datos en el payload.</td></tr>
                    )}
                    {Object.entries(sel.datos).map(([k, v]) => (
                      <tr key={k} className="border-b border-slate-100 dark:border-slate-700/50">
                        <td className="py-2 pr-4 font-semibold text-slate-500 dark:text-slate-400 align-top whitespace-nowrap">{k}</td>
                        <td className="py-2 text-slate-800 dark:text-slate-200 break-words">
                          {typeof v === 'object' && v !== null
                            ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
                            : String(v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Responder en Salesforce ─────────────────────────────── */}
                <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                  <button
                    onClick={() => setShowResponder(s => !s)}
                    className="flex items-center gap-2 text-sm font-bold text-sky-700 dark:text-sky-400"
                  >
                    <span>{showResponder ? '▾' : '▸'}</span> Responder en Salesforce
                  </button>

                  {showResponder && (
                    <div className="mt-4">
                      {!sfUpdateDisponible() && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                          Proxy no configurado en esta instancia (EMPRESADOCS_PROXY_URL).
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SF_CASE_FIELDS.filter(f => f.type !== 'textarea').map(field => {
                          const val = form[field.apiName];
                          const inputCls = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400';
                          return (
                            <label key={field.apiName} className="text-xs">
                              <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">{field.label}</span>
                              {field.type === 'picklist' ? (
                                <select value={String(val ?? '')} onChange={e => setField(field.apiName, e.target.value)} className={inputCls}>
                                  <option value="">— (sin cambio) —</option>
                                  {field.options!.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : field.type === 'checkbox' ? (
                                <span className="flex items-center gap-2 h-[34px]">
                                  <input type="checkbox" checked={!!val} onChange={e => setField(field.apiName, e.target.checked)} className="w-4 h-4" />
                                  <span className="text-slate-500 dark:text-slate-400">Sí</span>
                                </span>
                              ) : (
                                <input value={String(val ?? '')} onChange={e => setField(field.apiName, e.target.value)} className={inputCls} />
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {/* Campos textarea a ancho completo */}
                      {SF_CASE_FIELDS.filter(f => f.type === 'textarea').map(field => (
                        <label key={field.apiName} className="text-xs block mt-3">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">{field.label}</span>
                          <textarea
                            value={String(form[field.apiName] ?? '')}
                            onChange={e => setField(field.apiName, e.target.value)}
                            rows={2}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400"
                          />
                        </label>
                      ))}

                      <button
                        onClick={enviarRespuesta}
                        disabled={sending || !sfUpdateDisponible() || !String(form.CaseNumber ?? '').trim()}
                        className="mt-4 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold"
                      >
                        {sending ? 'Enviando…' : 'Enviar a Salesforce'}
                      </button>

                      {/* Resultado */}
                      {sfResult && (
                        <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${sfResult.ok
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300'}`}>
                          <p className="font-bold">
                            {sfResult.ok ? '✅ Caso actualizado en Salesforce' : `❌ No se pudo actualizar (HTTP ${sfResult.status})`}
                          </p>
                          {sfResult.errors?.length ? (
                            <ul className="list-disc ml-5 mt-1">{sfResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                          ) : null}
                          {sfResult.warnings?.length ? (
                            <p className="mt-1 text-amber-700 dark:text-amber-400">⚠️ {sfResult.warnings.join('; ')}</p>
                          ) : null}
                          {sfResult.updatedFields?.length ? (
                            <p className="mt-1 text-xs opacity-80">Campos actualizados: {sfResult.updatedFields.join(', ')}</p>
                          ) : null}
                          {sfResult.closed !== undefined && (
                            <p className="mt-1 text-xs opacity-80">Caso cerrado: {sfResult.closed ? 'sí' : 'no'}{sfResult.caseId ? ` · ${sfResult.caseId}` : ''}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
