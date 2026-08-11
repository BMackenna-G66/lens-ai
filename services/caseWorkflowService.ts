// Workflow del caso (§18, §26 Fase 4): transiciones validadas + asignación, con
// auditoría en la misma operación lógica. Toda escritura es aditiva sobre el
// documento existente (updateDoc con rutas puntuales) y NO pisa otros bloques.

import { doc, updateDoc, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import { esTransicionValida } from './casosComplianceTypes';
import type { EstadoCaso, PrioridadCaso } from './casosComplianceTypes';
import { registrarAuditoria } from './caseAuditService';

export interface Actor { uid: string; nombre: string; }

interface CasoRef {
  id: string;
  estadoCaso?: EstadoCaso;
  versionCaso?: number;
}

// Cambia el estado del caso validando la transición (§18). Lanza si es inválida.
export async function cambiarEstado(caso: CasoRef, nuevo: EstadoCaso, actor: Actor): Promise<void> {
  const actual: EstadoCaso = caso.estadoCaso ?? 'NUEVO';
  if (actual === nuevo) return;
  if (!esTransicionValida(actual, nuevo)) {
    throw new Error(`Transición inválida: ${actual} → ${nuevo}`);
  }
  const db = getDb() as Firestore | null;
  if (!db) return;
  await updateDoc(doc(db, CASOS_COLLECTION, caso.id), {
    estadoCaso: nuevo,
    actualizadoEn: new Date().toISOString(),
  });
  await registrarAuditoria(caso.id, {
    tipo: 'ESTADO_CAMBIADO', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caso.id, versionCaso: caso.versionCaso ?? 1,
    cambios: { estadoCaso: { anterior: actual, nuevo } },
  });
}

// Fija la prioridad manualmente (override del cálculo preliminar). Permite marcar
// CRÍTICA, que el motor no asigna solo. Aditivo + auditoría.
export async function cambiarPrioridad(
  caso: { id: string; versionCaso?: number; prioridadActual?: PrioridadCaso },
  nueva: PrioridadCaso,
  actor: Actor,
): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  await updateDoc(doc(db, CASOS_COLLECTION, caso.id), {
    prioridad: nueva,
    actualizadoEn: new Date().toISOString(),
  });
  await registrarAuditoria(caso.id, {
    tipo: 'PRIORIDAD_CAMBIADA', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caso.id, versionCaso: caso.versionCaso ?? 1,
    cambios: { prioridad: { anterior: caso.prioridadActual ?? null, nuevo: nueva } },
  });
}

// Toma el caso (lo asigna al analista actual). La asignación es una acción operativa,
// por eso setea estadoCaso=ASIGNADO directamente (no una transición pura).
export async function tomarCaso(caso: CasoRef, actor: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  const ahora = new Date().toISOString();
  await updateDoc(doc(db, CASOS_COLLECTION, caso.id), {
    'asignacion.analistaId': actor.uid,
    'asignacion.analistaNombre': actor.nombre,
    'asignacion.asignadoEn': ahora,
    'asignacion.asignadoPor': actor.uid,
    estadoCaso: 'ASIGNADO',
    actualizadoEn: ahora,
  });
  await registrarAuditoria(caso.id, {
    tipo: 'CASO_ASIGNADO', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caso.id, versionCaso: caso.versionCaso ?? 1,
    metadata: { analistaNombre: actor.nombre },
  });
}

// Libera el caso (lo devuelve a la cola).
export async function liberarCaso(caso: CasoRef, actor: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  const ahora = new Date().toISOString();
  await updateDoc(doc(db, CASOS_COLLECTION, caso.id), {
    'asignacion.analistaId': null,
    'asignacion.analistaNombre': null,
    'asignacion.asignadoEn': null,
    'asignacion.asignadoPor': null,
    estadoCaso: 'EN_COLA',
    actualizadoEn: ahora,
  });
  await registrarAuditoria(caso.id, {
    tipo: 'CASO_LIBERADO', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caso.id, versionCaso: caso.versionCaso ?? 1,
  });
}
