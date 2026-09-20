// STAND BY: el freno manual de un caso.
//
// Un analista lo pone cuando el caso necesita una revisión de verdad y no quiere
// que se resuelva mientras tanto — ni solo por el flujo automático, ni por error
// de otra persona en un cierre masivo.
//
// **Frena todo**: flujo automático, whitelist, cierre individual y cierres
// masivos, en las dos colas. La regla se evalúa en `flujoDecision.enStandby`,
// que es el módulo que comparten la app y el Lambda; acá está solo la escritura.
//
// El caso NO sale de la cola: sigue exactamente donde estaba, con su status
// intacto. Esa es la diferencia con cerrarlo — un caso frenado es un caso que
// alguien tiene que mirar, y esconderlo sería el resultado contrario.
//
// Se levanta a mano, con `quitarStandby`.

import { doc, updateDoc, deleteField, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import { registrarAuditoria } from './caseAuditService';
import type { Actor } from './caseWorkflowService';

export const standbyDisponible = (): boolean => !!getDb();

/**
 * Frena el caso. El motivo es obligatorio: un freno sin motivo es un caso
 * trabado que nadie sabe por qué está trabado, y el que lo encuentre no va a
 * tener con qué decidir si puede levantarlo.
 */
export async function ponerStandby(caseId: string, motivo: string, actor?: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado en esta instancia.');
  const texto = motivo.trim();
  if (!texto) throw new Error('El motivo del stand by es obligatorio.');

  const standby = {
    activo: true,
    motivo: texto,
    por: actor?.nombre ?? 'desconocido',
    en: new Date().toISOString(),
  };
  // `updateDoc` con una ruta puntual: aditivo, no pisa ningún otro bloque del
  // caso (screening, cierres, asignación).
  await updateDoc(doc(db, CASOS_COLLECTION, caseId), {
    standby,
    actualizadoEn: standby.en,
  });
  await registrarAuditoria(caseId, {
    tipo: 'STANDBY_PUESTO', actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
    correlationId: caseId, versionCaso: 1,
    metadata: { motivo: texto, por: standby.por },
  }).catch(() => {});
}

/**
 * Levanta el freno.
 *
 * Borra el campo entero en vez de dejar `activo: false`. Es a propósito: un
 * documento con `standby: { activo: false, motivo: 'lo de ayer' }` se lee como
 * si todavía significara algo, y el motivo viejo aparecería en la ficha de un
 * caso que ya no está frenado. Lo que pasó queda en la auditoría, que es donde
 * corresponde.
 */
export async function quitarStandby(caseId: string, actor?: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado en esta instancia.');
  await updateDoc(doc(db, CASOS_COLLECTION, caseId), {
    standby: deleteField(),
    actualizadoEn: new Date().toISOString(),
  });
  await registrarAuditoria(caseId, {
    tipo: 'STANDBY_QUITADO', actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
    correlationId: caseId, versionCaso: 1,
  }).catch(() => {});
}

/** Frena varios de una. Devuelve cuántos salieron bien y cuántos fallaron. */
export async function ponerStandbyVarios(
  caseIds: string[], motivo: string, actor?: Actor,
): Promise<{ ok: number; err: number }> {
  let ok = 0, err = 0;
  for (const id of caseIds) {
    try { await ponerStandby(id, motivo, actor); ok++; } catch { err++; }
  }
  return { ok, err };
}

export async function quitarStandbyVarios(
  caseIds: string[], actor?: Actor,
): Promise<{ ok: number; err: number }> {
  let ok = 0, err = 0;
  for (const id of caseIds) {
    try { await quitarStandby(id, actor); ok++; } catch { err++; }
  }
  return { ok, err };
}
