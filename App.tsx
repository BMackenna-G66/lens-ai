

import React, { useState, useCallback, useEffect, useId } from 'react';
import { FileUpload } from './components/FileUpload';
import { DocumentCard } from './components/DocumentCard';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Alert } from './components/Alert';
import { PREDEFINED_FIELDS, GEMINI_PROMPT_TEMPLATE, API_KEY_PLACEHOLDER, GEMINI_CHAT_SYSTEM_INSTRUCTION } from './constants'; 
import { ProcessedDocument, FileProcessingStatus, ExtractedField, SupplementaryDocumentAnalysis, SupplementaryAnalysisStatus, ComparisonResult, ChatMessage, QueueItem, AnalysisPurpose, RiskAnalysisStatus } from './types';
import { getTextFromFile } from './services/fileProcessorService';
import { analyzeDocumentWithGemini, analyzeDocumentComparisonWithGemini, getChatResponse, detectCountryWithGemini, analyzeDocumentForRisks } from './services/geminiService';
import { generatePdf } from './services/pdfGenerator';
import { generateCsv } from './services/csvGenerator';
import { IconJson, IconCsv, IconAlertTriangleSolid, IconFileText, IconFiles } from './components/IconComponents'; // Added IconFileText, IconFiles
import { DocumentChat } from './components/DocumentChat';
import { KEYWORDS_BY_COUNTRY } from './services/countryKeywords';

const parseGeminiTableResponse = (markdownTable: string): ExtractedField[] => {
  console.log("Raw Gemini Markdown Table Received:\n---\n" + markdownTable + "\n---");
  const lines = markdownTable.split('\n').map(line => line.trim()).filter(line => line.startsWith('|') && line.endsWith('|')); 
  if (lines.length === 0) {
    console.warn("No lines matching table row format found in Gemini response.");
    return PREDEFINED_FIELDS.map(fieldName => ({ field: fieldName, value: "No especificado (formato de respuesta IA inesperado)" }));
  }
  const extractedDataMap: { [key: string]: string } = {};
  let dataRowsStartIndex = 0;
  const headerIndex = lines.findIndex(line => {
    const lowerLine = line.toLowerCase();
    return lowerLine.includes('campo') && lowerLine.includes('valor extraído');
  });
  if (headerIndex !== -1) {
    dataRowsStartIndex = headerIndex + 1;
    if (lines.length > dataRowsStartIndex && lines[dataRowsStartIndex].includes('---')) dataRowsStartIndex++; 
  } else {
    console.warn("Specific table header 'Campo | Valor extraído' not found. Attempting to parse from the first valid-looking table line.");
  }
  const dataLines = lines.slice(dataRowsStartIndex);
  dataLines.forEach((line, index) => {
    const parts = line.split('|').map(part => part.trim());
    if (parts.length >= 3) { 
      const fieldName = parts[1];
      const fieldValue = parts[2] !== undefined ? parts[2] : ""; 
      if (fieldName && !fieldName.includes('---')) {
        if (PREDEFINED_FIELDS.includes(fieldName)) extractedDataMap[fieldName] = fieldValue;
        else console.warn(`Found field "${fieldName}" in table, but it's not in PREDEFINED_FIELDS. Skipping. Value: "${fieldValue}"`);
      } else if (fieldName && fieldName.includes('---')) console.warn(`Skipping line ${index} as it appears to be a separator: ${line}`);
    } else console.warn(`Skipping malformed table line ${index} (parts.length < 3): ${line}`);
  });
  const result = PREDEFINED_FIELDS.map(fieldName => ({ field: fieldName, value: extractedDataMap[fieldName] || "No especificado" }));
  console.log("Parsed Extracted Data (final result fed to UI):\n", JSON.stringify(result, null, 2));
  return result;
};

// Maps keyword keys from JSON to the user-facing field names in PREDEFINED_FIELDS
const keywordFieldMap: { [key: string]: string | undefined } = {
  'id_tributaria': "RUT de la sociedad",
  'razon_social': "Razón Social",
  'fecha_constitucion': "Fecha de Constitución en formato fecha",
  'direccion': "Domicilio Legal",
  'representante_legal': "Representante Legal o Administrador",
  'objeto_social': "Objeto Social",
  'capital_social': "Capital Social (suscrito y pagado)",
  'duracion': "Duración de la sociedad",
  'numero_registro': "Número y tipo de acciones", // Mapping based on common use
  'tipo_sociedad': "Forma de administración" // Mapping based on common use
};


const App: React.FC = () => {
  const [processedDocuments, setProcessedDocuments] = useState<ProcessedDocument[]>([]);
  const [processingQueue, setProcessingQueue] = useState<QueueItem[]>([]);
  const [currentProcessingJobInfo, setCurrentProcessingJobInfo] = useState<{ id: string, displayName: string, isConsolidated: boolean } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<'checking' | 'ok' | 'missing'>('checking');
  const [activeChatDocumentId, setActiveChatDocumentId] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'single' | 'consolidated'>('single');
  const [analysisPurpose, setAnalysisPurpose] = useState<AnalysisPurpose>('extract');


  useEffect(() => {
    const key = process.env.API_KEY;
    if (key && key !== API_KEY_PLACEHOLDER && key.length > 10) {
      setApiKeyStatus('ok');
      console.log("API Key status: OK");
    } else {
      setApiKeyStatus('missing');
      console.warn(`API Key status: MISSING or placeholder. API_KEY: '${key}'.`);
    }
  }, []);

  const handleFilesSelected = (files: File[]) => {
    setGlobalError(null);
    if (analysisMode === 'single') {
      const newDocuments: ProcessedDocument[] = files.map(file => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        fileName: file.name,
        status: FileProcessingStatus.QUEUED,
        purpose: analysisPurpose,
        statusMessage: "En cola",
        extractedData: [],
        supplementaryAnalyses: [],
        chatMessages: [],
        riskAnalysisStatus: RiskAnalysisStatus.PENDING,
      }));
      setProcessedDocuments(prev => [...prev, ...newDocuments]);
      setProcessingQueue(prev => [...prev, ...files]);
    } else { // consolidated mode
      if (files.length === 0) return;
      const consolidatedId = `consolidated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const fileNamesArray = files.map(f => f.name);
      const displayFileName = `Análisis Consolidado (${files.length} archivo${files.length > 1 ? 's' : ''})`;
      
      const consolidatedDocument: ProcessedDocument = {
        id: consolidatedId,
        fileName: displayFileName,
        status: FileProcessingStatus.QUEUED,
        purpose: analysisPurpose,
        statusMessage: "En cola para análisis consolidado",
        extractedData: [],
        supplementaryAnalyses: [],
        chatMessages: [],
        sourceFileNames: fileNamesArray,
        riskAnalysisStatus: RiskAnalysisStatus.PENDING,
      };
      setProcessedDocuments(prev => [...prev, consolidatedDocument]);
      setProcessingQueue(prev => [...prev, { consolidatedId, files, analysisMode: 'consolidated' }]);
    }
  };
  
  const processNextFile = useCallback(async () => {
    if (currentProcessingJobInfo || processingQueue.length === 0) return;
    if (apiKeyStatus !== 'ok') {
      if (!globalError?.includes("API Key de Gemini no está configurada")) {
         setGlobalError("Error de configuración: La API Key de Gemini no está configurada o no es válida. No se pueden procesar documentos.");
      }
      return;
    }

    const queueItem = processingQueue[0];
    let documentIdToProcess: string | undefined;
    let filesToAnalyze: File[];
    let jobDisplayName: string;
    let isConsolidatedJob = false;

    if (queueItem instanceof File) { // Single file job
        const file = queueItem;
        const docEntry = processedDocuments.find(doc => doc.fileName === file.name && doc.status === FileProcessingStatus.QUEUED && !doc.sourceFileNames);
        documentIdToProcess = docEntry?.id;
        filesToAnalyze = [file];
        jobDisplayName = file.name;
    } else { // Consolidated job
        isConsolidatedJob = true;
        const consolidatedJob = queueItem as { consolidatedId: string; files: File[]; analysisMode: 'consolidated' };
        documentIdToProcess = consolidatedJob.consolidatedId;
        filesToAnalyze = consolidatedJob.files;
        const docEntry = processedDocuments.find(doc => doc.id === documentIdToProcess);
        jobDisplayName = docEntry?.fileName || `Consolidado (${filesToAnalyze.length} archivos)`;
    }
    
    if (!documentIdToProcess) {
        console.error("CRITICAL: Could not find document ID for processing job:", queueItem);
        setProcessingQueue(prev => prev.slice(1));
        setCurrentProcessingJobInfo(null); 
        return;
    }

    const finalDocumentId = documentIdToProcess; // effectively final for closure
    setCurrentProcessingJobInfo({ id: finalDocumentId, displayName: jobDisplayName, isConsolidated: isConsolidatedJob });

    const updateDocumentStatus = (status: FileProcessingStatus, data?: Partial<ProcessedDocument>) => {
        setProcessedDocuments(prevDocs => prevDocs.map(doc => doc.id === finalDocumentId ? {...doc, status, ...data} : doc));
    };

    console.log(`Processing ${isConsolidatedJob ? 'consolidated job' : 'file'}: ${jobDisplayName} (ID: ${finalDocumentId})`);
    
    try {
      setProcessingQueue(prev => prev.slice(1)); 
      const docToProcess = processedDocuments.find(doc => doc.id === finalDocumentId);
      if (!docToProcess) {
        throw new Error("Could not find document in state to determine processing purpose.");
      }
      
      let combinedTextContent = "";
      if (isConsolidatedJob) {
        updateDocumentStatus(FileProcessingStatus.READING, { statusMessage: `Iniciando lectura de ${filesToAnalyze.length} archivos...` });
        for (let i = 0; i < filesToAnalyze.length; i++) {
          const currentFile = filesToAnalyze[i];
          updateDocumentStatus(FileProcessingStatus.READING, { statusMessage: `Leyendo archivo ${i + 1}/${filesToAnalyze.length}: ${currentFile.name}` });
          const text = await getTextFromFile(currentFile);
          combinedTextContent += text + "\n\n"; // Add separator between files
          console.log(`Text content extracted for ${currentFile.name} (length: ${text.length})`);
        }
        combinedTextContent = combinedTextContent.trim();
      } else { // Single file
        const fileToProcess = filesToAnalyze[0];
        updateDocumentStatus(FileProcessingStatus.READING, {statusMessage: (fileToProcess.type === 'application/pdf' || fileToProcess.type === 'image/png') ? "Preparando OCR..." : "Leyendo archivo..."});
        combinedTextContent = await getTextFromFile(fileToProcess);
        console.log(`Text content extracted for ${fileToProcess.name} (length: ${combinedTextContent.length}, first 1000 chars):\n${combinedTextContent.substring(0, 1000)}`);
      }

      if (!combinedTextContent.trim()) { 
        throw new Error(isConsolidatedJob ? "El contenido combinado de los archivos está vacío o no se pudo extraer texto." : ((filesToAnalyze[0].type === 'application/pdf' || filesToAnalyze[0].type === 'image/png') ? "OCR_NO_TEXT_DETECTED" : "El contenido del archivo TXT está vacío."));
      }

      updateDocumentStatus(FileProcessingStatus.ANALYZING, { rawTextContent: combinedTextContent });

      if (docToProcess.purpose === 'extract') {
        let detectedCountry = 'unknown';
        let countryContext = '';

        try {
            updateDocumentStatus(FileProcessingStatus.DETECTING_COUNTRY, { statusMessage: "Detectando país del documento..." });
            detectedCountry = await detectCountryWithGemini(combinedTextContent);
            
            if (detectedCountry !== 'unknown' && KEYWORDS_BY_COUNTRY[detectedCountry]) {
                const keywords = KEYWORDS_BY_COUNTRY[detectedCountry];
                const countryName = detectedCountry.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                let contextParts = [`El documento parece ser de ${countryName}. Para mejorar la precisión, presta especial atención a los siguientes términos específicos del país:`];
                
                for (const key in keywords) {
                    const fieldName = keywordFieldMap[key];
                    if (fieldName) { // Only include fields we can map
                        contextParts.push(`- Para '${fieldName}', busca términos como: ${keywords[key].join(', ')}.`);
                    }
                }
                countryContext = contextParts.join('\n');
                updateDocumentStatus(FileProcessingStatus.ANALYZING, { statusMessage: `País detectado: ${countryName}. Analizando con IA...`, detectedCountry });
            } else {
                console.warn(`País no detectado o sin palabras clave. Usando análisis genérico.`);
                updateDocumentStatus(FileProcessingStatus.ANALYZING, { statusMessage: "País no detectado. Analizando con IA...", detectedCountry: 'unknown' });
            }
        } catch (error: any) {
            console.error("Error during country detection, fallback to generic analysis:", error);
            setGlobalError(`Error detectando el país. Se procederá con un análisis genérico. Error: ${error.message}`);
            updateDocumentStatus(FileProcessingStatus.ANALYZING, { statusMessage: "Error detectando país. Usando análisis genérico...", detectedCountry: 'unknown' });
        }

        const prompt = GEMINI_PROMPT_TEMPLATE(combinedTextContent, countryContext);
        const rawAnalysis = await analyzeDocumentWithGemini(prompt); 
        if (!rawAnalysis || typeof rawAnalysis !== 'string' || rawAnalysis.trim() === '') {
          throw new Error("La respuesta de la IA está vacía o no es válida.");
        }
        const extractedData = parseGeminiTableResponse(rawAnalysis); 
        const hasMeaningfulData = extractedData.some(d => d.value !== "No especificado" && d.value !== "No especificado (formato de respuesta IA inesperado)" && d.value.trim() !== "");
        if (!hasMeaningfulData) console.warn(`No meaningful data was extracted for ${jobDisplayName}.`);
        updateDocumentStatus(FileProcessingStatus.COMPLETED, { extractedData, rawGeminiResponse: rawAnalysis, statusMessage: "Análisis completado." });

      } else { // chat_only
        console.log(`Skipping extraction for ${jobDisplayName} (chat-only mode). Document ready for chat.`);
        updateDocumentStatus(FileProcessingStatus.COMPLETED, {
            extractedData: [], // Ensure it's empty
            rawGeminiResponse: "N/A (modo solo chat)",
            statusMessage: "Documento listo para chatear.",
        });
      }

    } catch (error: any) {
      console.error(`Error processing ${isConsolidatedJob ? 'consolidated job' : 'file'} ${jobDisplayName} (ID: ${finalDocumentId}):`, error.message, error.stack);
      let userFriendlyMessage = "Error desconocido durante el procesamiento.";
      const rawMessage = error.message || "";

      if (isConsolidatedJob) {
        userFriendlyMessage = rawMessage.startsWith("El contenido combinado") ? rawMessage : `Error en análisis consolidado: ${rawMessage}`;
      } else {
        const fileNameForError = filesToAnalyze[0]?.name || "el archivo";
        if (rawMessage === "PDF_ZERO_PAGES") userFriendlyMessage = `El PDF "${fileNameForError}" no contiene páginas.`;
        else if (rawMessage === "OCR_NO_TEXT_DETECTED") userFriendlyMessage = `OCR no pudo detectar texto en el archivo "${fileNameForError}". Puede ser una imagen de muy baja calidad o no contener texto.`;
        else if (rawMessage === "OCR_NO_TEXT_DETECTED_PNG") userFriendlyMessage = `OCR no pudo detectar texto en la imagen PNG "${fileNameForError}".`;
        else if (rawMessage.startsWith("OCR_INIT_ERROR")) userFriendlyMessage = `Error al inicializar OCR para "${fileNameForError}": ${rawMessage.substring(rawMessage.indexOf(":")+1).trim()}`;
        else if (rawMessage.startsWith("OCR_CANVAS_CONTEXT_ERROR")) userFriendlyMessage = `Error técnico con canvas durante OCR para "${fileNameForError}".`;
        else if (rawMessage.startsWith("OCR_PROCESSING_ERROR")) userFriendlyMessage = `Error durante el procesamiento OCR del archivo "${fileNameForError}": ${rawMessage.substring(rawMessage.indexOf(":")+1).trim()}`;
        else if (rawMessage === "El contenido del archivo TXT está vacío.") userFriendlyMessage = `El archivo de texto "${fileNameForError}" está vacío.`;
        else userFriendlyMessage = rawMessage; 
      }
      updateDocumentStatus(FileProcessingStatus.ERROR, { errorMessage: userFriendlyMessage, statusMessage: "Error en análisis." });
      if (!globalError?.includes(jobDisplayName)) setGlobalError(`Error procesando ${jobDisplayName}: ${userFriendlyMessage}`);
    } finally {
      setCurrentProcessingJobInfo(null);
    }
  }, [processingQueue, currentProcessingJobInfo, processedDocuments, apiKeyStatus, globalError, analysisPurpose]);

  useEffect(() => {
    if (!currentProcessingJobInfo && processingQueue.length > 0 && apiKeyStatus === 'ok') {
      processNextFile();
    } else if (!currentProcessingJobInfo && processingQueue.length > 0 && apiKeyStatus !== 'ok') {
       if (!globalError?.includes("API Key de Gemini no está configurada")) { 
         setGlobalError("Error de configuración: La API Key de Gemini no está configurada o no es válida. No se pueden procesar documentos.");
      }
    }
  }, [processingQueue, currentProcessingJobInfo, apiKeyStatus, processNextFile, globalError]);

  const handleAddSupplementaryFile = async (primaryDocId: string, supplementaryFile: File) => {
    if (apiKeyStatus !== 'ok') {
        setGlobalError("La API Key de Gemini no está configurada. No se puede analizar el documento complementario.");
        return;
    }
    const primaryDoc = processedDocuments.find(doc => doc.id === primaryDocId);
    if (!primaryDoc || primaryDoc.status !== FileProcessingStatus.COMPLETED || !primaryDoc.extractedData || primaryDoc.purpose === 'chat_only') {
        setGlobalError("El documento principal no está listo para análisis comparativo.");
        return;
    }

    const supplementaryAnalysisId = `${supplementaryFile.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAnalysisEntry: SupplementaryDocumentAnalysis = {
        id: supplementaryAnalysisId,
        supplementaryFileName: supplementaryFile.name,
        status: SupplementaryAnalysisStatus.ANALYZING,
        statusMessage: "Iniciando análisis comparativo...",
    };

    setProcessedDocuments(prevDocs => prevDocs.map(doc => 
        doc.id === primaryDocId ? {
            ...doc,
            supplementaryAnalyses: [...(doc.supplementaryAnalyses || []), newAnalysisEntry]
        } : doc
    ));
    
    const updateSupplementaryStatus = (status: SupplementaryAnalysisStatus, data?: Partial<SupplementaryDocumentAnalysis>) => {
        setProcessedDocuments(prevDocs => prevDocs.map(doc => {
            if (doc.id === primaryDocId) {
                return {
                    ...doc,
                    supplementaryAnalyses: (doc.supplementaryAnalyses || []).map(sa => 
                        sa.id === supplementaryAnalysisId ? {...sa, status, ...data} : sa
                    )
                };
            }
            return doc;
        }));
    };

    try {
        updateSupplementaryStatus(SupplementaryAnalysisStatus.ANALYZING, { statusMessage: "Extrayendo texto del doc. complementario..." });
        const supplementaryText = await getTextFromFile(supplementaryFile);
        if (!supplementaryText.trim()) {
            throw new Error("El contenido del documento complementario está vacío o no se pudo extraer texto.");
        }
        updateSupplementaryStatus(SupplementaryAnalysisStatus.ANALYZING, { supplementaryTextContent: supplementaryText, statusMessage: "Comparando con IA..." });
        const comparisonResult: ComparisonResult = await analyzeDocumentComparisonWithGemini(primaryDoc.extractedData, supplementaryText);
        
        updateSupplementaryStatus(SupplementaryAnalysisStatus.COMPLETED, { comparisonResult, statusMessage: "Comparación completada." });

    } catch (error: any) {
        console.error(`Error analyzing supplementary file ${supplementaryFile.name} for primary doc ${primaryDoc.fileName}:`, error);
        const userFriendlyMessage = error.message || "Error desconocido durante la comparación.";
        updateSupplementaryStatus(SupplementaryAnalysisStatus.ERROR, { errorMessage: userFriendlyMessage, statusMessage: "Error en comparación." });
        setGlobalError(`Error comparando ${supplementaryFile.name}: ${userFriendlyMessage}`);
    }
  };

  const handleRequestRiskAnalysis = async (documentId: string) => {
    const doc = processedDocuments.find(d => d.id === documentId);
    if (!doc || !doc.rawTextContent) {
      setGlobalError("No se puede analizar riesgos: falta el texto del documento.");
      return;
    }

    setProcessedDocuments(prevDocs => prevDocs.map(d => 
      d.id === documentId ? { ...d, riskAnalysisStatus: RiskAnalysisStatus.ANALYZING } : d
    ));

    try {
      const riskResult = await analyzeDocumentForRisks(doc.rawTextContent);
      setProcessedDocuments(prevDocs => prevDocs.map(d => 
        d.id === documentId ? { ...d, riskAnalysisStatus: RiskAnalysisStatus.COMPLETED, riskAnalysisResult: riskResult } : d
      ));
    } catch (error: any) {
      console.error(`Error during risk analysis for doc ${documentId}:`, error);
      setProcessedDocuments(prevDocs => prevDocs.map(d => 
        d.id === documentId ? { ...d, riskAnalysisStatus: RiskAnalysisStatus.ERROR, riskAnalysisError: error.message } : d
      ));
    }
  };

  const buildDocumentContextForChat = (doc: ProcessedDocument): string => {
    let context = `Documento Principal (${doc.fileName}):\n${doc.rawTextContent || "Contenido no disponible."}\n\n`;
    if (doc.sourceFileNames && doc.sourceFileNames.length > 0) {
        context += `Este documento principal es una consolidación de los siguientes archivos fuente: ${doc.sourceFileNames.join(', ')}\n\n`;
    }
    if (doc.supplementaryAnalyses && doc.supplementaryAnalyses.length > 0) {
      context += "Documentos Complementarios:\n";
      doc.supplementaryAnalyses.forEach(sa => {
        if (sa.status === SupplementaryAnalysisStatus.COMPLETED && sa.supplementaryTextContent) {
          context += `--- ${sa.supplementaryFileName} ---\n${sa.supplementaryTextContent}\n\n`;
        }
      });
    }
    return context;
  };

  const handleToggleChat = (documentId: string) => {
    setActiveChatDocumentId(prevId => (prevId === documentId ? null : documentId));
  };
  
  const handleSendChatMessage = async (documentId: string, messageText: string) => {
     if (apiKeyStatus !== 'ok') {
        setProcessedDocuments(prevDocs => prevDocs.map(d => d.id === documentId ? {...d, chatError: "La API Key de Gemini no está configurada. El chat no funcionará."} : d));
        return;
    }
    const userMessageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      text: messageText,
      timestamp: new Date().toISOString(),
    };
    const aiMessageId = `msg-ai-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
    const loadingAiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'model',
      text: '...',
      timestamp: new Date().toISOString(),
      isLoading: true,
    };

    setProcessedDocuments(prevDocs => prevDocs.map(doc => {
      if (doc.id === documentId) {
        return {
          ...doc,
          chatMessages: [...(doc.chatMessages || []), userMessage, loadingAiMessage],
          isChatLoading: true,
          chatError: undefined, 
        };
      }
      return doc;
    }));

    try {
      const doc = processedDocuments.find(d => d.id === documentId);
      if (!doc) throw new Error("Documento no encontrado para el chat.");

      const documentContext = buildDocumentContextForChat(doc);
      
      const historyForGeminiApi: { role: 'user' | 'model', parts: { text: string }[] }[] = [];

      historyForGeminiApi.push({ 
        role: "user", 
        parts: [{text: `CONSIGNE IMPORTANTE: El siguiente texto es el contexto de los documentos que he cargado. Debes basar TODAS tus respuestas EXCLUSIVAMENTE en este texto. No uses conocimiento externo. Si la información no está, dilo.\n\nCONTEXTO:\n${documentContext}\n\nFIN DEL CONTEXTO.`}] 
      });
      historyForGeminiApi.push({ 
        role: "model", 
        parts: [{text: "Entendido. He procesado el contexto. Estoy listo para tus preguntas."}] 
      });
      
      const actualPastMessages = (doc.chatMessages || []).filter(m => m.id !== userMessageId && m.id !== aiMessageId);
      actualPastMessages.forEach(msg => {
        historyForGeminiApi.push({ role: msg.role, parts: [{ text: msg.text }] });
      });
      
      const aiResponseText = await getChatResponse(
        GEMINI_CHAT_SYSTEM_INSTRUCTION,
        historyForGeminiApi,
        messageText 
      );

      const aiResponseMessage: ChatMessage = {
        id: aiMessageId, 
        role: 'model',
        text: aiResponseText,
        timestamp: new Date().toISOString(),
        isLoading: false,
      };

      setProcessedDocuments(prevDocs => prevDocs.map(d => {
        if (d.id === documentId) {
          const updatedMessages = (d.chatMessages || []).map(m => m.id === aiMessageId ? aiResponseMessage : m);
          return { ...d, chatMessages: updatedMessages, isChatLoading: false };
        }
        return d;
      }));

    } catch (error: any) {
      console.error(`Error sending chat message for doc ${documentId}:`, error);
      const errorMessage = error.message || "Error desconocido en el chat.";
      setProcessedDocuments(prevDocs => prevDocs.map(d => {
        if (d.id === documentId) {
          const updatedMessages = (d.chatMessages || []).map(m => 
            m.id === aiMessageId ? { ...m, text: `Error: ${errorMessage}`, isLoading: false, error: errorMessage } : m
          );
          return { ...d, chatMessages: updatedMessages, isChatLoading: false, chatError: errorMessage };
        }
        return d;
      }));
    }
  };


  const handleDownloadPdf = (doc: ProcessedDocument) => {
    if (doc.status !== FileProcessingStatus.COMPLETED || !doc.extractedData || doc.extractedData.length === 0) {
      setGlobalError(`El documento ${doc.fileName} no tiene datos extraídos para generar PDF.`);
      return;
    }
    generatePdf(doc.fileName, doc.extractedData);
  };

  const handleDownloadAllCsv = () => {
    const completedDocs = processedDocuments.filter(doc => doc.status === FileProcessingStatus.COMPLETED && doc.extractedData && doc.extractedData.length > 0);
    if (completedDocs.length === 0) {
      setGlobalError("No hay documentos analizados con éxito para exportar a CSV.");
      return;
    }
    generateCsv(completedDocs);
    setGlobalError(null);
  };

  const handleDownloadAllJson = () => {
    const completedDocs = processedDocuments.filter(doc => doc.status === FileProcessingStatus.COMPLETED && doc.extractedData && doc.extractedData.length > 0);
    if (completedDocs.length === 0) {
      setGlobalError("No hay documentos analizados con éxito para exportar a JSON.");
      return;
    }
    const jsonDataToSave = completedDocs.map(doc => ({
        fileName: doc.fileName,
        sourceFileNames: doc.sourceFileNames, // Include source file names for consolidated
        analysisDate: new Date().toISOString(),
        detectedCountry: doc.detectedCountry,
        extractedFields: doc.extractedData.reduce((acc, item) => {
          const key = item.field.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
          acc[key || `campo_${PREDEFINED_FIELDS.indexOf(item.field)}`] = item.value;
          return acc;
        }, {} as Record<string, string>),
        rawGeminiOutput: doc.rawGeminiResponse,
        supplementaryAnalyses: doc.supplementaryAnalyses?.map(sa => ({
            supplementaryFileName: sa.supplementaryFileName,
            status: sa.status,
            ...(sa.status === SupplementaryAnalysisStatus.COMPLETED && { comparisonResult: sa.comparisonResult }),
            ...(sa.status === SupplementaryAnalysisStatus.ERROR && { errorMessage: sa.errorMessage }),
        })) || [],
      }));

    const blob = new Blob([JSON.stringify(jsonDataToSave, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analisis_documentos_export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setGlobalError(null);
  };

  const removeDocument = (id: string) => {
    const docToRemove = processedDocuments.find(doc => doc.id === id);
     if (docToRemove && currentProcessingJobInfo && docToRemove.id === currentProcessingJobInfo.id) {
        setGlobalError("No se puede eliminar un archivo mientras está siendo procesado.");
        return;
    }
    if (docToRemove?.supplementaryAnalyses?.some(sa => sa.status === SupplementaryAnalysisStatus.ANALYZING)) {
        setGlobalError("No se puede eliminar un archivo mientras se analiza un documento complementario.");
        return;
    }
    if (docToRemove?.isChatLoading) {
        setGlobalError("No se puede eliminar mientras el chat está respondiendo.");
        return;
    }
    setProcessedDocuments(prev => prev.filter(doc => doc.id !== id));
    
    // Remove from processing queue if it's there
    setProcessingQueue(prevQueue => prevQueue.filter(item => {
        if (item instanceof File) { // Single file job in queue
            // This logic might be tricky if filenames are not unique before processing starts.
            // A better way would be to associate queue items with document IDs directly.
            // For now, if removing by filename for single files:
            return docToRemove ? item.name !== docToRemove.fileName : true; 
        } else { // Consolidated job in queue
            return docToRemove ? item.consolidatedId !== docToRemove.id : true;
        }
    }));

    if (activeChatDocumentId === id) {
        setActiveChatDocumentId(null);
    }
  };

  const hasSuccessfullyCompletedDocuments = processedDocuments.some(doc => doc.status === FileProcessingStatus.COMPLETED && doc.extractedData && doc.extractedData.length > 0);
  const isProcessingPrimary = !!currentProcessingJobInfo;
  const isProcessingSupplementary = processedDocuments.some(doc => doc.supplementaryAnalyses?.some(sa => sa.status === SupplementaryAnalysisStatus.ANALYZING));
  const isAnyChatLoading = processedDocuments.some(doc => doc.isChatLoading);
  const isAnyRiskAnalysisRunning = processedDocuments.some(doc => doc.riskAnalysisStatus === RiskAnalysisStatus.ANALYZING);
  const isProcessing = isProcessingPrimary || isProcessingSupplementary || isAnyChatLoading || isAnyRiskAnalysisRunning;


  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 flex flex-col">
      <header className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
          LENS - AI <br />
          Analizador de Documentos Legales
        </h1>
        <p className="text-lg text-slate-600 mt-2">
          Extrae información clave, compara y chatea con tus documentos usando IA.
        </p>
      </header>

      <main className="flex-grow container mx-auto max-w-7xl w-full">
        {apiKeyStatus === 'missing' && (
           <Alert type="warning" message={`ADVERTENCIA: La API Key de Gemini no parece estar configurada o es inválida (placeholder: ${API_KEY_PLACEHOLDER}). El análisis de documentos y el chat no funcionarán hasta que se configure correctamente.`} />
        )}
         {apiKeyStatus === 'checking' && ( 
           <Alert type="info" message="Verificando configuración de API Key..." />
        )}
        
        <div className="mb-6 p-4 bg-white rounded-lg shadow-lg border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">
            <span className="text-primary-600">Paso 1:</span> Configura tu Análisis
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
              <label htmlFor="analysis-purpose" className="block text-sm font-medium text-slate-700 mb-2 text-center md:text-left">
                1. Objetivo del Análisis
              </label>
              <select
                id="analysis-purpose"
                value={analysisPurpose}
                onChange={(e) => setAnalysisPurpose(e.target.value as AnalysisPurpose)}
                className="w-full bg-slate-100 border border-slate-300 rounded-lg py-3 px-4 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition"
                aria-label="Seleccionar objetivo del análisis"
              >
                <option value="extract">Crear Ficha y Chatear</option>
                <option value="chat_only">Solo Chatear (sin extracción)</option>
              </select>
              <p className="text-xs text-slate-500 mt-2 text-center md:text-left">
                {analysisPurpose === 'extract' 
                    ? 'Extrae datos estructurados en una ficha y permite chatear.' 
                    : 'Sube documentos solo para conversar con ellos a través del chat.'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 text-center md:text-left">
                2. Modo de Carga
              </label>
              <div className="flex flex-col sm:flex-row justify-center items-stretch gap-3 sm:gap-4">
                 <button
                    onClick={() => setAnalysisMode('single')}
                    className={`flex-1 sm:flex-initial sm:min-w-[200px] py-3 px-5 rounded-lg font-semibold transition-all duration-200 ease-in-out border-2 focus:outline-none focus:ring-4
                      ${analysisMode === 'single' 
                        ? 'bg-primary-500 text-white border-primary-500 shadow-xl ring-primary-500/50' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-primary-400'}`}
                    aria-pressed={analysisMode === 'single'}
                  >
                    <div className="flex items-center justify-center">
                      <IconFileText className="w-6 h-6 mr-2.5" />
                      <span>Individual</span>
                    </div>
                    <p className="text-xs font-normal mt-1 opacity-80">Un solo archivo</p>
                  </button>
                  <button
                    onClick={() => setAnalysisMode('consolidated')}
                    className={`flex-1 sm:flex-initial sm:min-w-[200px] py-3 px-5 rounded-lg font-semibold transition-all duration-200 ease-in-out border-2 focus:outline-none focus:ring-4
                      ${analysisMode === 'consolidated' 
                        ? 'bg-primary-500 text-white border-primary-500 shadow-xl ring-primary-500/50' 
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-primary-400'}`}
                    aria-pressed={analysisMode === 'consolidated'}
                  >
                    <div className="flex items-center justify-center">
                      <IconFiles className="w-6 h-6 mr-2.5" />
                      <span>Consolidado</span>
                    </div>
                    <p className="text-xs font-normal mt-1 opacity-80">Múltiples archivos</p>
                  </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mb-6 p-4 bg-white rounded-lg shadow-lg border border-slate-200">
         <h2 className="text-xl font-semibold text-slate-800 mb-3 text-center">
            <span className="text-primary-600">Paso 2:</span> Carga tus Documentos
          </h2>
          <FileUpload 
            onFilesSelected={handleFilesSelected} 
            disabled={apiKeyStatus !== 'ok' || isProcessing}
            analysisMode={analysisMode}
          />
        </div>


        {globalError && <Alert type="error" message={globalError} onClose={() => setGlobalError(null)} />}

        {(processedDocuments.length > 0 || isProcessing) && (
          <div className="mt-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4 sm:mb-0">Resultados del Análisis</h2>
              {hasSuccessfullyCompletedDocuments && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleDownloadAllCsv}
                    className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out flex items-center space-x-2"
                    aria-label="Descargar todos los análisis completados como CSV"
                    disabled={isProcessing}
                  >
                    <IconCsv className="w-5 h-5" />
                    <span>Descargar Todo (CSV)</span>
                  </button>
                  <button
                    onClick={handleDownloadAllJson}
                    className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out flex items-center space-x-2"
                    aria-label="Descargar todos los análisis completados como JSON"
                    disabled={isProcessing}
                  >
                    <IconJson className="w-5 h-5" />
                    <span>Descargar Todo (JSON)</span>
                  </button>
                </div>
              )}
            </div>

            {isProcessingPrimary && currentProcessingJobInfo && (
               <div className="my-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg shadow-lg flex items-center space-x-3">
                  <LoadingSpinner />
                  <p className="text-indigo-800">Procesando {currentProcessingJobInfo.isConsolidated ? "análisis consolidado" : "archivo"}: <span className="font-medium text-indigo-900">{currentProcessingJobInfo.displayName}</span> - {processedDocuments.find(d => d.id === currentProcessingJobInfo.id)?.statusMessage || 'Iniciando...'}</p>
               </div>
            )}
            {(isAnyChatLoading || isProcessingSupplementary || isAnyRiskAnalysisRunning) && !isProcessingPrimary && (
                 <div className="my-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg shadow-lg flex items-center space-x-3">
                  <LoadingSpinner />
                  <p className="text-indigo-800">
                    {isAnyChatLoading && "El chat con IA está generando una respuesta..."}
                    {(isAnyChatLoading && (isProcessingSupplementary || isAnyRiskAnalysisRunning)) && <br/>}
                    {isProcessingSupplementary && "Analizando documento complementario..."}
                    {(isProcessingSupplementary && isAnyRiskAnalysisRunning) && <br/>}
                    {isAnyRiskAnalysisRunning && "Analizando riesgos potenciales..."}
                  </p>
               </div>
            )}
             {!isProcessingPrimary && processingQueue.length > 0 && apiKeyStatus === 'ok' && !isAnyChatLoading && !isProcessingSupplementary && !isAnyRiskAnalysisRunning && (
                <div className="my-4 p-3 bg-slate-100 rounded-lg text-center">
                    <p className="text-slate-500 text-sm">
                        {processingQueue.length} {processingQueue.length === 1 && processingQueue[0] instanceof File ? "archivo" : "elemento(s)"} en cola para análisis.
                        {processingQueue[0] && (
                          processingQueue[0] instanceof File 
                            ? ` Siguiente: ${processingQueue[0].name}`
                            : ` Siguiente: Análisis consolidado (${(processingQueue[0] as any).files.length} archivos)`
                        )}
                    </p>
                </div>
            )}

            <div className="space-y-8">
              {processedDocuments.slice().reverse().map((doc) => (
                <div key={doc.id} className="w-full">
                  <div className={`flex flex-col md:flex-row md:space-x-6 items-start`}>
                    <div 
                      className={`
                        transition-all duration-300 ease-in-out w-full
                        ${activeChatDocumentId === doc.id ? 'md:w-3/5 lg:w-7/12' : 'md:max-w-2xl lg:max-w-3xl mx-auto'}
                      `}
                    >
                      <DocumentCard 
                        document={doc} 
                        onDownloadPdf={() => handleDownloadPdf(doc)}
                        onRemove={() => removeDocument(doc.id)}
                        onAddSupplementaryFile={handleAddSupplementaryFile}
                        isApiKeyOk={apiKeyStatus === 'ok'}
                        isChatActive={activeChatDocumentId === doc.id}
                        onToggleChat={() => handleToggleChat(doc.id)}
                        onRequestRiskAnalysis={() => handleRequestRiskAnalysis(doc.id)}
                      />
                    </div>
                    {activeChatDocumentId === doc.id && (
                      <div className="w-full mt-6 md:mt-0 md:w-2/5 lg:w-5/12 sticky top-4 self-start">
                        <DocumentChat
                          documentId={doc.id}
                          chatMessages={doc.chatMessages || []}
                          isChatLoading={!!doc.isChatLoading} 
                          chatError={doc.chatError}
                          onSendMessage={(messageText) => handleSendChatMessage(doc.id, messageText)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
         {processedDocuments.length === 0 && !isProcessing && apiKeyStatus === 'ok' && (
            <div className="mt-12 text-center py-10 border-2 border-dashed border-slate-300 rounded-lg">
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                <h3 className="mt-2 text-lg font-medium text-slate-600">Aún no se han cargado documentos.</h3>
                <p className="mt-1 text-sm text-slate-500">Selecciona un tipo de análisis y carga tus archivos PDF, PNG o TXT.</p>
            </div>
        )}
         {processedDocuments.length === 0 && !isProcessing && apiKeyStatus !== 'ok' && (
            <div className="mt-12 text-center py-10 border-2 border-dashed border-red-300 bg-red-50 rounded-lg">
                 <IconAlertTriangleSolid className="mx-auto h-12 w-12 text-red-400" />
                <h3 className="mt-2 text-lg font-medium text-red-800">Funcionalidad Limitada</h3>
                <p className="mt-1 text-sm text-red-700">
                    { apiKeyStatus === 'missing' ? `La API Key de Gemini no está configurada o es inválida (placeholder: ${API_KEY_PLACEHOLDER}).` : "Verificando la API Key."}
                </p>
                 <p className="mt-1 text-sm text-slate-500">Por favor, asegúrese de que la API Key esté disponible para habilitar el análisis de documentos y el chat.</p>
            </div>
         )}
      </main>
       <footer className="text-center mt-12 py-6 text-sm text-slate-500 border-t border-slate-200">
        Potenciado por Google Gemini API <br />by: Team compliance Global66.
      </footer>
    </div>
  );
};

export default App;