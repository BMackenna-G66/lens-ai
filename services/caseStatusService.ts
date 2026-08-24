// Status operativo del caso en la Bandeja: ABIERTO → GESTIONANDO → CERRADO.
// Es la vista simple del analista (aparte de `estadoCaso`, que es el workflow
// detallado) y decide si el caso sigue en la cola: los CERRADO salen de la cola.
//
// Reglas (automáticas):
//   - caso recién llegado, sin gestión          → ABIERTO
//   - tomado por un analista, o 1 canal cerrado → GESTIONANDO
//   - Salesforce Y Admin cerrados OK            → CERRADO (sale de la cola)
//
// El status se PERSISTE (compartido entre analistas). Si está guardado, manda:
// así un cierre manual explícito o una reapertura no se pisan con la derivación.

import { doc, runTransaction, updateDoc, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import type { CierreCanal } from './casosService';
import { registrarAuditoria } from './caseAuditService';
import type { Actor } from './caseWorkflowService';

export type StatusCaso = 'ABIERTO' | 'GESTIONANDO' | 'CERRADO';
export const STATUS_CASO_VALORES: StatusCaso[] = ['ABIERTO', 'GESTIONANDO', 'CERRADO'];
export type CanalCierre = 'sf' | 'admin';

const esStatus = (v: string): v is StatusCaso =>
  v === 'ABIERTO' || v === 'GESTIONANDO' || v === 'CERRADO';

// Status del caso. Si hay uno persistido, ese manda; si no (casos anteriores a
// este cambio), se deriva de los cierres y la asignación.
// Viven en `flujoDecision.ts` porque el Lambda desatendido las necesita y ese
// módulo no arrastra Firestore. Se reexportan para no cambiar los imports.
export { statusDeCaso, sigueEnCola } from './flujoDecision';

// Registra el resultado de un canal de cierre (Salesforce o Admin) y recalcula el
// status. Si los DOS canales quedaron OK, el caso pasa a CERRADO y sale de la cola.
// Transaccional: dos cierres concurrentes (SF y Admin) no se pisan entre sí.
export async function registrarCierreCanal(
  caseId: string,
  canal: CanalCierre,
  resultado: CierreCanal,
  actor?: Actor,
): Promise<StatusCaso | null> {
  const db = getDb() as Firestore | null;
  if (!db) return null;
  const ref = doc(db, CASOS_COLLECTION, caseId);
  const ahora = new Date().toISOString();

  const nuevoStatus = await runTransaction(db, async tx => {
    const data = (await tx.get(ref)).data() ?? {};
    const cierres = (data.cierres ?? {}) as { sf?: CierreCanal; admin?: CierreCanal };
    const merged = {
      ...cierres,
      [canal]: { ok: !!resultado.ok, en: ahora, tipologia: resultado.tipologia ?? null, detalle: resultado.detalle ?? null },
    };
    const sfOk = merged.sf?.ok === true;
    const adminOk = merged.admin?.ok === true;
    const previo = (data.statusCaso as string | undefined ?? '').toUpperCase();
    // Un caso ya CERRADO no se reabre por un cierre parcial posterior.
    const status: StatusCaso = (sfOk && adminOk) ? 'CERRADO'
      : previo === 'CERRADO' ? 'CERRADO'
        : (sfOk || adminOk) ? 'GESTIONANDO'
          : esStatus(previo) ? previo : 'ABIERTO';
    tx.set(ref, { cierres: merged, statusCaso: status, actualizadoEn: ahora }, { merge: true });
    return status;
  });

  await registrarAuditoria(caseId, {
    tipo: 'STATUS_CAMBIADO',
    actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
    correlationId: caseId, versionCaso: 1,
    metadata: { canal, ok: !!resultado.ok, statusCaso: nuevoStatus, tipologia: resultado.tipologia ?? null },
  }).catch(() => {});

  return nuevoStatus;
}

// Cambio manual del status desde la ficha.
export async function setStatusCaso(caseId: string, status: StatusCaso, actor?: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  await updateDoc(doc(db, CASOS_COLLECTION, caseId), {
    statusCaso: status,
    actualizadoEn: new Date().toISOString(),
  });
  await registrarAuditoria(caseId, {
    tipo: 'STATUS_CAMBIADO', actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
    correlationId: caseId, versionCaso: 1,
    metadata: { statusCaso: status, manual: true },
  }).catch(() => {});
}
