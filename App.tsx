import React, { useState, useEffect } from 'react';
import { DocumentAnalyzer } from './components/DocumentAnalyzer';
import { TransactionalLimits } from './components/TransactionalLimits';
import { CryptoLens } from './components/CryptoLens';
import { ComplianceLens } from './components/ComplianceLens';
import { Dashboard } from './components/Dashboard';
import { LoginPage } from './components/LoginPage';
import { AppLauncher } from './components/AppLauncher';
import { CriminalApp } from './components/CriminalProfiler/CriminalApp';
import { GeneralDashboard } from './components/GeneralDashboard';
import { AdminModule } from './components/AdminModule';
import { RegcheqTool } from './components/RegcheqTool';
import { Lens360 } from './components/Lens360';
import { BatchAnalyzer } from './components/BatchAnalyzer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { IconFiles, IconAlertTriangle, IconWallet, IconScale } from './components/IconComponents';
import { trackModuleVisit, ModuleKey } from './services/analyticsService';

type TabKey = 'dashboard' | 'analyzer' | 'batch' | 'tools' | 'crypto' | 'compliance';
type Suite = 'compliance' | 'criminal' | 'admin' | 'general-dashboard' | 'regcheq' | 'lens360' | null;

const AppContent: React.FC = () => {
  const { user, isLoading: authLoading, firebaseReady, profileLoading, role, userProfile } = useAuth();
  const [activeSuite, setActiveSuite] = useState<Suite>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('darkMode') === 'true');
  const [pending360Rut, setPending360Rut] = useState<string | null>(null);

  // Abre la Vista 360° con un RUT precargado (desde el Analizador / Batch).
  const openLens360 = (rut: string) => { setPending360Rut(rut); setActiveSuite('lens360'); };

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab !== 'dashboard') trackModuleVisit(tab as ModuleKey);
  };

  // 1. Loading state (no toggle)
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-800 border-t-indigo-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-semibold">Cargando...</p>
        </div>
      </div>
    );
  }

  // 2. Not logged in → Login screen (no toggle)
  if (firebaseReady && !user) {
    return <LoginPage />;
  }

  // ── Helper: access denied screen ──────────────────────────────────────────
  const AccessDenied = ({ msg }: { msg: string }) => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center text-slate-400">
        <p className="text-2xl mb-4">🔒</p>
        <p className="font-semibold">{msg}</p>
        <button onClick={() => setActiveSuite(null)} className="mt-4 text-xs text-indigo-400 underline">Volver al inicio</button>
      </div>
    </div>
  );

  // ── Main authenticated content (all suites) ────────────────────────────────
  let mainContent: React.ReactNode;

  if (activeSuite === null) {
    mainContent = <AppLauncher onSelect={setActiveSuite} />;

  } else if (activeSuite === 'admin') {
    mainContent = role !== 'Lider'
      ? <AccessDenied msg="Acceso restringido a Líderes" />
      : <AdminModule onBack={() => setActiveSuite(null)} />;

  } else if (activeSuite === 'general-dashboard') {
    mainContent = (role !== 'Lider' || userProfile?.modules?.generalDashboard === false)
      ? <AccessDenied msg="Acceso restringido" />
      : <GeneralDashboard onBack={() => setActiveSuite(null)} />;

  } else if (activeSuite === 'regcheq') {
    mainContent = <RegcheqTool
      onBack={() => setActiveSuite(null)}
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode(d => !d)}
    />;

  } else if (activeSuite === 'lens360') {
    mainContent = (userProfile?.modules?.lens360 ?? true)
      ? <Lens360
          onBack={() => setActiveSuite(null)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(d => !d)}
          initialRut={pending360Rut}
          onConsumeInitialRut={() => setPending360Rut(null)}
        />
      : <AccessDenied msg="Módulo desactivado por tu administrador" />;

  } else if (activeSuite === 'criminal') {
    mainContent = (userProfile?.modules?.criminal ?? true)
      ? <CriminalApp onBack={() => setActiveSuite(null)} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(d => !d)} />
      : <AccessDenied msg="Módulo desactivado por tu administrador" />;

  } else {
    // Compliance suite (default)
    const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
      { key: 'dashboard', label: 'Dashboard', icon: <span className="text-base">📊</span> },
      { key: 'analyzer', label: 'Analizador de Documentos', icon: <IconFiles className="w-5 h-5" /> },
      { key: 'batch', label: 'Analizador Batch', icon: <span className="text-base">📦</span> },
      { key: 'tools', label: 'Límites Transaccionales', icon: <IconAlertTriangle className="w-5 h-5" /> },
      { key: 'crypto', label: 'Lens - Crypto', icon: <IconWallet className="w-5 h-5" /> },
      { key: 'compliance', label: 'Evaluador AML', icon: <IconScale className="w-5 h-5" /> },
    ];

    mainContent = (userProfile?.modules?.compliance ?? true) ? (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 md:p-8 flex flex-col">
        <header className="mb-8 text-center relative">
          <button
            onClick={() => setActiveSuite(null)}
            className="absolute top-4 left-0 flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Inicio
          </button>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-slate-100">
            LENS - AI <br />Analizador de Documentos Legales
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mt-2">
            Suite de herramientas potenciadas por IA para equipos legales.
          </p>
        </header>
        <main className="flex-grow container mx-auto max-w-7xl w-full">
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => handleTabChange(tab.key)}
                className={`flex items-center py-4 px-5 border-b-2 font-medium text-sm transition-colors duration-200 whitespace-nowrap gap-2 ${activeTab === tab.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'}`}
              >
                <span className={activeTab === tab.key ? 'text-primary-500' : 'text-slate-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: activeTab === 'dashboard'  ? 'block' : 'none' }}><Dashboard /></div>
          <div style={{ display: activeTab === 'analyzer'   ? 'block' : 'none' }}><DocumentAnalyzer onOpen360={openLens360} /></div>
          <div style={{ display: activeTab === 'batch'      ? 'block' : 'none' }}><BatchAnalyzer onOpen360={openLens360} /></div>
          <div style={{ display: activeTab === 'tools'      ? 'block' : 'none' }}><TransactionalLimits /></div>
          <div style={{ display: activeTab === 'crypto'     ? 'block' : 'none' }}><CryptoLens /></div>
          <div style={{ display: activeTab === 'compliance' ? 'block' : 'none' }}><ComplianceLens /></div>
        </main>
        <footer className="text-center mt-12 py-6 text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
          Potenciado por Google Gemini API <br />by: Team compliance Global66.
        </footer>
      </div>
    ) : <AccessDenied msg="Módulo desactivado por tu administrador" />;
  }

  // ── Render: content + persistent dark-mode toggle ─────────────────────────
  return (
    <>
      {mainContent}
      {/* Global dark mode toggle — visible in all modules */}
      <button
        onClick={() => setDarkMode(d => !d)}
        title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="fixed bottom-6 right-6 z-[9999] w-12 h-12 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl flex items-center justify-center text-xl hover:scale-110 active:scale-95 transition-all"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>
    </>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
