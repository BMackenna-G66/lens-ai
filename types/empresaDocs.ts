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

// Catálogos y contexto de Admin que hasta ahora no se consultaban. Se piden por
// separado porque son por país o por catálogo, no por empresa.
export interface EmpresaDocsCatalogos {
  razonesRechazo?: unknown[];      // /company/bo/onboarding/rejections/reasons
  documentosRequeridos?: unknown[];// /route/bo/documents/{pais}?entityType=COMPANY
  industrias?: unknown[];          // /company/bo/industries
}

// Contexto de riesgo y aceptación de una empresa puntual.
export interface EmpresaDocsContexto {
  terminos?: unknown;              // /company/bo/onboarding/terms
  segmentacion?: unknown;          // /company/bo/segmentation/{id}
  propositos?: unknown;            // /company/bo/purposes/selected-company
}
