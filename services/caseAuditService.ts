// Auditoría operacional del caso (§22). Escribe en la subcolección
// `casos_sf/{numeroCaso}/auditoria`. NO guarda payload, DNI ni secretos: solo
// metadatos seguros y los cambios de campos operacionales.

import { collection, addDoc, getDocs, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import type { EventoAuditoriaCaso } from './casosComplianceTypes';
import { logEvento } from './colasLogService';

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
  // Espejo analítico en Redshift (fire-and-forget: si falla, la auditoría de
  // Firestore ya quedó escrita igual). Es el único punto donde hay que engancharlo:
  // así TODOS los tipos de evento quedan en colas_trabajo.evento_auditoria.
  logEvento({
    eventId: evento.eventId, numeroCaso: evento.numeroCaso, tipo: evento.tipo,
    actorId: evento.actorId, actorTipo: evento.actorTipo, timestamp: evento.timestamp,
    correlationId: evento.correlationId, versionCaso: evento.versionCaso,
    cambios: evento.cambios, metadata: evento.metadata,
  });
  await addDoc(collection(db, CASOS_COLLECTION, caseId, 'auditoria'), limpio);
}

// Lee la auditoría de un caso (para el backfill del histórico a Redshift).
export async function leerAuditoria(caseId: string): Promise<EventoAuditoriaCaso[]> {
  const db = getDb() as Firestore | null;
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, CASOS_COLLECTION, caseId, 'auditoria'));
    return snap.docs.map(d => d.data() as EventoAuditoriaCaso);
  } catch {
    return [];
  }
}
