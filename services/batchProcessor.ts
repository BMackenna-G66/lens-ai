import { BatchCompanyInput, BatchMode, BatchEnrichedData } from '../types/batch';
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
  analyzeBatchEnrichment,
} from './geminiService';
import { getTextFromFile } from './fileProcessorService';
import { generateBatchCompanyPdf } from './pdfGenerator';
import { fetchRegcheqEnrichment, hasRegcheqKey } from './regcheqEnrichment';
import { RegcheqEnrichment } from '../types/lens360';

export interface CompanyProcessResult {
  extractedData: ExtractedField[];
  executiveSummary: string;
  pdfBlob: Blob;
  errorCount: number;
  rawText: string;       // texto consolidado de todos los docs — contexto para el chat
  regcheqEnrichment?: RegcheqEnrichment; // screening AML + SII (empresas chilenas)
}

export interface ProcessCallbacks {
  onDocOcr: (docId: string, status: 'done' | 'error', error?: string) => void;
  onPhase: (label: string) => void;
}

// Pure processing function — no React state, no side effects beyond callbacks.
// Any origin (local_folder or empresa_docs) is accepted via BatchCompanyInput.
export async function processOneCompany(
  company: BatchCompanyInput,
  mode: BatchMode,
  { onDocOcr, onPhase }: ProcessCallbacks
): Promise<CompanyProcessResult> {

  // ── Phase 1: OCR all docs in parallel ──────────────────────────────────────
  onPhase('Extrayendo texto (OCR)...');
  const textByIndex: string[] = [];
  let errorCount = 0;

  await Promise.all(company.documents.map(async (doc, i) => {
    // Pre-existing download error — skip OCR, count as failed
    if (doc.error) {
      onDocOcr(doc.id, 'error', doc.error);
      errorCount++;
      return;
    }

    try {
      // Normalise Blob → File so getTextFromFile always receives a File
      let file: File;
      if (doc.file) {
        file = doc.file;
      } else if (doc.blob) {
        file = new File([doc.blob], doc.fileName, {
          type: doc.blob.type || 'application/pdf',
        });
      } else {
        throw new Error('Sin archivo ni blob disponible');
      }

      const text = await getTextFromFile(file);
      textByIndex[i] = text;
      onDocOcr(doc.id, 'done');
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Error OCR';
      onDocOcr(doc.id, 'error', error);
      errorCount++;
    }
  }));

  const validTexts = textByIndex.filter(Boolean);
  if (validTexts.length === 0) {
    throw new Error('No se pudo extraer texto de ningún documento');
  }

  // ── Phase 2: Consolidated Gemini analysis ──────────────────────────────────
  // All docs combined → single analysis (same pattern as DocumentAnalyzer consolidated mode)
  const combinedText = validTexts.join('\n\n');
  const fileNames = company.documents.map(d => d.fileName).join(', ');

  onPhase('Detectando país...');
  // Use known country from EmpresaDocs metadata when available to save one API call
  const country = company.country ?? await detectCountryWithGemini(combinedText);

  onPhase('Extrayendo campos...');
  const prompt = GEMINI_PROMPT_TEMPLATE(combinedText, country);
  const { extractedData } = await analyzeDocumentWithGemini(prompt);

  if (mode === 'completo') {
    onPhase('Análisis de riesgos y cumplimiento...');
    await Promise.allSettled([
      analyzeDocumentForRisks(combinedText),
      analyzeDocumentIntegrity(combinedText),
      analyzeFinancialDocumentWithGemini(combinedText),
      analyzeBankStatementWithGemini(combinedText),
      analyzeTaxFolderWithGemini(combinedText),
      analyzeCrossCheckWithGemini(combinedText),
    ]);
  }

  onPhase('Generando resumen ejecutivo...');
  const executiveSummary = await generateExecutiveSummary(extractedData, fileNames);

  onPhase('Enriqueciendo ficha...');
  let enrichedData: BatchEnrichedData = {};
  try {
    enrichedData = await analyzeBatchEnrichment(combinedText);
  } catch { /* non-critical — PDF se genera igual sin datos enriquecidos */ }

  // ── Enriquecimiento Regcheq (AML + SII) — solo empresas chilenas ──────────────
  onPhase('Consultando Regcheq (AML + SII)...');
  let regcheqEnrichment: RegcheqEnrichment | undefined;
  const rut = (company.identificationNumber || '').replace(/[.\s]/g, '').replace(/-/g, '');
  // Señal de empresa chilena: RUT con formato chileno (7-8 dígitos + dígito verificador).
  const esChilena = /^[0-9]{7,8}[0-9kK]$/.test(rut);
  if (esChilena && hasRegcheqKey()) {
    try { regcheqEnrichment = await fetchRegcheqEnrichment(rut, company.companyName); }
    catch { /* no crítico — la ficha se genera igual */ }
  }

  onPhase('Generando ficha PDF...');
  const pdfBlob = await generateBatchCompanyPdf(
    company.companyName,
    [{ docName: fileNames, extractedData, executiveSummary }],
    {
      source: company.source,
      companyId: company.companyId,
      identificationNumber: company.identificationNumber,
      country: company.country,
      complianceStatus: company.companyMetadata?.complianceStatus,
      kycStage1: company.companyMetadata?.kycStage1,
      docsAnalyzed: validTexts.length,
      docsFailed: errorCount,
    },
    enrichedData,
    regcheqEnrichment,
  );

  return { extractedData, executiveSummary, pdfBlob, errorCount, rawText: combinedText, regcheqEnrichment };
}
