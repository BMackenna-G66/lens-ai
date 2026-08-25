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
    errores?: number; sinScreening?: number; omitidas?: number;
    motivosRetencion?: Record<string, number>;
  };
}

// Dispara una corrida AHORA y vuelve enseguida, sin esperar el resultado.
//
// Antes esperaba la respuesta y con Colombia prendida eso daba 524 siempre:
// Cloudflare corta a los ~100 s y las corridas pasaron a durar 220-316 s, porque
// cada caso colombiano dispara una consulta a Inspektor de ~13 s.
//
// El resultado no se pierde: la corrida escribe su resumen en
// `flujo_autonomo_corridas` y la suscripción de la barra lo muestra cuando llega.
// El candado del Lambda sigue evitando que dos corridas se pisen.
export async function correrFlujoAhora(): Promise<{ disparada: boolean; mensaje?: string }> {
  if (!PROXY) throw new Error('Proxy no configurado: no se puede disparar la corrida.');
  const res = await fetch(`${PROXY}/flujo/correr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const texto = await res.text();
  let data: { disparada?: boolean; mensaje?: string; error?: string };
  try { data = JSON.parse(texto) as typeof data; }
  catch { throw new Error(texto.slice(0, 200) || `HTTP ${res.status}`); }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return { disparada: data.disparada === true, mensaje: data.mensaje };
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
  // El aviso de que la base de transacciones está pausada NO es un problema: es
  // una ventana conocida (18:30–04:00) y las remesas se retoman solas. Si contara
  // como problema, la barra quedaría en ámbar toda la noche y dejaría de avisar
  // nada.
  const avisosReales = (c.avisos ?? []).filter(a => !/base de transacciones/.test(a));
  if (avisosReales.length) return avisosReales[0];
  if (c.camposAusentes?.length) return `config incompleta: ${c.camposAusentes.join(', ')}`;
  if (c.cortadoPorTiempo) return 'la corrida se cortó por tiempo: quedaron casos sin procesar';
  return null;
}
