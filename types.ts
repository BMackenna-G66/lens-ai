

export enum FileProcessingStatus {
  QUEUED = 'QUEUED',
  READING = 'READING',
  DETECTING_COUNTRY = 'DETECTING_COUNTRY',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type AnalysisPurpose = 'extract' | 'chat_only';

export interface ExtractedField {
  field: string;
  value: string;
}

export interface ComparisonResult {
  validezDocumentoSecundario: string;
  diferenciasEncontradas: string;
}

export enum SupplementaryAnalysisStatus {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface SupplementaryDocumentAnalysis {
  id: string;
  supplementaryFileName: string;
  status: SupplementaryAnalysisStatus;
  statusMessage?: string;
  comparisonResult?: ComparisonResult;
  errorMessage?: string;
  supplementaryTextContent?: string; // Added to store raw text of supplementary doc
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  isLoading?: boolean;
  error?: string;
}

export enum RiskAnalysisStatus {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface RiskAnalysisResult {
  suspiciousActivity: {
    detected: boolean;
    reason: string;
  };
  suspiciousLanguage: {
    detected: boolean;
    reason: string;
  };
}

export interface ProcessedDocument {
  id: string;
  fileName: string; // For consolidated, this will be a summary name
  status: FileProcessingStatus;
  purpose: AnalysisPurpose;
  statusMessage?: string;
  extractedData: ExtractedField[];
  rawGeminiResponse?: string;
  rawTextContent?: string; 
  errorMessage?: string;
  detectedCountry?: string;
  supplementaryAnalyses?: SupplementaryDocumentAnalysis[];
  chatMessages?: ChatMessage[]; 
  isChatLoading?: boolean; 
  chatError?: string; 
  sourceFileNames?: string[]; // For consolidated analysis, lists original file names
  riskAnalysisStatus?: RiskAnalysisStatus;
  riskAnalysisResult?: RiskAnalysisResult;
  riskAnalysisError?: string;
}

// Type for items in the processing queue, can be a single File or a consolidated job
export type QueueItem = File | { consolidatedId: string; files: File[]; analysisMode: 'consolidated' };