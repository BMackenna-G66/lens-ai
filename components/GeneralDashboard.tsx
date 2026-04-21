import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getAnalyticsEvents, getAllUsers, getTokenEvents, FirestoreAnalyticsEvent, FirestoreTokenEvent, UserProfile } from '../services/firestoreService';
import { isFirebaseConfigured } from '../services/firebaseService';

// ─── Palette ──────────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa'];

interface GeneralDashboardProps {
  onBack: () => void;
}

interface UserStats {
  profile: UserProfile;
  totalDocs: number;
  topModule: string;
  lastActivity: number | null;
}

// Custom tooltip
const CustomTooltip: React.FC<{ active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }} className="font-semibold">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Skeleton loader
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`} />
);

export const GeneralDashboard: React.FC<GeneralDashboardProps> = ({ onBack }) => {
  const [events, setEvents] = useState<FirestoreAnalyticsEvent[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tokenEvents, setTokenEvents] = useState<FirestoreTokenEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const firebaseReady = isFirebaseConfigured();

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([getAnalyticsEvents(2000), getAllUsers(), getTokenEvents(1000)])
      .then(([evts, usrs, tkns]) => {
        setEvents(evts);
        setUsers(usrs);
        setTokenEvents(tkns);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, firebaseReady]);

  // ── Derived stats ────────────────────────────────────────────────────────────

  const totalDocs = events.filter(e => e.eventType === 'document_processed').length;
  const activeAnalysts = users.filter(u => u.role === 'Analista').length;
  const riskAlerts = events.filter(e => e.hasRisk).length;
  const cryptoEvents = events.filter(e => e.eventType === 'crypto_analyzed').length;

  // Daily activity last 14 days
  const now = Date.now();
  const dailyActivity: { date: string; documentos: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const count = events.filter(
      e => e.eventType === 'document_processed' &&
        e.timestamp >= dayStart.getTime() &&
        e.timestamp <= dayEnd.getTime(),
    ).length;
    const label = dayStart.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    dailyActivity.push({ date: label, documentos: count });
  }

  // Module usage pie
  const moduleCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.eventType === 'module_visit') {
      moduleCounts[e.module] = (moduleCounts[e.module] || 0) + 1;
    }
  }
  const moduleUsage = Object.entries(moduleCounts).map(([name, value]) => ({ name, value }));

  // Per-user breakdown
  const userStats: UserStats[] = users.map(profile => {
    const userEvents = events.filter(e => e.userId === profile.uid);
    const docEvents = userEvents.filter(e => e.eventType === 'document_processed');
    const visitCounts: Record<string, number> = {};
    for (const e of userEvents) {
      if (e.eventType === 'module_visit') {
        visitCounts[e.module] = (visitCounts[e.module] || 0) + 1;
      }
    }
    const topModule = Object.entries(visitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    const lastActivity = userEvents.length > 0 ? Math.max(...userEvents.map(e => e.timestamp)) : null;
    return { profile, totalDocs: docEvents.length, topModule, lastActivity };
  });

  const formatDate = (ts: number | null) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (ts: number) =>
    new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const fmtTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
    : String(n);

  // ── Token derived stats ──────────────────────────────────────────────────────
  const totalTokensAll  = tokenEvents.reduce((s, e) => s + e.totalTokens, 0);
  const totalPromptAll  = tokenEvents.reduce((s, e) => s + e.promptTokens, 0);
  const totalRespAll    = tokenEvents.reduce((s, e) => s + e.responseTokens, 0);

  // Per-operation summary
  const opMap: Record<string, { calls: number; prompt: number; response: number; total: number }> = {};
  for (const e of tokenEvents) {
    if (!opMap[e.operation]) opMap[e.operation] = { calls: 0, prompt: 0, response: 0, total: 0 };
    opMap[e.operation].calls++;
    opMap[e.operation].prompt   += e.promptTokens;
    opMap[e.operation].response += e.responseTokens;
    opMap[e.operation].total    += e.totalTokens;
  }
  const opSummary = Object.entries(opMap).sort((a, b) => b[1].total - a[1].total);

  // Daily tokens last 14 days
  const dailyTokens: { date: string; tokens: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const total = tokenEvents
      .filter(e => e.timestamp >= dayStart.getTime() && e.timestamp <= dayEnd.getTime())
      .reduce((s, e) => s + e.totalTokens, 0);
    dailyTokens.push({ date: dayStart.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }), tokens: total });
  }

  // Docs per user (bar chart)
  const docsByUser = userStats
    .filter(u => u.totalDocs > 0)
    .sort((a, b) => b.totalDocs - a.totalDocs)
    .map(u => ({
      name: u.profile.displayName?.split(' ').slice(0, 2).join(' ') || u.profile.email?.split('@')[0] || 'Usuario',
      docs: u.totalDocs,
    }));

  // Docs by country (bar chart)
  const countryCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.eventType === 'document_processed' && e.country) {
      countryCounts[e.country] = (countryCounts[e.country] || 0) + 1;
    }
  }
  const docsByCountry = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([country, docs]) => ({ country, docs }));

  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold mb-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Inicio
        </button>
        <div className="max-w-xl mx-auto mt-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-amber-200 dark:border-amber-700 p-8">
          <span className="text-4xl mb-4 block">🔑</span>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Firebase no configurado</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            El Dashboard General requiere Firestore. Configura las variables de entorno de Firebase para activar esta funcionalidad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Inicio
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard General</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Actividad acumulada de todos los analistas</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          title="Actualizar"
        >
          🔄
        </button>
      </div>

      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <div className="rounded-xl p-5 flex items-center gap-4 border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800">
                <span className="text-3xl">📄</span>
                <div>
                  <p className="text-2xl font-bold">{totalDocs}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Documentos Analizados</p>
                </div>
              </div>
              <div className="rounded-xl p-5 flex items-center gap-4 border border-cyan-200 dark:border-cyan-800 bg-white dark:bg-slate-800">
                <span className="text-3xl">👥</span>
                <div>
                  <p className="text-2xl font-bold">{activeAnalysts}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Analistas Activos</p>
                </div>
              </div>
              <div className="rounded-xl p-5 flex items-center gap-4 border border-red-200 dark:border-red-800 bg-white dark:bg-slate-800">
                <span className="text-3xl">🚨</span>
                <div>
                  <p className="text-2xl font-bold">{riskAlerts}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Alertas de Riesgo Detectadas</p>
                </div>
              </div>
              <div className="rounded-xl p-5 flex items-center gap-4 border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800">
                <span className="text-3xl">🔐</span>
                <div>
                  <p className="text-2xl font-bold">{cryptoEvents}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Análisis Cripto</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily activity bar chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
              📈 Actividad diaria (últimos 14 días)
            </h3>
            {loading ? (
              <Skeleton className="h-48" />
            ) : dailyActivity.every(d => d.documentos === 0) ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm">Sin actividad registrada</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyActivity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="documentos" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Module usage pie chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
              🧩 Uso por módulo (todos los usuarios)
            </h3>
            {loading ? (
              <Skeleton className="h-48" />
            ) : moduleUsage.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                <span className="text-3xl">🧩</span>
                <p className="text-sm">Sin datos de módulos aún</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={moduleUsage}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {moduleUsage.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-slate-600 dark:text-slate-400">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* New charts row: docs per user + docs by country */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Docs processed per user */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
              👤 Archivos procesados por usuario
            </h3>
            {loading ? (
              <Skeleton className="h-48" />
            ) : docsByUser.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm">Sin documentos procesados aún</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={docsByUser} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="docs" name="Documentos" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Docs by country */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
              🌎 Archivos revisados por país de escritura
            </h3>
            {loading ? (
              <Skeleton className="h-48" />
            ) : docsByCountry.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                <span className="text-3xl">🌎</span>
                <p className="text-sm">Sin datos de país registrados aún</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={docsByCountry} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="country" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="docs" name="Documentos" radius={[4, 4, 0, 0]}>
                    {docsByCountry.map((entry, index) => (
                      <Cell key={entry.country} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Token Usage Section ─────────────────────────────────────────────────── */}
        {/* Token stat cards */}
        <div>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <span>🧠</span> Consumo de Tokens IA
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
            ) : (
              <>
                <div className="rounded-xl p-4 flex items-center gap-4 border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800">
                  <span className="text-3xl">🧠</span>
                  <div>
                    <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{fmtTokens(totalTokensAll)}</p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens totales consumidos</p>
                  </div>
                </div>
                <div className="rounded-xl p-4 flex items-center gap-4 border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-800">
                  <span className="text-3xl">📥</span>
                  <div>
                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{fmtTokens(totalPromptAll)}</p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens de entrada (prompt)</p>
                  </div>
                </div>
                <div className="rounded-xl p-4 flex items-center gap-4 border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800">
                  <span className="text-3xl">📤</span>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtTokens(totalRespAll)}</p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens de salida (respuesta)</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tokens per day chart + per-operation table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily tokens bar chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
              📊 Tokens consumidos por día (últimos 14 días)
            </h3>
            {loading ? (
              <Skeleton className="h-48" />
            ) : dailyTokens.every(d => d.tokens === 0) ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm">Sin tokens registrados aún</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyTokens} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => fmtTokens(v as number)} />
                  <Tooltip
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 shadow-lg text-sm">
                          <p className="font-medium text-slate-700 dark:text-slate-200">{label}</p>
                          <p className="text-violet-500 font-semibold">Tokens: {fmtTokens((payload[0].value as number) ?? 0)}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="tokens" name="Tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Per-operation summary table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
              ⚙️ Consumo por operación
            </h3>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : opSummary.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                <span className="text-3xl">⚙️</span>
                <p className="text-sm">Sin datos de operaciones aún</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-800">
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Operación</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Llamadas</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Entrada</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Salida</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opSummary.map(([op, stats]) => (
                      <tr key={op} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300 font-medium">{op}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500 dark:text-slate-400">{stats.calls}</td>
                        <td className="py-1.5 px-2 text-right text-sky-600 dark:text-sky-400">{fmtTokens(stats.prompt)}</td>
                        <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400">{fmtTokens(stats.response)}</td>
                        <td className="py-1.5 px-2 text-right text-violet-600 dark:text-violet-400 font-semibold">{fmtTokens(stats.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Token event log */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
            📋 Evolutivo de uso de tokens (últimas 50 operaciones)
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
            </div>
          ) : tokenEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-slate-400 dark:text-slate-500 gap-1">
              <span className="text-2xl">🧠</span>
              <p className="text-xs">Sin registros de tokens aún. Se empezarán a registrar desde ahora.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Fecha</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Usuario</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Operación</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Entrada</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Salida</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-500 dark:text-slate-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenEvents.slice(0, 50).map((ev, idx) => (
                    <tr
                      key={ev.id ?? idx}
                      className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDateTime(ev.timestamp)}</td>
                      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300 max-w-[120px] truncate" title={ev.userEmail}>
                        {ev.userName || ev.userEmail?.split('@')[0] || '—'}
                      </td>
                      <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300 font-medium">{ev.operation}</td>
                      <td className="py-1.5 px-2 text-right text-sky-600 dark:text-sky-400">{fmtTokens(ev.promptTokens)}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400">{fmtTokens(ev.responseTokens)}</td>
                      <td className="py-1.5 px-2 text-right text-violet-600 dark:text-violet-400 font-bold">{fmtTokens(ev.totalTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* User breakdown table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
            👤 Actividad por usuario
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-slate-400 dark:text-slate-500 gap-1">
              <span className="text-2xl">👥</span>
              <p className="text-xs">Sin usuarios registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">Usuario</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">Rol</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">Módulo más usado</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">Docs Analizados</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">Última Actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.map(({ profile, totalDocs: docs, topModule, lastActivity }) => (
                    <tr
                      key={profile.uid}
                      className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {profile.photoURL ? (
                            <img src={profile.photoURL} alt="avatar" className="w-7 h-7 rounded-full" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                              {(profile.displayName || profile.email || 'U')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-700 dark:text-slate-300 text-xs">{profile.displayName || '—'}</p>
                            <p className="text-[10px] text-slate-400">{profile.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          profile.role === 'Lider'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          {profile.role}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-slate-600 dark:text-slate-400 text-xs">{topModule}</td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300 font-semibold text-xs">{docs}</td>
                      <td className="py-2 px-2 text-slate-500 dark:text-slate-400 text-xs">{formatDate(lastActivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
