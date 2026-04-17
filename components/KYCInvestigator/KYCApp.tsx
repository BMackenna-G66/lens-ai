import React, { useState } from 'react';
import {
  investigateClient,
  COUNTRY_OPTIONS,
  RISK_CONFIG,
  PROVIDER_CONFIG,
  LIST_TYPE_LABELS,
  routeProvider,
  type KYCInput,
  type KYCResult,
  type KYCMatch,
  type NosisVariable,
  type ProviderType,
} from '../../services/kycService';

// ── Props ─────────────────────────────────────────────────────────────────────
interface KYCAppProps {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

// ── Initial form state ────────────────────────────────────────────────────────
const emptyForm = (): KYCInput => ({
  country: 'CL',
  documentType: 'RUT',
  documentNumber: '',
  firstName: '',
  fatherName: '',
  motherName: '',
  birthDate: '',
  gender: undefined,
  nationality: '',
  email: '',
  phone: '',
  region: '',
  city: '',
  address: '',
  position: '',
  employer: '',
  income: '',
  tienePrioridad4: false,
  procuraduria: true,
  ramaJudicial: true,
  ramaJEPMS: true,
  nosisVR: 2,
});

// ── Small helpers ─────────────────────────────────────────────────────────────
const INSP_PDF_BASE = 'https://inspektor.datalaft.com:2121/api';

const RiskBadge: React.FC<{ risk: KYCResult['effectiveRisk'] }> = ({ risk }) => {
  const cfg = RISK_CONFIG[risk];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      RIESGO {cfg.label}
    </span>
  );
};

const ProviderBadge: React.FC<{ provider: ProviderType }> = ({ provider }) => {
  const cfg = PROVIDER_CONFIG[provider];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

const RiskDot: React.FC<{ risk: KYCMatch['risk'] }> = ({ risk }) => (
  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${RISK_CONFIG[risk]?.dot ?? 'bg-slate-400'}`} />
);

// ── Main component ────────────────────────────────────────────────────────────
export const KYCApp: React.FC<KYCAppProps> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [form, setForm] = useState<KYCInput>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KYCResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const country = COUNTRY_OPTIONS.find(c => c.code === form.country) ?? COUNTRY_OPTIONS[0];
  const provider = routeProvider(form.country);

  const set = (field: keyof KYCInput, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleCountryChange = (code: string) => {
    const c = COUNTRY_OPTIONS.find(o => o.code === code);
    setForm(prev => ({
      ...prev,
      country: code,
      documentType: c?.docTypes[0] ?? 'Pasaporte',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.documentNumber.trim() || !form.firstName.trim() || !form.fatherName.trim()) {
      setError('Completa los campos obligatorios: documento, primer nombre y apellido paterno.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setShowRaw(false);
    try {
      const res = await investigateClient(form);
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Inicio
          </button>
          <div>
            <h1 className="text-base font-black text-slate-900 dark:text-white leading-none">KYC Investigador</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Consulta AML/KYC multiproveedor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProviderBadge provider={provider} />
          <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
            {country.flag} {country.name}
          </span>
          <button
            onClick={onToggleDarkMode}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base hover:scale-110 active:scale-95 transition-all"
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Form column ── */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Country selector */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">País y Proveedor</h2>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">País *</label>
              <select
                value={form.country}
                onChange={e => handleCountryChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {COUNTRY_OPTIONS.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">Proveedor asignado</span>
                <ProviderBadge provider={provider} />
              </div>
            </div>

            {/* Document */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">Identificación *</h2>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Tipo doc.</label>
                  <select
                    value={form.documentType}
                    onChange={e => set('documentType', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {country.docTypes.map(dt => (
                      <option key={dt} value={dt}>{dt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Número *</label>
                  <input
                    type="text"
                    value={form.documentNumber}
                    onChange={e => set('documentNumber', e.target.value)}
                    placeholder={form.documentType === 'RUT' ? '12.345.678-9' : '12345678'}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Names */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">Nombres *</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Primer nombre *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={e => set('firstName', e.target.value)}
                    placeholder="JUAN CARLOS"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Apellido paterno *</label>
                  <input
                    type="text"
                    value={form.fatherName}
                    onChange={e => set('fatherName', e.target.value)}
                    placeholder="GONZÁLEZ"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Apellido materno</label>
                  <input
                    type="text"
                    value={form.motherName ?? ''}
                    onChange={e => set('motherName', e.target.value)}
                    placeholder="PÉREZ"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Optional fields */}
            <details className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <summary className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 cursor-pointer select-none">
                Datos adicionales (opcional)
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Fecha nacimiento</label>
                  <input
                    type="date"
                    value={form.birthDate ?? ''}
                    onChange={e => set('birthDate', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Género</label>
                  <select
                    value={form.gender ?? ''}
                    onChange={e => set('gender', e.target.value || undefined)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">—</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="X">X / Otro</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={e => set('email', e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Teléfono</label>
                  <input
                    type="text"
                    value={form.phone ?? ''}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+56 9 1234 5678"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Cargo</label>
                  <input
                    type="text"
                    value={form.position ?? ''}
                    onChange={e => set('position', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Empleador</label>
                  <input
                    type="text"
                    value={form.employer ?? ''}
                    onChange={e => set('employer', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </details>

            {/* Inspektor-specific options (CO) */}
            {provider === 'INSPEKTOR' && (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 p-5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-4">Opciones Inspektor</h2>
                <div className="space-y-2.5">
                  {(
                    [
                      { field: 'procuraduria',   label: 'Incluir Procuraduría' },
                      { field: 'ramaJudicial',   label: 'Incluir Rama Judicial' },
                      { field: 'ramaJEPMS',      label: 'Incluir JEP / MS' },
                      { field: 'tienePrioridad4',label: 'Incluir Prioridad 4 (bajo riesgo)' },
                    ] as { field: keyof KYCInput; label: string }[]
                  ).map(({ field, label }) => (
                    <label key={field} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form[field]}
                        onChange={e => set(field, e.target.checked)}
                        className="w-4 h-4 rounded accent-indigo-600"
                      />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Nosis-specific options (AR) */}
            {provider === 'NOSIS' && (
              <div className="bg-violet-50 dark:bg-violet-950/40 rounded-2xl border border-violet-200 dark:border-violet-800/50 p-5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-violet-500 dark:text-violet-400 mb-4">Opciones Nosis</h2>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  VR (versión de reporte, defecto: 2)
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={form.nosisVR ?? 2}
                  onChange={e => set('nosisVR', parseInt(e.target.value))}
                  className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Investigar Cliente
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl transition-colors text-sm border border-slate-200 dark:border-slate-700"
              >
                Limpiar
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
                <p className="font-bold mb-1">Error al consultar</p>
                <p className="text-xs">{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* ── Results column ── */}
        <div className="lg:col-span-3">
          {!result && !loading && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center py-24 text-slate-400 dark:text-slate-600">
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800/60 rounded-3xl flex items-center justify-center mb-6 border border-slate-200 dark:border-slate-700">
                <span className="text-4xl">🔍</span>
              </div>
              <p className="font-semibold text-slate-500 dark:text-slate-400 text-base">Resultados aparecerán aquí</p>
              <p className="text-sm mt-1 max-w-xs">Completa el formulario y haz clic en "Investigar Cliente" para iniciar la consulta AML/KYC.</p>
            </div>
          )}

          {loading && (
            <div className="h-full flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 rounded-full animate-spin mb-6" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">Consultando {PROVIDER_CONFIG[provider].label}...</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Esto puede tardar unos segundos</p>
            </div>
          )}

          {result && <ResultPanel result={result} showRaw={showRaw} onToggleRaw={() => setShowRaw(r => !r)} />}
        </div>
      </div>
    </div>
  );
};

// ── Result panel ──────────────────────────────────────────────────────────────
const ResultPanel: React.FC<{ result: KYCResult; showRaw: boolean; onToggleRaw: () => void }> = ({
  result, showRaw, onToggleRaw,
}) => {
  const rCfg = RISK_CONFIG[result.effectiveRisk];
  const pCfg = PROVIDER_CONFIG[result.providerUsed];

  const handleDownloadPDF = () => {
    if (!result.numConsulta) return;
    const token = (window as unknown as Record<string, string>).__inspToken;
    const url = `https://inspektor.datalaft.com:2121/api/ReportDownload/getReport/${result.numConsulta}`;
    const a = document.createElement('a');
    a.href = url + (token ? `?token=${encodeURIComponent(token)}` : '');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div className="space-y-5">
      {/* ── Summary card ── */}
      <div className={`rounded-2xl border-2 p-6 shadow-sm ${rCfg.bg} ${rCfg.border}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <RiskBadge risk={result.effectiveRisk} />
              <ProviderBadge provider={result.providerUsed} />
              {result.isPEP && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                  ⚠️ PEP
                </span>
              )}
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-2">{result.fullName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {result.documentNumber} · {result.country}
              {result.queryId && <span className="ml-2 text-xs opacity-70">#{result.queryId}</span>}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Coincidencias</p>
            <p className={`text-4xl font-black ${rCfg.text}`}>{result.matches.length}</p>
            {result.matches.length === 0 && (
              <p className="text-xs text-green-600 dark:text-green-400 font-semibold">Sin hallazgos</p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-current/10 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 flex-wrap gap-2">
          <span>Consultado: {new Date(result.lastChecked).toLocaleString('es-CL')}</span>
          <span>Estado: {result.providerStatus}</span>
        </div>
      </div>

      {/* ── Inspektor PDF download ── */}
      {result.providerUsed === 'INSPEKTOR' && result.numConsulta && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Reporte Inspektor disponible</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Consulta #{result.numConsulta}</p>
          </div>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </button>
        </div>
      )}

      {/* ── Matches list ── */}
      {result.matches.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
            Coincidencias encontradas ({result.matches.length})
          </h3>
          <div className="space-y-3">
            {result.matches.map((m, i) => (
              <MatchCard key={i} match={m} />
            ))}
          </div>
        </div>
      )}

      {/* ── Nosis variables table ── */}
      {result.providerUsed === 'NOSIS' && result.nosisVariables && result.nosisVariables.length > 0 && (
        <NosisVariablesTable variables={result.nosisVariables} />
      )}

      {/* ── PEP level info ── */}
      {result.isPEP && result.pepLevel && (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/50 p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">Nivel PEP</h3>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{result.pepLevel}</p>
        </div>
      )}

      {/* ── Raw payload accordion ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <button
          onClick={onToggleRaw}
          className="w-full flex items-center justify-between px-5 py-4 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <span>Payload crudo del proveedor</span>
          <svg
            className={`w-4 h-4 transition-transform ${showRaw ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showRaw && (
          <div className="border-t border-slate-200 dark:border-slate-800 p-4">
            <pre className="text-[10px] text-slate-500 dark:text-slate-400 overflow-auto max-h-96 whitespace-pre-wrap break-all font-mono bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              {JSON.stringify(result.rawPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Match card ────────────────────────────────────────────────────────────────
const MatchCard: React.FC<{ match: KYCMatch }> = ({ match }) => {
  const rCfg = RISK_CONFIG[match.risk];
  const label = LIST_TYPE_LABELS[match.listType] ?? match.listType;

  return (
    <div className={`rounded-xl border p-4 ${rCfg.bg} ${rCfg.border}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <RiskDot risk={match.risk} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${rCfg.text}`}>{label}</span>
            {match.priority !== null && match.priority !== undefined && (
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                Prioridad {match.priority}
              </span>
            )}
          </div>
          {match.matchedName && (
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{match.matchedName}</p>
          )}
          {match.matchedDocument && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{match.matchedDocument}</p>
          )}
          {match.source && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Fuente: {match.source}</p>
          )}
          {match.offense && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              <span className="font-semibold">Delito/Sanción:</span> {match.offense}
            </p>
          )}
          {match.zone && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Zona: {match.zone}</p>
          )}
          {match.lastUpdated && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Actualizado: {match.lastUpdated}</p>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex-shrink-0 ${rCfg.bg} ${rCfg.text} ${rCfg.border}`}>
          {rCfg.label}
        </span>
      </div>
    </div>
  );
};

// ── Nosis variables table ─────────────────────────────────────────────────────
const NosisVariablesTable: React.FC<{ variables: NosisVariable[] }> = ({ variables }) => {
  const [filter, setFilter] = useState('');
  const filtered = variables.filter(v =>
    !filter || v.name.toLowerCase().includes(filter.toLowerCase()) || v.description?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Variables Nosis ({variables.length})
        </h3>
        <input
          type="text"
          placeholder="Filtrar variables..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 w-44"
        />
      </div>
      <div className="overflow-auto max-h-96 rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="text-left px-3 py-2.5 font-bold text-slate-500 dark:text-slate-400">Variable</th>
              <th className="text-left px-3 py-2.5 font-bold text-slate-500 dark:text-slate-400">Valor</th>
              <th className="text-left px-3 py-2.5 font-bold text-slate-500 dark:text-slate-400 hidden md:table-cell">Descripción</th>
              <th className="text-left px-3 py-2.5 font-bold text-slate-500 dark:text-slate-400 hidden lg:table-cell">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/30'}`}>
                <td className="px-3 py-2 font-mono text-violet-700 dark:text-violet-400 whitespace-nowrap">{v.name}</td>
                <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{v.value}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden md:table-cell">{v.description ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400 dark:text-slate-500 hidden lg:table-cell whitespace-nowrap">{v.date ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">Sin resultados para "{filter}"</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
