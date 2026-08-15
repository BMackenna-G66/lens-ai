// Notificaciones dentro de la aplicación (campanita de la Bandeja).
//
// Hoy se usan para avisarle a un analista que le asignaron casos. Viven en la
// colección `notificaciones` de Firestore y se leen EN VIVO, así que le llegan
// aunque la asignación la haya hecho otra persona desde otra sesión.
//
// No manda correos ni push: es solo dentro de la app, como se pidió.

import {
  collection, addDoc, onSnapshot, query, where, doc, updateDoc, writeBatch, Firestore,
} from 'firebase/firestore';
import { getDb } from './firebaseService';

export const NOTIFICACIONES_COLLECTION = 'notificaciones';

export interface Notificacion {
  id: string;
  uid: string;              // a quién va dirigida
  tipo: string;             // CASOS_ASIGNADOS | ...
  titulo: string;
  detalle?: string;
  casos?: string[];         // números de caso involucrados
  leida: boolean;
  creadaEn: string;         // ISO
  creadaPorNombre?: string;
}

export const notificacionesDisponibles = (): boolean => !!getDb();

// Crea una notificación para un usuario. No lanza: un aviso que falla no puede
// romper la asignación (que es lo importante).
export async function notificar(
  uid: string,
  n: { tipo: string; titulo: string; detalle?: string; casos?: string[]; creadaPorNombre?: string },
): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db || !uid) return;
  try {
    await addDoc(collection(db, NOTIFICACIONES_COLLECTION), {
      uid,
      tipo: n.tipo,
      titulo: n.titulo,
      detalle: n.detalle ?? null,
      casos: n.casos ?? [],
      leida: false,
      creadaEn: new Date().toISOString(),
      creadaPorNombre: n.creadaPorNombre ?? null,
    });
  } catch {
    /* el aviso es best-effort */
  }
}

// Suscripción en vivo a las notificaciones del usuario. Ordena en cliente para no
// exigir un índice compuesto en Firestore.
export function subscribeNotificaciones(
  uid: string,
  onData: (ns: Notificacion[]) => void,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db || !uid) { onData([]); return () => {}; }
  const q = query(collection(db, NOTIFICACIONES_COLLECTION), where('uid', '==', uid));
  return onSnapshot(
    q,
    snap => {
      const ns = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Notificacion, 'id'>) }));
      ns.sort((a, b) => (b.creadaEn || '').localeCompare(a.creadaEn || ''));
      onData(ns.slice(0, 50));
    },
    () => onData([]),
  );
}

export async function marcarLeida(id: string): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  try { await updateDoc(doc(db, NOTIFICACIONES_COLLECTION, id), { leida: true }); } catch { /* noop */ }
}

export async function marcarTodasLeidas(ids: string[]): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db || ids.length === 0) return;
  try {
    for (let i = 0; i < ids.length; i += 450) {
      const batch = writeBatch(db);
      ids.slice(i, i + 450).forEach(id => batch.update(doc(db, NOTIFICACIONES_COLLECTION, id), { leida: true }));
      await batch.commit();
    }
  } catch { /* noop */ }
}
