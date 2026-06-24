export type BatchSourceType = 'local_folder' | 'empresa_docs';
export type BatchMode = 'completo' | 'individual';

export interface BatchDocumentInput {
  id: string;
  fileName: string;
  source: BatchSourceType;
  file?: File;           // local_folder origin
  blob?: Blob;           // empresa_docs origin (downloaded from S3)
  fileKey?: string;
  presignedUrl?: string; // stored even when download fails — allows manual open
  slot?: string;
  documentStatus?: string;
  uploadedDate?: string;
  error?: string;        // pre-existing download error
}

// ─── Enriched batch analysis data (new sections added to Ficha Empresa) ─────────

export interface BatchEnrichedData {
  estructuraSocietaria?: {
    tipoSociedad?: string;
    cantidadAccionistas?: string;
    participacionAccionaria?: string;
    accionistaControlador?: string;
    formaAdministracion?: string;
  };
  restriccionesSocietarias?: {
    restriccionTransferenciaAcciones?: string;
    derechoPreferente?: string;
    delegacionFacultades?: string;
  };
  informacionTributaria?: {
    fechaInicioActividades?: string;
    empresaMenorTamano?: string;
    actividadesEconomicas?: string[];
  };
  verificacionRepresentante?: {
    documentoIdentidad?: string;
    nacionalidad?: string;
    fechaNacimiento?: string;
    sexo?: string;
    lugarNacimiento?: string;
    fechaEmisionDocumento?: string;
    fechaExpiracionDocumento?: string;
    identityVerification?: string;
    similarity?: string;
    liveness?: string;
    riskScore?: string;
  };
  informacionComercial?: {
    marcasRepresentadas?: string;
    correosCorporativos?: string;
    telefonosCorporativos?: string;
    horarioAtencion?: string;
  };
  consistenciaDocumental?: {
    razonSocialConsistente?: boolean | null;
    rutConsistente?: boolean | null;
    representanteConsistente?: boolean | null;
    fechaConstitucionConsistente?: boolean | null;
    inconsistencias?: string[];
  };
}

export interface CompanyMetadata {
  complianceStatus?: string;
  kycStage1?: string;
  riskLevel?: string;
  legalRepresentatives?: unknown[];
  beneficialOwners?: unknown[];
  people?: unknown[];
  boardMembers?: unknown[];
}

export interface BatchCompanyInput {
  id: string;
  companyName: string;
  companyId?: string;
  identificationNumber?: string;
  country?: string;
  source: BatchSourceType;
  documents: BatchDocumentInput[];
  companyMetadata?: CompanyMetadata;
}
