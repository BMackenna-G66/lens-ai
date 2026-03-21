import React from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo + title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600/20 rounded-3xl border border-indigo-500/30 mb-6 shadow-2xl shadow-indigo-950">
            <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
              <circle cx="20" cy="20" r="18" stroke="#818cf8" strokeWidth="2.5" />
              <path d="M13 20h14M20 13v14" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="4" fill="#818cf8" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">LENS AI</h1>
          <p className="text-indigo-400 font-semibold tracking-widest text-xs uppercase">Suite de Compliance · Global66</p>
        </div>

        {/* Login card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl shadow-slate-950">
          <h2 className="text-xl font-bold text-white mb-2 text-center">Iniciar sesión</h2>
          <p className="text-slate-400 text-sm text-center mb-8">
            Accede con tu cuenta corporativa de Google para usar las herramientas de análisis
          </p>

          <button
            onClick={login}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 font-bold px-6 py-4 rounded-2xl transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            {isLoading ? 'Iniciando sesión...' : 'Continuar con Google'}
          </button>

          <p className="text-center text-xs text-slate-600 mt-6">
            Uso exclusivo para el equipo de Compliance de Global66
          </p>
        </div>

        {/* Features preview */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          {[
            { icon: '📄', label: 'Analizador de Documentos' },
            { icon: '📊', label: 'Límites Transaccionales' },
            { icon: '🔐', label: 'Lens Crypto' },
            { icon: '🛡️', label: 'Perfiles Criminales' },
          ].map(({ icon, label }) => (
            <div key={label} className="bg-slate-900/40 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span className="text-xs font-semibold text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
