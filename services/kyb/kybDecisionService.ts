// Decisión del KYB, con maker-checker. Servicio de ESCRITURA propio del módulo.
//
// Regla central: el que decide NO puede aprobar su propia decisión. Vale también
// para el sistema — una decisión automática queda PENDIENTE_APROBACION con actor
// `system`, y `system` no puede resolverla.
//
// Qué exige checker está en DECISIONES_CON_CHECKER (types/kyb.ts): rechazar,
// apetito de riesgo e institucional, más TODO lo automático. Aprobar manual queda
// final por decisión de negocio.

import { doc, updateDoc, getDoc, Firestore } from 'firebase/firestore';
import { getDb } from '../firebaseService';
import {
  KYB_COLLECTION, DECISIONES_CON_CHECKER, canalesCompletos,
  type DecisionKyb, type TipoDecisionKyb, type EmpresaKyb,
} from '../../types/kyb';

const paraFirestore = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export interface NuevaDecision {
  tipo: TipoDecisionKyb;
  comentario?: string;
  reasonCode?: string | null;
  actorId: string;
  actorNombre: string;
  actorTipo: 'USER' | 'SYSTEM';
  automatica: boolean;
}

// ¿Esta decisión necesita un segundo par de ojos?
export function requiereChecker(tipo: TipoDecisionKyb, automatica: boolean): boolean {
  // Todo lo automático necesita checker, sin importar el tipo. Un auto-aprobar en
  // KYC de empresas es un incidente regulatorio si sale mal, no un bug.
  return automatica || DECISIONES_CON_CHECKER.has(tipo);
}

export async function registrarDecisionKyb(companyId: string, nueva: NuevaDecision): Promise<DecisionKyb> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');

  const ref = doc(db, KYB_COLLECTION, companyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`La empresa ${companyId} no está en la cola.`);

  const previa = (snap.data() as EmpresaKyb).decision;
  // No se pisa una decisión ya tomada: si hay que cambiarla, se revierte
  // explícitamente. Sobrescribir en silencio borraría la trazabilidad.
  if (previa && previa.aprobacion?.estado !== 'RECHAZADA') {
    throw new Error(`La empresa ya tiene una decisión registrada (${previa.tipo}).`);
  }

  const necesitaChecker = requiereChecker(nueva.tipo, nueva.automatica);
  const decision: DecisionKyb = {
    tipo: nueva.tipo,
    reasonCode: nueva.reasonCode ?? null,
    comentario: nueva.comentario,
    actorId: nueva.actorId,
    actorNombre: nueva.actorNombre,
    actorTipo: nueva.actorTipo,
    automatica: nueva.automatica,
    decididaEn: new Date().toISOString(),
    ...(necesitaChecker ? {
      aprobacion: { estado: 'PENDIENTE_APROBACION' as const, checkerId: null, checkerNombre: null, resueltaEn: null, motivo: null },
    } : {}),
  };

  await updateDoc(ref, {
    decision: paraFirestore(decision),
    // Una decisión pone el caso en gestión; el cierre depende de los canales de
    // salida, no de la decisión sola.
    estadoCaso: 'DECIDIDO',
  });
  return decision;
}

export interface ResolucionChecker {
  checkerId: string;
  checkerNombre: string;
  aprobar: boolean;
  motivo?: string;
}

// El checker resuelve. Rechaza si es la misma persona que decidió: es la regla
// que hace que el maker-checker sirva de algo.
export async function resolverAprobacionKyb(companyId: string, r: ResolucionChecker): Promise<DecisionKyb> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');

  const ref = doc(db, KYB_COLLECTION, companyId);
  const snap = await getDoc(ref);
  const decision = (snap.data() as EmpresaKyb | undefined)?.decision;
  if (!decision) throw new Error('La empresa no tiene decisión que aprobar.');
  if (decision.aprobacion?.estado !== 'PENDIENTE_APROBACION') {
    throw new Error('La decisión no está pendiente de aprobación.');
  }
  if (decision.actorId === r.checkerId) {
    throw new Error('Quien tomó la decisión no puede aprobarla. Tiene que resolverla otra persona.');
  }

  const actualizada: DecisionKyb = {
    ...decision,
    aprobacion: {
      estado: r.aprobar ? 'APROBADA' : 'RECHAZADA',
      checkerId: r.checkerId,
      checkerNombre: r.checkerNombre,
      resueltaEn: new Date().toISOString(),
      motivo: r.motivo ?? null,
    },
  };
  await updateDoc(ref, { decision: paraFirestore(actualizada) });
  return actualizada;
}

// ¿La decisión está firme? Sin checker, con decidirla alcanza; con checker, hace
// falta que esté APROBADA. Es lo que habilita aplicar las salidas.
export function decisionFirme(d: DecisionKyb | undefined): boolean {
  if (!d) return false;
  if (!requiereChecker(d.tipo, d.automatica)) return true;
  return d.aprobacion?.estado === 'APROBADA';
}

export { canalesCompletos };
