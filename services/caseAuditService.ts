// Auditoría operacional del caso (§22). Escribe en la subcolección
// `casos_sf/{numeroCaso}/auditoria`. NO guarda payload, DNI ni secretos: solo
// metadatos seguros y los cambios de campos operacionales.

import { collection, addDoc, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import type { EventoAuditoriaCaso } from './casosComplianceTypes';

type NuevoEvento = Omit<EventoAuditoriaCaso, 'eventId' | 'numeroCaso' | 'timestamp'>;

const nuevoId = (): string => {
  try {
    return (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ?? `ev-${Date.now()}`;
  } catch {
    return `ev-${Date.now()}`;
  }
};

// Registra un evento de auditoría. No lanza si Firestore no está configurado.
export async function registrarAuditoria(caseId: string, ev: NuevoEvento): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  const evento: EventoAuditoriaCaso = {
    ...ev,
    eventId: nuevoId(),
    numeroCaso: caseId,
    timestamp: new Date().toISOString(),
  };
  // Firestore no acepta `undefined`: el round-trip por JSON descarta esas claves.
  const limpio = JSON.parse(JSON.stringify(evento));
  await addDoc(collection(db, CASOS_COLLECTION, caseId, 'auditoria'), limpio);
}
