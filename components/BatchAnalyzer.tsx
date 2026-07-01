import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { ExtractedField } from '../types';
import { BatchCompanyInput, BatchSourceType, BatchMode, CompanyMetadata } from '../types/batch';
import { fromLocalFolder } from '../services/batchInputNormalizer';
import { processOneCompany } from '../services/batchProcessor';
import { hasValidApiKeys } from '../services/geminiService';
import { EmpresaDocsImporter } from './EmpresaDocsImporter';

// ─── Runtime state types (UI-only, not part of the input contract) ────────────

type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

interface BatchDocState {
  id: string;
  fileName: string;
  slot?: string;
  ocrStatus: ItemStatus;
  error?: string;
  presignedUrl?: string;
}

interface BatchCompanyState {
  // identity — mirrors BatchCompanyInput
  id: string;
  companyName: string;
  companyId?: string;
  identificationNumber?: string;
  country?: string;
  source: BatchSourceType;
  companyMetadata?: CompanyMetadata;
  // runtime
  docs: BatchDocState[];
  status: ItemStatus;
  statusLabel?: string;
  error?: string;
  pdfBlob?: Blob;
  extractedData?: ExtractedField[];
  executiveSummary?: string;
  errorCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECS_COMPLETO   = 60;  // per company
const SECS_INDIVIDUAL = 20;  // per company

function estimateMins(count: number, mode: BatchMode): number {
  return Math.ceil((count * (mode === 'completo' ? SECS_COMPLETO : SECS_INDIVIDUAL)) / 60);
}

function toCompanyState(c: BatchCompanyInput): BatchCompanyState {
  return {
    id: c.id,
    companyName: c.companyName,
    companyId: c.companyId,
    identificationNumber: c.identificationNumber,
    country: c.country,
    source: c.source,
    companyMetadata: c.companyMetadata,
    docs: c.documents.map(d => ({
      id: d.id,
      fileName: d.fileName,
      slot: d.slot,
      ocrStatus: d.error ? 'error' : 'pending',
      error: d.error,
      presignedUrl: d.presignedUrl,
    })),
    status: 'pending',
    errorCount: 0,
  };
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

const SourceBadge: React.FC<{ source: BatchSourceType }> = ({ source }) => (
  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
    source === 'empresa_docs'
      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
  }`}>
    {source === 'empresa_docs' ? 'EmpresaDocs' : 'Local'}
  </span>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const BatchAnalyzer: React.FC = () => {
  const [sourceType, setSourceType]   = useState<BatchSourceType>('local_folder');
  const [mode, setMode]               = useState<BatchMode>('completo');
  const [pendingInput, setPendingInput] = useState<BatchCompanyInput[]>([]);
  const [companyStates, setCompanyStates] = useState<BatchCompanyState[]>([]);
  const [running, setRunning]         = useState(false);
  const [finished, setFinished]       = useState(false);
  const [currentLabel, setCurrentLabel] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const stopRef   = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tabHidden, setTabHidden]     = useState(false);
  const [wasHiddenDuring, setWasHiddenDuring] = useState(false);

  useEffect(() => {
    const handler = () => {
      setTabHidden(document.hidden);
      if (document.hidden) setWasHiddenDuring(true);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Reset "was hidden" when a new batch starts
  const resetWasHidden = useCallback(() => setWasHiddenDuring(false), []);

  // ── Derived ──
  const totalDocs       = pendingInput.reduce((s, c) => s + c.documents.length, 0);
  const doneCompanies   = companyStates.filter(c => c.status === 'done').length;
  const errorCompanies  = companyStates.filter(c => c.status === 'error').length;
  const progress        = companyStates.length > 0
    ? Math.round((doneCompanies + errorCompanies) / companyStates.length * 100)
    : 0;

  const hasInput  = pendingInput.length > 0;
  const hasStates = companyStates.length > 0;

  // ── Input handlers ──
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const companies = fromLocalFolder(e.target.files);
    setPendingInput(companies);
    setFinished(false);
    stopRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleEmpresaDocsReady = useCallback((companies: BatchCompanyInput[]) => {
    setPendingInput(companies);
    setFinished(false);
    stopRef.current = false;
  }, []);

  // ── State updaters ──
  const patchCompany = (idx: number, patch: Partial<BatchCompanyState>) =>
    setCompanyStates(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const patchDoc = (ci: number, docId: string, patch: Partial<BatchDocState>) =>
    setCompanyStates(prev => prev.map((c, i) => {
      if (i !== ci) return c;
      return { ...c, docs: c.docs.map(d => d.id === docId ? { ...d, ...patch } : d) };
    }));

  // ── Batch loop ──
  const startBatch = async () => {
    if (!hasValidApiKeys()) {
      alert('No hay una API Key de Gemini válida. Configúrala antes de continuar.');
      return;
    }

    resetWasHidden();
    // Initialise runtime state from pending input
    const states = pendingInput.map(toCompanyState);
    setCompanyStates(states);
    setRunning(true);
    setFinished(false);
    stopRef.current = false;

    for (let ci = 0; ci < pendingInput.length; ci++) {
      if (stopRef.current) break;

      const company = pendingInput[ci];
      patchCompany(ci, { status: 'processing', statusLabel: 'Iniciando...' });
      setCurrentLabel(`${company.companyName} (${ci + 1}/${pendingInput.length})`);

      // Mark all docs as processing for OCR phase
      setCompanyStates(prev => prev.map((c, i) => {
        if (i !== ci) return c;
        return {
          ...c,
          docs: c.docs.map(d => d.ocrStatus === 'pending' ? { ...d, ocrStatus: 'processing' as const } : d),
        };
      }));

      try {
        const result = await processOneCompany(company, mode, {
          onDocOcr: (docId, status, error) => patchDoc(ci, docId, { ocrStatus: status, error }),
          onPhase: label => {
            patchCompany(ci, { statusLabel: label });
            setCurrentLabel(`${company.companyName} — ${label}`);
          },
        });

        patchCompany(ci, {
          status: 'done',
          statusLabel: undefined,
          pdfBlob: result.pdfBlob,
          extractedData: result.extractedData,
          executiveSummary: result.executiveSummary,
          errorCount: result.errorCount,
        });

      } catch (err) {
        const error = err instanceof Error ? err.message : 'Error en análisis';
        patchCompany(ci, { status: 'error', statusLabel: undefined, error });
      }
    }

    setRunning(false);
    setCurrentLabel('');
    setFinished(true);
  };

  const stopBatch  = () => { stopRef.current = true; };

  const resetBatch = () => {
    setPendingInput([]);
    setCompanyStates([]);
    setFinished(false);
    setRunning(false);
    stopRef.current = false;
    setCurrentLabel('');
  };

  // ── Downloads ──
  const downloadCompanyPdf = (c: BatchCompanyState) => {
    if (!c.pdfBlob) return;
    const url = URL.createObjectURL(c.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.companyName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    companyStates.forEach(c => { if (c.pdfBlob) zip.file(`${c.companyName}.pdf`, c.pdfBlob); });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fichas_batch_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const summaryRows = companyStates.map(c => {
      const fm: Record<string, string> = {};
      (c.extractedData ?? []).forEach(f => { fm[f.field] = f.value; });
      return {
        'Origen':                  c.source === 'empresa_docs' ? 'EmpresaDocs' : 'Carpeta Local',
        'Empresa':                 c.companyName,
        'Company ID':              c.companyId ?? '',
        'RUT / DNI Empresa':       c.identificationNumber ?? fm['RUT de la sociedad'] ?? '',
        'País':                    c.country ?? fm['País'] ?? '',
        'Compliance Status':       c.companyMetadata?.complianceStatus ?? '',
        'KYC Stage':               c.companyMetadata?.kycStage1 ?? '',
        'Estado':                  c.status === 'done' ? 'OK' : c.status === 'error' ? 'Error' : 'Pendiente',
        'Cantidad documentos':     c.docs.length,
        'Documentos con error':    c.errorCount,
        'Razón Social':            fm['Razón Social'] ?? '',
        'Representante Legal':     fm['Representante Legal'] ?? '',
        'Domicilio Legal':         fm['Domicilio Legal'] ?? '',
        'Tipo de Sociedad':        fm['Tipo de Sociedad'] ?? '',
        'Capital Social':          fm['Capital Social'] ?? '',
        'Objeto Social':           fm['Objeto Social'] ?? '',
        'Fecha Constitución':      fm['Fecha de Constitución'] ?? '',
        'Error detalle':           c.error ?? '',
      };
    });

    const errorRows: Record<string, string>[] = [];
    companyStates.forEach(c => {
      c.docs.forEach(d => {
        if (d.ocrStatus === 'error') {
          errorRows.push({
            'Empresa':    c.companyName,
            'Company ID': c.companyId ?? '',
            'Documento':  d.fileName,
            'Slot':       d.slot ?? '',
            'FileKey':    '',
            'Error':      d.error ?? '',
            'Fase':       'OCR',
          });
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resultados');
    if (errorRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(errorRows), 'Errores');
    }
    XLSX.writeFile(wb, `batch_resultados_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.xlsx`);
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

  const showSetup   = !running && !hasStates;
  const showPreview = !running && !finished && hasInput && !hasStates;
  const showRunning = running;
  const showDone    = finished && !running;

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Analizador Batch</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Procesa empresas desde carpeta local o EmpresaDocs. Todos los documentos de cada empresa se analizan como un consolidado.
          </p>
        </div>
        {(showRunning || showDone) && companyStates.some(c => c.pdfBlob) && (
          <div className="flex gap-2 flex-wrap">
            {showDone && (
              <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                📊 Excel resumen
              </button>
            )}
            <button onClick={downloadZip} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors">
              📦 Todas las fichas (.zip)
            </button>
          </div>
        )}
      </div>

      {/* ── Setup panel ── */}
      {showSetup && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">

          {/* Origin selector */}
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Origen de documentos</p>
            <div className="flex gap-3">
              {([
                { key: 'local_folder' as const, label: 'Carpeta Local', desc: 'Subcarpetas organizadas por empresa', icon: '📁' },
                { key: 'empresa_docs' as const, label: 'EmpresaDocs',   desc: 'Buscar y descargar desde EmpresaDocs/S3', icon: '🔗' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setSourceType(opt.key); setPendingInput([]); }}
                  className={`flex-1 text-left p-4 rounded-xl border-2 transition-all ${
                    sourceType === opt.key
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

          {/* Mode selector */}
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Tipo de análisis</p>
            <div className="flex gap-3">
              {([
                { key: 'completo'   as const, label: 'Análisis Completo', desc: 'Riesgos + Integridad + Financiero + Ficha', icon: '🔬' },
                { key: 'individual' as const, label: 'Solo Ficha',        desc: 'Extracción de campos + resumen ejecutivo', icon: '⚡' },
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

          {/* Folder picker (local) */}
          {sourceType === 'local_folder' && (
            <>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
                <p className="font-sans font-semibold text-slate-700 dark:text-slate-300 text-xs mb-2 not-italic">Estructura esperada:</p>
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
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Se abrirá el selector de carpetas del sistema</p>
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
            </>
          )}

          {/* EmpresaDocs importer */}
          {sourceType === 'empresa_docs' && (
            <EmpresaDocsImporter onCompaniesReady={handleEmpresaDocsReady} />
          )}
        </div>
      )}

      {/* ── Preview + launch ── */}
      {showPreview && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-black text-indigo-600">{pendingInput.length}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">empresas</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-slate-700 dark:text-white">{totalDocs}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">documentos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-amber-600">~{estimateMins(pendingInput.length, mode)} min</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">estimado · {mode}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={resetBatch} className="px-4 py-2 text-sm text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 font-semibold border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                  ✕ Limpiar
                </button>
                <button onClick={startBatch} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-950">
                  ▶ Iniciar batch
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {pendingInput.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <SourceBadge source={c.source} />
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.companyName}</span>
                <span className="text-xs text-slate-400 shrink-0">{c.documents.length} doc{c.documents.length !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Background-tab warning ── */}
      {running && !tabHidden && wasHiddenDuring && (
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-orange-800 dark:text-orange-300">
          <span className="text-lg">⚠️</span>
          <span><strong>El proceso se pausó mientras estabas fuera.</strong> El navegador congela el JS en pestañas inactivas. Ahora sigue corriendo — mantén esta pestaña activa hasta que termine.</span>
        </div>
      )}
      {running && !wasHiddenDuring && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400">
          <span>ℹ️</span>
          <span>Mantén esta pestaña activa mientras procesa — el navegador puede pausar el proceso si cambias de pestaña.</span>
        </div>
      )}

      {/* ── Running state ── */}
      {showRunning && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800 dark:text-white text-sm">Procesando batch...</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-lg">{currentLabel}</p>
              </div>
              <button onClick={stopBatch} className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-bold rounded-xl transition-colors">
                ⏹ Detener
              </button>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>{doneCompanies + errorCompanies} / {companyStates.length} empresas</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
          <CompanyQueue companies={companyStates} expandedCompanies={expandedCompanies} onToggle={toggleExpand} onDownloadPdf={downloadCompanyPdf} />
        </div>
      )}

      {/* ── Done state ── */}
      {showDone && (
        <div className="space-y-4">
          <div className={`rounded-2xl p-5 border ${
            errorCompanies === companyStates.length
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
                  <div className="text-2xl font-black text-slate-700 dark:text-white">{companyStates.reduce((s, c) => s + c.docs.length, 0)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">docs procesados</div>
                </div>
              </div>
              <button onClick={resetBatch} className="px-4 py-2 text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                🔄 Nuevo batch
              </button>
            </div>
          </div>
          <CompanyQueue companies={companyStates} expandedCompanies={expandedCompanies} onToggle={toggleExpand} onDownloadPdf={downloadCompanyPdf} />
        </div>
      )}
    </div>
  );
};

// ─── CompanyQueue ─────────────────────────────────────────────────────────────

const CompanyQueue: React.FC<{
  companies: BatchCompanyState[];
  expandedCompanies: Set<string>;
  onToggle: (id: string) => void;
  onDownloadPdf: (c: BatchCompanyState) => void;
}> = ({ companies, expandedCompanies, onToggle, onDownloadPdf }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
    {companies.map(c => {
      const expanded = expandedCompanies.has(c.id);
      return (
        <div key={c.id}>
          <div className="px-4 py-3 flex items-center gap-2">
            <button onClick={() => onToggle(c.id)} className="text-slate-400 text-xs hover:text-slate-600 dark:hover:text-slate-300 shrink-0 w-4">
              {expanded ? '▼' : '▶'}
            </button>
            <SourceBadge source={c.source} />
            <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.companyName}</span>
            <span className="text-xs text-slate-400 shrink-0">{c.docs.length} doc{c.docs.length !== 1 ? 's' : ''}</span>
            {c.status === 'processing' && c.statusLabel
              ? <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 animate-pulse shrink-0 max-w-[160px] truncate">{c.statusLabel}</span>
              : <StatusBadge status={c.status} />
            }
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
              {c.companyId && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                  Company ID: {c.companyId}
                  {c.identificationNumber && ` · RUT/DNI: ${c.identificationNumber}`}
                  {c.country && ` · ${c.country}`}
                  {c.companyMetadata?.complianceStatus && ` · ${c.companyMetadata.complianceStatus}`}
                </p>
              )}
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-1 pb-0.5">
                Documentos incluidos
              </p>
              {c.docs.map((d, di) => (
                <div key={d.id} className="flex items-center gap-3 py-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                  <span className="text-slate-400 text-xs w-4 shrink-0">{di + 1}.</span>
                  <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{d.fileName}</span>
                  {d.slot && <span className="text-[9px] text-slate-400 shrink-0">{d.slot}</span>}
                  {d.ocrStatus === 'error' && d.presignedUrl && (
                    <a
                      href={d.presignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:text-blue-700 shrink-0 underline"
                      title="Abrir PDF en nueva pestaña"
                    >
                      Abrir ↗
                    </a>
                  )}
                  <StatusBadge status={d.ocrStatus} label={d.ocrStatus === 'error' ? (d.error?.slice(0, 40) ?? 'Error OCR') : undefined} />
                </div>
              ))}
              {c.error && <p className="text-xs text-red-500 dark:text-red-400 pt-1">{c.error}</p>}
              {c.docs.length > 0 && c.docs.every(d => d.ocrStatus === 'error' && d.presignedUrl) && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 pt-1">
                  ⚠ Descarga bloqueada por CORS de S3. No hay proxy disponible. Solución: configura el proxy cloud (<strong>EMPRESADOCS_PROXY_URL</strong>) o inicia <strong>empresa_docs_app.py</strong> en tu máquina (localhost:5050) y vuelve a importar.
                </p>
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
