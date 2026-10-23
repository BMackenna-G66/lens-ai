// Listas negras de Compliance de Admin G66 (DNI, dominios de correo y cuentas
// bancarias): la lógica de `blacklist_cargar.py` y `blacklist_editar.py` de
// Benjamín, portada TAL CUAL a funciones puras. Las llamadas a Admin pasan por
// el Worker (`services/listasNegrasApi.ts`); acá no hay red.
//
// Dos cambios respecto de los scripts, los dos para que la vista previa diga lo
// mismo que después hace la ejecución:
//   · Cargar: un registro repetido dentro del mismo archivo se omite como
//     YA_EXISTE_ACTIVO también en la vista previa. El script, en DRY_RUN, lo
//     anotaba como YA_EXISTE_INACTIVO (guardaba un `{}` en el índice) y en la
//     corrida real como ACTIVO.
//   · Editar: después de editar un registro, la fila siguiente que lo nombra se
//     compara contra el estado nuevo. El script comparaba siempre contra la
//     lista del principio y mandaba un PUT repetido.

export type Lista = 'DNI' | 'DOMINIO' | 'CUENTA';
export type Modo = 'cargar' | 'editar';
export type Fila = Record<string, string>;
export type RegistroAdmin = Record<string, unknown>;

/** El tramo de la ruta del Worker para cada lista. */
export const RUTA_LISTA: Record<Lista, string> = { DNI: 'dni', DOMINIO: 'dominio', CUENTA: 'cuenta' };

/** Los endpoints de Admin, para el log (los mismos del README). */
export const ENDPOINTS: Record<Lista, string> = {
  DNI: '/beneficiary/compliance/blacklist',
  DOMINIO: '/admin/blacklist/domain',
  CUENTA: '/beneficiary/admin/bank-account/black-list',
};

/** Catálogo de tipos de cuenta (doc Admin G66). */
export const ACCOUNT_TYPES_ALL = ['Checking', 'Saving', 'Blockchain'];
export const ACCOUNT_TYPES_BY_COUNTRY: Record<string, string[]> = {
  CO: ['Electronic'],
  CL: ['Vista', 'RUT'],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export function parseBool(value: unknown, porDefecto: boolean): boolean {
  if (value === null || value === undefined || String(value).trim() === '') return porDefecto;
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 's', 'activo', 'yes', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'n', 'inactivo'].includes(v)) return false;
  throw new Error(`Valor booleano no reconocido: ${value}`);
}

/** Los GET pueden devolver la lista directa o envuelta (data/content/items/...). */
export function extractList(result: unknown): RegistroAdmin[] {
  if (Array.isArray(result)) return result as RegistroAdmin[];
  if (result && typeof result === 'object') {
    for (const key of ['data', 'content', 'items', 'results', 'list', 'blacklist']) {
      const val = (result as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as RegistroAdmin[];
      if (val && typeof val === 'object') {
        const inner = extractList(val);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

export function normDomain(value: unknown): string {
  let v = String(value ?? '').trim().toLowerCase();
  if (v.includes('@')) v = v.split('@').at(-1) ?? '';   // un correo completo → su dominio
  return v.replace(/^[. ]+|[. ]+$/g, '');
}

export function normAccount(value: unknown): string {
  return String(value ?? '').split(/\s+/).join('').toUpperCase();
}

const txt = (v: unknown): string => String(v ?? '').trim();
const up = (v: unknown): string => txt(v).toUpperCase();

export const estadoTxt = (v: unknown): 'ACTIVO' | 'INACTIVO' => (v ? 'ACTIVO' : 'INACTIVO');

/** `{ISO2: nombre}` desde GET /route/country/enabled. Tolerante al formato. */
export function loadCountries(result: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const lista = extractList(result).length ? extractList(result) : (Array.isArray(result) ? result : []);
  for (const c of lista) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const code = r.countryCode || r.code || r.isoCode || r.iso2 || r.alpha2;
    const name = r.countryName || r.name || r.nameEs || r.description;
    if (code && name) out[up(code)] = String(name);
  }
  return out;
}

// ── Cargar (POST) ───────────────────────────────────────────────────────────

export interface Alta { body: Record<string, unknown>; key: string; label: string }

const k = (...partes: string[]) => partes.join('|');

/** `build_body` del script: el body del POST, la llave de duplicado y la etiqueta. */
export function buildBody(lista: Lista, row: Fila, countries: Record<string, string>, defaultReason: string): Alta {
  const reason = txt(row.reason || defaultReason);
  if (!reason) throw new Error('Falta reason (y la razón por defecto está vacía).');

  if (lista === 'DNI') {
    const dni = txt(row.dni);
    const cc = up(row.country_code);
    if (!dni || !cc) throw new Error('DNI requiere dni y country_code.');
    const name = txt(row.country_name || countries[cc] || '');
    if (!name) throw new Error(`No se encontró countryName para ${cc}; agrega columna country_name.`);
    return { body: { dni, countryCode: cc, countryName: name, reason }, key: k(dni.toUpperCase(), cc), label: `${dni} (${cc})` };
  }

  if (lista === 'DOMINIO') {
    const domain = normDomain(row.domain || row.email || '');
    if (!domain || !domain.includes('.')) throw new Error(`Dominio inválido: '${domain}'`);
    return { body: { email: domain, reason }, key: k(domain), label: domain };   // el backend llama 'email' al dominio
  }

  // CUENTA
  const acc = normAccount(row.account_number);
  if (!acc) throw new Error('CUENTA requiere account_number.');
  const cc = up(row.country_code);
  const accType = txt(row.account_type);
  if (accType) {
    const allowed = [...ACCOUNT_TYPES_ALL, ...(ACCOUNT_TYPES_BY_COUNTRY[cc] ?? [])];
    if (!allowed.includes(accType)) {
      throw new Error(`account_type '${accType}' no válido para país ${cc || '(vacío)'}. Permitidos: ${[...allowed].sort().join(', ')}`);
    }
  }
  return {
    body: { countryCode: cc || null, accountNumber: acc, accountType: accType || null,
            enable: parseBool(row.enable, true), reason },
    key: k(acc, cc), label: `${acc} (${cc || '-'})`,
  };
}

/** `index_existing`: llave → registro, con la misma llave que `buildBody`. */
export function indexExisting(lista: Lista, records: RegistroAdmin[]): Map<string, RegistroAdmin> {
  const idx = new Map<string, RegistroAdmin>();
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const key = lista === 'DNI' ? k(up(r.dni), up(r.countryCode))
      : lista === 'DOMINIO' ? k(normDomain(r.domain))
      : k(normAccount(r.accountNumber), up(r.countryCode));
    idx.set(key, r);
  }
  return idx;
}

export function isActive(lista: Lista, record: RegistroAdmin): boolean {
  return Boolean(lista === 'CUENTA' ? record.enable : record.blacklistStatus);
}

/** `find_existing`. En cuentas, un registro histórico sin país es duplicado del mismo número. */
export function findExisting(lista: Lista, idx: Map<string, RegistroAdmin>, key: string): RegistroAdmin | null {
  if (idx.has(key)) return idx.get(key)!;
  if (lista === 'CUENTA') {
    const [acc, cc] = key.split('|');
    for (const [k2, r] of idx) {
      const [acc2, cc2] = k2.split('|');
      if (acc2 === acc && (!cc2 || !cc)) return r;
    }
  }
  return null;
}

// ── Editar (PUT) ────────────────────────────────────────────────────────────

/** `find_record`: el registro actual, o un error si no existe o es ambiguo. */
export function findRecord(lista: Lista, row: Fila, records: RegistroAdmin[]): { rec: RegistroAdmin; label: string } {
  let hits: RegistroAdmin[];
  let label: string;
  if (lista === 'DNI') {
    const dni = up(row.dni);
    const cc = up(row.country_code);
    if (!dni || !cc) throw new Error('DNI requiere dni y country_code.');
    label = `${dni} (${cc})`;
    hits = records.filter(r => up(r.dni) === dni && up(r.countryCode) === cc);
  } else if (lista === 'DOMINIO') {
    const rid = txt(row.id);
    const domain = normDomain(row.domain || row.email || '');
    if (!rid && !domain) throw new Error('DOMINIO requiere domain o id.');
    label = domain || `id ${rid}`;
    hits = rid ? records.filter(r => String(r.id) === rid) : records.filter(r => normDomain(r.domain) === domain);
  } else {
    const rid = txt(row.id);
    const acc = normAccount(row.account_number);
    const cc = up(row.country_code);
    if (!rid && !acc) throw new Error('CUENTA requiere account_number o id.');
    label = `${acc || `id ${rid}`} (${cc || '-'})`;
    if (rid) {
      hits = records.filter(r => String(r.id) === rid);
    } else {
      hits = records.filter(r => normAccount(r.accountNumber) === acc);
      if (cc && hits.length > 1) {
        const conPais = hits.filter(r => up(r.countryCode) === cc);
        hits = conPais.length ? conPais : hits;
      }
    }
  }
  if (!hits.length) throw new Error('No existe en la lista negra.');
  if (hits.length > 1) {
    throw new Error(`Coincidencia ambigua (${hits.length} registros, ids=[${hits.map(h => h.id).join(', ')}]). Usa la columna id.`);
  }
  return { rec: hits[0], label };
}

export interface Edicion { body: Record<string, unknown>; old: boolean; nuevo: boolean; changed: boolean }

/** `build_put`: el body del PUT, estado anterior y nuevo, y si hay cambio. */
export function buildPut(lista: Lista, row: Fila, rec: RegistroAdmin, targetStatus: boolean, defaultReason: string): Edicion {
  const nuevo = parseBool(row.status, targetStatus);
  const newReason = txt(row.reason || defaultReason);

  if (lista === 'DNI') {
    const old = Boolean(rec.blacklistStatus);
    return { body: { dni: rec.dni, countryCode: rec.countryCode, status: nuevo }, old, nuevo, changed: old !== nuevo };
  }

  if (lista === 'DOMINIO') {
    const old = Boolean(rec.blacklistStatus);
    const reason = newReason || txt(rec.reason);
    if (!reason) throw new Error('DOMINIO exige reason en el PUT y el registro no tiene una; agrega reason.');
    return { body: { id: rec.id, status: nuevo, reason }, old, nuevo,
             changed: old !== nuevo || reason !== txt(rec.reason) };
  }

  // CUENTA: objeto completo con id (mismos campos que envía el modal del Admin)
  const old = Boolean(rec.enable);
  const cc = up(row.country_code || rec.countryCode || '') || null;
  const accType = txt(row.account_type || rec.accountType || '') || null;
  if (accType) {
    const allowed = [...ACCOUNT_TYPES_ALL, ...(ACCOUNT_TYPES_BY_COUNTRY[cc ?? ''] ?? [])];
    if (!allowed.includes(accType)) {
      throw new Error(`account_type '${accType}' no válido para país ${cc || '(vacío)'}. Permitidos: ${[...allowed].sort().join(', ')}`);
    }
  }
  const body = { id: rec.id, countryCode: cc, accountNumber: rec.accountNumber, accountType: accType,
                 enable: nuevo, reason: newReason || rec.reason };
  const changed = old !== nuevo
    || body.reason !== rec.reason
    || (body.countryCode || null) !== (rec.countryCode || null)
    || (body.accountType || null) !== (rec.accountType || null);
  return { body, old, nuevo, changed };
}

// ── El plan: lo que haría cada fila (la vista previa = DRY_RUN) ─────────────

export type Accion = 'crear' | 'editar' | 'omitir' | 'sin_cambios' | 'error';

export interface PasoPlan {
  n: number;                 // número de fila (1..)
  fila: Fila;
  registro: string;          // etiqueta legible, como el log del script
  accion: Accion;
  resultado: string;         // DRY_RUN | YA_EXISTE_ACTIVO | YA_EXISTE_INACTIVO | N/A | ERROR
  body?: Record<string, unknown>;
  estadoAnterior?: 'ACTIVO' | 'INACTIVO';
  estadoNuevo?: 'ACTIVO' | 'INACTIVO';
  detalle: string;
  error?: string;
  // Lo que el registro de Lens necesita de la fila.
  valor?: string;
  countryCode?: string;
  accountType?: string | null;
  adminId?: string | null;
  reasonAnterior?: string | null;
  repetida?: boolean;
}

export interface OpcionesPlan {
  defaultReason: string;
  targetStatus: boolean;     // solo editar
  countries: Record<string, string>;
}

/** El plan de una corrida, fila por fila, sin tocar nada. */
export function planificar(modo: Modo, lista: Lista, rows: Fila[], records: RegistroAdmin[], op: OpcionesPlan): PasoPlan[] {
  return modo === 'cargar' ? planCargar(lista, rows, records, op) : planEditar(lista, rows, records, op);
}

function planCargar(lista: Lista, rows: Fila[], records: RegistroAdmin[], op: OpcionesPlan): PasoPlan[] {
  const idx = indexExisting(lista, records);
  const repetidas = new Set<string>();
  return rows.map((row, i) => {
    const n = i + 1;
    let alta: Alta;
    try {
      alta = buildBody(lista, row, op.countries, op.defaultReason);
    } catch (e) {
      return { n, fila: row, registro: JSON.stringify(row), accion: 'error', resultado: 'ERROR', detalle: '',
               error: e instanceof Error ? e.message : String(e) };
    }
    const datos = datosDeAlta(lista, alta);
    const existe = findExisting(lista, idx, alta.key);
    if (existe) {
      const estado = estadoTxt(isActive(lista, existe));
      const repetida = repetidas.has(alta.key);
      let msg = repetida ? 'Repetido más arriba en el mismo archivo.' : `Ya existe en lista negra (${estado}).`;
      if (!repetida && estado === 'INACTIVO') msg += ' Para reactivarlo usar el modo Editar.';
      return { n, fila: row, registro: alta.label, accion: 'omitir', resultado: `YA_EXISTE_${estado}`, detalle: msg,
               estadoAnterior: estado, repetida, adminId: existe.id != null ? String(existe.id) : null, ...datos };
    }
    // Evita duplicados dentro del mismo archivo: queda como recién creado.
    idx.set(alta.key, { enable: true, blacklistStatus: true });
    repetidas.add(alta.key);
    return { n, fila: row, registro: alta.label, accion: 'crear', resultado: 'DRY_RUN', body: alta.body,
             detalle: JSON.stringify(alta.body), ...datos };
  });
}

function datosDeAlta(lista: Lista, alta: Alta) {
  const b = alta.body;
  return {
    valor: lista === 'DNI' ? String(b.dni) : lista === 'DOMINIO' ? String(b.email) : String(b.accountNumber),
    countryCode: String(b.countryCode ?? ''),
    accountType: (b.accountType as string | null | undefined) ?? null,
  };
}

function planEditar(lista: Lista, rows: Fila[], records: RegistroAdmin[], op: OpcionesPlan): PasoPlan[] {
  // Una copia: lo que se edita en el plan no toca la lista que se muestra.
  const vivos = records.filter(r => r && typeof r === 'object').map(r => ({ ...r }));
  return rows.map((row, i) => {
    const n = i + 1;
    try {
      const { rec, label } = findRecord(lista, row, vivos);
      const { body, old, nuevo, changed } = buildPut(lista, row, rec, op.targetStatus, op.defaultReason);
      const datos = {
        valor: lista === 'DNI' ? up(rec.dni) : lista === 'DOMINIO' ? normDomain(rec.domain) : normAccount(rec.accountNumber),
        countryCode: up(lista === 'CUENTA' ? (body.countryCode ?? rec.countryCode) : rec.countryCode),
        accountType: lista === 'CUENTA' ? (body.accountType as string | null) : null,
        adminId: rec.id != null ? String(rec.id) : null,
        reasonAnterior: rec.reason != null ? String(rec.reason) : null,
        estadoAnterior: estadoTxt(old), estadoNuevo: estadoTxt(nuevo),
      };
      if (!changed) {
        return { n, fila: row, registro: label, accion: 'sin_cambios', resultado: 'N/A', ...datos,
                 detalle: `Sin cambios: ya está ${estadoTxt(old)}` };
      }
      // La fila siguiente que nombre este registro se compara contra el estado nuevo.
      Object.assign(rec, lista === 'CUENTA'
        ? { enable: nuevo, reason: body.reason, countryCode: body.countryCode, accountType: body.accountType }
        : { blacklistStatus: nuevo, ...(lista === 'DOMINIO' ? { reason: body.reason } : {}) });
      return { n, fila: row, registro: label, accion: 'editar', resultado: 'DRY_RUN', body, ...datos,
               detalle: JSON.stringify(body) };
    } catch (e) {
      return { n, fila: row, registro: JSON.stringify(row), accion: 'error', resultado: 'ERROR', detalle: '',
               error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export interface Conteos { total: number; crear: number; editar: number; omitir: number; sin_cambios: number; error: number }

export function contar(plan: PasoPlan[]): Conteos {
  const c: Conteos = { total: plan.length, crear: 0, editar: 0, omitir: 0, sin_cambios: 0, error: 0 };
  for (const p of plan) c[p.accion]++;
  return c;
}

/** ¿Dos planes hacen lo mismo? Para no ejecutar uno distinto del que se confirmó. */
export function mismoPlan(a: PasoPlan[], b: PasoPlan[]): boolean {
  return a.length === b.length && a.every((p, i) =>
    p.accion === b[i].accion && JSON.stringify(p.body ?? null) === JSON.stringify(b[i].body ?? null));
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** Separa una línea respetando comillas. */
function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (comillas) {
      if (ch === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
      else if (ch === '"') comillas = false;
      else actual += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { out.push(actual); actual = ''; }
    else actual += ch;
  }
  out.push(actual);
  return out;
}

/**
 * Las filas de un CSV, o de filas pegadas con encabezado. Como `csv.DictReader`
 * con `utf-8-sig` de los scripts: encabezados en minúsculas y sin espacios,
 * BOM ignorado, columnas extra ignoradas. Además acepta `;` y tabulación como
 * separador —Excel en español exporta con `;`, y pegar desde Excel trae
 * tabulaciones—: se elige el que aparece en el encabezado.
 */
export function parseCsv(texto: string): Fila[] {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lineas = limpio.split('\n').filter(l => l.trim() !== '');
  if (!lineas.length) return [];
  const cab = lineas[0];
  const sep = cab.includes('\t') ? '\t' : (cab.includes(';') && !cab.includes(',')) ? ';' : ',';
  const claves = partirLinea(cab, sep).map(c => c.trim().toLowerCase());
  return lineas.slice(1).map(l => {
    const valores = partirLinea(l, sep);
    const fila: Fila = {};
    claves.forEach((c, i) => { if (c) fila[c] = (valores[i] ?? '').trim(); });
    return fila;
  });
}

/** Las columnas de cada modo, para la ayuda de la pantalla (README, §3). */
export const COLUMNAS: Record<Modo, Record<Lista, string>> = {
  cargar: {
    DNI: 'dni, country_code, reason, country_name',
    DOMINIO: 'domain, reason',
    CUENTA: 'country_code, account_number, account_type, reason, enable',
  },
  editar: {
    DNI: 'dni, country_code, status',
    DOMINIO: 'domain o id, status, reason',
    CUENTA: 'account_number o id, country_code, status, reason, account_type',
  },
};

// ── El log, con las columnas de los scripts ─────────────────────────────────

export const CSV_HEADERS: Record<Modo, string[]> = {
  cargar: ['timestamp', 'lista', 'registro', 'paso', 'accion', 'status_http', 'resultado', 'detalle', 'error'],
  editar: ['timestamp', 'lista', 'registro', 'paso', 'accion', 'status_http', 'resultado', 'estado_anterior',
           'estado_nuevo', 'detalle', 'error'],
};

export type FilaLog = Record<string, string | number>;

export function ahoraLog(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Las filas de log de un paso, como las escribía el script (dry run o real). */
export function filasLog(modo: Modo, lista: Lista, p: PasoPlan,
                         real?: { status?: number; ok: boolean; respuesta?: unknown; error?: string }): FilaLog[] {
  const base = { timestamp: ahoraLog(), lista, registro: p.registro };
  const ep = ENDPOINTS[lista];
  if (p.accion === 'error') {
    return [{ ...base, paso: 'ERROR', accion: modo === 'cargar' ? `CREAR_${lista}` : `EDITAR_${lista}`,
              resultado: 'ERROR', error: p.error ?? '' }];
  }
  if (modo === 'cargar') {
    if (p.accion === 'omitir') return [{ ...base, paso: '1 - VALIDACION', accion: 'OMITIDO', resultado: p.resultado, detalle: p.detalle }];
    if (!real) return [{ ...base, paso: '2 - CREATE', accion: `DRY_RUN POST ${ep}`, resultado: 'DRY_RUN', detalle: p.detalle }];
    return [real.ok
      ? { ...base, paso: '2 - CREATE', accion: `POST ${ep}`, status_http: real.status ?? '', resultado: 'OK',
          detalle: JSON.stringify({ body: p.body, respuesta: real.respuesta ?? null }) }
      : { ...base, paso: 'ERROR', accion: `CREAR_${lista}`, status_http: real.status ?? '', resultado: 'ERROR', error: real.error ?? '' }];
  }
  const estados = { estado_anterior: p.estadoAnterior ?? '', estado_nuevo: p.estadoNuevo ?? '' };
  const lookup: FilaLog = { ...base, paso: '1 - LOOKUP', accion: `GET ${ep}`, resultado: 'OK', estado_anterior: p.estadoAnterior ?? '' };
  if (p.accion === 'sin_cambios') {
    return [lookup, { ...base, paso: '2 - UPDATE', accion: 'OMITIDO', resultado: 'N/A', ...estados, detalle: p.detalle }];
  }
  if (!real) return [lookup, { ...base, paso: '2 - UPDATE', accion: `DRY_RUN PUT ${ep}`, resultado: 'DRY_RUN', ...estados, detalle: p.detalle }];
  return [lookup, real.ok
    ? { ...base, paso: '2 - UPDATE', accion: `PUT ${ep}`, status_http: real.status ?? '', resultado: 'OK', ...estados,
        detalle: JSON.stringify({ body: p.body, respuesta: real.respuesta ?? null }) }
    : { ...base, paso: 'ERROR', accion: `EDITAR_${lista}`, status_http: real.status ?? '', resultado: 'ERROR', error: real.error ?? '' }];
}

const celda = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function csvLog(modo: Modo, filas: FilaLog[]): string {
  const cab = CSV_HEADERS[modo];
  return [cab.join(','), ...filas.map(f => cab.map(c => celda(f[c])).join(','))].join('\r\n') + '\r\n';
}

/** El resultado para el registro de Lens de una fila que no llegó a Admin. */
export function resultadoSinOperacion(p: PasoPlan): string | null {
  if (p.accion === 'omitir') return p.resultado === 'YA_EXISTE_ACTIVO' ? 'OMITIDO_YA_EXISTE_ACTIVO' : 'OMITIDO_YA_EXISTE_INACTIVO';
  if (p.accion === 'sin_cambios') return 'SIN_CAMBIOS';
  if (p.accion === 'error') return 'ERROR';
  return null;
}
