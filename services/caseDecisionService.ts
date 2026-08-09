// Decisión de Compliance + maker-checker (§17, §21, §26 Fase 6).
// Transaccional. NO ejecuta la respuesta a Salesforce (eso es Fase 7).
//
// Placeholders pendientes de negocio (§29): el catálogo de reasonCode es texto
// libre por ahora; la única regla de aprobación codificada es la del documento
// (§21: OFAC_CONFIRMADO exige aprobador distinto). Maker-checker es convención +
// auditoría (no forzable sin backend/reglas — ver §25).

import { doc, runTransaction, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import { registrarAuditoria } from './caseAuditService';
import type { DecisionCompliance, TipoDecision } from './casosComplianceTypes';
import type { Actor } from './caseWorkflowService';

export interface DecisionInput {
  tipo: TipoDecision;
  reasonCode: string;
  justificacion: string;
}

// Regla de aprobación (§21). Solo OFAC confirmado exige maker-checker; el resto
// queda pendiente de definición de negocio (§29.3) → hoy no exige aprobación.
export function requiereAprobacion(tipo: TipoDecision): boolean {
  return tipo === 'OFAC_CONFIRMADO';
}

// Registra (o actualiza) la decisión. Exige justificación. Si requiere aprobación,
// queda PENDIENTE_APROBACION; si no, queda APROBADA (final, sin checker).
export async function registrarDecision(caseId: string, input: DecisionInput, actor: Actor): Promise<DecisionCompliance> {
  if (!input.justificacion.trim()) throw new Error('La justificación es obligatoria.');
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  const ref = doc(db, CASOS_COLLECTION, caseId);

  const dec = await runTransaction(db, async tx => {
    const prev = ((await tx.get(ref)).data() ?? {}).decisionCompliance as DecisionCompliance | undefined;
    if (prev && prev.estado === 'APROBADA') {
      throw new Error('La decisión ya está aprobada; no se puede modificar.');
    }
    const ahora = new Date().toISOString();
    const req = requiereAprobacion(input.tipo);
    const d: DecisionCompliance = {
      estado: req ? 'PENDIENTE_APROBACION' : 'APROBADA',
      tipo: input.tipo,
      reasonCode: input.reasonCode.trim() || null,
      justificacion: input.justificacion.trim(),
      decididoPor: actor.uid,
      decididoEn: ahora,
      requiereAprobacion: req,
      aprobadoPor: null,
      aprobadoEn: null,
    };
    tx.set(ref, { decisionCompliance: d, actualizadoEn: ahora }, { merge: true });
    return d;
  });

  await registrarAuditoria(caseId, {
    tipo: 'DECISION_REGISTRADA', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caseId, versionCaso: 1, metadata: { tipo: dec.tipo, estado: dec.estado },
  });
  return dec;
}

// Aprueba o rechaza una decisión pendiente. Exige que el aprobador sea distinto de
// quien la registró (maker ≠ checker, §26.6.4).
export async function resolverAprobacion(caseId: string, aprobar: boolean, actor: Actor): Promise<DecisionCompliance> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  const ref = doc(db, CASOS_COLLECTION, caseId);

  const dec = await runTransaction(db, async tx => {
    const prev = ((await tx.get(ref)).data() ?? {}).decisionCompliance as DecisionCompliance | undefined;
    if (!prev || prev.estado !== 'PENDIENTE_APROBACION') {
      throw new Error('No hay una decisión pendiente de aprobación.');
    }
    if (prev.decididoPor === actor.uid) {
      throw new Error('El aprobador debe ser distinto de quien registró la decisión (maker-checker).');
    }
    const ahora = new Date().toISOString();
    const d: DecisionCompliance = { ...prev, estado: aprobar ? 'APROBADA' : 'RECHAZADA', aprobadoPor: actor.uid, aprobadoEn: ahora };
    tx.set(ref, { decisionCompliance: d, actualizadoEn: ahora }, { merge: true });
    return d;
  });

  await registrarAuditoria(caseId, {
    tipo: 'DECISION_APROBADA', actorId: actor.uid, actorTipo: 'USER',
    correlationId: caseId, versionCaso: 1, metadata: { resultado: dec.estado },
  });
  return dec;
}
