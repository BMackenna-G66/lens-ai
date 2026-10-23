// /admin/listas-negras/* — alta y edición de las listas negras de Compliance de
// Admin G66 (DNI, dominios de correo y cuentas bancarias), para el módulo
// «Listas negras» de Regcheq. Porta lo que hacen `blacklist_cargar.py` y
// `blacklist_editar.py` de Benjamín: el navegador arma cada fila y el Worker la
// manda a Admin con el refresh token de siempre (`G66_ADMIN_REFRESH_TOKEN`).
//
// ── Por qué este módulo autentica, y el resto del Worker no ────────────────
// Estas rutas ESCRIBEN listas negras de producción. Igual que /pjud/*, se exige
// el ID token de Firebase de Lens, verificado entero (`verificarIdToken`), y
// además que el usuario tenga el módulo `listasNegras` en su perfil de Lens:
// sin eso, cualquier cuenta @global66.com con sesión en Lens podría llamar al
// Worker directo y saltarse el permiso de la pantalla. El perfil se lee de
// Firestore con el token del propio analista; si no se puede leer, se niega.
//
// ── Solo tres listas, y solo sus cuerpos ───────────────────────────────────
// No hay passthrough de rutas: `{lista}` es una de tres y cada método tiene su
// lista cerrada de campos, los mismos que mandan los scripts. Un campo de más
// es un 400.
//
// ── El idToken de Admin, en caché ──────────────────────────────────────────
// Una carga de cientos de filas haría un refresh por fila, y una ráfaga al
// refresh-token devuelve 403 —y tumba los cierres de la Bandeja, que comparten
// el token—. Se guarda en el isolate hasta su `exp` menos un margen, con un
// solo refresh en vuelo a la vez, y se renueva una vez ante un 401.
//
// ── Reintentos ─────────────────────────────────────────────────────────────
// Ante 429 se espera y se reintenta siempre. Ante 5xx, solo GET y PUT: un PUT
// fija un estado y repetirlo da lo mismo, pero un POST que falló con 5xx puede
// haber creado el registro igual, y repetirlo lo duplicaría. Ese error vuelve
// al navegador: la próxima vista previa lo muestra como «ya existe».
//
// ── El registro de cada cambio (Redshift `listas_negras`) ──────────────────
// En Admin todo figura con el dueño del refresh token. Lens deja su propio
// registro, y lo deja ACÁ, del lado del servidor: el navegador no lo puede
// saltear ni elegir quién fue.
//   1. Antes de llamar a Admin, el evento se escribe en el registro durable
//      (Lambda `lens-listas-negras-log` → DynamoDB). Si no se puede, NO se
//      llama a Admin: falla cerrada.
//   2. Después, el resultado. Si eso falla, el intento queda y el Lambda lo
//      espeja como SIN_CONFIRMAR.
// El actor sale del ID token verificado; el flujo y el servicio, de la ruta.
// Lo que el navegador manda en `meta` (estado anterior, razón anterior, el
// dominio de una edición) es informativo y tiene su propia lista cerrada.
//
// ── Los logs ───────────────────────────────────────────────────────────────
// Sin DNI, cuentas ni dominios: método, lista y status, nada más.

import { verificarIdToken } from './pjud';
import { extractList, loadCountries } from '../../../services/listasNegras';
import {
  claveDni, decidirDni, esBloqueadoOfac, FLUJOS_BLOQUEADO, MOTIVO_BLOQUEADO, resultadoColas, TIPOLOGIA_BLOQUEADO,
  type DecisionDni, type EntradaListaNegraDni, type OrigenBloqueado, type RegistroDni, type ResultadoColas,
} from '../../../services/listaNegraDni';

export interface EnvListasNegras {
  G66_ADMIN_REFRESH_TOKEN?: string;
  FIREBASE_PROJECT_ID?: string;
  // Function URL de lens-listas-negras-log y su secreto. El navegador no los ve.
  LISTAS_LOG_URL?: string;
  LISTAS_LOG_SECRET?: string;
  // El logger de colas (colas_trabajo): la fila de `lista_negra_dni` la escribe
  // el Worker, con el actor verificado.
  COLAS_LOGGER_URL?: string;
  COLAS_LOGGER_SECRET?: string;
  // Lo manda el Lambda del flujo automático en `x-lens-sistema`: es su actor.
  // Sin él vale el secreto que el Lambda y el Worker ya comparten para
  // /flujo/correr (`TRIGGER_SECRET` allá): así el deploy del Lambda sigue siendo
  // solo de código, sin reescribir sus variables. Separarlos después es poner
  // este secreto aquí y `LISTA_NEGRA_SISTEMA_SECRET` en el Lambda.
  LISTA_NEGRA_SISTEMA_SECRET?: string;
  FLUJO_TRIGGER_SECRET?: string;
}

type FetchTimeout = (u: string, i: RequestInit, ms: number) => Promise<Response>;

const BASE = 'https://api.global66.com';
const PROYECTO_DEFAULT = 'lens-ai-9da63';
const PREFIJO = '/admin/listas-negras/';

/** Las tres listas de Admin G66, menú Compliance. */
const RUTAS: Record<string, string> = {
  dni: '/beneficiary/compliance/blacklist',
  dominio: '/admin/blacklist/domain',
  cuenta: '/beneficiary/admin/bank-account/black-list',
};
const RUTA_PAISES = '/route/country/enabled';

/** Los campos que manda cada script, por lista y método (README, §1). */
const CAMPOS: Record<string, { POST: string[]; PUT: string[] }> = {
  dni: { POST: ['dni', 'countryCode', 'countryName', 'reason'], PUT: ['dni', 'countryCode', 'status'] },
  dominio: { POST: ['email', 'reason'], PUT: ['id', 'status', 'reason'] },
  cuenta: {
    POST: ['countryCode', 'accountNumber', 'accountType', 'enable', 'reason'],
    PUT: ['id', 'countryCode', 'accountNumber', 'accountType', 'enable', 'reason'],
  },
};

/** Lo informativo que manda el navegador con cada escritura. */
const CAMPOS_META = ['ejecucionId', 'estadoAnterior', 'reasonAnterior', 'valor'];
/** Una fila que no llegó a Admin (omitida, sin cambios o con error de validación). */
const CAMPOS_SIN_OPERACION = ['valor', 'countryCode', 'accountType', 'adminId', 'resultado', 'estadoAnterior',
  'estadoNuevo', 'reason', 'error'];
const RESULTADOS_SIN_OPERACION = ['OMITIDO_YA_EXISTE_ACTIVO', 'OMITIDO_YA_EXISTE_INACTIVO', 'SIN_CAMBIOS', 'ERROR'];
const FLUJO: Record<string, string> = {
  POST: 'lens.regcheq.listas_negras.carga', PUT: 'lens.regcheq.listas_negras.edicion',
  carga: 'lens.regcheq.listas_negras.carga', edicion: 'lens.regcheq.listas_negras.edicion',
};
const EJECUCION = /^[A-Za-z0-9_.:-]{1,64}$/;

const MAX_CUERPO = 4096;
const MAX_CUERPO_LOTE = 256 * 1024;
const MARGEN_TOKEN_MS = 5 * 60 * 1000;
const PERMISO_MS = 60 * 1000;
const ESPERAS_MS = [500, 1000, 2000];

export const esRutaListasNegras = (path: string): boolean => path.startsWith(PREFIJO);

// ── Estado del isolate ──────────────────────────────────────────────────────
let tokenAdmin: { token: string; vence: number } | null = null;
let refrescando: Promise<string> | null = null;
const permisos = new Map<string, { ok: boolean; lider: boolean; vence: number }>();
let dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
// La lista de DNI y el catálogo de países, para el paso 6 y los históricos.
let cacheDni: { recs: RegistroDni[]; vence: number } | null = null;
let cachePaises: { mapa: Record<string, string>; vence: number } | null = null;
let esperaPaso6Ms = 12_000;

/** Solo para los tests. */
export function _reiniciarListasNegras(opciones: { sinEsperas?: boolean; esperaPaso6Ms?: number } = {}): void {
  tokenAdmin = null;
  refrescando = null;
  permisos.clear();
  cacheDni = null;
  cachePaises = null;
  esperaPaso6Ms = opciones.esperaPaso6Ms ?? 12_000;
  dormir = opciones.sinEsperas ? async () => {} : (ms: number) => new Promise<void>(r => setTimeout(r, ms));
}

const responder = (cuerpo: unknown, status: number, cors: Record<string, string>): Response =>
  new Response(JSON.stringify(cuerpo), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** El `exp` de un JWT, en ms; 0 si no se puede leer. No valida la firma: es el token de Admin. */
function expDe(jwt: string): number {
  try {
    const p = jwt.split('.')[1] ?? '';
    const b = p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4);
    const exp = Number((JSON.parse(atob(b)) as { exp?: unknown }).exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}

class ErrorAdmin extends Error {
  constructor(public status: number, mensaje: string) { super(mensaje); }
}

async function idTokenAdmin(env: EnvListasNegras, fetchTimeout: FetchTimeout, forzar = false): Promise<string> {
  if (!forzar && tokenAdmin && Date.now() < tokenAdmin.vence) return tokenAdmin.token;
  if (refrescando) return refrescando;
  const refresh = env.G66_ADMIN_REFRESH_TOKEN;
  if (!refresh) throw new ErrorAdmin(500, 'Falta el secret G66_ADMIN_REFRESH_TOKEN en el Worker');
  refrescando = (async () => {
    // Form-urlencoded, igual que los scripts y que /admin/customer-status.
    const r = await fetchTimeout(`${BASE}/admin/refresh-token`, {
      method: 'POST',
      headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refreshToken: refresh }).toString(),
    }, 20000);
    const texto = await r.text();
    if (!r.ok) throw new ErrorAdmin(502, `refresh-token de admin falló (HTTP ${r.status})`);
    let token = '';
    try { token = (JSON.parse(texto) as { idToken?: string }).idToken || ''; } catch { /* sin token */ }
    if (!token) throw new ErrorAdmin(502, 'admin no devolvió idToken');
    const exp = expDe(token);
    // Sin `exp` legible, 30 minutos: los idToken de Admin duran una hora.
    tokenAdmin = { token, vence: (exp || Date.now() + 35 * 60 * 1000) - MARGEN_TOKEN_MS };
    return token;
  })();
  try { return await refrescando; } finally { refrescando = null; }
}

async function llamarAdmin(
  env: EnvListasNegras, fetchTimeout: FetchTimeout, metodo: string, ruta: string, cuerpo?: string,
): Promise<{ status: number; datos: unknown }> {
  let renovado = false;
  for (let intento = 0; ; intento++) {
    const token = await idTokenAdmin(env, fetchTimeout);
    const r = await fetchTimeout(`${BASE}${ruta}`, {
      method: metodo,
      headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Authorization': token },
      ...(cuerpo !== undefined ? { body: cuerpo } : {}),
    }, 30000);
    if (r.status === 401 && !renovado) {
      renovado = true;
      tokenAdmin = null;
      await idTokenAdmin(env, fetchTimeout, true);
      intento--;
      continue;
    }
    const reintentable = r.status === 429 || (r.status >= 500 && metodo !== 'POST');
    if (reintentable && intento < ESPERAS_MS.length) {
      await dormir(ESPERAS_MS[intento]);
      continue;
    }
    const texto = await r.text();
    let datos: unknown;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { raw: texto.slice(0, 2000) }; }
    return { status: r.status, datos };
  }
}

/**
 * ¿El usuario tiene el módulo? Se lee `users/{uid}` de Firestore con SU token:
 * Líder siempre; si no, `modules.listasNegras === true`. Ausente = no. Un
 * usuario desactivado, no. Se guarda un minuto por usuario.
 */
async function tienePermiso(uid: string, idToken: string, proyecto: string,
                            fetchTimeout: FetchTimeout): Promise<{ ok: boolean; lider: boolean }> {
  const guardado = permisos.get(uid);
  if (guardado && Date.now() < guardado.vence) return guardado;
  const url = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const r = await fetchTimeout(url, { headers: { Authorization: `Bearer ${idToken}` } }, 10000);
  if (r.status === 404) {
    const no = { ok: false, lider: false, vence: Date.now() + PERMISO_MS };
    permisos.set(uid, no);
    return no;
  }
  if (!r.ok) throw new Error(`perfil HTTP ${r.status}`);
  const doc = await r.json() as { fields?: Record<string, { stringValue?: string; booleanValue?: boolean;
    mapValue?: { fields?: Record<string, { booleanValue?: boolean }> } }> };
  const f = doc.fields ?? {};
  const activo = f.disabled?.booleanValue !== true;
  const lider = activo && f.role?.stringValue === 'Lider';
  const ok = lider || (activo && f.modules?.mapValue?.fields?.listasNegras?.booleanValue === true);
  const p = { ok, lider, vence: Date.now() + PERMISO_MS };
  permisos.set(uid, p);
  return p;
}

type Plano = Record<string, string | number | boolean | null>;

/** Un objeto con solo esos campos y valores planos. */
function objetoPlano(obj: unknown, permitidos: string[], que: string): Plano | string {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return `${que}: se espera un objeto`;
  const sobran = Object.keys(obj).filter(k => !permitidos.includes(k));
  if (sobran.length) return `${que}: campos no admitidos: ${sobran.join(', ')}`;
  for (const v of Object.values(obj)) {
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) return `${que}: valores no admitidos`;
  }
  return obj as Plano;
}

/** El cuerpo de un POST o PUT: `{ registro, meta }`. `registro` va tal cual a
 *  Admin, con solo los campos de esa lista y método; `meta` es para el registro. */
function cuerpoValido(texto: string, permitidos: string[]):
    { ok: true; registro: Plano; meta: Plano } | { ok: false; motivo: string } {
  if (texto.length > MAX_CUERPO) return { ok: false, motivo: 'cuerpo demasiado grande' };
  let obj: unknown;
  try { obj = JSON.parse(texto); } catch { return { ok: false, motivo: 'body JSON inválido' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, motivo: 'se espera { registro, meta }' };
  const sobran = Object.keys(obj).filter(k => k !== 'registro' && k !== 'meta');
  if (sobran.length) return { ok: false, motivo: `campos no admitidos: ${sobran.join(', ')}` };
  const o = obj as { registro?: unknown; meta?: unknown };
  const registro = objetoPlano(o.registro, permitidos, 'registro');
  if (typeof registro === 'string') return { ok: false, motivo: registro };
  const meta = objetoPlano(o.meta ?? {}, CAMPOS_META, 'meta');
  if (typeof meta === 'string') return { ok: false, motivo: meta };
  if (!EJECUCION.test(String(meta.ejecucionId ?? ''))) return { ok: false, motivo: 'meta: falta ejecucionId' };
  return { ok: true, registro, meta };
}

async function registrar(env: EnvListasNegras, fetchTimeout: FetchTimeout, evento: Record<string, unknown>): Promise<boolean> {
  const destino = (env.LISTAS_LOG_URL || '').replace(/\/$/, '');
  if (!destino || !env.LISTAS_LOG_SECRET) return false;
  try {
    const r = await fetchTimeout(destino, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': env.LISTAS_LOG_SECRET },
      body: JSON.stringify(evento),
    }, 8000);
    return r.ok;
  } catch { return false; }
}

export interface Actor { email: string; nombre: string; uid: string }

/** El actor del flujo automático: lo acredita el secreto `x-lens-sistema`. */
export const ACTOR_SISTEMA: Actor = { email: 'sistema:lens-flujo-autonomo', nombre: 'Flujo automático OFAC', uid: 'lens-flujo-autonomo' };

export interface ResultadoEscritura {
  cambioId: string;
  status: number;
  datos: unknown;
  error: string | null;
  /** `no_disponible`: no se pudo registrar, así que NO se llamó a Admin. */
  registro: 'ok' | 'sin_resultado' | 'no_disponible';
}

/**
 * Una escritura en Admin, con su registro: el intento ANTES (si no se puede
 * registrar, no se escribe) y el resultado después. La usan la ruta del módulo
 * y el paso 6 de /admin/customer-status.
 */
async function escribirConRegistro(env: EnvListasNegras, fetchTimeout: FetchTimeout, w: {
  lista: string; metodo: 'POST' | 'PUT'; registro: Plano; ejecucionId: string;
  meta: { estadoAnterior?: unknown; reasonAnterior?: unknown; valor?: unknown };
  actor: Actor; flujo: string; servicio: string; origen?: { numeroCaso: string; casoId: string };
}): Promise<ResultadoEscritura> {
  const cambioId = crypto.randomUUID();
  const intento = await registrar(env, fetchTimeout, {
    accion: 'intento', cambioId, ejecucionId: w.ejecucionId, lista: w.lista.toUpperCase(),
    operacion: w.metodo === 'POST' ? 'CREAR' : 'EDITAR', flujo: w.flujo, servicio: w.servicio, actor: w.actor,
    registro: w.registro,
    meta: { estadoAnterior: w.meta.estadoAnterior ?? null, reasonAnterior: w.meta.reasonAnterior ?? null,
            valor: w.meta.valor ?? null },
    ...(w.origen ? { origen: w.origen } : {}),
  });
  if (!intento) {
    return { cambioId, status: 503, datos: null, registro: 'no_disponible',
             error: 'No se pudo registrar el cambio, así que no se hizo. Reintentá en unos minutos.' };
  }
  let status = 0;
  let datos: unknown = null;
  let error: string | null = null;
  try {
    const a = await llamarAdmin(env, fetchTimeout, w.metodo, RUTAS[w.lista], JSON.stringify(w.registro));
    status = a.status;
    datos = a.datos;
  } catch (e) {
    status = e instanceof ErrorAdmin ? e.status : 502;
    error = e instanceof Error ? e.message : 'no se pudo llamar a Admin';
  }
  const ok = status >= 200 && status < 300;
  if (!ok && !error) error = `HTTP ${status}`;
  const ev = { accion: 'resultado', cambioId, ok, httpStatus: status, respuesta: datos, actor: w.actor, error: ok ? null : error };
  const cerrado = await registrar(env, fetchTimeout, ev) || await registrar(env, fetchTimeout, ev);
  console.log(`listas-negras ${w.metodo} ${w.lista} → ${status}${cerrado ? '' : ' (resultado sin registrar)'}`);
  return { cambioId, status, datos, error, registro: cerrado ? 'ok' : 'sin_resultado' };
}

// ── OFAC Bloqueado → lista negra de DNI ─────────────────────────────────────
// Todo cierre «Bloqueado» (`fully_blocked`) de la cola OFAC agrega al cliente
// a la lista negra de DNI de Admin (decisión de Benjamín, 23-10-2026). Corre
// como paso 6 de /admin/customer-status —después de los cinco de siempre, sin
// tocar su `ok`— y en la carga de históricos del módulo.
//
// Se registra en los dos esquemas, cada uno con lo suyo: `listas_negras` (el
// cambio en Admin, por el logger de #211) y `colas_trabajo.lista_negra_dni`
// (lo que pasó en la cola, por el logger de colas). Los dos con el actor
// verificado acá: el ID token del analista o el secreto del flujo automático.

const LISTA_MS = 60_000;
const PAISES_MS = 3_600_000;

async function listaDni(env: EnvListasNegras, fetchTimeout: FetchTimeout): Promise<RegistroDni[]> {
  if (cacheDni && Date.now() < cacheDni.vence) return cacheDni.recs;
  const r = await llamarAdmin(env, fetchTimeout, 'GET', RUTAS.dni);
  if (r.status !== 200) throw new Error(`la lista de DNI respondió HTTP ${r.status}`);
  const recs = extractList(r.datos).filter(x => x && typeof x === 'object');
  cacheDni = { recs, vence: Date.now() + LISTA_MS };
  return recs;
}

async function paises(env: EnvListasNegras, fetchTimeout: FetchTimeout): Promise<Record<string, string>> {
  if (cachePaises && Date.now() < cachePaises.vence) return cachePaises.mapa;
  const r = await llamarAdmin(env, fetchTimeout, 'GET', RUTA_PAISES);
  if (r.status !== 200) throw new Error(`el catálogo de países respondió HTTP ${r.status}`);
  cachePaises = { mapa: loadCountries(r.datos), vence: Date.now() + PAISES_MS };
  return cachePaises.mapa;
}

/** La fila de `colas_trabajo.lista_negra_dni`. Si falla, la recupera el respaldo diario. */
async function registrarColas(env: EnvListasNegras, fetchTimeout: FetchTimeout, datos: Record<string, unknown>): Promise<boolean> {
  const destino = (env.COLAS_LOGGER_URL || '').replace(/\/$/, '');
  if (!destino || !env.COLAS_LOGGER_SECRET) return false;
  try {
    const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    const r = await fetchTimeout(destino, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': env.COLAS_LOGGER_SECRET },
      body: JSON.stringify({ eventos: [{ tabla: 'lista_negra_dni', datos: limpio }] }),
    }, 8000);
    return r.ok;
  } catch { return false; }
}

export interface ResultadoListaNegraDni {
  resultado: ResultadoColas;
  cambioId: string;
  flujo: string;
  countryCode: string;
  tipologia: string;
  actor: Actor;
  automatico: boolean;
  ocurridoEn: string;
  /** El registro en `listas_negras`: `no_disponible` = no se registró y no se tocó Admin. */
  registro: 'ok' | 'sin_resultado' | 'no_disponible';
  /** La fila de `colas_trabajo`: si no entró, la recupera el respaldo diario. */
  colas: boolean;
  detalle?: string;
  httpStatus?: number;
}

const recorte = (v: unknown, tope: number) => String(v ?? '').trim().slice(0, tope);

/** Una entrada, con solo lo que se usa y con topes. */
function entradaLimpia(e: Partial<EntradaListaNegraDni> & { ejecucionId?: unknown }): EntradaListaNegraDni & { ejecucionId: string } {
  const ej = recorte(e.ejecucionId, 64);
  return {
    customerId: recorte(e.customerId, 32), dni: recorte(e.dni, 64), countryCode: recorte(e.countryCode, 2).toUpperCase(),
    numeroCaso: recorte(e.numeroCaso, 20), casoId: recorte(e.casoId, 64), idInternoUsuario: recorte(e.idInternoUsuario, 32),
    tipologia: recorte(e.tipologia, 40), ejecucionId: EJECUCION.test(ej) ? ej : crypto.randomUUID(),
  };
}

/** Agrega (o reactiva) un DNI en la lista negra, con su registro en los dos esquemas. No lanza. */
export async function pasoListaNegraDni(
  env: EnvListasNegras, fetchTimeout: FetchTimeout, e: EntradaListaNegraDni & { ejecucionId: string },
  actor: Actor, origen: OrigenBloqueado, servicio: string,
): Promise<ResultadoListaNegraDni> {
  const flujo = FLUJOS_BLOQUEADO[origen];
  const ocurridoEn = new Date().toISOString();
  const origenCaso = { numeroCaso: e.numeroCaso, casoId: e.casoId };
  let decision: DecisionDni;
  try {
    decision = decidirDni(e.dni, e.countryCode, await listaDni(env, fetchTimeout));
  } catch (err) {
    decision = { accion: 'error', motivo: `No se pudo leer la lista de DNI de Admin (${err instanceof Error ? err.message : 'error'}).` };
  }
  let countryName = '';
  if (decision.accion === 'agregar') {
    try { countryName = (await paises(env, fetchTimeout))[e.countryCode] || ''; } catch { /* abajo */ }
    if (!countryName) decision = { accion: 'error', motivo: `No se encontró el countryName de ${e.countryCode} en Admin.` };
  }

  let cambioId: string;
  let resultadoListas: string;
  let registro: ResultadoListaNegraDni['registro'];
  let detalle: string | undefined;
  let httpStatus: number | undefined;
  if (decision.accion === 'agregar' || decision.accion === 'reactivar') {
    const agregar = decision.accion === 'agregar';
    const rec = decision.accion === 'reactivar' ? decision.registro : null;
    const w = await escribirConRegistro(env, fetchTimeout, {
      lista: 'dni', metodo: agregar ? 'POST' : 'PUT', ejecucionId: e.ejecucionId, actor, flujo, servicio, origen: origenCaso,
      // El PUT de DNI no cambia la razón: queda la que tenía.
      registro: agregar
        ? { dni: (decision as { dniAdmin: string }).dniAdmin, countryCode: e.countryCode, countryName, reason: MOTIVO_BLOQUEADO }
        : { dni: String(rec!.dni), countryCode: String(rec!.countryCode), status: true },
      meta: agregar ? { valor: (decision as { dniAdmin: string }).dniAdmin }
        : { estadoAnterior: false, reasonAnterior: rec!.reason ?? null, valor: String(rec!.dni) },
    });
    cambioId = w.cambioId;
    registro = w.registro;
    httpStatus = w.status;
    const ok = w.status >= 200 && w.status < 300;
    resultadoListas = ok ? (agregar ? 'CREADO' : 'ACTIVADO') : 'ERROR';
    if (!ok) detalle = w.error ?? `HTTP ${w.status}`;
    // La lista guardada se pone al día: un segundo cierre del mismo cliente
    // dentro del minuto lo ve activo y no lo vuelve a agregar.
    if (ok && cacheDni) {
      if (rec) rec.blacklistStatus = true;
      else cacheDni.recs.push({ dni: (decision as { dniAdmin: string }).dniAdmin, countryCode: e.countryCode, blacklistStatus: true });
    }
  } else {
    // Sin operación en Admin: ya estaba activo, o no se puede agregar.
    cambioId = crypto.randomUUID();
    const ya = decision.accion === 'ya_activo';
    resultadoListas = ya ? 'OMITIDO_YA_EXISTE_ACTIVO' : 'ERROR';
    if (!ya) detalle = (decision as { motivo: string }).motivo;
    const valor = ya ? String((decision as { registro: RegistroDni }).registro.dni ?? '') : e.dni;
    const ok = await registrar(env, fetchTimeout, {
      accion: 'sin_operacion', ejecucionId: e.ejecucionId, lista: 'DNI', flujo, servicio, actor, operacion: 'CREAR',
      filas: [{ cambioId, valor: valor || null, countryCode: e.countryCode || null, resultado: resultadoListas,
                estadoAnterior: ya ? true : null, error: detalle ?? null, ...origenCaso }],
    });
    registro = ok ? 'ok' : 'no_disponible';
  }

  const resultado = resultadoColas(resultadoListas);
  const colas = await registrarColas(env, fetchTimeout, {
    cambio_id: cambioId, numero_caso: e.numeroCaso, caso_id: e.casoId,
    id_interno_usuario: /^\d+$/.test(e.idInternoUsuario) ? e.idInternoUsuario : null,
    dni: claveDni(e.dni) || null, country_code: e.countryCode || null, tipologia: e.tipologia || null,
    resultado, detalle: detalle ?? null, flujo, automatico: origen === 'automatico',
    actor_email: actor.email, actor_nombre: actor.nombre || null, actor_uid: actor.uid || null, ocurrido_en: ocurridoEn,
  });
  console.log(`listas-negras bloqueado ${origen} → ${resultado}${colas ? '' : ' (colas sin registrar)'}`);
  return { resultado, cambioId, flujo, countryCode: e.countryCode, tipologia: e.tipologia, actor,
           automatico: origen === 'automatico', ocurridoEn, registro, colas,
           ...(detalle ? { detalle } : {}), ...(httpStatus ? { httpStatus } : {}) };
}

/** Comparación de secretos sin cortocircuito. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type ResultadoCliente = { customerId: string; ok: boolean; steps: Record<string, unknown> };

/**
 * El paso 6 de /admin/customer-status. Solo corre si el pedido trae
 * `listaNegraDni`, es de la cola OFAC con tipología `fully_blocked`, el cierre
 * en Admin quedó ok y el actor está verificado. Escribe en `steps.listaNegraDni`
 * y NUNCA cambia el `ok` del cierre. Lo que no termina en `esperaPaso6Ms` sigue
 * después de responder (`waitUntil`) y queda en el registro. No lanza.
 */
export async function pasoSeisCustomerStatus(
  request: Request, env: EnvListasNegras, ctx: { waitUntil(p: Promise<unknown>): void },
  body: { cola?: string; listaNegraDni?: unknown }, results: ResultadoCliente[], fetchTimeout: FetchTimeout,
): Promise<void> {
  const crudo = body.listaNegraDni;
  const entradas = (Array.isArray(crudo) ? crudo : [crudo]).filter((x): x is Record<string, unknown> =>
    !!x && typeof x === 'object' && !Array.isArray(x)).slice(0, 200);
  if (!entradas.length) return;

  // El actor: el flujo automático por su secreto, o el analista por su ID token.
  let actor: Actor | null = null;
  let origen: OrigenBloqueado = 'manual';
  const sistema = request.headers.get('x-lens-sistema') || '';
  const esperado = env.LISTA_NEGRA_SISTEMA_SECRET || env.FLUJO_TRIGGER_SECRET || '';
  if (sistema && esperado && iguales(sistema, esperado)) {
    actor = ACTOR_SISTEMA;
    origen = 'automatico';
  } else {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token) {
      const v = await verificarIdToken(token, env.FIREBASE_PROJECT_ID || PROYECTO_DEFAULT);
      if (v.ok) actor = { email: v.email, nombre: v.nombre, uid: v.uid };
    }
  }

  const pendientes: Array<[EntradaListaNegraDni & { ejecucionId: string }, ResultadoCliente]> = [];
  for (const crudaE of entradas) {
    const e = entradaLimpia(crudaE as Partial<EntradaListaNegraDni>);
    const r = results.find(x => x.customerId === e.customerId)
      ?? (entradas.length === 1 && results.length === 1 ? results[0] : undefined);
    if (!r) continue;
    if (!esBloqueadoOfac(body.cola, e.tipologia)) { r.steps.listaNegraDni = { omitido: 'no es un cierre Bloqueado de la cola OFAC' }; continue; }
    if (!r.ok) { r.steps.listaNegraDni = { omitido: 'el cierre en Admin no quedó ok' }; continue; }
    if (!actor) { r.steps.listaNegraDni = { omitido: 'sin_actor_verificado' }; continue; }
    pendientes.push([e, r]);
  }
  if (!pendientes.length || !actor) return;

  const quien = actor;
  const trabajo = (async () => {
    for (const [e, r] of pendientes) {
      try {
        r.steps.listaNegraDni = await pasoListaNegraDni(env, fetchTimeout, e, quien, origen, '/admin/customer-status');
      } catch (err) {
        r.steps.listaNegraDni = { resultado: 'ERROR', detalle: err instanceof Error ? err.message : 'error' };
      }
    }
  })();
  let vencido = false;
  await Promise.race([trabajo, new Promise<void>(res => setTimeout(() => { vencido = true; res(); }, esperaPaso6Ms))]);
  if (vencido) {
    for (const [, r] of pendientes) {
      if (!r.steps.listaNegraDni) r.steps.listaNegraDni = { en_curso: true, detalle: 'Siguió después de responder: el resultado queda en el registro.' };
    }
    ctx.waitUntil(trabajo);
  }
}

/** Atiende /admin/listas-negras/*. Devuelve null si la ruta no es de acá. */
export async function manejarListasNegras(
  request: Request, url: URL, env: EnvListasNegras, cors: Record<string, string>, fetchTimeout: FetchTimeout,
): Promise<Response | null> {
  if (!esRutaListasNegras(url.pathname)) return null;
  const m = url.pathname.slice(PREFIJO.length).match(/^(?:(paises)|(dni|dominio|cuenta)(?:\/(sin-operacion|ids|bloqueado))?)$/);
  if (!m || (m[3] === 'bloqueado' && m[2] !== 'dni')) return responder({ error: 'Ruta no encontrada' }, 404, cors);
  const lista = m[1] || m[2];
  const sub = m[3] || '';
  const metodo = request.method;
  const admitidos = lista === 'paises' ? ['GET'] : sub ? ['POST'] : ['GET', 'POST', 'PUT'];
  if (!admitidos.includes(metodo)) return responder({ error: 'Método no permitido' }, 405, cors);

  // 1 · Quién pide: ID token de Lens verificado, y el módulo habilitado.
  const auth = request.headers.get('Authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!idToken) return responder({ error: 'no autorizado', motivo: 'falta el token' }, 401, cors);
  const proyecto = env.FIREBASE_PROJECT_ID || PROYECTO_DEFAULT;
  const v = await verificarIdToken(idToken, proyecto);
  if (!v.ok) return responder({ error: 'no autorizado', motivo: v.motivo }, 401, cors);
  try {
    const permiso = await tienePermiso(v.uid, idToken, proyecto, fetchTimeout);
    if (!permiso.ok) {
      return responder({ error: 'sin permiso', motivo: 'el módulo Listas negras no está habilitado para tu usuario' }, 403, cors);
    }
    // La carga de «Bloqueados» históricos es solo para Líder.
    if (sub === 'bloqueado' && !permiso.lider) {
      return responder({ error: 'sin permiso', motivo: 'la carga de históricos es solo para Líder' }, 403, cors);
    }
  } catch {
    // No se pudo leer el perfil: se niega, no se adivina.
    return responder({ error: 'no se pudo verificar el permiso' }, 503, cors);
  }
  const actor = { email: v.email, nombre: v.nombre, uid: v.uid };

  // 2 · Lectura: sin registro.
  if (metodo === 'GET') {
    try {
      const r = await llamarAdmin(env, fetchTimeout, 'GET', lista === 'paises' ? RUTA_PAISES : RUTAS[lista]);
      console.log(`listas-negras GET ${lista} → ${r.status}`);
      return responder({ actor: v.email, status: r.status, datos: r.datos }, r.status, cors);
    } catch (e) {
      const status = e instanceof ErrorAdmin ? e.status : 502;
      console.log(`listas-negras GET ${lista} → falla (${status})`);
      return responder({ actor: v.email, error: e instanceof Error ? e.message : 'no se pudo llamar a Admin' }, status, cors);
    }
  }

  const LISTA = lista.toUpperCase();
  const cuerpoTexto = await request.text();

  // 3a · Un «Bloqueado» histórico de la cola OFAC, con la misma lógica del paso 6.
  if (sub === 'bloqueado') {
    if (cuerpoTexto.length > MAX_CUERPO) return responder({ error: 'cuerpo demasiado grande' }, 413, cors);
    let c: unknown;
    try { c = JSON.parse(cuerpoTexto); } catch { return responder({ error: 'body JSON inválido' }, 400, cors); }
    const p = objetoPlano(c, ['ejecucionId', 'customerId', 'dni', 'countryCode', 'numeroCaso', 'casoId', 'idInternoUsuario', 'tipologia'], 'bloqueado');
    if (typeof p === 'string') return responder({ error: 'cuerpo inválido', motivo: p }, 400, cors);
    if (p.tipologia !== TIPOLOGIA_BLOQUEADO || !p.numeroCaso || !p.casoId) {
      return responder({ error: 'cuerpo inválido', motivo: 'se espera un caso con tipología fully_blocked' }, 400, cors);
    }
    const r = await pasoListaNegraDni(env, fetchTimeout, entradaLimpia(p as Partial<EntradaListaNegraDni>), actor, 'historico', url.pathname);
    return responder({ ...r, actor: v.email }, r.registro === 'no_disponible' ? 503 : 200, cors);
  }

  // 3 · Lo que no pasa por Admin: filas omitidas y ids completados. Solo al registro.
  if (sub) {
    if (cuerpoTexto.length > MAX_CUERPO_LOTE) return responder({ error: 'cuerpo demasiado grande' }, 413, cors);
    let c: { ejecucionId?: unknown; modo?: unknown; filas?: unknown; ids?: unknown };
    try { c = JSON.parse(cuerpoTexto); } catch { return responder({ error: 'body JSON inválido' }, 400, cors); }
    let evento: Record<string, unknown>;
    if (sub === 'sin-operacion') {
      if (!c || !EJECUCION.test(String(c.ejecucionId ?? '')) || !['carga', 'edicion'].includes(String(c.modo))
          || !Array.isArray(c.filas) || !c.filas.length || c.filas.length > 500) {
        return responder({ error: 'cuerpo inválido', motivo: 'se espera { ejecucionId, modo, filas[1..500] }' }, 400, cors);
      }
      const filas: Plano[] = [];
      for (const f of c.filas) {
        const p = objetoPlano(f, CAMPOS_SIN_OPERACION, 'fila');
        if (typeof p === 'string') return responder({ error: 'cuerpo inválido', motivo: p }, 400, cors);
        if (!RESULTADOS_SIN_OPERACION.includes(String(p.resultado))) {
          return responder({ error: 'cuerpo inválido', motivo: 'resultado no admitido' }, 400, cors);
        }
        filas.push({ ...p, cambioId: crypto.randomUUID() });
      }
      evento = { accion: 'sin_operacion', ejecucionId: c.ejecucionId, lista: LISTA, flujo: FLUJO[String(c.modo)],
                 servicio: url.pathname, actor, filas };
    } else {
      if (!c || !Array.isArray(c.ids) || !c.ids.length || c.ids.length > 500) {
        return responder({ error: 'cuerpo inválido', motivo: 'se espera { ids[1..500] }' }, 400, cors);
      }
      for (const x of c.ids) {
        const p = objetoPlano(x, ['cambioId', 'adminId'], 'id');
        if (typeof p === 'string') return responder({ error: 'cuerpo inválido', motivo: p }, 400, cors);
      }
      evento = { accion: 'ids', lista: LISTA, actor, ids: c.ids };
    }
    const ok = await registrar(env, fetchTimeout, evento);
    console.log(`listas-negras registro ${sub} ${lista} → ${ok ? 'ok' : 'falla'}`);
    return ok ? responder({ actor: v.email, ok: true }, 200, cors)
      : responder({ error: 'no se pudo registrar' }, 503, cors);
  }

  // 4 · Escritura: registro ANTES de Admin, o no se escribe.
  const r = cuerpoValido(cuerpoTexto, CAMPOS[lista][metodo as 'POST' | 'PUT']);
  if (!r.ok) return responder({ error: 'cuerpo inválido', motivo: r.motivo }, 400, cors);
  const w = await escribirConRegistro(env, fetchTimeout, {
    lista, metodo: metodo as 'POST' | 'PUT', registro: r.registro, ejecucionId: String(r.meta.ejecucionId),
    meta: r.meta, actor, flujo: FLUJO[metodo], servicio: url.pathname,
  });
  if (w.registro === 'no_disponible') {
    console.log(`listas-negras ${metodo} ${lista} → sin registro, no se llamó a Admin`);
    return responder({ actor: v.email, error: w.error, registro: 'no_disponible' }, 503, cors);
  }
  const ok = w.status >= 200 && w.status < 300;
  return responder({ actor: v.email, cambioId: w.cambioId, status: w.status, datos: w.datos,
                     ...(ok ? {} : { error: w.error }), registro: w.registro }, ok ? w.status : (w.status || 502), cors);
}
