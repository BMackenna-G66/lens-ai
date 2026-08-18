// Real API client for api.global66.com — replaces the placeholder /api/* stubs.
// Authentication is handled by empresaDocsAuth.ts (same logic as the Python app).

import { apiGet, getPresignedUrl as authGetPresignedUrl } from './empresaDocsAuth';
import { EmpresaDocsSearchResult, EmpresaDocsDocument, EmpresaDocsDetail, EmpresaDocsCatalogos, EmpresaDocsContexto } from '../types/empresaDocs';

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
  // 4 llamadas en paralelo. OJO: antes se desestructuraban solo 3 y la de
  // `relationships` se pedía y se tiraba a la basura — es la malla societaria, que
  // el KYB necesita para comparar la estructura de la empresa.
  const [companyRes, usersRes, boardRes, relRes] = await Promise.allSettled([
    apiGet<CompanyBoResponse>('/company/bo', { companyIds: companyId, size: 1 }),
    apiGet<{ elements?: unknown[] }>(`/company/bo/users`, { companyId, page: 0, size: 50 }),
    apiGet<unknown>(`/company/bo/onboarding/board-member`, { companyId }),
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

  // Registro crudo completo (menos 'documents', que ya se parseó aparte y pesa
  // mucho). Conserva industria/actividades y demás campos oficiales para la
  // comparativa contra Admin, sin depender de nombres de campo específicos.
  const adminRaw: Record<string, unknown> = {};
  if (company) {
    for (const [k, v] of Object.entries(company)) {
      if (k === 'documents') continue;
      adminRaw[k] = v;
    }
  }

  // La malla puede venir como array pelado o envuelta en content/elements.
  const relaciones: unknown[] = relRes.status === 'fulfilled'
    ? (Array.isArray(relRes.value)
        ? relRes.value
        : ((relRes.value as { content?: unknown[]; elements?: unknown[] })?.content ??
           (relRes.value as { content?: unknown[]; elements?: unknown[] })?.elements ??
           []))
    : [];

  return {
    documents,
    ficha,
    repLegales,
    benFinales,
    personas: users,
    directorio,
    adminRaw,
    relaciones,
  };
}

// ─── Catálogos y contexto de Admin (§1.5 del plan KYB) ───────────────────────
// Seis GET que la doc del módulo ya declaraba y que nadie llamaba. Se agregan acá
// (servicio de LECTURA, compartido) porque el KYB los necesita: razones de rechazo
// para tipificar la decisión, documentos obligatorios por país para saber qué
// falta, industrias para normalizar la actividad, y T&C como freno duro.
//
// Cada uno va por separado y tolera el fallo: si un catálogo no responde, el
// análisis sigue con lo que haya en vez de caerse entero.

export async function getEmpresaDocsCatalogos(
  companyId: string, pais: string,
): Promise<EmpresaDocsCatalogos> {
  const [razones, requeridos, industrias] = await Promise.allSettled([
    apiGet<unknown>('/company/bo/onboarding/rejections/reasons', { companyId }),
    apiGet<unknown>(`/route/bo/documents/${encodeURIComponent(pais)}`, { entityType: 'COMPANY' }),
    apiGet<unknown>('/company/bo/industries', {}),
  ]);
  return {
    razonesRechazo: comoLista(razones),
    documentosRequeridos: comoLista(requeridos),
    industrias: comoLista(industrias),
  };
}

export async function getEmpresaDocsContexto(companyId: string): Promise<EmpresaDocsContexto> {
  const [terminos, segmentacion, propositos] = await Promise.allSettled([
    apiGet<unknown>('/company/bo/onboarding/terms', { companyId }),
    apiGet<unknown>(`/company/bo/segmentation/${encodeURIComponent(companyId)}`, {}),
    apiGet<unknown>('/company/bo/purposes/selected-company', { companyId }),
  ]);
  const valor = (r: PromiseSettledResult<unknown>) => (r.status === 'fulfilled' ? r.value : undefined);
  return {
    terminos: valor(terminos),
    segmentacion: valor(segmentacion),
    propositos: valor(propositos),
  };
}

// Normaliza a lista: la API devuelve a veces array pelado y a veces envuelto.
function comoLista(r: PromiseSettledResult<unknown>): unknown[] {
  if (r.status !== 'fulfilled') return [];
  const v = r.value as { content?: unknown[]; elements?: unknown[] } | unknown[];
  if (Array.isArray(v)) return v;
  return v?.content ?? v?.elements ?? [];
}

// ─── Presigned URL + S3 download ─────────────────────────────────────────────

export { authGetPresignedUrl as getPresignedUrl };

// Python Flask app running locally acts as a CORS-free proxy for S3 downloads.
// Port 5050 matches empresa_docs_app.py default.
const PYTHON_PROXY = 'http://localhost:5050';

// Cloud relay (Cloudflare Worker) — descarga S3 server-side y devuelve los bytes
// con CORS permitido. Funciona en cualquier PC sin proxy local. Se configura vía
// EMPRESADOCS_PROXY_URL (ver cloudflare/empresadocs-proxy/). Vacío = se omite.
const CLOUD_PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

async function downloadViaCloudRelay(presignedUrl: string): Promise<Blob | null> {
  if (!CLOUD_PROXY || !presignedUrl) return null;
  try {
    const res = await fetch(`${CLOUD_PROXY}/relay?url=${encodeURIComponent(presignedUrl)}`);
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

async function downloadViaProxy(fileKey: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `${PYTHON_PROXY}/api/download-bytes?fileKey=${encodeURIComponent(fileKey)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    return res.blob();
  } catch {
    // Proxy not running — fall through to direct approach
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns { blob, presignedUrl } so callers can show "open" links even on failure.
export async function downloadEmpresaDoc(
  fileKey: string
): Promise<{ blob: Blob; presignedUrl: string }> {
  // Strategy 1: local Python proxy (empresa_docs_app.py on localhost:5050).
  // Avoids all S3 CORS issues — the proxy downloads server-side.
  const proxyBlob = await downloadViaProxy(fileKey);
  if (proxyBlob) {
    return { blob: proxyBlob, presignedUrl: '' };
  }

  // Strategy 2: direct S3 fetch via presigned URL.
  // Works if S3 bucket has CORS configured for this origin (may fail on GitHub Pages).
  const isFullUrl = fileKey.startsWith('https://') || fileKey.startsWith('http://');
  let presignedUrl = isFullUrl ? fileKey : '';

  if (!isFullUrl) {
    try {
      presignedUrl = await authGetPresignedUrl(fileKey);
      console.debug('[EmpresaDocs] presigned URL:', presignedUrl.substring(0, 90) + '…');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[EmpresaDocs] presigned-URL step failed:', msg);
      throw new Error(`Error obteniendo URL firmada: ${msg}`);
    }
  }

  try {
    const res = await fetch(presignedUrl, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return { blob, presignedUrl };
  } catch (err) {
    if (err instanceof TypeError) {
      // Strategy 3: cloud relay (Cloudflare Worker). Funciona en cualquier PC.
      const relayBlob = await downloadViaCloudRelay(presignedUrl);
      if (relayBlob) return { blob: relayBlob, presignedUrl };

      console.warn('[EmpresaDocs] S3 bloqueado por CORS y sin proxy disponible. Configura EMPRESADOCS_PROXY_URL o inicia empresa_docs_app.py.');
      const corsErr = new Error('CORS_BLOCK') as Error & { presignedUrl: string };
      corsErr.presignedUrl = presignedUrl;
      throw corsErr;
    }
    throw err;
  }
}
