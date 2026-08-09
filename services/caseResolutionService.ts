// Resolución → respuesta a Salesforce (§20, §26 Fase 7). Reusa sendCaseUpdate (no
// cambia el endpoint ni el Worker). Agrega: mapeo de la conclusión del motor a
// C_Status__c, idempotencia (evita doble envío) y persistencia del bloque
// respuestaSalesforce + auditoría.

import { doc, runTransaction, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import { registrarAuditoria } from './caseAuditService';
import { sendCaseUpdate } from './salesforceCaseService';
import type { SFCaseUpdate, SFUpdateResult } from './salesforceCaseService';
import type { RespuestaSalesforce } from './casosComplianceTypes';
import type { Actor } from './caseWorkflowService';

// Mapeo conclusión del motor criminal → C_Status__c (definido con negocio):
// "Fully Blocked" → Fully Blocked; cualquier otra conclusión (Liberar /
// UNDER_COMPLIANCE_REVIEW) → Approved. Sin conclusión → '' (no sugiere nada).
export function conclusionAStatus(decision?: string): string {
  const d = (decision ?? '').toUpperCase();
  if (!d) return '';
  if (/BLOCK|BLOQ/.test(d)) return 'Fully Blocked';
  return 'Approved';
}

// Hash corto y determinista (FNV-1a) para la clave de idempotencia.
function hashCorto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export interface ResultadoResolucion {
  sf: SFUpdateResult | null;
  yaEnviada: boolean;   // se omitió el envío por idempotencia
  mensaje?: string;
}

const RESP_BASE: RespuestaSalesforce = {
  estado: 'NO_ENVIADA', idempotencyKey: null, intentos: 0,
  ultimoIntentoEn: null, completadoEn: null, codigoError: null, referencia: null,
};

// Envía la resolución a Salesforce de forma idempotente y persiste el resultado.
export async function enviarResolucion(caseId: string, payload: SFCaseUpdate, actor?: Actor): Promise<ResultadoResolucion> {
  const db = getDb() as Firestore | null;
  const firma = hashCorto(`${caseId}|${JSON.stringify(payload)}`);
  const actorId = actor?.uid ?? 'system';

  // Sin Firestore (dev): enviar sin persistencia.
  if (!db) {
    const sf = await sendCaseUpdate(payload);
    return { sf, yaEnviada: false };
  }

  const ref = doc(db, CASOS_COLLECTION, caseId);

  // 1) Guard de idempotencia / doble-envío (transacción).
  const permitido = await runTransaction(db, async tx => {
    const prev = ((await tx.get(ref)).data() ?? {}).respuestaSalesforce as RespuestaSalesforce | undefined;
    if (prev?.estado === 'ENVIANDO') return false;                      // envío en curso
    if (prev?.estado === 'ENVIADA' && prev.idempotencyKey === firma) return false; // mismo payload ya enviado
    tx.set(ref, {
      respuestaSalesforce: {
        ...(prev ?? RESP_BASE), estado: 'ENVIANDO', idempotencyKey: firma,
        intentos: (prev?.intentos ?? 0) + 1, ultimoIntentoEn: new Date().toISOString(),
      },
    }, { merge: true });
    return true;
  });

  if (!permitido) return { sf: null, yaEnviada: true, mensaje: 'Esta resolución ya se envió (o hay un envío en curso).' };

  // 2) Envío real (Worker → Salesforce).
  let sf: SFUpdateResult;
  try {
    sf = await sendCaseUpdate(payload);
  } catch (e) {
    await marcarResultado(ref, firma, false, (e as Error).message);
    await registrarAuditoria(caseId, { tipo: 'RESPUESTA_SF_ERROR', actorId, actorTipo: actor ? 'USER' : 'SYSTEM', correlationId: caseId, versionCaso: 1, metadata: { error: (e as Error).message } });
    throw e;
  }

  // 3) Persistir resultado + auditoría.
  await marcarResultado(ref, firma, sf.ok, sf.ok ? null : (sf.errors?.join('; ') ?? `HTTP ${sf.status}`), caseId);
  await registrarAuditoria(caseId, {
    tipo: sf.ok ? 'RESPUESTA_SF_COMPLETADA' : 'RESPUESTA_SF_ERROR',
    actorId, actorTipo: actor ? 'USER' : 'SYSTEM', correlationId: caseId, versionCaso: 1,
    metadata: { ok: sf.ok, status: sf.status },
  });
  return { sf, yaEnviada: false };
}

async function marcarResultado(ref: ReturnType<typeof doc>, firma: string, ok: boolean, codigoError: string | null, referencia?: string): Promise<void> {
  await runTransaction((getDb() as Firestore), async tx => {
    const prev = ((await tx.get(ref)).data() ?? {}).respuestaSalesforce as RespuestaSalesforce | undefined;
    tx.set(ref, {
      respuestaSalesforce: {
        ...(prev ?? RESP_BASE), estado: ok ? 'ENVIADA' : 'ERROR', idempotencyKey: firma,
        completadoEn: ok ? new Date().toISOString() : (prev?.completadoEn ?? null),
        codigoError: codigoError ?? null, referencia: referencia ?? prev?.referencia ?? null,
      },
    }, { merge: true });
  });
}
