// Admin (`/company/bo` + endpoints de personas) → modelo canónico del KYB.
//
// Es la traducción del mapeo que ya estaba resuelto en la app Flask del Desktop
// (fmt_person, _doc_key, consolidación de las 4 fuentes de personas), derivada
// acá desde `empresaDocsClient` y verificada contra la respuesta REAL de Admin
// con la empresa 2058470 (55 campos).
//
// Funciones PURAS: no hacen red. Reciben lo que `getEmpresaDocsCompany` ya trajo.
//
// Lo que se confirmó contra la API y contradice supuestos del plan:
//   · NO existe capital social  → queda como fuente única desde documentos
//   · NO hay % de participación a nivel empresa
//   · SÍ existen las facultades (`signatureAuthorization*`)
//   · `shareholders` es un dict {categoría: [personas]}, la clave es el rol

import type { EmpresaDocsDetail } from '../../types/empresaDocs';
import type {
  LadoCanonico, PersonaCanonica, MontoCanonico, DomicilioCanonico,
  EstadoAdminEmpresa, RelacionCanonica,
} from '../../types/kybCanonico';
import { normalizarTexto } from '../casosComplianceMapper';

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

// Documento sin puntos, guiones ni espacios, en mayúsculas. Es el primitivo de
// emparejamiento: dos personas son la misma si comparten esta clave.
export function normalizarDocumento(v: unknown): string {
  return txt(v).replace(/[.\s-]/g, '').toUpperCase();
}

// Clave de emparejamiento de una persona: documento si hay, si no el nombre
// normalizado. Sin esto no se puede cruzar Lens con Admin.
export function clavePersona(nombre: string, documento: string): string {
  const doc = normalizarDocumento(documento);
  return doc || normalizarTexto(nombre);
}

// Número tolerante: acepta "1.234.567", "1234567.89", 1234567 y "".
export function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = txt(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const ultimoPunto = s.lastIndexOf('.');
  const ultimaComa = s.lastIndexOf(',');
  let limpio = s;

  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // Tiene los dos: el que va último es el separador decimal.
    limpio = ultimaComa > ultimoPunto
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (ultimaComa >= 0) {
    // Solo coma: decimal si quedan 1-2 dígitos después; si no, miles.
    limpio = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimoPunto >= 0) {
    // Solo puntos. Acá estaba el bug: "1.234.567" caía en Number() y daba NaN,
    // así que un monto se leía como "sin datos" en vez de compararse.
    // Criterio: si TODOS los grupos después del primer punto tienen exactamente
    // 3 dígitos, son separadores de miles (formato de CL y CO). Si no, decimal.
    const grupos = s.split('.');
    const sonMiles = grupos.length > 1 && grupos.slice(1).every(g => /^\d{3}$/.test(g));
    limpio = sonMiles ? s.replace(/\./g, '') : s;
  }

  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

const monto = (v: unknown, moneda?: string): MontoCanonico | undefined => {
  const valor = aNumero(v);
  return valor === null ? undefined : { valor, moneda: moneda || undefined };
};

// ── Personas ─────────────────────────────────────────────────────────────────
// Admin devuelve las personas con nombres de campo distintos según el endpoint
// (`firstName|name`, `lastName|surname`, `identificationNumber|docNumber`…), así
// que se leen todas las variantes conocidas.
type Crudo = Record<string, unknown>;

const primero = (o: Crudo, ...claves: string[]): string => {
  for (const k of claves) {
    const v = txt(o[k]);
    if (v) return v;
  }
  return '';
};

export function mapPersona(o: Crudo, rolPorDefecto?: string): PersonaCanonica {
  const nombreBase = primero(o, 'firstName', 'name', 'nombre');
  const apellido = primero(o, 'lastName', 'surname', 'apellido');
  const nombre = [nombreBase, apellido].filter(Boolean).join(' ').trim();
  const documento = primero(o, 'identificationNumber', 'docNumber', 'documento');
  const esRep = o.isLegalRepresentative === true || o.legalRepresentative === true;
  return {
    nombre,
    documento: normalizarDocumento(documento),
    tipoDocumento: primero(o, 'identificationType', 'docType'),
    clave: clavePersona(nombre, documento),
    email: primero(o, 'email') || undefined,
    nacionalidad: primero(o, 'nationality', 'nationalityCode') || undefined,
    rol: primero(o, 'role', 'userType') || rolPorDefecto || undefined,
    esRepresentanteLegal: esRep || undefined,
    // Puede venir dentro del accionista; a nivel empresa NO existe.
    participacionPct: aNumero(o.participationPercentage ?? o.participacion ?? o.percentage),
    estado: primero(o, 'status', 'state') || undefined,
    nivelKyc: primero(o, 'level', 'kycStage1') || undefined,
  };
}

// Dedup por clave. Ante dos con la misma, gana la que trae más datos.
export function dedupPersonas(personas: PersonaCanonica[]): PersonaCanonica[] {
  const completitud = (p: PersonaCanonica) =>
    [p.documento, p.email, p.nacionalidad, p.rol, p.tipoDocumento].filter(Boolean).length;
  const map = new Map<string, PersonaCanonica>();
  for (const p of personas) {
    if (!p.clave) continue;
    const prev = map.get(p.clave);
    if (!prev || completitud(p) > completitud(prev)) map.set(p.clave, p);
  }
  return [...map.values()];
}

// `shareholders` es un dict {categoría: [personas]} y la CLAVE es el rol.
// Verificado en la respuesta real: viene como objeto, no como array.
export function mapAccionistas(shareholders: unknown): PersonaCanonica[] {
  if (!shareholders || typeof shareholders !== 'object') return [];
  if (Array.isArray(shareholders)) return dedupPersonas(shareholders.map(x => mapPersona(x as Crudo)));
  const out: PersonaCanonica[] = [];
  for (const [categoria, lista] of Object.entries(shareholders as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    for (const p of lista) out.push(mapPersona(p as Crudo, categoria));
  }
  return dedupPersonas(out);
}

// ── Actividad económica ──────────────────────────────────────────────────────
// Admin la reparte en cinco campos distintos. Se unifican en una lista sin
// duplicados, porque el comparador compara conjuntos, no campos.
function mapActividades(c: Crudo): string[] {
  const crudas: unknown[] = [
    c.activity, c.indActivity, c.nosisActivity, c.companyFinancialActivity,
  ];
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const a of crudas) {
    const v = txt(typeof a === 'object' && a !== null ? (a as Crudo).name ?? '' : a);
    const k = normalizarTexto(v);
    if (!v || vistas.has(k)) continue;
    vistas.add(k);
    out.push(v);
  }
  return out;
}

// `industries` puede venir como lista de objetos {id, name} o de strings.
// También se acepta la forma anidada {name, industry:{name}} que usaba el Python.
function mapIndustrias(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const vistas = new Set<string>();
  for (const i of v) {
    const o = i as Crudo;
    const nombre = txt(typeof i === 'string' ? i : (o?.name ?? (o?.industry as Crudo)?.name ?? ''));
    const k = normalizarTexto(nombre);
    if (!nombre || vistas.has(k)) continue;
    vistas.add(k);
    out.push(nombre);
  }
  return out;
}

function mapDomicilio(c: Crudo): DomicilioCanonico | undefined {
  // `addressCountry` puede ser objeto {name} o string.
  const ac = c.addressCountry;
  const pais = txt(typeof ac === 'object' && ac !== null ? (ac as Crudo).name ?? '' : ac);
  const texto = primero(c, 'address', 'fullAddress', 'addressLine');
  if (!pais && !texto) return undefined;
  return { pais: pais || undefined, textoCompleto: texto || undefined };
}

function mapFacultades(c: Crudo): string[] {
  const out: string[] = [];
  const sa = c.signatureAuthorization;
  const sal = c.signatureAuthorizationLegalRepresentatives;
  for (const v of [sa, sal]) {
    if (Array.isArray(v)) { for (const x of v) { const s = txt(typeof x === 'object' && x ? (x as Crudo).name ?? JSON.stringify(x) : x); if (s) out.push(s); } }
    else { const s = txt(typeof v === 'object' && v ? (v as Crudo).name ?? '' : v); if (s) out.push(s); }
  }
  return out;
}

function mapRelaciones(rel: unknown[] | undefined): RelacionCanonica[] {
  return (rel ?? []).map(r => {
    const o = r as Crudo;
    return {
      nombre: primero(o, 'name', 'companyName', 'nombre') || undefined,
      documento: normalizarDocumento(primero(o, 'identificationNumber', 'docNumber')) || undefined,
      tipo: primero(o, 'relationshipType', 'type') || undefined,
      nivel: aNumero(o.level) ?? undefined,
      participacionPct: aNumero(o.participationPercentage ?? o.percentage),
    };
  }).filter(r => r.nombre || r.documento);
}

// ── Entrada principal ────────────────────────────────────────────────────────
// `detalle` es lo que devuelve getEmpresaDocsCompany (ya incluye `relaciones`
// desde el arreglo de Fase 0: antes esa promesa se pedía y se tiraba).
export function mapAdminALadoCanonico(detalle: EmpresaDocsDetail): LadoCanonico {
  const c = (detalle.adminRaw ?? {}) as Crudo;

  const representantes = dedupPersonas(
    (detalle.repLegales ?? []).map(p => mapPersona(p as Crudo, 'Representante legal'))
      .map(p => ({ ...p, esRepresentanteLegal: true })),
  );

  return {
    razonSocial: txt(c.name) || undefined,
    identificacionNumero: normalizarDocumento(c.identificationNumber) || undefined,
    identificacionTipo: txt(c.identificationType) || undefined,
    formaLegal: txt(c.legalForm) || undefined,

    fechaConstitucion: txt(c.constitutionDate) || undefined,
    numeroEscritura: txt(c.constitutionNumber) || undefined,
    // capitalSocial: Admin NO lo tiene. Se deja sin poblar a propósito para que
    // el comparador lo trate como fuente única y no como discrepancia.

    domicilio: mapDomicilio(c),
    paisTributario: txt(c.companyTaxCountry) || undefined,
    sitioWeb: txt(c.companyWebsite) || undefined,
    telefono: [txt(c.phoneCountryCode), txt(c.phoneNumber)].filter(Boolean).join(' ') || undefined,

    representantesLegales: representantes,
    accionistas: mapAccionistas(c.shareholders ?? detalle.benFinales),
    directorio: dedupPersonas((detalle.directorio ?? []).map(p => mapPersona(p as Crudo, 'Director'))),
    usuarios: dedupPersonas((detalle.personas ?? []).map(p => mapPersona(p as Crudo))),

    actividades: mapActividades(c),
    industrias: mapIndustrias(c.industries),

    administracionConjunta: typeof c.hasJointAdministration === 'boolean' ? c.hasJointAdministration : null,
    facultades: mapFacultades(c),

    facturacionAnualEstimada: monto(c.estimatedAnnualBillings),
    ingresoMensual: monto(c.monthlyIncome),
    egresoMensual: monto(c.monthlyExpenses),
    activosTotales: monto(c.totalAssets),
    pasivosTotales: monto(c.totalLiabilities),

    montosEnvio: txt(c.shipmentAmounts) || undefined,
    frecuenciaEnvio: txt(c.shipmentFrequency) || undefined,

    relaciones: mapRelaciones(detalle.relaciones),
  };
}

// Foto del estado de compliance en Admin. Es contexto para los frenos duros, no
// entra en la matriz.
export function mapEstadoAdmin(companyId: string, detalle: EmpresaDocsDetail): EstadoAdminEmpresa {
  const c = (detalle.adminRaw ?? {}) as Crudo;
  return {
    companyId,
    complianceStatus: txt(c.complianceStatus) || undefined,
    complianceStatusComment: txt(c.complianceStatusComment) || undefined,
    kycStage1: txt(c.kycStage1) || undefined,
    kycStage2: txt(c.kycStage2) || undefined,
    kycStage3: txt(c.kycStage3) || undefined,
    riskLevel: txt(c.riskLevel) || undefined,
    riskLevelRegcheq: txt(c.riskLevelRegcheq) || undefined,
    institucional: typeof c.institutional === 'boolean' ? c.institutional : null,
    segmentacion: txt(c.segmentationType) || undefined,
    proposito: txt(c.purposeUse) || txt(c.purposeUsePlatform) || undefined,
    crs: c.crs,
    fatca: c.fatca,
    creadoEn: txt(c.createAt) || txt(c.recordCreatedAt) || undefined,
  };
}
