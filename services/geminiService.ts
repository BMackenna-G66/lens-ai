

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { API_KEY_PLACEHOLDER, GEMINI_COMPARISON_PROMPT_TEMPLATE, GEMINI_CHAT_SYSTEM_INSTRUCTION, GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE, GEMINI_RISK_ANALYSIS_PROMPT_TEMPLATE, GEMINI_LIMITES_PROMPT, GEMINI_CRYPTO_PROMPT, GEMINI_AML_PROMPT } from "../constants";
import { ExtractedField, ComparisonResult, RiskAnalysisResult, LimitesResult, CryptoAnalysisResult, AMLResult } from "../types";
import { KEYWORDS_BY_COUNTRY } from "./countryKeywords";

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI;

if (API_KEY && API_KEY !== API_KEY_PLACEHOLDER) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.error(`API_KEY for Gemini is not defined or is a placeholder (${API_KEY_PLACEHOLDER}). Gemini service will not be available.`);
  // Initialize with placeholder to avoid crashing, but services will throw errors.
  ai = new GoogleGenAI({ apiKey: API_KEY_PLACEHOLDER });
}

const primaryAnalysisModel = 'gemini-2.5-flash-preview-04-17';
const chatModel = 'gemini-2.5-flash-preview-04-17'; // Specify model for chat

export const detectCountryWithGemini = async (documentText: string): Promise<string> => {
    if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
        throw new Error("La API Key de Gemini no está configurada. No se puede detectar el país.");
    }
    const countryList = Object.keys(KEYWORDS_BY_COUNTRY);
    const prompt = GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE(documentText, countryList);

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: primaryAnalysisModel, // Use the flash model for speed
            contents: prompt,
            config: { thinkingConfig: { thinkingBudget: 0 } } // Disable thinking for this simple task
        });

        const text = response.text;
        const country = text?.trim().toLowerCase() || 'unknown';
        
        if (countryList.includes(country) || country === 'unknown') {
            console.log(`Country detected: ${country}`);
            return country;
        } else {
            console.warn(`Gemini returned an invalid country key: '${country}'. Defaulting to 'unknown'.`);
            return 'unknown';
        }

    } catch (error: any) {
        console.error("Error calling Gemini API for country detection:", error);
        throw new Error(`Error de la API de Gemini durante la detección de país: ${error.message || "Error desconocido"}`);
    }
};


export const analyzeDocumentWithGemini = async (prompt: string): Promise<string> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    console.error("Gemini API call attempted without a valid API Key for primary analysis.");
    throw new Error("La API Key de Gemini no está configurada correctamente. No se puede procesar el documento.");
  }
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: prompt,
    });
    
    const text = response.text;
    if (text === undefined || text === null) {
        console.warn("Gemini API returned undefined or null text response for primary analysis.");
        throw new Error("Respuesta vacía o inválida de la API de Gemini.");
    }
    return text;

  } catch (error: any) {
    console.error("Error calling Gemini API for primary analysis:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
        throw new Error("La API Key de Gemini no es válida. Por favor, verifique su configuración.");
    }
     if (error.message && error.message.toLowerCase().includes("quota")) {
        throw new Error("Se ha excedido la cuota de la API de Gemini. Intente más tarde.");
    }
    throw new Error(`Error de la API de Gemini: ${error.message || "Error desconocido"}`);
  }
};

export const analyzeDocumentComparisonWithGemini = async (primaryDocumentExtractedData: ExtractedField[], supplementaryDocumentText: string): Promise<ComparisonResult> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    console.error("Gemini API call attempted without a valid API Key for comparison analysis.");
    throw new Error("La API Key de Gemini no está configurada correctamente. No se puede realizar la comparación.");
  }

  const primaryDataJson = JSON.stringify(primaryDocumentExtractedData.map(field => ({ [field.field]: field.value })).reduce((obj, item) => ({...obj, ...item}), {}));
  const prompt = GEMINI_COMPARISON_PROMPT_TEMPLATE(primaryDataJson, supplementaryDocumentText);
  
  console.log("Sending comparison prompt to Gemini. Primary data (first 100 chars of JSON):", primaryDataJson.substring(0,100), "Supplementary text (first 100 chars):", supplementaryDocumentText.substring(0,100));

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: primaryAnalysisModel, // Comparison can use the same model
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (text === undefined || text === null || text.trim() === '') {
        console.warn("Gemini API returned undefined, null, or empty text response for comparison analysis.");
        throw new Error("Respuesta vacía o inválida de la API de Gemini para la comparación.");
    }
    
    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr) as ComparisonResult;
      if (!parsedData.validezDocumentoSecundario || !parsedData.diferenciasEncontradas) {
        console.error("Parsed JSON from Gemini for comparison is missing required fields. Raw text:", text, "Parsed:", parsedData);
        throw new Error("La respuesta JSON de la IA para la comparación tiene un formato inesperado.");
      }
      console.log("Successfully parsed comparison result from Gemini:", parsedData);
      return parsedData;
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini for comparison. Raw text:", text, "Error:", e);
      throw new Error(`La respuesta de la IA para la comparación no es un JSON válido: ${ (e as Error).message }`);
    }

  } catch (error: any) {
    console.error("Error calling Gemini API for comparison analysis:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
        throw new Error("La API Key de Gemini no es válida. Por favor, verifique su configuración.");
    }
     if (error.message && error.message.toLowerCase().includes("quota")) {
        throw new Error("Se ha excedido la cuota de la API de Gemini para comparación. Intente más tarde.");
    }
    if (error.message && (error.message.startsWith("La respuesta de la IA para la comparación no es un JSON válido") || error.message.startsWith("La respuesta JSON de la IA para la comparación tiene un formato inesperado"))) {
        throw error;
    }
    throw new Error(`Error de la API de Gemini para comparación: ${error.message || "Error desconocido"}`);
  }
};

export const getChatResponse = async (
  systemInstruction: string,
  fullChatHistoryForGemini: { role: 'user' | 'model', parts: { text: string }[] }[],
  newUserQuery: string
): Promise<string> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    console.error("Gemini API call attempted without a valid API Key for chat.");
    throw new Error("La API Key de Gemini no está configurada correctamente. No se puede usar el chat.");
  }

  try {
    // Create a new chat session on each call, providing the full history.
    // The @google/genai Chat object is stateful if retained, but recreating it with history is fine for stateless React components.
    const chat = ai.chats.create({
      model: chatModel,
      config: { systemInstruction },
      history: fullChatHistoryForGemini,
    });

    const responseStream = await chat.sendMessageStream({ message: newUserQuery });
    
    let aggregatedResponse = "";
    for await (const chunk of responseStream) { // chunk type is GenerateContentResponse
        if (chunk && chunk.text) {
            aggregatedResponse += chunk.text;
        }
    }

    if (aggregatedResponse.trim() === "") {
        console.warn("Gemini chat API returned an empty or whitespace-only response.");
        // Fallback to a generic message if AI gives no text, rather than throwing error that breaks chat UX.
        return "No se recibió una respuesta de la IA o la respuesta estaba vacía.";
    }
    
    return aggregatedResponse;

  } catch (error: any) {
    console.error("Error calling Gemini API for chat:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
      throw new Error("La API Key de Gemini no es válida para el chat. Por favor, verifique su configuración.");
    }
    if (error.message && error.message.toLowerCase().includes("quota")) {
      throw new Error("Se ha excedido la cuota de la API de Gemini para el chat. Intente más tarde.");
    }
    // Provide a more specific error message if the response was problematic but not an API key/quota issue
    if (error.message && error.message.toLowerCase().includes("model output filtered")) {
      return "La respuesta de la IA fue bloqueada o filtrada debido a políticas de seguridad. Intenta reformular tu pregunta.";
    }
    if (error.message && error.message.toLowerCase().includes("candidate was blocked")) {
      return "La IA no pudo generar una respuesta para esta pregunta debido a restricciones de contenido. Intenta con otra pregunta.";
    }
    throw new Error(`Error en el chat con IA: ${error.message || "Error desconocido"}`);
  }
};


export const analyzeDocumentForRisks = async (documentText: string): Promise<RiskAnalysisResult> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    throw new Error("La API Key de Gemini no está configurada. No se puede realizar el análisis de riesgos.");
  }
  const prompt = GEMINI_RISK_ANALYSIS_PROMPT_TEMPLATE(documentText);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: primaryAnalysisModel, // Can use the same model
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text || text.trim() === '') {
      throw new Error("Respuesta vacía de la IA para el análisis de riesgos.");
    }
    
    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr) as RiskAnalysisResult;
      // Basic validation
      if (typeof parsedData.suspiciousActivity?.detected !== 'boolean' || typeof parsedData.suspiciousLanguage?.detected !== 'boolean') {
         throw new Error("El JSON de la IA para el análisis de riesgos tiene un formato inesperado.");
      }
      return parsedData;
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini for risk analysis. Raw text:", text, "Error:", e);
      throw new Error(`La respuesta de la IA para el análisis de riesgos no es un JSON válido: ${ (e as Error).message }`);
    }

  } catch (error: any) {
    console.error("Error calling Gemini API for risk analysis:", error);
    throw new Error(`Error de la API de Gemini durante el análisis de riesgos: ${error.message || "Error desconocido"}`);
  }
};

export const analyzeLimitesTransaccionales = async (
  country: string,
  transactionType: string,
  amount: string,
  currency: string,
  description: string
): Promise<LimitesResult> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    throw new Error("La API Key de Gemini no está configurada. No se puede evaluar los límites transaccionales.");
  }
  const prompt = GEMINI_LIMITES_PROMPT(country, transactionType, amount, currency, description);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text || text.trim() === '') {
      throw new Error("Respuesta vacía de la IA para el análisis de límites transaccionales.");
    }

    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr) as LimitesResult;
      if (typeof parsedData.cumple !== 'boolean' || !parsedData.nivelRiesgo) {
        throw new Error("El JSON de la IA para límites transaccionales tiene un formato inesperado.");
      }
      return parsedData;
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini for límites transaccionales. Raw text:", text, "Error:", e);
      throw new Error(`La respuesta de la IA para límites transaccionales no es un JSON válido: ${(e as Error).message}`);
    }
  } catch (error: any) {
    console.error("Error calling Gemini API for límites transaccionales:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
      throw new Error("La API Key de Gemini no es válida. Por favor, verifique su configuración.");
    }
    if (error.message && error.message.toLowerCase().includes("quota")) {
      throw new Error("Se ha excedido la cuota de la API de Gemini. Intente más tarde.");
    }
    throw new Error(`Error de la API de Gemini durante el análisis de límites transaccionales: ${error.message || "Error desconocido"}`);
  }
};

export const analyzeCryptoRisk = async (
  walletAddress: string,
  blockchain: string,
  transactionData: string
): Promise<CryptoAnalysisResult> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    throw new Error("La API Key de Gemini no está configurada. No se puede analizar el riesgo cripto.");
  }
  const prompt = GEMINI_CRYPTO_PROMPT(walletAddress, blockchain, transactionData);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text || text.trim() === '') {
      throw new Error("Respuesta vacía de la IA para el análisis de criptoactivos.");
    }

    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr) as CryptoAnalysisResult;
      if (!parsedData.nivelRiesgo || !parsedData.resumenRiesgo) {
        throw new Error("El JSON de la IA para el análisis de criptoactivos tiene un formato inesperado.");
      }
      return parsedData;
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini for crypto analysis. Raw text:", text, "Error:", e);
      throw new Error(`La respuesta de la IA para el análisis cripto no es un JSON válido: ${(e as Error).message}`);
    }
  } catch (error: any) {
    console.error("Error calling Gemini API for crypto analysis:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
      throw new Error("La API Key de Gemini no es válida. Por favor, verifique su configuración.");
    }
    if (error.message && error.message.toLowerCase().includes("quota")) {
      throw new Error("Se ha excedido la cuota de la API de Gemini. Intente más tarde.");
    }
    throw new Error(`Error de la API de Gemini durante el análisis de criptoactivos: ${error.message || "Error desconocido"}`);
  }
};

export const analyzeAML = async (
  documentText: string,
  entityType: string,
  country: string
): Promise<AMLResult> => {
  if (!API_KEY || API_KEY === API_KEY_PLACEHOLDER) {
    throw new Error("La API Key de Gemini no está configurada. No se puede realizar la evaluación AML.");
  }
  const prompt = GEMINI_AML_PROMPT(documentText, entityType, country);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: primaryAnalysisModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text || text.trim() === '') {
      throw new Error("Respuesta vacía de la IA para la evaluación AML.");
    }

    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr) as AMLResult;
      if (!parsedData.nivelRiesgo || typeof parsedData.puntuacion !== 'number') {
        throw new Error("El JSON de la IA para la evaluación AML tiene un formato inesperado.");
      }
      return parsedData;
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini for AML analysis. Raw text:", text, "Error:", e);
      throw new Error(`La respuesta de la IA para la evaluación AML no es un JSON válido: ${(e as Error).message}`);
    }
  } catch (error: any) {
    console.error("Error calling Gemini API for AML analysis:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
      throw new Error("La API Key de Gemini no es válida. Por favor, verifique su configuración.");
    }
    if (error.message && error.message.toLowerCase().includes("quota")) {
      throw new Error("Se ha excedido la cuota de la API de Gemini. Intente más tarde.");
    }
    throw new Error(`Error de la API de Gemini durante la evaluación AML: ${error.message || "Error desconocido"}`);
  }
};
