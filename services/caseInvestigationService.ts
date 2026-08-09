// Investigación del analista (§17, §26 Fase 5). Guarda resumen/hallazgos/
// recomendación con VERSIONADO y control de concurrencia optimista: si otro
// analista guardó mientras tanto, se rechaza para no pisar cambios en silencio.

import { doc, runTransaction, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import { registrarAuditoria } from './caseAuditService';
import type { InvestigacionCaso } from './casosComplianceTypes';
import type { Actor } from './caseWorkflowService';

export interface InvestigacionInput {
  resumen: string;
  hallazgos: string[];
  recomendacion: string;
  completa: boolean;   // true → estado COMPLETA; false → EN_CURSO
}

// Error de concurrencia: la versión en Firestore no coincide con la que se editó.
export class ConflictoVersion extends Error {
  constructor() {
    super('Otro analista actualizó la investigación. Recargá el caso para ver los cambios antes de guardar.');
    this.name = 'ConflictoVersion';
  }
}

// Guarda la investigación de forma transaccional. `expectedVersion` es la versión
// que tenía la investigación cuando el analista empezó a editar.
export async function guardarInvestigacion(
  caseId: string, input: InvestigacionInput, expectedVersion: number, actor: Actor,
): Promise<InvestigacionCaso> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  const ref = doc(db, CASOS_COLLECTION, caseId);

  const nueva = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as { investigacion?: InvestigacionCaso };
    const actual = data.investigacion;
    const vActual = actual?.version ?? 0;
    if (vActual !== expectedVersion) throw new ConflictoVersion();

    const ahora = new Date().toISOString();
    const inv: InvestigacionCaso = {
      version: vActual + 1,
      estado: input.completa ? 'COMPLETA' : 'EN_CURSO',
      analistaId: actor.uid,
      iniciadaEn: actual?.iniciadaEn ?? ahora,
      actualizadaEn: ahora,
      resumen: input.resumen || null,
      hallazgos: input.hallazgos,
      evidencias: actual?.evidencias ?? [],
      informacionSolicitada: actual?.informacionSolicitada ?? [],
      recomendacion: input.recomendacion || null,
    };
    // merge:true → solo reemplaza el bloque `investigacion` (y actualizadoEn), sin
    // tocar screening/decision/etc.
    tx.set(ref, { investigacion: inv, actualizadoEn: ahora }, { merge: true });
    return inv;
  });

  await registrarAuditoria(caseId, {
    tipo: 'INVESTIGACION_ACTUALIZADA', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caseId, versionCaso: nueva.version, metadata: { estado: nueva.estado },
  });
  return nueva;
}
