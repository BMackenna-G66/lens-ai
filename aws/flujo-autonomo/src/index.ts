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

import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { screenCaso, esScreenable } from '../../../services/casosCriminalService';
import { evaluarCasoAuto, statusDeCaso, normalizarFlujoConfig } from '../../../services/flujoDecision';
import type { FlujoOfacConfig, ConfigNormalizada } from '../../../services/flujoDecision';
import { TIPOS_CIERRE, camposDeCierre } from '../../../services/cierreTipos';
import { TIPOS_CIERRE_ADMIN, ADMIN_ASSIGNEE_DEFAULT, PEP_PROVIDER_DEFAULT, ofacFlagPara } from '../../../services/cierreAdminTipos';
import { sendCaseUpdate } from '../../../services/salesforceCaseService';
import { enviarCierreAdmin } from '../../../services/adminCierreService';
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

const screeningVigente = (s: unknown): boolean =>
  ((s as { schemaVersion?: number } | undefined)?.schemaVersion ?? 1) >= SCREENING_SCHEMA;

// ── Casos de la cola ────────────────────────────────────────────────────────
// Se leen los que NO están cerrados. `statusDeCaso` es la misma función que usa
// la app, así que el criterio de "sigue en la cola" es idéntico.
async function leerCasosAbiertos(): Promise<CasoSF[]> {
  const snap = await db().collection(COLECCION).limit(TOPE_CASOS * 2).get();
  const casos = snap.docs.map(d => ({ ...(d.data() as object), id: d.id } as CasoSF));
  return casos.filter(c => statusDeCaso(c) !== 'CERRADO').slice(0, TOPE_CASOS);
}

// ── Persistencia ────────────────────────────────────────────────────────────
// Lo único que este archivo implementa por su cuenta: el SDK del navegador no
// corre acá. La forma de los documentos es la misma que escribe la app.
async function guardarScreening(caseId: string, screening: unknown): Promise<void> {
  await db().collection(COLECCION).doc(caseId).set({
    screening: { ...(screening as object), schemaVersion: SCREENING_SCHEMA, screenedAt: new Date().toISOString() },
  }, { merge: true });
}

async function guardarCierre(
  caseId: string,
  canal: 'sf' | 'admin',
  ok: boolean,
  tipologia: string,
  detalle?: string,
): Promise<void> {
  await db().collection(COLECCION).doc(caseId).set({
    cierres: { [canal]: { ok, tipologia, en: new Date().toISOString(), detalle: detalle ?? null, por: 'flujo-autonomo' } },
  }, { merge: true });
}

// Traza de la corrida. Un proceso que cierra casos de compliance sin nadie
// mirando tiene que dejar por qué hizo cada cosa, incluidas las retenciones.
async function registrarCorrida(resumen: Record<string, unknown>): Promise<void> {
  await db().collection('flujo_autonomo_corridas').add({
    ...resumen,
    en: new Date().toISOString(),
  });
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
        try {
          const r = await sendCaseUpdate({ CaseNumber: caso.numeroCaso, ...camposDeCierre(tipo, caso.pais) } as never);
          out.sf = r.ok ? 'ok' : 'error';
          if (!r.ok) out.motivo = r.errors?.join('; ') ?? `HTTP ${r.status ?? 0}`;
          await guardarCierre(caso.id, 'sf', !!r.ok, ev.tipologia, out.motivo);
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

// ── Handler ─────────────────────────────────────────────────────────────────
export async function handler(): Promise<Record<string, unknown>> {
  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);

  let conf = await leerConfig();
  if (!conf?.cfg.ofac.enabled) {
    // Apagado no es un error: es el cortafuegos funcionando.
    return { corrio: false, motivo: 'flujo OFAC apagado' };
  }
  // Qué campos se leyeron por defecto. Un proceso desatendido no puede degradarse
  // en silencio: si el doc de config quedó incompleto, tiene que decirlo.
  //
  // Se filtra a `ofac.*`: esta función no toca remesas, así que reportar campos
  // de remesa sería ruido que enseña a ignorar el aviso.
  const camposAusentes = conf.camposAusentes.filter(c => c.startsWith('ofac.'));

  const casos = await leerCasosAbiertos();
  const resultados: ResultadoCaso[] = [];
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

  const cuenta = (a: ResultadoCaso['accion']) => resultados.filter(r => r.accion === a).length;
  const resumen = {
    corrio: true,
    casosEnCola: casos.length,
    procesados: resultados.length,
    cerrados: cuenta('cerrado'),
    retenidos: cuenta('retenido'),
    errores: cuenta('error'),
    sinScreening: cuenta('sin_screening'),
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

  await registrarCorrida(resumen).catch(() => {});
  return resumen;
}
