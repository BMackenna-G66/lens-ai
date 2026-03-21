import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { computeDashboardStats, DashboardStats } from '../services/analyticsService';
import { db } from '../services/dbService';
import { ProcessedDocument } from '../types';

// ─── Palette ──────────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa'];
const MODULE_COLORS: Record<string, string> = {
  'Analizador': '#6366f1',
  'Límites Trans.': '#22d3ee',
  'Lens Crypto': '#f59e0b',
  'Evaluador AML': '#10b981',
};

const COUNTRY_FLAGS: Record<string, string> = {
  chile: '🇨🇱', colombia: '🇨🇴', peru: '🇵🇪', brasil: '🇧🇷',
  usa: '🇺🇸', francia: '🇫🇷', dinamarca: '🇩🇰', china: '🇨🇳',
  internacional: '🌐',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, subtitle }) => (
  <div className={`rounded-xl p-5 flex items-center gap-4 border ${color} bg-white dark:bg-slate-800`}>
    <div className="text-3xl">{icon}</div>
    <div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

// Custom tooltip for dark mode compatibility
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color }} className="font-semibold">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { user, firebaseReady, login, logout, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentDocs, setRecentDocs] = useState<ProcessedDocument[]>([]);
  const [dbTotal, setDbTotal] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    setStats(computeDashboardStats());
    // Pull last 10 documents from Dexie
    db.documents.toArray().then(docs => {
      setDbTotal(docs.length);
      // Sort by id descending (newest UUIDs are last, so reverse)
      const sorted = [...docs].reverse().slice(0, 10);
      setRecentDocs(sorted);
    }).catch(() => {});
  }, [refreshKey]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
      ERROR: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      ANALYZING: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      QUEUED: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    };
    const cls = map[status] || map['QUEUED'];
    const labels: Record<string, string> = {
      COMPLETED: 'Completado', ERROR: 'Error', ANALYZING: 'Analizando', QUEUED: 'En cola',
      READING: 'Leyendo', DETECTING_COUNTRY: 'Detectando'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin text-2xl mr-3">⏳</div>
        Cargando estadísticas…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Actividad y estadísticas de uso de Lens AI</p>
        </div>

        {/* Auth block */}
        <div className="flex items-center gap-3">
          {authLoading ? (
            <div className="text-slate-400 text-sm">Cargando sesión…</div>
          ) : user ? (
            <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2">
              {user.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-none">
                  {user.displayName || 'Usuario'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={logout}
                className="ml-2 text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors font-medium"
              >
                Salir
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2">
                <span className="text-xl">👤</span>
                <span className="text-sm text-slate-500 dark:text-slate-400 italic">Invitado</span>
              </div>
              {firebaseReady && (
                <button
                  onClick={login}
                  className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Iniciar sesión con Google
                </button>
              )}
              {!firebaseReady && (
                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-1.5">
                  🔑 Auth no configurada
                </span>
              )}
            </div>
          )}
          <button
            onClick={refresh}
            title="Actualizar estadísticas"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            🔄
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Documentos analizados"
          value={dbTotal > 0 ? dbTotal : stats.totalDocuments}
          icon="📄"
          color="border-indigo-200 dark:border-indigo-800"
          subtitle="Total acumulado"
        />
        <StatCard
          label="Esta semana"
          value={stats.documentsThisWeek}
          icon="📅"
          color="border-cyan-200 dark:border-cyan-800"
          subtitle="Últimos 7 días"
        />
        <StatCard
          label="Alertas de riesgo"
          value={stats.riskAlertsDetected}
          icon="🚨"
          color="border-red-200 dark:border-red-800"
          subtitle="Actividad sospechosa"
        />
        <StatCard
          label="Wallets analizadas"
          value={stats.cryptoAnalyzed}
          icon="🔐"
          color="border-amber-200 dark:border-amber-800"
          subtitle="Módulo Crypto"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Daily activity */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
            📈 Actividad diaria (últimos 14 días)
          </h3>
          {stats.dailyActivity.every(d => d.documentos === 0) ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm">Sin actividad registrada aún</p>
              <p className="text-xs">Los documentos analizados aparecerán aquí</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.dailyActivity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="documentos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Module usage */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
            🧩 Uso por módulo
          </h3>
          {stats.moduleUsage.every(m => m.value === 0) ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
              <span className="text-3xl">🧩</span>
              <p className="text-sm">Sin visitas registradas aún</p>
              <p className="text-xs">Navega entre módulos para ver estadísticas</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats.moduleUsage}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {stats.moduleUsage.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={MODULE_COLORS[entry.name] || COLORS[index % COLORS.length]}
                    />
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

      {/* ── Countries + Recent docs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Top countries */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
            🌍 Países detectados
          </h3>
          {stats.topCountries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-slate-500 gap-1">
              <span className="text-2xl">🌎</span>
              <p className="text-xs">Sin datos de países aún</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.topCountries.map(({ country, count }) => {
                const max = stats.topCountries[0].count;
                const pct = Math.round((count / max) * 100);
                const flag = COUNTRY_FLAGS[country.toLowerCase()] || '🏳️';
                const label = country.charAt(0).toUpperCase() + country.slice(1);
                return (
                  <div key={country}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">{flag} {label}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent documents */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">
            📋 Documentos recientes
          </h3>
          {recentDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-slate-500 gap-1">
              <span className="text-2xl">📭</span>
              <p className="text-xs">No hay documentos procesados todavía</p>
              <p className="text-xs">Usa el Analizador para empezar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left py-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">Archivo</th>
                    <th className="text-left py-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">País</th>
                    <th className="text-left py-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">Estado</th>
                    <th className="text-left py-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDocs.map(doc => (
                    <tr
                      key={doc.id}
                      className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-2 px-1">
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]" title={doc.fileName}>
                          {doc.fileName}
                        </p>
                      </td>
                      <td className="py-2 px-1 text-slate-500 dark:text-slate-400">
                        {doc.detectedCountry
                          ? `${COUNTRY_FLAGS[doc.detectedCountry.toLowerCase()] || '🏳️'} ${doc.detectedCountry}`
                          : '—'}
                      </td>
                      <td className="py-2 px-1">{statusBadge(doc.status)}</td>
                      <td className="py-2 px-1">
                        {doc.riskAnalysisResult?.suspiciousActivity?.detected ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                            🚨 Alerta
                          </span>
                        ) : doc.riskAnalysisResult ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            ✅ Limpio
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Firebase setup hint ── */}
      {!firebaseReady && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
            🔑 Activa Google Auth en 5 pasos
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-xs text-amber-700 dark:text-amber-400">
            <li>Ve a <strong>console.firebase.google.com</strong> → "Agregar proyecto" (nombre: <code>lens-ai</code>)</li>
            <li>En el proyecto: Authentication → "Comenzar" → proveedor <strong>Google</strong> → Activar → Guardar</li>
            <li>Configuración del proyecto → "Agregar app" (Web) → Copia el objeto <code>firebaseConfig</code></li>
            <li>En GitHub: Settings → Secrets → Actions → agrega los 4 secrets:<br/>
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">FIREBASE_API_KEY</code>&nbsp;
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">FIREBASE_AUTH_DOMAIN</code>&nbsp;
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">FIREBASE_PROJECT_ID</code>&nbsp;
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">FIREBASE_APP_ID</code>
            </li>
            <li>En Authentication → Settings → Authorized domains → agrega <code>bmackenna-g66.github.io</code></li>
          </ol>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">El Dashboard ya funciona sin Auth — registra actividad de este dispositivo automáticamente.</p>
        </div>
      )}
    </div>
  );
};
