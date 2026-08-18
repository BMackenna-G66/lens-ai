import { BatchCompanyInput, BatchMode, BatchEnrichedData, AdminComparisonResult } from '../types/batch';
import { ExtractedField } from '../types';
import { GEMINI_PROMPT_TEMPLATE } from '../constants';
import {
  analyzeDocumentWithGemini,
  detectCountryWithGemini,
  generateExecutiveSummary,
  analyzeBatchEnrichment,
  analyzeAdminComparison,
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
  adminComparison?: AdminComparisonResult; // comparativa vs datos oficiales (solo EmpresaDocs)
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

  // Acá había 6 llamadas a Gemini dentro de un `allSettled` cuyo resultado NADIE
  // leía: se pagaban y se tiraban. Se quitaron. Si el modo "completo" tiene que
  // aportar algo más que la extracción, hay que consumir el resultado y mostrarlo;
  // mientras eso no exista, gastar 6 llamadas por empresa no tiene sentido.
  if (mode === 'completo') {
    onPhase('Análisis de riesgos y cumplimiento...');
  }

  onPhase('Generando resumen ejecutivo...');
  const executiveSummary = await generateExecutiveSummary(extractedData, fileNames);

  onPhase('Enriqueciendo ficha...');
  let enrichedData: BatchEnrichedData = {};
  try {
    enrichedData = await analyzeBatchEnrichment(combinedText);
  } catch { /* non-critical — PDF se genera igual sin datos enriquecidos */ }

  // ── Comparativa contra Admin (solo EmpresaDocs, cuando hay datos oficiales) ────
  let adminComparison: AdminComparisonResult | undefined;
  const meta = company.companyMetadata;
  const hayDatosAdmin = company.source === 'empresa_docs' && !!meta && (
    (meta.legalRepresentatives?.length ?? 0) > 0 ||
    (meta.beneficialOwners?.length ?? 0) > 0 ||
    (meta.boardMembers?.length ?? 0) > 0 ||
    (meta.adminRaw && Object.keys(meta.adminRaw).length > 0) ||
    !!company.identificationNumber
  );
  if (hayDatosAdmin) {
    onPhase('Comparando contra datos de Admin...');
    // Contexto extraído de los documentos (campos + estructura + actividades + representante).
    const extraido = [
      `Razón social (documento): ${company.companyName}`,
      ...extractedData.map(f => `${f.field}: ${f.value}`),
      enrichedData.estructuraSocietaria ? `Estructura societaria: ${JSON.stringify(enrichedData.estructuraSocietaria)}` : '',
      enrichedData.informacionTributaria?.actividadesEconomicas?.length ? `Actividades económicas: ${enrichedData.informacionTributaria.actividadesEconomicas.join('; ')}` : '',
      enrichedData.verificacionRepresentante ? `Representante (documento): ${JSON.stringify(enrichedData.verificacionRepresentante)}` : '',
    ].filter(Boolean).join('\n');
    // Datos oficiales de EmpresaDocs. Incluye el registro crudo completo, que
    // trae industria/actividades y demás campos oficiales para la comparación.
    const datosAdmin = JSON.stringify({
      razonSocial: company.companyName,
      rut: company.identificationNumber,
      representantesLegales: meta?.legalRepresentatives ?? [],
      accionistasBeneficiarios: meta?.beneficialOwners ?? [],
      directorio: meta?.boardMembers ?? [],
      registroOficial: meta?.adminRaw ?? {},
    });
    try { adminComparison = await analyzeAdminComparison(extraido, datosAdmin); }
    catch { /* no crítico — la ficha se genera igual */ }
  }

  // ── Enriquecimiento Regcheq (AML + SII) — empresas chilenas ───────────────────
  onPhase('Consultando Regcheq (AML + SII)...');
  let regcheqEnrichment: RegcheqEnrichment | undefined;
  // RUT: primero el de la empresa; si falta (p.ej. carpeta local), el extraído del doc.
  const rutFromDocs = extractedData.find(f => /rut/i.test(f.field))?.value ?? '';
  const rutSrc = company.identificationNumber || rutFromDocs;
  const rut = rutSrc.replace(/[.\s-]/g, '').toUpperCase();
  // Empresa con RUT (>=7 dígitos + dígito verificador) → se consulta Regcheq.
  const tieneRut = /^[0-9]{7,8}[0-9K]$/.test(rut);
  if (tieneRut && hasRegcheqKey()) {
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
    adminComparison,
  );

  return { extractedData, executiveSummary, pdfBlob, errorCount, rawText: combinedText, regcheqEnrichment, adminComparison };
}
