// Cola de trabajo EN VIVO del Criminal Profiler Chile.
// Lee la colección Firestore `cola_criminal_chile` (que alimenta la ingesta
// Salesforce → Regcheq), mapea cada caso a un PersonProfile, corre el motor de
// decisión con el catálogo MAESTRO, y persiste de vuelta la revisión del analista.
//
// La ingesta (Python) escribe los casos con este contrato; la app solo lee y
// actualiza el bloque `review`. NO recalcula del lado servidor: el scoring vive
// acá (catálogo maestro), fuente única de verdad.

import { collection, onSnapshot, doc, updateDoc, query, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { PersonProfile, Crime, AnalysisAction } from '../types/criminalTypes';
import { DEFAULT_CATALOG } from './defaultCatalogData';
import { applyEvaluationToProfile } from './criminalDataProcessor';

export const CRIMINAL_QUEUE_COLLECTION = 'cola_criminal_chile';

interface QueueCrime { tipo?: string; estado?: string; fecha?: string; tribunal?: string; ruc?: string; rit?: string; riesgo?: string; }
interface QueueReview { estado?: string; accion?: string; notas?: string; reviewer?: string; updatedAt?: string; }
interface QueueDoc {
  caseNumber?: string; internalUserId?: string; dni?: string; nombre?: string; apellido?: string;
  pais?: string; paisCMPL?: string; tipoDni?: string; nacionalidad?: string;
  regcheq?: { screenedAt?: string; crimes?: QueueCrime[]; regcheqRisk?: string; pepLevel?: string };
  review?: QueueReview;
  firstSeenAt?: string; lastReportSeenAt?: string;
}

export const isQueueAvailable = (): boolean => !!getDb();

// Convierte un doc de la cola en un PersonProfile evaluado con el catálogo maestro.
function queueDocToProfile(id: string, data: QueueDoc): PersonProfile {
  const crimes: Crime[] = (data.regcheq?.crimes ?? []).map((c, i) => ({
    id: c.ruc || c.rit || `${id}_c${i}`,
    tipo: c.tipo ?? '', estado: c.estado ?? '', fecha: c.fecha ?? '',
    riesgo: c.riesgo ?? 'N/A', rit: c.rit ?? '', ruc: c.ruc ?? '', tribunal: c.tribunal ?? '',
  })).filter(c => c.tipo);

  const nombre = data.nombre ?? '';
  const apellido = data.apellido ?? '';
  const profile: PersonProfile = {
    rut: data.dni ?? id,
    nombre, apellido,
    nombreCuenta: `${nombre} ${apellido}`.trim() || (data.dni ?? id),
    customerId: data.caseNumber ?? id,   // = doc id (Número del caso) para el write-back
    conInfo: crimes.length > 0,
    crimes,
    totalCrimes: crimes.length, totalHighRiskCrimes: 0, highestRisk: 'n/a',
    status: data.review?.estado === 'Revisado' ? 'Revisado' : 'Pendiente',
    selectedAction: (data.review?.accion as AnalysisAction) ?? '',
    isPep: false,
    notes: data.review?.notas ?? '',
  };
  applyEvaluationToProfile(profile, DEFAULT_CATALOG);
  return profile;
}

// Suscripción en vivo a la cola. Devuelve unsubscribe. `onError` para permisos/config.
export function subscribeCriminalQueue(
  onData: (profiles: PersonProfile[]) => void,
  onError?: (msg: string) => void,
): () => void {
  const db: Firestore | null = getDb();
  if (!db) { onError?.('Firebase no está configurado.'); return () => {}; }
  const q = query(collection(db, CRIMINAL_QUEUE_COLLECTION));
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => queueDocToProfile(d.id, d.data() as QueueDoc))),
    err => onError?.(err.message),
  );
}

// Persiste la revisión del analista en el doc de la cola (solo el bloque review).
export async function updateQueueReview(
  caseNumber: string,
  patch: { estado?: 'Pendiente' | 'Revisado'; accion?: AnalysisAction; notas?: string; reviewer?: string },
): Promise<void> {
  const db = getDb();
  if (!db || !caseNumber) return;
  const fields: Record<string, unknown> = { 'review.updatedAt': new Date().toISOString() };
  if (patch.estado !== undefined) fields['review.estado'] = patch.estado;
  if (patch.accion !== undefined) fields['review.accion'] = patch.accion;
  if (patch.notas !== undefined) fields['review.notas'] = patch.notas;
  if (patch.reviewer !== undefined) fields['review.reviewer'] = patch.reviewer;
  try { await updateDoc(doc(db, CRIMINAL_QUEUE_COLLECTION, caseNumber), fields as never); }
  catch { /* no crítico: la UI ya refleja el cambio; el snapshot reconcilia */ }
}
