/**
 * Cloudflare Worker — relays para Lens AI.
 *
 * 1) EmpresaDocs S3:  GET /relay?url=<presigned S3 url>
 *    Descarga el archivo de S3 server-side y lo devuelve con CORS.
 *
 * 2) Inspektor (Colombia):  ANY /inspektor/<path>
 *    Reenvía la petición a https://inspektor.datalaft.com:2121/api/<path>
 *    desde los servidores de Cloudflare (evita CORS y problemas de ruta de red
 *    del navegador). Reenvía body + Authorization tal cual.
 *
 * 3) Regcheq situación tributaria (SII):  POST /regcheq/sii  body {fichaId, rut}
 *    Dispara el mismo endpoint que el botón "situación tributaria" de la plataforma
 *    (API interna api.regcheq.com), usando un TOKEN DE SESIÓN guardado como secret
 *    (REGCHEQ_SESSION_TOKEN). El token se obtiene logueándose en la plataforma
 *    (dura ~24h) y hay que refrescarlo periódicamente. La external-api NO expone
 *    este disparo; por eso se usa la interna con el token de sesión.
 */

// El contexto de ejecución de Cloudflare. Se declara acá y no se importa de
// `@cloudflare/workers-types` porque el tsconfig de la app también compila este
// archivo y ahí ese tipo no existe. Solo se usa `waitUntil`.
interface CtxWorker { waitUntil(p: Promise<unknown>): void }

interface Env {
  REGCHEQ_SESSION_TOKEN?: string;
  // Salesforce (case-update): OAuth client_credentials + PATCH Apex REST.
  SF_CLIENT_ID?: string;
  SF_CLIENT_SECRET?: string;
  SF_INSTANCE_URL?: string; // opcional; default abajo
  // Admin Global66 (bloqueo/desbloqueo de clientes): refresh-token de admin.
  // Secret: `wrangler secret put G66_ADMIN_REFRESH_TOKEN`. NUNCA en el repo.
  G66_ADMIN_REFRESH_TOKEN?: string;
  // Logger de gestión de colas → Redshift (Lambda colas-trabajo-logger).
  // El Worker guarda la URL y el secreto para que NO viajen al navegador.
  COLAS_LOGGER_URL?: string;
  COLAS_LOGGER_SECRET?: string;
  // Function URL del Lambda del flujo autónomo, y el secreto que exige. El
  // navegador nunca los ve: pega en /flujo/correr y el Worker los agrega.
  FLUJO_TRIGGER_URL?: string;
  FLUJO_TRIGGER_SECRET?: string;
  // ── Migración del paso 2 a ms-customer ──────────────────────────────────
  // `MODELO_ADMIN`: 'anterior' (default) | 'nuevo'. ES EL SWITCH DE VUELTA
  // ATRÁS: apagarlo devuelve el camino viejo sin tocar código.
  //   wrangler secret put MODELO_ADMIN      → 'nuevo'
  // `MS_CUSTOMER_BASE`: URL base del ambiente nuevo. Sin esto, el modo 'nuevo'
  // se niega a correr en vez de pegarle al ambiente equivocado.
  MODELO_ADMIN?: string;
  MS_CUSTOMER_BASE?: string;
}

const ALLOWED_ORIGINS = [
  'https://bmackenna-g66.github.io', // GitHub Pages (producción)
  'http://localhost:5173',           // Vite dev
  'http://localhost:3000',
];

const ALLOWED_HOST_SUFFIXES = ['.amazonaws.com']; // anti-SSRF para /relay
const INSPEKTOR_BASE = 'https://inspektor.datalaft.com:2121/api';
const REGCHEQ_INTERNAL_BASE = 'https://api.regcheq.com';
// Salesforce de PRODUCCIÓN. Se puede sobreescribir con el secret SF_INSTANCE_URL.
const SF_INSTANCE_DEFAULT = 'https://global66.my.salesforce.com';
const G66_ADMIN_BASE = 'https://api.global66.com';
// Estados de compliance que disparan el "last-step" (igual que el bot).
const G66_STATUS_REQUIERE_LAST_STEP = new Set(['NORMAL', 'UNDER_COMPLIANCE_REVIEW', 'UNDER_COMPLIANCE_REVIEW_2']);

// ── PASO 2: el modelo nuevo de ms-customer ──────────────────────────────────
//
// Admin dejó de "poner un estado". Ahora se CREA un registro de bloqueo o se
// RESUELVEN los vigentes, y el estado efectivo del cliente es el más restrictivo
// entre los que quedan sin resolver.
//
// EL RESPALDO ES ESTA VARIABLE, no un revert. `MODELO_ADMIN` arranca en
// 'anterior' a propósito: se puede desplegar este Worker sin que cambie nada, y
// se prende cuando se quiera. Si algo sale mal, se apaga y el camino viejo —que
// sigue entero unas líneas más abajo— vuelve a correr sin tocar código.
type ModeloAdmin = 'anterior' | 'nuevo';
const modeloAdmin = (env: Env): ModeloAdmin =>
  String(env.MODELO_ADMIN || '').trim().toLowerCase() === 'nuevo' ? 'nuevo' : 'anterior';

// Qué hacer según el estado al que se quiere llevar al cliente. Se DERIVA del
// `status` que ya viaja en el body: así el contrato de entrada del Worker no
// cambia y ni la app, ni el Lambda del flujo autónomo, ni la UI se enteran.
//
// Tiene que coincidir con el campo `accion` de `services/cierreAdminTipos.ts`,
// que es donde está escrito el porqué de cada una. Si se agrega una tipología
// allá, revisar acá.
//
//   NORMAL → el cliente queda libre: no se crea nada, se resuelve lo vigente.
//   el resto → baja o mantiene restricción: se crea el propio y se resuelve el
//              del bot, para no dejar dos bloqueos apilados sobre el cliente.
const accionPara = (status: string): 'resolver' | 'crear_y_resolver' =>
  status === 'NORMAL' ? 'resolver' : 'crear_y_resolver';

// ── Rutas reales de ms-customer, carpeta BO ────────────────────────────────
//
// Se usa **BO** y no `Iuse`. Probado el 17-09-2026 desde internet, que es desde
// donde pega este Worker:
//   ruta inventada        → 403 "Missing Authentication Token"  (no mapeada)
//   /customer/bo/...      → 401 UNAUTHORIZED source BUSINESS_SERVICE  (existe)
//   /customer/iuse/...    → 403 "Missing Authentication Token"  ← igual que la inventada
// O sea: `Iuse` no está publicada hacia afuera. Es la puerta entre
// microservicios, dentro de la VPC.
//
// BO es además la puerta correcta por otro motivo: es la que usa el Admin desde
// el navegador, con la credencial del equipo de Compliance, así que queda
// registrado QUIÉN hizo el cambio en vez de un bot genérico.
const MS_BASE_PATH = '/customer/bo/compliance';
const MS_CREAR = MS_BASE_PATH;
const MS_RESOLVER = (complianceId: string | number) => `${MS_BASE_PATH}/${encodeURIComponent(String(complianceId))}/resolve`;
const MS_HISTORIAL = (id: string) => `${MS_BASE_PATH}/customers/${encodeURIComponent(id)}/history`;

// En BO NO hay `/status` ni `/comments/unresolved`: `history` cubre las dos.
// Viene ordenado por prioridad —primero los no resueltos, y entre esos el de
// mayor restricción— así que el PRIMER elemento es el estado efectivo.

// NO hay lista de terminales hardcodeada, y es a propósito.
//
// El catálogo marca algunos comments como terminales, pero **el área dueña SÍ
// puede resolver los suyos** — Compliance necesita resolver los propios para
// dejar a un cliente en NORMAL. Una lista acá decidiría por la API con una copia
// del catálogo que además se desactualiza sola.
//
// Se intenta resolver todo lo vigente y se deja que el servicio conteste. Si no
// se puede, responde COMPLIANCE_STATUS_CANNOT_BE_RESOLVED y eso se tolera: no
// es una falla del cierre, es "eso no se toca". La verificación final dice si el
// cliente quedó donde tenía que quedar.

// `observation` admite SOLO letras, números y espacios. Es más estricto que
// `sanitizarTexto` de la app, que deja punto y coma — y con un punto la API
// responde BAD_REQUEST "Observation cannot have special characters".
const soloAlfanumerico = (v: unknown): string =>
  String(v ?? '').normalize('NFC').replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, ' ').replace(/\s+/g, ' ').trim();

// Errores que NO son fallas del cierre, y por qué:
//   COMPLIANCE_STATUS_CANNOT_BE_RESOLVED  no se puede resolver (terminal ajeno o
//                                 ya resuelto). No es falla del cierre.
//   COMPLIANCE_INVALID_RESOLVE_AREA  el bloqueo es de OTRA área (fraude, CX).
//                                 Compliance no debería levantarlo, así que se
//                                 deja y se reporta — el chequeo final dirá si
//                                 el cliente quedó como se pretendía.
const contiene = (data: unknown, code: string) => JSON.stringify(data ?? '').includes(code);

/**
 * El paso 2 contra ms-customer, carpeta BO. Devuelve la MISMA forma que
 * `doStep` para que el resto del handler, la app y el Lambda no noten nada.
 *
 * Tres diferencias grandes contra `Iuse`, que es lo que hizo falta reescribir:
 *
 *   · RESOLVER ES POR `complianceId`, uno por llamada. Hay que listar primero.
 *   · NO existe el campo `status` en el create: el estado sale SOLO del
 *     `comment`. No hay fallback — un comment fuera de catálogo es error duro.
 *   · Un duplicado es ERROR, no un no-op silencioso.
 *
 * CREAR VA ANTES QUE RESOLVER: no hay transacción entre las llamadas, así que
 * una falla parcial tiene que dejar al cliente en el estado MÁS restrictivo.
 */
async function paso2MsCustomer(
  env: Env, idToken: string, id: string, status: string,
  body: { comment?: string; observation?: string; agent?: string },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = String(env.MS_CUSTOMER_BASE || G66_ADMIN_BASE).trim().replace(/\/$/, '');

  const llamar = async (method: string, path: string, payload?: unknown) => {
    const res = await fetchTimeout(`${base}${path}`, {
      method,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Authorization': idToken,
        // NO se manda `Claim-Email`: el gateway ya lo inyecta desde el token.
        // Mandarlo además lo DUPLICA — medido en la primera corrida real, quedó
        // `createdBy: "benjamin.mackenna@global66.com,benjamin.mackenna@global66.com"`.
        // El área tampoco sale de acá: la resuelve el gateway con
        // `Claim-User-Admin-Rol`, desde el claim `custom:title`.
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }, 30000);
    const t = await res.text();
    let data: unknown; try { data = t ? JSON.parse(t) : {}; } catch { data = { raw: t }; }
    return { ok: res.ok, status: res.status, data };
  };

  // El historial viene ordenado por prioridad: el primero es el estado efectivo.
  const filas = (d: unknown): Array<Record<string, unknown>> => {
    const x = Array.isArray(d) ? d
      : ((d as { content?: unknown[] })?.content ?? (d as { data?: unknown[] })?.data ?? []);
    return Array.isArray(x) ? x as Array<Record<string, unknown>> : [];
  };
  // `isResolved` es el campo REAL, confirmado contra producción el 17-09-2026:
  //   { id, customerId, status, comment, complianceStatusCommentId, observation,
  //     createdBy, createdAt, areaId, areaName, isTerminal, isResolved,
  //     resolvedBy, resolvedComment, resolvedAt, channel }
  // Antes se adivinaba (`resolved` / `resuelto` / `resolvedAt`) a partir de los
  // labels del Admin, y ninguno de esos nombres existe.
  const sinResolver = (fs: Array<Record<string, unknown>>) => fs.filter(r => r.isResolved !== true);
  const efectivo = (fs: Array<Record<string, unknown>>) =>
    String(sinResolver(fs)[0]?.status ?? 'NORMAL');

  const accion = accionPara(status);
  const observation = soloAlfanumerico(body.observation);
  const comentarioPropio = String(body.comment || '').trim();
  const sub: Record<string, unknown> = { modelo: 'nuevo', puerta: 'BO', accion, statusPedido: status, comentarioPropio };
  let ok = true;
  let httpFinal = 200;

  // ── 1) Qué hay hoy ───────────────────────────────────────────────────────
  const rAntes = await llamar('GET', MS_HISTORIAL(id));
  sub.historialAntes = rAntes;
  if (!rAntes.ok) return { ok: false, status: rAntes.status, data: sub };
  const antes = sinResolver(filas(rAntes.data));
  sub.sinResolverAntes = antes.length;

  // ── 2) CREAR primero ─────────────────────────────────────────────────────
  let idCreado: unknown = null;
  if (accion === 'crear_y_resolver') {
    // ¿Ya existe un bloqueo vigente con NUESTRO comment? Se decide con el
    // historial que acabamos de pedir, NO con el error del create.
    //
    // Medido en producción: ante un duplicado, BO responde 422 con
    // `{"code":"016402","reason":"CUSTOMER_COMPLIANCE_INVALID"}` y NADA más. El
    // detalle `DUPLICATE_UNRESOLVED_COMMENT` que documenta la colección no viaja
    // en la respuesta, y ese mismo `reason` genérico cubre también
    // COMMENT_NOT_FOUND. Tratar el 422 como "ya estaba" se tragaría un comment
    // inválido —que es un error de verdad— y dejaría al cliente sin bloquear.
    const existente = antes.find(r => String(r.comment ?? '') === comentarioPropio);
    if (existente) {
      idCreado = existente.id ?? existente.complianceId ?? null;
      sub.crear = { omitido: 'ya existe un bloqueo vigente con este comment', id: idCreado };
    } else {
      const r = await llamar('POST', MS_CREAR, { customerId: Number(id) || id, comment: comentarioPropio, observation });
      sub.crear = r;
      if (!r.ok) {
        // Sin el bloqueo nuevo NO se resuelve nada: el cliente queda como estaba.
        sub.resolver = { omitido: 'no se creó el bloqueo nuevo' };
        return { ok: false, status: r.status, data: sub };
      }
      idCreado = (r.data as { id?: unknown })?.id ?? null;
      httpFinal = r.status;
    }
  }

  // ── 3) RESOLVER los vigentes, uno por complianceId ───────────────────────
  const resueltos: Record<string, unknown> = {};
  for (const fila of antes) {
    const cid = fila.id ?? fila.complianceId ?? fila.compliance_id;
    const cmt = String(fila.comment ?? '');
    if (cid == null) continue;
    // El nuestro queda VIGENTE. Se compara por id y TAMBIÉN por comment, y esa
    // segunda condición no es redundante: cuando el create devuelve
    // DUPLICATE_UNRESOLVED_COMMENT no hay id nuevo —`idCreado` queda en null— y
    // sin esto el bucle resolvería el bloqueo que ya estaba con NUESTRO comment,
    // deshaciendo exactamente lo que el cierre vino a hacer.
    if (String(cid) === String(idCreado)) continue;
    if (comentarioPropio && cmt === comentarioPropio) { resueltos[`${cid}:${cmt}`] = { omitido: 'es el nuestro' }; continue; }

    const r = await llamar('PATCH', MS_RESOLVER(cid as string | number), {
      resolvedComment: observation || 'Resuelto por la cola de casos de compliance',
    });
    // Terminal que esta área no puede tocar, o ya resuelto. No es falla nuestra.
    const noSeToca = !r.ok && contiene(r.data, 'COMPLIANCE_STATUS_CANNOT_BE_RESOLVED');
    const deOtraArea = !r.ok && contiene(r.data, 'COMPLIANCE_INVALID_RESOLVE_AREA');
    resueltos[`${cid}:${cmt}`] = r.ok ? r
      : { ...r, tratadoComoOk: noSeToca ? 'NO_RESOLUBLE_O_YA_RESUELTO' : deOtraArea ? 'ES_DE_OTRA_AREA' : undefined };
    if (!r.ok && !noSeToca && !deOtraArea) { ok = false; httpFinal = r.status; }
  }
  sub.resolver = Object.keys(resueltos).length ? resueltos : { nadaQueResolver: true };

  // ── 4) VERIFICAR contra el estado efectivo ───────────────────────────────
  // Es la única forma de saber si el cliente quedó como el analista quiso: el
  // estado es el más restrictivo SIN RESOLVER, así que resolver lo nuestro y que
  // siga bloqueado por otra área es un escenario real. Acá SÍ decide el ok.
  const rDespues = await llamar('GET', MS_HISTORIAL(id));
  sub.historialDespues = rDespues;
  if (rDespues.ok) {
    const quedo = efectivo(filas(rDespues.data));
    sub.estadoEfectivo = quedo;
    if (quedo !== status) {
      ok = false;
      sub.discrepancia = `se pidió ${status} y el cliente quedó en ${quedo}`;
    }
  }

  return { ok, status: httpFinal, data: sub };
}
// BLOCKED = bloqueo preventivo (ej. formulario PEP); no dispara last-step.
const G66_STATUS_VALIDOS = ['NORMAL', 'UNDER_COMPLIANCE_REVIEW', 'UNDER_COMPLIANCE_REVIEW_2', 'BLOCKED', 'FULLY_BLOCKED'];

// Decodifica el payload de un JWT (base64url) sin validar la firma — solo para
// leer companyId y exp del token de sesión.
function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((part.length + 3) % 4);
  try { return JSON.parse(atob(b64)); } catch { return {}; }
}

function corsHeaders(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function jsonError(msg: string, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

export default {
  async fetch(request: Request, env: Env, ctx: CtxWorker): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);

    // ── Regcheq situación tributaria: POST /regcheq/sii  body {fichaId, rut} ─────
    if (url.pathname === '/regcheq/sii') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const token = env.REGCHEQ_SESSION_TOKEN;
      if (!token) return jsonError('Falta el secret REGCHEQ_SESSION_TOKEN en el Worker', 500, cors);

      // Token vencido → avisar claramente para que se refresque.
      const payload = decodeJwt(token);
      const exp = Number(payload['exp'] ?? 0);
      const now = Math.floor(Date.now() / 1000);
      if (exp && exp < now) return jsonError('REGCHEQ_SESSION_TOKEN expirado — refrescarlo', 401, cors);

      let body: { fichaId?: string; rut?: string; companyId?: string };
      try { body = await request.json(); } catch { return jsonError('Body JSON inválido', 400, cors); }
      const fichaId = (body.fichaId || '').trim();
      const rut = (body.rut || '').replace(/[.\s-]/g, '').toUpperCase();
      // companyId: preferir el que manda Lens (de la ficha); si no, el del JWT del token.
      const companyId = (body.companyId || '').trim() || String(payload['companyId'] ?? '');
      if (!fichaId || !rut || !companyId) return jsonError('Faltan fichaId, rut o companyId', 400, cors);

      const target = `${REGCHEQ_INTERNAL_BASE}/fichas-clientes/${encodeURIComponent(fichaId)}/situacion-tributaria`
        + `?companyId=${encodeURIComponent(companyId)}&rut=${encodeURIComponent(rut)}`;
      let upstream: Response;
      try {
        upstream = await fetchTimeout(target, {
          method: 'POST',
          // La API interna autentica con el header 'regcheq-auth' (token de sesión,
          // ~24h), con el valor entre comillas. NO usa Authorization Bearer aquí.
          headers: { 'Content-Type': 'application/json', 'regcheq-auth': `"${token}"` },
          body: '{}',
        }, 30000);
      } catch (e) {
        return jsonError(`No se pudo disparar situación tributaria: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
      const text = await upstream.text();
      const headers = new Headers(cors);
      headers.set('Content-Type', 'application/json');
      headers.set('Cache-Control', 'no-store');
      return new Response(text, { status: upstream.status, headers });
    }

    // ── Logger de gestión de colas: POST /colas/log ─────────────────────────────
    //   Reenvía los eventos de la Bandeja a la Lambda colas-trabajo-logger, que los
    //   escribe en Redshift (schema colas_trabajo). El Worker pone el header
    //   x-api-secret: así el secreto NO queda en el bundle público del frontend.
    //   Es un relay de solo-escritura de auditoría; no devuelve datos del negocio.
    // ── Disparar una corrida del flujo autónomo: POST /flujo/correr ────────────
    //   El botón «Correr ahora» de la cola pega acá y el Worker agrega el secreto.
    //   Así el secreto NO queda en el bundle público del frontend, igual que con
    //   el logger.
    //
    //   No hace falta autorizar más que esto: una corrida disparada a mano no
    //   puede cerrar nada que el cron no cerraría igual — los dos switches de
    //   Firestore y todos los frenos se evalúan lo mismo. Lo que se protege es el
    //   gasto, no la decisión.
    // ── Estado del cron y prenderlo/apagarlo: POST /flujo/cron ────────────────
    //   El navegador no puede tocar EventBridge; el Lambda maneja su propia regla
    //   y este endpoint solo agrega el secreto, igual que /flujo/correr.
    //
    //   A diferencia de correr, acá SÍ se espera la respuesta: cambiar el cron es
    //   instantáneo y quien aprieta el interruptor tiene que ver si quedó prendido.
    //   Devolver 202 y que el estado se vea "después" es exactamente cómo se pierde
    //   la confianza en un interruptor.
    if (url.pathname === '/flujo/cron') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const destino = (env.FLUJO_TRIGGER_URL || '').replace(/\/$/, '');
      const secreto = env.FLUJO_TRIGGER_SECRET || '';
      if (!destino || !secreto) return jsonError('Disparador no configurado', 500, cors);

      let cuerpo: { accion?: string; estado?: string };
      try { cuerpo = await request.json() as typeof cuerpo; }
      catch { return jsonError('Cuerpo inválido', 400, cors); }

      // Allowlist: solo estas dos acciones pasan. Sin esto, este endpoint sería un
      // relay abierto hacia el Lambda.
      const accion = cuerpo.accion === 'cron' ? 'cron' : 'estado';
      const estado = cuerpo.estado === 'ENABLED' ? 'ENABLED' : 'DISABLED';

      try {
        const upstream = await fetchTimeout(destino, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-lens-trigger': secreto },
          body: JSON.stringify(accion === 'cron' ? { accion, estado } : { accion: 'estado' }),
        }, 30000);
        const texto = await upstream.text();
        return new Response(texto, {
          status: upstream.status,
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch (e) {
        return jsonError(`No se pudo leer el estado del cron: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
    }

    if (url.pathname === '/flujo/correr') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const destino = (env.FLUJO_TRIGGER_URL || '').replace(/\/$/, '');
      const secreto = env.FLUJO_TRIGGER_SECRET || '';
      if (!destino || !secreto) {
        return jsonError('Disparador no configurado (FLUJO_TRIGGER_URL / FLUJO_TRIGGER_SECRET)', 500, cors);
      }
      // DISPARA Y VUELVE. No se espera el resultado, a propósito.
      //
      // Cloudflare corta la conexión a los ~100 s con un 524. Al prender Colombia
      // las corridas pasaron de 8-27 s a 220-316 s —cada caso colombiano dispara
      // una consulta a Inspektor de ~13 s— así que esperar la respuesta devolvía
      // 524 SIEMPRE, aunque la corrida terminara bien por detrás.
      //
      // El techo del botón era el del Worker (100 s), no el del Lambda (13 min).
      // Con esto el techo pasa a ser el del Lambda y el 524 desaparece por diseño.
      //
      // `ctx.waitUntil` mantiene la invocación viva después de responder: sin eso
      // Cloudflare mata el fetch pendiente al cerrar la respuesta y la corrida no
      // arrancaría.
      ctx.waitUntil(
        fetch(destino, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-lens-trigger': secreto },
          body: '{}',
        }).catch(() => { /* el resultado se lee en flujo_autonomo_corridas */ }),
      );
      return new Response(JSON.stringify({
        disparada: true,
        mensaje: 'La corrida arrancó. El resultado aparece en la barra del flujo cuando termina.',
      }), {
        status: 202,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/colas/log') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const destino = (env.COLAS_LOGGER_URL || '').replace(/\/$/, '');
      const secreto = env.COLAS_LOGGER_SECRET || '';
      if (!destino || !secreto) return jsonError('Logger no configurado (COLAS_LOGGER_URL / COLAS_LOGGER_SECRET)', 500, cors);
      try {
        const upstream = await fetchTimeout(destino, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-secret': secreto },
          body: await request.text(),
        }, 30000);
        const texto = await upstream.text();
        return new Response(texto || JSON.stringify({ ok: upstream.ok }), {
          status: upstream.status,
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch (e) {
        return jsonError(`No se pudo registrar el log: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
    }

    // ── Casos abiertos de la cola: GET /salesforce/casos-cola ───────────────────
    //   Trae de Salesforce los Case ABIERTOS que pertenecen a una cola (Owner de
    //   tipo Queue). Sirve para repoblar la Bandeja: el flujo normal es push
    //   (Salesforce → Lambda → Firestore) y no había forma de recuperar la cola si
    //   se borraba. Solo LECTURA: no modifica nada en Salesforce.
    if (url.pathname === '/salesforce/casos-cola') {
      const clientId = env.SF_CLIENT_ID;
      const clientSecret = env.SF_CLIENT_SECRET;
      if (!clientId || !clientSecret) return jsonError('Faltan secrets SF_CLIENT_ID/SF_CLIENT_SECRET', 500, cors);
      const instance = (env.SF_INSTANCE_URL || SF_INSTANCE_DEFAULT).replace(/\/$/, '');
      // Solo se permiten caracteres seguros: el nombre de cola va dentro del SOQL.
      const cola = (url.searchParams.get('cola') || '').replace(/['\\]/g, '').slice(0, 120);
      const limite = Math.min(Number(url.searchParams.get('limite') || 500) || 500, 2000);
      const soloConteo = url.searchParams.get('conteo') === '1';

      try {
        const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
        const tokRes = await fetchTimeout(`${instance}/services/oauth2/token`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
        }, 20000);
        if (!tokRes.ok) return jsonError(`OAuth de Salesforce falló: ${(await tokRes.text()).slice(0, 300)}`, 502, cors);
        const tok = JSON.parse(await tokRes.text()) as { access_token?: string; instance_url?: string };
        const base = (tok.instance_url || instance).replace(/\/$/, '');

        const donde = [
          "Owner.Type = 'Queue'",
          "IsClosed = false",
          cola ? `Owner.Name = '${cola}'` : '',
        ].filter(Boolean).join(' AND ');

        const soql = soloConteo
          ? `SELECT COUNT(Id) total, Owner.Name colaNombre FROM Case WHERE ${donde} GROUP BY Owner.Name ORDER BY COUNT(Id) DESC`
          : `SELECT Id, CaseNumber, Subject, Status, CreatedDate, Priority, Owner.Name, Country__c, C_Review__c,
               C_Status__c, Type, Nacionalidad__c, ContactEmail, SuppliedEmail, userId__c,
               Account.Name, Account.customer_id__c, Account.first_name__c, Account.last_name__c,
               Account.id_number__c, Account.id_type__c, Account.nationality__c, Account.country__c,
               Account.PersonEmail, Account.compliance_status__c
             FROM Case WHERE ${donde} ORDER BY CreatedDate DESC LIMIT ${limite}`.replace(/\s+/g, ' ');

        const q = await fetchTimeout(`${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`,
          { headers: { 'Authorization': `Bearer ${tok.access_token}`, 'Accept': 'application/json' } }, 30000);
        const texto = await q.text();
        return new Response(texto, {
          status: q.status,
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch (e) {
        return jsonError(`No se pudo consultar Salesforce: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
    }

    // ── Salesforce case-update: POST /salesforce/case-update ────────────────────
    //   Body = { CaseNumber, ...campos }. El Worker hace OAuth client_credentials
    //   (secrets SF_CLIENT_ID/SF_CLIENT_SECRET), busca el Case por CaseNumber con la
    //   API estándar (SOQL) y hace PATCH al registro Case por Id. No usa Apex REST
    //   custom (así no depende de que esa clase esté desplegada en el org).
    if (url.pathname === '/salesforce/case-update') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const clientId = env.SF_CLIENT_ID;
      const clientSecret = env.SF_CLIENT_SECRET;
      if (!clientId || !clientSecret) return jsonError('Faltan secrets SF_CLIENT_ID/SF_CLIENT_SECRET en el Worker', 500, cors);
      const instance = (env.SF_INSTANCE_URL || SF_INSTANCE_DEFAULT).replace(/\/$/, '');

      let payload: Record<string, unknown>;
      try { payload = await request.json(); } catch { return jsonError('Body JSON inválido', 400, cors); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return jsonError('Se espera un objeto JSON', 400, cors);
      if (!payload['CaseNumber']) return jsonError('Falta CaseNumber en el body', 400, cors);

      // 1) OAuth client_credentials → access_token (+ instance_url).
      let token = '';
      let patchInstance = instance;
      try {
        const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
        const tokRes = await fetchTimeout(`${instance}/services/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }, 20000);
        const tokText = await tokRes.text();
        if (!tokRes.ok) {
          return new Response(JSON.stringify({ error: 'OAuth de Salesforce falló', status: tokRes.status, detalle: tokText.slice(0, 500) }),
            { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        const tok = JSON.parse(tokText) as { access_token?: string; instance_url?: string };
        token = tok.access_token || '';
        if (tok.instance_url) patchInstance = tok.instance_url.replace(/\/$/, '');
        if (!token) return jsonError('Salesforce no devolvió access_token', 502, cors);
      } catch (e) {
        return jsonError(`No se pudo obtener token de Salesforce: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }

      const jsonHeaders = () => { const h = new Headers(cors); h.set('Content-Type', 'application/json'); h.set('Cache-Control', 'no-store'); return h; };

      // 2) Resolver el Id del Case por CaseNumber con la API estándar (SOQL). Se usa
      //    la API estándar de Salesforce (existe en todo org) en vez de un Apex REST
      //    custom, para no depender de que esa clase esté desplegada en producción.
      const base = patchInstance;
      const caseNumber = String(payload['CaseNumber']).trim().replace(/'/g, '');
      let caseId = '';
      try {
        const soql = `SELECT Id FROM Case WHERE CaseNumber = '${caseNumber}'`;
        const qRes = await fetchTimeout(`${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }, 20000);
        const qText = await qRes.text();
        if (!qRes.ok) return new Response(qText || JSON.stringify({ status: qRes.status }), { status: qRes.status, headers: jsonHeaders() });
        let qData: { records?: Array<{ Id?: string }> }; try { qData = JSON.parse(qText); } catch { qData = {}; }
        caseId = qData.records?.[0]?.Id || '';
      } catch (e) {
        return jsonError(`No se pudo buscar el Case: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
      if (!caseId) {
        return new Response(JSON.stringify({ message: `No existe un Case con CaseNumber ${caseNumber}.`, errorCode: 'CASE_NOT_FOUND', success: false }),
          { status: 404, headers: jsonHeaders() });
      }

      // 3) PATCH estándar al registro Case con los campos (omite el identificador y
      //    'Customer ID', que no es un campo escribible del Case).
      const OMIT = new Set(['CaseNumber', 'Customer ID']);
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payload)) if (!OMIT.has(k)) fields[k] = v;
      try {
        const upRes = await fetchTimeout(`${base}/services/data/v60.0/sobjects/Case/${caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(fields),
        }, 30000);
        // sObject PATCH devuelve 204 sin body en éxito.
        if (upRes.status === 204) {
          return new Response(JSON.stringify({ success: true, closed: true, caseId, updatedFields: Object.keys(fields) }), { status: 200, headers: jsonHeaders() });
        }
        const upText = await upRes.text();
        return new Response(upText || JSON.stringify({ success: false, status: upRes.status }), { status: upRes.status, headers: jsonHeaders() });
      } catch (e) {
        return jsonError(`PATCH a Salesforce falló: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
    }

    // ── Admin Global66 (bloqueo/desbloqueo): POST /admin/customer-status ─────────
    //   Replica el bot Flujo_emergencia_activo_B2C: refresh-token → idToken, y por
    //   cada customerId: (1) blacklist/OFAC, (2) compliance/{status}, (3) last-step
    //   (solo si aplica al status y lastStep=true). El REFRESH_TOKEN de admin vive
    //   como secret (G66_ADMIN_REFRESH_TOKEN). Acción de ALTO impacto: bloquea/
    //   desbloquea clientes reales — el frontend confirma antes de llamar.
    // ── Diagnóstico de SOLO LECTURA del paso 2: GET /admin/compliance-historial ─
    //
    // Existe para poder probar la migración SIN escribir nada. Hace un solo
    // `GET` al historial de compliance de un cliente con la credencial que ya
    // tiene el Worker, y devuelve la respuesta cruda.
    //
    // Con esa única llamada se responden tres cosas que hoy bloquean:
    //   · ¿el idToken de Lens sirve contra los endpoints BO?
    //   · ¿el rol del usuario resuelve un área válida, o sale 400 / 403?
    //   · ¿cuál es la forma REAL del JSON de `history`? (los nombres de campo
    //     se venían infiriendo de los labels del Admin)
    //
    // NO crea, NO resuelve, NO modifica nada. Es un GET.
    if (url.pathname === '/admin/compliance-historial') {
      if (request.method !== 'GET') return jsonError('Método no permitido', 405, cors);
      const refresh = env.G66_ADMIN_REFRESH_TOKEN;
      if (!refresh) return jsonError('Falta el secret G66_ADMIN_REFRESH_TOKEN en el Worker', 500, cors);
      const cid = String(url.searchParams.get('customerId') || '').trim();
      if (!cid) return jsonError('Falta customerId', 400, cors);

      let idToken = '';
      const tokRes = await fetchTimeout(`${G66_ADMIN_BASE}/admin/refresh-token`, {
        method: 'POST',
        headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ refreshToken: refresh }).toString(),
      }, 20000);
      const tokText = await tokRes.text();
      if (!tokRes.ok) {
        return new Response(JSON.stringify({ paso: 'refresh-token', ok: false, status: tokRes.status, detalle: tokText.slice(0, 400) }),
          { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      idToken = (JSON.parse(tokText) as { idToken?: string }).idToken || '';

      // El claim `custom:title` del token es lo que el gateway convierte en
      // `Claim-User-Admin-Rol`, y de ahí sale el área. Se expone acá —solo ese
      // campo, no el token— porque es justo el dato que falta averiguar.
      let claims: unknown = null;
      try {
        const payload = idToken.split('.')[1];
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const c = JSON.parse(json) as Record<string, unknown>;
        claims = { 'custom:title': c['custom:title'], 'custom:admin_id': c['custom:admin_id'], email: c.email };
      } catch { claims = { error: 'no se pudo leer el token' }; }

      const res = await fetchTimeout(`${G66_ADMIN_BASE}${MS_HISTORIAL(cid)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': idToken,
          // Sin `Claim-Email`, igual que el camino de escritura: el gateway lo
          // inyecta desde el token y mandarlo lo CONCATENA. Acá es un GET y no
          // ensuciaría ningún registro, pero se saca para que no quede el
          // ejemplo a mano de que "se puede mandar".
        },
      }, 30000);
      const txt = await res.text();
      let data: unknown; try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt.slice(0, 2000) }; }

      return new Response(JSON.stringify({
        ok: res.ok, customerId: cid, ruta: MS_HISTORIAL(cid),
        httpStatus: res.status, claimsDelToken: claims, respuesta: data,
      }, null, 2), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/admin/customer-status') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const refresh = env.G66_ADMIN_REFRESH_TOKEN;
      if (!refresh) return jsonError('Falta el secret G66_ADMIN_REFRESH_TOKEN en el Worker', 500, cors);

      let body: {
        customerIds?: (number | string)[]; status?: string; comment?: string;
        observation?: string; agent?: string; ofacFlag?: boolean; ofacProvider?: string;
        countryCode?: string; lastStep?: boolean;
        pepEnabled?: boolean; pepValue?: boolean; pepProvider?: string;
        pepCountryCode?: string; pepPosition?: string | null;
        riskEnabled?: boolean; riskLevel?: string;
      };
      try { body = await request.json(); } catch { return jsonError('Body JSON inválido', 400, cors); }

      const ids = (body.customerIds || []).map(x => String(x).trim()).filter(Boolean);
      const status = String(body.status || '').trim();
      const countryCode = String(body.countryCode || '').trim().toUpperCase();
      if (!ids.length) return jsonError('Faltan customerIds', 400, cors);
      if (!G66_STATUS_VALIDOS.includes(status)) return jsonError(`status inválido: ${status}`, 400, cors);
      if (!countryCode) return jsonError('Falta countryCode', 400, cors);

      // 1) refresh-token → idToken (form-urlencoded, igual que el bot).
      let idToken = '';
      try {
        const tokRes = await fetchTimeout(`${G66_ADMIN_BASE}/admin/refresh-token`, {
          method: 'POST',
          headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ refreshToken: refresh }).toString(),
        }, 20000);
        const tokText = await tokRes.text();
        if (!tokRes.ok) return new Response(JSON.stringify({ error: 'refresh-token de admin falló', status: tokRes.status, detalle: tokText.slice(0, 400) }),
          { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
        idToken = (JSON.parse(tokText) as { idToken?: string }).idToken || '';
        if (!idToken) return jsonError('admin no devolvió idToken', 502, cors);
      } catch (e) {
        return jsonError(`No se pudo obtener idToken de admin: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }

      const authH = { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Authorization': idToken };
      const doStep = async (method: string, path: string, payload?: unknown) => {
        const res = await fetchTimeout(`${G66_ADMIN_BASE}${path}`, {
          method, headers: authH,
          body: payload === undefined ? undefined : JSON.stringify(payload),
        }, 30000);
        const t = await res.text();
        let data: unknown; try { data = t ? JSON.parse(t) : {}; } catch { data = { raw: t }; }
        return { ok: res.ok, status: res.status, data };
      };

      const results: { customerId: string; ok: boolean; steps: Record<string, unknown> }[] = [];
      for (const id of ids) {
        const steps: Record<string, unknown> = {};
        let ok = true;
        // PASO 1 — blacklist / OFAC
        const s1 = await doStep('POST', `/customer/bo/customer-info/${encodeURIComponent(id)}/blacklist`,
          { blacklistFlag: !!body.ofacFlag, blacklistProvider: body.ofacProvider || 'REGCHECK' });
        steps.blacklist = s1; if (!s1.ok) ok = false;
        // PASO 2 — estado de compliance.
        //
        // ES EL ÚNICO PASO QUE MIGRA a ms-customer. Los otros cuatro —blacklist,
        // PEP, risk level y last-step— siguen yendo a api.global66.com, por
        // decisión del 08-09-2026.
        //
        // Se elige con `MODELO_ADMIN`, que arranca en 'anterior': desplegar este
        // Worker NO cambia el comportamiento de nadie. Volver atrás es cambiar
        // esa variable, no revertir un commit.
        if (ok) {
          const s2 = modeloAdmin(env) === 'nuevo'
            ? await paso2MsCustomer(env, idToken, id, status, body)
            : await doStep('POST', `/customer/bo/customer-info/${encodeURIComponent(id)}/compliance/${encodeURIComponent(status)}`,
                { comment: body.comment || '', observation: body.observation || '', agent: body.agent || '' });
          steps.compliance = s2; if (!s2.ok) ok = false;
        }
        // PASO 3 — PEP (PUT isPep): busca el pepId del KYC principal y lo actualiza.
        if (ok && body.pepEnabled) {
          const info = await doStep('GET', `/customer/bo/customer-info/${encodeURIComponent(id)}`);
          if (!info.ok) { steps.pep = info; ok = false; }
          else {
            const kycList = ((info.data as { customerKycList?: Array<{ isMain?: boolean; countryCode?: string; customerKycPep?: { id?: number | string } }> })?.customerKycList) || [];
            const mainKyc = kycList.find(k => k?.isMain === true);
            const pepId = mainKyc?.customerKycPep?.id;
            if (!pepId) {
              steps.pep = { ok: false, status: 0, data: { error: 'No se encontró customerKycPep.id en el KYC principal (isMain=true)' } };
              ok = false;
            } else {
              const sp = await doStep('PUT', `/customer/bo/customer-info/${encodeURIComponent(id)}/pep/${encodeURIComponent(String(pepId))}`,
                { isPep: !!body.pepValue, provider: body.pepProvider || 'PreLastStep', countryCode: body.pepCountryCode || countryCode, position: body.pepPosition ?? null });
              steps.pep = sp; if (!sp.ok) ok = false;
            }
          }
        }
        // PASO 4 — Risk Level (PUT /customer): solo si riskEnabled y hay valor.
        if (ok && body.riskEnabled && body.riskLevel) {
          const sr = await doStep('PUT', `/customer/bo/customer-info/${encodeURIComponent(id)}/customer`, { riskLevel: body.riskLevel });
          steps.risk = sr; if (!sr.ok) ok = false;
        }
        // PASO 5 — last-step. Va al final, como en el flujo viejo.
        //
        // Se decide con el estado en el que el cliente QUEDÓ, no con el que se
        // pidió, y SIN depender de `ok`. Las dos cosas son a propósito:
        //
        // · `ok` acumula las fallas de todos los pasos anteriores. En el modelo
        //   nuevo el paso 2 tiene más formas de fallar —por ejemplo un bloqueo
        //   de otra área que no se puede resolver—, así que con el gate viejo un
        //   cliente podía quedar LIBERADO en compliance y sin last-step. O sea,
        //   liberado pero sin poder operar, y sin que nadie lo note.
        //
        // · Gatear por el estado EFECTIVO es más seguro que por el pedido: si el
        //   cliente no terminó liberado, el estado no está en la lista y el
        //   last-step no corre. Se corrige solo.
        //
        // En el modelo anterior no hay estado verificado, así que se usa el
        // pedido y el comportamiento queda idéntico al de siempre.
        const compData = (steps.compliance as { data?: { estadoEfectivo?: string } } | undefined)?.data;
        const estadoFinal = compData?.estadoEfectivo || status;
        if (body.lastStep && G66_STATUS_REQUIERE_LAST_STEP.has(estadoFinal)) {
          const s3 = await doStep('GET', `/customer/bo/${encodeURIComponent(id)}/${encodeURIComponent(countryCode)}/last-step`);
          steps.lastStep = s3; if (!s3.ok) ok = false;
        } else if (body.lastStep) {
          // Que quede escrito POR QUÉ no corrió: "no aparece" y "no correspondía"
          // se ven igual en el resultado, y son cosas distintas.
          steps.lastStep = { omitido: `el cliente quedó en ${estadoFinal}, que no requiere last-step` };
        }
        results.push({ customerId: id, ok, steps });
      }

      return new Response(JSON.stringify({ ok: results.every(r => r.ok), results }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    // ── Admin Global66 (remesas): POST /admin/transaction-status ────────────────
    //   Cambia el estado de una transacción replicando el script de referencia:
    //   refresh-token → idToken, y por cada transactionId: GET del detalle, se
    //   modifica SOLO el campo txStatus, y POST del objeto completo de vuelta.
    //
    //   Es una ruta APARTE de /admin/customer-status a propósito: aquella opera
    //   sobre el CLIENTE (blacklist/compliance/last-step) y esta sobre la
    //   TRANSACCIÓN. Comparten el secret del refresh-token y nada más.
    //
    //   ⚠️ ALTO IMPACTO: libera plata real. El frontend confirma antes de llamar.
    if (url.pathname === '/admin/transaction-status') {
      if (request.method !== 'POST') return jsonError('Método no permitido', 405, cors);
      const refresh = env.G66_ADMIN_REFRESH_TOKEN;
      if (!refresh) return jsonError('Falta el secret G66_ADMIN_REFRESH_TOKEN en el Worker', 500, cors);

      let body: {
        transactionIds?: (number | string)[];
        targetStatusDB?: string; targetStatusLabel?: string;
      };
      try { body = await request.json(); } catch { return jsonError('Body JSON inválido', 400, cors); }

      const ids = (body.transactionIds || []).map(x => String(x).trim()).filter(Boolean);
      const targetDB = String(body.targetStatusDB || '').trim();
      const targetLabel = String(body.targetStatusLabel || '').trim();
      if (!ids.length) return jsonError('Faltan transactionIds', 400, cors);
      if (!targetDB) return jsonError('Falta targetStatusDB', 400, cors);

      let idToken = '';
      try {
        const tokRes = await fetchTimeout(`${G66_ADMIN_BASE}/admin/refresh-token`, {
          method: 'POST',
          headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ refreshToken: refresh }).toString(),
        }, 20000);
        const tokText = await tokRes.text();
        if (!tokRes.ok) return new Response(JSON.stringify({ error: 'refresh-token de admin falló', status: tokRes.status, detalle: tokText.slice(0, 400) }),
          { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
        idToken = (JSON.parse(tokText) as { idToken?: string }).idToken || '';
        if (!idToken) return jsonError('admin no devolvió idToken', 502, cors);
      } catch (e) {
        return jsonError(`No se pudo obtener idToken de admin: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }

      const authH = { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Authorization': idToken };

      // txStatus puede venir como objeto ({id, status, statusDB, …}) o como string.
      // Si es objeto hay que CONSERVAR la estructura y cambiar solo las llaves de
      // estado: mandar el string pelado no sirve (así lo resolvió el script).
      const nuevoTxStatus = (actual: unknown): unknown => {
        if (actual && typeof actual === 'object' && !Array.isArray(actual)) {
          const o = { ...(actual as Record<string, unknown>) };
          o.status = targetLabel || o.status;
          o.statusDB = targetDB;
          if ('label' in o) o.label = targetLabel || o.label;
          if ('name' in o) o.name = targetLabel || o.name;
          if ('value' in o) o.value = targetDB;
          return o;   // se conserva el id original: no se inventan catálogos
        }
        return targetDB;
      };
      const statusDBDe = (v: unknown): string =>
        (v && typeof v === 'object' && !Array.isArray(v))
          ? String((v as Record<string, unknown>).statusDB ?? '')
          : String(v ?? '');

      const results: Array<Record<string, unknown>> = [];
      for (const id of ids) {
        try {
          const getRes = await fetchTimeout(`${G66_ADMIN_BASE}/transaction/admin/${encodeURIComponent(id)}`,
            { method: 'GET', headers: authH }, 30000);
          const getText = await getRes.text();
          if (!getRes.ok) {
            results.push({ transactionId: id, ok: false, paso: 'GET', status: getRes.status, detalle: getText.slice(0, 300) });
            continue;
          }
          const actual = JSON.parse(getText) as Record<string, unknown>;
          const anterior = statusDBDe(actual.txStatus);

          // Idempotente: si ya está en el estado objetivo no se vuelve a guardar.
          if (anterior === targetDB) {
            results.push({ transactionId: id, ok: true, omitido: true, estadoAnterior: anterior, estadoNuevo: anterior });
            continue;
          }

          const actualizado = { ...actual, txStatus: nuevoTxStatus(actual.txStatus) };
          const postRes = await fetchTimeout(`${G66_ADMIN_BASE}/transaction/admin/${encodeURIComponent(id)}`,
            { method: 'POST', headers: authH, body: JSON.stringify(actualizado) }, 30000);
          const postText = await postRes.text();
          results.push({
            transactionId: id, ok: postRes.ok, paso: 'POST', status: postRes.status,
            estadoAnterior: anterior, estadoNuevo: targetDB,
            detalle: postRes.ok ? undefined : postText.slice(0, 300),
          });
        } catch (e) {
          results.push({ transactionId: id, ok: false, paso: 'ERROR', detalle: e instanceof Error ? e.message : String(e) });
        }
      }

      return new Response(JSON.stringify({ ok: results.every(r => r.ok), results }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    // ── Barrido de empresas en Admin: GET /admin/company-sweep ──────────────────
    //   Lista empresas de `/company/bo` con filtros, para alimentar la cola KYB.
    //   Solo LECTURA. El secreto del refresh-token queda del lado del Worker.
    //
    //   ⚠️ Admin IGNORA EN SILENCIO los parámetros que no conoce y devuelve el
    //   universo completo (72.207 empresas al momento de escribir esto). Un typo
    //   en el nombre de un filtro no da error: trae todo. Por eso:
    //     · solo se reenvían los parámetros de la allowlist
    //     · se devuelve también `totalSinFiltro`, para que el cliente pueda
    //       comprobar que el filtro efectivamente filtró antes de encolar nada
    if (url.pathname === '/admin/company-sweep') {
      if (request.method !== 'GET') return jsonError('Método no permitido', 405, cors);
      const refresh = env.G66_ADMIN_REFRESH_TOKEN;
      if (!refresh) return jsonError('Falta el secret G66_ADMIN_REFRESH_TOKEN en el Worker', 500, cors);

      // Allowlist: verificados contra la API. `countryCode` e `institutional`
      // NO filtran (se ignoran del lado de Admin), así que no se aceptan para no
      // dar una falsa sensación de filtro.
      const PERMITIDOS = new Set(['page', 'size', 'sort', 'kycStage1', 'kycStage2', 'kycStage3',
        'complianceStatus', 'country', 'companyIds', 'riskLevel', 'segmentationType']);
      const filtros = new URLSearchParams();
      const rechazados: string[] = [];
      for (const [k, v] of url.searchParams) {
        if (k === 'dryRun') continue;
        if (PERMITIDOS.has(k)) filtros.set(k, v);
        else rechazados.push(k);
      }
      if (!filtros.has('size')) filtros.set('size', '50');
      if (!filtros.has('page')) filtros.set('page', '0');
      const dryRun = url.searchParams.get('dryRun') === '1';

      let idToken = '';
      try {
        const tokRes = await fetchTimeout(`${G66_ADMIN_BASE}/admin/refresh-token`, {
          method: 'POST',
          headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ refreshToken: refresh }).toString(),
        }, 20000);
        const t = await tokRes.text();
        if (!tokRes.ok) return jsonError(`refresh-token de admin falló: ${t.slice(0, 300)}`, 502, cors);
        idToken = (JSON.parse(t) as { idToken?: string }).idToken || '';
        if (!idToken) return jsonError('admin no devolvió idToken', 502, cors);
      } catch (e) {
        return jsonError(`No se pudo obtener idToken: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }

      const authH = { 'Accept': 'application/json', 'Authorization': idToken };
      const pedir = async (qs: string) => {
        const r = await fetchTimeout(`${G66_ADMIN_BASE}/company/bo?${qs}`, { headers: authH }, 30000);
        const t = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
        return JSON.parse(t) as { elements?: unknown[]; totalElements?: number };
      };

      try {
        // El universo sin filtros, para poder detectar un filtro que no filtró.
        const control = await pedir('size=1&page=0');
        const totalSinFiltro = Number(control.totalElements ?? 0);

        const datos = await pedir(filtros.toString());
        const total = Number(datos.totalElements ?? 0);
        const elementos = (datos.elements ?? []) as Record<string, unknown>[];

        // En dryRun no se devuelven las empresas, solo el conteo: sirve para
        // confirmar que el filtro funciona antes de traer nada.
        const cuerpo: Record<string, unknown> = {
          total,
          totalSinFiltro,
          filtroAplicado: total !== totalSinFiltro,
          filtros: Object.fromEntries(filtros),
          parametrosIgnorados: rechazados,
          dryRun,
        };
        if (!dryRun) {
          // Los campos que la fila de la cola necesita, MÁS el registro crudo.
          //
          // El crudo se devuelve porque esta llamada ya trajo el objeto completo
          // de la empresa (56 claves, con representantes, socios y documentos):
          // recortarlo obligaba al análisis a volver a pedir lo mismo por
          // empresa. Con el crudo, la ficha se puede abrir con datos apenas la
          // empresa entra a la cola, sin analizar nada.
          //
          // Es un SNAPSHOT con fecha, no una fuente de verdad: el análisis
          // siempre re-consulta. Decidir sobre datos de hace días es justo el
          // problema que ya tuvimos con las fichas del proveedor.
          cuerpo.empresas = elementos.map(c => ({
            crudo: c,
            companyId: String(c.id ?? ''),
            razonSocial: String(c.name ?? ''),
            identificacion: String(c.identificationNumber ?? ''),
            pais: String((c.addressCountry as Record<string, unknown> | undefined)?.name ?? c.country__c ?? ''),
            complianceStatus: String(c.complianceStatus ?? ''),
            kycStage1: String(c.kycStage1 ?? ''),
            riskLevel: String(c.riskLevel ?? ''),
            institucional: c.institutional === true,
            // Necesario para cortar por fecha del lado del cliente: Admin NO
            // tiene filtro de fecha (probados 8 nombres, todos ignorados), pero
            // el orden natural del listado ya viene de más nueva a más vieja.
            creadoEn: String(c.createAt ?? c.recordCreatedAt ?? ''),
          })).filter(e => e.companyId);
        }
        return new Response(JSON.stringify(cuerpo), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch (e) {
        return jsonError(`Barrido falló: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }
    }

    // ── Relay Inspektor: /inspektor/<path> → INSPEKTOR_BASE/<path> ──────────────
    if (url.pathname.startsWith('/inspektor/')) {
      const path = url.pathname.slice('/inspektor'.length); // ej: /Auth/login
      const target = INSPEKTOR_BASE + path + url.search;
      const fwHeaders: Record<string, string> = {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      };
      const auth = request.headers.get('Authorization');
      if (auth) fwHeaders['Authorization'] = auth;

      let upstream: Response;
      try {
        upstream = await fetchTimeout(target, {
          method: request.method,
          headers: fwHeaders,
          body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : await request.text(),
        }, 30000);
      } catch (e) {
        return jsonError(`No se pudo conectar con Inspektor desde el proxy: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
      }

      const bodyText = await upstream.text();
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      return new Response(bodyText, { status: upstream.status, headers });
    }

    // ── Relay EmpresaDocs S3: GET /relay?url=… ─────────────────────────────────
    if (url.pathname === '/relay') {
      if (request.method !== 'GET') return jsonError('Método no permitido', 405, cors);
      const target = url.searchParams.get('url');
      if (!target) return jsonError('Falta el parámetro "url"', 400, cors);
      let parsed: URL;
      try { parsed = new URL(target); } catch { return jsonError('URL inválida', 400, cors); }
      const hostOk = ALLOWED_HOST_SUFFIXES.some(s => parsed.hostname.endsWith(s));
      if (parsed.protocol !== 'https:' || !hostOk) return jsonError('Host no permitido (solo S3)', 403, cors);
      let upstream: Response;
      try { upstream = await fetch(parsed.toString()); }
      catch { return jsonError('Error descargando desde S3', 502, cors); }
      if (!upstream.ok) return jsonError(`S3 respondió ${upstream.status}`, upstream.status, cors);
      const headers = new Headers(cors);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
      const len = upstream.headers.get('Content-Length');
      if (len) headers.set('Content-Length', len);
      headers.set('Cache-Control', 'no-store');
      return new Response(upstream.body, { status: 200, headers });
    }

    return jsonError('No encontrado', 404, cors);
  },
};
