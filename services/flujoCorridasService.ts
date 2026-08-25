// Disparar una corrida del flujo autónomo y leer el resultado de las últimas.
//
// El ejecutor es el Lambda `lens-flujo-autonomo`. La app no cierra casos: los
// muestra y, con esto, los dispara. Ese reparto existe porque con dos ejecutores
// hubo 61 casos cerrados dos veces en producción entre el 16 y el 25 de agosto.
//
// El disparo va por el Worker, no directo a la Function URL: el Worker guarda el
// secreto que la puerta exige, así que no queda en el bundle público.

import { collection, query, orderBy, limit, onSnapshot, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';

// Mismo patrón que el resto de los servicios que hablan con el Worker.
const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const CORRIDAS_COLLECTION = 'flujo_autonomo_corridas';

export const disparadorDisponible = (): boolean => !!PROXY;

// Lo que el Lambda deja de cada corrida. `duracionMs` es el dato que avisa si las
// corridas se acercan al techo de 15 minutos, y con el cron a 5 pasa a importar.
export interface ResumenCorrida {
  en?: string;
  origen?: string;              // 'cron' | 'manual'
  corrio?: boolean;
  motivo?: string;
  duracionMs?: number;
  casosEnCola?: number;
  procesados?: number;
  cerrados?: number;
  retenidos?: number;
  errores?: number;
  sinScreening?: number;
  cortadoPorTiempo?: boolean;
  apagadoEnVuelo?: boolean;
  camposAusentes?: string[];
  avisos?: string[];
  motivosRetencion?: Record<string, number>;
  remesa?: {
    enCola?: number; procesadas?: number; cerradas?: number; retenidas?: number;
    errores?: number; sinScreening?: number; motivosRetencion?: Record<string, number>;
  };
}

// Dispara una corrida AHORA. El candado del Lambda se encarga de que no se pise
// con una del cron: si hay una en curso, devuelve `corrio: false` con el motivo.
export async function correrFlujoAhora(): Promise<ResumenCorrida> {
  if (!PROXY) throw new Error('Proxy no configurado: no se puede disparar la corrida.');
  const res = await fetch(`${PROXY}/flujo/correr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const texto = await res.text();
  let data: ResumenCorrida & { error?: string };
  try { data = JSON.parse(texto) as ResumenCorrida & { error?: string }; }
  catch { throw new Error(texto.slice(0, 200) || `HTTP ${res.status}`); }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// Las últimas corridas, en vivo. Existe porque el resumen no se veía en ninguna
// pantalla: el aviso de que las remesas fallaron por el cluster pausado quedó
// enterrado en Firestore y no llegó a nadie. Con el cron a 5 minutos son ~138
// resúmenes por día, así que la app tiene que mostrar al menos el último.
export function subscribeUltimasCorridas(
  onData: (corridas: ResumenCorrida[]) => void,
  tope = 20,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) { onData([]); return () => {}; }
  const q = query(collection(db, CORRIDAS_COLLECTION), orderBy('en', 'desc'), limit(tope));
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => d.data() as ResumenCorrida)),
    () => onData([]),
  );
}

// ¿La corrida merece que alguien la mire? Es lo que decide si se muestra en rojo.
// Un resumen que solo dice "no había nada que hacer" no necesita atención.
export function corridaConProblema(c: ResumenCorrida | undefined): string | null {
  if (!c) return null;
  if (c.corrio === false && c.motivo) return c.motivo;
  if ((c.errores ?? 0) > 0) return `${c.errores} caso(s) con error`;
  if ((c.remesa?.errores ?? 0) > 0) return `${c.remesa?.errores} remesa(s) con error`;
  if (c.avisos?.length) return c.avisos[0];
  if (c.camposAusentes?.length) return `config incompleta: ${c.camposAusentes.join(', ')}`;
  if (c.cortadoPorTiempo) return 'la corrida se cortó por tiempo: quedaron casos sin procesar';
  return null;
}
