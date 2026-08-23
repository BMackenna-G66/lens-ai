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
import { mapDatosGenerales, mapAdminALadoCanonico } from './kybAdminMapper';
import type { EmpresaDocsDetail } from '../../types/empresaDocs';
import { decidirEncolado } from './kybReencolado';

export const kybDisponible = (): boolean => !!getDb();

const SUBCOL_ANALISIS = 'analisis';
const SUBCOL_SNAPSHOT = 'snapshot';

// Snapshot de Admin del momento del barrido, ya mapeado. Se guarda mapeado y no
// crudo para que la ficha no tenga que conocer nombres de campo del proveedor.
export type SnapshotAdmin = NonNullable<EmpresaKyb['snapshotAdmin']>;

function snapshotDesdeDetalle(detalle: EmpresaDocsDetail, tomadoEn: string): SnapshotAdmin {
  return {
    tomadoEn,
    datosGenerales: mapDatosGenerales(detalle),
    admin: mapAdminALadoCanonico(detalle),
    documentos: (detalle.documents ?? []).map((d, i) => ({
      nombre: String(d.fileName ?? `documento-${i + 1}`),
      link: String(d.link ?? ''),
      slot: d.slot,
      estado: d.status,
      fecha: d.date,
      analizado: false,   // el snapshot lista documentos, no los lee
    })),
  };
}

export async function leerSnapshot(companyId: string): Promise<SnapshotAdmin | null> {
  const db = getDb() as Firestore | null;
  if (!db) return null;
  const d = await getDoc(doc(db, KYB_COLLECTION, companyId, SUBCOL_SNAPSHOT, 'admin'));
  return d.exists() ? (d.data() as SnapshotAdmin) : null;
}

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
    // Solo la fecha: el bloque vive en la subcolección.
    snapshotEn: (d.snapshotEn ?? undefined) as string | undefined,
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
// ingesta.
//
// Una empresa CERRADA no vuelve a la cola: se actualizan sus datos y, si cambió
// algo relevante, se marca para reingreso — pero reabrirla es decisión de una
// persona. Ver `kybReencolado.ts`.
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
  // Detalle de Admin ya armado, si quien encola lo tiene a mano. Se convierte en
  // el snapshot que permite abrir la ficha sin analizar. El barrido lo saca del
  // crudo del listado; el alta manual, de la consulta que ya hizo.
  snapshot?: EmpresaDocsDetail;
  // Solo el alta manual por Company ID lo manda: reabre una empresa cerrada.
  // El barrido NUNCA lo manda.
  reaperturaManual?: boolean;
}

export interface ResultadoEncolado {
  nuevas: number;
  actualizadas: number;
  // Ya trabajadas y cerradas: se actualizan sus datos pero NO vuelven a la cola.
  fueraPorCerradas: number;
  // Cerradas en las que cambió algo relevante: quedan marcadas para que alguien
  // decida si se reabren.
  reingresos: { companyId: string; motivo: string }[];
}

export async function encolarEmpresas(items: EmpresaAEncolar[]): Promise<ResultadoEncolado> {
  const db = getDb() as Firestore | null;
  if (!db || items.length === 0) return { nuevas: 0, actualizadas: 0, fueraPorCerradas: 0, reingresos: [] };
  let nuevas = 0, actualizadas = 0, fueraPorCerradas = 0;
  const reingresos: { companyId: string; motivo: string }[] = [];

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
      const previo = existentes[idx]?.data() as Record<string, unknown> | undefined;
      const d = decidirEncolado(
        {
          existe: yaEsta,
          statusKyb: previo?.statusKyb as string | undefined,
          kycStage1: previo?.kycStage1 as string | undefined,
          complianceStatus: previo?.complianceStatus as string | undefined,
        },
        { kycStage1: it.kycStage1, complianceStatus: it.complianceStatus, reaperturaManual: it.reaperturaManual },
      );
      if (d.quedaFuera) fueraPorCerradas++;
      if (d.reingreso) reingresos.push({ companyId: it.companyId, motivo: d.reingreso });

      const campos: Record<string, unknown> = {
        companyId: it.companyId,
        razonSocial: it.razonSocial,
        identificacion: it.identificacion ?? null,
        pais: it.pais ?? null,
        complianceStatus: it.complianceStatus ?? null,
        kycStage1: it.kycStage1 ?? null,
        riskLevel: it.riskLevel ?? null,
        institucional: it.institucional ?? null,
        origen: it.origen ?? 'manual',
      };
      // `enCola` solo se escribe cuando corresponde: dejarlo en `true` fijo
      // resucitaba en cada barrido todo lo ya trabajado.
      if (d.enCola !== undefined) campos.enCola = d.enCola;
      if (d.statusKyb) campos.statusKyb = d.statusKyb;
      if (d.recibidoEn) campos.recibidoEn = new Date().toISOString();
      if (d.reingreso) {
        campos.reingresoPendiente = true;
        campos.reingresoMotivo = d.reingreso;
      }
      // Snapshot de Admin, si el barrido trajo el crudo. Se guarda con su fecha
      // para que la ficha lo muestre como lo que es. NO reemplaza al análisis.
      // El snapshot NO va en el doc padre: la cola se suscribe a todos los docs
      // y sumarle ~6 KB por empresa encarece cada carga de la lista. En el padre
      // queda solo la fecha; el bloque va a la subcolección y se lee al abrir.
      if (it.snapshot) {
        const tomadoEn = new Date().toISOString();
        campos.snapshotEn = tomadoEn;
        batch.set(
          doc(db, KYB_COLLECTION, it.companyId, SUBCOL_SNAPSHOT, 'admin'),
          paraFirestore(snapshotDesdeDetalle(it.snapshot, tomadoEn)),
        );
      }
      batch.set(doc(db, KYB_COLLECTION, it.companyId), paraFirestore(campos), { merge: true });
    });
    await batch.commit();
  }
  return { nuevas, actualizadas, fueraPorCerradas, reingresos };
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

// Salida masiva. Mismo criterio que la individual: el documento NO se borra,
// solo sale de la vista. Firestore topa en 500 escrituras por batch, así que se
// parte; si un lote falla, los anteriores YA se aplicaron y se informa cuántos
// alcanzaron a salir en vez de decir que no pasó nada.
export async function sacarDeColaMasivo(
  companyIds: string[],
): Promise<{ sacados: number; error?: string }> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  const TOPE_BATCH = 450;   // margen bajo el límite de 500 de Firestore
  let sacados = 0;
  for (let i = 0; i < companyIds.length; i += TOPE_BATCH) {
    const lote = companyIds.slice(i, i + TOPE_BATCH);
    const batch = writeBatch(db);
    lote.forEach(id => batch.update(doc(db, KYB_COLLECTION, id), {
      statusKyb: 'CERRADO' as StatusKyb,
      enCola: false,
    }));
    try {
      await batch.commit();
      sacados += lote.length;
    } catch (e) {
      return { sacados, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { sacados };
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
