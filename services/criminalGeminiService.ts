
import { GoogleGenAI } from "@google/genai";
import { PersonProfile } from "../types";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { uri: string; title: string }[];
}

export const analyzeProfile = async (profile: PersonProfile, useInternet: boolean = false, message?: string, history: ChatMessage[] = []): Promise<ChatMessage> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Eres un analista criminal experto de CriminalProfile AI. 
    Tienes acceso al perfil de una persona con RUT ${profile.rut}.
    
    Contexto de la persona:
    - Es PEP (Persona Políticamente Expuesta): ${profile.isPep ? 'Sí' : 'No'}
    - Total delitos: ${profile.totalCrimes}
    - Riesgo máximo: ${profile.highestRisk}
    - Delitos de Alto Riesgo: ${profile.totalHighRiskCrimes}
    
    Historial detallado:
    ${profile.crimes.map((c, i) => `
      - Delito ${i+1}: ${c.tipo}, Estado: ${c.estado}, Fecha: ${c.fecha}, Riesgo: ${c.riesgo}, RUC: ${c.ruc}, Tribunal: ${c.tribunal}
    `).join('\n')}

    Instrucciones:
    1. Si el usuario te pide un análisis, genera un informe ejecutivo.
    2. Si el usuario pregunta cosas específicas, responde basándote en los datos.
    3. ${useInternet ? "Tienes permiso para buscar en internet para complementar el análisis (ej: peligrosidad de ciertos delitos, noticias relacionadas a los RUCs si son públicos, o leyes vigentes)." : "No uses internet, básate estrictamente en el contexto proporcionado."}
    4. Responde siempre en español, de forma profesional y directa.
  `;

  const userPrompt = message || "Genera un análisis inicial de este perfil basado en su historial.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
        tools: useInternet ? [{ googleSearch: {} }] : undefined,
      }
    });

    const text = response.text || "No se pudo generar respuesta.";
    
    // Extraer fuentes de Google Search si existen
    const sources: { uri: string; title: string }[] = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri
          });
        }
      });
    }

    return {
      role: 'model',
      text,
      sources: sources.length > 0 ? sources : undefined
    };
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      role: 'model',
      text: "Error al conectar con la IA para el análisis. Verifique su conexión y API Key."
    };
  }
};