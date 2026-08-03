import React, { useEffect, useMemo, useState } from 'react';
import { subscribeCasos, isCasosAvailable, CasoSF } from '../services/casosService';
import {
  sendCaseUpdate, sfUpdateDisponible, PRODUCT_OPTIONS, SFCaseUpdate, SFUpdateResult,
} from '../services/salesforceCaseService';

// Valores por defecto del formulario de respuesta, a partir del caso seleccionado.
function defaultForm(c: CasoSF | null): SFCaseUpdate {
  return {
    CaseNumber: c?.numeroCaso ?? '',
    C_Review__c: '',
    Senales_de_Alerta__c: '',
    C_Status__c: 'Approved',
    CAT_CMPL__c: '',
    Comments: '',
    Country__c: c?.pais ?? '',
    Product__c: PRODUCT_OPTIONS[0],
    Sleep__c: null,
    Tipo_de_Caso_Compliance__c: '',
    Type: 'Compliance',
    PEP__c: false,
    'Customer ID': '',
  };
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

export const CasosInbox: React.FC<CasosInboxProps> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [casos, setCasos] = useState<CasoSF[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

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

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return casos;
    return casos.filter(c =>
      [c.numeroCaso, c.asunto, c.nombreCuenta, c.pais].some(v => (v || '').toLowerCase().includes(q)));
  }, [casos, filtro]);

  const sel = useMemo(() => casos.find(c => c.id === selId) ?? filtrados[0] ?? null, [casos, filtrados, selId]);

  // ── Responder en Salesforce ────────────────────────────────────────────────
  const [showResponder, setShowResponder] = useState(false);
  const [form, setForm] = useState<SFCaseUpdate>(defaultForm(null));
  const [sending, setSending] = useState(false);
  const [sfResult, setSfResult] = useState<SFUpdateResult | null>(null);

  // Al cambiar de caso, reinicia el formulario con los datos de ese caso.
  useEffect(() => {
    setForm(defaultForm(sel));
    setSfResult(null);
  }, [sel?.id]);

  const setField = <K extends keyof SFCaseUpdate>(k: K, v: SFCaseUpdate[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const enviarRespuesta = async () => {
    setSending(true);
    setSfResult(null);
    try {
      const res = await sendCaseUpdate(form);
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

      {/* Barra de estado / filtro */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar por número, asunto, cuenta o país…"
          className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {filtrados.length} / {casos.length} casos
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> en vivo
        </span>
      </div>

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
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          {/* Lista */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden max-h-[70vh] overflow-y-auto">
            {filtrados.map(c => {
              const activo = sel?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelId(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 transition-colors ${activo ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white truncate">{c.numeroCaso || '(sin número)'}</span>
                    {c.pais && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{c.pais}</span>}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">{c.asunto || '—'}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-500 truncate">{c.nombreCuenta}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{fmtFecha(c.recibidoEn)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 max-h-[70vh] overflow-y-auto">
            {sel ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">{sel.numeroCaso || '(sin número)'}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Recibido {fmtFecha(sel.recibidoEn)} · origen {sel.origen}</p>
                  </div>
                </div>
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
                        {([
                          ['CaseNumber', 'Número del caso'],
                          ['C_Review__c', 'C_Review__c'],
                          ['Senales_de_Alerta__c', 'Señales de alerta'],
                          ['C_Status__c', 'Estado (C_Status__c)'],
                          ['CAT_CMPL__c', 'CAT_CMPL__c'],
                          ['Country__c', 'País'],
                          ['Tipo_de_Caso_Compliance__c', 'Tipo de caso compliance'],
                          ['Type', 'Type'],
                          ['Customer ID', 'Customer ID'],
                          ['Sleep__c', 'Sleep__c'],
                        ] as [keyof SFCaseUpdate, string][]).map(([key, label]) => (
                          <label key={String(key)} className="text-xs">
                            <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</span>
                            <input
                              value={(form[key] as string) ?? ''}
                              onChange={e => setField(key, e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400"
                            />
                          </label>
                        ))}

                        {/* Product__c — picklist (labels válidos de Salesforce) */}
                        <label className="text-xs">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Producto (Product__c)</span>
                          <select
                            value={form.Product__c ?? ''}
                            onChange={e => setField('Product__c', e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400"
                          >
                            {PRODUCT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>

                        {/* PEP__c — checkbox */}
                        <label className="text-xs flex items-end gap-2 pb-1.5">
                          <input
                            type="checkbox"
                            checked={!!form.PEP__c}
                            onChange={e => setField('PEP__c', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="font-semibold text-slate-500 dark:text-slate-400">PEP__c (Persona Expuesta)</span>
                        </label>
                      </div>

                      {/* Comments — textarea ancho completo */}
                      <label className="text-xs block mt-3">
                        <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Comentarios</span>
                        <textarea
                          value={form.Comments ?? ''}
                          onChange={e => setField('Comments', e.target.value)}
                          rows={2}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400"
                        />
                      </label>

                      <button
                        onClick={enviarRespuesta}
                        disabled={sending || !sfUpdateDisponible() || !form.CaseNumber?.trim()}
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
              </>
            ) : (
              <p className="text-sm text-slate-400 py-12 text-center">Seleccioná un caso.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
