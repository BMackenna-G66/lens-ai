/**
 * AdminDocFetcher — Lens AI
 * Busca empresas en el Admin G66 por email o ID, lista sus documentos
 * cargados con fecha/estado, y permite seleccionarlos para descarga o vista.
 *
 * Auth: Refresh Token → access token (flujo Cognito/G66).
 * ⚠ No modifica ningún módulo existente. Es 100% autónomo.
 */

import React, { useState, useRef, useCallback } from 'react';

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE = 'https://api.global66.com';

// Endpoint para intercambiar el refresh token por un idToken.
// Usa form-urlencoded (no JSON) y devuelve { idToken: "..." }.
const REFRESH_ENDPOINT = `${API_BASE}/admin/refresh-token`;

// ─── Document slot labels ─────────────────────────────────────────────────────
const SLOT_LABELS: Record<string, string> = {
  company_admin_user_document:                         'DNI Usuario Principal (no Rep. Legal)',
  company_legal_representative_document:               'DNI Representantes Legales',
  company_deeds_document:                              'Escritura de Constitución',
  company_id_document:                                 'Identificación Fiscal de la Empresa',
  company_legal_representative_authorization_document: 'Autorización Representantes Legales',
  company_complementary_document:                      'Documentos Complementarios',
  company_trade_chamber_document:                      'Formulario Beneficiario Final',
  // Colombia-specific
  company_rut_document:                                'RUT (CO)',
  company_chamber_commerce_document:                   'Cámara de Comercio (CO)',
  company_shareholder_composition_document:            'Composición Accionaria (CO)',
  company_bank_certificate_document:                   'Certificado Bancario (CO)',
  company_financial_statements_document:               'Estados Financieros (CO)',
};

const SLOT_ORDER = Object.keys(SLOT_LABELS);

// ─── Types ────────────────────────────────────────────────────────────────────
interface DocumentLink {
  id: number;
  fileName: string;
  uploadedDateMillis: number;
  status: string;
}
interface DocumentSlot {
  slotKey: string;
  label: string;
  links: DocumentLink[];
}
interface CompanyResult {
  id: number;
  name?: string;
  country?: string;
  complianceStatus?: string;
  kycStage1?: string;
}
type SearchType = 'email' | 'id';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'APPROVED')          return 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700/50';
  if (s.startsWith('REJECTED'))  return 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-700/50';
  if (s.startsWith('REQUESTED')) return 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700/50';
  if (s === 'PENDING')           return 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700/50';
  return 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
}

function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseDocuments(data: Record<string, unknown>): DocumentSlot[] {
  const candidates = [
    data.documents,
    data.documentSlots,
    data.companyDocuments,
    Array.isArray(data.content) ? (data.content as Record<string,unknown>[])[0]?.documents : null,
  ];
  let rawSlots: Record<string, unknown>[] | null = null;
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) { rawSlots = c as Record<string, unknown>[]; break; }
  }
  if (!rawSlots) return [];

  const slots: DocumentSlot[] = rawSlots.map(raw => {
    const slotKey = String(raw.fileName ?? raw.slotKey ?? raw.key ?? raw.type ?? '');
    const links = Array.isArray(raw.links)
      ? (raw.links as Record<string, unknown>[]).map(l => ({
          id:                 Number(l.id ?? 0),
          fileName:           String(l.fileName ?? l.name ?? ''),
          uploadedDateMillis: Number(l.uploadedDateMillis ?? l.uploadDate ?? 0),
          status:             String(l.status ?? ''),
        })).sort((a, b) => b.uploadedDateMillis - a.uploadedDateMillis)
      : [];
    return { slotKey, label: SLOT_LABELS[slotKey] ?? slotKey, links };
  }).filter(s => s.slotKey);

  slots.sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(a.slotKey);
    const ib = SLOT_ORDER.indexOf(b.slotKey);
    if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
  });
  return slots;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { onBack: () => void; darkMode?: boolean; }

export const AdminDocFetcher: React.FC<Props> = ({ onBack, darkMode }) => {
  const dark = darkMode ?? localStorage.getItem('darkMode') === 'true';

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [refreshToken, setRefreshToken] = useState<string>(
    () => sessionStorage.getItem('g66-refresh-token') ?? ''
  );
  const [accessToken, setAccessToken]   = useState<string>(
    () => sessionStorage.getItem('g66-access-token') ?? ''
  );
  const [tokenRefreshing, setTokenRefreshing] = useState(false);
  const [tokenError, setTokenError]           = useState('');
  const [tokenObtained, setTokenObtained]     = useState<Date | null>(null);
  const [rtVisible, setRtVisible]             = useState(false);

  // Ref so async functions always see the latest access token
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  function saveRefreshToken(val: string) {
    setRefreshToken(val);
    sessionStorage.setItem('g66-refresh-token', val);
  }
  function saveAccessToken(val: string) {
    setAccessToken(val);
    accessTokenRef.current = val;
    sessionStorage.setItem('g66-access-token', val);
  }

  // ── Exchange refresh token for idToken ─────────────────────────────────────
  // Mirrors Python: POST /admin/refresh-token (form-urlencoded) → { idToken }
  // Authorization header uses the idToken directly — no "Bearer " prefix.
  async function obtenerToken(): Promise<string> {
    if (!refreshToken.trim()) throw new Error('Ingresa tu Refresh Token para continuar.');
    setTokenRefreshing(true); setTokenError('');
    try {
      const body = new URLSearchParams({ refreshToken: refreshToken.trim() });
      const resp = await fetch(REFRESH_ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json, text/plain, */*' },
        body,
      });
      if (!resp.ok) throw new Error(`${REFRESH_ENDPOINT} → ${resp.status} ${resp.statusText}`);
      const data = await resp.json() as Record<string, unknown>;
      const idToken = String(data.idToken ?? data.id_token ?? data.accessToken ?? data.access_token ?? '');
      if (!idToken) throw new Error('La API no devolvió idToken en la respuesta');
      saveAccessToken(idToken);
      setTokenObtained(new Date());
      setTokenRefreshing(false);
      return idToken;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTokenError(msg);
      setTokenRefreshing(false);
      throw new Error(msg);
    }
  }

  // ── Headers factory (auto-refresh on demand) ────────────────────────────────
  // Note: Authorization uses idToken directly (no "Bearer " prefix) — same as Python
  const makeHeaders = useCallback(async (forceRefresh = false): Promise<Record<string,string>> => {
    let at = accessTokenRef.current;
    if (!at || forceRefresh) at = await obtenerToken();
    return { Authorization: at, 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Wrapper for fetch that auto-retries once on 401
  async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
    const hdrs = await makeHeaders();
    let resp = await fetch(url, { ...init, headers: { ...hdrs, ...(init?.headers ?? {}) } });
    if (resp.status === 401) {
      // Token expired — refresh and retry once
      const hdrs2 = await makeHeaders(true);
      resp = await fetch(url, { ...init, headers: { ...hdrs2, ...(init?.headers ?? {}) } });
    }
    return resp;
  }

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchType, setSearchType] = useState<SearchType>('email');
  const [searchValue, setSearchValue] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [company, setCompany]         = useState<CompanyResult | null>(null);
  const [slots, setSlots]             = useState<DocumentSlot[]>([]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [urlStatus, setUrlStatus]     = useState<Record<string, 'loading'|'ok'|'error'>>({});

  // ── Find company ────────────────────────────────────────────────────────────
  async function buscarEmpresa() {
    if (!refreshToken.trim() && !accessToken.trim()) {
      setError('Ingresa tu Refresh Token primero.'); return;
    }
    if (!searchValue.trim()) { setError('Ingresa un email o ID para buscar.'); return; }

    setLoading(true); setError(''); setCompany(null); setSlots([]); setSelected(new Set());
    try {
      const param = searchType === 'email'
        ? `email=${encodeURIComponent(searchValue.trim())}`
        : `id=${encodeURIComponent(searchValue.trim())}`;

      const resp = await apiFetch(`${API_BASE}/company/bo?page=0&size=5&${param}`);
      if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
      const data = await resp.json() as Record<string, unknown>;

      const list = Array.isArray(data) ? data as Record<string,unknown>[]
                 : Array.isArray(data.content) ? data.content as Record<string,unknown>[]
                 : [data];

      if (list.length === 0) throw new Error('No se encontró ninguna empresa con esos datos.');

      const raw = list[0];
      const found: CompanyResult = {
        id:               Number(raw.id),
        name:             String(raw.name ?? raw.socialReason ?? raw.companyName ?? ''),
        country:          String(raw.country ?? raw.countryCode ?? ''),
        complianceStatus: String(raw.complianceStatus ?? ''),
        kycStage1:        String(raw.kycStage1 ?? raw.kycStatus ?? ''),
      };
      setCompany(found);

      const docsFromSearch = parseDocuments(raw);
      if (docsFromSearch.length > 0) { setSlots(docsFromSearch); }
      else { await fetchDocuments(found.id, raw); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  async function fetchDocuments(companyId: number, existing?: Record<string,unknown>) {
    if (existing) {
      const p = parseDocuments(existing);
      if (p.length > 0) { setSlots(p); return; }
    }
    try {
      const resp = await apiFetch(`${API_BASE}/company/bo?id=${companyId}&page=0&size=1`);
      if (resp.ok) {
        const data = await resp.json() as Record<string,unknown>;
        const p = parseDocuments(data);
        if (p.length > 0) { setSlots(p); return; }
        if (Array.isArray(data.content)) {
          const p2 = parseDocuments((data.content as Record<string,unknown>[])[0] ?? {});
          if (p2.length > 0) { setSlots(p2); return; }
        }
      }
    } catch { /* ignore, try next */ }
    try {
      const country = company?.country || 'CL';
      const resp = await apiFetch(
        `${API_BASE}/route/bo/documents/${country}?entityType=COMPANY&companyId=${companyId}`
      );
      if (resp.ok) { const data = await resp.json() as Record<string,unknown>; setSlots(parseDocuments(data)); }
    } catch { /* ignore */ }
  }

  // ── Pre-signed URL ──────────────────────────────────────────────────────────
  async function getPresignedUrl(companyId: number, fileName: string): Promise<string> {
    const fileKey = `prod/${companyId}/documents_company/${fileName}`;
    const resp = await apiFetch(
      `${API_BASE}/company/bo/pre-signed-url?fileKey=${encodeURIComponent(fileKey)}`
    );
    if (!resp.ok) throw new Error(`Pre-signed URL ${resp.status}`);
    const data = await resp.json() as Record<string,unknown>;
    const url = String(data.url ?? data.preSignedUrl ?? data.signedUrl ?? data.presignedUrl ?? data);
    if (!url || url === 'undefined') throw new Error('La API no devolvió una URL válida');
    return url;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function verDocumentos() {
    if (!company || selected.size === 0) return;
    for (const key of [...selected]) {
      const fileName = key.split('::')[1];
      setUrlStatus(s => ({ ...s, [key]: 'loading' }));
      try {
        const url = await getPresignedUrl(company.id, fileName);
        window.open(url, '_blank', 'noopener');
        setUrlStatus(s => ({ ...s, [key]: 'ok' }));
      } catch { setUrlStatus(s => ({ ...s, [key]: 'error' })); }
    }
  }

  async function descargarDocumentos() {
    if (!company || selected.size === 0) return;
    for (const key of [...selected]) {
      const [, fileName] = key.split('::');
      setUrlStatus(s => ({ ...s, [key]: 'loading' }));
      try {
        const url = await getPresignedUrl(company.id, fileName);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setUrlStatus(s => ({ ...s, [key]: 'ok' }));
        await new Promise(r => setTimeout(r, 400));
      } catch { setUrlStatus(s => ({ ...s, [key]: 'error' })); }
    }
  }

  function toggleAll() {
    const allKeys = slots.flatMap(s => s.links.map(l => `${s.slotKey}::${l.fileName}`));
    setSelected(allKeys.length > 0 && selected.size === allKeys.length ? new Set() : new Set(allKeys));
  }
  function toggleItem(key: string) {
    setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const totalDocs  = slots.reduce((n, s) => n + s.links.length, 0);
  const allKeys    = slots.flatMap(s => s.links.map(l => `${s.slotKey}::${l.fileName}`));
  const allSelected = allKeys.length > 0 && selected.size === allKeys.length;
  const hasToken   = !!accessToken;
  const minutesAgo = tokenObtained ? Math.floor((Date.now() - tokenObtained.getTime()) / 60000) : null;

  // ── Theme ───────────────────────────────────────────────────────────────────
  const bg      = dark ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950' : 'bg-slate-50';
  const cardBg  = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200 shadow-sm';
  const navBg   = dark ? 'bg-slate-900/90 border-slate-700/50' : 'bg-white/95 border-slate-200 shadow-sm';
  const text    = dark ? 'text-slate-100' : 'text-slate-900';
  const muted   = dark ? 'text-slate-400' : 'text-slate-500';
  const inputCls = dark
    ? 'bg-slate-900/60 border-slate-600/50 text-white placeholder-slate-600 focus:border-indigo-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-indigo-500';

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors`}>

      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur border-b px-6 py-3 flex items-center gap-3 flex-wrap ${navBg}`}>
        <button onClick={onBack}
          className={`flex items-center gap-2 text-xs font-semibold transition-colors ${muted} hover:text-indigo-400`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Inicio
        </button>
        <div className={`h-4 w-px ${dark ? 'bg-slate-700' : 'bg-slate-300'}`} />
        <span className="text-sm font-black">🏢 Documentos de Empresa</span>
        <span className={`text-xs font-medium ${muted}`}>Admin G66 · Búsqueda directa</span>
        {hasToken && (
          <span className={`ml-auto text-xs font-bold px-2 py-1 rounded-full ${dark ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
            ✓ Token activo{minutesAgo !== null ? ` · hace ${minutesAgo}m` : ''}
          </span>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Refresh Token (auth) ─────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${cardBg}`}>
          <div>
            <h2 className={`text-lg font-black ${dark ? 'text-white' : 'text-slate-800'}`}>
              🔑 Autenticación Admin G66
            </h2>
            <p className={`text-xs mt-1 leading-relaxed ${muted}`}>
              Pega tu <strong>Refresh Token</strong> de Admin G66. Se usa para obtener
              un Access Token fresco antes de cada consulta — el token de acceso expira
              en minutos, pero el refresh token dura mucho más.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <textarea
                rows={3}
                value={refreshToken}
                onChange={e => saveRefreshToken(e.target.value)}
                placeholder="eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ..."
                className={`w-full border rounded-xl px-4 py-3 text-xs font-mono focus:outline-none transition-colors resize-none ${inputCls} ${!rtVisible ? 'blur-[3px] select-none focus:blur-none' : ''}`}
                onFocus={() => setRtVisible(true)}
                onBlur={() => setRtVisible(false)}
              />
              {!rtVisible && refreshToken && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className={`text-xs font-semibold ${muted}`}>🔒 Haz clic para editar</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => obtenerToken().catch(() => {})}
                disabled={tokenRefreshing || !refreshToken.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm transition-all"
              >
                {tokenRefreshing
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Obteniendo token...</>
                  : '⚡ Obtener access token'}
              </button>

              {hasToken && (
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border ${dark ? 'bg-emerald-950/30 border-emerald-700/40 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  <span>✓</span>
                  <span>Access token listo {minutesAgo !== null ? `(hace ${minutesAgo} min)` : ''}</span>
                </div>
              )}

              {tokenError && (
                <p className="text-xs text-red-400 flex-1">{tokenError}</p>
              )}
            </div>

            <p className={`text-[11px] ${muted}`}>
              💡 El token se guarda en sesión del navegador y se refresca automáticamente si expira durante una búsqueda.
            </p>
          </div>
        </div>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${cardBg}`}>
          <h2 className={`text-lg font-black ${dark ? 'text-white' : 'text-slate-800'}`}>🔍 Buscar Empresa</h2>

          <div className={`flex gap-0 rounded-xl overflow-hidden w-fit border ${dark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-100 border-slate-200'}`}>
            {(['email','id'] as SearchType[]).map(t => (
              <button key={t} onClick={() => { setSearchType(t); setSearchValue(''); }}
                className={`px-5 py-2 text-sm font-bold transition-all ${searchType === t ? 'bg-indigo-600 text-white' : `${muted} hover:text-indigo-400`}`}>
                {t === 'email' ? '📧 Por Email' : '🔢 Por ID Empresa'}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <input
              type={searchType === 'email' ? 'email' : 'text'}
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarEmpresa()}
              placeholder={searchType === 'email' ? 'contacto@empresa.com' : 'ID numérico de la empresa'}
              className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}
            />
            <button onClick={buscarEmpresa} disabled={loading || (!hasToken && !refreshToken.trim())}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buscando...</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Buscar</>
              }
            </button>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-300">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* ── Company found ─────────────────────────────────────────────────── */}
        {company && (
          <div className={`border rounded-2xl p-5 flex items-start gap-4 ${dark ? 'bg-indigo-950/30 border-indigo-800/40' : 'bg-indigo-50 border-indigo-200'}`}>
            <div className="w-12 h-12 bg-indigo-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-indigo-500/30">
              <span className="text-2xl">🏢</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className={`text-lg font-black ${dark ? 'text-white' : 'text-slate-900'}`}>
                  {company.name || `Empresa #${company.id}`}
                </h3>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${dark ? 'text-indigo-300 bg-indigo-950/50 border-indigo-700/50' : 'text-indigo-700 bg-indigo-100 border-indigo-200'}`}>
                  ID {company.id}
                </span>
                {company.country && company.country !== 'undefined' && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${dark ? 'text-slate-300 bg-slate-800 border border-slate-700' : 'text-slate-600 bg-white border border-slate-200'}`}>
                    {company.country}
                  </span>
                )}
              </div>
              <div className={`flex gap-4 mt-1 text-xs ${muted}`}>
                {company.complianceStatus && company.complianceStatus !== 'undefined' && (
                  <span>Compliance: <strong className={dark ? 'text-slate-200' : 'text-slate-700'}>{company.complianceStatus}</strong></span>
                )}
                {company.kycStage1 && company.kycStage1 !== 'undefined' && (
                  <span>KYC I: <strong className={dark ? 'text-slate-200' : 'text-slate-700'}>{company.kycStage1}</strong></span>
                )}
              </div>
              <p className={`text-xs mt-1 ${muted}`}>
                {totalDocs === 0
                  ? 'Sin documentos cargados'
                  : `${totalDocs} doc${totalDocs !== 1 ? 's' : ''} en ${slots.filter(s=>s.links.length>0).length} sección${slots.filter(s=>s.links.length>0).length!==1?'es':''}`}
              </p>
            </div>
          </div>
        )}

        {/* ── Documents table ───────────────────────────────────────────────── */}
        {company && slots.length > 0 && (
          <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
            <div className={`px-6 py-4 flex items-center justify-between border-b ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <h3 className={`text-base font-black ${dark ? 'text-white' : 'text-slate-800'}`}>📄 Documentos Cargados</h3>
                {selected.size > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                    {selected.size} seleccionado{selected.size!==1?'s':''}
                  </span>
                )}
              </div>
              <label className={`flex items-center gap-2 text-xs font-semibold cursor-pointer select-none ${muted}`}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="w-4 h-4 rounded accent-indigo-600" />
                Todos
              </label>
            </div>

            <div className="divide-y divide-slate-200/60 dark:divide-slate-700/40">
              {slots.map(slot => {
                const hasLinks = slot.links.length > 0;
                return (
                  <div key={slot.slotKey} className={!hasLinks ? 'opacity-40' : ''}>
                    <div className={`px-6 py-2.5 flex items-center gap-2 ${dark ? 'bg-slate-800/30' : 'bg-slate-50/80'}`}>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${hasLinks ? (dark ? 'text-indigo-400' : 'text-indigo-600') : muted}`}>
                        {slot.label}
                      </span>
                      {!hasLinks && <span className={`text-[9px] font-bold uppercase ${muted}`}>— sin documentos</span>}
                      {slot.links.length > 1 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${dark ? 'bg-amber-900/50 text-amber-400 border border-amber-700/50' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                          {slot.links.length} versiones
                        </span>
                      )}
                    </div>

                    {slot.links.map((link, idx) => {
                      const key = `${slot.slotKey}::${link.fileName}`;
                      const isSelected   = selected.has(key);
                      const isMostRecent = idx === 0 && slot.links.length > 1;
                      const isOldest     = idx === slot.links.length - 1 && slot.links.length > 1;
                      const uStatus      = urlStatus[key];
                      return (
                        <div key={link.id} onClick={() => toggleItem(key)}
                          className={`px-6 py-3 flex items-center gap-4 cursor-pointer transition-colors ${
                            isSelected
                              ? dark ? 'bg-indigo-950/40 hover:bg-indigo-950/50' : 'bg-indigo-50 hover:bg-indigo-100/80'
                              : dark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                          }`}>
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleItem(key)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded accent-indigo-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-mono truncate ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{link.fileName}</p>
                          </div>
                          <span className={`text-xs whitespace-nowrap ${muted}`}>{formatDate(link.uploadedDateMillis)}</span>
                          {isMostRecent && (
                            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full whitespace-nowrap ${dark ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                              Más reciente
                            </span>
                          )}
                          {isOldest && (
                            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full whitespace-nowrap ${dark ? 'bg-slate-700/50 text-slate-400 border border-slate-600/50' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                              Más antiguo
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border whitespace-nowrap ${statusColor(link.status)}`}>
                            {link.status || '—'}
                          </span>
                          {uStatus === 'loading' && <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin flex-shrink-0" />}
                          {uStatus === 'ok'      && <span className="text-emerald-400 text-xs flex-shrink-0">✓</span>}
                          {uStatus === 'error'   && <span className="text-red-400 text-xs flex-shrink-0">✗</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {selected.size > 0 && (
              <div className={`px-6 py-4 border-t flex flex-wrap gap-3 items-center ${dark ? 'border-slate-700/50 bg-slate-800/30' : 'border-slate-200 bg-slate-50/80'}`}>
                <button onClick={verDocumentos}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Ver en navegador ({selected.size})
                </button>
                <button onClick={descargarDocumentos}
                  className={`flex items-center gap-2 border font-bold px-5 py-2.5 rounded-xl text-sm transition-all ${dark ? 'border-emerald-600/50 text-emerald-400 hover:bg-emerald-950/40' : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar ({selected.size})
                </button>
                <p className={`text-xs ${muted}`}>
                  💡 Tras descargar, sube los PDF al <strong>Analizador de Documentos</strong> en la suite Compliance.
                </p>
              </div>
            )}
          </div>
        )}

        {company && slots.length === 0 && !loading && (
          <div className={`border rounded-2xl p-10 text-center ${cardBg}`}>
            <div className="text-4xl mb-3">📂</div>
            <p className={`font-semibold ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
              No se encontraron documentos para esta empresa
            </p>
            <p className={`text-xs mt-2 ${muted}`}>
              La empresa puede no tener documentos cargados, o el endpoint de documentos
              retornó un formato distinto al esperado.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
