
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

export enum IntegrityAnalysisStatus {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type FidedignidadLevel = 'Alta Fidedignidad' | 'Fidedignidad Media' | 'Baja Fidedignidad';

export interface IntegrityAnalysisResult {
  criteria: {
    criterion: string;
    result: string;
  }[];
  fidedignidadLevel: FidedignidadLevel;
  recommendation: string;
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
  integrityAnalysisStatus?: IntegrityAnalysisStatus;
  integrityAnalysisResult?: IntegrityAnalysisResult;
  integrityAnalysisError?: string;
}

// Type for items in the processing queue, can be a single File or a consolidated job
export type QueueItem = File | { consolidatedId: string; files: File[]; analysisMode: 'consolidated' };

// --- FINANCIAL ANALYSIS TYPES ---

export type FinancialAnalysisScope = 'individual' | 'combined';
export type FinancialDocumentType = 'financial_statement' | 'bank_statement' | 'tax_folder' | 'mixed';
export type FinancialAnalysisMode = 'analyze' | 'chat_only';

// 1. Financial Statements (Existing)
export interface FinancialYearData {
  year: string;
  data: {
    efectivoEnCaja: number;
    efectivoEnBancos: number;
    totalEfectivoEquivalentes: number;
    ingresosOperativos: number;
    activoCorriente: number;
    pasivoCorriente: number;
    inventarios: number; // Added for Acid Test Ratio
    capitalTrabajoNeto: number;
  };
}

export interface FinancialAnalysisResult {
  companyName: string;
  currencyCode: string; // ISO 4217 Code (e.g., COP, USD, CLP)
  years: FinancialYearData[];
}

// 2. Bank Statements (New)
export interface BankStatementSummary {
    banco: string;
    mesAnio: string; // e.g. "ene 2025"
    totalIngresos: number;
    totalEgresos: number;
    saldoCierre: number;
    promedioDiario: number; // Added: Average Daily Balance estimate
}

export interface BankStatementAnalysisResult {
    currencyCode?: string; // Added currency code for banks
    summaries: BankStatementSummary[];
}

// 3. Tax Folders (New)
export interface TaxFolderExtraction {
    metadata_documento: any;
    identidad_contribuyente: {
        razon_social: string;
        rut: string;
        fecha_constitucion: string;
        fecha_inicio_actividades: string;
        clasificacion_entidad: string;
        categoria_tributaria: string;
        domicilio: string;
        [key: string]: any;
    };
    actividad_economica: {
        actividades: { codigo_actividad: string; descripcion: string; categoria: string; vigente_desde: string }[];
    };
    representantes_legales_y_societarios: {
        representantes_legales: { nombre: string; rut: string; fecha_incorporacion: string }[];
        conformacion_sociedad: any[];
        participacion_en_sociedades_vigentes: any[];
    };
    f29_iva_mensual: {
        periodos: {
            periodo_yyyymm: string;
            folio: string;
            indicadores: {
                exportaciones_del_mes: number | null;
                monto_neto_internas_afectas: number | null;
                iva_determinado: number | null;
                ppm_neto_determinado: number | null;
                total_a_pagar_plazo_legal: number | null;
                [key: string]: any;
            };
        }[];
        resumen_actividad: any;
    };
    observaciones_tributarias_vigentes: any[];
    missing_fields: string[];
    inferencias_y_senales: any[];
    [key: string]: any;
}

export interface TaxFolderChecklist {
    kyb_checklist_carpeta_tributaria: {
        item: string;
        estado: "PASS" | "REVIEW" | "FAIL" | "N/A";
        hallazgo: string;
        evidencia: string;
        riesgo_si_falla: string;
        accion_recomendada: string;
    }[];
    kyb_score_preliminar: {
        metodologia: string;
        score_0_100: number | null;
        rango_riesgo: string;
        drivers: string[];
    };
}

export interface TaxFolderFundsOrigin {
    capacidad_economica_tributaria_proxy: {
        moneda: string;
        periodo_desde: string;
        periodo_hasta: string;
        exportaciones_total: number | null;
        exportaciones_promedio_mensual: number | null;
        ppm_total: number | null;
        ppm_promedio_mensual: number | null;
        comentarios_limitaciones: string[];
    };
    red_flags_carpeta_tributaria: {
        red_flag: string;
        severidad: string;
        evidencia: string;
        accion: string;
    }[];
    next_best_questions_al_cliente: string[];
}

export interface TaxFolderAnalysisResult {
    extraction: TaxFolderExtraction;
    checklist: TaxFolderChecklist;
    funds_origin: TaxFolderFundsOrigin;
}

// 4. Cross Check Analysis (New for Combined Mode)
export interface CrossAnalysisResult {
    totalDeclaredIncome: number; // From Financial Statements (Ingresos Operativos)
    totalBankDeposits: number;   // From Bank Statements (Total Ingresos)
    difference: number;
    matchPercentage: number;     // e.g. 95% match
    conclusion: string;
    riskAlerts: string[];
}

export interface CombinedAnalysisResult {
    financial: FinancialAnalysisResult;
    bank: BankStatementAnalysisResult;
    crossCheck: CrossAnalysisResult;
}

export interface FinancialDocumentProcess {
  id: string;
  fileName: string;
  status: FileProcessingStatus;
  
  // Configuration
  scope: FinancialAnalysisScope;
  docType: FinancialDocumentType;
  mode: FinancialAnalysisMode;

  // Results
  financialResult?: FinancialAnalysisResult;
  bankResult?: BankStatementAnalysisResult;
  taxFolderResult?: TaxFolderAnalysisResult; // Added for Tax Folder
  combinedResult?: CombinedAnalysisResult; // Container for the triple table view

  error?: string;
  exchangeRate?: number; // Store the rate used for conversion (Financial Stmt only)
  rawText?: string;
  chatMessages?: ChatMessage[];
  isChatLoading?: boolean;
  chatError?: string;
  sourceFilesCount?: number; // Useful for combined mode
}

// --- CRYPTO ANALYSIS TYPES ---

export type CryptoNetwork = 'ETH' | 'TRON' | 'BSC' | 'POLYGON' | 'BTC' | 'ARB' | 'OP' | 'AVAX' | 'BASE' | 'XRP' | 'FTM' | 'CELO' | 'UNKNOWN';

export interface CryptoTokenBalance {
    tokenName: string;
    tokenSymbol: string;
    balance: number;
    contractAddress?: string;
    usdValue?: number; // Optional estimation
}

export interface CryptoTransaction {
    hash: string;
    timeStamp: string;
    from: string;
    to: string;
    value: number; // Native currency or token amount
    tokenSymbol?: string; // If ERC20/TRC20
    isError: boolean;
    gasUsed?: number;
    methodId?: string; // To detect interaction type
}

export interface CryptoRiskAssessment {
    riskScore: number; // 0-100
    riskLevel: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO';
    riskFactors: string[]; // e.g., "Interaction with Mixer", "Sanctioned Entity"
    profileType: string; // e.g., "Retail User", "Exchange Hot Wallet", "Mule Account"
    patternsDetected: {
        name: string; // e.g., "Structuring", "Layering"
        description: string;
        detected: boolean;
    }[];
    cexInteractions: string[]; // e.g., "Binance", "Huobi"
    summaryAnalysis: string;
}

export interface CryptoWalletProfile {
    address: string;
    network: CryptoNetwork;
    nativeBalance: number;
    tokens: CryptoTokenBalance[];
    firstActivity: string; // Date
    lastActivity: string; // Date
    totalTxCount: number;
    
    // Financials
    totalReceived: number; // Native sum (legacy display)
    totalSent: number; // Native sum (legacy display)
    totalReceivedUSD: number; // Unified USD Sum
    totalSentUSD: number; // Unified USD Sum
    netWorthUSD: number; // Current Net Assets

    activeDays: number;
    transactions: CryptoTransaction[]; // Last N transactions for display
    riskAssessment?: CryptoRiskAssessment; // Generated by AI
}

// --- COMPLIANCE ANALYSIS TYPES ---

export interface ComplianceTableRow {
  pillar: string; // e.g., "A. Gobernanza y responsabilidades"
  status: 'Cumple' | 'Parcial' | 'No cumple';
  evidence: string;
  risk: string;
  recommendation: string;
}

export interface ComplianceAnalysisResult {
  summary: string;
  commonPoints: string[];
  comparisonTable: ComplianceTableRow[];
  gaps: string[];
  specificRecommendations: string[];
  onboardingDictum: 'Apto' | 'Apto con condiciones' | 'No apto';
  dictumJustification: string;
}

export interface ComplianceDocumentProcess {
    id: string;
    fileName: string;
    status: FileProcessingStatus;
    result?: ComplianceAnalysisResult;
    error?: string;
    rawText?: string;
}
