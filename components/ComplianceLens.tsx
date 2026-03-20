
import React, { useState } from 'react';
import { FileUpload } from './FileUpload';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert } from './Alert';
import { ComplianceAnalysisResult } from '../types';
import { getTextFromFile } from '../services/fileProcessorService';
import { analyzeComplianceDocumentWithGemini, hasValidApiKeys } from '../services/geminiService';
import { IconScale, IconClipboardCheck, IconCheckCircle, IconXCircle, IconAlertTriangle } from './IconComponents';

const isKeyValid = hasValidApiKeys;

export const ComplianceLens: React.FC = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ComplianceAnalysisResult | null>(null);
    const [fileNames, setFileNames] = useState<string[]>([]);

    const handleFilesSelected = async (files: File[]) => {
        if (!isKeyValid) {
            setError("Se requiere una API Key de Gemini válida para realizar la auditoría.");
            return;
        }
        setIsProcessing(true);
        setError(null);
        setResult(null);
        setFileNames(files.map(f => f.name));

        try {
            let combinedText = "";
            for (const file of files) {
                const text = await getTextFromFile(file);
                combinedText += `\n--- DOCUMENTO: ${file.name} ---\n${text}\n`;
            }

            if (!combinedText.trim()) throw new Error("No se pudo extraer texto de los archivos.");

            const analysis = await analyzeComplianceDocumentWithGemini(combinedText);
            setResult(analysis);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const getStatusColor = (status: string) => {
        if (status.includes('Cumple')) return 'bg-green-100 text-green-800 border-green-200';
        if (status.includes('Parcial')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        return 'bg-red-100 text-red-800 border-red-200';
    };

    const getDictumColor = (dictum: string) => {
        if (dictum === 'Apto') return 'bg-green-500';
        if (dictum === 'Apto con condiciones') return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="max-w-6xl mx-auto pb-12 animate-fade-in">
            <div className="text-center mb-10">
                <div className="inline-block p-4 rounded-full bg-slate-100 mb-4">
                    <IconScale className="w-12 h-12 text-slate-700" />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Evaluador de Cumplimiento AML</h1>
                <p className="text-slate-500">Auditoría automatizada bajo el Estándar Global66 (GAFI/GAFILAT)</p>
            </div>

            {!result && !isProcessing && (
                <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
                    <FileUpload 
                        onFilesSelected={handleFilesSelected} 
                        disabled={isProcessing || !isKeyValid} 
                        analysisMode="consolidated"
                        id="compliance-upload" 
                    />
                    <p className="text-center text-xs text-slate-400 mt-4">Sube manuales, políticas y procedimientos para evaluación conjunta.</p>
                </div>
            )}

            {isProcessing && (
                <div className="text-center py-20">
                    <LoadingSpinner />
                    <p className="mt-4 text-slate-600 font-medium">Auditando documentos con IA...</p>
                </div>
            )}

            {error && (
                <div className="max-w-2xl mx-auto mt-8">
                    <Alert type="error" message={error} onClose={() => setError(null)} />
                </div>
            )}

            {result && (
                 <div className="space-y-8">
                    {/* Header Card: Dictum */}
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col md:flex-row">
                        <div className={`${getDictumColor(result.onboardingDictum)} p-8 text-white flex flex-col justify-center items-center md:w-1/3`}>
                            <h3 className="text-sm font-bold uppercase tracking-widest opacity-80 mb-2">Dictamen Final</h3>
                            <div className="text-4xl font-black text-center leading-tight">{result.onboardingDictum}</div>
                        </div>
                        <div className="p-8 md:w-2/3">
                            <h4 className="text-lg font-bold text-slate-800 mb-2">Justificación</h4>
                            <p className="text-slate-600">{result.dictumJustification}</p>
                        </div>
                    </div>

                    {/* Full result rendering logic here... */}
                    
                    <div className="text-center pt-8">
                        <button 
                            onClick={() => { setResult(null); setFileNames([]); }}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-bold"
                        >
                            Realizar Nueva Auditoría
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
