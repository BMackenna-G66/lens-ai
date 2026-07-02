import React, { useState } from 'react';
import { search360, hasRegcheqKey } from '../services/lens360Service';
import { Lens360Result, Lens360Verdict, Lens360PersonType } from '../types/lens360';
import { ProfileDetails } from './CriminalProfiler/ProfileDetails';

interface Lens360Props {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const VERDICT_STYLE: Record<Lens360Verdict, { label: string; cls: string; icon: string }> = {
  ALTO:      { label: 'RIESGO ALTO',    cls: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',            icon: '⛔' },
  MEDIO:     { label: 'RIESGO MEDIO',   cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800', icon: '⚠️' },
  BAJO:      { label: 'RIESGO BAJO',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800', icon: '✅' },
  SIN_DATOS: { label: 'SIN DATOS',      cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',   icon: '❔' },
};

const Card: React.FC<{ title: string; badge?: string; children: React.ReactNode }> = ({ title, badge, children }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">{title}</h3>
      {badge && <span className="text-[10px] font-semibold text-slate-400">{badge}</span>}
    </div>
    {children}
  </div>
);

export const Lens360: React.FC<Lens360Props> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [rut, setRut] = useState('');
  const [nombre, setNombre] = useState('');
  const [country, setCountry] = useState('CL');
  const [personType, setPersonType] = useState<Lens360PersonType>('natural');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Lens360Result | null>(null);

  const canSearch = rut.trim().length > 0 && (country !== 'CO' || nombre.trim().length > 0);

  const handleSearch = async () => {
    if (!canSearch || loading) return;
    if (!hasRegcheqKey()) { setError('Falta la variable de entorno VITE_REGCHEQ_API_KEY.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await search360({ rut: rut.trim(), nombre: nombre.trim(), country, personType });
      setResult(res);
    } catch (e) {
      setError(`La consulta falló. ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 md:p-8">
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Inicio
          </button>
          <button onClick={onToggleDarkMode} title="Cambiar tema" className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white">🔭 Vista 360°</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
            Consulta consolidada en vivo de una persona o empresa: screening AML Chile (Regcheq),
            antecedentes penales + decisión criminal, y screening Colombia (Inspektor).
          </p>
        </header>

        {/* Search form */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">RUT / DNI / NIT</label>
              <input
                value={rut} onChange={e => setRut(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="12345678-9"
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">País</label>
              <select value={country} onChange={e => setCountry(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-100">
                <option value="CL">Chile</option>
                <option value="CO">Colombia</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Tipo</label>
              <select value={personType} onChange={e => setPersonType(e.target.value as Lens360PersonType)}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-100">
                <option value="natural">Persona natural</option>
                <option value="legal">Persona jurídica</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Nombre {country === 'CO' && <span className="text-red-500">*</span>}
              </label>
              <input
                value={nombre} onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={country === 'CO' ? 'Requerido para Colombia' : 'Opcional'}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSearch} disabled={!canSearch || loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? 'Consultando…' : '🔍 Consultar 360°'}
            </button>
            {country === 'CO' && (
              <span className="text-[11px] text-slate-400">Colombia (Inspektor) requiere nombre completo.</span>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-slate-400">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Consultando fuentes en vivo…</p>
          </div>
        )}

        {result && !loading && <ResultView result={result} />}
      </div>
    </div>
  );
};

const ResultView: React.FC<{ result: Lens360Result }> = ({ result }) => {
  const v = VERDICT_STYLE[result.verdict];
  const coincidencias = result.amlHits.filter(h => h.coincidence);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="space-y-5">
      {/* Veredicto + identidad */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{result.nombre}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {result.rut} · {result.personType === 'legal' ? 'Persona jurídica' : 'Persona natural'} · {result.country}
              {result.pepLevel && ` · PEP: ${result.pepLevel}`}
              {result.regcheqRisk && ` · Riesgo Regcheq: ${result.regcheqRisk}`}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-black text-sm shrink-0 ${v.cls}`}>
            <span>{v.icon}</span> {v.label}
          </div>
        </div>
        <ul className="mt-4 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
          {result.verdictReasons.map((r, i) => (
            <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2"><span className="text-slate-400">•</span>{r}</li>
          ))}
        </ul>
        <p className="text-[10px] text-slate-400 mt-3">
          Fuentes consultadas: {result.sources.regcheq ? 'Regcheq ✓' : 'Regcheq ✗'}
          {result.country === 'CO' && (result.sources.inspektor ? ' · Inspektor ✓' : ' · Inspektor ✗')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AML Chile (Regcheq) */}
        <Card title="Screening AML · Chile (Regcheq)" badge={`${coincidencias.length} coincidencia(s)`}>
          {result.amlHits.length === 0 ? (
            <p className="text-xs text-slate-400">Sin datos de listas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {result.amlHits.map((h, i) => (
                <span key={i} className={`text-[11px] px-2 py-1 rounded-lg border font-medium ${
                  h.coincidence
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
                    : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                }`}>
                  {h.coincidence ? '⚑ ' : ''}{h.nombre}
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Antecedentes penales + decisión criminal */}
        <Card title="Antecedentes Penales · Decisión Criminal" badge={`${result.crimes.length} causa(s)`}>
          {result.criminalDecision && (
            <div className="mb-3 p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400">Decisión: {result.criminalDecision.decision}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{result.criminalDecision.razon}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span>Puntaje: <strong className="text-slate-700 dark:text-slate-300">{result.criminalDecision.totalEquivalente}</strong></span>
                <span>Precedentes: <strong className="text-slate-700 dark:text-slate-300">{result.criminalDecision.precedentes}</strong> ({result.criminalDecision.preScore} pts)</span>
                <span>No precedentes: <strong className="text-slate-700 dark:text-slate-300">{result.criminalDecision.noPrecedentes}</strong> ({result.criminalDecision.noPreScore} pts)</span>
              </div>
            </div>
          )}
          {result.crimes.length === 0 ? (
            <p className="text-xs text-slate-400">Sin causas penales registradas.</p>
          ) : (
            <>
              <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                {result.crimes.map((c, i) => (
                  <li key={i} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{c.crimen}</span>
                    <span className="text-slate-400">
                      {c.estado && ` · ${c.estado}`}{c.fecha && ` · ${c.fecha}`}{c.ruc && ` · RUC ${c.ruc}`}
                    </span>
                  </li>
                ))}
              </ul>
              {result.criminalProfile && (
                <button
                  onClick={() => setShowDetail(true)}
                  className="mt-3 w-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 rounded-lg py-2 transition-colors"
                >
                  🔍 Ver ficha de análisis criminal detallada
                </button>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Colombia (Inspektor) */}
      {result.country === 'CO' && (
        <Card title="Screening AML · Colombia (Inspektor)" badge={result.inspektor ? `${result.inspektor.coincidencias} coincidencia(s)` : undefined}>
          {result.inspektor?.error ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No se pudo consultar Inspektor: {result.inspektor.error}
            </p>
          ) : !result.inspektor || result.inspektor.hits.length === 0 ? (
            <p className="text-xs text-slate-400">Sin coincidencias en listas de Colombia.</p>
          ) : (
            <ul className="space-y-1.5 max-h-52 overflow-y-auto">
              {result.inspektor.hits.map((h, i) => (
                <li key={i} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{h.grupo}</span>
                  {h.detalle && <span className="text-slate-400"> · {h.detalle}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Ficha de análisis criminal detallada (reutiliza ProfileDetails del Criminal Profiler) */}
      {showDetail && result.criminalProfile && (
        <ProfileDetails
          profile={result.criminalProfile}
          onClose={() => setShowDetail(false)}
          onUpdate={() => { /* 360 es de solo lectura, sin persistencia */ }}
        />
      )}
    </div>
  );
};
