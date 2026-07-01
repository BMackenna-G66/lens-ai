import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { API_KEY_PLACEHOLDER, PREDEFINED_FIELDS, GEMINI_COMPARISON_PROMPT_TEMPLATE, GEMINI_CHAT_SYSTEM_INSTRUCTION, GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE, GEMINI_RISK_ANALYSIS_PROMPT_TEMPLATE, GEMINI_INTEGRITY_ANALYSIS_PROMPT_TEMPLATE, GEMINI_FINANCIAL_PROMPT_TEMPLATE, GEMINI_BANK_STATEMENT_PROMPT_TEMPLATE, GEMINI_CROSS_ANALYSIS_PROMPT_TEMPLATE, GEMINI_CRYPTO_FORENSIC_PROMPT, GEMINI_COMPLIANCE_AUDIT_PROMPT, GEMINI_TAX_FOLDER_PROMPT_TEMPLATE, GEMINI_CRYPTO_PATTERN_ALERT_PROMPT, GEMINI_EXECUTIVE_SUMMARY_PROMPT, GEMINI_COMPLIANCE_VS_MANUAL_PROMPT, GEMINI_BATCH_ENRICHMENT_PROMPT } from "../constants";
import { ExtractedField, ComparisonResult, RiskAnalysisResult, IntegrityAnalysisResult, FinancialAnalysisResult, BankStatementAnalysisResult, CombinedAnalysisResult, CryptoWalletProfile, CryptoRiskAssessment, ComplianceAnalysisResult, TaxFolderAnalysisResult, PatternAnalysisResult, ComplianceVsManualResult } from "../types";
import { BatchEnrichedData } from "../types/batch";
import { KEYWORDS_BY_COUNTRY } from "./countryKeywords";

const getApiKey = (): string | undefined => process.env.API_KEY;

export const hasValidApiKeys = (): boolean => {
  const key = getApiKey();
  return !!key && key !== API_KEY_PLACEHOLDER && !key.includes("YOUR_API_KEY");
};

let aiInstance: GoogleGenAI | null = null;
const getAiInstance = (): GoogleGenAI => {
  const apiKey = getApiKey();
  if (!apiKey || !hasValidApiKeys()) throw new Error("No hay una API Key de Gemini válida configurada.");
  if (!aiInstance) aiInstance = new GoogleGenAI({ apiKey });
  return aiInstance;
};

const extractJsonFromResponse = (text: string): string => {
  const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/s;
  const fenceMatch = text.trim().match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  if (firstBrace === -1 && firstBracket === -1) return text.trim();
  let startIdx: number;
  let startChar: string;
  let endChar: string;
  if (firstBrace === -1) { startChar = '['; endChar = ']'; startIdx = firstBracket; }
  else if (firstBracket === -1) { startChar = '{'; endChar = '}'; startIdx = firstBrace; }
  else {
    startIdx = Math.min(firstBrace, firstBracket);
    startChar = text[startIdx] === '{' ? '{' : '[';
    endChar = startChar === '{' ? '}' : ']';
  }
  const endIdx = text.lastIndexOf(endChar);
  if (endIdx > startIdx) return text.slice(startIdx, endIdx + 1);
  return text.trim();
};

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// Errores permanentes: no tiene sentido reintentar.
const isPermanentError = (msg: string): boolean =>
  msg.includes('api key not valid') || msg.includes('quota');

// Errores transitorios (red, sobrecarga, rate-limit): reintentar con backoff.
const isTransientError = (msg: string): boolean =>
  msg.includes('failed to fetch') ||
  msg.includes('networkerror') ||
  msg.includes('fetch failed') ||
  msg.includes('load failed') ||
  msg.includes('timeout') ||
  msg.includes('overloaded') ||
  msg.includes('unavailable') ||
  msg.includes('429') ||
  msg.includes('500') ||
  msg.includes('502') ||
  msg.includes('503') ||
  msg.includes('504');

async function executeWithRetry<T>(apiCall: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  if (!hasValidApiKeys()) throw new Error("No hay API Keys de Gemini válidas configuradas.");
  const ai = getAiInstance();

  let lastError: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await apiCall(ai);
    } catch (error: any) {
      lastError = error;
      const msg = (error?.message || '').toString().toLowerCase();
      // No reintentar errores permanentes, ni tras el último intento.
      if (isPermanentError(msg) || !isTransientError(msg) || attempt === MAX_ATTEMPTS) break;
      await sleep(attempt * 1200); // backoff: 1.2s, 2.4s
    }
  }

  let cleanMessage = lastError?.message || "Error desconocido de la API.";
  const lower = cleanMessage.toLowerCase();
  if (lower.includes("api key not valid")) cleanMessage = "La API Key de Gemini no es válida.";
  else if (lower.includes("quota")) cleanMessage = "Se ha excedido la cuota de la API de Gemini.";
  else if (isTransientError(lower)) cleanMessage = "No se pudo conectar con Gemini tras varios intentos (error de red o sobrecarga). Reintenta en unos segundos.";
  throw new Error(`El análisis falló. Error: ${cleanMessage}`);
}

const primaryAnalysisModel = 'gemini-2.5-flash';
const chatModel = 'gemini-2.5-flash';
const jsonConfig = { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } as const;

// ─── Token tracking (fire-and-forget) ────────────────────────────────────────
interface UsageMeta { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
function fireTokenEvent(operation: string, model: string, usage: UsageMeta | null | undefined): void {
  if (!usage) return;
  import('./analyticsService').then(({ trackTokenUsage }) => {
    trackTokenUsage(
      operation,
      model,
      usage.promptTokenCount    ?? 0,
      usage.candidatesTokenCount ?? 0,
      usage.totalTokenCount      ?? 0,
    );
  }).catch(() => {});
}

export const detectCountryWithGemini = async (documentText: string): Promise<string> => {
  const countryList = Object.keys(KEYWORDS_BY_COUNTRY);
  const prompt = GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE(documentText, countryList);
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: chatModel, contents: prompt, config: { thinkingConfig: { thinkingBudget: 0 } } });
    fireTokenEvent('Detección País', chatModel, response.usageMetadata as UsageMeta);
    const country = response.text?.trim().toLowerCase() || 'unknown';
    return (countryList.includes(country) || country === 'unknown') ? country : 'unknown';
  });
};

export const analyzeDocumentWithGemini = async (prompt: string): Promise<{ extractedData: ExtractedField[]; rawResponse: string }> => {
  const responseSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { field: { type: Type.STRING, enum: PREDEFINED_FIELDS }, value: { type: Type.STRING } }, required: ['field', 'value'] } };
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: prompt, config: { responseMimeType: "application/json", responseSchema, thinkingConfig: { thinkingBudget: 0 } } });
    fireTokenEvent('Análisis Documento', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    const text = response.text;
    if (!text?.trim()) throw new Error("Respuesta vacía de la API de Gemini.");
    const parsedData: ExtractedField[] = JSON.parse(extractJsonFromResponse(text));
    const extractedDataMap = new Map(parsedData.map(item => [item.field, item.value]));
    return { extractedData: PREDEFINED_FIELDS.map(f => ({ field: f, value: extractedDataMap.get(f) || "No especificado" })), rawResponse: text };
  });
};

export const analyzeDocumentComparisonWithGemini = async (primaryDocumentExtractedData: ExtractedField[], supplementaryDocumentText: string): Promise<ComparisonResult> => {
  const primaryDataJson = JSON.stringify(primaryDocumentExtractedData.map(f => ({ [f.field]: f.value })).reduce((obj, item) => ({...obj, ...item}), {}));
  const prompt = GEMINI_COMPARISON_PROMPT_TEMPLATE(primaryDataJson, supplementaryDocumentText);
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: prompt, config: jsonConfig });
    fireTokenEvent('Comparación Documentos', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la API.");
    return JSON.parse(extractJsonFromResponse(response.text)) as ComparisonResult;
  });
};

export const getChatResponse = async (systemInstruction: string, fullChatHistoryForGemini: { role: 'user' | 'model', parts: { text: string }[] }[], newUserQuery: string): Promise<string> => {
  return executeWithRetry(async (ai) => {
    const chat = ai.chats.create({ model: chatModel, config: { systemInstruction }, history: fullChatHistoryForGemini });
    const responseStream = await chat.sendMessageStream({ message: newUserQuery });
    let aggregatedResponse = "";
    let lastChunk: { usageMetadata?: UsageMeta } | undefined;
    for await (const chunk of responseStream) {
      aggregatedResponse += chunk.text;
      lastChunk = chunk as { usageMetadata?: UsageMeta };
    }
    fireTokenEvent('Chat Documento', chatModel, lastChunk?.usageMetadata);
    return aggregatedResponse || "No se recibió una respuesta de la IA.";
  });
};

export const analyzeDocumentForRisks = async (documentText: string): Promise<RiskAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_RISK_ANALYSIS_PROMPT_TEMPLATE(documentText), config: jsonConfig });
    fireTokenEvent('Análisis Riesgo', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as RiskAnalysisResult;
  });
};

export const analyzeDocumentIntegrity = async (documentText: string): Promise<IntegrityAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_INTEGRITY_ANALYSIS_PROMPT_TEMPLATE(documentText), config: jsonConfig });
    fireTokenEvent('Análisis Integridad', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as IntegrityAnalysisResult;
  });
};

export const analyzeFinancialDocumentWithGemini = async (documentText: string): Promise<FinancialAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_FINANCIAL_PROMPT_TEMPLATE(documentText), config: jsonConfig });
    fireTokenEvent('Análisis Financiero', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as FinancialAnalysisResult;
  });
};

export const analyzeBankStatementWithGemini = async (documentText: string): Promise<BankStatementAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_BANK_STATEMENT_PROMPT_TEMPLATE(documentText), config: jsonConfig });
    fireTokenEvent('Análisis Bancario', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as BankStatementAnalysisResult;
  });
};

export const analyzeTaxFolderWithGemini = async (documentText: string): Promise<TaxFolderAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_TAX_FOLDER_PROMPT_TEMPLATE(documentText), config: jsonConfig });
    fireTokenEvent('Análisis Tributario', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as TaxFolderAnalysisResult;
  });
};

export const analyzeCrossCheckWithGemini = async (documentText: string): Promise<CombinedAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_CROSS_ANALYSIS_PROMPT_TEMPLATE(documentText), config: jsonConfig });
    fireTokenEvent('Cruce Financiero', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as CombinedAnalysisResult;
  });
};

export const analyzeCryptoWalletWithGemini = async (walletProfile: CryptoWalletProfile): Promise<CryptoRiskAssessment> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_CRYPTO_FORENSIC_PROMPT(JSON.stringify(walletProfile, null, 2)), config: jsonConfig });
    fireTokenEvent('Análisis Cripto', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as CryptoRiskAssessment;
  });
};

export const analyzeComplianceDocumentWithGemini = async (documentText: string): Promise<ComplianceAnalysisResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: GEMINI_COMPLIANCE_AUDIT_PROMPT(documentText), config: jsonConfig });
    fireTokenEvent('Evaluación AML', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as ComplianceAnalysisResult;
  });
};

export const analyzeCryptoPatterns = async (transactions: any[], walletAddress: string, network: string): Promise<PatternAnalysisResult> => {
  const transactionsJson = JSON.stringify(transactions.slice(0, 50), null, 2);
  const prompt = GEMINI_CRYPTO_PATTERN_ALERT_PROMPT(transactionsJson, walletAddress, network);
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: prompt, config: jsonConfig });
    fireTokenEvent('Patrones Cripto', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    if (!response.text) throw new Error("Respuesta vacía de la IA.");
    return JSON.parse(extractJsonFromResponse(response.text)) as PatternAnalysisResult;
  });
};

export const generateExecutiveSummary = async (extractedData: ExtractedField[], fileName: string): Promise<string> => {
  const fieldsText = extractedData.map(f => `${f.field}: ${f.value}`).join('\n');
  const prompt = GEMINI_EXECUTIVE_SUMMARY_PROMPT(fieldsText, fileName);
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });
    fireTokenEvent('Resumen Ejecutivo', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    return response.text || 'No se pudo generar el resumen ejecutivo.';
  });
};

export const analyzeBatchEnrichment = async (documentText: string): Promise<BatchEnrichedData> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: GEMINI_BATCH_ENRICHMENT_PROMPT(documentText),
      config: jsonConfig,
    });
    fireTokenEvent('Batch Enrichment', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    try {
      return JSON.parse(extractJsonFromResponse(response.text)) as BatchEnrichedData;
    } catch {
      return {};
    }
  });
};

export const analyzeComplianceVsManual = async (
  manualText: string,
  documentText: string
): Promise<ComplianceVsManualResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: GEMINI_COMPLIANCE_VS_MANUAL_PROMPT(manualText, documentText),
      config: jsonConfig,
    });
    fireTokenEvent('Compliance vs Manual', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    return JSON.parse(extractJsonFromResponse(response.text)) as ComplianceVsManualResult;
  });
};
