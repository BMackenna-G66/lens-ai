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
