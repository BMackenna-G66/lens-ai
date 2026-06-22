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
  status: ItemStatus;
  error?: string;
  extractedData?: ExtractedField[];
  executiveSummary?: string;
}

interface BatchCompany {
  id: string;
  name: string;
  docs: BatchDoc[];
  status: ItemStatus;
  error?: string;
  pdfBlob?: Blob;
  mergedFields?: ExtractedField[];
  errorCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECS_COMPLETO = 45;
const SECS_INDIVIDUAL = 12;

function estimateMins(companies: BatchCompany[], mode: BatchMode): number {
  const totalDocs = companies.reduce((s, c) => s + c.docs.length, 0);
  const secs = mode === 'completo' ? SECS_COMPLETO : SECS_INDIVIDUAL;
  return Math.ceil((totalDocs * secs) / 60);
}

function mergeFields(allDocs: BatchDoc[]): ExtractedField[] {
  const map = new Map<string, string>();
  for (const d of allDocs) {
    for (const f of d.extractedData ?? []) {
      const existing = map.get(f.field);
      const isUseful = f.value && f.value !== 'No especificado' && f.value !== 'N/A' && f.value !== 'No encontrado';
      if (!existing || (isUseful && !existing)) map.set(f.field, f.value);
    }
  }
  return Array.from(map.entries()).map(([field, value]) => ({ field, value }));
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
  const progress = companies.length > 0 ? Math.round((doneCompanies + errorCompanies) / companies.length * 100) : 0;

  // ── Folder parsing ──
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const groups: Record<string, File[]> = {};
    files.forEach(file => {
      const rel = (file as File & { webkitRelativePath: string }).webkitRelativePath;
      const parts = rel.split('/');
      // Expect: rootFolder/CompanyFolder/file — need length >= 3
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
        docs: fs.map(f => ({ file: f, status: 'pending' as const })),
        status: 'pending' as const,
        errorCount: 0,
      }));

    setCompanies(queue);
    setFinished(false);
    stopRef.current = false;
    // Reset file input so same folder can be reloaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Immutable updaters (use functional form to avoid stale closure) ──
  const setCompanyStatus = (idx: number, patch: Partial<BatchCompany>) =>
    setCompanies(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const setDocStatus = (ci: number, di: number, patch: Partial<BatchDoc>) =>
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

    // Snapshot companies at start to iterate safely
    const snapshot = [...companies];

    for (let ci = 0; ci < snapshot.length; ci++) {
      if (stopRef.current) break;

      setCompanyStatus(ci, { status: 'processing' });
      const company = snapshot[ci];
      const processedDocs: BatchDoc[] = [];
      let errorCount = 0;

      for (let di = 0; di < company.docs.length; di++) {
        if (stopRef.current) break;

        const docFile = company.docs[di].file;
        setCurrentLabel(`${company.name} — ${docFile.name} (${di + 1}/${company.docs.length})`);
        setDocStatus(ci, di, { status: 'processing' });

        try {
          // 1. OCR / text extraction
          const text = await getTextFromFile(docFile);

          // 2. Country detection
          const country = await detectCountryWithGemini(text);

          // 3. Field extraction
          const prompt = GEMINI_PROMPT_TEMPLATE(text, country);
          const { extractedData } = await analyzeDocumentWithGemini(prompt);

          // 4. Full analysis suite (completo mode) — silent failures per sub-analysis
          if (mode === 'completo') {
            await Promise.allSettled([
              analyzeDocumentForRisks(text),
              analyzeDocumentIntegrity(text),
              analyzeFinancialDocumentWithGemini(text),
              analyzeBankStatementWithGemini(text),
              analyzeTaxFolderWithGemini(text),
              analyzeCrossCheckWithGemini(text),
            ]);
          }

          // 5. Executive summary
          const executiveSummary = await generateExecutiveSummary(extractedData, docFile.name);

          const done: BatchDoc = { file: docFile, status: 'done', extractedData, executiveSummary };
          processedDocs.push(done);
          setDocStatus(ci, di, { status: 'done', extractedData, executiveSummary });

        } catch (err) {
          const error = err instanceof Error ? err.message : 'Error desconocido';
          processedDocs.push({ file: docFile, status: 'error', error });
          setDocStatus(ci, di, { status: 'error', error });
          errorCount++;
        }
      }

      if (stopRef.current) {
        setCompanyStatus(ci, { status: 'error', error: 'Detenido manualmente' });
        break;
      }

      // ── Generate consolidated PDF for this company ──
      try {
        const docSummaries = processedDocs
          .filter(d => d.status === 'done' && d.extractedData)
          .map(d => ({
            docName: d.file.name,
            extractedData: d.extractedData!,
            executiveSummary: d.executiveSummary,
          }));

        const pdfBlob = docSummaries.length > 0
          ? await generateBatchCompanyPdf(company.name, docSummaries)
          : undefined;

        const mergedFields = mergeFields(processedDocs.filter(d => d.status === 'done'));

        setCompanyStatus(ci, {
          status: errorCount === company.docs.length ? 'error' : 'done',
          pdfBlob,
          mergedFields,
          errorCount,
          docs: processedDocs,
          error: errorCount === company.docs.length ? 'Todos los documentos fallaron' : undefined,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Error generando PDF';
        setCompanyStatus(ci, { status: 'error', error, errorCount, docs: processedDocs });
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
      (c.mergedFields ?? []).forEach(f => { fm[f.field] = f.value; });
      return {
        'Empresa': c.name,
        'Estado': c.status === 'done' ? 'OK' : c.status === 'error' ? 'Error' : 'Pendiente',
        'Documentos OK': c.docs.filter(d => d.status === 'done').length,
        'Documentos con Error': c.errorCount,
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
        if (d.status === 'error') {
          errorRows.push({ 'Empresa': c.name, 'Documento': d.file.name, 'Error': d.error ?? '' });
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resultados');
    if (errorRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(errorRows), 'Errores');
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
            Carga una carpeta con subcarpetas por empresa. Cada subcarpeta = una empresa con sus documentos.
          </p>
        </div>
        {finished && (
          <div className="flex gap-2">
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              📊 Excel resumen
            </button>
            {companies.some(c => c.pdfBlob) && (
              <button
                onClick={downloadZip}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                📦 Descargar fichas (.zip)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Setup panel (visible when not running and no companies yet, or after reset) ── */}
      {!running && companies.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">

          {/* Mode selector */}
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Tipo de análisis</p>
            <div className="flex gap-3">
              {([
                { key: 'completo' as const, label: 'Análisis Completo', desc: '6 análisis + ficha resumen · ~45s/doc', icon: '🔬' },
                { key: 'individual' as const, label: 'Análisis Individual', desc: 'Solo ficha resumen · ~12s/doc', icon: '⚡' },
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

          {/* Folder structure hint */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
            <p className="font-sans font-semibold text-slate-700 dark:text-slate-300 text-xs mb-2 not-italic">Estructura de carpetas esperada:</p>
            <p>📁 carpeta_madre/</p>
            <p className="pl-4">📁 Empresa ABC SpA/</p>
            <p className="pl-8">📄 escritura.pdf</p>
            <p className="pl-8">📄 balance_2024.pdf</p>
            <p className="pl-4">📁 Empresa XYZ Ltda/</p>
            <p className="pl-8">📄 contrato.pdf</p>
          </div>

          {/* Folder picker */}
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

      {/* ── Preview + launch (companies loaded, not yet running) ── */}
      {!running && !finished && companies.length > 0 && (
        <div className="space-y-4">

          {/* Summary card */}
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
                  <div className="text-xs text-slate-500 dark:text-slate-400">estimado ({mode})</div>
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

          {/* Company list preview */}
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

          {/* Progress bar + controls */}
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

          {/* Live company queue */}
          <CompanyQueue
            companies={companies}
            expandedCompanies={expandedCompanies}
            onToggle={toggleExpand}
          />
        </div>
      )}

      {/* ── Finished state ── */}
      {finished && !running && (
        <div className="space-y-4">

          {/* Summary banner */}
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

          {/* Results list */}
          <CompanyQueue
            companies={companies}
            expandedCompanies={expandedCompanies}
            onToggle={toggleExpand}
            showPdfDownload
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
  showPdfDownload?: boolean;
}> = ({ companies, expandedCompanies, onToggle, showPdfDownload }) => {
  const downloadPdf = (c: BatchCompany) => {
    if (!c.pdfBlob) return;
    const url = URL.createObjectURL(c.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
      {companies.map(c => {
        const expanded = expandedCompanies.has(c.id);
        return (
          <div key={c.id}>
            <button
              onClick={() => onToggle(c.id)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <span className="text-slate-400 text-xs">{expanded ? '▼' : '▶'}</span>
              <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{c.docs.length} docs</span>
              <StatusBadge status={c.status} />
              {showPdfDownload && c.pdfBlob && (
                <button
                  onClick={e => { e.stopPropagation(); downloadPdf(c); }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold shrink-0"
                >
                  PDF ↓
                </button>
              )}
            </button>

            {expanded && (
              <div className="px-4 pb-3 space-y-1.5 bg-slate-50/50 dark:bg-slate-800/30">
                {c.docs.map((d, di) => (
                  <div key={di} className="flex items-center gap-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span className="text-slate-400 text-xs w-4 shrink-0">{di + 1}.</span>
                    <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{d.file.name}</span>
                    <StatusBadge status={d.status} label={d.status === 'error' ? (d.error?.slice(0, 40) ?? 'Error') : undefined} />
                  </div>
                ))}
                {c.error && (
                  <p className="text-xs text-red-500 dark:text-red-400 pt-1">{c.error}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
