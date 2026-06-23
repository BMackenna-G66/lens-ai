// Real API client for api.global66.com — replaces the placeholder /api/* stubs.
// Authentication is handled by empresaDocsAuth.ts (same logic as the Python app).

import { apiGet, getPresignedUrl as authGetPresignedUrl } from './empresaDocsAuth';
import { EmpresaDocsSearchResult, EmpresaDocsDocument, EmpresaDocsDetail } from '../types/empresaDocs';

const MAX_PAGES = 6;
const PAGE_SIZE = 50;

// ─── Document parsing (_parse_docs equivalent) ────────────────────────────────

interface RawFile {
  id?: number;
  link?: string;
  state?: string;
  uploadedDateMillis?: number;
  [key: string]: unknown;
}

function parseDocs(rawDocuments: Record<string, RawFile[]> | unknown): EmpresaDocsDocument[] {
  if (!rawDocuments || typeof rawDocuments !== 'object') return [];

  // Unwrap wrapper objects (structure C in Python _parse_docs)
  const unwrapKeys = ['documents', 'content', 'data', 'elements'];
  for (const key of unwrapKeys) {
    if (key in (rawDocuments as Record<string, unknown>)) {
      return parseDocs((rawDocuments as Record<string, unknown>)[key]);
    }
  }

  const docs = rawDocuments as Record<string, RawFile | RawFile[]>;
  const result: EmpresaDocsDocument[] = [];

  for (const [slot, rawValue] of Object.entries(docs)) {
    const files: RawFile[] = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (files.length === 0) continue;

    // Take most recent file per slot (highest uploadedDateMillis)
    const sorted = [...files].sort(
      (a, b) => (b.uploadedDateMillis ?? 0) - (a.uploadedDateMillis ?? 0)
    );
    const file = sorted[0];
    if (!file.link) continue;

    result.push({
      link: file.link,
      fileName: file.link.split('/').pop() ?? slot,
      slot,
      status: typeof file.state === 'string' ? file.state : undefined,
      date: file.uploadedDateMillis
        ? new Date(file.uploadedDateMillis).toLocaleDateString('es-CL')
        : undefined,
    });
  }

  return result;
}

// ─── Company search ───────────────────────────────────────────────────────────

interface CompanyBoResponse {
  elements?: RawCompany[];
  totalElements?: number;
  totalPages?: number;
}

interface RawCompany {
  id: number | string;
  name?: string;
  identificationNumber?: string;
  companyEmail?: string;
  email?: string;
  country?: string;
  complianceStatus?: string;
  kycStage1?: string;
  riskLevel?: string;
  documents?: Record<string, RawFile[]>;
  legalRepresentatives?: RawPerson[];
  shareholders?: Record<string, RawPerson[]>;
  [key: string]: unknown;
}

interface RawPerson {
  email?: string;
  [key: string]: unknown;
}

export async function searchEmpresaDocs(params: {
  companyId?: string;
  dni?: string;
  email?: string;
  country?: string;
}): Promise<EmpresaDocsSearchResult[]> {
  const apiParams: Record<string, string | number> = { page: 0, size: PAGE_SIZE };

  if (params.companyId) {
    // Normalise separators: '4031569; 4031570' → '4031569,4031570'
    const normalised = params.companyId.replace(/[;\s]+/g, ',').replace(/,+/g, ',').trim();
    apiParams['companyIds'] = normalised;
    apiParams['size'] = 20;
  }

  if (params.dni) {
    apiParams['companyIdentificationNumber'] = params.dni;
  }

  if (params.email) {
    apiParams['userEmail'] = params.email;
  }

  // Country defaults to CL when searching by DNI or email (matches Python logic)
  if (params.country) {
    apiParams['country'] = params.country;
  } else if ((params.dni || params.email) && !params.companyId) {
    apiParams['country'] = 'CL';
  }

  const first = await apiGet<CompanyBoResponse>('/company/bo', apiParams);
  let elements: RawCompany[] = first.elements ?? [];

  // Post-filter for DNI/email when > PAGE_SIZE results (mirrors Python pagination logic)
  const needsPostFilter = !params.companyId && (params.dni || params.email);
  const totalPages = first.totalPages ?? 1;

  if (needsPostFilter && totalPages > 1) {
    const extraPages = Math.min(totalPages - 1, MAX_PAGES - 1);
    const pageResults = await Promise.all(
      Array.from({ length: extraPages }, (_, i) =>
        apiGet<CompanyBoResponse>('/company/bo', { ...apiParams, page: i + 1 })
          .then(r => r.elements ?? [])
          .catch(() => [] as RawCompany[])
      )
    );
    elements = [...elements, ...pageResults.flat()];

    // Apply local post-filter
    if (params.dni) {
      const normDni = params.dni.replace(/[.\-\s]/g, '').toLowerCase();
      elements = elements.filter(e =>
        (e.identificationNumber ?? '').replace(/[.\-\s]/g, '').toLowerCase() === normDni
      );
    }
    if (params.email) {
      const normEmail = params.email.toLowerCase();
      elements = elements.filter(e => {
        const companyMatch =
          (e.email ?? '').toLowerCase() === normEmail ||
          (e.companyEmail ?? '').toLowerCase() === normEmail;
        const repMatch = (e.legalRepresentatives ?? []).some(
          r => (r.email ?? '').toLowerCase() === normEmail
        );
        return companyMatch || repMatch;
      });
    }
  }

  return elements.map(e => ({
    id: e.id,
    name: e.name ?? String(e.id),
    identificationNumber: e.identificationNumber,
    country: e.country,
    complianceStatus: e.complianceStatus,
    documentsCount: e.documents ? Object.keys(e.documents).length : undefined,
  }));
}

// ─── Company detail (documents + people) ─────────────────────────────────────

export async function getEmpresaDocsCompany(companyId: string): Promise<EmpresaDocsDetail> {
  // 4 parallel calls — mirrors Python /api/documents/{id} endpoint
  const [companyRes, usersRes, boardRes] = await Promise.allSettled([
    apiGet<CompanyBoResponse>('/company/bo', { companyIds: companyId, size: 1 }),
    apiGet<{ elements?: unknown[] }>(`/company/bo/users`, { companyId, page: 0, size: 50 }),
    apiGet<unknown>(`/company/bo/onboarding/board-member`, { companyId }),
    // relationships fetched for completeness but not needed for batch processing
    apiGet<unknown>(`/company/bo/relationships/${companyId}`),
  ]);

  const company: RawCompany | undefined =
    companyRes.status === 'fulfilled'
      ? (companyRes.value.elements ?? [])[0]
      : undefined;

  const documents = parseDocs(company?.documents ?? {});

  const ficha = company
    ? {
        complianceStatus: company.complianceStatus,
        kycStage1: company.kycStage1,
        riskLevel: company.riskLevel,
      }
    : undefined;

  const repLegales: unknown[] = company?.legalRepresentatives ?? [];
  const benFinales: unknown[] = company?.shareholders
    ? Object.values(company.shareholders as Record<string, unknown[]>).flat()
    : [];

  const users: unknown[] =
    usersRes.status === 'fulfilled'
      ? (usersRes.value.elements ?? [])
      : [];

  const directorio: unknown[] =
    boardRes.status === 'fulfilled'
      ? (Array.isArray(boardRes.value)
          ? boardRes.value
          : ((boardRes.value as { content?: unknown[]; elements?: unknown[] })?.content ??
             (boardRes.value as { content?: unknown[]; elements?: unknown[] })?.elements ??
             []))
      : [];

  return {
    documents,
    ficha,
    repLegales,
    benFinales,
    personas: users,
    directorio,
  };
}

// ─── Presigned URL + S3 download ─────────────────────────────────────────────

export { authGetPresignedUrl as getPresignedUrl };

// Returns { blob, presignedUrl } so callers can show "open" links even on failure.
export async function downloadEmpresaDoc(
  fileKey: string
): Promise<{ blob: Blob; presignedUrl: string }> {
  // If fileKey is already a full URL (some API versions embed direct S3 links),
  // try fetching it directly and skip the presigned-URL step.
  const isFullUrl = fileKey.startsWith('https://') || fileKey.startsWith('http://');

  let presignedUrl = isFullUrl ? fileKey : '';

  if (!isFullUrl) {
    // Step 1: get the presigned URL from the API (same CORS as /company/bo).
    try {
      presignedUrl = await authGetPresignedUrl(fileKey);
      console.debug('[EmpresaDocs] presigned URL:', presignedUrl.substring(0, 90) + '…');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[EmpresaDocs] presigned-URL step failed:', msg);
      throw new Error(`Error obteniendo URL firmada: ${msg}`);
    }
  }

  // Step 2: download the file from S3 (cross-origin — requires CORS on S3 bucket).
  try {
    const res = await fetch(presignedUrl, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return { blob, presignedUrl };
  } catch (err) {
    if (err instanceof TypeError) {
      // TypeError = network-level failure, almost always CORS on S3.
      console.warn(
        '[EmpresaDocs] S3 download blocked (CORS). presignedUrl stored for manual access.',
        presignedUrl
      );
      const corsErr = new Error('CORS_BLOCK') as Error & { presignedUrl: string };
      corsErr.presignedUrl = presignedUrl;
      throw corsErr;
    }
    throw err;
  }
}
