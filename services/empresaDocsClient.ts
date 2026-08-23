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
      // El archivo trae `fileName` propio (verificado contra la API), que es el
      // nombre real y no el hash del fileKey. Se usa SOLO si trae extensión: el
      // batch construye un File con este nombre y la extensión decide cómo se
      // procesa (PDF vs imagen). Sin extensión, se mantiene el último segmento
      // del link, que es el comportamiento anterior.
      fileName: (typeof file.fileName === 'string' && /\.[a-z0-9]{2,5}$/i.test(file.fileName.trim()))
        ? file.fileName.trim()
        : (file.link.split('/').pop() ?? slot),
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

// La llamada a `/company/bo` es la columna vertebral del detalle: de ahí salen
// la razón social, el RUT, los representantes, los socios y los documentos. Si
// falla, todo lo demás queda vacío, así que se reintenta con backoff en vez de
// darla por perdida en el primer rechazo.
//
// Es la que se cayó en 30 de 79 empresas de un barrido masivo, y el análisis
// tradujo esos vacíos a "la empresa no tiene documentos cargados". Un fallo de
// infraestructura no puede parecer una característica del cliente.
async function pedirCompanyConReintento(companyId: string, intentos = 3): Promise<CompanyBoResponse> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await apiGet<CompanyBoResponse>('/company/bo', { companyIds: companyId, size: 1 });
    } catch (e) {
      ultimo = e;
      // Backoff creciente: 400 ms y 1.6 s (400·n²). Bajo concurrencia, un
      // throttling momentáneo se resuelve esperando; insistir al instante no.
      // Peor caso 2 s extra por empresa, dentro del tope de 45 s de la fase.
      if (i < intentos - 1) await new Promise(r => setTimeout(r, 400 * (i + 1) * (i + 1)));
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}

export async function getEmpresaDocsCompany(companyId: string): Promise<EmpresaDocsDetail> {
  // 4 llamadas en paralelo. OJO: antes se desestructuraban solo 3 y la de
  // `relationships` se pedía y se tiraba a la basura — es la malla societaria, que
  // el KYB necesita para comparar la estructura de la empresa.
  const [companyRes, usersRes, boardRes, relRes] = await Promise.allSettled([
    pedirCompanyConReintento(companyId),
    apiGet<{ elements?: unknown[] }>(`/company/bo/users`, { companyId, page: 0, size: 50 }),
    apiGet<unknown>(`/company/bo/onboarding/board-member`, { companyId }),
    apiGet<unknown>(`/company/bo/relationships/${companyId}`),
  ]);

  const company: RawCompany | undefined =
    companyRes.status === 'fulfilled'
      ? (companyRes.value.elements ?? [])[0]
      : undefined;

  // Se distingue "Admin contestó y no la tiene" de "la llamada falló". Las dos
  // dejan `company` en undefined, pero significan cosas opuestas: la primera es
  // un dato sobre el cliente, la segunda es un problema nuestro que hay que
  // reintentar. Sin esta marca, quien lee el resultado no puede diferenciarlas.
  const fallaAdmin = companyRes.status === 'rejected'
    ? (companyRes.reason instanceof Error ? companyRes.reason.message : String(companyRes.reason))
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
  // OJO: cuando la empresa no tiene relaciones, la API responde HTTP 400 con
  // "No existen relaciones con la empresa" — o sea usa un error para decir
  // "vacío". Verificado con la empresa 2058470. La promesa queda rechazada y acá
  // se traduce a lista vacía, que es la lectura correcta: no es un fallo.
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
    fallaAdmin,
  };
}

// Detalle armado desde el registro crudo que el barrido ya trajo, SIN llamar a
// la API. El barrido pide `/company/bo` y ese objeto tiene 56 claves, incluidos
// representantes, socios y documentos: recortarlo obligaba a pedir lo mismo de
// nuevo por empresa.
//
// Reusa el mismo `parseDocs` que la ruta con red, así los documentos se leen
// igual en los dos caminos. Lo que NO puede traer, porque son endpoints
// distintos, queda vacío: usuarios, directorio y la malla societaria.
//
// Es un SNAPSHOT: sirve para mostrar, no para decidir. El análisis re-consulta.
export function detalleDesdeCrudo(crudo: Record<string, unknown>): EmpresaDocsDetail {
  const c = crudo as RawCompany & Record<string, unknown>;
  const adminRaw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'documents') continue;
    adminRaw[k] = v;
  }
  return {
    documents: parseDocs(c.documents ?? {}),
    ficha: {
      complianceStatus: c.complianceStatus,
      kycStage1: c.kycStage1,
      riskLevel: c.riskLevel,
    },
    repLegales: (c.legalRepresentatives ?? []) as unknown[],
    benFinales: c.shareholders
      ? Object.values(c.shareholders as Record<string, unknown[]>).flat()
      : [],
    personas: [],
    directorio: [],
    adminRaw,
    relaciones: [],
  };
}

// ─── Catálogos y contexto de Admin (§1.5 del plan KYB) ───────────────────────
// Seis GET que la doc del módulo declaraba y que nadie llamaba. Todos verificados
// contra la API con la empresa de prueba 2058470; las formas de abajo son las
// REALES, no las que se supusieron al planificar. Dos sorpresas documentadas en
// types/empresaDocs.ts: `rejections/reasons` no es un catálogo y
// `route/bo/documents` no son los documentos obligatorios.
//
// Cada llamada tolera el fallo por separado: si un catálogo no responde, el
// análisis sigue con lo que haya en vez de caerse entero.

export async function getEmpresaDocsCatalogos(pais: string): Promise<EmpresaDocsCatalogos> {
  const [industrias, tiposDoc] = await Promise.allSettled([
    apiGet<unknown>('/company/bo/industries', {}),
    apiGet<unknown>(`/route/bo/documents/${encodeURIComponent(pais)}`, { entityType: 'COMPANY' }),
  ]);
  return {
    industrias: comoLista<EmpresaDocsCatalogos['industrias']>(industrias) ?? [],
    tiposDocumentoIdentidad: comoLista<EmpresaDocsCatalogos['tiposDocumentoIdentidad']>(tiposDoc) ?? [],
  };
}

export async function getEmpresaDocsContexto(companyId: string): Promise<EmpresaDocsContexto> {
  const [validacion, terminos, segmentacion, propositos] = await Promise.allSettled([
    apiGet<unknown>('/company/bo/onboarding/rejections/reasons', { companyId }),
    apiGet<unknown>('/company/bo/onboarding/terms', { companyId }),
    // 404 cuando la empresa no tiene segmentación asignada: es un caso normal,
    // no un error. Queda undefined y el análisis sigue.
    apiGet<unknown>(`/company/bo/segmentation/${encodeURIComponent(companyId)}`, {}),
    apiGet<unknown>('/company/bo/purposes/selected-company', { companyId }),
  ]);
  const ok = <T>(r: PromiseSettledResult<unknown>): T | undefined =>
    r.status === 'fulfilled' ? (r.value as T) : undefined;
  return {
    validacion: ok<EmpresaDocsContexto['validacion']>(validacion),
    terminos: comoLista<EmpresaDocsContexto['terminos']>(terminos) ?? [],
    segmentacion: ok(segmentacion),
    propositos: ok<EmpresaDocsContexto['propositos']>(propositos),
  };
}

// ¿Están los T&C firmados? `dateSignature` en null = pendiente. Es el freno duro
// de términos y condiciones del flujo automático.
export function terminosPendientes(ctx: EmpresaDocsContexto | undefined): boolean {
  const t = ctx?.terminos ?? [];
  return t.length === 0 || t.some(x => !x?.dateSignature);
}

// ¿Qué pasos del onboarding tienen errores? Sale de `validacion`.
export function pasosConErrores(ctx: EmpresaDocsContexto | undefined): string[] {
  const v = ctx?.validacion ?? {};
  return Object.values(v)
    .filter(p => p?.hasErrors === true)
    .map(p => p?.step ?? '')
    .filter(Boolean);
}

// Normaliza a lista: la API devuelve a veces array pelado y a veces envuelto en
// content/elements.
function comoLista<T>(r: PromiseSettledResult<unknown>): T | undefined {
  if (r.status !== 'fulfilled') return undefined;
  const v = r.value as { content?: unknown[]; elements?: unknown[] } | unknown[];
  if (Array.isArray(v)) return v as T;
  return ((v?.content ?? v?.elements ?? []) as unknown) as T;
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

// ¿Vale la pena intentar el proxy local de Python? Solo si la app corre en
// localhost. Desplegada en GitHub Pages ese proxy NUNCA existe, y el intento
// costaba hasta 5s por documento: con 12 documentos eran 60s sin avanzar nada
// antes de empezar a bajar de verdad.
function proxyLocalPosible(): boolean {
  if (typeof location === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

async function downloadViaProxy(fileKey: string): Promise<Blob | null> {
  if (!proxyLocalPosible()) return null;
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
    // Con timeout: S3 desde GitHub Pages puede quedar colgado por CORS sin
    // devolver nunca, y eso trababa el análisis completo del KYB.
    const ctrlS3 = new AbortController();
    const tS3 = setTimeout(() => ctrlS3.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(presignedUrl, { credentials: 'omit', signal: ctrlS3.signal });
    } catch (e) {
      clearTimeout(tS3);
      if (e instanceof Error && e.name === 'AbortError') throw new Error('S3 no respondió en 45s');
      throw e;
    }
    clearTimeout(tS3);
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
