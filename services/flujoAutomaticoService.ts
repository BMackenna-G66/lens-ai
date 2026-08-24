// MANTENEDOR del flujo automático de las colas de la Bandeja de Casos.
//
// Permite prender/apagar el cierre automático por cola sin tocar código. La
// config vive en Firestore (`config/flujoAutomatico`) para que sea la MISMA para
// todos los analistas, y arranca APAGADA en ambas colas.
//
// Con OFAC prendido: los casos cuya conclusión del screening es "Liberar…" o
// "Fully Blocked" se cierran solos aplicando la tipología que les corresponde.
// Las conclusiones de revisión (Revisión manual/prioritaria/…) NO se automatizan:
// quedan para el analista.

import { doc, onSnapshot, setDoc, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import type { Actor } from './caseWorkflowService';

export const FLUJO_COLLECTION = 'config';
export const FLUJO_DOC = 'flujoAutomatico';

// Países donde se puede prender el automático. Son los que tienen screening:
// Los tipos, el catálogo de países y las funciones que DECIDEN viven en
// `flujoDecision.ts`, que no depende de Firestore ni del navegador: el Lambda
// desatendido importa exactamente las mismas. Acá se reexportan para no cambiar
// ni un import del resto de la app.
import {
  PAISES_FLUJO, paisCodigo, paisHabilitado, tipologiaParaDecision,
} from './flujoDecision';
import type { FlujoOfacConfig, FlujoRemesaConfig } from './flujoDecision';

export { PAISES_FLUJO, paisCodigo, paisHabilitado, tipologiaParaDecision };
export type { FlujoOfacConfig, FlujoRemesaConfig };

export interface FlujoConfig {
  ofac: FlujoOfacConfig;
  remesa: FlujoRemesaConfig;
  actualizadoEn?: string | null;
  actualizadoPor?: string | null;
}

// Por pedido explícito: ambos flujos arrancan APAGADOS.
export const FLUJO_CONFIG_DEFAULT: FlujoConfig = {
  ofac: {
    enabled: false,
    paises: { CL: false, CO: false },   // por pedido explícito: todos apagados
    cerrarSF: true,
    cerrarAdmin: true,
    tipoLiberarNormal: 'liberar_normal',
    tipoLiberarUcr: 'liberar_ucr',
    tipoBloquear: 'fully_blocked',
  },
  remesa: {
    enabled: false,          // por pedido explícito: arranca APAGADO
    cerrarSF: true,
    cerrarAdmin: true,
    tipoLiberar: 'liberar',
  },
  actualizadoEn: null,
  actualizadoPor: null,
};

export const flujoConfigDisponible = (): boolean => !!getDb();

// Normaliza lo que venga de Firestore contra los defaults (tolera docs viejos).
function normalizar(raw: Record<string, unknown> | undefined): FlujoConfig {
  const ofacRaw = (raw?.ofac ?? {}) as Partial<FlujoOfacConfig>;
  const remesaRaw = (raw?.remesa ?? {}) as Partial<FlujoRemesaConfig>;
  const d = FLUJO_CONFIG_DEFAULT;
  return {
    ofac: {
      enabled: ofacRaw.enabled === true,                       // default OFF
      paises: Object.fromEntries(PAISES_FLUJO.map(p => [p.code, (ofacRaw.paises ?? {})[p.code] === true])), // default OFF
      cerrarSF: ofacRaw.cerrarSF !== false,
      cerrarAdmin: ofacRaw.cerrarAdmin !== false,
      tipoLiberarNormal: ofacRaw.tipoLiberarNormal || d.ofac.tipoLiberarNormal,
      tipoLiberarUcr: ofacRaw.tipoLiberarUcr || d.ofac.tipoLiberarUcr,
      tipoBloquear: ofacRaw.tipoBloquear || d.ofac.tipoBloquear,
    },
    remesa: {
      enabled: remesaRaw.enabled === true,                     // default OFF
      cerrarSF: remesaRaw.cerrarSF !== false,
      cerrarAdmin: remesaRaw.cerrarAdmin !== false,
      tipoLiberar: remesaRaw.tipoLiberar || d.remesa.tipoLiberar,
    },
    actualizadoEn: (raw?.actualizadoEn as string | undefined) ?? null,
    actualizadoPor: (raw?.actualizadoPor as string | undefined) ?? null,
  };
}

// Suscripción en vivo a la config (se comparte entre analistas).
export function subscribeFlujoConfig(
  onData: (cfg: FlujoConfig) => void,
  onError?: (msg: string) => void,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) { onData(FLUJO_CONFIG_DEFAULT); return () => {}; }
  return onSnapshot(
    doc(db, FLUJO_COLLECTION, FLUJO_DOC),
    snap => onData(normalizar(snap.data() as Record<string, unknown> | undefined)),
    err => { onError?.(err.message); onData(FLUJO_CONFIG_DEFAULT); },
  );
}

export async function guardarFlujoConfig(cfg: FlujoConfig, actor?: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado en esta instancia.');
  await setDoc(doc(db, FLUJO_COLLECTION, FLUJO_DOC), {
    ofac: cfg.ofac,
    remesa: cfg.remesa,
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: actor?.nombre ?? 'system',
  }, { merge: true });
}


