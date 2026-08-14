// Bandeja de Casos — lectura EN VIVO de la colección Firestore `casos_sf`.
//
// La escribe la Lambda `ofac-pep-trx-bot-receptor` (AWS) cuando Salesforce hace
// POST /casos. Este servicio solo LEE (onSnapshot); la app no escribe acá.
// Ver aws/casos-receptor/ para el productor.

import { collection, onSnapshot, query, doc, updateDoc, writeBatch, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';

export const CASOS_COLLECTION = 'casos_sf';

// Resultado del screening (Regcheq/Inspektor) que se persiste en el caso para no
// re-consultar la lista al recargar. Se guarda desde el navegador (updateDoc).
export interface StoredScreening {
  schemaVersion?: number;   // 2 = shape extendido (con alertas). Ausente = v1 (legacy).
  estado?: string;
  fuente?: string;
  delitosUnicos?: number;
  decision?: string;
  razon?: string;
  coincidencias?: unknown[]; // legacy, se mantiene por compatibilidad de la UI
  alertas?: unknown[];       // v2: alertas normalizadas con dedupKey
  pep?: boolean;             // ¿PEP? (Regcheq/Chile)
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

// Persiste el screening del caso en Firestore (compartido entre analistas).
export async function guardarScreening(caseId: string, screening: StoredScreening): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  // Firestore no acepta `undefined`: el round-trip por JSON descarta esas claves.
  const limpio = JSON.parse(JSON.stringify({ ...screening, screenedAt: new Date().toISOString() }));
  await updateDoc(doc(db, CASOS_COLLECTION, caseId), { screening: limpio });
}

// Suscripción en vivo. Devuelve unsubscribe. Ordena por recibidoEn desc en cliente
// (evita exigir un índice compuesto en Firestore).
export function subscribeCasos(
  onData: (casos: CasoSF[]) => void,
  onError?: (msg: string) => void,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) {
    onError?.('Firestore no está configurado.');
    return () => {};
  }
  const q = query(collection(db, CASOS_COLLECTION));
  return onSnapshot(
    q,
    snap => {
      const casos = snap.docs.map(d => docToCaso(d.id, d.data() as Record<string, unknown>));
      casos.sort((a, b) => (b.recibidoEn || '').localeCompare(a.recibidoEn || ''));
      onData(casos);
    },
    err => onError?.(err.message),
  );
}
