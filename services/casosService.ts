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
  screenedAt?: string;       // ISO — cuándo se consultó
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
}

export const isCasosAvailable = (): boolean => !!getDb();

function docToCaso(id: string, data: Record<string, unknown>): CasoSF {
  const datos = (data.datos && typeof data.datos === 'object' ? data.datos : {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    id,
    numeroCaso: s(data.numeroCaso) || s(datos['Número del caso']),
    asunto: s(data.asunto) || s(datos['Asunto']),
    nombreCuenta: s(data.nombreCuenta) || s(datos['Nombre de la cuenta']),
    pais: s(data.pais) || s(datos['País']),
    recibidoEn: s(data.recibidoEn),
    origen: s(data.origen) || 'salesforce',
    datos,
    screening: (data.screening && typeof data.screening === 'object') ? data.screening as StoredScreening : undefined,
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
