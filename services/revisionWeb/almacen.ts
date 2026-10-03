// REVISIÓN WEB — dónde se guardan las revisiones: en ESTE navegador.
//
// Una base de Dexie PROPIA ('LensRevisionWeb'), no la de las fichas
// ('LensAIDatabase'): ni comparten tabla ni la versión de esquema de una
// depende de la otra. Nada va a AWS ni a la nube; si algún día se quiere ahí, lo
// decide Benjamín. Cada revisión queda fechada: las búsquedas son fotos del día.

import Dexie, { type Table } from 'dexie';
import type { Resultado } from './tipos';

export const dbRevisionWeb = new Dexie('LensRevisionWeb') as Dexie & {
  revisiones: Table<Resultado, string>;
};

dbRevisionWeb.version(1).stores({
  revisiones: 'id, fecha, sitio',
});

export async function guardarRevision(r: Resultado): Promise<void> {
  await dbRevisionWeb.revisiones.put(r);
}

export async function ultimasRevisiones(n = 20): Promise<Resultado[]> {
  return dbRevisionWeb.revisiones.orderBy('fecha').reverse().limit(n).toArray();
}

export async function borrarRevision(id: string): Promise<void> {
  await dbRevisionWeb.revisiones.delete(id);
}
