import React from 'react';
import { useAuth } from '../context/AuthContext';

type Suite = 'compliance' | 'criminal' | 'admin' | 'general-dashboard' | 'regcheq' | 'lens360' | 'casos' | 'kyb';

interface AppLauncherProps {
  onSelect: (suite: Suite) => void;
}

export const AppLauncher: React.FC<AppLauncherProps> = ({ onSelect }) => {
  const { user, logout, firebaseReady, role, userProfile } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-100 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 flex flex-col items-center justify-center p-6 transition-colors">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-400/10 dark:bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-400/10 dark:bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-12">
          <div className="text-center flex-1">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">LENS AI</h1>
            <p className="text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-[0.3em] mt-1">Suite de Herramientas · Global66</p>
          </div>
          {user && (
            <div className="flex items-center gap-3 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl px-4 py-2">
              {user.photoURL && <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />}
              <div className="text-left hidden sm:block">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">{user.displayName?.split(' ')[0]}</p>
                  {role && (
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      role === 'Lider'
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-600/30'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600/50'
                    }`}>
                      {role}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
              </div>
              {firebaseReady && (
                <button onClick={logout} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-2 font-semibold">Salir</button>
              )}
            </div>
          )}
        </div>

        {/* Suite cards */}
        <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-8 font-medium">Selecciona la herramienta que deseas usar</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Compliance Suite — respeta el permiso del Admin. Sin este gate, el
              toggle de la pestaña Admin quedaba decorativo: el líder creía haber
              restringido el acceso y el usuario seguía entrando. */}
          {(userProfile?.modules?.compliance ?? true) && (
          <button
            onClick={() => onSelect('compliance')}
            className="group relative bg-white/80 dark:bg-slate-900/70 hover:bg-indigo-50 dark:hover:bg-indigo-950/80 border border-slate-200 dark:border-slate-700/50 hover:border-indigo-400 dark:hover:border-indigo-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-200/50 dark:hover:shadow-indigo-950/50 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 border border-indigo-200 dark:border-indigo-500/30 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-600/30 transition-colors">
              <span className="text-3xl">📋</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Herramientas de Compliance</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-6 leading-relaxed">
              Análisis de documentos legales, límites transaccionales, wallets crypto y evaluación AML contra el Manual LAFT de Global66.
            </p>
            <div className="flex flex-wrap gap-2">
              {['📄 Analizador', '💰 Límites Trans.', '🔐 Lens Crypto', '⚖️ Evaluador AML', '📊 Dashboard'].map(tag => (
                <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/50 px-2 py-1 rounded-lg">{tag}</span>
              ))}
            </div>
          </button>
          )}

          {/* Criminal Profiler — ídem: el permiso no se estaba mirando. */}
          {(userProfile?.modules?.criminal ?? true) && (
          <button
            onClick={() => onSelect('criminal')}
            className="group relative bg-white/80 dark:bg-slate-900/70 hover:bg-red-50 dark:hover:bg-red-950/30 border border-slate-200 dark:border-slate-700/50 hover:border-red-300 dark:hover:border-red-800/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-red-100/50 dark:hover:shadow-red-950/30 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-red-700 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-800/20 rounded-2xl flex items-center justify-center mb-6 border border-red-200 dark:border-red-700/30 group-hover:bg-red-200 dark:group-hover:bg-red-800/30 transition-colors">
              <span className="text-3xl">🛡️</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Analizador de Perfiles Criminales</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-6 leading-relaxed">
              Carga bases de clientes con antecedentes judiciales, aplica el catálogo de delitos, motor de decisión automático y análisis con IA por perfil.
            </p>
            <div className="flex flex-wrap gap-2">
              {['📂 Carga Excel', '⚖️ Motor Decisión', '🤖 IA por Perfil', '📤 Exportar', '🔍 Catálogo'].map(tag => (
                <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-2 py-1 rounded-lg">{tag}</span>
              ))}
            </div>
          </button>
          )}
        </div>

        {/* Regcheq card — full width below the 2-col grid */}
        {(userProfile?.modules?.regcheq ?? true) && (
          <div className="mt-6">
            <button
              onClick={() => onSelect('regcheq')}
              className="group relative w-full bg-white/80 dark:bg-slate-900/70 hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-slate-700/50 hover:border-teal-400 dark:hover:border-teal-600/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-teal-100/50 dark:hover:shadow-teal-950/30 active:scale-[0.98]"
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-teal-100 dark:bg-teal-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-teal-200 dark:border-teal-500/30 group-hover:bg-teal-200 dark:group-hover:bg-teal-600/30 transition-colors">
                  <span className="text-3xl">🔎</span>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Regcheq — Análisis AML / KYC</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-4 leading-relaxed">
                    Consulta perfiles contra listas PEP Chile, OFAC, ONU, UE, PDI, causas penales, screening global y lista de interés interna vía la API de Regcheq.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['🔍 Perfil Individual', '📋 Lista de Interés', '🌐 PEP · OFAC · ONU', '⚖️ Causas Penales', '🛡️ Screening Global'].map(tag => (
                      <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/50 px-2 py-1 rounded-lg">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Vista 360° — full width */}
        {(userProfile?.modules?.lens360 ?? true) && (
        <div className="mt-6">
          <button
            onClick={() => onSelect('lens360')}
            className="group relative w-full bg-white/80 dark:bg-slate-900/70 hover:bg-violet-50 dark:hover:bg-violet-950/40 border border-slate-200 dark:border-slate-700/50 hover:border-violet-400 dark:hover:border-violet-600/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-violet-100/50 dark:hover:shadow-violet-950/30 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-violet-200 dark:border-violet-500/30 group-hover:bg-violet-200 dark:group-hover:bg-violet-600/30 transition-colors">
                <span className="text-3xl">🔭</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Vista 360° — Consulta Consolidada</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-4 leading-relaxed">
                  Ingresa un RUT/DNI y obtén en una sola pantalla el screening AML de Chile (Regcheq) y Colombia (Inspektor), los antecedentes penales y la decisión criminal, con un veredicto de riesgo unificado.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['🔍 Búsqueda por RUT', '🌐 Chile + Colombia', '⚖️ Decisión Criminal', '🎯 Veredicto Unificado'].map(tag => (
                    <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800/50 px-2 py-1 rounded-lg">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        </div>
        )}

        {/* Cola KYB — módulo paralelo a la Bandeja, para empresas (B2B) */}
        {(userProfile?.modules?.kyb ?? true) && (
        <div className="mt-6">
          <button
            onClick={() => onSelect('kyb')}
            className="group relative w-full bg-white/80 dark:bg-slate-900/70 hover:bg-violet-50 dark:hover:bg-violet-950/40 border border-slate-200 dark:border-slate-700/50 hover:border-violet-400 dark:hover:border-violet-600/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-violet-100/50 dark:hover:shadow-violet-950/30 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-violet-200 dark:border-violet-500/30 group-hover:bg-violet-200 dark:group-hover:bg-violet-600/30 transition-colors">
                <span className="text-3xl">🏢</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Cola KYB — Empresas</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-4 leading-relaxed">
                  KYC de empresas: compara los documentos contra los datos de Admin campo a campo, arma una matriz de 12 componentes y calcula un porcentaje de certidumbre explicable línea por línea.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['🏢 B2B', '⚖️ Matriz de 12', '📊 Certidumbre', '✅ Maker-checker'].map(tag => (
                    <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800/50 px-2 py-1 rounded-lg">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        </div>
        )}

        {/* Bandeja de Casos — full width */}
        {(userProfile?.modules?.casos ?? true) && (
        <div className="mt-6">
          <button
            onClick={() => onSelect('casos')}
            className="group relative w-full bg-white/80 dark:bg-slate-900/70 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-slate-200 dark:border-slate-700/50 hover:border-sky-400 dark:hover:border-sky-600/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-sky-100/50 dark:hover:shadow-sky-950/30 active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 bg-sky-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-sky-200 dark:border-sky-500/30 group-hover:bg-sky-200 dark:group-hover:bg-sky-600/30 transition-colors">
                <span className="text-3xl">📥</span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Bandeja de Casos</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-4 leading-relaxed">
                  Casos OFAC/PEP y transacciones que Salesforce envía al endpoint de compliance. Se muestran en vivo, con el detalle completo de cada payload recibido.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['📡 En vivo', '🌐 Vía endpoint AWS', '🔎 Detalle por caso', '🔒 Solo lectura'].map(tag => (
                    <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/50 px-2 py-1 rounded-lg">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        </div>
        )}

        {/* Líder-only cards */}
        {role === 'Lider' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {userProfile?.modules?.generalDashboard !== false && (
              <button
                onClick={() => onSelect('general-dashboard')}
                className="group bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/40 hover:border-emerald-400 dark:hover:border-emerald-600/50 rounded-2xl p-6 text-left transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-200 dark:bg-emerald-700/30 rounded-xl flex items-center justify-center border border-emerald-300 dark:border-emerald-600/30">
                    <span className="text-xl">📈</span>
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-sm">Dashboard General</h3>
                  </div>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-xs">Actividad acumulada de todos los analistas, métricas globales y por usuario.</p>
              </button>
            )}

            <button
              onClick={() => onSelect('admin')}
              className="group bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/40 hover:border-amber-400 dark:hover:border-amber-600/50 rounded-2xl p-6 text-left transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-200 dark:bg-amber-700/30 rounded-xl flex items-center justify-center border border-amber-300 dark:border-amber-600/30">
                  <span className="text-xl">⚙️</span>
                </div>
                <div>
                  <h3 className="text-slate-900 dark:text-white font-bold text-sm">Administración</h3>
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs">Gestión de usuarios, roles, invitaciones y permisos de módulos.</p>
            </button>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-8 font-medium">
          Potenciado por Google Gemini · Team Compliance Global66 · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};
