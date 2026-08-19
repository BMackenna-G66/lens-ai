export interface EmpresaDocsSearchResult {
  id: string | number;
  name: string;
  identificationNumber?: string;
  country?: string;
  complianceStatus?: string;
  documentsCount?: number;
}

export interface EmpresaDocsDocument {
  link: string;        // real file key (maps to fileKey in BatchDocumentInput)
  fileName?: string;
  slot?: string;
  status?: string;
  date?: string;
}

export interface EmpresaDocsDetail {
  documents?: EmpresaDocsDocument[];
  ficha?: {
    complianceStatus?: string;
    kycStage1?: string;
    riskLevel?: string;
  };
  repLegales?: unknown[];
  benFinales?: unknown[];
  personas?: unknown[];
  directorio?: unknown[];
  adminRaw?: Record<string, unknown>;   // registro oficial completo (sin 'documents')
  // Malla societaria (GET /company/bo/relationships/{id}). Se pedía y se
  // descartaba; es la fuente del componente de estructura societaria del KYB.
  relaciones?: unknown[];
}

// Catálogos de Admin (no dependen de la empresa).
export interface EmpresaDocsCatalogos {
  industrias?: { id?: number; name?: string }[];   // /company/bo/industries · 36 items
  // OJO: /route/bo/documents/{pais}?entityType=COMPANY NO devuelve los documentos
  // obligatorios del onboarding, como se asumió al planificar: devuelve los TIPOS
  // DE DOCUMENTO DE IDENTIDAD válidos para una empresa en ese país
  // (CL → [{nameDisplay:'RUT', minSize:7, maxSize:9}]). Verificado contra la API.
  // Sirve para validar el formato del identificador, no para saber qué falta.
  tiposDocumentoIdentidad?: {
    nameDisplay?: string; value?: string; minSize?: number; maxSize?: number; idDefault?: boolean;
  }[];
}

// Estado de validación del onboarding, por paso.
// OJO: el endpoint se llama `rejections/reasons` pero NO es un catálogo de razones
// de rechazo — es el estado por paso de ESTA empresa. Verificado contra la API.
// Es más útil de lo que se esperaba para la matriz (dice qué paso tiene errores),
// pero NO sirve como catálogo de `reasonCode` para tipificar la decisión.
export interface EmpresaDocsValidacionOnboarding {
  legalRepresentatives?: PasoOnboarding;
  companyFiles?: PasoOnboarding;
  companyData?: PasoOnboarding;
  shareholders?: PasoOnboarding;
}

export interface PasoOnboarding {
  step?: string;
  hasErrors?: boolean;
  errors?: unknown;      // array u objeto según el paso
  count?: number;
}

// Contexto de riesgo y aceptación de una empresa puntual.
export interface EmpresaDocsContexto {
  validacion?: EmpresaDocsValidacionOnboarding;
  // Lista de T&C con `dateSignature`: null = sin firmar. Es la fuente del freno
  // duro de términos y condiciones.
  terminos?: { id?: number; dateSignature?: string | null; companyId?: number | null }[];
  segmentacion?: unknown;   // 404 si la empresa no tiene segmentación asignada
  propositos?: { selectedPurposes?: unknown[]; allPurposes?: unknown[] };
}
