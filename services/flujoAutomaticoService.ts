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

// El tipo, los defaults y la normalización viven en `flujoDecision.ts`: el Lambda
// desatendido usa exactamente los mismos. Antes cada lado normalizaba a su manera
// y con los `tipo*` ausentes decidían distinto — la decisión no podía divergir
// pero su input sí.
export { FLUJO_CONFIG_DEFAULT, normalizarFlujoConfig } from './flujoDecision';
export type { FlujoConfig, ConfigNormalizada } from './flujoDecision';

import { FLUJO_CONFIG_DEFAULT, normalizarFlujoConfig } from './flujoDecision';
import type { FlujoConfig } from './flujoDecision';

export const flujoConfigDisponible = (): boolean => !!getDb();

// Suscripción en vivo a la config (se comparte entre analistas).
// `onData` recibe además qué campos se resolvieron con el default. Es un segundo
// argumento opcional, así que los llamadores que solo quieren la config no
// cambian. Sirve para avisar en el mantenedor que el doc quedó incompleto: el
// flujo desatendido lo reporta en su corrida, pero ese documento no lo mira
// nadie, y un aviso solo sirve donde está quien puede arreglarlo.
export function subscribeFlujoConfig(
  onData: (cfg: FlujoConfig, camposAusentes?: string[]) => void,
  onError?: (msg: string) => void,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) { onData(FLUJO_CONFIG_DEFAULT, []); return () => {}; }
  return onSnapshot(
    doc(db, FLUJO_COLLECTION, FLUJO_DOC),
    snap => {
      const n = normalizarFlujoConfig(snap.data() as Record<string, unknown> | undefined);
      onData(n.cfg, n.camposAusentes);
    },
    err => { onError?.(err.message); onData(FLUJO_CONFIG_DEFAULT, []); },
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


