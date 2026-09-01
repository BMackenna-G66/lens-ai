// Flujo automático DESATENDIDO de la Bandeja de Casos.
//
// Hace lo mismo que hoy hace la app cuando la pestaña está abierta: por cada
// caso de la cola lo consulta en listas, cruza el resultado con el catálogo,
// decide Liberar / Liberar UCR / Fully Blocked, y cierra en Salesforce y en
// Admin. La única diferencia es que corre sin navegador.
//
// PRINCIPIO: este archivo NO reimplementa nada. El screening, la decisión y los
// cierres se importan del mismo código que usa la app:
//
//   screening  → services/casosCriminalService.screenCaso
//   decisión   → services/flujoDecision.evaluarCasoAuto
//   payload SF → services/cierreTipos.camposDeCierre
//   cierre SF  → services/salesforceCaseService.sendCaseUpdate
//   cierre Adm → services/adminCierreService.enviarCierreAdmin
//
// Si las reglas se escribieran acá otra vez, con el tiempo divergirían de las de
// la app y este proceso liberaría de noche algo que la app habría retenido. Lo
// único propio es la capa de Firestore, porque el SDK del navegador no corre en
// Lambda.

import { EventBridgeClient, EnableRuleCommand, DisableRuleCommand, DescribeRuleCommand }
  from '@aws-sdk/client-eventbridge';
import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { screenCaso, esScreenable } from '../../../services/casosCriminalService';
import { evaluarCasoAuto, statusDeCaso, statusTrasCierre, normalizarFlujoConfig } from '../../../services/flujoDecision';
import type { FlujoOfacConfig, ConfigNormalizada } from '../../../services/flujoDecision';
import { TIPOS_CIERRE, camposDeCierre } from '../../../services/cierreTipos';
import { TIPOS_CIERRE_ADMIN, ADMIN_ASSIGNEE_DEFAULT, PEP_PROVIDER_DEFAULT, ofacFlagPara } from '../../../services/cierreAdminTipos';
import { sendCaseUpdate } from '../../../services/salesforceCaseService';
import { enviarCierreAdmin } from '../../../services/adminCierreService';
import { evaluarRemesaAuto, extraerRemesa, clasificarCola } from '../../../services/flujoDecision';
import type { FlujoRemesaConfig } from '../../../services/flujoDecision';
import { TIPOS_CIERRE_REMESA, camposDeCierreRemesa } from '../../../services/cierreRemesaTipos';
import { enviarCierreRemesaAdmin } from '../../../services/remesaAdminService';
import { buscarRemesas } from '../../../services/remesasService';
import { screenBeneficiario } from '../../../services/remesaScreeningService';
import { dniDelCliente, tipoDniDelCliente } from '../../../services/remesaSamePerson';
import type { CasoSF } from '../../../services/casosService';

// ── Configuración de la corrida ─────────────────────────────────────────────
const COLECCION = process.env.FIRESTORE_COLLECTION || 'casos_sf';
const CONFIG_DOC = process.env.CONFIG_DOC || 'config/flujoAutomatico';
// La versión de esquema del screening. Tiene que coincidir con SCREENING_SCHEMA
// de casosService: si suben una y no la otra, el Lambda re-consulta todo o no
// re-consulta nada.
const SCREENING_SCHEMA = Number(process.env.SCREENING_SCHEMA || '3');
// Tope de reloj, no de cantidad. Regcheq tiene mediana ~4 s pero p90 ~47 s y
// máximo observado 104 s, así que "N casos por corrida" no acota nada. Se corta
// por tiempo y lo que queda se toma en la corrida siguiente: el screening queda
// cacheado, así que no se paga dos veces.
const PRESUPUESTO_MS = Number(process.env.PRESUPUESTO_MS || '780000');   // 13 min de los 15
const LOTE = Number(process.env.LOTE || '4');                           // concurrencia, igual que la app
const TOPE_CASOS = Number(process.env.TOPE_CASOS || '500');

let app: App | undefined;
function db(): Firestore {
  if (!app) {
    const b64 = process.env.FIREBASE_SA_JSON;
    if (!b64) throw new Error('Falta FIREBASE_SA_JSON');
    const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getFirestore(app);
}

// ── Config del flujo ────────────────────────────────────────────────────────
// La normalización es LA MISMA función que usa la app (`normalizarFlujoConfig`).
// Antes esto normalizaba por su cuenta y con los `tipo*` ausentes el Lambda
// decidía `sin_conclusion` donde la app decidía `liberar_normal`: la decisión no
// podía divergir, pero su input sí. Lo encontró la auditoría comparando los dos
// caminos sobre 512 combinaciones de config.
//
// Se relee ENTRE LOTES, no una sola vez al arranque: el switch es el cortafuegos
// y tiene que frenar la corrida en curso, no la siguiente.
async function leerConfig(): Promise<ConfigNormalizada | null> {
  const [col, id] = CONFIG_DOC.split('/');
  const snap = await db().collection(col).doc(id).get();
  if (!snap.exists) return null;      // sin doc = nunca se configuró = apagado
  return normalizarFlujoConfig(snap.data() as Record<string, unknown>);
}

// ¿El screening guardado sirve, o hay que volver a consultar al proveedor?
//
// Mira DOS cosas, no una. La versión del esquema sola no alcanza: el camino de
// remesas guarda el screening incluso cuando el proveedor falló —
// `screenBeneficiario` no lanza, DEVUELVE `{ estado: 'error' }`— y ese documento
// sale estampado con la versión actual. Con solo la versión, un screening
// fallido contaba como vigente y el caso NUNCA se reintentaba.
//
// Medido: 7 de las 9 remesas internacionales abiertas estaban congeladas así.
// El comentario del paso 1 ya decía "se reintenta en la corrida siguiente"; el
// código no lo cumplía para remesas.
const screeningVigente = (s: unknown): boolean => {
  const sc = s as { schemaVersion?: number; estado?: string } | undefined;
  if ((sc?.schemaVersion ?? 1) < SCREENING_SCHEMA) return false;
  // Un fallo del proveedor no es un resultado: se vuelve a pedir.
  return sc?.estado !== 'error';
};

// ── Casos de la cola ────────────────────────────────────────────────────────
// POR QUÉ ANTES SE LEÍA TODO. `statusDeCaso` es DERIVADO: si el documento no tiene
// el campo `statusCaso`, lo deduce de `cierres` y `asignacion`. Un caso cerrado por
// el flujo tenía `cierres.sf.ok` y `cierres.admin.ok` pero podía no tener el campo,
// así que una consulta por `statusCaso` se lo habría salteado. Filtrar en memoria
// era correcto y era lo barato de escribir.
//
// Lo que no vi es el costo: la colección tiene ~560 documentos y solo ~105 están
// abiertos. Leer los 560 en cada corrida, cada 5 minutos, son 167.000 lecturas por
// día contra una cuota de 50.000. El flujo se comía 3,3 veces la cuota del proyecto
// solo.
//
// Ahora se consulta por `statusCaso`, que se escribe siempre. Pero NO se asume que
// todos los documentos lo tengan: hasta que el backfill haya corrido, se sigue
// leyendo todo. Un filtro que saltea casos en silencio es peor que uno caro.
// LA CONSULTA ACOTADA NO PUEDE TENER HUECOS. Antes se habilitaba con una marca
// ("el backfill ya corrió") y eso estaba mal: los casos ENTRAN a la colección todo
// el tiempo, y no todos los caminos de entrada escriben `statusCaso`. El receptor
// de Salesforce usa `updateMask` a propósito para no pisar el estado operacional,
// así que no puede escribirlo sin resucitar casos cerrados.
//
// Resultado medido: 156 casos importados quedaron SIN el campo, la consulta
// acotada devolvió 0 abiertos, y el flujo corrió sobre una cola vacía durante
// horas sin avisar nada. Corridas de 750 ms que parecían "no había nada que hacer".
//
// Ahora se comprueba en cada corrida con dos `count()` —que cuestan una lectura
// por cada 1000 documentos, no una por documento— y si falta el campo en alguno,
// la corrida lee completo Y CURA los que faltan. Se arregla sola: la corrida
// siguiente vuelve a ser barata.
const ESTADOS = ['ABIERTO', 'GESTIONANDO', 'CERRADO'];

async function leerCasosAbiertos(): Promise<{ casos: CasoSF[]; lecturas: number; modo: string }> {
  const col = db().collection(COLECCION);
  const [total, conCampo] = await Promise.all([
    col.count().get().then(r => r.data().count),
    col.where('statusCaso', 'in', ESTADOS).count().get().then(r => r.data().count),
  ]);
  const sinCampo = total - conCampo;

  if (sinCampo === 0) {
    const snap = await col.where('statusCaso', 'in', ['ABIERTO', 'GESTIONANDO']).limit(TOPE_CASOS).get();
    // Se reconcilia también acá: un caso con los dos canales cerrados y el campo en
    // ABIERTO tiene que salir de la cola, y esta consulta lo trae igual.
    const arreglos = await reconciliar(snap.docs);
    const casos = snap.docs.map(d => ({ ...(d.data() as object), id: d.id } as CasoSF))
      .filter(c => statusTrasCierre(c.cierres, c.statusCaso, !!c.asignacion?.analistaId) !== 'CERRADO');
    return {
      casos,
      lecturas: snap.size + 2,          // + los dos count
      modo: arreglos.desfasados
        ? `consulta acotada · ${arreglos.desfasados} desfasado(s) corregido(s)`
        : 'consulta acotada',
    };
  }

  // Hay casos sin el campo: se lee completo para no saltearlos, y se les escribe
  // el estado derivado con la misma función que usa la app.
  const snap = await col.limit(TOPE_CASOS * 4).get();
  const casos = snap.docs.map(d => ({ ...(d.data() as object), id: d.id } as CasoSF));

  const arreglos = await reconciliar(snap.docs);

  return {
    casos: casos.filter(c => statusTrasCierre(c.cierres, c.statusCaso, !!c.asignacion?.analistaId) !== 'CERRADO')
      .slice(0, TOPE_CASOS),
    lecturas: snap.size + 2,
    modo: `lectura completa · ${arreglos.sinCampo} sin statusCaso, ${arreglos.desfasados} desfasados`,
  };
}

// Pone el `statusCaso` de acuerdo con la realidad de los canales.
//
// Dos casos, y el segundo no lo vi hasta mirar corridas reales:
//
//   · SIN el campo → se deriva. Son los que entran por caminos que no lo escriben.
//   · DESFASADO: el campo dice ABIERTO y los DOS canales están cerrados. Esos
//     casos se quedaban en la cola para siempre y el flujo los reprocesaba en cada
//     corrida reportándolos como "cerrado" otra vez — 54 casos, los mismos 54 en
//     todas las corridas. No se corregían por `guardarCierre` porque cuando los dos
//     canales ya están cerrados ese camino no se ejecuta: sale por `ya_cerrado`.
//
// Solo se corrige HACIA CERRADO. Nunca al revés: bajar un status podría devolver a
// la cola un caso que alguien cerró a mano.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reconciliar(docs: any[]): Promise<{ sinCampo: number; desfasados: number }> {
  let batch = db().batch(), enBatch = 0, sinCampo = 0, desfasados = 0;
  for (const d of docs) {
    const data = d.data() as Record<string, unknown> & CasoSF;
    const guardado = typeof data.statusCaso === 'string' ? data.statusCaso : '';
    const real = statusTrasCierre(data.cierres, guardado || undefined, !!data.asignacion?.analistaId);

    let nuevo: string | null = null;
    if (!guardado) { nuevo = statusDeCaso({ ...(data as object), id: d.id } as CasoSF); sinCampo++; }
    else if (guardado !== 'CERRADO' && real === 'CERRADO') { nuevo = 'CERRADO'; desfasados++; }
    if (!nuevo) continue;

    batch.set(d.ref, { statusCaso: nuevo }, { merge: true });
    enBatch++;
    if (enBatch >= 400) { await batch.commit(); batch = db().batch(); enBatch = 0; }
  }
  if (enBatch > 0) await batch.commit();
  return { sinCampo, desfasados };
}

// Curar TODOS los documentos de una, sin esperar a que lo haga una corrida. Es una
// herramienta, no un requisito: la corrida se cura sola.
async function correrBackfill(): Promise<Record<string, unknown>> {
  const snap = await db().collection(COLECCION).limit(5000).get();
  let escritos = 0, yaTenian = 0;
  const TOPE_BATCH = 400;
  let batch = db().batch(), enBatch = 0;

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (typeof data.statusCaso === 'string' && data.statusCaso) { yaTenian++; continue; }
    const derivado = statusDeCaso({ ...(data as object), id: d.id } as CasoSF);
    batch.set(d.ref, { statusCaso: derivado }, { merge: true });
    escritos++; enBatch++;
    if (enBatch >= TOPE_BATCH) { await batch.commit(); batch = db().batch(); enBatch = 0; }
  }
  if (enBatch > 0) await batch.commit();

  // Ya no deja marca: la corrida comprueba en cada pasada si falta el campo en
  // alguno y se cura sola. La marca era justamente lo que creaba el hueco — decía
  // "ya está" mientras entraban casos nuevos sin el campo.
  return { backfill: true, documentos: snap.size, escritos, yaTenian };
}

// ── Persistencia ────────────────────────────────────────────────────────────
// Lo único que este archivo implementa por su cuenta: el SDK del navegador no
// corre acá. La forma de los documentos es la misma que escribe la app.
//
// El SDK de servidor RECHAZA `undefined` con un error, no lo ignora como el del
// navegador. La app resuelve esto con un round-trip por JSON antes de escribir
// (`paraFirestore` en casosService) y acá hace falta lo mismo: sin esto, un
// screening con cualquier campo opcional vacío tira la escritura entera. Apareció
// en la primera corrida real, con `screeningBeneficiario.mensaje` en undefined.
const limpio = <T>(v: T): T => JSON.parse(JSON.stringify(v));
async function guardarScreening(caseId: string, screening: unknown): Promise<void> {
  await db().collection(COLECCION).doc(caseId).set(limpio({
    screening: { ...(screening as object), schemaVersion: SCREENING_SCHEMA, screenedAt: new Date().toISOString() },
  }), { merge: true });
}

// Además del canal, se escribe `statusCaso`. Antes solo se escribía `cierres` y el
// status quedaba DERIVADO: por eso una consulta por `statusCaso` se salteaba los
// casos que este Lambda había cerrado, y por eso había que leer la colección
// entera en cada corrida. Escribirlo acá es lo que hace posible la consulta
// acotada de ahora en más.
//
// Se calcula con `statusDeCaso`, la misma función de la app, sobre el estado ya
// mergeado — así el criterio es idéntico y no hay una segunda definición de
// "cerrado".
async function guardarCierre(
  caseId: string,
  canal: 'sf' | 'admin',
  ok: boolean,
  tipologia: string,
  detalle?: string,
): Promise<void> {
  const ref = db().collection(COLECCION).doc(caseId);
  await db().runTransaction(async tx => {
    const prev = ((await tx.get(ref)).data() ?? {}) as Record<string, unknown>;
    const cierres = {
      ...((prev.cierres ?? {}) as Record<string, unknown>),
      [canal]: { ok, tipologia, en: new Date().toISOString(), detalle: detalle ?? null, por: 'flujo-autonomo' },
    };
    // `statusTrasCierre`, NO `statusDeCaso`: acá los canales tienen que mandar
    // sobre el valor guardado. Con `statusDeCaso` el status quedaba como estaba y
    // 54 casos con los dos canales cerrados siguieron marcados ABIERTO,
    // reprocesándose en cada corrida.
    const status = statusTrasCierre(
      cierres as { sf?: { ok?: boolean }; admin?: { ok?: boolean } },
      prev.statusCaso as string | undefined,
      !!(prev.asignacion as { analistaId?: string } | undefined)?.analistaId,
    );
    tx.set(ref, limpio({ cierres, statusCaso: status, actualizadoEn: new Date().toISOString() }), { merge: true });
  });
}

// LATIDO. Un documento ÚNICO que se sobreescribe en cada invocación, corra o no.
//
// Hace falta porque una invocación que no procesa —flujo apagado, candado tomado—
// no registra resumen, y con razón: a 15 minutos serían 96 documentos por día
// diciendo "no hice nada". Pero sin latido la app muestra el último resumen real y
// eso se lee como que el flujo está trabado, cuando en realidad está vivo y
// apagado. Pasó: el mensaje quedó clavado en la corrida de ayer a las 13:45.
//
// Una escritura por invocación, sin acumular nada.
async function latir(estado: Record<string, unknown>): Promise<void> {
  await db().collection('config').doc('flujoAutonomoLatido')
    .set(limpio({ ...estado, en: new Date().toISOString() }), { merge: true })
    .catch(() => {});
}

// Traza de la corrida. Un proceso que cierra casos de compliance sin nadie
// mirando tiene que dejar por qué hizo cada cosa, incluidas las retenciones.
async function registrarCorrida(resumen: Record<string, unknown>): Promise<void> {
  await db().collection('flujo_autonomo_corridas').add(limpio({
    ...resumen,
    en: new Date().toISOString(),
  }));
}

// ── Un caso ─────────────────────────────────────────────────────────────────
interface ResultadoCaso {
  caseId: string;
  numeroCaso?: string;
  accion: 'cerrado' | 'retenido' | 'sin_screening' | 'error';
  motivo?: string;
  tipologia?: string;
  sf?: string;
  admin?: string;
}

async function procesar(caso: CasoSF, cfg: FlujoOfacConfig): Promise<ResultadoCaso> {
  const base = { caseId: caso.id, numeroCaso: caso.numeroCaso };

  // 1. Screening. Si ya hay uno vigente no se vuelve a consultar: una consulta
  //    por caso, y el proveedor no se paga dos veces.
  let screening = caso.screening as Record<string, unknown> | undefined;
  if (!screeningVigente(screening)) {
    if (!esScreenable(caso)) return { ...base, accion: 'sin_screening', motivo: 'país sin screening' };
    try {
      screening = (await screenCaso(caso)) as unknown as Record<string, unknown>;
      await guardarScreening(caso.id, screening);
    } catch (e) {
      // Un fallo del proveedor NO es "sin coincidencias": el caso queda como
      // estaba y se reintenta en la corrida siguiente.
      return { ...base, accion: 'error', motivo: `screening: ${(e as Error).message}` };
    }
  }

  // 2. Decisión. La misma función que corre en el navegador.
  const ev = evaluarCasoAuto(caso, screening as never, cfg);
  if (!ev.automatizable || !ev.tipologia) {
    return { ...base, accion: 'retenido', motivo: ev.motivo };
  }

  // `accion` se decide DESPUÉS de intentar los canales, no antes: si los dos
  // fallan, esto no es un cierre. Reportarlo como cerrado sería el mismo error
  // que ya arreglamos en el KYB — un fallo nuestro presentado como un resultado.
  const out: ResultadoCaso = { ...base, accion: 'error', tipologia: ev.tipologia, sf: 'omitido', admin: 'omitido' };

  // 3. Cierre en Salesforce.
  if (cfg.cerrarSF) {
    if (caso.cierres?.sf?.ok === true) out.sf = 'ya_cerrado';
    else {
      const tipo = TIPOS_CIERRE.find(t => t.id === ev.tipologia);
      if (!tipo) { out.sf = 'error'; out.motivo = `tipología SF desconocida: ${ev.tipologia}`; }
      else {
        const payload = { CaseNumber: caso.numeroCaso, ...camposDeCierre(tipo, caso.pais) };
        try {
          const firma = await reservarEnvioSF(caso.id, payload);
          if (!firma) {
            // Alguien ya mandó este mismo cierre. No se reenvía y NO se registra
            // como un cierre nuevo: eso es lo que hacía que la auditoría mostrara
            // dos cierres donde solo hubo un update.
            out.sf = 'ya_cerrado';
          } else {
            const r = await sendCaseUpdate(payload as never);
            out.sf = r.ok ? 'ok' : 'error';
            if (!r.ok) out.motivo = r.errors?.join('; ') ?? `HTTP ${r.status ?? 0}`;
            await marcarEnvioSF(caso.id, firma, !!r.ok, out.motivo);
            await guardarCierre(caso.id, 'sf', !!r.ok, ev.tipologia, out.motivo);
          }
        } catch (e) { out.sf = 'error'; out.motivo = (e as Error).message; }
      }
    }
  }

  // 4. Cierre en Admin.
  if (cfg.cerrarAdmin) {
    const customerId = String(caso.datos?.['Id interno del usuario'] ?? '').trim();
    if (caso.cierres?.admin?.ok === true) out.admin = 'ya_cerrado';
    else if (!customerId) out.admin = 'sin_customer_id';
    else {
      const tipo = TIPOS_CIERRE_ADMIN.find(t => t.id === ev.tipologia);
      if (!tipo) { out.admin = 'error'; out.motivo = out.motivo ?? `tipología Admin desconocida: ${ev.tipologia}`; }
      else {
        const cc = /colombia|^co$/i.test(caso.pais ?? '') ? 'CO' : 'CL';
        try {
          const r = await enviarCierreAdmin({
            customerIds: [customerId], status: tipo.status, comment: tipo.comment, observation: tipo.observation,
            agent: ADMIN_ASSIGNEE_DEFAULT, ofacFlag: ofacFlagPara(tipo.status), ofacProvider: 'REGCHECK',
            countryCode: cc, lastStep: tipo.lastStepDefault,
            pepEnabled: tipo.pepValue !== undefined, pepValue: !!tipo.pepValue,
            pepProvider: PEP_PROVIDER_DEFAULT, pepCountryCode: cc, pepPosition: null,
            riskEnabled: !!tipo.riskLevel, riskLevel: tipo.riskLevel || undefined,
          } as never);
          out.admin = r.ok ? 'ok' : 'error';
          if (!r.ok) out.motivo = out.motivo ?? r.error ?? 'Admin rechazó el cierre';
          await guardarCierre(caso.id, 'admin', !!r.ok, ev.tipologia, out.motivo);
        } catch (e) { out.admin = 'error'; out.motivo = out.motivo ?? (e as Error).message; }
      }
    }
  }

  // Cerrado = al menos un canal quedó ok o ya estaba cerrado. Si todos los
  // canales pedidos fallaron, es error y se reintenta en la corrida siguiente.
  const canales = [
    cfg.cerrarSF ? out.sf : null,
    cfg.cerrarAdmin ? out.admin : null,
  ].filter((v): v is string => v !== null);
  const algunoOk = canales.some(c => c === 'ok' || c === 'ya_cerrado');
  const todosFallaron = canales.length > 0 && canales.every(c => c === 'error');
  out.accion = algunoOk ? 'cerrado' : todosFallaron ? 'error' : 'cerrado';
  // Ningún canal pedido: el flujo está configurado para no cerrar nada. No es
  // un cierre ni un error — se registra como retenido con su motivo.
  if (canales.length === 0) { out.accion = 'retenido'; out.motivo = 'sin canales de cierre habilitados'; }

  return out;
}

// ── Guard de idempotencia del cierre en Salesforce ──────────────────────────
// La app cierra por `enviarResolucion`, que tiene este guard; este Lambda usa
// `sendCaseUpdate` directo y NO lo tenía. Es el hueco que importa, y lo encontré
// al medir por qué los 69 cierres duplicados de producción no habían mandado dos
// updates: **el guard de la app los frenó todos**. Los 69 tienen un solo
// `RESPUESTA_SF_COMPLETADA`. Sin esto, el Lambda sería el primer camino capaz de
// mandar el update dos veces de verdad.
//
// Misma semántica que `caseResolutionService`: se marca ENVIANDO en transacción,
// se envía, y se marca el resultado. Si otro ya lo mandó con el mismo payload, no
// se manda de nuevo.
function hashCorto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// Devuelve null si NO hay que enviar (ya se envió lo mismo, o hay un envío en
// curso). Devuelve la firma si hay que enviar.
// Cuánto vale un ENVIANDO antes de considerarlo abandonado. Es el techo de
// Lambda: más que eso y la corrida que lo tomó ya no existe.
const ENVIANDO_TTL_MS = 15 * 60 * 1000;

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ¿Salesforce rechazó por un bloqueo momentáneo del registro?
//
// Es lo que devuelve cuando otro proceso —típicamente sus propios flows— está
// tocando el caso. Salesforce lo dice explícito: "Inténtelo de nuevo". Se
// distingue de un rechazo real (picklist inválido, campo obligatorio) porque
// ese no se arregla reintentando y no hay que gastarle 5 segundos.
function esBloqueoTemporalSF(r: { errors?: string[]; status?: number } | undefined): boolean {
  const txt = (r?.errors ?? []).join(' ').toUpperCase();
  return /UNABLE_TO_LOCK_ROW|REGISTRO NO DISPONIBLE|INT[EÉ]NTELO DE NUEVO|QUERYEXCEPTION|ROW LOCK/.test(txt);
}

async function reservarEnvioSF(caseId: string, payload: unknown): Promise<string | null> {
  const firma = hashCorto(`${caseId}|${JSON.stringify(payload)}`);
  const ref = db().collection(COLECCION).doc(caseId);
  return db().runTransaction(async tx => {
    const prev = ((await tx.get(ref)).data() ?? {}).respuestaSalesforce as
      { estado?: string; idempotencyKey?: string; intentos?: number; ultimoIntentoEn?: string } | undefined;
    // ENVIANDO VENCE. Si una corrida murió entre reservar y enviar —timeout, OOM,
    // el Lambda cortado— el caso quedaba en ENVIANDO para siempre y NUNCA volvía a
    // poder cerrarse: el guard lo rechazaba en cada corrida. Es la causa de los
    // casos que quedan "pegados".
    //
    // Pasado el techo de Lambda, el ENVIANDO ya no puede ser de una corrida viva,
    // así que se ignora y se reintenta.
    if (prev?.estado === 'ENVIANDO') {
      const desde = prev.ultimoIntentoEn ? new Date(prev.ultimoIntentoEn).getTime() : 0;
      const vencido = desde > 0 && (Date.now() - desde) > ENVIANDO_TTL_MS;
      if (!vencido) return null;
      // Vencido: sigue de largo y vuelve a reservar.
    }
    if (prev?.estado === 'ENVIADA' && prev.idempotencyKey === firma) return null;
    tx.set(ref, limpio({
      respuestaSalesforce: {
        ...(prev ?? {}), estado: 'ENVIANDO', idempotencyKey: firma,
        intentos: (prev?.intentos ?? 0) + 1, ultimoIntentoEn: new Date().toISOString(),
      },
    }), { merge: true });
    return firma;
  });
}

async function marcarEnvioSF(caseId: string, firma: string, ok: boolean, error?: string): Promise<void> {
  await db().collection(COLECCION).doc(caseId).set(limpio({
    respuestaSalesforce: {
      estado: ok ? 'ENVIADA' : 'ERROR', idempotencyKey: firma,
      completadoEn: ok ? new Date().toISOString() : null,
      codigoError: error ?? null,
    },
  }), { merge: true });
}

// ── El cron, prendido y apagado desde la app ────────────────────────────────
// El navegador no puede tocar EventBridge, así que el Lambda maneja su propia
// regla. Es la única forma de que el interruptor esté en el mantenedor y no en una
// terminal.
//
// Y son DOS interruptores por diseño, no por accidente: este cron y el switch de
// Firestore. El de Firestore frena hasta la corrida en curso porque se relee entre
// lotes; este evita que la corrida arranque. Que el cron se pueda apagar desde la
// app no los junta — siguen siendo dos.
const REGLA_CRON = process.env.REGLA_CRON || 'lens-flujo-autonomo';
const eb = new EventBridgeClient({});

async function estadoCron(): Promise<{ estado: string; horario?: string }> {
  const r = await eb.send(new DescribeRuleCommand({ Name: REGLA_CRON }));
  return { estado: r.State ?? 'DESCONOCIDO', horario: r.ScheduleExpression };
}

async function cambiarCron(a: 'ENABLED' | 'DISABLED'): Promise<Record<string, unknown>> {
  await eb.send(a === 'ENABLED'
    ? new EnableRuleCommand({ Name: REGLA_CRON })
    : new DisableRuleCommand({ Name: REGLA_CRON }));
  // Se relee de EventBridge en vez de devolver lo que se pidió: el output de un
  // deploy decía DISABLED mientras la regla seguía ENABLED, y por creerle a eso el
  // cron siguió corriendo apagado. La única fuente que vale es la regla.
  const real = await estadoCron();
  await latir({ cronCambiado: a, cronEstado: real.estado });
  return { cron: real.estado, horario: real.horario, pedido: a };
}

// ── Candado de corrida ──────────────────────────────────────────────────────
// Una corrida a la vez. Con el cron a 30 min era imposible que se pisaran; a 5 min
// deja de serlo si entran muchos casos de golpe. Y el botón «Correr ahora» puede
// caer justo encima de una corrida del cron.
//
// El candado vence solo: si un Lambda muere sin liberarlo (OOM, timeout duro), el
// siguiente lo toma pasado el vencimiento en vez de quedar bloqueado para siempre.
const LOCK_DOC = 'config/flujoAutonomoLock';
const LOCK_TTL_MS = 15 * 60 * 1000;   // el techo de Lambda: más que eso, murió

async function tomarCandado(quien: string): Promise<{ ok: boolean; motivo?: string }> {
  const [col, id] = LOCK_DOC.split('/');
  const ref = db().collection(col).doc(id);
  try {
    return await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const d = snap.exists ? (snap.data() as { hasta?: string; quien?: string }) : null;
      if (d?.hasta && new Date(d.hasta).getTime() > Date.now()) {
        return { ok: false, motivo: `otra corrida en curso (${d.quien ?? '?'}), vence ${d.hasta}` };
      }
      tx.set(ref, { quien, desde: new Date().toISOString(),
                    hasta: new Date(Date.now() + LOCK_TTL_MS).toISOString() });
      return { ok: true };
    });
  } catch (e) {
    // Si el candado no se puede tomar por un error, NO se corre. Preferir no
    // hacer nada antes que arriesgar dos ejecutores.
    return { ok: false, motivo: `no se pudo tomar el candado: ${(e as Error).message}` };
  }
}

async function soltarCandado(): Promise<void> {
  const [col, id] = LOCK_DOC.split('/');
  await db().collection(col).doc(id).set({ hasta: null, liberadoEn: new Date().toISOString() }, { merge: true })
    .catch(() => {});
}

// ── Un caso de la cola REMESA ───────────────────────────────────────────────
// El recorrido es distinto del de OFAC: hay que traer la fila de la transacción
// (que trae al beneficiario) antes de poder screenearlo, y lo que se libera es la
// TRANSACCIÓN en Admin, no el cliente.
//
// La decisión y sus frenos son los mismos que en la app —incluido que PEP NO
// retiene una remesa— porque es la misma función.
async function procesarRemesa(
  caso: CasoSF,
  fila: unknown,
  cfg: FlujoRemesaConfig,
  baseCaida: boolean,
): Promise<ResultadoCaso> {
  const base = { caseId: caso.id, numeroCaso: caso.numeroCaso };

  if (!fila) {
    // Ojo con el motivo: si el cluster de Redshift estaba pausado, `buscarRemesas`
    // devuelve vacío sin lanzar error, y decir "no se encontró la transacción"
    // sería afirmar algo sobre el caso cuando el problema es nuestro. Es el mismo
    // error que corregimos en KYB: un fallo de infraestructura presentado como un
    // dato del cliente. `baseCaida` lo distingue.
    return baseCaida
      ? { ...base, accion: 'error', motivo: 'la base de transacciones no respondió (cluster pausado o caído): reintentar' }
      // NO decir "no está en la base": la consulta va contra el ESPEJO de
      // Redshift, y una remesa recién creada existe en Admin pero todavía no
      // replicó. El caso se retoma solo en la corrida siguiente.
      : { ...base, accion: 'sin_screening', motivo: 'la transacción todavía no replicó al espejo de Redshift: se retoma en la próxima corrida' };
  }

  // Screening del beneficiario, cacheado igual que el de OFAC.
  //
  // Se le pasa el documento del CLIENTE junto con el switch de "envío a sí
  // mismo": si el beneficiario resulta ser el propio cliente, `screenBeneficiario`
  // corta antes de llamar a ningún proveedor. Esto tiene que estar acá y no solo
  // en la Bandeja porque el ejecutor del flujo automático es este Lambda — sin
  // esto, el atajo solo aplicaría cuando un analista tuviera la pantalla abierta.
  let screening = caso.screeningBeneficiario as Record<string, unknown> | undefined;
  if (!screeningVigente(screening)) {
    try {
      screening = (await screenBeneficiario(fila as never, {
        dniCliente: dniDelCliente(caso as never),
        tipoDniCliente: tipoDniDelCliente(caso as never),
        samePersonActivo: cfg.samePerson === true,
      })) as unknown as Record<string, unknown>;
      await db().collection(COLECCION).doc(caso.id).set(limpio({
        screeningBeneficiario: { ...screening, schemaVersion: SCREENING_SCHEMA, screenedAt: new Date().toISOString() },
      }), { merge: true });
    } catch (e) {
      return { ...base, accion: 'error', motivo: `screening beneficiario: ${(e as Error).message}` };
    }
  }

  const ev = evaluarRemesaAuto(caso, screening as never, cfg);
  if (!ev.automatizable || !ev.tipologia) return { ...base, accion: 'retenido', motivo: ev.motivo };

  const out: ResultadoCaso = { ...base, accion: 'error', tipologia: ev.tipologia, sf: 'omitido', admin: 'omitido' };
  const tipo = TIPOS_CIERRE_REMESA.find(t => t.id === ev.tipologia);
  if (!tipo) return { ...out, motivo: `tipología de remesa desconocida: ${ev.tipologia}` };

  // Admin PRIMERO: es el canal que mueve la plata. Si Salesforce falla, el caso
  // queda abierto con la transacción liberada, que es recuperable; al revés
  // quedaría cerrado en Salesforce con la plata retenida, que no se ve.
  if (cfg.cerrarAdmin) {
    const tx = extraerRemesa(caso.asunto);
    if (caso.cierres?.admin?.ok === true) out.admin = 'ya_cerrado';
    else if (!tx) out.admin = 'sin_transaccion';
    else {
      try {
        const r = await enviarCierreRemesaAdmin({
          transactionIds: [tx], targetStatusDB: tipo.statusDB, targetStatusLabel: tipo.statusLabel,
          requestedBy: 'flujo-autonomo',
        } as never);
        out.admin = r.ok ? 'ok' : 'error';
        if (!r.ok) out.motivo = r.error ?? 'Admin rechazó la liberación';
        await guardarCierre(caso.id, 'admin', !!r.ok, ev.tipologia, out.motivo);
      } catch (e) { out.admin = 'error'; out.motivo = (e as Error).message; }
    }
  }

  if (cfg.cerrarSF) {
    if (caso.cierres?.sf?.ok === true) out.sf = 'ya_cerrado';
    else {
      const payload = { CaseNumber: caso.numeroCaso, ...camposDeCierreRemesa(tipo, caso.pais) };
      try {
        const firma = await reservarEnvioSF(caso.id, payload);
        if (!firma) out.sf = 'ya_cerrado';
        else {
          let r = await sendCaseUpdate(payload as never);

          // Un solo reintento a los 5 s cuando Salesforce contesta que el
          // registro está bloqueado.
          //
          // No es un fallo nuestro: los flows de Salesforce —"Asignación
          // Automática de Casos Compliance"— tocan el caso justo después de
          // crearlo, y mientras dura eso el update rebota. Salesforce mismo dice
          // "Inténtelo de nuevo". Dura segundos.
          //
          // Sin esto, Admin quedaba liberado y el caso a medias hasta la corrida
          // siguiente: hasta 15 minutos en los que alguien lo cierra a mano
          // creyendo que se colgó. Pasó con el caso 02683141.
          //
          // UN solo reintento y listo: si a los 5 s sigue bloqueado, no es el
          // flow de creación y no vale la pena quemar presupuesto de la corrida.
          // El caso queda en ERROR, que NO bloquea `reservarEnvioSF`, así que la
          // próxima corrida lo toma igual.
          if (!r.ok && esBloqueoTemporalSF(r)) {
            await esperar(5000);
            r = await sendCaseUpdate(payload as never);
          }

          out.sf = r.ok ? 'ok' : 'error';
          if (!r.ok) out.motivo = out.motivo ?? (r.errors?.join('; ') ?? `HTTP ${r.status ?? 0}`);
          await marcarEnvioSF(caso.id, firma, !!r.ok, out.motivo);
          await guardarCierre(caso.id, 'sf', !!r.ok, ev.tipologia, out.motivo);
        }
      } catch (e) { out.sf = 'error'; out.motivo = out.motivo ?? (e as Error).message; }
    }
  }

  const canales = [cfg.cerrarSF ? out.sf : null, cfg.cerrarAdmin ? out.admin : null]
    .filter((v): v is string => v !== null);
  const algunoOk = canales.some(c => c === 'ok' || c === 'ya_cerrado');
  out.accion = canales.length === 0 ? 'retenido' : algunoOk ? 'cerrado' : 'error';
  if (canales.length === 0) out.motivo = 'sin canales de cierre habilitados';
  return out;
}

// ── Handler ─────────────────────────────────────────────────────────────────
// El evento llega del cron (EventBridge) o del botón (Function URL). Del segundo
// se exige un secreto en un header: la URL es pública por definición, así que la
// autorización tiene que estar en el pedido.
//
// Nota sobre el riesgo: alguien que lograra disparar una corrida no puede hacer
// que se cierre nada que el cron no cerraría igual. Todos los frenos y los dos
// switches se evalúan lo mismo. El daño posible es gasto, no una decisión mala.
interface EventoHttp {
  headers?: Record<string, string | undefined>;
  requestContext?: unknown;
  body?: string;
}

// La acción, venga de `event.body` (Function URL) o de la raíz (invocación directa).
function leerAccion(evento: unknown): { accion?: string; estado?: string } {
  const e = evento as (EventoHttp & { accion?: string; estado?: string }) | undefined;
  if (e?.accion) return { accion: e.accion, estado: e.estado };
  if (typeof e?.body === 'string' && e.body.trim()) {
    try { return JSON.parse(e.body) as { accion?: string; estado?: string }; }
    catch { return {}; }
  }
  return {};
}

function autorizado(evento: unknown): { ok: boolean; origen: string } {
  const e = evento as EventoHttp | undefined;
  // Sin `requestContext` no vino por HTTP: es el cron.
  if (!e?.requestContext) return { ok: true, origen: 'cron' };
  const esperado = process.env.TRIGGER_SECRET ?? '';
  const dado = e.headers?.['x-lens-trigger'] ?? e.headers?.['X-Lens-Trigger'] ?? '';
  if (!esperado || dado !== esperado) return { ok: false, origen: 'http' };
  return { ok: true, origen: 'manual' };
}

export async function handler(evento?: unknown): Promise<Record<string, unknown>> {
  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);

  // Modo backfill: `{"backfill": true}`. No procesa casos, solo completa el campo
  // `statusCaso` y deja la marca que habilita la consulta acotada.
  if ((evento as { backfill?: boolean } | undefined)?.backfill === true) {
    return correrBackfill();
  }

  const auth = autorizado(evento);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ corrio: false, motivo: 'no autorizado' }) };
  }

  // Consultar o cambiar el cron. Va DESPUÉS de la autorización y ANTES del
  // candado: prender o apagar el cron no es una corrida y no debe esperar a que
  // termine la que esté en curso — justamente se puede querer apagar mientras hay
  // una corriendo.
  //
  // OJO CON DE DÓNDE SE LEE LA ACCIÓN. Por Function URL el JSON del pedido llega
  // en `event.body` como string, no en la raíz del evento: leerla solo de la raíz
  // hacía que `{"accion":"estado"}` cayera en el camino de corrida normal y
  // devolviera "flujo OFAC apagado". Por invocación directa (la CLI, un test) sí
  // viene en la raíz, así que se miran los dos.
  const acc = leerAccion(evento);
  if (acc?.accion === 'estado') return estadoCron();
  if (acc?.accion === 'cron') {
    const pedido = acc.estado === 'ENABLED' ? 'ENABLED' : 'DISABLED';
    return cambiarCron(pedido);
  }

  // Una corrida a la vez.
  const candado = await tomarCandado(`${auth.origen}:${new Date().toISOString()}`);
  if (!candado.ok) {
    await latir({ corrio: false, motivo: candado.motivo, origen: auth.origen });
    return { corrio: false, motivo: candado.motivo, origen: auth.origen };
  }

  try {
    return await correr(arranque, restante, auth.origen);
  } finally {
    await soltarCandado();
  }
}

async function correr(
  arranque: number,
  restante: () => number,
  origen: string,
): Promise<Record<string, unknown>> {
  let conf = await leerConfig();
  if (!conf?.cfg.ofac.enabled) {
    // Apagado no es un error: es el cortafuegos funcionando. Pero se late igual,
    // para que la app pueda distinguir "apagado" de "muerto".
    await latir({ corrio: false, motivo: 'flujo OFAC apagado', origen });
    return { corrio: false, motivo: 'flujo OFAC apagado' };
  }
  // Qué campos se leyeron por defecto. Un proceso desatendido no puede degradarse
  // en silencio: si el doc de config quedó incompleto, tiene que decirlo.
  //
  // Se filtra a `ofac.*`: esta función no toca remesas, así que reportar campos
  // de remesa sería ruido que enseña a ignorar el aviso.
  const camposAusentes = conf.camposAusentes.filter(c => c.startsWith('ofac.'));

  const log: string[] = [];
  const { casos: abiertos, lecturas, modo } = await leerCasosAbiertos();
  // El ASUNTO manda en qué cola va cada caso y las colas no se mezclan: misma
  // regla que la app, misma función.
  const casos = abiertos.filter(c => clasificarCola(c.asunto) === 'ofac');
  const remesas = abiertos.filter(c => clasificarCola(c.asunto) === 'remesa');

  const resultados: ResultadoCaso[] = [];
  const resultadosRemesa: ResultadoCaso[] = [];
  // Cuántas remesas no se miraron porque la base de transacciones estaba pausada.
  // No son errores: es una ventana conocida y se retoman solas.
  let remesasOmitidas = 0;
  let cortadoPorTiempo = false;
  let apagadoEnVuelo = false;

  for (let i = 0; i < casos.length; i += LOTE) {
    if (restante() <= 0) { cortadoPorTiempo = true; break; }

    // El switch se relee ENTRE LOTES: si alguien apaga a mitad de una corrida
    // de 200 casos, la corrida frena acá y no al final.
    conf = await leerConfig();
    if (!conf?.cfg.ofac.enabled) { apagadoEnVuelo = true; break; }

    const lote = casos.slice(i, i + LOTE);
    const hechos = await Promise.all(lote.map(c =>
      procesar(c, conf!.cfg.ofac).catch(e => ({
        caseId: c.id, numeroCaso: c.numeroCaso, accion: 'error' as const, motivo: (e as Error).message,
      }))));
    resultados.push(...hechos);
  }

  // ── Cola REMESA ───────────────────────────────────────────────────────────
  // Switch propio: prender OFAC no prende remesas. Se procesa después porque
  // necesita traer las filas de las transacciones, que es una consulta aparte.
  if (!cortadoPorTiempo && !apagadoEnVuelo && conf?.cfg.remesa.enabled && remesas.length > 0) {
    // Las filas se traen TODAS de una: es una sola consulta para N casos.
    let filas: Record<string, unknown> = {};
    let baseCaida = false;
    const txs = remesas.map(c => extraerRemesa(c.asunto)).filter(Boolean);
    try {
      if (txs.length) filas = await buscarRemesas(txs) as unknown as Record<string, unknown>;
      // `buscarRemesas` se traga los errores del lote y devuelve vacío. Si se
      // pidieron transacciones y no volvió NINGUNA, la base no estaba: el cluster
      // de Redshift pausa todas las noches. No es que las transacciones no existan.
      if (txs.length > 0 && Object.keys(filas).length === 0) baseCaida = true;
    } catch {
      baseCaida = true;
    }
    if (baseCaida) {
      // La base pausa todas las noches (18:30–04:00 Chile) y el cron corre 24/7.
      // Marcar cada caso como error dejaría ~114 corridas por noche con decenas
      // de errores cada una, y el aviso dejaría de significar algo. Se omite el
      // paso completo con UN aviso y los casos se retoman cuando la base vuelve.
      log.push(`la base de transacciones no respondió: ${remesas.length} remesa(s) omitida(s), se retoman en la próxima corrida`);
      remesasOmitidas = remesas.length;
    }

    for (let i = 0; !baseCaida && i < remesas.length; i += LOTE) {
      if (restante() <= 0) { cortadoPorTiempo = true; break; }
      conf = await leerConfig();
      if (!conf?.cfg.remesa.enabled) { apagadoEnVuelo = true; break; }

      const lote = remesas.slice(i, i + LOTE);
      const hechos = await Promise.all(lote.map(c =>
        procesarRemesa(c, filas[extraerRemesa(c.asunto)], conf!.cfg.remesa, baseCaida).catch(e => ({
          caseId: c.id, numeroCaso: c.numeroCaso, accion: 'error' as const, motivo: (e as Error).message,
        }))));
      resultadosRemesa.push(...hechos);
    }
  }

  const contar = (rs: ResultadoCaso[]) => (a: ResultadoCaso['accion']) => rs.filter(r => r.accion === a).length;
  const cuenta = contar(resultados);
  const cuentaR = contar(resultadosRemesa);
  const resumen = {
    corrio: true,
    // Quién la disparó: el cron o el botón. Sirve para leer los resúmenes.
    origen,
    // Cuánto tardó. No se registraba, y con el cron a 5 min es EL dato que avisa
    // si las corridas se acercan al límite: hubo que inferirlo de los timestamps.
    duracionMs: 0,
    // Cuántos documentos leyó la corrida y con qué estrategia. Se registra porque
    // la cuota de lectura del proyecto se agotó por no estar mirando este número.
    lecturas,
    modoLectura: modo,
    // Avisos de la corrida que no son de un caso puntual.
    avisos: log,
    casosEnCola: casos.length,
    procesados: resultados.length,
    cerrados: cuenta('cerrado'),
    retenidos: cuenta('retenido'),
    errores: cuenta('error'),
    sinScreening: cuenta('sin_screening'),
    // Las dos colas se cuentan separadas: mezclarlas escondería que una anduvo y
    // la otra no.
    remesa: {
      enCola: remesas.length,
      procesadas: resultadosRemesa.length,
      cerradas: cuentaR('cerrado'),
      retenidas: cuentaR('retenido'),
      errores: cuentaR('error'),
      // Faltaba y escondía trabajo: 21 casos procesados salían como 0/0/0 porque
      // `sin_screening` no se contaba en ningún lado.
      sinScreening: cuentaR('sin_screening'),
      // Omitidas por la ventana en que Redshift está pausado. Separadas de los
      // errores a propósito: no hay nada que arreglar.
      omitidas: remesasOmitidas,
      motivosRetencion: resultadosRemesa.filter(r => r.accion === 'retenido')
        .reduce<Record<string, number>>((acc, r) => {
          const k = r.motivo ?? 'sin_motivo';
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
      detalle: resultadosRemesa,
    },
    cortadoPorTiempo,
    apagadoEnVuelo,
    // Vacío = el doc de config estaba completo. Con algo adentro, esos campos se
    // resolvieron con el default y conviene revisarlos.
    camposAusentes,
    // Por qué se retuvo cada uno, agregado. Es lo que hay que poder auditar de un
    // proceso que corre sin nadie mirando.
    motivosRetencion: resultados.filter(r => r.accion === 'retenido')
      .reduce<Record<string, number>>((acc, r) => {
        const k = r.motivo ?? 'sin_motivo';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    detalle: resultados,
  };

  resumen.duracionMs = Date.now() - arranque;
  await latir({ corrio: true, origen, duracionMs: resumen.duracionMs,
                cerrados: resumen.cerrados,
                cerradasRemesa: resumen.remesa.cerradas,
                casosEnCola: resumen.casosEnCola });

  // El resumen también va al log de CloudWatch, no solo a Firestore. Sirve para
  // poder auditar una corrida cuando Firestore no se puede leer —pasó: la cuota
  // de lectura del proyecto se agotó y no había forma de saber qué hizo el flujo,
  // teniendo el dato adentro de la función.
  //
  // Va sin el detalle por caso: los conteos y los motivos alcanzan, y el detalle
  // llevaría identificadores de clientes a un log.
  const { detalle: _d, remesa: rem, ...cuentas } = resumen as Record<string, unknown> & {
    detalle?: unknown; remesa?: Record<string, unknown>;
  };
  const { detalle: _dr, ...remCuentas } = (rem ?? {}) as Record<string, unknown> & { detalle?: unknown };
  console.log('RESUMEN_CORRIDA ' + JSON.stringify({ ...cuentas, remesa: remCuentas }));

  await registrarCorrida(resumen).catch(() => {});
  return resumen;
}
