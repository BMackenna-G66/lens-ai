
import React, { useState } from 'react';
import { FileUpload } from './FileUpload';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert } from './Alert';
import { 
    FileProcessingStatus, 
    FinancialDocumentProcess, 
    FinancialYearData, 
    ChatMessage, 
    FinancialDocumentType, 
    FinancialAnalysisMode,
    FinancialAnalysisScope,
    BankStatementSummary
} from '../types';
import { getTextFromFile } from '../services/fileProcessorService';
import { 
    analyzeFinancialDocumentWithGemini, 
    analyzeBankStatementWithGemini, 
    analyzeCrossCheckWithGemini, 
    getChatResponse, 
    analyzeTaxFolderWithGemini,
    hasValidApiKeys
} from '../services/geminiService';
import { IconCheckCircle, IconFileText, IconChatBubbleLeftRight, IconFiles, IconAlertTriangle, IconBuildingLibrary, IconCheckCircle as IconSuccess, IconXCircle, IconInfoCircle } from './IconComponents';
import { DocumentChat } from './DocumentChat';
import { FINANCIAL_CHAT_SYSTEM_INSTRUCTION } from '../constants';
import { trackDocumentProcessed } from '../services/analyticsService';
import { generateFinancialPdf } from '../services/pdfGenerator';

const isKeyValid = hasValidApiKeys;

export const TransactionalLimits: React.FC = () => {
    // -- State --
    // Flow: 0:Scope -> 1:Type -> 2:Action -> 3:Upload -> 4:Results
    const [step, setStep] = useState<number>(0); 
    
    // Config State
    const [scope, setScope] = useState<FinancialAnalysisScope>('individual');
    const [docType, setDocType] = useState<FinancialDocumentType>('financial_statement');
    const [mode, setMode] = useState<FinancialAnalysisMode>('analyze');

    const [documents, setDocuments] = useState<FinancialDocumentProcess[]>([]);
    const [processingQueue, setProcessingQueue] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingStep, setLoadingStep] = useState<string>(''); 
    const [error, setError] = useState<string | null>(null);
    const [activeChatDocId, setActiveChatDocId] = useState<string | null>(null);

    // -- Handlers --

    const handleFilesSelected = (files: File[]) => {
        setDocuments([]); 
        
        if (scope === 'individual') {
            const newDocs = files.map(f => ({
                id: `${f.name}-${Date.now()}`,
                fileName: f.name,
                status: FileProcessingStatus.QUEUED,
                docType: docType,
                mode: mode,
                scope: scope,
                chatMessages: [], 
                isChatLoading: false
            }));
            setDocuments(newDocs);
            setProcessingQueue(files);
        } else {
            // Combined mode: Create one single "Process" entry that represents the consolidated analysis
            const consolidatedDoc: FinancialDocumentProcess = {
                id: `consolidated-${Date.now()}`,
                fileName: `Análisis Combinado (${files.length} archivos)`,
                status: FileProcessingStatus.QUEUED,
                docType: docType, // 'mixed', 'financial_statement' or 'bank_statement' treated as a set
                mode: mode,
                scope: scope,
                chatMessages: [],
                isChatLoading: false,
                sourceFilesCount: files.length
            };
            setDocuments([consolidatedDoc]);
            setProcessingQueue(files); // Queue still holds individual files to read
        }
        
        setActiveChatDocId(null);
        setStep(4); // Go to Results/Processing View
    };

    const fetchExchangeRate = async (targetCurrency: string): Promise<number | undefined> => {
        if (targetCurrency === 'USD') return 1;
        try {
            const response = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
            if (!response.ok) throw new Error("Failed to fetch rates");
            const data = await response.json();
            const rate = data.rates[targetCurrency];
            return rate;
        } catch (e) {
            console.error("Error fetching exchange rate:", e);
            return undefined;
        }
    };

    // -- Processing Effect --
    React.useEffect(() => {
        const processQueue = async () => {
            if (isProcessing || processingQueue.length === 0 || !isKeyValid) {
                if(processingQueue.length > 0 && !isKeyValid) {
                    setError("No se puede procesar sin una API Key de Gemini válida.")
                }
                return;
            }

            setIsProcessing(true);

            // Handle Combined Mode differently: Read ALL files, then send ONE request
            if (scope === 'combined') {
                const docId = documents[0]?.id; // The single consolidated doc
                if (!docId) { setIsProcessing(false); return; }

                const updateStatus = (status: FileProcessingStatus, extra?: Partial<FinancialDocumentProcess>) => {
                    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status, ...extra } : d));
                };

                try {
                    let allText = "";
                    updateStatus(FileProcessingStatus.READING);
                    
                    // Read all files in queue
                    for (const file of processingQueue) {
                        setLoadingStep(`Leyendo ${file.name}...`);
                        const text = await getTextFromFile(file);
                        allText += `\n--- DOCUMENTO: ${file.name} ---\n${text}\n`;
                    }
                    
                    // Clear queue immediately as we consumed all
                    setProcessingQueue([]); 

                    updateStatus(FileProcessingStatus.ANALYZING, { rawText: allText });

                    if (mode === 'chat_only') {
                        updateStatus(FileProcessingStatus.COMPLETED);
                        trackDocumentProcessed('tools');
                    } else {
                        setLoadingStep('Realizando Análisis Cruzado con IA...');
                        const combinedResult = await analyzeCrossCheckWithGemini(allText);
                        
                        let exchangeRate = undefined;
                        let currencyToUse = (combinedResult.financial?.currencyCode || combinedResult.bank?.currencyCode || 'USD').toUpperCase();

                        if (currencyToUse !== 'USD') {
                            setLoadingStep(`Consultando tasa de cambio ${currencyToUse}...`);
                            exchangeRate = await fetchExchangeRate(currencyToUse);
                        } else {
                            exchangeRate = 1;
                        }

                        updateStatus(FileProcessingStatus.COMPLETED, {
                            combinedResult: combinedResult,
                            financialResult: combinedResult.financial,
                            bankResult: combinedResult.bank,
                            exchangeRate
                        });
                        trackDocumentProcessed('tools');
                    }

                } catch (err: any) {
                    console.error("Combined Processing error:", err);
                    updateStatus(FileProcessingStatus.ERROR, { error: err.message });
                    setProcessingQueue([]);
                } finally {
                    setIsProcessing(false);
                    setLoadingStep('');
                }
                return;
            }

            // --- Individual Mode Processing ---
            const file = processingQueue[0];
            const docId = documents.find(d => d.fileName === file.name && d.status === FileProcessingStatus.QUEUED)?.id;

            if (!docId) {
                setProcessingQueue(prev => prev.slice(1));
                setIsProcessing(false);
                return;
            }

            const updateStatus = (status: FileProcessingStatus, extra?: Partial<FinancialDocumentProcess>) => {
                setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status, ...extra } : d));
            };

            try {
                setLoadingStep(`Leyendo ${file.name}...`);
                updateStatus(FileProcessingStatus.READING);
                const text = await getTextFromFile(file);
                
                updateStatus(FileProcessingStatus.ANALYZING, { rawText: text });

                if (mode === 'chat_only') {
                     updateStatus(FileProcessingStatus.COMPLETED);
                     trackDocumentProcessed('tools');
                } else {
                    setLoadingStep('Analizando información con IA...');
                    
                    if (docType === 'financial_statement') {
                        const result = await analyzeFinancialDocumentWithGemini(text);
                        let exchangeRate = 1.0;
                        if (result.currencyCode && result.currencyCode.toUpperCase() !== 'USD') {
                            setLoadingStep(`Consultando tasa de cambio ${result.currencyCode}...`);
                            exchangeRate = (await fetchExchangeRate(result.currencyCode.toUpperCase())) || 1.0;
                        }
                        updateStatus(FileProcessingStatus.COMPLETED, { financialResult: result, exchangeRate });
                        trackDocumentProcessed('tools');
                    }
                    else if (docType === 'bank_statement') {
                        const bankResult = await analyzeBankStatementWithGemini(text);
                        let exchangeRate = 1.0;
                        if (bankResult.currencyCode && bankResult.currencyCode.toUpperCase() !== 'USD') {
                             setLoadingStep(`Consultando tasa de cambio ${bankResult.currencyCode}...`);
                             exchangeRate = (await fetchExchangeRate(bankResult.currencyCode.toUpperCase())) || 1.0;
                        }
                        updateStatus(FileProcessingStatus.COMPLETED, { bankResult, exchangeRate });
                        trackDocumentProcessed('tools');
                    }
                    else if (docType === 'tax_folder') {
                        setLoadingStep('Analizando Carpeta Tributaria SII...');
                        const taxResult = await analyzeTaxFolderWithGemini(text);
                        setLoadingStep(`Consultando tasa de cambio CLP...`);
                        const exchangeRate = (await fetchExchangeRate('CLP')) || 1.0;
                        updateStatus(FileProcessingStatus.COMPLETED, { taxFolderResult: taxResult, exchangeRate });
                        trackDocumentProcessed('tools');
                    }
                }
            } catch (err: any) {
                console.error("Processing error:", err);
                updateStatus(FileProcessingStatus.ERROR, { error: err.message });
            } finally {
                setProcessingQueue(prev => prev.slice(1));
                setIsProcessing(false);
                setLoadingStep('');
            }
        };

        processQueue();
    }, [processingQueue, isProcessing, documents, docType, mode, scope]);

    // -- Helpers --
    const handleReset = () => {
        setStep(0);
        setDocuments([]);
        setError(null);
        setActiveChatDocId(null);
        setScope('individual');
        setDocType('financial_statement');
        setMode('analyze');
    };

    const handleToggleChat = (docId: string) => {
        setActiveChatDocId(prev => prev === docId ? null : docId);
    };

    const formatCurrency = (value: number, currency: string) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(value);
    };

    const aggregateBankData = (summaries: BankStatementSummary[]) => {
        const map = new Map<string, BankStatementSummary>();
        
        summaries.forEach(s => {
            const key = `${s.banco.toLowerCase().trim()}_${s.mesAnio.toLowerCase().trim()}`;
            if (map.has(key)) {
                const existing = map.get(key)!;
                existing.totalIngresos += s.totalIngresos;
                existing.totalEgresos += s.totalEgresos;
                existing.saldoCierre += s.saldoCierre;
                existing.promedioDiario = (existing.promedioDiario || 0) + (s.promedioDiario || 0);
            } else {
                map.set(key, { ...s, promedioDiario: s.promedioDiario || 0 });
            }
        });

        const sorted = Array.from(map.values()).sort((a, b) => a.banco.localeCompare(b.banco) || a.mesAnio.localeCompare(b.mesAnio));

        const totals = sorted.reduce((acc, curr) => ({
            ingresos: acc.ingresos + curr.totalIngresos,
            egresos: acc.egresos + curr.totalEgresos,
            saldo: acc.saldo + curr.saldoCierre,
            promedio: acc.promedio + (curr.promedioDiario || 0)
        }), { ingresos: 0, egresos: 0, saldo: 0, promedio: 0 });

        return { grouped: sorted, totals };
    };

    const RatioCard: React.FC<{ title: string, value: string, formula: string, description: string, colorClass: string }> = ({ title, value, formula, description, colorClass }) => (
        <div className={`p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between h-full`}>
            <div>
                <div className="flex justify-between items-baseline mb-3">
                     <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h4>
                     <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
                </div>
                <div className="text-xs font-mono text-slate-400 mb-2 bg-slate-50 p-1 rounded inline-block">
                    {formula}
                </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-2 mt-1">
                {description}
            </p>
        </div>
    );

    const calculateRatios = (data: FinancialYearData['data']) => {
        const currentRatio = data.pasivoCorriente !== 0 ? data.activoCorriente / data.pasivoCorriente : 0;
        const acidTest = data.pasivoCorriente !== 0 ? (data.activoCorriente - data.inventarios) / data.pasivoCorriente : 0;
        const cashRatio = data.pasivoCorriente !== 0 ? data.totalEfectivoEquivalentes / data.pasivoCorriente : 0;
        return {
            currentRatio: currentRatio.toFixed(2) + 'x',
            acidTest: acidTest.toFixed(2) + 'x',
            cashRatio: cashRatio.toFixed(2) + 'x'
        };
    };

    const handleSendChatMessage = async (docId: string, messageText: string) => {
        if (!isKeyValid) {
            setError("No se puede enviar mensaje sin una API Key válida.");
            return;
        }
        const doc = documents.find(d => d.id === docId);
        if (!doc) return;

        const userMessage: ChatMessage = { id: `msg-user-${Date.now()}`, role: 'user', text: messageText, timestamp: new Date().toISOString() };
        const loadingAiMessage: ChatMessage = { id: `msg-ai-${Date.now()}`, role: 'model', text: '...', timestamp: new Date().toISOString(), isLoading: true };

        setDocuments(prev => prev.map(d => d.id === docId ? { 
            ...d, chatMessages: [...(d.chatMessages || []), userMessage, loadingAiMessage], isChatLoading: true, chatError: undefined 
        } : d));

        try {
            const context = `CONTEXTO DEL DOCUMENTO: ${doc.rawText || ''}\n\nDATOS EXTRAÍDOS POR EL SISTEMA: ${JSON.stringify(doc.financialResult || doc.bankResult || doc.combinedResult || doc.taxFolderResult, null, 2)}`;
            const history: { role: 'user' | 'model', parts: { text: string }[] }[] = [];
            history.push({ role: "user", parts: [{ text: `Actúa como un Analista Financiero Senior. ${context}` }] });
            history.push({ role: "model", parts: [{ text: "Entendido. He procesado el contexto. Estoy listo para tus preguntas." }] });

            const actualPastMessages = (doc.chatMessages || []).filter(m => !m.isLoading && !m.error);
            actualPastMessages.forEach(msg => {
                history.push({ role: msg.role, parts: [{ text: msg.text }] });
            });

            const aiResponseText = await getChatResponse(FINANCIAL_CHAT_SYSTEM_INSTRUCTION, history, messageText);
            const aiResponseMessage: ChatMessage = { ...loadingAiMessage, text: aiResponseText, isLoading: false };

            setDocuments(prev => prev.map(d => d.id === docId ? { 
                ...d, chatMessages: (d.chatMessages || []).map(m => m.id === loadingAiMessage.id ? aiResponseMessage : m), isChatLoading: false 
            } : d));
        } catch (err: any) {
             const errorMessage = err.message || "Error desconocido en el chat.";
             setDocuments(prev => prev.map(d => d.id === docId ? { 
                ...d, chatMessages: (d.chatMessages || []).map(m => m.id === loadingAiMessage.id ? { ...m, text: `Error: ${errorMessage}`, isLoading: false, error: errorMessage } : m),
                isChatLoading: false,
                chatError: errorMessage
            } : d));
        }
    };

    const cleanNum = (val: any): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'object' && val.value !== undefined) {
             return parseInt(String(val.value).replace(/[^0-9-]/g, '')) || 0;
        }
        return parseInt(String(val).replace(/[^0-9-]/g, '')) || 0;
    };

    // --- RENDERERS ---

    if (step < 4) {
        return (
            <div className="max-w-4xl mx-auto py-8 font-sans text-slate-800 animate-fade-in">
                {step > 0 && <button onClick={() => setStep(step - 1)} className="mb-4 text-sm text-slate-500 hover:text-slate-800 flex items-center">← Volver</button>}
                {step === 0 && <>
                    <h1 className="text-3xl font-extrabold text-center text-slate-900 mb-8">Nueva Herramienta de Límites</h1>
                    <h2 className="text-lg font-semibold text-slate-700 mb-6 text-center">Paso 1: Selecciona el Alcance del Análisis</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        <button onClick={() => { setScope('individual'); setStep(1); }} className="p-8 rounded-xl border-2 border-slate-200 bg-white hover:border-primary-400 hover:shadow-md transition-all text-center group"><div className="mb-4 w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500 group-hover:bg-primary-100 group-hover:text-primary-500"><IconFileText className="w-6 h-6" /></div><h3 className="font-bold text-lg mb-2 text-slate-800">Análisis Individual</h3><p className="text-sm text-slate-500">Procesa cada archivo por separado.</p></button>
                        <button onClick={() => { setScope('combined'); setStep(1); }} className="p-8 rounded-xl border-2 border-slate-200 bg-white hover:border-primary-400 hover:shadow-md transition-all text-center group"><div className="mb-4 w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500 group-hover:bg-primary-100 group-hover:text-primary-500"><IconFiles className="w-6 h-6" /></div><h3 className="font-bold text-lg mb-2 text-slate-800">Análisis Combinado</h3><p className="text-sm text-slate-500">Analiza múltiples archivos en conjunto.</p></button>
                    </div>
                </>}
                {step === 1 && <>
                    <h2 className="text-lg font-semibold text-slate-700 mb-6 text-center">Paso 2: Selecciona el Tipo de Documentos</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
                        <button onClick={() => { setDocType('financial_statement'); setStep(2); }} className="p-6 rounded-xl border-2 border-slate-200 bg-white hover:border-primary-400 transition-all text-left"><h3 className="font-bold text-lg text-slate-800">Estados Financieros</h3><p className="text-sm text-slate-500">Balances, PyG.</p></button>
                        <button onClick={() => { setDocType('bank_statement'); setStep(2); }} className="p-6 rounded-xl border-2 border-slate-200 bg-white hover:border-primary-400 transition-all text-left"><h3 className="font-bold text-lg text-slate-800">Cartolas Bancarias</h3><p className="text-sm text-slate-500">Extractos de cuentas.</p></button>
                        <button onClick={() => { setDocType('tax_folder'); setStep(2); }} className="p-6 rounded-xl border-2 border-slate-200 bg-white hover:border-primary-400 transition-all text-left flex items-start space-x-3"><div className="mt-1"><IconBuildingLibrary className="w-6 h-6 text-slate-600" /></div><div><h3 className="font-bold text-lg text-slate-800">Carpeta Tributaria (SII)</h3><p className="text-sm text-slate-500">Análisis KYB, F29 y Origen de Fondos.</p></div></button>
                        {scope === 'combined' && <button onClick={() => { setDocType('mixed'); setStep(2); }} className="p-6 rounded-xl border-2 border-slate-200 bg-white hover:border-primary-400 transition-all text-left col-span-1 sm:col-span-2"><h3 className="font-bold text-lg text-slate-800">Combinado / Mixto</h3><p className="text-sm text-slate-500">Cargaré tanto Estados Financieros como Cartolas para cruzar información.</p></button>}
                    </div>
                </>}
                {step === 2 && <>
                    <h2 className="text-lg font-semibold text-slate-700 mb-6 text-center">Paso 3: ¿Qué deseas hacer?</h2>
                    <div className="flex justify-center gap-4">
                        <button onClick={() => { setMode('analyze'); setStep(3); }} className="px-6 py-3 bg-white border border-slate-300 rounded-lg shadow-sm hover:border-primary-500 hover:text-primary-600 transition-all font-medium">Analizar Documentos</button>
                        <button onClick={() => { setMode('chat_only'); setStep(3); }} className="px-6 py-3 bg-white border border-slate-300 rounded-lg shadow-sm hover:border-primary-500 hover:text-primary-600 transition-all font-medium">Solo Hablar con Chatbot</button>
                    </div>
                </>}
                {step === 3 && <>
                    <h2 className="text-lg font-semibold text-slate-700 mb-6 text-center">Paso 4: Carga los Archivos</h2>
                    <div className="max-w-xl mx-auto"><FileUpload id="step-upload" onFilesSelected={handleFilesSelected} disabled={!isKeyValid} analysisMode={scope === 'individual' ? 'consolidated' : 'consolidated'} /><p className="text-center text-sm text-slate-500 mt-4">{scope === 'combined' ? "Sube TODOS los archivos que quieres analizar en conjunto." : "Puedes subir varios archivos, se procesarán uno a uno."}</p></div>
                </>}
            </div>
        );
    }

    if (isProcessing) {
        return (
            <div className="flex justify-center my-12">
                <div className="bg-white border border-blue-100 shadow-xl rounded-2xl p-10 w-full max-w-lg text-center">
                    <div className="flex justify-center mb-6"><LoadingSpinner /></div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">{scope === 'combined' ? 'Realizando Análisis Combinado' : `Procesando ${processingQueue.length + 1} Documento(s)`}</h3>
                    <p className="text-slate-500 mb-6 text-sm">Estamos leyendo y analizando tu información...</p>
                    <p className="text-xs text-blue-600 font-semibold animate-pulse">{loadingStep}</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="max-w-6xl mx-auto space-y-8 font-sans text-slate-800 pb-12">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Resultados: {docType === 'mixed' ? 'Análisis Combinado' : (docType === 'financial_statement' ? 'Estados Financieros' : (docType === 'tax_folder' ? 'Carpeta Tributaria (SII)' : 'Cartolas Bancarias'))}</h1>
                    <p className="text-sm text-slate-500 capitalize">Alcance: {scope} | Modo: {mode === 'analyze' ? 'Extracción Completa' : 'Solo Chat'}</p>
                </div>
                <button onClick={handleReset} className="text-slate-600 hover:text-slate-800 text-sm font-semibold flex items-center bg-white px-4 py-2 rounded-lg border border-slate-300 shadow-sm hover:shadow transition-all"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Nuevo Análisis</button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            {documents.map(doc => {
                const isChatActive = activeChatDocId === doc.id;
                
                return (
                    <div key={doc.id} className="flex flex-col md:flex-row md:space-x-6 items-start">
                        <div className={`transition-all duration-300 ease-in-out w-full ${isChatActive ? 'md:w-3/5 lg:w-7/12' : 'w-full'}`}>
                             <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                                <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center">
                                        <IconFileText className="w-5 h-5 mr-2 text-primary-600" />
                                        {doc.fileName}
                                    </h2>
                                    {scope === 'combined' && <p className="text-xs text-slate-500 mt-1 ml-7">{doc.sourceFilesCount} archivos fuente</p>}
                                </div>

                                <div className="p-5">
                                    {doc.status === FileProcessingStatus.COMPLETED && (
                                        <>
                                            {mode === 'chat_only' && <div className="text-center text-slate-500 py-10"><IconSuccess className="w-10 h-10 mx-auto text-green-500 mb-2" /><p>Documento(s) listo(s) para chatear.</p></div>}
                                            
                                            {doc.financialResult && doc.docType === 'financial_statement' && (
                                                <div className="space-y-6">
                                                    <h3 className="font-bold text-xl text-slate-900">{doc.financialResult.companyName}</h3>
                                                    {doc.financialResult.years.map(yearData => {
                                                        const ratios = calculateRatios(yearData.data);
                                                        const rate = doc.exchangeRate || 1;
                                                        const currency = doc.financialResult?.currencyCode || 'USD';
                                                        return (
                                                        <div key={yearData.year} className="p-4 border border-slate-200 rounded-lg bg-slate-25">
                                                            <h4 className="font-semibold text-lg text-primary-700 mb-3">Año Fiscal {yearData.year}</h4>
                                                            <table className="w-full text-sm">
                                                                <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="pb-2">Métrica</th><th className="pb-2 text-right">Valor ({currency})</th><th className="pb-2 text-right">Valor (USD Est.)</th></tr></thead>
                                                                <tbody>
                                                                    <tr className="border-t border-slate-200"><td className="py-2 text-slate-800">Ingresos Operativos Anuales</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.ingresosOperativos, currency)}</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.ingresosOperativos / rate, 'USD')}</td></tr>
                                                                    <tr className="border-t border-slate-200"><td className="py-2 text-slate-800">Activo Corriente</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.activoCorriente, currency)}</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.activoCorriente / rate, 'USD')}</td></tr>
                                                                    <tr className="border-t border-slate-200"><td className="py-2 text-slate-800">Pasivo Corriente</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.pasivoCorriente, currency)}</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.pasivoCorriente / rate, 'USD')}</td></tr>
                                                                    <tr className="border-t border-slate-200"><td className="py-2 font-semibold text-slate-800">Capital de Trabajo Neto</td><td className="py-2 text-right font-mono font-semibold text-slate-900">{formatCurrency(yearData.data.capitalTrabajoNeto, currency)}</td><td className="py-2 text-right font-mono font-semibold text-slate-900">{formatCurrency(yearData.data.capitalTrabajoNeto / rate, 'USD')}</td></tr>
                                                                    <tr className="border-t border-slate-200"><td className="py-2 text-slate-800">Total Efectivo y Equivalentes</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.totalEfectivoEquivalentes, currency)}</td><td className="py-2 text-right font-mono text-slate-900">{formatCurrency(yearData.data.totalEfectivoEquivalentes / rate, 'USD')}</td></tr>
                                                                </tbody>
                                                            </table>
                                                            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                <RatioCard title="Razón Corriente" value={ratios.currentRatio} formula="Activo Cte / Pasivo Cte" description="Mide la capacidad de cubrir deudas a corto plazo. Ideal > 1.5x." colorClass={parseFloat(ratios.currentRatio) >= 1.5 ? 'text-green-600' : 'text-amber-600'} />
                                                                <RatioCard title="Prueba Ácida" value={ratios.acidTest} formula="(A.Cte - Inv.) / P.Cte" description="Similar al corriente, pero excluyendo inventarios (menos líquidos). Ideal > 1.0x." colorClass={parseFloat(ratios.acidTest) >= 1.0 ? 'text-green-600' : 'text-amber-600'} />
                                                                <RatioCard title="Razón de Efectivo" value={ratios.cashRatio} formula="Efectivo / Pasivo Cte" description="La prueba de liquidez más estricta. ¿Puede pagar deudas solo con efectivo? Ideal > 0.5x." colorClass={parseFloat(ratios.cashRatio) >= 0.5 ? 'text-green-600' : 'text-red-600'} />
                                                            </div>
                                                        </div>
                                                    )})}
                                                </div>
                                            )}

                                            {doc.bankResult && doc.docType === 'bank_statement' && (
                                                 <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead className="text-left text-xs uppercase text-slate-500 bg-slate-50"><tr><th className="p-2">Banco</th><th className="p-2">Periodo</th><th className="p-2 text-right">Total Ingresos</th><th className="p-2 text-right">Total Egresos</th><th className="p-2 text-right">Saldo Final</th><th className="p-2 text-right">Promedio Diario</th></tr></thead>
                                                        <tbody>
                                                            {(doc.bankResult.summaries || []).map((s, i) => {
                                                                const currency = doc.bankResult?.currencyCode || 'USD';
                                                                return (
                                                                <tr key={i} className="border-t border-slate-200"><td className="p-2 font-semibold">{s.banco}</td><td className="p-2">{s.mesAnio}</td><td className="p-2 text-right font-mono text-green-600">{formatCurrency(s.totalIngresos, currency)}</td><td className="p-2 text-right font-mono text-red-600">{formatCurrency(s.totalEgresos, currency)}</td><td className="p-2 text-right font-mono font-bold">{formatCurrency(s.saldoCierre, currency)}</td><td className="p-2 text-right font-mono">{formatCurrency(s.promedioDiario || 0, currency)}</td></tr>
                                                            )})}
                                                        </tbody>
                                                    </table>
                                                 </div>
                                            )}
                                            
                                            {doc.taxFolderResult && doc.docType === 'tax_folder' && (
                                                <div className="space-y-4 text-sm">
                                                    <p><strong className="font-semibold text-slate-800">Razón Social:</strong> {doc.taxFolderResult.extraction?.datos_contribuyente?.nombre}</p>
                                                    <p><strong className="font-semibold text-slate-800">RUT:</strong> {doc.taxFolderResult.extraction?.datos_contribuyente?.rut}</p>
                                                    <h4 className="font-bold text-lg pt-2 border-t mt-4">Checklist KYB</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {doc.taxFolderResult.checklist?.kyb_checklist_carpeta_tributaria.map((item, i) => (
                                                            <div key={i} className={`p-3 rounded-lg border ${item.estado === 'PASS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                                <p className="font-semibold flex items-center">{item.estado === 'PASS' ? <IconSuccess className="w-4 h-4 mr-1 text-green-600"/> : <IconXCircle className="w-4 h-4 mr-1 text-red-600"/>} {item.item}</p>
                                                                <p className="text-xs text-slate-600 mt-1">{item.hallazgo}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <h4 className="font-bold text-lg pt-2 border-t mt-4">Origen de Fondos (Proxy)</h4>
                                                    <p><strong className="font-semibold">Exportaciones Totales (12m):</strong> {formatCurrency(doc.taxFolderResult.funds_origin?.capacidad_economica_tributaria_proxy?.exportaciones_total || 0, 'CLP')}</p>
                                                    <p><strong className="font-semibold">PPM Total (12m):</strong> {formatCurrency(doc.taxFolderResult.funds_origin?.capacidad_economica_tributaria_proxy?.ppm_total || 0, 'CLP')}</p>
                                                </div>
                                            )}

                                            {doc.combinedResult && (
                                                <div className="space-y-8">
                                                    {doc.financialResult && <div><h3 className="font-bold text-xl mb-2 text-slate-900">1. Resumen Contable (Financiero)</h3> {doc.financialResult.years.map(y => <p key={y.year}>Año {y.year}: {formatCurrency(y.data.ingresosOperativos, doc.financialResult?.currencyCode || 'USD')}</p>)}</div>}
                                                    {doc.bankResult && <div><h3 className="font-bold text-xl mb-2 text-slate-900">2. Resumen Movimientos (Bancario)</h3><p>Total Ingresos: {formatCurrency(aggregateBankData(doc.bankResult.summaries).totals.ingresos, doc.bankResult.currencyCode || 'USD')}</p></div>}
                                                    {doc.combinedResult.crossCheck && <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg"><h3 className="font-bold text-xl mb-2 text-blue-900">3. Cruce y Verificación</h3><p className="text-blue-800">{doc.combinedResult.crossCheck.conclusion}</p>{doc.combinedResult.crossCheck.riskAlerts.map(r => <p className="text-red-600 text-sm" key={r}><IconAlertTriangle className="w-4 inline mr-1" />{r}</p>)}</div>}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {doc.status === FileProcessingStatus.ERROR && doc.error && <Alert type="error" message={`Error en ${doc.fileName}: ${doc.error}`} />}
                                </div>

                                <div className="p-3 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                                    {doc.status === FileProcessingStatus.COMPLETED && (doc.financialResult || doc.bankResult || doc.taxFolderResult || doc.combinedResult) && (
                                        <button
                                            onClick={() => generateFinancialPdf(doc)}
                                            className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            Descargar PDF
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleToggleChat(doc.id)}
                                        className={`flex-1 flex items-center justify-center p-2 rounded-lg transition-colors text-sm font-medium space-x-2 ${isChatActive ? 'bg-primary-600 text-white' : 'bg-slate-200 hover:bg-primary-100 text-slate-700'} disabled:opacity-50`}
                                        disabled={!isKeyValid}
                                    >
                                        <IconChatBubbleLeftRight className="w-5 h-5" />
                                        <span>{isChatActive ? 'Cerrar Chat' : 'Chatear con Documento'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {isChatActive && (
                            <div className="w-full mt-6 md:mt-0 md:w-2/5 lg:w-5/12 sticky top-4 self-start">
                                <DocumentChat 
                                    documentId={doc.id}
                                    chatMessages={doc.chatMessages || []}
                                    isChatLoading={!!doc.isChatLoading}
                                    chatError={doc.chatError}
                                    onSendMessage={handleSendChatMessage}
                                />
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    );
};
