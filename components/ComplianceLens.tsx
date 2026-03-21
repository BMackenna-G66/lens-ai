import React, { useState, useEffect, useRef } from 'react';
import { FileUpload } from './FileUpload';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert } from './Alert';
import { ComplianceAnalysisResult, ComplianceVsManualResult } from '../types';
import { getTextFromFile } from '../services/fileProcessorService';
import { analyzeComplianceDocumentWithGemini, analyzeComplianceVsManual, hasValidApiKeys } from '../services/geminiService';
import { getManualText } from '../services/manualService';
import { IconScale, IconClipboardCheck, IconCheckCircle, IconXCircle, IconAlertTriangle } from './IconComponents';
import { trackEvent } from '../services/analyticsService';
import { generateCompliancePdf, generateComplianceVsManualPdf } from '../services/pdfGenerator';

const isKeyValid = hasValidApiKeys;

type AnalysisMode = 'standard' | 'vs_manual';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    'Cumple': 'bg-green-100 text-green-800 border border-green-200',
    'Cumple Parcialmente': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    'No Cumple': 'bg-red-100 text-red-800 border border-red-200',
    'No Aplica': 'bg-slate-100 text-slate-600 border border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || map['No Aplica']}`}>
      {status}
    </span>
  );
};

const RiskBadge: React.FC<{ nivel: string }> = ({ nivel }) => {
  const map: Record<string, string> = {
    'Alto': 'bg-red-100 text-red-700',
    'Medio': 'bg-yellow-100 text-yellow-700',
    'Bajo': 'bg-blue-100 text-blue-700',
    'Sin Riesgo': 'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[nivel] || 'bg-slate-100 text-slate-600'}`}>
      {nivel}
    </span>
  );
};

export const ComplianceLens: React.FC = () => {
  const [mode, setMode] = useState<AnalysisMode>('vs_manual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComplianceAnalysisResult | null>(null);
  const [vsManualResult, setVsManualResult] = useState<ComplianceVsManualResult | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const manualTextRef = useRef<string>('');

  // Pre-load manual text silently on mount
  useEffect(() => {
    getManualText().then(text => {
      manualTextRef.current = text;
    }).catch(() => {/* will retry on submit */});
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    if (!isKeyValid) {
      setError("Se requiere una API Key de Gemini válida para realizar la auditoría.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setVsManualResult(null);
    setFileNames(files.map(f => f.name));

    try {
      // 1. Extract uploaded document text
      setLoadingStep('Extrayendo texto de los documentos...');
      let combinedText = "";
      for (const file of files) {
        const text = await getTextFromFile(file);
        combinedText += `\n--- DOCUMENTO: ${file.name} ---\n${text}\n`;
      }
      if (!combinedText.trim()) throw new Error("No se pudo extraer texto de los archivos.");

      if (mode === 'vs_manual') {
        // 2. Load manual text
        setLoadingStep('Cargando manual de referencia Global66...');
        if (!manualTextRef.current) {
          manualTextRef.current = await getManualText();
        }

        // 3. Run comparison analysis
        setLoadingStep('Comparando contra Manual LAFT G81-MAN-003 v9.0...');
        const comparison = await analyzeComplianceVsManual(manualTextRef.current, combinedText);
        setVsManualResult(comparison);
      } else {
        // Standard GAFI/GAFILAT audit
        setLoadingStep('Auditando documentos con estándar GAFI/GAFILAT...');
        const analysis = await analyzeComplianceDocumentWithGemini(combinedText);
        setResult(analysis);
      }

      trackEvent({ type: 'compliance_analyzed', module: 'compliance' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setLoadingStep('');
    }
  };

  const getDictumColor = (dictum: string) => {
    if (dictum === 'Apto' || dictum === 'Alineado') return 'bg-green-500';
    if (dictum === 'Apto con condiciones' || dictum === 'Parcialmente Alineado') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const reset = () => {
    setResult(null);
    setVsManualResult(null);
    setFileNames([]);
    setError(null);
  };

  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const scoreBarColor = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="max-w-6xl mx-auto pb-12 animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-block p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
          <IconScale className="w-12 h-12 text-slate-700 dark:text-slate-300" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Evaluador de Cumplimiento AML</h1>
        <p className="text-slate-500 dark:text-slate-400">Auditoría automatizada con IA · Referencia: Manual Global66 G81-MAN-003 v9.0</p>
      </div>

      {/* Mode selector */}
      {!result && !vsManualResult && !isProcessing && (
        <div className="max-w-xl mx-auto mb-6">
          <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setMode('vs_manual')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === 'vs_manual'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              📋 Comparar con Manual Global66
            </button>
            <button
              onClick={() => setMode('standard')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === 'standard'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              🌐 Auditoría GAFI/GAFILAT
            </button>
          </div>
          {mode === 'vs_manual' && (
            <p className="text-center text-xs text-indigo-600 dark:text-indigo-400 mt-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg py-2 px-3">
              Compara tu política o manual AML contra el estándar interno de Global66 en 13 pilares clave
            </p>
          )}
        </div>
      )}

      {!result && !vsManualResult && !isProcessing && (
        <div className="max-w-xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
          <FileUpload
            onFilesSelected={handleFilesSelected}
            disabled={isProcessing || !isKeyValid}
            analysisMode="consolidated"
            id="compliance-upload"
          />
          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
            {mode === 'vs_manual'
              ? 'Sube el manual o política AML a comparar (PDF, DOCX, imagen)'
              : 'Sube manuales, políticas y procedimientos para evaluación GAFI/GAFILAT'}
          </p>
        </div>
      )}

      {isProcessing && (
        <div className="text-center py-20">
          <LoadingSpinner />
          <p className="mt-4 text-slate-600 dark:text-slate-400 font-medium">{loadingStep || 'Procesando...'}</p>
          {mode === 'vs_manual' && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Comparando 13 pilares contra el Manual LAFT v9.0 de Global66</p>
          )}
        </div>
      )}

      {error && (
        <div className="max-w-2xl mx-auto mt-8">
          <Alert type="error" message={error} onClose={() => setError(null)} />
        </div>
      )}

      {/* ── vs Manual Results ── */}
      {vsManualResult && (
        <div className="space-y-6">
          {/* Score + Dictamen */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col md:flex-row">
            <div className={`${getDictumColor(vsManualResult.dictamen)} p-8 text-white flex flex-col justify-center items-center md:w-1/3`}>
              <h3 className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Dictamen de Alineación</h3>
              <div className="text-3xl font-black text-center leading-tight mb-3">{vsManualResult.dictamen}</div>
              <div className="text-5xl font-black">{vsManualResult.nivelCumplimientoGlobal}%</div>
              <p className="text-xs opacity-80 mt-1">Nivel de cumplimiento</p>
            </div>
            <div className="p-8 md:w-2/3">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">Justificación</h4>
              <p className="text-slate-600 dark:text-slate-400 mb-4">{vsManualResult.dictamenJustificacion}</p>
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">Resumen General</h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm">{vsManualResult.resumenGeneral}</p>
              {/* Score bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span>Alineación con Manual Global66</span>
                  <span className={`font-bold ${scoreColor(vsManualResult.nivelCumplimientoGlobal)}`}>{vsManualResult.nivelCumplimientoGlobal}%</span>
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${scoreBarColor(vsManualResult.nivelCumplimientoGlobal)}`}
                    style={{ width: `${vsManualResult.nivelCumplimientoGlobal}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Pillar comparison table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">📋 Comparación por Pilar (13 secciones)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Referencia: Manual G81-MAN-003 v9.0 · Global66</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 w-1/4">Sección</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Estado</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Riesgo</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Semejanzas</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Diferencias / Brechas</th>
                  </tr>
                </thead>
                <tbody>
                  {vsManualResult.tablaPilares.map((pillar, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors align-top">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{pillar.seccion}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 italic">{pillar.referenciaManual}</p>
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={pillar.estadoDocumento} /></td>
                      <td className="py-3 px-4"><RiskBadge nivel={pillar.nivelRiesgo} /></td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{pillar.semejanzas || '—'}</td>
                      <td className="py-3 px-4">
                        {pillar.diferencias && <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{pillar.diferencias}</p>}
                        {pillar.brechas && (
                          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                            ⚠️ {pillar.brechas}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Semejanzas + Diferencias */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-bold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                <IconCheckCircle className="w-5 h-5" /> Semejanzas Globales
              </h3>
              <ul className="space-y-2">
                {vsManualResult.semejanzasGlobales.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>{s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-bold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2">
                <IconAlertTriangle className="w-5 h-5" /> Diferencias Identificadas
              </h3>
              <ul className="space-y-2">
                {vsManualResult.diferenciasGlobales.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-yellow-500 mt-0.5 shrink-0">△</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Critical gaps + Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow border border-red-200 dark:border-red-800 p-6">
              <h3 className="font-bold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                <IconXCircle className="w-5 h-5" /> Brechas Críticas
              </h3>
              {vsManualResult.brechasCriticas.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">Sin brechas críticas identificadas</p>
              ) : (
                <ul className="space-y-2">
                  {vsManualResult.brechasCriticas.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                      <span className="shrink-0">🚨</span>{b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow border border-indigo-200 dark:border-indigo-800 p-6">
              <h3 className="font-bold text-indigo-700 dark:text-indigo-400 mb-3 flex items-center gap-2">
                <IconClipboardCheck className="w-5 h-5" /> Recomendaciones Priorizadas
              </h3>
              <ol className="space-y-2">
                {vsManualResult.recomendacionesPriorizadas.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-indigo-500 font-bold shrink-0">{i + 1}.</span>{r}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => generateComplianceVsManualPdf(vsManualResult, fileNames)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar Informe PDF
            </button>
            <button
              onClick={reset}
              className="bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-bold transition-colors"
            >
              Nueva Auditoría
            </button>
          </div>
        </div>
      )}

      {/* ── Standard GAFI Results ── */}
      {result && (
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col md:flex-row">
            <div className={`${getDictumColor(result.onboardingDictum)} p-8 text-white flex flex-col justify-center items-center md:w-1/3`}>
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-80 mb-2">Dictamen Final</h3>
              <div className="text-4xl font-black text-center leading-tight">{result.onboardingDictum}</div>
            </div>
            <div className="p-8 md:w-2/3">
              <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Justificación</h4>
              <p className="text-slate-600 dark:text-slate-400">{result.dictumJustification}</p>
              {result.summary && (
                <>
                  <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">Resumen</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{result.summary}</p>
                </>
              )}
            </div>
          </div>

          {result.comparisonTable && result.comparisonTable.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Tabla de Cumplimiento GAFI/GAFILAT</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      {['Pilar', 'Estado', 'Evidencia', 'Riesgo', 'Recomendación'].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparisonTable.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 align-top">
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 text-xs">{row.pillar}</td>
                        <td className="py-3 px-4"><StatusBadge status={row.status} /></td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{row.evidence}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{row.risk}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{row.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => generateCompliancePdf(result, fileNames)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar PDF
            </button>
            <button onClick={reset} className="bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-bold">
              Nueva Auditoría
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
