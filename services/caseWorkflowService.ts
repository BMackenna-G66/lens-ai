// Workflow del caso (§18, §26 Fase 4): transiciones validadas + asignación, con
// auditoría en la misma operación lógica. Toda escritura es aditiva sobre el
// documento existente (updateDoc con rutas puntuales) y NO pisa otros bloques.

import { doc, updateDoc, runTransaction, Firestore } from 'firebase/firestore';
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
// Error que distingue "no se pudo" de "ya lo tiene otro". La UI necesita
// diferenciarlos: uno se reintenta, el otro se avisa.
export class CasoYaTomado extends Error {
  constructor(public analistaNombre: string, public analistaId: string) {
    super(`El caso ya lo tiene ${analistaNombre}`);
    this.name = 'CasoYaTomado';
  }
}

// RESERVA de verdad. Antes era un `updateDoc` directo: dos analistas que tomaran
// el mismo caso quedaban los dos "asignados" y el segundo pisaba al primero sin
// que ninguno se enterara. Con varios analistas trabajando la cola eso es
// inaceptable — dos personas investigan el mismo caso y una pierde su trabajo.
//
// Ahora va en transacción: se lee la asignación y se escribe solo si sigue libre.
// Firestore reintenta la transacción si el documento cambió en el medio, así que
// no hay ventana entre el chequeo y la escritura.
//
// `versionCaso` ahora SE INCREMENTA. Antes se escribía en cada evento de auditoría
// y nunca se movía: parecía control optimista de concurrencia y no controlaba nada
// (verificado: valía 1 en los dos eventos de cada cierre duplicado).
export async function tomarCaso(caso: CasoRef, actor: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  const ahora = new Date().toISOString();
  const ref = doc(db, CASOS_COLLECTION, caso.id);

  const version = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const asig = (d.asignacion ?? {}) as { analistaId?: string; analistaNombre?: string };

    // Ya lo tiene alguien. Que lo tenga uno mismo no es un error: re-tomar el
    // propio caso es idempotente.
    if (asig.analistaId && asig.analistaId !== actor.uid) {
      throw new CasoYaTomado(asig.analistaNombre || 'otro analista', asig.analistaId);
    }

    const siguiente = Number(d.versionCaso ?? 0) + 1;
    tx.update(ref, {
      'asignacion.analistaId': actor.uid,
      'asignacion.analistaNombre': actor.nombre,
      'asignacion.asignadoEn': ahora,
      'asignacion.asignadoPor': actor.uid,
      estadoCaso: 'ASIGNADO',
      // Tomar el caso es el inicio de la gestión (status simple de la Bandeja).
      statusCaso: 'GESTIONANDO',
      versionCaso: siguiente,
      actualizadoEn: ahora,
    });
    return siguiente;
  });

  await registrarAuditoria(caso.id, {
    tipo: 'CASO_ASIGNADO', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caso.id, versionCaso: version,
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

// Asigna el caso a OTRO analista (distinto de tomarlo uno mismo). Se usa desde la
// cola (masivo) y desde la ficha. Aditivo + auditoría, igual que tomarCaso.
// Asignar a OTRO. Misma reserva que `tomarCaso`, con una diferencia deliberada:
// `forzar` permite reasignar un caso que ya tiene dueño. Un supervisor tiene que
// poder mover un caso de un analista a otro; lo que no puede pasar es hacerlo sin
// saber que estaba tomado. Sin `forzar`, avisa.
export async function asignarCaso(
  caso: CasoRef,
  destino: { uid: string; nombre: string },
  actor: Actor,
  forzar = false,
): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  const ahora = new Date().toISOString();
  const ref = doc(db, CASOS_COLLECTION, caso.id);

  const { version, anterior } = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const asig = (d.asignacion ?? {}) as { analistaId?: string; analistaNombre?: string };

    if (!forzar && asig.analistaId && asig.analistaId !== destino.uid) {
      throw new CasoYaTomado(asig.analistaNombre || 'otro analista', asig.analistaId);
    }

    const siguiente = Number(d.versionCaso ?? 0) + 1;
    tx.update(ref, {
      'asignacion.analistaId': destino.uid,
      'asignacion.analistaNombre': destino.nombre,
      'asignacion.asignadoEn': ahora,
      'asignacion.asignadoPor': actor.uid,
      estadoCaso: 'ASIGNADO',
      statusCaso: 'GESTIONANDO',
      versionCaso: siguiente,
      actualizadoEn: ahora,
    });
    return { version: siguiente, anterior: asig.analistaNombre ?? null };
  });

  await registrarAuditoria(caso.id, {
    tipo: 'CASO_ASIGNADO', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caso.id, versionCaso: version,
    // Queda registrado a quién se le sacó, si se le sacó a alguien.
    metadata: { analistaId: destino.uid, analistaNombre: destino.nombre,
                asignadoPor: actor.nombre, reasignadoDe: anterior, forzado: forzar || null },
  });
}
