// Cola KYB en Firestore. Servicio de ESCRITURA propio del módulo: no reusa los
// de la Bandeja (decisión de arquitectura — se duplica lo que escribe y se
// comparte lo que solo lee, para que la Bandeja en producción no se toque).
//
// Diferencia clave con `subscribeCasos`: acá la suscripción usa `where` + `limit`
// reales. La Bandeja lee la colección ENTERA y filtra en memoria, lo que ya
// costó un cuelgue; con empresas eso no escala.
//
// Requiere un índice compuesto en Firestore:  enCola ASC, recibidoEn DESC
// Sin el índice, onSnapshot devuelve failed-precondition con el link para crearlo.
//
// El documento PADRE es liviano a propósito y el análisis completo va a la
// subcolección `kyb_empresas/{companyId}/analisis/{runId}`: Firestore topa en
// 1 MiB por documento y la matriz con las personas de las cuatro fuentes no cabe.

import {
  collection, doc, onSnapshot, query, where, orderBy, limit,
  setDoc, updateDoc, getDoc, getDocs, writeBatch, Firestore,
} from 'firebase/firestore';
import { getDb } from '../firebaseService';
import { KYB_COLLECTION, type EmpresaKyb, type AnalisisKyb, type StatusKyb } from '../../types/kyb';

export const kybDisponible = (): boolean => !!getDb();

const SUBCOL_ANALISIS = 'analisis';

// Firestore rechaza `undefined`; el round-trip por JSON descarta esas claves.
const paraFirestore = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function docToEmpresa(id: string, d: Record<string, unknown>): EmpresaKyb {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    companyId: id,
    razonSocial: s(d.razonSocial),
    identificacion: s(d.identificacion) || undefined,
    pais: s(d.pais) || undefined,
    complianceStatus: s(d.complianceStatus) || undefined,
    kycStage1: s(d.kycStage1) || undefined,
    riskLevel: s(d.riskLevel) || undefined,
    institucional: typeof d.institucional === 'boolean' ? d.institucional : null,
    enCola: d.enCola !== false,
    statusKyb: (s(d.statusKyb) || 'ABIERTO') as StatusKyb,
    recibidoEn: s(d.recibidoEn),
    origen: (s(d.origen) || 'manual') as EmpresaKyb['origen'],
    prioridad: s(d.prioridad) || undefined,
    estadoCaso: s(d.estadoCaso) || undefined,
    asignacion: (d.asignacion ?? undefined) as EmpresaKyb['asignacion'],
    ultimoAnalisis: (d.ultimoAnalisis ?? undefined) as EmpresaKyb['ultimoAnalisis'],
    decision: (d.decision ?? undefined) as EmpresaKyb['decision'],
    canales: (d.canales ?? undefined) as EmpresaKyb['canales'],
    reingresoPendiente: d.reingresoPendiente === true || undefined,
    reingresoMotivo: (d.reingresoMotivo ?? null) as string | null,
  };
}

// ── Suscripción a la cola ────────────────────────────────────────────────────
// Solo lo que está EN COLA, ordenado por recepción, con tope. `onError` recibe el
// mensaje de Firestore tal cual: si falta el índice compuesto, ahí viene el link
// para crearlo, y esconderlo haría perder media hora.
export function subscribeColaKyb(
  onData: (items: EmpresaKyb[]) => void,
  onError?: (msg: string) => void,
  tope = 500,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) { onError?.('Firestore no está configurado.'); return () => {}; }
  const q = query(
    collection(db, KYB_COLLECTION),
    where('enCola', '==', true),
    orderBy('recibidoEn', 'desc'),
    limit(tope),
  );
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => docToEmpresa(d.id, d.data() as Record<string, unknown>))),
    err => onError?.(err.message),
  );
}

// ── Encolado ────────────────────────────────────────────────────────────────
// Upsert por companyId con merge: si la empresa ya estaba, NO se pisa el trabajo
// del analista (decisión, análisis, asignación). Solo se refrescan los campos de
// ingesta y se vuelve a poner en cola.
export interface EmpresaAEncolar {
  companyId: string;
  razonSocial: string;
  identificacion?: string;
  pais?: string;
  complianceStatus?: string;
  kycStage1?: string;
  riskLevel?: string;
  institucional?: boolean | null;
  origen?: EmpresaKyb['origen'];
}

export async function encolarEmpresas(items: EmpresaAEncolar[]): Promise<{ nuevas: number; actualizadas: number }> {
  const db = getDb() as Firestore | null;
  if (!db || items.length === 0) return { nuevas: 0, actualizadas: 0 };
  let nuevas = 0, actualizadas = 0;

  for (let i = 0; i < items.length; i += 450) {   // límite de 500 por batch
    const batch = writeBatch(db);
    const tanda = items.slice(i, i + 450);
    // Se lee antes para saber si es nueva y para NO pisar `recibidoEn`: si se
    // reencola una empresa vieja, su antigüedad en la cola tiene que sobrevivir.
    const existentes = await Promise.all(
      tanda.map(it => getDoc(doc(db, KYB_COLLECTION, it.companyId)).catch(() => null)),
    );
    tanda.forEach((it, idx) => {
      const yaEsta = existentes[idx]?.exists() === true;
      yaEsta ? actualizadas++ : nuevas++;
      const campos: Record<string, unknown> = {
        companyId: it.companyId,
        razonSocial: it.razonSocial,
        identificacion: it.identificacion ?? null,
        pais: it.pais ?? null,
        complianceStatus: it.complianceStatus ?? null,
        kycStage1: it.kycStage1 ?? null,
        riskLevel: it.riskLevel ?? null,
        institucional: it.institucional ?? null,
        enCola: true,
        origen: it.origen ?? 'manual',
      };
      if (!yaEsta) {
        campos.recibidoEn = new Date().toISOString();
        campos.statusKyb = 'ABIERTO';
      }
      batch.set(doc(db, KYB_COLLECTION, it.companyId), paraFirestore(campos), { merge: true });
    });
    await batch.commit();
  }
  return { nuevas, actualizadas };
}

// ── Análisis (subcolección) ─────────────────────────────────────────────────
// El bloque completo va a la subcolección y en el padre queda solo el resumen que
// necesita la fila de la cola.
export async function guardarAnalisis(analisis: AnalisisKyb): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  const { companyId, runId } = analisis;

  await setDoc(doc(db, KYB_COLLECTION, companyId, SUBCOL_ANALISIS, runId), paraFirestore(analisis));

  const scr = analisis.screening as { sugerenciaGlobal?: string; limpioVerificado?: boolean } | undefined;
  const { resumenScreeningLegible } = await import('./kybScreeningService');

  await updateDoc(doc(db, KYB_COLLECTION, companyId), {
    ultimoAnalisis: paraFirestore({
      runId,
      corridaEn: analisis.corridaEn,
      estado: analisis.estado,
      certidumbre: analisis.certidumbre,
      alertasCriticas: analisis.alertas.filter(a => a.severidad === 'CRITICA' && a.estado === 'ABIERTA').length,
      hashDocumentos: analisis.hashDocumentos ?? null,
      // En el padre para poder mostrarlo en la cola sin abrir cada ficha.
      sugerenciaCriminal: scr?.sugerenciaGlobal ?? null,
      screeningLimpio: scr?.limpioVerificado ?? null,
      screeningResumen: resumenScreeningLegible(analisis.screening as never) ?? null,
    }),
  });
}

// Último análisis completo de una empresa (para abrir la ficha sin re-analizar).
export async function leerUltimoAnalisis(companyId: string): Promise<AnalisisKyb | null> {
  const db = getDb() as Firestore | null;
  if (!db) return null;
  const padre = await getDoc(doc(db, KYB_COLLECTION, companyId));
  const runId = (padre.data()?.ultimoAnalisis as { runId?: string } | undefined)?.runId;
  if (!runId) return null;
  const snap = await getDoc(doc(db, KYB_COLLECTION, companyId, SUBCOL_ANALISIS, runId));
  return snap.exists() ? (snap.data() as AnalisisKyb) : null;
}

// Historial de corridas, más nuevas primero.
export async function listarAnalisis(companyId: string, tope = 20): Promise<AnalisisKyb[]> {
  const db = getDb() as Firestore | null;
  if (!db) return [];
  const q = query(
    collection(db, KYB_COLLECTION, companyId, SUBCOL_ANALISIS),
    orderBy('corridaEn', 'desc'),
    limit(tope),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as AnalisisKyb);
}

// ── Salida de la cola ───────────────────────────────────────────────────────
// `enCola: false` es lo que saca el item de la vista (la suscripción filtra por
// ese campo). El documento NO se borra: el histórico y la auditoría se conservan.
export async function setStatusKyb(companyId: string, status: StatusKyb): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  await updateDoc(doc(db, KYB_COLLECTION, companyId), {
    statusKyb: status,
    enCola: status !== 'CERRADO',
  });
}

// Reingreso: si cambia el kycStage de una empresa cerrada NO se reabre sola. Se
// marca y se notifica, para que reabrir sea decisión de alguien.
export async function marcarReingreso(companyId: string, motivo: string): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) return;
  await updateDoc(doc(db, KYB_COLLECTION, companyId), {
    reingresoPendiente: true,
    reingresoMotivo: motivo,
  }).catch(() => {});
}
