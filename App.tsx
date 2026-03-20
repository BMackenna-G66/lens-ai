
import React, { useState, useEffect } from 'react';
import { DocumentAnalyzer } from './components/DocumentAnalyzer';
import { TransactionalLimits } from './components/TransactionalLimits';
import { CryptoLens } from './components/CryptoLens';
import { ComplianceLens } from './components/ComplianceLens';
import { IconFiles, IconAlertTriangle, IconWallet, IconScale } from './components/IconComponents';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analyzer' | 'tools' | 'crypto' | 'compliance'>('analyzer');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 md:p-8 flex flex-col">
      <header className="mb-8 text-center relative">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          title={darkMode ? 'Modo claro' : 'Modo oscuro'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-slate-100">
          LENS - AI <br />
          Analizador de Documentos Legales
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mt-2">
          Suite de herramientas potenciadas por IA para equipos legales.
        </p>
      </header>

      <main className="flex-grow container mx-auto max-w-7xl w-full">
        
        {/* Tabs Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('analyzer')}
            className={`flex items-center py-4 px-6 border-b-2 font-medium text-sm transition-colors duration-200 whitespace-nowrap ${
              activeTab === 'analyzer'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'
            }`}
          >
            <IconFiles className={`w-5 h-5 mr-2 ${activeTab === 'analyzer' ? 'text-primary-500' : 'text-slate-400'}`} />
            Analizador de Documentos
          </button>
          
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center py-4 px-6 border-b-2 font-medium text-sm transition-colors duration-200 whitespace-nowrap ${
              activeTab === 'tools'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'
            }`}
          >
            <IconAlertTriangle className={`w-5 h-5 mr-2 ${activeTab === 'tools' ? 'text-primary-500' : 'text-slate-400'}`} />
            Límites Transaccionales
          </button>

          <button
            onClick={() => setActiveTab('crypto')}
            className={`flex items-center py-4 px-6 border-b-2 font-medium text-sm transition-colors duration-200 whitespace-nowrap ${
              activeTab === 'crypto'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'
            }`}
          >
            <IconWallet className={`w-5 h-5 mr-2 ${activeTab === 'crypto' ? 'text-primary-500' : 'text-slate-400'}`} />
            Lens - Crypto
          </button>

          <button
            onClick={() => setActiveTab('compliance')}
            className={`flex items-center py-4 px-6 border-b-2 font-medium text-sm transition-colors duration-200 whitespace-nowrap ${
              activeTab === 'compliance'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300'
            }`}
          >
            <IconScale className={`w-5 h-5 mr-2 ${activeTab === 'compliance' ? 'text-primary-500' : 'text-slate-400'}`} />
            Evaluador AML
          </button>
        </div>

                {/* Tab Content: Document Analyzer */}
        <div style={{ display: activeTab === 'analyzer' ? 'block' : 'none' }}>
            <DocumentAnalyzer />
        </div>

        {/* Tab Content: Transactional Limits */}
        <div style={{ display: activeTab === 'tools' ? 'block' : 'none' }}>
           <TransactionalLimits />
        </div>

        {/* Tab Content: Crypto Lens */}
        <div style={{ display: activeTab === 'crypto' ? 'block' : 'none' }}>
           <CryptoLens />
        </div>

        {/* Tab Content: Compliance Lens */}
        <div style={{ display: activeTab === 'compliance' ? 'block' : 'none' }}>
           <ComplianceLens />
        </div>

      </main>
      
      <footer className="text-center mt-12 py-6 text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
        Potenciado por Google Gemini API <br />by: Team compliance Global66.
      </footer>
    </div>
  );
};

export default App;
