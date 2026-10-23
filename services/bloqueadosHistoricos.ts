// Los «Bloqueado» históricos de la cola OFAC, para cargarlos a la lista negra
// de DNI desde el módulo Listas negras (solo Líder). Lee `casos_sf` con la
// sesión del Líder; la regla de qué entra vive en services/listaNegraDni.ts.

import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION } from './casosService';
import { clasificarCola, paisCodigo } from './flujoDecision';
import { filasHistoricas, TIPOLOGIA_BLOQUEADO, type CasoParaListaNegra, type EntradaListaNegraDni } from './listaNegraDni';

/**
 * Los casos cerrados en Admin como «Bloqueado» de la cola OFAC, de toda la
 * historia, uno por cliente. La consulta trae los de tipología `fully_blocked`
 * (un campo anidado: Firestore lo indexa solo) y el filtro de la cola y del
 * cierre ok lo hace `filasHistoricas`.
 */
export async function leerBloqueadosHistoricos(): Promise<EntradaListaNegraDni[]> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está disponible.');
  const snap = await getDocs(query(collection(db, CASOS_COLLECTION), where('cierres.admin.tipologia', '==', TIPOLOGIA_BLOQUEADO)));
  const casos: CasoParaListaNegra[] = snap.docs.map(d => {
    const x = d.data() as Record<string, unknown>;
    return { id: d.id, numeroCaso: String(x.numeroCaso ?? d.id), asunto: x.asunto as string | undefined,
             pais: x.pais as string | undefined, datos: x.datos as Record<string, unknown> | undefined,
             cierres: x.cierres as CasoParaListaNegra['cierres'] };
  });
  return filasHistoricas(casos, clasificarCola, paisCodigo);
}
