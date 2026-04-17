// ── Credentials ───────────────────────────────────────────────────────────────
const _env = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env;

const REGCHEQ_KEY  = _env.VITE_REGCHEQ_API_KEY ?? 'F10596C184DB7D99DB90F956';
const REGCHEQ_BASE = 'https://external-api.regcheq.com';

const INSP_BASE = 'https://inspektor.datalaft.com:2121/api';
const INSP_USER = 'WS_Global81';
const INSP_PASS = 'Risk5397#0ft';

const NOSIS_BASE = 'https://ws01.nosis.com/api/variables';
const NOSIS_KEY  = '3c97fae0-02bc-434f-858f-f23657fbc8f9';
const NOSIS_VR_DEFAULT = 2;

// ── Public types ──────────────────────────────────────────────────────────────
export type ProviderType = 'REGCHEQ' | 'INSPEKTOR' | 'NOSIS';
export type RiskLevel    = 'high' | 'medium' | 'low' | 'unknown';

export interface KYCInput {
  country: string;
  documentType: string;
  documentNumber: string;
  firstName: string;
  fatherName: string;
  motherName?: string;
  birthDate?: string;
  gender?: 'masculino' | 'femenino' | 'X';
  nationality?: string;
  email?: string;
  phone?: string;
  region?: string;
  city?: string;
  address?: string;
  position?: string;
  employer?: string;
  income?: string;
  // CO – Inspektor
  tienePrioridad4?: boolean;
  procuraduria?: boolean;
  ramaJudicial?: boolean;
  ramaJEPMS?: boolean;
  // AR – Nosis
  nosisVR?: number;
}

export interface KYCMatch {
  listType: string;
  risk: RiskLevel;
  source: string;
  matchedName?: string;
  matchedDocument?: string;
  offense?: string | null;
  sanction?: string | null;
  zone?: string | null;
  link?: string | null;
  lastUpdated?: string | null;
  priority?: number | null;
  raw?: unknown;
}

export interface NosisVariable {
  name: string;
  value: string;
  description?: string;
  type?: string;
  date?: string;
}

export interface RegcheqLista {
  coincidence: boolean;
  risk: string;
  data: unknown;
}

export interface KYCResult {
  providerUsed: ProviderType;
  queryId?: string;
  documentNumber: string;
  fullName: string;
  country: string;
  effectiveRisk: RiskLevel;
  isPEP: boolean;
  pepLevel?: string | null;
  matches: KYCMatch[];
  lastChecked: string;
  providerStatus: string;
  providerMessage?: string | null;
  rawPayload?: unknown;
  // Profile ficha fields (all providers)
  ficha?: Record<string, string>;
  // Regcheq: all listas (including non-hits, for display)
  regcheqListas?: Record<string, RegcheqLista>;
  // Inspektor extras
  numConsulta?: number;
  procuradoriaData?: unknown;
  ramaJudicialData?: unknown;
  ramaJEPMSData?: unknown;
  // Nosis extras
  nosisVariables?: NosisVariable[];
}

// ── Country → provider routing ────────────────────────────────────────────────
export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  docTypes: string[];
  provider: ProviderType;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'CL', name: 'Chile',           flag: '🇨🇱', docTypes: ['RUT', 'Pasaporte'],               provider: 'REGCHEQ'   },
  { code: 'CO', name: 'Colombia',         flag: '🇨🇴', docTypes: ['CC', 'CE', 'PPT', 'NIT'],          provider: 'INSPEKTOR' },
  { code: 'AR', name: 'Argentina',        flag: '🇦🇷', docTypes: ['DNI', 'CUIT', 'CUIL'],             provider: 'NOSIS'     },
  { code: 'PE', name: 'Perú',             flag: '🇵🇪', docTypes: ['DNI', 'RUC', 'Pasaporte'],         provider: 'REGCHEQ'   },
  { code: 'MX', name: 'México',           flag: '🇲🇽', docTypes: ['CURP', 'RFC', 'Pasaporte'],        provider: 'REGCHEQ'   },
  { code: 'BR', name: 'Brasil',           flag: '🇧🇷', docTypes: ['CPF', 'CNPJ', 'Pasaporte'],        provider: 'REGCHEQ'   },
  { code: 'EC', name: 'Ecuador',          flag: '🇪🇨', docTypes: ['Cédula', 'RUC', 'Pasaporte'],      provider: 'REGCHEQ'   },
  { code: 'UY', name: 'Uruguay',          flag: '🇺🇾', docTypes: ['CI', 'RUT', 'Pasaporte'],          provider: 'REGCHEQ'   },
  { code: 'US', name: 'Estados Unidos',   flag: '🇺🇸', docTypes: ['SSN', 'EIN', 'Pasaporte'],         provider: 'REGCHEQ'   },
  { code: 'OTHER', name: 'Otro país',     flag: '🌍',  docTypes: ['Pasaporte'],                        provider: 'REGCHEQ'   },
];

export const routeProvider = (country: string): ProviderType =>
  COUNTRY_OPTIONS.find(c => c.code === country.toUpperCase())?.provider ?? 'REGCHEQ';

// ── Helpers ───────────────────────────────────────────────────────────────────
const normaliseDoc = (num: string, type: string): string => {
  if (type === 'RUT') return num.trim(); // keep dash for RUT CL
  return num.replace(/[.\-\s]/g, '').toUpperCase();
};

const fullName = (i: KYCInput) =>
  [i.firstName, i.fatherName, i.motherName].filter(Boolean).join(' ').toUpperCase().trim();

const inspDocType = (dt: string): number => {
  const m: Record<string, number> = { CC: 1, NIT: 2, CE: 5, PPT: 10, PEP: 0 };
  return m[dt.toUpperCase()] ?? 1;
};

const inspRisk = (prioridad: string | number | null): RiskLevel => {
  const p = parseInt(String(prioridad ?? 99));
  if (p <= 2) return 'high';
  if (p === 3) return 'medium';
  return 'low';
};

const inspListType = (idGrupo: number, nombre: string): string => {
  const n = (nombre ?? '').toLowerCase();
  if (idGrupo === 6)  return 'PEP_LOCAL';
  if (idGrupo === 1 || n.includes('ofac') || n.includes(' onu') || n.includes('onu ')) return 'OFAC_SDN';
  if (idGrupo === 2 || idGrupo === 3) return 'LAFT';
  if (idGrupo === 4 || idGrupo === 5) return 'ADMIN_SANCTIONS';
  if (idGrupo === 7) return 'INFO_LISTS';
  if (idGrupo === 8) return 'INTERNAL_LIST';
  return 'LAFT';
};

// ── Inspektor token cache ─────────────────────────────────────────────────────
let _token: string | null = null;
let _tokenExpiry = 0;
let _refreshToken: string | null = null;

const getInspToken = async (): Promise<string> => {
  const now = Date.now();
  if (_token && now < _tokenExpiry - 5 * 60_000) return _token;

  // Try refresh
  if (_refreshToken) {
    try {
      const r = await fetch(`${INSP_BASE}/Auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: _refreshToken }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.token?.access_token) {
          _token = d.token.access_token;
          _refreshToken = d.token.refresh_token ?? _refreshToken;
          _tokenExpiry = now + (d.token.expires_in ?? 3_600_000);
          return _token!;
        }
      }
    } catch { /* fall through to full login */ }
  }

  const r = await fetch(`${INSP_BASE}/Auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: INSP_USER, password: INSP_PASS }),
  });
  if (!r.ok) throw new Error(`Inspektor login failed (${r.status})`);
  const d = await r.json();
  _token = d.token?.access_token;
  _refreshToken = d.token?.refresh_token ?? null;
  _tokenExpiry = now + (d.token?.expires_in ?? 3_600_000);
  if (!_token) throw new Error('Inspektor: no access_token');
  return _token;
};

// ── Regcheq lista key → display name ─────────────────────────────────────────
const REGCHEQ_LISTA_NAMES: Record<string, string> = {
  pepChile:                   'PEP Chile',
  funcPublicChile:            'Funcionario Público Chile',
  internationalOrganizations: 'OFAC / ONU / UE',
  pdiResult:                  'PDI / Antecedentes',
  gafiResult:                 'GAFI',
  keywordsResult:             'Palabras Clave',
  regcheqList:                'Lista Interna Regcheq',
  rtpResult:                  'Riesgo País (RTP)',
  internList:                 'Lista de Interés',
  secondCriminalCasesChile:   'Causas Penales Chile',
  interpol:                   'INTERPOL',
  screeningGlobal:            'Screening Global',
};

const REGCHEQ_KEY_TO_LIST_TYPE: Record<string, string> = {
  pepChile:                   'PEP_LOCAL',
  funcPublicChile:            'PEP_LOCAL',
  internationalOrganizations: 'OFAC_SDN',
  pdiResult:                  'PDI_LOCAL',
  gafiResult:                 'GAFI',
  keywordsResult:             'KEYWORDS',
  regcheqList:                'INTERNAL_LIST',
  rtpResult:                  'RTP',
  internList:                 'INTERNAL_LIST',
  secondCriminalCasesChile:   'PDI_LOCAL',
  interpol:                   'OFAC_SDN',
  screeningGlobal:            'OFAC_SDN',
};

// ── Regcheq ───────────────────────────────────────────────────────────────────
export const fetchRegcheq = async (input: KYCInput): Promise<KYCResult> => {
  const dni = normaliseDoc(input.documentNumber, input.documentType);
  const name = fullName(input);

  const body: Record<string, unknown> = {
    dni,
    personType: 'natural',
    dniType: input.documentType,
    name: input.firstName.toUpperCase(),
    fatherName: input.fatherName.toUpperCase(),
    ...(input.motherName   && { motherName:  input.motherName.toUpperCase() }),
    ...(input.email        && { email:        input.email }),
    ...(input.phone        && { phone:        input.phone }),
    ...(input.nationality  && { nationality:  input.nationality }),
    country:  input.country,
    ...(input.region   && { region:   input.region }),
    ...(input.city     && { city:     input.city }),
    ...(input.address  && { address:  input.address }),
    ...(input.birthDate && { birthDate: input.birthDate }),
    ...(input.gender   && { gender:   input.gender }),
    ...(input.position && { position: input.position }),
    ...(input.employer && { employer: input.employer }),
    ...(input.income   && { income:   input.income }),
  };

  // Helper: attempt a single GET and return data only when 'listas' key is present
  const tryGet = async (): Promise<Record<string, unknown> | null> => {
    try {
      const resp = await fetch(`${REGCHEQ_BASE}/record/${dni}/${REGCHEQ_KEY}`);
      if (!resp.ok) return null;
      const json = await resp.json() as Record<string, unknown>;
      // 'listas' in json is true even when listas:{} or listas:null — matches what
      // RegcheqTool's fetchPerfil accepts (uses perfil.listas ?? {})
      if (json && typeof json === 'object' && 'listas' in json) return json;
      return null;
    } catch { return null; }
  };

  // ── STEP 1: fast path — try GET on existing record (same as RegcheqTool) ──
  let data = await tryGet();

  // ── STEP 2: no existing record → POST to create, then poll ──
  if (!data) {
    await fetch(`${REGCHEQ_BASE}/record/${REGCHEQ_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Regcheq AML check is asynchronous — poll until 'listas' appears (up to ~20s)
    for (let attempt = 0; attempt < 8 && !data; attempt++) {
      await new Promise(r => setTimeout(r, 2500));
      data = await tryGet();
    }
  }

  if (!data) throw new Error(
    'Regcheq: sin resultados tras esperar. El procesamiento puede tardar, intenta de nuevo en unos segundos.'
  );

  const listasRaw = (data.listas ?? {}) as Record<string, Record<string, unknown>>;

  // Build normalised listas map (all keys, including non-hits)
  const regcheqListas: Record<string, RegcheqLista> = {};
  for (const [key, nombre] of Object.entries(REGCHEQ_LISTA_NAMES)) {
    const entry = listasRaw[key] ?? null;
    let rawData = entry?.data ?? null;
    if (typeof rawData === 'string' && !(rawData as string).trim()) rawData = null;
    regcheqListas[nombre] = {
      coincidence: Boolean(entry?.coincidence),
      risk: String(entry?.risk ?? ''),
      data: rawData,
    };
  }

  // Hits-only matches array
  const matches: KYCMatch[] = [];
  for (const [key, nombre] of Object.entries(REGCHEQ_LISTA_NAMES)) {
    const l = listasRaw[key];
    if (!l?.coincidence) continue;
    const listType = REGCHEQ_KEY_TO_LIST_TYPE[key] ?? 'LAFT';
    const items = (l.data as unknown[]) ?? [];
    if (items.length > 0) {
      (items as Record<string, string>[]).forEach(d => {
        matches.push({
          listType, risk: (l.risk as RiskLevel) ?? 'high',
          source: nombre,
          matchedName: d.name || d.nombre || '',
          offense: d.crime || d.delito || d.crimen || null,
          zone: d.country || d.zona || null,
          lastUpdated: d.updatedAt || null,
          raw: d,
        });
      });
    } else {
      matches.push({ listType, risk: (l.risk as RiskLevel) ?? 'high', source: nombre, raw: l });
    }
  }

  // Ficha fields
  const FICHA_MAP: [string, string][] = [
    ['name','Nombre'],['fatherName','Apellido paterno'],['motherName','Apellido materno'],
    ['nationality','Nacionalidad'],['country','País'],['email','Email'],
    ['phone','Teléfono'],['position','Cargo'],['employer','Empleador'],
    ['birthDate','Fecha nacimiento'],
  ];
  const ficha: Record<string, string> = {};
  for (const [k, label] of FICHA_MAP) {
    const v = (data as Record<string, unknown>)[k];
    if (v) ficha[label] = String(v);
  }

  const isPEP = !!(listasRaw.pepChile?.coincidence || listasRaw.funcPublicChile?.coincidence);
  const risks = Object.values(listasRaw).filter(l => l?.coincidence).map(l => l.risk as string);
  let effectiveRisk: RiskLevel = 'low';
  if (risks.includes('high')) effectiveRisk = 'high';
  else if (risks.includes('medium')) effectiveRisk = 'medium';

  return {
    providerUsed: 'REGCHEQ',
    documentNumber: dni,
    fullName: (data.name as string) || name,
    country: input.country,
    effectiveRisk: (data.effectiveRisk as RiskLevel) ?? effectiveRisk,
    isPEP,
    pepLevel: (data.pepLevel as string) || null,
    matches,
    ficha,
    regcheqListas,
    lastChecked: new Date().toISOString(),
    providerStatus: 'OK',
    rawPayload: data,
  };
};

// ── Inspektor ─────────────────────────────────────────────────────────────────
export const fetchInspektor = async (input: KYCInput): Promise<KYCResult> => {
  const token = await getInspToken();
  const nombre = fullName(input);
  const docNum = normaliseDoc(input.documentNumber, input.documentType);

  const body = {
    nombre,
    tipoDocumento: inspDocType(input.documentType),
    identificacion: docNum,
    cantidadPalabras: '',
    tienePrioridad_4: input.tienePrioridad4 ?? false,
    procuraduria:     input.procuraduria    ?? true,
    ramaJudicial:     input.ramaJudicial    ?? true,
    ramaJEPMS:        input.ramaJEPMS       ?? true,
  };

  const resp = await fetch(`${INSP_BASE}/ConsultaPrincipal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Inspektor: ${resp.status} ${resp.statusText}`);
  const data = await resp.json() as Record<string, unknown>;

  const listas = (data.listas as Record<string, unknown>[]) ?? [];
  const matches: KYCMatch[] = listas.map(l => ({
    listType: inspListType(l.idGrupoLista as number, l.nombreTipoLista as string),
    risk: inspRisk(l.prioridad as string),
    source: (l.fuenteConsulta as string) || (l.nombreTipoLista as string) || '',
    matchedName: (l.nombreCompleto as string) || '',
    matchedDocument: (l.documentoIdentidad as string) || '',
    offense: (l.delito as string) || null,
    zone: (l.zona as string) || null,
    lastUpdated: l.fechaActualizacion ? (l.fechaActualizacion as string).split('T')[0] : null,
    priority: l.prioridad ? parseInt(String(l.prioridad)) : null,
    raw: l,
  }));

  // Procuraduria
  const procData = ((data.procuraduria as Record<string, unknown>)?.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
  procData.forEach(p => {
    ((p.sanciones as Record<string, string>[]) ?? []).forEach(s => {
      matches.push({
        listType: 'DISCIPLINARY', risk: 'medium', source: 'PROCURADURIA',
        matchedName: nombre,
        offense: s.sancion || null,
        sanction: s.termino ? `${s.sancion} ${s.termino}` : s.sancion,
        raw: s,
      });
    });
  });

  // Rama Judicial
  const ramaData = ((data.ramaJudicial as Record<string, unknown>)?.data as Record<string, unknown>[]) ?? [];
  ramaData.forEach(r => {
    matches.push({
      listType: 'JUDICIAL', risk: 'medium', source: 'RAMA JUDICIAL',
      matchedName: nombre,
      offense: (r.tipoProceso as string) || null,
      raw: r,
    });
  });

  const isPEP = listas.some(l => l.idGrupoLista === 6);
  const maxPriority = listas.length > 0 ? Math.min(...listas.map(l => parseInt(String(l.prioridad ?? 99)))) : 99;
  let effectiveRisk: RiskLevel = 'low';
  if (matches.length > 0) {
    if (maxPriority <= 2) effectiveRisk = 'high';
    else if (maxPriority <= 3) effectiveRisk = 'medium';
    else effectiveRisk = 'low';
  }

  const fichaInsp: Record<string, string> = {};
  if (input.firstName)  fichaInsp['Nombre']           = [input.firstName, input.fatherName, input.motherName].filter(Boolean).join(' ').toUpperCase();
  if (input.documentType) fichaInsp['Tipo documento'] = input.documentType;
  if (docNum)           fichaInsp['Documento']         = docNum;
  if (input.birthDate)  fichaInsp['Fecha nacimiento']  = input.birthDate;
  if (input.gender)     fichaInsp['Género']            = input.gender;
  if (input.email)      fichaInsp['Email']             = input.email;
  if (input.phone)      fichaInsp['Teléfono']          = input.phone;
  if (input.position)   fichaInsp['Cargo']             = input.position;
  if (input.employer)   fichaInsp['Empleador']         = input.employer;

  return {
    providerUsed: 'INSPEKTOR',
    queryId: String(data.numConsulta ?? ''),
    numConsulta: data.numConsulta as number,
    documentNumber: (data.numDocumento as string) || docNum,
    fullName: (data.nombre as string) || nombre,
    country: input.country,
    effectiveRisk,
    isPEP,
    matches,
    ficha: fichaInsp,
    lastChecked: new Date().toISOString(),
    providerStatus: 'OK',
    procuradoriaData: data.procuraduria,
    ramaJudicialData: data.ramaJudicial,
    ramaJEPMSData:    data.ramaJudicialJEPMS,
    rawPayload: data,
  };
};

// ── Nosis ─────────────────────────────────────────────────────────────────────
export const fetchNosis = async (input: KYCInput): Promise<KYCResult> => {
  const docNum = normaliseDoc(input.documentNumber, input.documentType);
  const nombre = [input.firstName, input.fatherName].filter(Boolean).join(' ').toUpperCase();
  const gMap: Record<string, string> = { masculino: 'M', femenino: 'F', X: 'X' };
  const vr = input.nosisVR ?? NOSIS_VR_DEFAULT;

  const params = new URLSearchParams({
    documento: docNum,
    VR: String(vr),
    Format: 'JSON',
    ...(nombre && { RazonSocial: nombre }),
    ...(input.gender && { Sexo: gMap[input.gender] ?? 'X' }),
  });

  const resp = await fetch(`${NOSIS_BASE}?${params}`, {
    headers: { 'X-API-KEY': NOSIS_KEY },
  });
  if (!resp.ok) throw new Error(`Nosis: ${resp.status} ${resp.statusText}`);
  const data = await resp.json() as Record<string, unknown>;

  const contenido = data.Contenido as Record<string, unknown> ?? {};
  const resultado = (contenido.Resultado as Record<string, unknown>) ?? {};
  const estado = resultado.Estado as number ?? 0;

  if (estado !== 200) {
    throw new Error(`Nosis ${estado}: ${resultado.Novedad ?? 'Error desconocido'}`);
  }

  const rawVars = ((contenido.Datos as Record<string, unknown>)?.Variables as Record<string, string>[]) ?? [];
  const nosisVariables: NosisVariable[] = rawVars.map(v => ({
    name:        v.Nombre,
    value:       v.Valor,
    description: v.Descripcion,
    type:        v.Tipo,
    date:        v.FechaAct,
  }));

  const resolvedName = nosisVariables.find(v => v.name === 'VI_Identidad_Nombre')?.value || nombre;

  const fichaNosis: Record<string, string> = {};
  fichaNosis['Nombre'] = resolvedName;
  fichaNosis['Documento'] = docNum;
  if (input.documentType) fichaNosis['Tipo documento'] = input.documentType;
  if (input.birthDate)    fichaNosis['Fecha nacimiento'] = input.birthDate;
  if (input.gender)       fichaNosis['Género'] = input.gender;
  if (input.email)        fichaNosis['Email'] = input.email;
  if (input.phone)        fichaNosis['Teléfono'] = input.phone;

  return {
    providerUsed: 'NOSIS',
    queryId: resultado.Transaccion as string,
    documentNumber: docNum,
    fullName: resolvedName,
    country: input.country,
    effectiveRisk: 'low',
    isPEP: false,
    matches: [],
    ficha: fichaNosis,
    lastChecked: (resultado.FechaRecepcion as string) || new Date().toISOString(),
    providerStatus: (resultado.Novedad as string) || 'OK',
    nosisVariables,
    rawPayload: data,
  };
};

// ── Orchestrator ──────────────────────────────────────────────────────────────
export const investigateClient = (input: KYCInput): Promise<KYCResult> => {
  switch (routeProvider(input.country)) {
    case 'INSPEKTOR': return fetchInspektor(input);
    case 'NOSIS':     return fetchNosis(input);
    default:          return fetchRegcheq(input);
  }
};

// ── Display helpers (used by UI) ──────────────────────────────────────────────
export const LIST_TYPE_LABELS: Record<string, string> = {
  PEP_LOCAL:        'PEP Local',
  PEP_INT:          'PEP Internacional',
  OFAC_SDN:         'OFAC / ONU / UE',
  UN_SANCTIONS:     'Sanciones ONU',
  EU_SANCTIONS:     'Sanciones UE',
  GAFI:             'GAFI',
  PDI_LOCAL:        'PDI / Antecedentes',
  LAFT:             'LA/FT/FPADM',
  ADMIN_SANCTIONS:  'Sanciones Administrativas',
  KEYWORDS:         'Palabras Clave',
  INFO_LISTS:       'Listas Informativas',
  INTERNAL_LIST:    'Lista Interna',
  RTP:              'Riesgo País',
  JUDICIAL:         'Rama Judicial',
  DISCIPLINARY:     'Procuraduría',
  CREDIT_RISK:      'Riesgo Crediticio',
  DOMICILE_VERIF:   'Verificación Domicilio',
};

export const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; border: string; dot: string }> = {
  high:    { label: 'ALTO',      bg: 'bg-red-100 dark:bg-red-950',     text: 'text-red-700 dark:text-red-400',       border: 'border-red-300 dark:border-red-700',    dot: 'bg-red-500' },
  medium:  { label: 'MEDIO',     bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400',   border: 'border-amber-300 dark:border-amber-700',dot: 'bg-amber-500' },
  low:     { label: 'BAJO',      bg: 'bg-green-100 dark:bg-green-950', text: 'text-green-700 dark:text-green-400',   border: 'border-green-300 dark:border-green-700',dot: 'bg-green-500' },
  unknown: { label: 'S/D',       bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400',   border: 'border-slate-300 dark:border-slate-700',dot: 'bg-slate-400' },
};

export const PROVIDER_CONFIG: Record<ProviderType, { label: string; bg: string; text: string; border: string }> = {
  REGCHEQ:   { label: 'Regcheq',   bg: 'bg-teal-100 dark:bg-teal-950',   text: 'text-teal-700 dark:text-teal-300',   border: 'border-teal-300 dark:border-teal-700' },
  INSPEKTOR: { label: 'Inspektor', bg: 'bg-indigo-100 dark:bg-indigo-950',text: 'text-indigo-700 dark:text-indigo-300',border: 'border-indigo-300 dark:border-indigo-700' },
  NOSIS:     { label: 'Nosis',     bg: 'bg-violet-100 dark:bg-violet-950',text: 'text-violet-700 dark:text-violet-300',border: 'border-violet-300 dark:border-violet-700' },
};
