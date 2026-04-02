import React from 'react';
import { useAuth } from '../context/AuthContext';

type Suite = 'compliance' | 'criminal' | 'admin' | 'general-dashboard' | 'regcheq';

interface AppLauncherProps {
  onSelect: (suite: Suite) => void;
}

export const AppLauncher: React.FC<AppLauncherProps> = ({ onSelect }) => {
  const { user, logout, firebaseReady, role, userProfile } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-12">
          <div className="text-center flex-1">
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">LENS AI</h1>
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-[0.3em] mt-1">Suite de Herramientas · Global66</p>
          </div>
          {user && (
            <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/50 rounded-2xl px-4 py-2">
              {user.photoURL && <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />}
              <div className="text-left hidden sm:block">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white leading-none">{user.displayName?.split(' ')[0]}</p>
                  {role && (
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      role === 'Lider'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-600/30'
                        : 'bg-slate-700 text-slate-400 border-slate-600/50'
                    }`}>
                      {role}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
              </div>
              {firebaseReady && (
                <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 ml-2 font-semibold">Salir</button>
              )}
            </div>
          )}
        </div>

        {/* Suite cards */}
        <p className="text-center text-slate-400 text-sm mb-8 font-medium">Selecciona la herramienta que deseas usar</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Compliance Suite */}
          <button
            onClick={() => onSelect('compliance')}
            className="group relative bg-slate-900/70 hover:bg-indigo-950/80 border border-slate-700/50 hover:border-indigo-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-950/50 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/30 group-hover:bg-indigo-600/30 transition-colors">
              <span className="text-3xl">📋</span>
            </div>
            <h2 className="text-xl font-black text-white mb-2">Herramientas de Compliance</h2>
            <p className="text-slate-400 text-sm font-medium mb-6 leading-relaxed">
              Análisis de documentos legales, límites transaccionales, wallets crypto y evaluación AML contra el Manual LAFT de Global66.
            </p>
            <div className="flex flex-wrap gap-2">
              {['📄 Analizador', '💰 Límites Trans.', '🔐 Lens Crypto', '⚖️ Evaluador AML', '📊 Dashboard'].map(tag => (
                <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-950/60 border border-indigo-800/50 px-2 py-1 rounded-lg">{tag}</span>
              ))}
            </div>
          </button>

          {/* Criminal Profiler */}
          <button
            onClick={() => onSelect('criminal')}
            className="group relative bg-slate-900/70 hover:bg-red-950/30 border border-slate-700/50 hover:border-red-800/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-red-950/30 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-red-700 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="w-16 h-16 bg-red-800/20 rounded-2xl flex items-center justify-center mb-6 border border-red-700/30 group-hover:bg-red-800/30 transition-colors">
              <span className="text-3xl">🛡️</span>
            </div>
            <h2 className="text-xl font-black text-white mb-2">Analizador de Perfiles Criminales</h2>
            <p className="text-slate-400 text-sm font-medium mb-6 leading-relaxed">
              Carga bases de clientes con antecedentes judiciales, aplica el catálogo de delitos, motor de decisión automático y análisis con IA por perfil.
            </p>
            <div className="flex flex-wrap gap-2">
              {['📂 Carga Excel', '⚖️ Motor Decisión', '🤖 IA por Perfil', '📤 Exportar', '🔍 Catálogo'].map(tag => (
                <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-red-400 bg-red-950/40 border border-red-900/50 px-2 py-1 rounded-lg">{tag}</span>
              ))}
            </div>
          </button>
        </div>

        {/* Regcheq card — full width below the 2-col grid */}
        {(userProfile?.modules?.regcheq ?? true) && <div className="mt-6">
          <button
            onClick={() => onSelect('regcheq')}
            className="group relative w-full bg-slate-900/70 hover:bg-teal-950/40 border border-slate-700/50 hover:border-teal-600/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-teal-950/30 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-teal-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-teal-500/30 group-hover:bg-teal-600/30 transition-colors">
                <span className="text-3xl">🔎</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-white mb-2">Regcheq — Análisis AML / KYC</h2>
                <p className="text-slate-400 text-sm font-medium mb-4 leading-relaxed">
                  Consulta perfiles contra listas PEP Chile, OFAC, ONU, UE, PDI, causas penales, screening global y lista de interés interna vía la API de Regcheq.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['🔍 Perfil Individual', '📋 Lista de Interés', '🌐 PEP · OFAC · ONU', '⚖️ Causas Penales', '🛡️ Screening Global'].map(tag => (
                    <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-teal-400 bg-teal-950/50 border border-teal-800/50 px-2 py-1 rounded-lg">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        </div>}

        {/* Líder-only cards */}
        {role === 'Lider' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Dashboard General card */}
            {userProfile?.modules?.generalDashboard !== false && <button
              onClick={() => onSelect('general-dashboard')}
              className="group bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/40 hover:border-emerald-600/50 rounded-2xl p-6 text-left transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-700/30 rounded-xl flex items-center justify-center border border-emerald-600/30">
                  <span className="text-xl">📈</span>
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Dashboard General</h3>
                </div>
              </div>
              <p className="text-slate-400 text-xs">Actividad acumulada de todos los analistas, métricas globales y por usuario.</p>
            </button>}

            {/* Administración card */}
            <button
              onClick={() => onSelect('admin')}
              className="group bg-amber-950/40 hover:bg-amber-900/40 border border-amber-800/40 hover:border-amber-600/50 rounded-2xl p-6 text-left transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-700/30 rounded-xl flex items-center justify-center border border-amber-600/30">
                  <span className="text-xl">⚙️</span>
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Administración</h3>
                </div>
              </div>
              <p className="text-slate-400 text-xs">Gestión de usuarios, roles, invitaciones y permisos de módulos.</p>
            </button>
          </div>
        )}

        <p className="text-center text-xs text-slate-600 mt-8 font-medium">
          Potenciado por Google Gemini · Team Compliance Global66 · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};
