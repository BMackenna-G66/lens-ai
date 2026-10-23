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

export interface EnvListasNegras {
  G66_ADMIN_REFRESH_TOKEN?: string;
  FIREBASE_PROJECT_ID?: string;
  // Function URL de lens-listas-negras-log y su secreto. El navegador no los ve.
  LISTAS_LOG_URL?: string;
  LISTAS_LOG_SECRET?: string;
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
const permisos = new Map<string, { ok: boolean; vence: number }>();
let dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Solo para los tests. */
export function _reiniciarListasNegras(opciones: { sinEsperas?: boolean } = {}): void {
  tokenAdmin = null;
  refrescando = null;
  permisos.clear();
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
async function tienePermiso(uid: string, idToken: string, proyecto: string, fetchTimeout: FetchTimeout): Promise<boolean> {
  const guardado = permisos.get(uid);
  if (guardado && Date.now() < guardado.vence) return guardado.ok;
  const url = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const r = await fetchTimeout(url, { headers: { Authorization: `Bearer ${idToken}` } }, 10000);
  if (r.status === 404) { permisos.set(uid, { ok: false, vence: Date.now() + PERMISO_MS }); return false; }
  if (!r.ok) throw new Error(`perfil HTTP ${r.status}`);
  const doc = await r.json() as { fields?: Record<string, { stringValue?: string; booleanValue?: boolean;
    mapValue?: { fields?: Record<string, { booleanValue?: boolean }> } }> };
  const f = doc.fields ?? {};
  const ok = f.disabled?.booleanValue !== true
    && (f.role?.stringValue === 'Lider' || f.modules?.mapValue?.fields?.listasNegras?.booleanValue === true);
  permisos.set(uid, { ok, vence: Date.now() + PERMISO_MS });
  return ok;
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

/** Atiende /admin/listas-negras/*. Devuelve null si la ruta no es de acá. */
export async function manejarListasNegras(
  request: Request, url: URL, env: EnvListasNegras, cors: Record<string, string>, fetchTimeout: FetchTimeout,
): Promise<Response | null> {
  if (!esRutaListasNegras(url.pathname)) return null;
  const m = url.pathname.slice(PREFIJO.length).match(/^(?:(paises)|(dni|dominio|cuenta)(?:\/(sin-operacion|ids))?)$/);
  if (!m) return responder({ error: 'Ruta no encontrada' }, 404, cors);
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
    if (!(await tienePermiso(v.uid, idToken, proyecto, fetchTimeout))) {
      return responder({ error: 'sin permiso', motivo: 'el módulo Listas negras no está habilitado para tu usuario' }, 403, cors);
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
  const texto = await request.text();

  // 3 · Lo que no pasa por Admin: filas omitidas y ids completados. Solo al registro.
  if (sub) {
    if (texto.length > MAX_CUERPO_LOTE) return responder({ error: 'cuerpo demasiado grande' }, 413, cors);
    let c: { ejecucionId?: unknown; modo?: unknown; filas?: unknown; ids?: unknown };
    try { c = JSON.parse(texto); } catch { return responder({ error: 'body JSON inválido' }, 400, cors); }
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
  const r = cuerpoValido(texto, CAMPOS[lista][metodo as 'POST' | 'PUT']);
  if (!r.ok) return responder({ error: 'cuerpo inválido', motivo: r.motivo }, 400, cors);
  const cambioId = crypto.randomUUID();
  const intento = await registrar(env, fetchTimeout, {
    accion: 'intento', cambioId, ejecucionId: r.meta.ejecucionId, lista: LISTA,
    operacion: metodo === 'POST' ? 'CREAR' : 'EDITAR', flujo: FLUJO[metodo], servicio: url.pathname, actor,
    registro: r.registro,
    meta: { estadoAnterior: r.meta.estadoAnterior ?? null, reasonAnterior: r.meta.reasonAnterior ?? null,
            valor: r.meta.valor ?? null },
  });
  if (!intento) {
    console.log(`listas-negras ${metodo} ${lista} → sin registro, no se llamó a Admin`);
    return responder({ actor: v.email, error: 'No se pudo registrar el cambio, así que no se hizo. Reintentá en unos minutos.',
                       registro: 'no_disponible' }, 503, cors);
  }

  let status = 0;
  let datos: unknown = null;
  let error: string | null = null;
  try {
    const a = await llamarAdmin(env, fetchTimeout, metodo, RUTAS[lista], JSON.stringify(r.registro));
    status = a.status;
    datos = a.datos;
  } catch (e) {
    status = e instanceof ErrorAdmin ? e.status : 502;
    error = e instanceof Error ? e.message : 'no se pudo llamar a Admin';
  }
  const ok = status >= 200 && status < 300;
  const evResultado = { accion: 'resultado', cambioId, ok, httpStatus: status, respuesta: datos, actor,
                        error: ok ? null : (error || `HTTP ${status}`) };
  const cerrado = await registrar(env, fetchTimeout, evResultado) || await registrar(env, fetchTimeout, evResultado);
  console.log(`listas-negras ${metodo} ${lista} → ${status}${cerrado ? '' : ' (resultado sin registrar)'}`);
  return responder({ actor: v.email, cambioId, status, datos, ...(error ? { error } : {}),
                     registro: cerrado ? 'ok' : 'sin_resultado' }, ok ? status : (status || 502), cors);
}
