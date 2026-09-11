
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './FileUpload';
import { DocumentCard } from './DocumentCard';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert } from './Alert';
import { PREDEFINED_FIELDS, GEMINI_PROMPT_TEMPLATE, GEMINI_CHAT_SYSTEM_INSTRUCTION } from '../constants'; 
import { ProcessedDocument, FileProcessingStatus, SupplementaryDocumentAnalysis, SupplementaryAnalysisStatus, ComparisonResult, ChatMessage, QueueItem, AnalysisPurpose, RiskAnalysisStatus, IntegrityAnalysisStatus, ExtractedField } from '../types';
import { getTextFromFile, metricasDeArchivo } from '../services/fileProcessorService';
import {
    analyzeDocumentWithGemini,
    analyzeDocumentComparisonWithGemini,
    getChatResponse,
    detectCountryWithGemini,
    analyzeDocumentForRisks,
    analyzeDocumentIntegrity,
    hasValidApiKeys,
    generateExecutiveSummary,
    MODELO_ANALISIS
} from '../services/geminiService';
import { generatePdf } from '../services/pdfGenerator';
import { fetchRegcheqEnrichment, hasRegcheqKey } from '../services/regcheqEnrichment';
import { generateCsv } from '../services/csvGenerator';
import { IconJson, IconCsv, IconAlertTriangle, IconAlertTriangleSolid, IconFileText, IconFiles, IconImport, IconExport } from './IconComponents';
import { DocumentChat } from './DocumentChat';
import { KEYWORDS_BY_COUNTRY } from '../services/countryKeywords';
import { nuevoAnalisisId, persistirAnalisis, persistirFicha, sha256Hex } from '../services/lensPersistenciaService';
import { pendientesEnBuffer, reintentarPendientes } from '../services/colasLogService';
import { extraerShareholders, filasDePersonas } from '../services/shareholdersService';
import { persistirPersonas } from '../services/lensPersistenciaService';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/dbService';
import { trackDocumentProcessed } from '../services/analyticsService';





// Maps keyword keys from JSON to the user-facing field names in PREDEFINED_FIELDS
const keywordFieldMap: { [key: string]: string | undefined } = {
  'id_tributaria': "RUT de la sociedad",
  'razon_social': "Razón Social",
  'fecha_constitucion': "Fecha de Constitución",
  'direccion': "Domicilio Legal",
  'representante_legal': "Representante Legal",
  'objeto_social': "Objeto Social",
  'capital_social': "Capital Social",
  'duracion': "Duración",
  'numero_registro': "Acciones", 
  'tipo_sociedad': "Razón Social" // Fallback or mapping as needed
};

const PROCESSING_LOCK_KEY = 'lens_ai_processing_lock';

// La ficha completa que se guarda en `lens.analisis_ficha`.
//
// Claves en snake_case, NO camelCase: Redshift baja a minúsculas el
// identificador al navegar un SUPER con punto, así que `ficha.paisDetectado`
// devuelve NULL EN SILENCIO mientras `ficha.pais_detectado` funciona.
// Verificado contra el cluster. Los objetos anidados de proveedores conservan
// su forma; para esos hay que usar json_extract_path_text.
//
// Una sola función para las dos escrituras —la de la extracción y la de después,
// cuando terminan riesgo o integridad— porque el logger reemplaza la fila
// entera: si las dos armaran el JSON distinto, la segunda perdería lo de la
// primera sin que se note.
const fichaLens = (p: {
  campos?: ExtractedField[];
  pais?: string;
  proposito?: string;
  archivos?: string[];
  consolidado?: boolean;
  regcheq?: unknown;
  riesgo?: unknown;
  integridad?: unknown;
  // Resultado de la extracción estructurada: `{ok, senales}` si corrió, o
  // `{ok:false, error}` si falló. Sin esta marca no se puede distinguir "el
  // código nunca llegó a esa pestaña" de "se ejecutó y falló", que es
  // exactamente lo que pasó al mirar `analisis_persona` vacía.
  shareholders?: unknown;
  // true cuando el archivo no dejó métricas de extracción. Mismo motivo: que la
  // ausencia sea un dato y no un silencio.
  metricasAusentes?: boolean;
}) => ({
  campos: p.campos,
  pais_detectado: p.pais,
  proposito: p.proposito,
  archivos: p.archivos,
  consolidado: p.consolidado,
  regcheq: p.regcheq,
  analisis_riesgo: p.riesgo,
  analisis_integridad: p.integridad,
  shareholders: p.shareholders,
  metricas_ausentes: p.metricasAusentes,
});

// La ficha reconstruida desde el documento tal como está ahora. Se usa al
// reescribir: junta lo que había con lo que acaba de terminar.
const fichaDelDoc = (d: ProcessedDocument, extra: { riesgo?: unknown; integridad?: unknown }) =>
  fichaLens({
    shareholders: d.shareholdersResultado,
    campos: d.extractedData,
    pais: d.detectedCountry,
    proposito: d.purpose,
    archivos: d.sourceFileNames ?? [d.fileName],
    consolidado: !!d.sourceFileNames,
    regcheq: d.regcheqEnrichment,
    riesgo: extra.riesgo ?? d.riskAnalysisResult,
    integridad: extra.integridad ?? d.integrityAnalysisResult,
  });

export const DocumentAnalyzer: React.FC<{ onOpen360?: (rut: string) => void }> = ({ onOpen360 }) => {
  // Quién ejecuta el análisis. Se guarda con la extracción en Redshift: sin esto
  // la tabla dice qué se extrajo pero no quién lo pidió.
  const { user } = useAuth();
  const [processedDocuments, setProcessedDocuments] = useState<ProcessedDocument[]>([]);
  const [processingQueue, setProcessingQueue] = useState<QueueItem[]>([]);
  const [currentProcessingJobInfo, setCurrentProcessingJobInfo] = useState<{ id: string, displayName: string, isConsolidated: boolean } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);
  const [activeChatDocumentId, setActiveChatDocumentId] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'single' | 'consolidated'>('single');
  const [analysisPurpose, setAnalysisPurpose] = useState<AnalysisPurpose>('extract');

  const tabId = useRef(`tab_${Date.now()}_${Math.random()}`).current;
    const [isLockedByAnotherTab, setIsLockedByAnotherTab] = useState(false);
  const [isKeyValid, setIsKeyValid] = useState(false);
  
  
  useEffect(() => {
    const loadData = async () => {
      const documentsFromDb = await db.documents.toArray();
      setProcessedDocuments(documentsFromDb);
    };
    loadData();

    const checkApiKey = () => {
      setIsKeyValid(hasValidApiKeys);
    };
    checkApiKey();
  }, []);

  // Reintento del log pendiente, igual que en la Bandeja.
  //
  // Hace falta acá porque hasta ahora el buffer SOLO se vaciaba desde la Bandeja
  // de Casos, y quien usa el analizador puede no abrirla nunca: si una escritura
  // fallaba —Redshift pausado, un corte de red— las filas quedaban atrapadas en
  // su navegador para siempre. Pasó: un análisis del 08-09 a las 16:16 guardó la
  // ficha y perdió el texto, y los trozos quedaron en el buffer sin nadie que
  // los reintentara.
  useEffect(() => {
    const correr = () => { if (pendientesEnBuffer() > 0) void reintentarPendientes(); };
    correr();
    const t = setInterval(correr, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
        if (event.key === PROCESSING_LOCK_KEY) {
            const lock = event.newValue ? JSON.parse(event.newValue) : null;
            setIsLockedByAnotherTab(lock && lock.tabId !== tabId);
        }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [tabId]);


  const handleFilesSelected = async (files: File[]) => {
    setGlobalError(null);
    setGlobalSuccess(null);
    if (analysisMode === 'single') {
      const newDocuments: ProcessedDocument[] = files.map(file => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        fileName: file.name,
        status: FileProcessingStatus.QUEUED,
        purpose: analysisPurpose,
        statusMessage: "En cola",
        extractedData: [],
        supplementaryAnalyses: [],
        chatMessages: [],
        riskAnalysisStatus: RiskAnalysisStatus.PENDING,
        integrityAnalysisStatus: IntegrityAnalysisStatus.PENDING,
      }));
      await db.documents.bulkAdd(newDocuments);
      setProcessedDocuments(prev => [...prev, ...newDocuments]);
      setProcessingQueue(prev => [...prev, ...files]);
    } else { // consolidated mode
      if (files.length === 0) return;
      const consolidatedId = `consolidated-${Date.now()}`;
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
        integrityAnalysisStatus: IntegrityAnalysisStatus.PENDING,
      };
      await db.documents.add(consolidatedDocument);
      setProcessedDocuments(prev => [...prev, consolidatedDocument]);
      setProcessingQueue(prev => [...prev, { consolidatedId, files, analysisMode: 'consolidated' }]);
    }
  };
  
  const processNextFile = useCallback(async () => {
    if (currentProcessingJobInfo || processingQueue.length === 0 || !isKeyValid) return;

    localStorage.setItem(PROCESSING_LOCK_KEY, JSON.stringify({ tabId, timestamp: Date.now() }));

    const queueItem = processingQueue[0];
    let docId, files, displayName, isConsolidated = false;

    if (queueItem instanceof File) {
      docId = processedDocuments.find(d => d.fileName === queueItem.name && d.status === FileProcessingStatus.QUEUED)?.id;
      files = [queueItem];
      displayName = queueItem.name;
    } else {
      isConsolidated = true;
      docId = queueItem.consolidatedId;
      files = queueItem.files;
      displayName = `Consolidado (${files.length} archivos)`;
    }
    
    if (!docId) {
      setProcessingQueue(prev => prev.slice(1));
      localStorage.removeItem(PROCESSING_LOCK_KEY);
      return;
    }
    
    setCurrentProcessingJobInfo({ id: docId, displayName, isConsolidated });

    const updateDoc = (status: FileProcessingStatus, data?: Partial<ProcessedDocument>) => {
      setProcessedDocuments(prev => prev.map(d => {
        if (d.id === docId) {
          const updatedDoc = { ...d, status, ...data };
          db.documents.put(updatedDoc);
          return updatedDoc;
        }
        return d;
      }));
    };

    const t0 = Date.now();
    // Marca de que las métricas de extracción no estuvieron. Va a la ficha.
    let metricasFaltaron = false;
    try {
      setProcessingQueue(prev => prev.slice(1));
      const docToProcess = processedDocuments.find(d => d.id === docId);
      if (!docToProcess) throw new Error("Documento no encontrado.");

      updateDoc(FileProcessingStatus.READING, { statusMessage: "Extrayendo texto..." });
      const combinedText = (await Promise.all(files.map(f => getTextFromFile(f)))).join("\n\n");
      if (!combinedText.trim()) throw new Error("El contenido del archivo está vacío.");

      updateDoc(FileProcessingStatus.ANALYZING, { rawTextContent: combinedText });

      if (docToProcess.purpose === 'extract') {
        updateDoc(FileProcessingStatus.DETECTING_COUNTRY, { statusMessage: "Detectando país..." });
        const countryRaw = await detectCountryWithGemini(combinedText);
        // Normaliza el país: quita emojis/banderas y símbolos, deja solo la palabra en minúscula.
        const country = countryRaw.replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^cl\b\s*/, '').trim() || countryRaw.trim().toLowerCase();
        const countryContextMap: { [key: string]: string } = {
          'chile': 'Estás analizando una escritura pública o documento legal chileno. Usa terminología legal chilena (RUT, SpA, SA, Ltda, Notaría, Conservador de Bienes Raíces).',
          'colombia': 'Estás analizando un documento legal colombiano. Usa terminología legal colombiana (NIT, SAS, SA, Ltda, Cámara de Comercio, matrícula mercantil).',
          'peru': 'Estás analizando un documento legal peruano. Usa terminología legal peruana (RUC, SAC, SA, EIRL, Registros Públicos, SUNARP).',
          'ecuador': 'Estás analizando un documento legal ecuatoriano. Usa terminología legal ecuatoriana (RUC, Superintendencia de Compañías).',
          'argentina': 'Estás analizando un documento legal argentino. Usa terminología legal argentina (CUIT, SA, SRL, IGJ, AFIP).',
          'mexico': 'Estás analizando un documento legal mexicano. Usa terminología legal mexicana (RFC, SA de CV, SAPI, Registro Público de Comercio).',
          'uruguay': 'Estás analizando un documento legal uruguayo. Usa terminología legal uruguaya (RUT, SA, SRL, DGI, Registro de Comercio).',
          'panama': 'Estás analizando un documento legal panameño. Usa terminología legal panameña (RUC, SA, Registro Público de Panamá).',
          'islas_caiman': 'Estás analizando un documento legal de Islas Caimán. Usa terminología de derecho corporativo de Caimán (exempted company, Cayman Islands Registry).',
          'eeuu': 'Estás analizando un documento legal estadounidense. Usa terminología legal de EE.UU. (EIN, LLC, Corp, Inc, Secretary of State, Articles of Incorporation).',
          'usa': 'Estás analizando un documento legal estadounidense en inglés. Traduce todo el contenido al español. Usa terminología legal de EE.UU. (EIN, Tax ID, LLC, Corp, Inc, Articles of Incorporation).',
          'espana': 'Estás analizando un documento legal español. Usa terminología legal española (NIF, CIF, SA, SL, Registro Mercantil, escritura pública).',
          'reino_unido': 'Estás analizando un documento legal del Reino Unido. Traduce el contenido al español. Usa terminología legal del Reino Unido (Companies House, Ltd, PLC, UTR).',
          'paraguay': 'Estás analizando un documento legal paraguayo. Usa terminología legal paraguaya (RUC, SA, SRL, Registro Público de Comercio).',
          'costa_rica': 'Estás analizando un documento legal costarricense. Usa terminología legal costarricense (cédula jurídica, SA, SRL, Registro Nacional).',
          'hong_kong': 'Estás analizando un documento legal de Hong Kong. Traduce el contenido al español. Usa terminología de derecho corporativo de Hong Kong (Companies Registry, Ltd, BRN).',
          'brasil': 'Estás analizando un documento legal brasileño en portugués. Traduce todo el contenido al español. Usa terminología legal brasileña (CNPJ, CPF, Razão Social, Junta Comercial, Ltda, SA).',
          'china': 'Estás analizando un documento legal chino (mandarín). Traduce todo el contenido al español. Usa la guía de mapeo para documentos chinos incluida a continuación.',
          'francia': 'Estás analizando un documento legal francés. Traduce todo el contenido al español. Usa terminología legal francesa (SIRET, SIREN, SARL, SA, Raison sociale, Registre du Commerce).',
          'dinamarca': 'Estás analizando un documento legal danés. Traduce todo el contenido al español. Usa terminología legal danesa (CVR-nummer, ApS, A/S, Selskabsnavn, Erhvervsstyrelsen).',
          'internacional': 'Estás analizando un documento legal de origen internacional. Traduce todo el contenido al español e identifica la jurisdicción si es posible.',
        };
        const countryContext = countryContextMap[country] || (KEYWORDS_BY_COUNTRY[country] ? `Estás analizando un documento legal de origen: ${country}. Traduce el contenido al español si es necesario.` : 'Estás analizando un documento de origen no especificado.');
        updateDoc(FileProcessingStatus.ANALYZING, { statusMessage: "Analizando con IA...", detectedCountry: country });
        
        const prompt = GEMINI_PROMPT_TEMPLATE(combinedText, countryContext);
        const { extractedData, rawResponse, uso } = await analyzeDocumentWithGemini(prompt);
        updateDoc(FileProcessingStatus.COMPLETED, { extractedData, rawGeminiResponse: rawResponse, statusMessage: "Completado." });
        trackDocumentProcessed('analyzer', country, false);

        // Enriquecimiento Regcheq (screening AML + SII) — empresas chilenas.
        // Disparo robusto: basta con detectar un RUT chileno válido. La razón social
        // NO es requisito (para el SII alcanza el RUT); si existe, se usa como nombre
        // al crear la ficha. No dependemos de la detección de país.
        const val = (f: string) => extractedData.find(x => x.field.toLowerCase().includes(f))?.value?.trim() ?? '';
        const rutRaw = val('rut');
        const razon = val('razón social') || val('razon social');
        const rut = rutRaw.replace(/[.\s-]/g, '').toUpperCase();
        // RUT chileno válido: 7-8 dígitos + dígito verificador (0-9 o K).
        const esRutValido = /^[0-9]{7,8}[0-9K]$/.test(rut);
        let enriquecimiento: unknown;
        if (esRutValido && hasRegcheqKey()) {
          updateDoc(FileProcessingStatus.COMPLETED, { regcheqEnrichment: { loading: true, consultado: true, encontrado: false, amlHits: [] } });
          try {
            const enr = await fetchRegcheqEnrichment(rut, razon);
            enriquecimiento = enr;
            updateDoc(FileProcessingStatus.COMPLETED, { regcheqEnrichment: { ...enr, loading: false } });
          } catch (e: any) {
            enriquecimiento = { error: e?.message };
            updateDoc(FileProcessingStatus.COMPLETED, { regcheqEnrichment: { loading: false, consultado: true, encontrado: false, amlHits: [], error: e?.message } });
          }
        }

        // ── Persistencia en Redshift (schema `lens`) ──────────────────────────
        // Va DESPUÉS de que el análisis quedó completo y SIN await: es un efecto,
        // no parte del análisis. Si Redshift está dormido —se pausa 18:30–04:00—
        // las filas quedan en el buffer del navegador y entran cuando vuelve.
        // Que la persistencia falle no le puede costar el trabajo a nadie.
        //
        // NO se manda `combinedText`: son 73.759 caracteres en una escritura de
        // 41 páginas. Ver el DDL en aws/colas-logger/sql/lens_schema.sql.
        const analisisId = nuevoAnalisisId();
        const analisisEn = new Date().toISOString();
        // Se resuelve ACÁ, antes de persistir, porque decide QUIÉN escribe la
        // ficha. Dos escritores para la misma fila se pisan: ver `omitirFicha`.
        const archivoNativo = files.find(f => /\.(pdf|jpe?g|png)$/i.test(f.name));
        void persistirAnalisis({
          analisisId,
          ejecutadoEn: analisisEn,
          origen: 'analizador',
          actor: user ? { uid: user.uid, nombre: user.displayName ?? undefined, email: user.email ?? undefined } : null,
          campos: extractedData,
          archivos: files.map(f => f.name),
          consolidado: isConsolidated,
          proposito: docToProcess.purpose,
          estado: 'COMPLETO',
          paisDetectado: country,
          caracteres: combinedText.length,
          modelo: MODELO_ANALISIS,
          duracionMs: Date.now() - t0,
          // Línea base de costo. Se suman las métricas de todos los archivos del
          // análisis: en consolidado son varios. La ruta de la SPA OCRea todo,
          // así que `paginasPorCapa` da 0 — es el contraste con la API, que lee
          // la capa de texto primero.
          ...(() => {
            const ms = files.map(f => metricasDeArchivo(f)).filter(Boolean) as NonNullable<ReturnType<typeof metricasDeArchivo>>[];
            // Sin métricas NO se devuelve un objeto vacío en silencio: se deja
            // dicho, porque si no la columna en NULL puede ser "no se midió" o
            // "el código no llegó" y no hay manera de saber cuál.
            if (ms.length === 0) { metricasFaltaron = true; return {}; }
            const sum = (k: 'paginasTotales' | 'paginasPorOcr' | 'paginasPorCapa') => ms.reduce((a, m) => a + m[k], 0);
            return {
              paginasTotales: sum('paginasTotales'),
              paginasPorOcr: sum('paginasPorOcr'),
              paginasPorCapa: sum('paginasPorCapa'),
            };
          })(),
          tokensPrompt: uso?.promptTokenCount,
          tokensSalida: uso?.candidatesTokenCount,
          // Si va a correr shareholders, la ficha la escribe ESE camino y
          // nadie más. Si no hay archivo nativo, se escribe acá como siempre.
          omitirFicha: !!archivoNativo,
          ficha: fichaLens({
            metricasAusentes: metricasFaltaron || undefined,
            campos: extractedData,
            pais: country,
            proposito: docToProcess.purpose,
            archivos: files.map(f => f.name),
            consolidado: isConsolidated,
            regcheq: enriquecimiento,
          }),
        }, undefined, {
          // El material crudo, para poder recalibrar: el texto EXACTO que se le
          // mandó al modelo y lo que devolvió antes de que el esquema lo
          // acomodara. Va troceado a otra tabla; ver `lens.analisis_texto`.
          textoDocumento: combinedText,
          respuestaModelo: rawResponse,
        });
        // El id queda en el documento para que riesgo e integridad puedan
        // reescribir ESTA misma ficha en vez de crear otra fila.
        void sha256Hex(combinedText).then(sha =>
          updateDoc(FileProcessingStatus.COMPLETED, { analisisId, analisisEn, hashDocumentos: sha }));

        // ── Composición societaria (Fase 3) ──────────────────────────────────
        // SEGUNDA llamada al modelo, con el ARCHIVO NATIVO. Es a propósito: el
        // porcentaje de cada socio sale de la estructura de la tabla, y el
        // texto que produce el OCR ya la perdió. Los 18 campos de arriba NO se
        // tocan — siguen saliendo del camino de texto exactamente igual.
        //
        // Sin await y con su propio try: si esto falla, el análisis que el
        // analista está mirando ya terminó y no se entera.
        //
        // Sobre el primer archivo soportado: el contrato es por análisis, no
        // por archivo, y en un consolidado la escritura es la que manda.
        // Fusionar la composición de varios documentos es otro problema.
        if (archivoNativo) {
          void (async () => {
            try {
              const { resultado, senales } = await extraerShareholders(archivoNativo);
              const filas = filasDePersonas(analisisId, resultado, {
                origen: 'analizador', ejecutadoEn: analisisEn,
              });
              // La participación que no cierra en 100 es la señal más barata de
              // que el modelo mezcló la tabla de OTRA empresa con la principal.
              // Medido: cuando pasaba, la suma daba 200 y las mismas personas
              // aparecían duplicadas como directas y como nivel 1.
              if (senales.participacionSospechosa) {
                console.warn('[shareholders] la participación directa no cierra en 100', senales);
              }
              if (senales.juridicasEnNivel1 > 0) {
                // Una jurídica detrás de otra jurídica: la cadena real sigue más
                // abajo de lo que el modelo de datos representa (nivel 0 y 1).
                // Se aplana y se avisa en vez de perderlo en silencio.
                console.warn('[shareholders] la cadena sigue más abajo del nivel 1', senales);
              }
              const r = await persistirPersonas(filas as unknown as Array<Record<string, unknown>>);
              // La marca va a la FICHA, que es la fila que sí se puede reescribir
              // entera sin perder columnas. Así queda por escrito que esto corrió
              // y con qué resultado, en vez de deducirlo de una tabla vacía.
              const marca = { ok: true, personas: filas.length, senales: r.error ? { ...senales, errorEscritura: r.error } : senales };
              updateDoc(FileProcessingStatus.COMPLETED, { shareholdersResultado: marca });
              void sha256Hex(combinedText).then(sha => persistirFicha(analisisId, 'analizador',
                fichaLens({ campos: extractedData, pais: country, proposito: docToProcess.purpose,
                  archivos: files.map(f => f.name), consolidado: isConsolidated,
                  regcheq: enriquecimiento, shareholders: marca,
                  metricasAusentes: metricasFaltaron || undefined }),
                { ejecutadoEn: analisisEn, hashDocumentos: sha }));
            } catch (e) {
              const marca = { ok: false, error: (e as Error).message };
              console.warn('[shareholders] no se pudo extraer la composición societaria:', (e as Error).message);
              updateDoc(FileProcessingStatus.COMPLETED, { shareholdersResultado: marca });
              void sha256Hex(combinedText).then(sha => persistirFicha(analisisId, 'analizador',
                fichaLens({ campos: extractedData, pais: country, proposito: docToProcess.purpose,
                  archivos: files.map(f => f.name), consolidado: isConsolidated,
                  regcheq: enriquecimiento, shareholders: marca,
                  metricasAusentes: metricasFaltaron || undefined }),
                { ejecutadoEn: analisisEn, hashDocumentos: sha }));
            }
          })();
        }
      } else {
        updateDoc(FileProcessingStatus.COMPLETED, { statusMessage: "Listo para chatear." });
        trackDocumentProcessed('analyzer');
      }
    } catch (error: any) {
      updateDoc(FileProcessingStatus.ERROR, { errorMessage: error.message, statusMessage: "Error." });
      setGlobalError(`Error en ${displayName}: ${error.message}`);
    } finally {
      setCurrentProcessingJobInfo(null);
      localStorage.removeItem(PROCESSING_LOCK_KEY);
    }
  }, [processingQueue, currentProcessingJobInfo, processedDocuments, tabId, user]);

  useEffect(() => {
    if (!currentProcessingJobInfo && !isLockedByAnotherTab && processingQueue.length > 0) {
      processNextFile();
    }
  }, [processingQueue, currentProcessingJobInfo, isLockedByAnotherTab, processNextFile]);

  const handleAddSupplementaryFile = async (primaryDocId: string, supplementaryFile: File) => {
    if (!isKeyValid) {
        setGlobalError("La API Key no está configurada para analizar documentos complementarios.");
        return;
    }
    const primaryDoc = processedDocuments.find(doc => doc.id === primaryDocId);
    if (!primaryDoc || primaryDoc.status !== FileProcessingStatus.COMPLETED) return;

    const supId = `${supplementaryFile.name}-${Date.now()}`;
    const newAnalysis: SupplementaryDocumentAnalysis = {
        id: supId,
        supplementaryFileName: supplementaryFile.name,
        status: SupplementaryAnalysisStatus.ANALYZING,
        statusMessage: "Iniciando...",
    };

    setProcessedDocuments(prev => prev.map(doc => doc.id === primaryDocId ? { ...doc, supplementaryAnalyses: [...(doc.supplementaryAnalyses || []), newAnalysis] } : doc));
    
    try {
        const supText = await getTextFromFile(supplementaryFile);
        if (!supText.trim()) throw new Error("Documento complementario vacío.");
        
        const result = await analyzeDocumentComparisonWithGemini(primaryDoc.extractedData, supText);
        setProcessedDocuments(prev => prev.map(doc => {
            if (doc.id === primaryDocId) {
                const updatedAnalyses = (doc.supplementaryAnalyses || []).map(sa => sa.id === supId ? { ...sa, status: SupplementaryAnalysisStatus.COMPLETED, comparisonResult: result, supplementaryTextContent: supText } : sa);
                return { ...doc, supplementaryAnalyses: updatedAnalyses };
            }
            return doc;
        }));
    } catch (error: any) {
        setProcessedDocuments(prev => prev.map(doc => {
            if (doc.id === primaryDocId) {
                const updatedAnalyses = (doc.supplementaryAnalyses || []).map(sa => sa.id === supId ? { ...sa, status: SupplementaryAnalysisStatus.ERROR, errorMessage: error.message } : sa);
                return { ...doc, supplementaryAnalyses: updatedAnalyses };
            }
            return doc;
        }));
    }
  };

  const handleRequestRiskAnalysis = async (documentId: string) => {
    const doc = processedDocuments.find(d => d.id === documentId);
    if (!doc || !doc.rawTextContent) return;

    setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, riskAnalysisStatus: RiskAnalysisStatus.ANALYZING } : d));
    try {
        const result = await analyzeDocumentForRisks(doc.rawTextContent);
        setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, riskAnalysisStatus: RiskAnalysisStatus.COMPLETED, riskAnalysisResult: result } : d));
        if (result.suspiciousActivity?.detected) trackDocumentProcessed('analyzer', doc.detectedCountry, true);
        // El riesgo se corre DESPUÉS de la extracción, así que hasta ahora no
        // quedaba en ninguna parte. Se reescribe la misma fila de la ficha.
        if (doc.analisisId) {
          void persistirFicha(doc.analisisId, 'analizador', fichaDelDoc(doc, { riesgo: result }),
            { ejecutadoEn: doc.analisisEn, hashDocumentos: doc.hashDocumentos });
        }
    } catch(error: any) {
        setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, riskAnalysisStatus: RiskAnalysisStatus.ERROR, riskAnalysisError: error.message } : d));
    }
  };

  const handleRequestIntegrityAnalysis = async (documentId: string) => {
    const doc = processedDocuments.find(d => d.id === documentId);
    if (!doc || !doc.rawTextContent) return;

    setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, integrityAnalysisStatus: IntegrityAnalysisStatus.ANALYZING } : d));
    try {
        const result = await analyzeDocumentIntegrity(doc.rawTextContent);
        setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, integrityAnalysisStatus: IntegrityAnalysisStatus.COMPLETED, integrityAnalysisResult: result } : d));
        // Igual que el de riesgo: corre después y hay que reescribir la ficha.
        if (doc.analisisId) {
          void persistirFicha(doc.analisisId, 'analizador', fichaDelDoc(doc, { integridad: result }),
            { ejecutadoEn: doc.analisisEn, hashDocumentos: doc.hashDocumentos });
        }
    } catch(error: any) {
        setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, integrityAnalysisStatus: IntegrityAnalysisStatus.ERROR, integrityAnalysisError: error.message } : d));
    }
  };

  const handleSendChatMessage = async (documentId: string, messageText: string) => {
    if (!isKeyValid) return;
    const doc = processedDocuments.find(d => d.id === documentId);
    if (!doc) return;

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text: messageText, timestamp: new Date().toISOString() };
    const loadingMessage: ChatMessage = { id: `model-${Date.now()}`, role: 'model', text: '...', timestamp: new Date().toISOString(), isLoading: true };
    
    setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, chatMessages: [...(d.chatMessages || []), userMessage, loadingMessage], isChatLoading: true } : d));

    try {
        const context = buildDocumentContextForChat(doc);
        const history: { role: 'user' | 'model', parts: { text: string }[] }[] = [];
        history.push({ role: 'user', parts: [{ text: `CONTEXTO: ${context}` }] });
        history.push({ role: 'model', parts: [{ text: "Entendido. Usaré solo este contexto." }] });
        (doc.chatMessages || []).forEach(msg => history.push({ role: msg.role, parts: [{ text: msg.text }] }));
        
        const responseText = await getChatResponse(GEMINI_CHAT_SYSTEM_INSTRUCTION, history, messageText);
        const aiMessage: ChatMessage = { ...loadingMessage, text: responseText, isLoading: false };

        setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, chatMessages: (d.chatMessages || []).map(m => m.id === loadingMessage.id ? aiMessage : m), isChatLoading: false } : d));
    } catch (error: any) {
        const errorMessage: ChatMessage = { ...loadingMessage, text: `Error: ${error.message}`, isLoading: false, error: error.message };
        setProcessedDocuments(prev => prev.map(d => d.id === documentId ? { ...d, chatMessages: (d.chatMessages || []).map(m => m.id === loadingMessage.id ? errorMessage : m), isChatLoading: false } : d));
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
  
  const handleDownloadPdf = async (doc: ProcessedDocument) => {
    if (!doc.extractedData || doc.extractedData.length === 0) return;
    try {
      // Generate executive summary via AI
      let summary: string | undefined;
      try {
        summary = await generateExecutiveSummary(doc.extractedData, doc.fileName);
      } catch (e) {
        console.warn('Could not generate executive summary, proceeding without it');
      }
      const razonSocial = doc.extractedData.find(
        f => f.field.toLowerCase().includes('razón social') || f.field.toLowerCase().includes('razon social')
      )?.value?.trim();
      const pdfName = razonSocial ? `${razonSocial} - Analisis Lens AI` : doc.fileName;
      await generatePdf(pdfName, doc.extractedData, summary, doc.regcheqEnrichment);
    } catch (error: any) {
      console.error('Error generating PDF:', error);
    }
  };
  
  const handleDownloadAllCsv = () => {
    const completedDocs = processedDocuments.filter(doc => doc.status === FileProcessingStatus.COMPLETED && doc.purpose === 'extract');
    if (completedDocs.length === 0) {
      setGlobalError("No hay documentos para exportar.");
      return;
    }
    generateCsv(completedDocs);
  };

  const handleDownloadAllJson = () => {
     const completedDocs = processedDocuments.filter(doc => doc.status === FileProcessingStatus.COMPLETED && doc.purpose === 'extract');
    if (completedDocs.length === 0) {
      setGlobalError("No hay documentos para exportar.");
      return;
    }
    const blob = new Blob([JSON.stringify(completedDocs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analisis_documentos.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleExportSession = async () => {
    const allDocs = await db.documents.toArray();
    const blob = new Blob([JSON.stringify(allDocs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lens_ai_session_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSession = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const importedDocs = JSON.parse(text);
      await db.documents.bulkPut(importedDocs);
      setProcessedDocuments(await db.documents.toArray());
    };
    input.click();
  };

  const handleResetProcessing = () => {
    setProcessingQueue([]);
    setCurrentProcessingJobInfo(null);
    localStorage.removeItem(PROCESSING_LOCK_KEY);
  };

  const removeDocument = async (id: string) => {
    await db.documents.delete(id);
    setProcessedDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const isProcessing = !!currentProcessingJobInfo;
  const hasSuccessfullyCompletedDocuments = processedDocuments.some(doc => doc.status === FileProcessingStatus.COMPLETED && doc.purpose === 'extract');

  return (
    <>
      {!isKeyValid && <Alert type="warning" message="ADVERTENCIA: No se ha configurado una API Key de Gemini válida." />}
      
        <div className="mb-6 p-4 bg-white rounded-lg shadow-lg border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">
            <span className="text-primary-600">Paso 1:</span> Configura tu Análisis
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
              <label htmlFor="analysis-purpose" className="block text-sm font-medium text-slate-700 mb-2 text-center md:text-left">
                1. Objetivo del Análisis
              </label>
              <select id="analysis-purpose" value={analysisPurpose} onChange={(e) => setAnalysisPurpose(e.target.value as AnalysisPurpose)} className="w-full bg-slate-100 border border-slate-300 rounded-lg py-3 px-4 text-slate-900 focus:ring-primary-500 focus:border-primary-500 transition" aria-label="Seleccionar objetivo del análisis">
                <option value="extract">Crear Ficha y Chatear</option>
                <option value="chat_only">Solo Chatear (sin extracción)</option>
              </select>
              <p className="text-xs text-slate-500 mt-2 text-center md:text-left">
                {analysisPurpose === 'extract' ? 'Extrae datos estructurados en una ficha y permite chatear.' : 'Sube documentos solo para conversar con ellos a través del chat.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 text-center md:text-left">2. Modo de Carga</label>
              <div className="flex flex-col sm:flex-row justify-center items-stretch gap-3 sm:gap-4">
                 <button onClick={() => setAnalysisMode('single')} className={`flex-1 sm:flex-initial sm:min-w-[200px] py-3 px-5 rounded-lg font-semibold transition-all duration-200 ease-in-out border-2 focus:outline-none focus:ring-4 ${analysisMode === 'single' ? 'bg-primary-500 text-white border-primary-500 shadow-xl ring-primary-500/50' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-primary-400'}`} aria-pressed={analysisMode === 'single'}>
                    <div className="flex items-center justify-center">
                      <IconFileText className="w-6 h-6 mr-2.5" />
                      <span>Individual</span>
                    </div>
                    <p className="text-xs font-normal mt-1 opacity-80">Un solo archivo</p>
                  </button>
                  <button onClick={() => setAnalysisMode('consolidated')} className={`flex-1 sm:flex-initial sm:min-w-[200px] py-3 px-5 rounded-lg font-semibold transition-all duration-200 ease-in-out border-2 focus:outline-none focus:ring-4 ${analysisMode === 'consolidated' ? 'bg-primary-500 text-white border-primary-500 shadow-xl ring-primary-500/50' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-primary-400'}`} aria-pressed={analysisMode === 'consolidated'}>
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

        <div className="mb-6 p-4 bg-white rounded-lg shadow-lg border border-slate-200 text-center">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">Opcional: Gestión de Sesión</h2>
            <p className="text-sm text-slate-500 mb-4">Puedes importar una sesión anterior para continuar tu trabajo.</p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <button onClick={handleImportSession} className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out flex items-center justify-center space-x-2 border border-slate-300 text-base disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Importar una sesión de análisis desde un archivo JSON" disabled={isProcessing}>
                <IconImport className="w-5 h-5" />
                <span>Importar Fichas (JSON)</span>
              </button>
            </div>
        </div>
        
        <div className="mb-6 p-4 bg-white rounded-lg shadow-lg border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-800 mb-4"><span className="text-primary-600">Paso 2:</span> Carga tus Documentos</h2>
            <FileUpload id="analyzer-file-upload" onFilesSelected={handleFilesSelected} disabled={isProcessing || !isKeyValid} analysisMode={analysisMode} />
        </div>

        {globalError && <Alert type="error" message={globalError} onClose={() => setGlobalError(null)} />}

        {processedDocuments.length > 0 && 
            <div className="space-y-8 mt-8">
                {processedDocuments.slice().reverse().map(doc => (
                    <div key={doc.id} className="w-full">
                        <div className="flex flex-col md:flex-row md:space-x-6 items-start">
                            <div className={`transition-all duration-300 ease-in-out w-full ${activeChatDocumentId === doc.id ? 'md:w-3/5 lg:w-7/12' : 'md:max-w-2xl lg:max-w-3xl mx-auto'}`}>
                                <DocumentCard 
                                    document={doc} 
                                    onRemove={() => removeDocument(doc.id)} 
                                    onAddSupplementaryFile={handleAddSupplementaryFile} 
                                    onDownloadPdf={() => handleDownloadPdf(doc)} 
                                    onRequestRiskAnalysis={() => handleRequestRiskAnalysis(doc.id)} 
                                    onRequestIntegrityAnalysis={() => handleRequestIntegrityAnalysis(doc.id)} 
                                    onToggleChat={() => handleToggleChat(doc.id)} 
                                    isChatActive={activeChatDocumentId === doc.id}
                                    isApiKeyOk={isKeyValid}
                                    onOpen360={onOpen360}
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
        }
    </>
  );
};
