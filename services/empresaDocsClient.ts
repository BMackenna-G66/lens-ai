import { EmpresaDocsDetail, EmpresaDocsSearchResult } from '../types/empresaDocs';

export async function searchEmpresaDocs(params: {
  companyId?: string;
  dni?: string;
  email?: string;
  country?: string;
}): Promise<EmpresaDocsSearchResult[]> {
  const query = new URLSearchParams();
  if (params.companyId) query.set('companyId', params.companyId);
  if (params.dni)       query.set('dni', params.dni);
  if (params.email)     query.set('email', params.email);
  if (params.country)   query.set('country', params.country);

  const res = await fetch(`/api/search?${query.toString()}`);
  if (!res.ok) throw new Error(`Error buscando empresa en EmpresaDocs (${res.status})`);
  return res.json();
}

export async function getEmpresaDocsCompany(companyId: string): Promise<EmpresaDocsDetail> {
  const res = await fetch(`/api/documents/${companyId}`);
  if (!res.ok) throw new Error(`Error obteniendo documentos de empresa (${res.status})`);
  return res.json();
}

export async function getPresignedUrl(fileKey: string): Promise<string> {
  const res = await fetch(`/api/presign?fileKey=${encodeURIComponent(fileKey)}`);
  if (!res.ok) throw new Error(`Error obteniendo URL firmada (${res.status})`);
  return res.text();
}

export async function downloadEmpresaDoc(fileKey: string): Promise<Blob> {
  const url = await getPresignedUrl(fileKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error descargando desde S3 (${res.status})`);
  return res.blob();
}
