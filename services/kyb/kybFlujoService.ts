// MANTENEDOR del flujo automático del KYB. Config compartida en Firestore.
//
// Mismo patrón que flujoAutomaticoService (la Bandeja): doc único en
// `config/flujoKyb`, suscripción en vivo, y normalización contra los defaults
// para tolerar documentos viejos.
//
// Arranca TODO APAGADO, y las dos direcciones son toggles independientes:
// auto-aprobar y auto-rechazar se prenden por separado. Prender el auto-aprobar
// de un KYC de empresas sin haberlo mirado en simulación es un incidente
// regulatorio, no un bug.

import { doc, onSnapshot, setDoc, Firestore } from 'firebase/firestore';
import { getDb } from '../firebaseService';

export const FLUJO_KYB_COLLECTION = 'config';
export const FLUJO_KYB_DOC = 'flujoKyb';

// Países donde se puede habilitar. Los mismos que tienen operación B2B.
export const PAISES_KYB: { code: string; label: string }[] = [
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colombia' },
  { code: 'PE', label: 'Perú' },
];

export function paisCodigoKyb(pais: string): string {
  const p = (pais || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^cl$|chile/.test(p)) return 'CL';
  if (/^co$|colombia/.test(p)) return 'CO';
  if (/^pe$|peru/.test(p)) return 'PE';
  return '';
}

export interface FlujoKybConfig {
  enabled: boolean;              // interruptor general
  autoAprobar: boolean;          // dirección 1, independiente
  autoRechazar: boolean;         // dirección 2, independiente
  // Modo simulación: evalúa y registra qué HABRÍA hecho, sin ejecutar nada.
  // Es el requisito de proceso del plan antes de prender cualquier dirección.
  simulacion: boolean;
  paises: Record<string, boolean>;
  // Umbrales de certidumbre. Entre los dos hay zona gris: ahí decide el analista.
  umbralAprobar: number;         // ≥ esto puede auto-aprobar
  umbralRechazar: number;        // ≤ esto puede auto-rechazar
  // Cobertura mínima comparada: sin esto un caso con 3 componentes comparados
  // podría alcanzar el umbral y decidirse con casi nada.
  coberturaMinima: number;
  actualizadoEn?: string | null;
  actualizadoPor?: string | null;
}

export const FLUJO_KYB_DEFAULT: FlujoKybConfig = {
  enabled: false,
  autoAprobar: false,
  autoRechazar: false,
  simulacion: true,              // arranca en simulación a propósito
  paises: { CL: false, CO: false, PE: false },
  umbralAprobar: 85,
  umbralRechazar: 25,
  coberturaMinima: 70,
  actualizadoEn: null,
  actualizadoPor: null,
};

export const flujoKybDisponible = (): boolean => !!getDb();

function normalizar(raw: Record<string, unknown> | undefined): FlujoKybConfig {
  const d = FLUJO_KYB_DEFAULT;
  const r = (raw ?? {}) as Partial<FlujoKybConfig>;
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  return {
    // Todos los interruptores en `=== true`: un campo ausente o basura es APAGADO.
    enabled: r.enabled === true,
    autoAprobar: r.autoAprobar === true,
    autoRechazar: r.autoRechazar === true,
    // La simulación es lo único que arranca en true: para apagarla hay que
    // hacerlo explícito.
    simulacion: r.simulacion !== false,
    paises: Object.fromEntries(PAISES_KYB.map(p => [p.code, (r.paises ?? {})[p.code] === true])),
    umbralAprobar: num(r.umbralAprobar, d.umbralAprobar),
    umbralRechazar: num(r.umbralRechazar, d.umbralRechazar),
    coberturaMinima: num(r.coberturaMinima, d.coberturaMinima),
    actualizadoEn: (r.actualizadoEn as string | undefined) ?? null,
    actualizadoPor: (r.actualizadoPor as string | undefined) ?? null,
  };
}

export function subscribeFlujoKyb(
  onData: (cfg: FlujoKybConfig) => void,
  onError?: (msg: string) => void,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) { onData(FLUJO_KYB_DEFAULT); return () => {}; }
  return onSnapshot(
    doc(db, FLUJO_KYB_COLLECTION, FLUJO_KYB_DOC),
    snap => onData(normalizar(snap.data() as Record<string, unknown> | undefined)),
    err => { onError?.(err.message); onData(FLUJO_KYB_DEFAULT); },
  );
}

export async function guardarFlujoKyb(cfg: FlujoKybConfig, actorNombre?: string): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado.');
  await setDoc(doc(db, FLUJO_KYB_COLLECTION, FLUJO_KYB_DOC), {
    ...cfg,
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: actorNombre ?? 'system',
  }, { merge: true });
}

export function paisHabilitadoKyb(pais: string | undefined, cfg: FlujoKybConfig): boolean {
  const code = paisCodigoKyb(pais ?? '');
  return !!code && cfg.paises?.[code] === true;
}
