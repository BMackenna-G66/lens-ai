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
}
