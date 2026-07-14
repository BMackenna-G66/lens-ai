

import React, { useState, useRef } from 'react';
import { ProcessedDocument, FileProcessingStatus, SupplementaryDocumentAnalysis, SupplementaryAnalysisStatus, RiskAnalysisStatus, IntegrityAnalysisStatus, FidedignidadLevel } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { SEVERITY_META } from '../services/validationRules';
import { IconPdf, IconCheckCircle, IconXCircle, IconAlertTriangle, IconTrash, IconUpload, IconChevronDown, IconChevronUp, IconChatBubbleLeftRight, IconFiles, IconShieldCheck } from './IconComponents';

interface DocumentCardProps {
  document: ProcessedDocument;
  onRemove: () => void;
  onAddSupplementaryFile: (primaryDocId: string, file: File) => void;
  onDownloadPdf: () => void;
  onRequestRiskAnalysis: () => void;
  onRequestIntegrityAnalysis: () => void;
  onToggleChat: () => void;
  isChatActive: boolean;
  isApiKeyOk: boolean;
  onOpen360?: (rut: string) => void;
}

const StatusIndicator: React.FC<{ status: FileProcessingStatus | SupplementaryAnalysisStatus, isSupplementary?: boolean }> = ({ status, isSupplementary }) => {
  switch (status) {
    case FileProcessingStatus.QUEUED:
      return <span className="text-xs font-medium text-gray-700 bg-gray-200 px-2 py-1 rounded-full">En cola</span>;
    case FileProcessingStatus.READING:
    case FileProcessingStatus.ANALYZING:
    case SupplementaryAnalysisStatus.ANALYZING:
      return (
        <div className="flex items-center space-x-1 text-xs font-medium text-blue-800 bg-blue-100 px-2 py-1 rounded-full">
          <LoadingSpinner mini={true} /> <span>{isSupplementary ? "Comparando..." : "Procesando..."}</span>
        </div>
      );
    case FileProcessingStatus.DETECTING_COUNTRY:
      return (
        <div className="flex items-center space-x-1 text-xs font-medium text-indigo-800 bg-indigo-100 px-2 py-1 rounded-full">
          <LoadingSpinner mini={true} /> <span>Detectando país...</span>
        </div>
      );
    case FileProcessingStatus.COMPLETED:
    case SupplementaryAnalysisStatus.COMPLETED:
      return (
        <div className="flex items-center space-x-1 text-xs font-medium text-green-800 bg-green-100 px-2 py-1 rounded-full">
         <IconCheckCircle className="w-3 h-3" /> <span>{isSupplementary ? "Comparado" : "Completado"}</span>
        </div>
      );
    case FileProcessingStatus.ERROR:
    case SupplementaryAnalysisStatus.ERROR:
      return (
         <div className="flex items-center space-x-1 text-xs font-medium text-red-800 bg-red-100 px-2 py-1 rounded-full">
          <IconXCircle className="w-3 h-3" /> <span>Error</span>
        </div>
      );
    default:
      return <span className="text-xs font-medium text-gray-700 bg-gray-200 px-2 py-1 rounded-full">Pendiente</span>;
  }
};

const SupplementaryAnalysisItem: React.FC<{ analysis: SupplementaryDocumentAnalysis }> = ({ analysis }) => {
    const [isExpanded, setIsExpanded] = React.useState(true);
    return (
        <div className="mt-3 p-3 bg-slate-100 rounded-md">
            <div className="flex justify-between items-center">
                <h5 className="text-sm font-semibold text-primary-600 break-all">{analysis.supplementaryFileName}</h5>
                <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-500 hover:text-slate-800">
                    {isExpanded ? <IconChevronUp className="w-4 h-4" /> : <IconChevronDown className="w-4 h-4" />}
                </button>
            </div>
             <div className="mt-1"><StatusIndicator status={analysis.status} isSupplementary={true} /></div>
            {analysis.statusMessage && <p className="text-xs text-slate-500 mt-1">{analysis.statusMessage}</p>}
            
            {isExpanded && (
                <>
                    {analysis.status === SupplementaryAnalysisStatus.COMPLETED && analysis.comparisonResult && (
                        <div className="mt-2 space-y-2 text-xs">
                            <div>
                                <strong className="text-slate-700">1. ¿Datos válidos vs. documento principal?</strong>
                                <p className="text-slate-600 italic bg-slate-200 p-1.5 rounded text-justify">{analysis.comparisonResult.validezDocumentoSecundario}</p>
                            </div>
                            <div>
                                <strong className="text-slate-700">2. ¿Existen diferencias?</strong>
                                <p className="text-slate-600 italic bg-slate-200 p-1.5 rounded text-justify">{analysis.comparisonResult.diferenciasEncontradas}</p>
                            </div>
                        </div>
                    )}
                    {analysis.status === SupplementaryAnalysisStatus.ERROR && analysis.errorMessage && (
                        <div className="mt-2 text-xs text-red-700 bg-red-100 p-1.5 rounded">
                            <p className="font-medium">Error en Comparación:</p>
                            <p>{analysis.errorMessage}</p>
                        </div>
                    )}
                    {analysis.status === SupplementaryAnalysisStatus.ANALYZING && (
                         <div className="mt-2 flex items-center space-x-2 text-xs text-slate-500">
                            <LoadingSpinner mini={true} />
                            <span>Analizando comparación con IA...</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const FidedignidadLevelIndicator: React.FC<{ level: FidedignidadLevel }> = ({ level }) => {
    switch (level) {
        case 'Alta Fidedignidad':
            return <div className="inline-flex items-center space-x-2 font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full"><IconCheckCircle className="w-5 h-5" /><span>{level}</span></div>;
        case 'Fidedignidad Media':
            return <div className="inline-flex items-center space-x-2 font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full"><IconAlertTriangle className="w-5 h-5" /><span>{level}</span></div>;
        case 'Baja Fidedignidad':
            return <div className="inline-flex items-center space-x-2 font-bold text-red-700 bg-red-100 px-3 py-1 rounded-full"><IconXCircle className="w-5 h-5" /><span>{level}</span></div>;
        default:
            return <span>{level}</span>;
    }
};

export const DocumentCard: React.FC<DocumentCardProps> = ({ 
    document, 
    onRemove, 
    onAddSupplementaryFile,
    onDownloadPdf,
    onRequestRiskAnalysis,
    onRequestIntegrityAnalysis,
    onToggleChat,
    isChatActive,
    isApiKeyOk,
    onOpen360,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const supplementaryFileInputRef = useRef<HTMLInputElement>(null);

  const handleSupplementaryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddSupplementaryFile(document.id, e.target.files[0]);
      e.target.value = ''; 
    }
  };
  
  const isProcessingSupplementary = document.supplementaryAnalyses?.some(sa => sa.status === SupplementaryAnalysisStatus.ANALYZING) ?? false;
  const isIntegrityAnalysisRunning = document.integrityAnalysisStatus === IntegrityAnalysisStatus.ANALYZING;
  const isRemovalDisabled = document.status === FileProcessingStatus.ANALYZING ||
                            document.status === FileProcessingStatus.READING ||
                            document.status === FileProcessingStatus.DETECTING_COUNTRY ||
                            isProcessingSupplementary ||
                            document.riskAnalysisStatus === RiskAnalysisStatus.ANALYZING ||
                            isIntegrityAnalysisRunning ||
                            document.isChatLoading;
  const isConsolidated = !!document.sourceFileNames && document.sourceFileNames.length > 0;
  const isChatOnlyMode = document.purpose === 'chat_only';
  const razonSocial = document.extractedData?.find(
    f => f.field.toLowerCase().includes('razón social') || f.field.toLowerCase().includes('razon social')
  )?.value?.trim() || null;

  // RUT limpio para navegar al 360 (contribuyente del SII o el extraído del doc).
  const rutExtraido = document.extractedData?.find(f => f.field.toLowerCase().includes('rut'))?.value ?? '';
  const rut360 = (document.regcheqEnrichment?.tributaria?.rutContribuyente || rutExtraido).replace(/[.\s]/g, '').replace(/-/g, '');
  const hayCoincidencia = document.regcheqEnrichment?.amlHits.some(h => h.coincidence) ?? false;

  const canPerformActions = document.status === FileProcessingStatus.COMPLETED && isApiKeyOk && !document.isChatLoading && !isProcessingSupplementary && document.riskAnalysisStatus !== RiskAnalysisStatus.ANALYZING && !isIntegrityAnalysisRunning;

  return (
    <div className="bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-2xl flex flex-col h-full">
      <div className="p-5 border-b border-slate-200 flex justify-between items-start">
        <div className="flex-grow min-w-0">
          <div className="flex items-center">
            {isConsolidated && <IconFiles className="w-5 h-5 mr-2 text-primary-500 flex-shrink-0" />}
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-primary-600 break-all leading-tight">
                {razonSocial ?? document.fileName}
              </h3>
              {razonSocial && (
                <p className="text-xs text-slate-400 mt-0.5 truncate" title={document.fileName}>
                  {document.fileName}
                </p>
              )}
            </div>
            {document.detectedCountry && document.detectedCountry !== 'unknown' && (
              <span className="ml-2 mt-0.5 self-center whitespace-nowrap text-xs font-semibold bg-blue-600 text-blue-100 px-2 py-1 rounded-full capitalize">
                {(() => {
                  const countryFlagMap: { [key: string]: string } = {
                    'chile': '🇨🇱 Chile',
                    'colombia': '🇨🇴 Colombia',
                    'peru': '🇵🇪 Perú',
                    'ecuador': '🇪🇨 Ecuador',
                    'argentina': '🇦🇷 Argentina',
                    'mexico': '🇲🇽 México',
                    'uruguay': '🇺🇾 Uruguay',
                    'panama': '🇵🇦 Panamá',
                    'islas_caiman': '🇰🇾 Islas Caimán',
                    'eeuu': '🇺🇸 EE.UU.',
                    'usa': '🇺🇸 EE.UU.',
                    'espana': '🇪🇸 España',
                    'reino_unido': '🇬🇧 Reino Unido',
                    'paraguay': '🇵🇾 Paraguay',
                    'costa_rica': '🇨🇷 Costa Rica',
                    'hong_kong': '🇭🇰 Hong Kong',
                    'brasil': '🇧🇷 Brasil',
                    'china': '🇨🇳 China',
                    'francia': '🇫🇷 Francia',
                    'dinamarca': '🇩🇰 Dinamarca',
                    'internacional': '🌐 Internacional',
                  };
                  return countryFlagMap[document.detectedCountry] || document.detectedCountry.replace(/_/g, ' ');
                })()}
              </span>
            )}
          </div>
          {isConsolidated && document.sourceFileNames && (
            <div className="mt-1.5 max-h-24 overflow-y-auto custom-scrollbar pr-1">
              <p className="text-xs text-slate-600 mb-0.5">Archivos fuente ({document.sourceFileNames.length}):</p>
              <ul className="list-disc list-inside text-xs text-slate-500 pl-1">
                {document.sourceFileNames.map((name, idx) => (
                  <li key={idx} className="truncate text-ellipsis" title={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-2"><StatusIndicator status={document.status} /></div>
           {document.statusMessage && <p className="text-xs text-slate-500 mt-1">{document.statusMessage}</p>}
        </div>
        <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            {document.status === FileProcessingStatus.COMPLETED && !isChatOnlyMode && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? "Ocultar Ficha" : "Mostrar Ficha"}
                    aria-label={isExpanded ? "Ocultar Ficha" : "Mostrar Ficha"}
                    className="text-slate-500 hover:text-slate-900 transition-colors p-1 rounded-full"
                >
                    {isExpanded ? <IconChevronUp className="w-5 h-5" /> : <IconChevronDown className="w-5 h-5" />}
                </button>
            )}
            <button
            onClick={onRemove}
            title="Eliminar este documento y sus análisis"
            aria-label={`Eliminar análisis del documento ${document.fileName}`}
            className="text-slate-500 hover:text-red-500 transition-colors p-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isRemovalDisabled}
            >
            <IconTrash className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="flex-grow p-5">
        {document.status === FileProcessingStatus.ERROR && document.errorMessage && (
          <div className="h-full flex flex-col justify-center bg-red-50 text-red-800 p-3 rounded">
            <div className="flex items-center space-x-2 mb-1">
              <IconAlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="font-medium">Error de Análisis Principal:</p>
            </div>
            <p className="text-sm break-words">{document.errorMessage}</p>
          </div>
        )}

        {document.status === FileProcessingStatus.COMPLETED && (
            isChatOnlyMode ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-slate-50 rounded-lg p-4 min-h-[150px]">
                    <IconChatBubbleLeftRight className="w-10 h-10 mb-2 text-primary-500" />
                    <p className="font-semibold text-slate-800">Listo para chatear</p>
                    <p className="text-sm text-center">Este documento se cargó para conversar. Usa el botón de chat para empezar.</p>
                </div>
            ) : isExpanded ? (
                <>
                    {document.regcheqEnrichment && (
                      <div className="mb-4 border-b border-slate-200 pb-4">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <h4 className="text-sm font-bold text-slate-700">🔎 Consulta Regcheq — AML + SII</h4>
                          {hayCoincidencia && onOpen360 && rut360 && (
                            <button
                              onClick={() => onOpen360(rut360)}
                              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                              title="Ver el análisis 360° completo de este RUT"
                            >
                              🔭 Ver análisis 360°
                            </button>
                          )}
                        </div>
                        {document.regcheqEnrichment.loading ? (
                          <p className="text-xs text-slate-400">Consultando Regcheq…</p>
                        ) : document.regcheqEnrichment.error ? (
                          <p className="text-xs text-amber-600">No se pudo consultar Regcheq: {document.regcheqEnrichment.error}</p>
                        ) : (
                          <>
                            {/* Alertas de validación (motor de reglas) — solo visual */}
                            {(document.regcheqEnrichment.alerts?.length ?? 0) > 0 && (
                              <div className="mb-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Alertas de validación</p>
                                <div className="space-y-1">
                                  {document.regcheqEnrichment.alerts!.map(a => (
                                    <div key={a.id} className="flex items-start gap-1.5 text-xs" style={{ color: SEVERITY_META[a.severity].hex }}>
                                      <span>{SEVERITY_META[a.severity].emoji}</span>
                                      <span><span className="font-bold">{a.title}</span><span className="text-slate-500"> — {a.detail}</span></span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                              Screening AML{document.regcheqEnrichment.regcheqRisk && ` · Riesgo: ${document.regcheqEnrichment.regcheqRisk}`}{document.regcheqEnrichment.pepLevel && ` · PEP: ${document.regcheqEnrichment.pepLevel}`}
                            </p>
                            {document.regcheqEnrichment.amlHits.length === 0 ? (
                              <p className="text-xs text-slate-400 mb-3">Sin datos de listas.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {document.regcheqEnrichment.amlHits.map((h, i) => (
                                  <span key={i} className={`text-[11px] px-2 py-1 rounded-lg border font-medium ${h.coincidence ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                    {h.coincidence ? '⚑ ' : ''}{h.nombre}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* SII — siempre visible cuando se consultó Regcheq (con datos o nota) */}
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Situación Tributaria (SII)</p>
                            {document.regcheqEnrichment.tributaria ? (
                              <>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs mb-2">
                                  {[
                                    ['RUT contribuyente', document.regcheqEnrichment.tributaria.rutContribuyente],
                                    ['Nombre SII', document.regcheqEnrichment.tributaria.nombreSii],
                                    ['Inicio actividades', document.regcheqEnrichment.tributaria.presentaInicioActividades],
                                    ['Fecha inicio', document.regcheqEnrichment.tributaria.fechaInicioActividades ? document.regcheqEnrichment.tributaria.fechaInicioActividades.slice(0, 10) : ''],
                                    ['Empresa menor tamaño', document.regcheqEnrichment.tributaria.empresaMenorTamano],
                                    ['Última act. SII', document.regcheqEnrichment.tributaria.ultimaActualizacion ? document.regcheqEnrichment.tributaria.ultimaActualizacion.slice(0, 10) : ''],
                                  ].map(([l, v]) => (
                                    <div key={l}><span className="text-slate-400">{l}: </span><span className="text-slate-700 font-medium">{v || '—'}</span></div>
                                  ))}
                                </div>
                                {document.regcheqEnrichment.tributaria.situacionesIrregulares.length > 0 && (
                                  <p className="text-xs text-amber-600 mb-2">⚠ Situaciones irregulares: {document.regcheqEnrichment.tributaria.situacionesIrregulares.join(' · ')}</p>
                                )}
                                {document.regcheqEnrichment.tributaria.actividades.length > 0 && (
                                  <p className="text-[11px] text-slate-500">
                                    Actividades: {document.regcheqEnrichment.tributaria.actividades.map(a => a.name).filter(Boolean).slice(0, 6).join(' · ')}
                                    {document.regcheqEnrichment.tributaria.actividades.length > 6 ? ` … (+${document.regcheqEnrichment.tributaria.actividades.length - 6})` : ''}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-slate-400">Sin datos tributarios (SII) en Regcheq para este RUT.</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {document.extractedData.length > 0 && (
                    <div className="mb-4">
                        <table className="w-full text-sm text-left text-slate-700">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 z-10">
                            <tr>
                            <th scope="col" className="py-2 px-3">Campo</th>
                            <th scope="col" className="py-2 px-3">Valor Extraído</th>
                            </tr>
                        </thead>
                        <tbody>
                            {document.extractedData.map((item, index) => {
                                if (item.field === "Análisis de Facultades Específicas") {
                                    let facultades;
                                    try {
                                        facultades = JSON.parse(item.value);
                                    } catch (e) {
                                        facultades = null;
                                    }

                                    if (facultades && typeof facultades === 'object' && 'compraVentaBienes' in facultades) {
                                        return (
                                            <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-200 last:border-b-0`}>
                                                <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap align-top">{item.field}</td>
                                                <td className="py-2 px-3 text-slate-600">
                                                    <ul className="space-y-1">
                                                        <li className="flex items-center">
                                                            {facultades.compraVentaBienes 
                                                                ? <IconCheckCircle className="w-5 h-5 mr-2 text-green-500 flex-shrink-0" /> 
                                                                : <IconXCircle className="w-5 h-5 mr-2 text-red-500 flex-shrink-0" />}
                                                            <span className="text-sm">Compraventa valores mobiliarios/bienes incorporales</span>
                                                        </li>
                                                        <li className="flex items-center">
                                                            {facultades.operacionesBancarias 
                                                                ? <IconCheckCircle className="w-5 h-5 mr-2 text-green-500 flex-shrink-0" /> 
                                                                : <IconXCircle className="w-5 h-5 mr-2 text-red-500 flex-shrink-0" />}
                                                            <span className="text-sm">Operaciones Bancarias</span>
                                                        </li>
                                                        <li className="flex items-center">
                                                            {facultades.mandatos 
                                                                ? <IconCheckCircle className="w-5 h-5 mr-2 text-green-500 flex-shrink-0" /> 
                                                                : <IconXCircle className="w-5 h-5 mr-2 text-red-500 flex-shrink-0" />}
                                                            <span className="text-sm">Mandatos</span>
                                                        </li>
                                                    </ul>
                                                </td>
                                            </tr>
                                        );
                                    }
                                }
                                
                                // Default rendering for all other fields or if parsing fails
                                return (
                                    <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-200 last:border-b-0`}>
                                        <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">{item.field}</td>
                                        <td className="py-2 px-3 text-slate-600 break-words">{item.value}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        </table>
                    </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <h4 className="text-md font-semibold text-slate-800 mb-2">Análisis Comparativos</h4>
                        <input
                            type="file"
                            accept=".pdf,.png,.txt" 
                            ref={supplementaryFileInputRef}
                            onChange={handleSupplementaryFileChange}
                            className="hidden"
                            id={`supplementary-upload-${document.id}`}
                        />
                        <button
                            onClick={() => supplementaryFileInputRef.current?.click()}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-3 rounded-lg shadow-md transition duration-150 ease-in-out flex items-center justify-center space-x-2 text-sm mb-3 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Agregar documento complementario para comparar"
                            disabled={isProcessingSupplementary || document.isChatLoading || !isApiKeyOk || isIntegrityAnalysisRunning}
                            title={!isApiKeyOk ? "La comparación requiere una API Key válida" : (isProcessingSupplementary ? "Procesando otro doc. complementario" : (document.isChatLoading ? "Chat ocupado": "Añadir doc. complementario (PDF/PNG/TXT)"))}
                        >
                            <IconUpload className="w-4 h-4" />
                            <span>Agregar Doc. Complementario (PDF/PNG/TXT)</span>
                        </button>
                        
                        {document.supplementaryAnalyses && document.supplementaryAnalyses.length > 0 ? (
                            document.supplementaryAnalyses.map(analysis => (
                                <SupplementaryAnalysisItem key={analysis.id} analysis={analysis} />
                            ))
                        ) : (
                            <p className="text-xs text-slate-500 text-center">No hay documentos complementarios analizados.</p>
                        )}
                    </div>
                    {/* Risk Analysis Section */}
                    {document.riskAnalysisStatus !== RiskAnalysisStatus.PENDING && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                            <h4 className="text-md font-semibold text-slate-800 mb-2">Análisis de Riesgos Potenciales</h4>
                            {document.riskAnalysisStatus === RiskAnalysisStatus.ANALYZING && (
                                <div className="flex items-center space-x-2 text-sm text-slate-500">
                                    <LoadingSpinner mini={true} />
                                    <span>Analizando riesgos...</span>
                                </div>
                            )}
                            {document.riskAnalysisStatus === RiskAnalysisStatus.COMPLETED && document.riskAnalysisResult && (
                                <div className="space-y-3 text-xs">
                                    {/* Suspicious Activity */}
                                    <div className={`p-2 rounded-md ${document.riskAnalysisResult.suspiciousActivity.detected ? 'bg-amber-100' : 'bg-green-100'}`}>
                                        <div className="flex items-center font-semibold">
                                            {document.riskAnalysisResult.suspiciousActivity.detected 
                                                ? <IconAlertTriangle className="w-4 h-4 mr-2 text-amber-500 flex-shrink-0" /> 
                                                : <IconCheckCircle className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />}
                                            <span className={document.riskAnalysisResult.suspiciousActivity.detected ? 'text-amber-800' : 'text-green-800'}>
                                                Actividad Económica Sospechosa
                                            </span>
                                        </div>
                                        <p className="mt-1 pl-6 text-slate-700">{document.riskAnalysisResult.suspiciousActivity.reason}</p>
                                    </div>

                                    {/* Suspicious Language */}
                                    <div className={`p-2 rounded-md ${document.riskAnalysisResult.suspiciousLanguage.detected ? 'bg-amber-100' : 'bg-green-100'}`}>
                                        <div className="flex items-center font-semibold">
                                            {document.riskAnalysisResult.suspiciousLanguage.detected 
                                                ? <IconAlertTriangle className="w-4 h-4 mr-2 text-amber-500 flex-shrink-0" /> 
                                                : <IconCheckCircle className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />}
                                            <span className={document.riskAnalysisResult.suspiciousLanguage.detected ? 'text-amber-800' : 'text-green-800'}>
                                                Lenguaje Vago o No Estándar
                                            </span>
                                        </div>
                                        <p className="mt-1 pl-6 text-slate-700">{document.riskAnalysisResult.suspiciousLanguage.reason}</p>
                                    </div>
                                </div>
                            )}
                            {document.riskAnalysisStatus === RiskAnalysisStatus.ERROR && document.riskAnalysisError && (
                                <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
                                    <p className="font-medium">Error en Análisis de Riesgos:</p>
                                    <p>{document.riskAnalysisError}</p>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Integrity Analysis Section */}
                    {document.integrityAnalysisStatus !== IntegrityAnalysisStatus.PENDING && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                            <h4 className="text-md font-semibold text-slate-800 mb-2">Análisis de Veracidad</h4>
                            {document.integrityAnalysisStatus === IntegrityAnalysisStatus.ANALYZING && (
                                <div className="flex items-center space-x-2 text-sm text-slate-500">
                                    <LoadingSpinner mini={true} />
                                    <span>Analizando Veracidad del documento...</span>
                                </div>
                            )}
                            {document.integrityAnalysisStatus === IntegrityAnalysisStatus.COMPLETED && document.integrityAnalysisResult && (
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <FidedignidadLevelIndicator level={document.integrityAnalysisResult.fidedignidadLevel} />
                                    </div>
                                    <div>
                                        <table className="w-full text-xs text-left text-slate-700">
                                            <tbody>
                                                {document.integrityAnalysisResult.criteria.map((item, index) => (
                                                <tr key={index} className="border-b border-slate-200 last:border-b-0">
                                                    <td className="py-1.5 px-2 font-medium text-slate-800">{item.criterion}</td>
                                                    <td className="py-1.5 px-2 text-slate-600 font-semibold">{item.result}</td>
                                                </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div>
                                        <strong className="text-sm text-slate-700">Recomendación del Analista:</strong>
                                        <blockquote className="mt-1 text-sm text-slate-600 italic bg-slate-100 p-2 rounded border-l-4 border-primary-500">
                                            {document.integrityAnalysisResult.recommendation}
                                        </blockquote>
                                    </div>
                                </div>
                            )}
                            {document.integrityAnalysisStatus === IntegrityAnalysisStatus.ERROR && document.integrityAnalysisError && (
                                <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
                                    <p className="font-medium">Error en Análisis de Veracidad:</p>
                                    <p>{document.integrityAnalysisError}</p>
                                </div>
                            )}
                        </div>
                    )}

                </>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                    <p className="font-semibold">Ficha de extracción oculta</p>
                    <p className="text-sm text-slate-500">Haz clic en la flecha para mostrar los detalles.</p>
                </div>
            )
        )}
        
        {(document.status === FileProcessingStatus.READING || document.status === FileProcessingStatus.ANALYZING || document.status === FileProcessingStatus.DETECTING_COUNTRY) && (
           <div className="h-full flex flex-col items-center justify-center">
              <LoadingSpinner />
              <p className="mt-2 text-slate-500 text-sm">{document.statusMessage || (document.status === FileProcessingStatus.READING ? "Leyendo archivo..." : "Analizando con IA...")}</p>
           </div>
        )}
         {document.status === FileProcessingStatus.QUEUED && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <p>Esperando para procesar...</p>
            </div>
        )}

      </div>

       {document.status === FileProcessingStatus.COMPLETED && (
        <div className="p-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <button
                onClick={onToggleChat}
                className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors text-sm font-medium space-y-1
                    ${isChatActive ? 'bg-primary-500 text-white' : 'bg-slate-200 hover:bg-primary-100 text-slate-700'}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={!isApiKeyOk}
                title={isApiKeyOk ? (isChatActive ? "Cerrar chat" : "Chatear con documentos") : "El chat requiere una API Key"}
            >
                <IconChatBubbleLeftRight className="w-5 h-5" />
                <span>Chat con Documentos</span>
            </button>
            <button
                onClick={onRequestRiskAnalysis}
                className="flex flex-col items-center justify-center p-2 rounded-lg transition-colors text-sm font-medium space-y-1 bg-amber-100 hover:bg-amber-200 text-amber-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                disabled={!canPerformActions || document.riskAnalysisStatus !== RiskAnalysisStatus.PENDING}
                title={document.riskAnalysisStatus !== RiskAnalysisStatus.PENDING ? "Análisis de riesgos ya realizado" : "Analizar riesgos potenciales"}
            >
                <IconAlertTriangle className="w-5 h-5" />
                <span>Análisis de Riesgos</span>
            </button>
            <button
                onClick={onRequestIntegrityAnalysis}
                className="flex flex-col items-center justify-center p-2 rounded-lg transition-colors text-sm font-medium space-y-1 bg-teal-100 hover:bg-teal-200 text-teal-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                disabled={!canPerformActions || document.integrityAnalysisStatus !== IntegrityAnalysisStatus.PENDING}
                title={document.integrityAnalysisStatus !== IntegrityAnalysisStatus.PENDING ? "Análisis de veracidad ya realizado" : "Analizar veracidad del documento"}
            >
                <IconShieldCheck className="w-5 h-5" />
                <span>Análisis de Veracidad</span>
            </button>
            <button
                onClick={onDownloadPdf}
                className="flex flex-col items-center justify-center p-2 rounded-lg transition-colors text-sm font-medium space-y-1 bg-red-100 hover:bg-red-200 text-red-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                disabled={isChatOnlyMode || document.extractedData.length === 0}
                title={isChatOnlyMode ? "No disponible en modo solo chat" : "Descargar ficha como PDF"}
            >
                <IconPdf className="w-5 h-5" />
                <span>Descargar Ficha PDF</span>
            </button>
        </div>
      )}
    </div>
  );
};