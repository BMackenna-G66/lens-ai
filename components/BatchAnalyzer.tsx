import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { ExtractedField } from '../types';
import { GEMINI_PROMPT_TEMPLATE } from '../constants';
import {
  analyzeDocumentWithGemini,
  detectCountryWithGemini,
  generateExecutiveSummary,
  analyzeDocumentForRisks,
  analyzeDocumentIntegrity,
  analyzeFinancialDocumentWithGemini,
  analyzeBankStatementWithGemini,
  analyzeTaxFolderWithGemini,
  analyzeCrossCheckWithGemini,
  hasValidApiKeys,
} from '../services/geminiService';
import { getTextFromFile } from '../services/fileProcessorService';
import { generateBatchCompanyPdf } from '../services/pdfGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchMode = 'completo' | 'individual';
type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

interface BatchDoc {
  file: File;
  ocrStatus: ItemStatus;
  error?: string;
}

interface BatchCompany {
  id: string;
  name: string;
  docs: BatchDoc[];
  status: ItemStatus;
  statusLabel?: string;
  error?: string;
  pdfBlob?: Blob;
  extractedData?: ExtractedField[];
  executiveSummary?: string;
  errorCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// One company = one consolidated analysis (all docs combined), not per-doc
// OCR is fast (~2s/doc), analysis is the slow part (15-40s flat per company)
const SECS_COMPLETO = 60;   // per company
const SECS_INDIVIDUAL = 20; // per company

function estimateMins(companies: BatchCompany[], mode: BatchMode): number {
  const secs = mode === 'completo' ? SECS_COMPLETO : SECS_INDIVIDUAL;
  return Math.ceil((companies.length * secs) / 60);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ItemStatus; label?: string }> = ({ status, label }) => {
  const cfg: Record<ItemStatus, { icon: string; cls: string; text: string }> = {
    pending:    { icon: '⏸', cls: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400', text: 'Pendiente' },
    processing: { icon: '⚙️', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 animate-pulse', text: 'Procesando' },
    done:       { icon: '✅', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', text: 'Listo' },
    error:      { icon: '❌', cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', text: 'Error' },
  };
  const { icon, cls, text } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {icon} {label ?? text}
    </span>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const BatchAnalyzer: React.FC = () => {
  const [mode, setMode] = useState<BatchMode>('completo');
  const [companies, setCompanies] = useState<BatchCompany[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived stats ──
  const totalDocs = companies.reduce((s, c) => s + c.docs.length, 0);
  const doneCompanies = companies.filter(c => c.status === 'done').length;
  const errorCompanies = companies.filter(c => c.status === 'error').length;
  const estMins = estimateMins(companies, mode);
  const progress = companies.length > 0
    ? Math.round((doneCompanies + errorCompanies) / companies.length * 100)
    : 0;

  // ── Folder parsing ──
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const groups: Record<string, File[]> = {};
    files.forEach(file => {
      const rel = (file as File & { webkitRelativePath: string }).webkitRelativePath;
      const parts = rel.split('/');
      if (parts.length >= 3) {
        const company = parts[1];
        if (!groups[company]) groups[company] = [];
        groups[company].push(file);
      }
    });

    const queue: BatchCompany[] = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, fs]) => ({
        id: `${name}_${Date.now()}_${Math.random()}`,
        name,
        docs: fs.map(f => ({ file: f, ocrStatus: 'pending' as const })),
        status: 'pending' as const,
        errorCount: 0,
      }));

    setCompanies(queue);
    setFinished(false);
    stopRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── State updaters ──
  const patchCompany = (idx: number, patch: Partial<BatchCompany>) =>
    setCompanies(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const patchDoc = (ci: number, di: number, patch: Partial<BatchDoc>) =>
    setCompanies(prev => prev.map((c, i) => {
      if (i !== ci) return c;
      return { ...c, docs: c.docs.map((d, j) => j === di ? { ...d, ...patch } : d) };
    }));

  // ── Main batch loop ──
  const startBatch = async () => {
    if (!hasValidApiKeys()) {
      alert('No hay una API Key de Gemini válida. Configúrala antes de continuar.');
      return;
    }
    setRunning(true);
    setFinished(false);
    stopRef.current = false;

    const snapshot = [...companies];

    for (let ci = 0; ci < snapshot.length; ci++) {
      if (stopRef.current) break;

      const company = snapshot[ci];
      patchCompany(ci, { status: 'processing', statusLabel: 'Extrayendo texto (OCR)...' });
      setCurrentLabel(`${company.name} — extrayendo ${company.docs.length} doc(s)...`);

      // ── Phase 1: OCR all docs in parallel ──
      // Mark all docs as processing
      setCompanies(prev => prev.map((c, i) => {
        if (i !== ci) return c;
        return { ...c, docs: c.docs.map(d => ({ ...d, ocrStatus: 'processing' as const })) };
      }));

      const texts: string[] = [];
      let errorCount = 0;

      await Promise.all(company.docs.map(async (doc, di) => {
        try {
          const text = await getTextFromFile(doc.file);
          texts[di] = text;
          patchDoc(ci, di, { ocrStatus: 'done' });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Error OCR';
          patchDoc(ci, di, { ocrStatus: 'error', error });
          errorCount++;
        }
      }));

      if (stopRef.current) {
        patchCompany(ci, { status: 'error', error: 'Detenido manualmente' });
        break;
      }

      const validTexts = texts.filter(Boolean);
      if (validTexts.length === 0) {
        patchCompany(ci, { status: 'error', error: 'No se pudo extraer texto de ningún documento', errorCount });
        continue;
      }

      // ── Phase 2: Consolidated analysis (all docs combined → one analysis) ──
      const combinedText = validTexts.join('\n\n');
      const fileNames = company.docs.map(d => d.file.name).join(', ');

      try {
        patchCompany(ci, { statusLabel: 'Detectando país...' });
        setCurrentLabel(`${company.name} — analizando...`);
        const country = await detectCountryWithGemini(combinedText);

        patchCompany(ci, { statusLabel: 'Extrayendo campos...' });
        const prompt = GEMINI_PROMPT_TEMPLATE(combinedText, country);
        const { extractedData } = await analyzeDocumentWithGemini(prompt);

        if (mode === 'completo') {
          patchCompany(ci, { statusLabel: 'Análisis de riesgos y cumplimiento...' });
          await Promise.allSettled([
            analyzeDocumentForRisks(combinedText),
            analyzeDocumentIntegrity(combinedText),
            analyzeFinancialDocumentWithGemini(combinedText),
            analyzeBankStatementWithGemini(combinedText),
            analyzeTaxFolderWithGemini(combinedText),
            analyzeCrossCheckWithGemini(combinedText),
          ]);
        }

        patchCompany(ci, { statusLabel: 'Generando resumen ejecutivo...' });
        const executiveSummary = await generateExecutiveSummary(extractedData, fileNames);

        patchCompany(ci, { statusLabel: 'Generando ficha PDF...' });
        setCurrentLabel(`${company.name} — generando ficha...`);

        const pdfBlob = await generateBatchCompanyPdf(company.name, [{
          docName: fileNames,
          extractedData,
          executiveSummary,
        }]);

        patchCompany(ci, {
          status: 'done',
          statusLabel: undefined,
          pdfBlob,
          extractedData,
          executiveSummary,
          errorCount,
        });

      } catch (err) {
        const error = err instanceof Error ? err.message : 'Error en análisis';
        patchCompany(ci, { status: 'error', error, errorCount });
      }
    }

    setRunning(false);
    setCurrentLabel('');
    setFinished(true);
  };

  const stopBatch = () => { stopRef.current = true; };

  const resetBatch = () => {
    setCompanies([]);
    setFinished(false);
    setRunning(false);
    stopRef.current = false;
    setCurrentLabel('');
  };

  // ── Downloads ──
  const downloadCompanyPdf = (c: BatchCompany) => {
    if (!c.pdfBlob) return;
    const url = URL.createObjectURL(c.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    companies.forEach(c => {
      if (c.pdfBlob) zip.file(`${c.name}.pdf`, c.pdfBlob);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fichas_batch_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const summaryRows = companies.map(c => {
      const fm: Record<string, string> = {};
      (c.extractedData ?? []).forEach(f => { fm[f.field] = f.value; });
      return {
        'Empresa': c.name,
        'Estado': c.status === 'done' ? 'OK' : c.status === 'error' ? 'Error' : 'Pendiente',
        'Documentos': c.docs.length,
        'Documentos con Error OCR': c.errorCount,
        'Razón Social': fm['Razón Social'] ?? '',
        'RUT Sociedad': fm['RUT de la sociedad'] ?? '',
        'Representante Legal': fm['Representante Legal'] ?? '',
        'Domicilio Legal': fm['Domicilio Legal'] ?? '',
        'Tipo de Sociedad': fm['Tipo de Sociedad'] ?? '',
        'Capital Social': fm['Capital Social'] ?? '',
        'Objeto Social': fm['Objeto Social'] ?? '',
        'Fecha Constitución': fm['Fecha de Constitución'] ?? '',
        'Error detalle': c.error ?? '',
      };
    });

    const errorRows: Record<string, string>[] = [];
    companies.forEach(c => {
      c.docs.forEach(d => {
        if (d.ocrStatus === 'error') {
          errorRows.push({ 'Empresa': c.name, 'Documento': d.file.name, 'Error': d.error ?? '' });
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resultados');
    if (errorRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(errorRows), 'Errores OCR');
    }
    const date = new Date().toLocaleDateString('es-CL').replace(/\//g, '-');
    XLSX.writeFile(wb, `batch_resultados_${date}.xlsx`);
  };

  const toggleExpand = (id: string) =>
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // ── UI ──────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Analizador Batch</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Carga una carpeta con subcarpetas por empresa. Todos los documentos de cada empresa se analizan como un consolidado.
          </p>
        </div>
        {(running || finished) && companies.some(c => c.pdfBlob) && (
          <div className="flex gap-2 flex-wrap">
            {finished && (
              <button
                onClick={exportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                📊 Excel resumen
              </button>
            )}
            <button
              onClick={downloadZip}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              📦 Todas las fichas (.zip)
            </button>
          </div>
        )}
      </div>

      {/* ── Setup panel ── */}
      {!running && companies.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">

          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Tipo de análisis</p>
            <div className="flex gap-3">
              {([
                { key: 'completo' as const, label: 'Análisis Completo', desc: 'Riesgos + Integridad + Financiero + Ficha consolidada', icon: '🔬' },
                { key: 'individual' as const, label: 'Solo Ficha', desc: 'Extracción de campos + resumen ejecutivo', icon: '⚡' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setMode(opt.key)}
                  className={`flex-1 text-left p-4 rounded-xl border-2 transition-all ${
                    mode === opt.key
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                  }`}
                >
                  <div className="text-xl mb-1">{opt.icon}</div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{opt.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
            <p className="font-sans font-semibold text-slate-700 dark:text-slate-300 text-xs mb-2 not-italic">Estructura de carpetas esperada:</p>
            <p>📁 carpeta_madre/</p>
            <p className="pl-4">📁 Empresa ABC SpA/</p>
            <p className="pl-8">📄 escritura.pdf</p>
            <p className="pl-8">📄 balance_2024.pdf</p>
            <p className="pl-4">📁 Empresa XYZ Ltda/</p>
            <p className="pl-8">📄 contrato.pdf</p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all group"
          >
            <div className="text-4xl mb-3">📂</div>
            <p className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              Haz clic para seleccionar la carpeta madre
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Se abrirá el selector de carpetas del sistema
            </p>
            <input
              ref={fileInputRef}
              type="file"
              // @ts-expect-error webkitdirectory not in standard TS types
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={handleFolderSelect}
            />
          </div>
        </div>
      )}

      {/* ── Preview + launch ── */}
      {!running && !finished && companies.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-black text-indigo-600">{companies.length}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">empresas</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-slate-700 dark:text-white">{totalDocs}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">documentos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-amber-600">~{estMins} min</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">estimado · {mode}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={resetBatch}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 font-semibold border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
                >
                  ✕ Limpiar
                </button>
                <button
                  onClick={startBatch}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-950"
                >
                  ▶ Iniciar batch
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {companies.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</span>
                <span className="text-xs text-slate-400 shrink-0">{c.docs.length} doc{c.docs.length !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Running state ── */}
      {running && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800 dark:text-white text-sm">Procesando batch...</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-lg">{currentLabel}</p>
              </div>
              <button
                onClick={stopBatch}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-bold rounded-xl transition-colors"
              >
                ⏹ Detener
              </button>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>{doneCompanies + errorCompanies} / {companies.length} empresas</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <CompanyQueue
            companies={companies}
            expandedCompanies={expandedCompanies}
            onToggle={toggleExpand}
            onDownloadPdf={downloadCompanyPdf}
          />
        </div>
      )}

      {/* ── Finished state ── */}
      {finished && !running && (
        <div className="space-y-4">
          <div className={`rounded-2xl p-5 border ${
            errorCompanies === companies.length
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-black text-green-600">{doneCompanies}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">completadas</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-red-500">{errorCompanies}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">con error</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-slate-700 dark:text-white">{totalDocs}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">docs procesados</div>
                </div>
              </div>
              <button
                onClick={resetBatch}
                className="px-4 py-2 text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                🔄 Nuevo batch
              </button>
            </div>
          </div>

          <CompanyQueue
            companies={companies}
            expandedCompanies={expandedCompanies}
            onToggle={toggleExpand}
            onDownloadPdf={downloadCompanyPdf}
          />
        </div>
      )}
    </div>
  );
};

// ─── CompanyQueue sub-component ───────────────────────────────────────────────

const CompanyQueue: React.FC<{
  companies: BatchCompany[];
  expandedCompanies: Set<string>;
  onToggle: (id: string) => void;
  onDownloadPdf: (c: BatchCompany) => void;
}> = ({ companies, expandedCompanies, onToggle, onDownloadPdf }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
    {companies.map(c => {
      const expanded = expandedCompanies.has(c.id);
      return (
        <div key={c.id}>
          <div className="px-4 py-3 flex items-center gap-3">
            {/* Expand toggle */}
            <button
              onClick={() => onToggle(c.id)}
              className="text-slate-400 text-xs hover:text-slate-600 dark:hover:text-slate-300 shrink-0 w-4"
            >
              {expanded ? '▼' : '▶'}
            </button>

            {/* Company name */}
            <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</span>

            {/* Doc count */}
            <span className="text-xs text-slate-400 shrink-0">{c.docs.length} doc{c.docs.length !== 1 ? 's' : ''}</span>

            {/* Status or live phase label */}
            {c.status === 'processing' && c.statusLabel
              ? <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 animate-pulse shrink-0 max-w-[160px] truncate">{c.statusLabel}</span>
              : <StatusBadge status={c.status} />
            }

            {/* PDF download — visible as soon as blob is ready, even mid-run */}
            {c.pdfBlob && (
              <button
                onClick={() => onDownloadPdf(c)}
                className="flex items-center gap-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors"
              >
                📄 PDF
              </button>
            )}
          </div>

          {expanded && (
            <div className="px-4 pb-3 bg-slate-50/50 dark:bg-slate-800/30 space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-1 pb-0.5">
                Documentos incluidos en el análisis consolidado
              </p>
              {c.docs.map((d, di) => (
                <div key={di} className="flex items-center gap-3 py-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                  <span className="text-slate-400 text-xs w-4 shrink-0">{di + 1}.</span>
                  <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{d.file.name}</span>
                  <StatusBadge
                    status={d.ocrStatus}
                    label={d.ocrStatus === 'error' ? (d.error?.slice(0, 40) ?? 'Error OCR') : undefined}
                  />
                </div>
              ))}
              {c.error && (
                <p className="text-xs text-red-500 dark:text-red-400 pt-1">{c.error}</p>
              )}
              {c.executiveSummary && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Resumen ejecutivo</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">{c.executiveSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
);
