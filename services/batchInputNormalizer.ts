import { BatchCompanyInput, BatchDocumentInput } from '../types/batch';
import { EmpresaDocsSearchResult } from '../types/empresaDocs';
import { getEmpresaDocsCompany, downloadEmpresaDoc } from './empresaDocsClient';

export function fromLocalFolder(files: FileList): BatchCompanyInput[] {
  const grouped = new Map<string, File[]>();
  Array.from(files).forEach(file => {
    const rel = (file as File & { webkitRelativePath: string }).webkitRelativePath;
    const parts = rel.split('/');
    const companyName = parts[1];
    if (!companyName) return;
    if (!grouped.has(companyName)) grouped.set(companyName, []);
    grouped.get(companyName)!.push(file);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([companyName, docs]) => ({
      id: crypto.randomUUID(),
      companyName,
      source: 'local_folder' as const,
      documents: docs.map(file => ({
        id: crypto.randomUUID(),
        fileName: file.name,
        source: 'local_folder' as const,
        file,
      })),
    }));
}

export async function fromEmpresaDocs(company: EmpresaDocsSearchResult): Promise<BatchCompanyInput> {
  const detail = await getEmpresaDocsCompany(String(company.id));
  const docs = detail.documents ?? [];

  const documents: BatchDocumentInput[] = await Promise.all(
    docs.map(async (doc): Promise<BatchDocumentInput> => {
      const fileKey = doc.link; // 'link' is the real S3 key field per spec
      const fileName = doc.fileName ?? fileKey.split('/').pop() ?? 'documento';
      try {
        const blob = await downloadEmpresaDoc(fileKey);
        return {
          id: crypto.randomUUID(),
          fileName,
          source: 'empresa_docs',
          blob,
          fileKey,
          slot: doc.slot,
          documentStatus: doc.status,
          uploadedDate: doc.date,
        };
      } catch (err) {
        return {
          id: crypto.randomUUID(),
          fileName,
          source: 'empresa_docs',
          fileKey,
          slot: doc.slot,
          documentStatus: doc.status,
          uploadedDate: doc.date,
          error: err instanceof Error ? err.message : 'Error descargando desde S3',
        };
      }
    })
  );

  return {
    id: crypto.randomUUID(),
    companyName: company.name,
    companyId: String(company.id),
    identificationNumber: company.identificationNumber,
    country: company.country,
    source: 'empresa_docs',
    documents,
    companyMetadata: {
      complianceStatus: detail.ficha?.complianceStatus,
      kycStage1: detail.ficha?.kycStage1,
      riskLevel: detail.ficha?.riskLevel,
      legalRepresentatives: detail.repLegales,
      beneficialOwners: detail.benFinales,
      people: detail.personas,
      boardMembers: detail.directorio,
    },
  };
}
