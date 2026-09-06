// Bandeja de Casos — lectura EN VIVO de la colección Firestore `casos_sf`.
//
// La escribe la Lambda `ofac-pep-trx-bot-receptor` (AWS) cuando Salesforce hace
// POST /casos. Este servicio solo LEE (onSnapshot); la app no escribe acá.
// Ver aws/casos-receptor/ para el productor.

import {
  collection, onSnapshot, query, doc, writeBatch, where, limit, getCountFromServer, Firestore,
} from 'firebase/firestore';
import { getDb } from './firebaseService';

export const CASOS_COLLECTION = 'casos_sf';

// Resultado del screening (Regcheq/Inspektor) que se persiste en el caso para no
// re-consultar la lista al recargar. Se guarda desde el navegador (updateDoc).
// Versión del screening guardado. Subirla INVALIDA el caché: los casos con una
// versión anterior se vuelven a consultar solos la próxima vez que se abre la
// cola. Se sube cuando cambia lo que se lee del proveedor, no el formato nomás.
//   v2 → alertas normalizadas
//   v3 → se refresca la ficha de Regcheq antes de leerla y se leen las causas
//        penales de las DOS claves posibles; además se guardan las otras listas
export const SCREENING_SCHEMA = 3;

// ¿El screening guardado sirve, o hay que volver a consultarlo?
// ¿El screening guardado sirve, o hay que volver a consultar al proveedor?
//
// Mira DOS cosas. La versión sola no alcanza: el screening del beneficiario se
// guarda incluso cuando el proveedor falló —`screenBeneficiario` no lanza,
// DEVUELVE `{ estado: 'error' }`— y ese documento queda estampado con la versión
// actual. Con solo la versión, un screening fallido contaba como vigente y el
// caso no se reintentaba nunca.
//
// Medido en la cola: 7 de las 9 remesas internacionales abiertas estaban
// congeladas así, con un error de API de hace días.
export const screeningVigente = (s?: { schemaVersion?: number; estado?: string }): boolean =>
  (s?.schemaVersion ?? 1) >= SCREENING_SCHEMA && s?.estado !== 'error';

export interface StoredScreening {
  schemaVersion?: number;   // ver SCREENING_SCHEMA
  estado?: string;
  fuente?: string;
  delitosUnicos?: number;
  // Desglose de los delitos únicos por tipo de catálogo. Se cachea junto con el
  // resto: sin esto, un screening leído del caché vuelve solo con el total y la
  // ficha pierde el desglose hasta que alguien reconsulte al proveedor.
  precedentes?: number;
  noPrecedentes?: number;
  sinClasificar?: number;
  decision?: string;
  razon?: string;
  coincidencias?: unknown[]; // legacy, se mantiene por compatibilidad de la UI
  alertas?: unknown[];       // v2: alertas normalizadas con dedupKey
  pep?: boolean;             // ¿PEP? (Regcheq/Chile)
  otrasListas?: unknown[];   // coincidencias en listas fuera de la conclusión
  screenedAt?: string;       // ISO — cuándo se consultó
}

// Asignación del caso a un analista (la escribe caseWorkflowService).
export interface AsignacionCasoDoc {
  analistaId?: string | null;
  analistaNombre?: string | null;
  asignadoEn?: string | null;
  asignadoPor?: string | null;
}

// Resultado de cada canal de cierre (SF / Admin), para derivar el status del caso.
export interface CierreCanal {
  ok?: boolean;
  en?: string | null;        // ISO
  tipologia?: string | null;
  detalle?: string | null;
}

export interface CasoSF {
  id: string;
  numeroCaso: string;
  asunto: string;
  nombreCuenta: string;
  pais: string;
  recibidoEn: string;         // ISO
  origen: string;
  datos: Record<string, unknown>;  // payload completo tal cual llegó
  screening?: StoredScreening;     // screening cacheado (si ya se consultó)
  // ── Bloques operacionales (los escriben los servicios de workflow/cierre).
  // Deben viajar en el objeto o la UI no puede mostrar estado/prioridad/asignado.
  estadoCaso?: string;
  prioridad?: string;
  asignacion?: AsignacionCasoDoc;
  versionCaso?: number;
  investigacion?: unknown;
  respuestaSalesforce?: unknown;
  statusCaso?: string;             // ABIERTO | GESTIONANDO | CERRADO
  cierres?: { sf?: CierreCanal; admin?: CierreCanal };
  // ── Cola Remesa: se cachean los dos resultados caros del caso ───────────────
  // Sin esto, cada vez que alguien abre la Bandeja se vuelve a consultar Redshift
  // y a los proveedores de listas, que es lento y se cobra por consulta.
  remesaRow?: Record<string, unknown>;          // fila de la TX (Redshift)
  screeningBeneficiario?: Record<string, unknown>;  // screening del beneficiario
}

export const isCasosAvailable = (): boolean => !!getDb();

// Salesforce numera los Case con ceros a la izquierda a ancho fijo (8 dígitos en
// este org, ej. "02646256"). Si la integración de SF envía el número como valor
// numérico, el cero inicial se pierde en la ingesta (2646256) y el case-update
// falla con CASE_NOT_FOUND. Recuperamos el formato canónico rellenando con ceros
// cuando el valor quedó puramente numérico y más corto que el ancho estándar.
const SF_CASE_NUMBER_WIDTH = 8;
export function normalizeCaseNumber(v: string): string {
  const t = v.trim();
  return /^\d+$/.test(t) && t.length < SF_CASE_NUMBER_WIDTH ? t.padStart(SF_CASE_NUMBER_WIDTH, '0') : t;
}

function docToCaso(id: string, data: Record<string, unknown>): CasoSF {
  const datos = (data.datos && typeof data.datos === 'object' ? data.datos : {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id,
    numeroCaso: normalizeCaseNumber(s(data.numeroCaso) || s(datos['Número del caso'])),
    asunto: s(data.asunto) || s(datos['Asunto']),
    nombreCuenta: s(data.nombreCuenta) || s(datos['Nombre de la cuenta']),
    pais: s(data.pais) || s(datos['País']),
    recibidoEn: s(data.recibidoEn),
    origen: s(data.origen) || 'salesforce',
    datos,
    screening: (data.screening && typeof data.screening === 'object') ? data.screening as StoredScreening : undefined,
    // Passthrough de los bloques operacionales (sin defaults: la UI los resuelve).
    estadoCaso: data.estadoCaso as string | undefined,
    prioridad: data.prioridad as string | undefined,
    asignacion: (data.asignacion && typeof data.asignacion === 'object') ? data.asignacion as AsignacionCasoDoc : undefined,
    versionCaso: typeof data.versionCaso === 'number' ? data.versionCaso : undefined,
    investigacion: data.investigacion,
    respuestaSalesforce: data.respuestaSalesforce,
    statusCaso: data.statusCaso as string | undefined,
    cierres: (data.cierres && typeof data.cierres === 'object') ? data.cierres as CasoSF['cierres'] : undefined,
    remesaRow: (data.remesaRow && typeof data.remesaRow === 'object') ? data.remesaRow as Record<string, unknown> : undefined,
    screeningBeneficiario: (data.screeningBeneficiario && typeof data.screeningBeneficiario === 'object')
      ? data.screeningBeneficiario as Record<string, unknown> : undefined,
  };
}

// Borra casos de la cola (limpieza; los casos se resuelven/cierran en Salesforce).
// Irreversible. Usa writeBatch en tandas (límite 500 por batch de Firestore).
export async function eliminarCasos(ids: string[]): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db || ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    ids.slice(i, i + 450).forEach(id => batch.delete(doc(db, CASOS_COLLECTION, id)));
    await batch.commit();
  }
}

// ── Escrituras de caché agrupadas ────────────────────────────────────────────
// Todo lo que se cachea en el caso (screening, screening del beneficiario, fila de
// la TX) pasa por acá. Las tandas de screening producen un resultado por caso, y
// una escritura suelta por resultado significa un snapshot de TODA la colección
// por resultado: con la cola llena, la tabla se re-renderiza cientos de veces
// seguidas y el navegador se traba. Acá se juntan en una ventana corta y se
// mandan en un solo commit.
const VENTANA_MS = 1500;
// Solo se cachean estos tres campos del caso; el resto lo escriben los servicios
// de workflow, que sí necesitan escribir en el momento.
type PatchCache = Partial<Pick<CasoSF, 'screening' | 'remesaRow' | 'screeningBeneficiario'>>;
const pendientes = new Map<string, PatchCache>();
let timer: ReturnType<typeof setTimeout> | null = null;

function encolar(caseId: string, patch: PatchCache): void {
  if (!caseId) return;
  pendientes.set(caseId, { ...(pendientes.get(caseId) ?? {}), ...patch });
  if (!timer) timer = setTimeout(() => { void vaciarPendientes(); }, VENTANA_MS);
}

// Manda lo acumulado. Best-effort: si falla, el dato se vuelve a consultar en la
// próxima sesión (es caché, no la fuente de verdad).
export async function vaciarPendientes(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const db = getDb() as Firestore | null;
  const items = [...pendientes.entries()];
  pendientes.clear();
  if (!db || items.length === 0) return;
  try {
    for (let i = 0; i < items.length; i += 450) {   // límite de 500 por batch
      const batch = writeBatch(db);
      for (const [caseId, patch] of items.slice(i, i + 450)) {
        batch.update(doc(db, CASOS_COLLECTION, caseId), patch);
      }
      await batch.commit();
    }
  } catch { /* caché best-effort */ }
}

// Si el usuario cierra la pestaña con escrituras en vuelo, se mandan igual.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void vaciarPendientes(); });
}

// Firestore no acepta `undefined`: el round-trip por JSON descarta esas claves.
const paraFirestore = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Persiste el screening del caso en Firestore (compartido entre analistas).
export async function guardarScreening(caseId: string, screening: StoredScreening): Promise<void> {
  encolar(caseId, { screening: paraFirestore({ ...screening, screenedAt: new Date().toISOString() }) });
}

// Cachea la fila de la TX (Redshift) en el caso, para no re-consultarla.
export async function guardarRemesaRow(caseId: string, row: unknown): Promise<void> {
  await guardarRemesaRows([{ caseId, row }]);
}

export async function guardarRemesaRows(items: { caseId: string; row: unknown }[]): Promise<void> {
  const cacheadoEn = new Date().toISOString();
  for (const it of items.filter(i => i.caseId && i.row)) {
    encolar(it.caseId, { remesaRow: paraFirestore({ ...(it.row as object), cacheadoEn }) });
  }
}

// Cachea el screening del beneficiario. Se mantiene hasta que el caso se cierre o
// se borre; para forzar una consulta nueva está el botón "Reconsultar".
export async function guardarScreeningBeneficiario(caseId: string, screening: unknown): Promise<void> {
  if (!screening) return;
  encolar(caseId, {
    screeningBeneficiario: paraFirestore({
      ...(screening as object), schemaVersion: SCREENING_SCHEMA, screenedAt: new Date().toISOString(),
    }),
  });
}

// ── Cuánto se lee para pintar la cola ───────────────────────────────────────
// Esta suscripción leía la colección ENTERA en cada carga: 1.531 documentos para
// mostrar 2 casos abiertos. Con ~33 aperturas se agotaba la cuota diaria de
// Firestore (plan Spark, 50.000 lecturas/día), y al agotarse NO cae solo la
// Bandeja: cae todo Lens, porque comparten el proyecto. Pasó el 05-09-2026, con
// el flujo autónomo mostrando "no se pudo tomar el candado: RESOURCE_EXHAUSTED".
//
// Ahora la cola pide solo lo que muestra. Los CERRADOS se traen únicamente
// cuando alguien los pide con «ver cerrados», que es cuando de verdad importan:
// el acceso al histórico no se pierde, deja de pagarse en cada carga.
//
// POR QUÉ NO SE ACOTA A CIEGAS. `statusCaso` es un campo persistido, pero la UI
// además lo DERIVA de `cierres`/`asignacion`. Un documento sin el campo lo
// saltearía la consulta acotada EN SILENCIO, y el caso desaparecería de la cola
// sin que nadie se entere. Ya pasó del lado del Lambda: 156 casos importados sin
// el campo dieron una cola vacía durante horas. Por eso antes de acotar se
// comprueba con dos `count()` —que cuestan una lectura por cada 1000 documentos,
// no una por documento— que TODOS lo tengan; si falta en alguno, se lee completo
// como antes y se dice por qué. Es el mismo criterio que usa `leerCasosAbiertos`
// en el flujo autónomo: una consulta acotada no puede tener huecos.
const ESTADOS_CASO = ['ABIERTO', 'GESTIONANDO', 'CERRADO'];
const ESTADOS_EN_COLA = ['ABIERTO', 'GESTIONANDO'];
export const TOPE_COLA = 500;

export interface OpcionesCola {
  /** Traer también los CERRADOS. Cuesta leer la colección completa. */
  incluirCerrados?: boolean;
}

/** Qué se terminó leyendo, para que la UI pueda decirlo en vez de que se adivine. */
export interface InfoCola {
  modo: 'acotada' | 'completa';
  leidos: number;
  /** Se llegó al tope: hay casos abiertos que no se están mostrando. */
  truncado: boolean;
  motivo?: string;
}

// Suscripción en vivo. Devuelve unsubscribe. Ordena por recibidoEn desc en cliente
// (evita exigir un índice compuesto en Firestore, igual que antes).
export function subscribeCasos(
  onData: (casos: CasoSF[], info: InfoCola) => void,
  onError?: (msg: string) => void,
  opciones?: OpcionesCola,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) {
    onError?.('Firestore no está configurado.');
    return () => {};
  }

  const col = collection(db, CASOS_COLLECTION);
  let cancelado = false;
  let unsub: (() => void) | null = null;

  const escuchar = (q: ReturnType<typeof query>, info: Omit<InfoCola, 'leidos' | 'truncado'>, tope?: number) => {
    if (cancelado) return;
    unsub = onSnapshot(
      q,
      snap => {
        const casos = snap.docs.map(d => docToCaso(d.id, d.data() as Record<string, unknown>));
        casos.sort((a, b) => (b.recibidoEn || '').localeCompare(a.recibidoEn || ''));
        onData(casos, { ...info, leidos: snap.size, truncado: !!tope && snap.size >= tope });
      },
      err => onError?.(err.message),
    );
  };

  void (async () => {
    // Con los cerrados pedidos no hay filtro que valga: se lee completo, como
    // antes. Y SIN tope, a propósito: un `limit` sin `orderBy` recorta por id, o
    // sea al azar, y un histórico con huecos invisibles es peor que uno caro.
    if (opciones?.incluirCerrados) {
      escuchar(query(col), { modo: 'completa', motivo: 'Se están mostrando los cerrados: se lee la colección completa.' });
      return;
    }

    let todosTienenEstado = false;
    try {
      const [total, conCampo] = await Promise.all([
        getCountFromServer(col),
        getCountFromServer(query(col, where('statusCaso', 'in', ESTADOS_CASO))),
      ]);
      todosTienenEstado = total.data().count === conCampo.data().count;
    } catch {
      // Si el conteo falla (cuota, permisos, red), NO se acota: preferir leer de
      // más antes que esconder casos.
      todosTienenEstado = false;
    }
    if (cancelado) return;

    if (todosTienenEstado) {
      escuchar(query(col, where('statusCaso', 'in', ESTADOS_EN_COLA), limit(TOPE_COLA)), { modo: 'acotada' }, TOPE_COLA);
    } else {
      escuchar(query(col), {
        modo: 'completa',
        motivo: 'Hay casos sin `statusCaso`: se lee la colección completa para no saltear ninguno.',
      });
    }
  })();

  return () => { cancelado = true; unsub?.(); };
}
