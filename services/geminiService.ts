import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { API_KEY_PLACEHOLDER, PREDEFINED_FIELDS, GEMINI_COMPARISON_PROMPT_TEMPLATE, GEMINI_CHAT_SYSTEM_INSTRUCTION, GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE, GEMINI_RISK_ANALYSIS_PROMPT_TEMPLATE, GEMINI_INTEGRITY_ANALYSIS_PROMPT_TEMPLATE, GEMINI_FINANCIAL_PROMPT_TEMPLATE, GEMINI_BANK_STATEMENT_PROMPT_TEMPLATE, GEMINI_CROSS_ANALYSIS_PROMPT_TEMPLATE, GEMINI_CRYPTO_FORENSIC_PROMPT, GEMINI_COMPLIANCE_AUDIT_PROMPT, GEMINI_TAX_FOLDER_PROMPT_TEMPLATE, GEMINI_CRYPTO_PATTERN_ALERT_PROMPT, GEMINI_EXECUTIVE_SUMMARY_PROMPT, GEMINI_COMPLIANCE_VS_MANUAL_PROMPT, GEMINI_BATCH_ENRICHMENT_PROMPT, GEMINI_ADMIN_COMPARISON_PROMPT } from "../constants";
import { ExtractedField, ComparisonResult, RiskAnalysisResult, IntegrityAnalysisResult, FinancialAnalysisResult, BankStatementAnalysisResult, CombinedAnalysisResult, CryptoWalletProfile, CryptoRiskAssessment, ComplianceAnalysisResult, TaxFolderAnalysisResult, PatternAnalysisResult, ComplianceVsManualResult } from "../types";
import { BatchEnrichedData, AdminComparisonResult } from "../types/batch";
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

// Modelo Gemini. 'gemini-2.5-flash' fue deprecado por Google (404). Se usa el
// Flash estable vigente. Alternativa auto-actualizable: 'gemini-flash-latest'.
const primaryAnalysisModel = 'gemini-3.5-flash';
// Se exporta para poder guardarlo junto a la extracción: cuando el modelo cambie,
// hace falta saber cuál produjo cada ficha para poder comparar calidad.
export const MODELO_ANALISIS = primaryAnalysisModel;
const chatModel = 'gemini-3.5-flash';
const jsonConfig = { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } as const;

// ─── Token tracking (fire-and-forget) ────────────────────────────────────────
export interface UsageMeta { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
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

// `uso` se AGREGA al retorno, no reemplaza nada: los llamadores que solo
// desestructuran `extractedData` y `rawResponse` siguen igual. Hace falta porque
// los tokens se estaban tirando —solo iban a analytics— y sin ellos
// `lens.analisis` no puede dar la línea base de costo.
export const analyzeDocumentWithGemini = async (prompt: string): Promise<{ extractedData: ExtractedField[]; rawResponse: string; uso?: UsageMeta }> => {
  const responseSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { field: { type: Type.STRING, enum: PREDEFINED_FIELDS }, value: { type: Type.STRING } }, required: ['field', 'value'] } };
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({ model: primaryAnalysisModel, contents: prompt, config: { responseMimeType: "application/json", responseSchema, thinkingConfig: { thinkingBudget: 0 } } });
    const uso = response.usageMetadata as UsageMeta | undefined;
    fireTokenEvent('Análisis Documento', primaryAnalysisModel, uso);
    const text = response.text;
    if (!text?.trim()) throw new Error("Respuesta vacía de la API de Gemini.");
    const parsedData: ExtractedField[] = JSON.parse(extractJsonFromResponse(text));
    const extractedDataMap = new Map(parsedData.map(item => [item.field, item.value]));
    return { extractedData: PREDEFINED_FIELDS.map(f => ({ field: f, value: extractedDataMap.get(f) || "No especificado" })), rawResponse: text, uso };
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

export const analyzeAdminComparison = async (
  extraidoDeDocumentos: string,
  datosAdmin: string
): Promise<AdminComparisonResult> => {
  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: GEMINI_ADMIN_COMPARISON_PROMPT(extraidoDeDocumentos, datosAdmin),
      config: jsonConfig,
    });
    fireTokenEvent('Admin Comparison', primaryAnalysisModel, response.usageMetadata as UsageMeta);
    try {
      const parsed = JSON.parse(extractJsonFromResponse(response.text ?? '')) as Partial<AdminComparisonResult>;
      return {
        disponible: true,
        razonSocialRutConsistente: parsed.razonSocialRutConsistente ?? null,
        representanteConsistente: parsed.representanteConsistente ?? null,
        actividadesConsistente: parsed.actividadesConsistente ?? null,
        accionistasConsistente: parsed.accionistasConsistente ?? null,
        inconsistencias: Array.isArray(parsed.inconsistencias) ? parsed.inconsistencias : [],
        resumen: parsed.resumen,
      };
    } catch {
      return { disponible: true, inconsistencias: [], resumen: 'No se pudo procesar la comparación.' };
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

// ═══════════════════════════════════════════════════════════════════════════
// Ruta multimodal — el archivo va NATIVO al modelo, no su texto
// ═══════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE. Hoy ningún camino de Lens le manda el documento al modelo:
// la SPA le manda lo que sacó Tesseract y `lens-api` lo que sacó pypdf. Las dos
// mandan TEXTO, y el texto pierde la estructura de la tabla — que es
// exactamente de donde sale el porcentaje de participación de cada accionista.
// Sin esto, una tabla de socios llega aplanada y las personas se fusionan.
//
// NO REEMPLAZA NADA. Es una función nueva al lado de las que ya están; ninguna
// de las existentes cambia. Vive en este archivo y no en un módulo aparte a
// propósito: comparte `executeWithRetry`, el mapeo de errores y el conteo de
// tokens con el resto. Duplicar eso significaría dos políticas de reintento
// que se separan con el tiempo, que es peor que compartir el archivo.
//
// Medido contra el cluster con una escritura sintética de una página:
// `gemini-3.5-flash` acepta el PDF inline y devuelve los 18 campos, con la
// tabla de accionistas completa y sus tres porcentajes. 1.931 tokens de entrada
// contra 1.883 de la ruta de texto: el PDF nativo NO es más caro por sí mismo.

export const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** El MIME que hay que mandarle a Gemini, o null si el tipo no se soporta. */
export function mimeParaGemini(archivo: File): string | null {
  if (archivo.type && Object.values(MIME_POR_EXTENSION).includes(archivo.type)) return archivo.type;
  // Algunos navegadores y varias descargas de S3 no traen `type`: se cae a la
  // extensión antes de rechazar el archivo.
  const ext = archivo.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_POR_EXTENSION[ext] ?? null;
}

// Tope del request inline de Gemini. Es el límite DOCUMENTADO por Google
// (20 MB para todo el request, no solo el archivo), no uno que yo haya medido.
// Se corta antes con un mensaje claro en vez de dejar que la API devuelva un
// error críptico. Un archivo más grande necesita la Files API, que es otra cosa.
export const TOPE_INLINE_BYTES = 18 * 1024 * 1024;   // margen bajo los 20 MB

/** El archivo como base64 sin el prefijo `data:`. */
export async function archivoABase64(archivo: File): Promise<string> {
  const buf = await archivo.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // De a trozos: `String.fromCharCode(...bytes)` con un PDF entero revienta la
  // pila de argumentos.
  let bin = '';
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(bin);
}

export interface RespuestaMultimodal {
  texto: string;
  uso?: UsageMeta;
}

/**
 * Le manda el archivo NATIVO al modelo junto con el prompt.
 *
 * `responseSchema` es opcional: sin él la respuesta viene como texto libre; con
 * él, Gemini la fuerza al esquema (que es como se va a pedir el contrato de
 * shareholders).
 */
export async function generarConArchivo(
  archivo: File,
  prompt: string,
  opciones?: { responseSchema?: unknown; operacion?: string },
): Promise<RespuestaMultimodal> {
  const mime = mimeParaGemini(archivo);
  if (!mime) {
    throw new Error(
      `El análisis falló. Error: tipo de archivo no soportado para la ruta multimodal (${archivo.name}). ` +
      `Se aceptan PDF, JPG y PNG.`,
    );
  }
  if (archivo.size > TOPE_INLINE_BYTES) {
    throw new Error(
      `El análisis falló. Error: el archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope para mandarlo ` +
      `en línea es ${(TOPE_INLINE_BYTES / 1024 / 1024).toFixed(0)} MB.`,
    );
  }
  const datos = await archivoABase64(archivo);

  return executeWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: primaryAnalysisModel,
      // El archivo PRIMERO y el prompt después: es el orden que recomienda
      // Google para que las instrucciones se lean con el documento ya en
      // contexto.
      contents: [{ parts: [{ inlineData: { mimeType: mime, data: datos } }, { text: prompt }] }],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        ...(opciones?.responseSchema
          ? { responseMimeType: 'application/json', responseSchema: opciones.responseSchema }
          : {}),
      },
    } as never);
    const uso = (response as { usageMetadata?: UsageMeta }).usageMetadata;
    fireTokenEvent(opciones?.operacion ?? 'Análisis Multimodal', primaryAnalysisModel, uso);
    const texto = (response as { text?: string }).text ?? '';
    if (!texto.trim()) throw new Error('Respuesta vacía de la API de Gemini.');
    return { texto, uso };
  });
}

/**
 * Los 18 campos, pero leyendo el archivo NATIVO en vez de su texto.
 *
 * Existe para poder comparar las dos rutas sobre el mismo documento, que es
 * cómo se verifica que la multimodal no perdió nada. NO se usa todavía en el
 * flujo del analizador: el camino de texto sigue siendo el que corre.
 */
export async function analizarArchivoNativoConGemini(
  archivo: File,
  prompt: string,
): Promise<{ extractedData: ExtractedField[]; rawResponse: string; uso?: UsageMeta }> {
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: { field: { type: Type.STRING, enum: PREDEFINED_FIELDS }, value: { type: Type.STRING } },
      required: ['field', 'value'],
    },
  };
  const { texto, uso } = await generarConArchivo(archivo, prompt, {
    responseSchema, operacion: 'Análisis Documento (nativo)',
  });
  const parsed: ExtractedField[] = JSON.parse(extractJsonFromResponse(texto));
  const mapa = new Map(parsed.map(i => [i.field, i.value]));
  return {
    extractedData: PREDEFINED_FIELDS.map(f => ({ field: f, value: mapa.get(f) || 'No especificado' })),
    rawResponse: texto,
    uso,
  };
}
