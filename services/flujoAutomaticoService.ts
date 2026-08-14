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
// Chile (Regcheq) y Colombia (Inspektor). Para sumar otro, agregarlo acá.
export const PAISES_FLUJO: { code: string; label: string }[] = [
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colombia' },
];

// País del caso → código del catálogo. '' = país sin screening/no soportado, que
// nunca entra al flujo automático.
export function paisCodigo(pais: string): string {
  const p = (pais || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^cl$|chile/.test(p)) return 'CL';
  if (/^co$|colombia/.test(p)) return 'CO';
  return '';
}

export interface FlujoOfacConfig {
  enabled: boolean;
  paises: Record<string, boolean>; // por país: { CL: false, CO: false } — todos OFF
  cerrarSF: boolean;        // ejecutar el cierre en Salesforce
  cerrarAdmin: boolean;     // ejecutar el cierre en Admin (bloqueo/desbloqueo)
  tipoLiberarNormal: string; // id de tipología para "Liberar"
  tipoLiberarUcr: string;    // id de tipología para "Liberar UCR"
  tipoBloquear: string;      // id de tipología para "Fully Blocked"
}

export interface FlujoConfig {
  ofac: FlujoOfacConfig;
  remesa: { enabled: boolean };
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
  remesa: { enabled: false },
  actualizadoEn: null,
  actualizadoPor: null,
};

export const flujoConfigDisponible = (): boolean => !!getDb();

// Normaliza lo que venga de Firestore contra los defaults (tolera docs viejos).
function normalizar(raw: Record<string, unknown> | undefined): FlujoConfig {
  const ofacRaw = (raw?.ofac ?? {}) as Partial<FlujoOfacConfig>;
  const remesaRaw = (raw?.remesa ?? {}) as { enabled?: boolean };
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
    remesa: { enabled: remesaRaw.enabled === true },            // default OFF
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

// ¿El país del caso tiene el automático prendido?
export function paisHabilitado(pais: string, cfg: FlujoOfacConfig): boolean {
  const code = paisCodigo(pais);
  return !!code && cfg.paises?.[code] === true;
}

// ── Clasificador PURO: conclusión del screening → id de tipología ───────────────
// Devuelve null cuando la conclusión NO se automatiza (revisión manual, vacía…).
// El orden importa: "Liberar + UCR" tiene que caer en UCR, no en Liberar normal.
export function tipologiaParaDecision(decision: string | undefined, cfg: FlujoOfacConfig): string | null {
  const d = (decision ?? '').trim().toUpperCase();
  if (!d) return null;
  if (/REVIS/.test(d)) return null;                              // revisión → analista
  if (/BLOCK|BLOQ/.test(d)) return cfg.tipoBloquear;             // Fully Blocked
  if (/UCR|UNDER[_ ]COMPLIANCE/.test(d)) return cfg.tipoLiberarUcr;
  if (/LIBERAR|SIN CAUSAS|SIN RIESGO/.test(d)) return cfg.tipoLiberarNormal;
  return null;
}
