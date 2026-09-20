// Persistencia de la WHITELIST DE CLIENTES.
//
// Las reglas, los tipos y la normalización viven en `whitelistClientes.ts`, que
// no depende de Firestore ni del navegador: el Lambda desatendido importa
// exactamente los mismos. Acá queda el ida y vuelta con Firestore y la lectura
// de archivos masivos, que sí son del lado de la app.
//
// ── Cómo se guarda: cabecera + partes ──────────────────────────────────────
//
//   config/whitelistClientes        → { enabled, total, partes, actualizadoEn, actualizadoPor }
//   config/whitelistClientes_000    → { entradas: [ …hasta POR_PARTE… ] }
//   config/whitelistClientes_001    → { entradas: [ … ] }
//
// Las partes son documentos HERMANOS dentro de `config`, no una subcolección.
// Es a propósito y es lo único que hace que esto se pueda desplegar sin tocar
// nada más: las reglas de seguridad de Firestore no viven en este repo, y una
// subcolección nueva (`config/whitelistClientes/partes/*`) no queda cubierta por
// una regla escrita como `match /config/{doc}`. El modo de fallo sería el peor
// posible: la cabecera se guarda, las partes las rechaza el servidor, y la lista
// queda prendida y vacía. Como hermanos, caen bajo la misma regla que
// `config/flujoAutomatico`, que ya funciona.
//
// Por qué así y no de las dos maneras obvias:
//
//   · **Un documento por cliente** sería una lectura por cliente en cada carga
//     de la Bandeja y en cada corrida del cron. La cuota del plan Spark son
//     50.000 lecturas/día para TODO Lens, y cuando se agota no cae solo la
//     Bandeja: cae la app entera. Ya pasó el 05-09-2026.
//   · **Un solo documento con todo** tiene techo: Firestore corta en 1 MiB, que
//     a ~400 bytes por entrada son unas 2.600. Con bases masivas se alcanza, y
//     el modo de fallo es que la escritura empiece a rebotar.
//
// La cabecera es chica a propósito: el Lambda la relee entre lotes para saber si
// alguien apagó la lista, y eso tiene que costar UNA lectura. Las partes se leen
// una vez por corrida, y solo si hace falta.
//
// `actualizadoEn` de la cabecera cambia en cada guardado: sirve de detector de
// cambios barato, para no releer las partes cuando no cambiaron.

import { doc, onSnapshot, getDoc, writeBatch, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import type { Actor } from './caseWorkflowService';

import {
  normalizarWhitelist, WHITELIST_DEFAULT, POR_PARTE, TOPE_ENTRADAS,
  parsearPegado, filasAEntradas,
} from './whitelistClientes';
import type {
  WhitelistClientes, EntradaWhitelist, WhitelistNormalizada,
  OpcionesImportacion, ResultadoImportacion,
} from './whitelistClientes';

// Todo lo PURO se reexporta desde acá para que la UI tenga una sola puerta de
// entrada: quien importa el mantenedor no tiene que saber qué mitad es pura.
export {
  normalizarWhitelist, WHITELIST_DEFAULT, construirEntrada, buscarEnWhitelist,
  motivoWhitelistLegible, entradaVigente, hoyISO, mismaLlave,
  TOPE_ENTRADAS, AVISO_ENTRADAS, POR_PARTE, canonCustomerId, customerIdUtilizable,
  parsearPegado, fusionarEntradas, whitelistACsv,
} from './whitelistClientes';
export type {
  WhitelistClientes, EntradaWhitelist, CoincidenciaWhitelist, ColaWhitelist,
  BorradorEntrada, WhitelistNormalizada, OpcionesImportacion, ResultadoImportacion,
} from './whitelistClientes';

export const WHITELIST_COLLECTION = 'config';
export const WHITELIST_DOC = 'whitelistClientes';

export const whitelistDisponible = (): boolean => !!getDb();

/** Id del documento de la parte N. Con ceros a la izquierda, así ordenan solas. */
export const nombreParte = (i: number): string => `${WHITELIST_DOC}_${String(i).padStart(3, '0')}`;

/** Cuántas partes declara la cabecera. Se acota para que un campo corrupto no dispare N lecturas. */
const cuantasPartes = (cab: Record<string, unknown> | undefined): number => {
  const n = Number(cab?.partes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.ceil(TOPE_ENTRADAS / POR_PARTE), Math.floor(n));
};

/** Parte las entradas en trozos que entren en un documento de Firestore. */
export function partir(entradas: EntradaWhitelist[]): EntradaWhitelist[][] {
  const partes: EntradaWhitelist[][] = [];
  for (let i = 0; i < entradas.length; i += POR_PARTE) partes.push(entradas.slice(i, i + POR_PARTE));
  return partes;
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Suscripción en vivo a la lista completa (cabecera + partes).
 *
 * Entrega además las entradas que se descartaron al normalizar: un documento
 * editado a mano o un archivo importado a medias puede traer filas inválidas, y
 * descartarlas en silencio deja a alguien creyendo que un cliente está
 * whitelisteado cuando no lo está.
 */
export function subscribeWhitelist(
  onData: (wl: WhitelistClientes, descartadas: WhitelistNormalizada['descartadas']) => void,
  onError?: (msg: string) => void,
): () => void {
  const db = getDb() as Firestore | null;
  if (!db) { onData(WHITELIST_DEFAULT, []); return () => {}; }

  const ref = doc(db, WHITELIST_COLLECTION, WHITELIST_DOC);
  let vivo = true;
  // La cabecera va por suscripción y las partes se releen cuando la cabecera
  // cambia. `actualizadoEn` cambia en cada guardado, así que sirve de detector:
  // sin esto habría que mantener N suscripciones y rearmarlas cada vez que la
  // lista crece o se achica de tamaño.
  let version = '';

  const unsub = onSnapshot(ref, snap => {
    const cab = snap.data() as Record<string, unknown> | undefined;
    const v = String(cab?.actualizadoEn ?? '');
    version = v;
    void (async () => {
      const entradas = await leerPartes(db, cuantasPartes(cab));
      // Llegó otra versión mientras se leían las partes: esta quedó vieja.
      if (!vivo || version !== v) return;
      const n = normalizarWhitelist({ ...(cab ?? {}), entradas });
      onData(n.wl, n.descartadas);
    })().catch(e => onError?.((e as Error).message));
  }, err => onError?.(err.message));

  return () => { vivo = false; unsub(); };
}

/** Lee las N partes y devuelve sus entradas concatenadas, en orden. */
async function leerPartes(db: Firestore, partes: number): Promise<EntradaWhitelist[]> {
  if (partes <= 0) return [];
  const docs = await Promise.all(
    Array.from({ length: partes }, (_, i) => getDoc(doc(db, WHITELIST_COLLECTION, nombreParte(i)))),
  );
  return docs.flatMap(d => ((d.data() as { entradas?: unknown } | undefined)?.entradas ?? []) as EntradaWhitelist[]);
}

/** Lectura puntual (sin suscripción). Devuelve también cuántas lecturas costó. */
export async function leerWhitelist(): Promise<{ wl: WhitelistClientes; lecturas: number }> {
  const db = getDb() as Firestore | null;
  if (!db) return { wl: WHITELIST_DEFAULT, lecturas: 0 };
  const cab = await getDoc(doc(db, WHITELIST_COLLECTION, WHITELIST_DOC));
  if (!cab.exists()) return { wl: WHITELIST_DEFAULT, lecturas: 1 };
  const data = cab.data() as Record<string, unknown>;
  const partes = cuantasPartes(data);
  const entradas = await leerPartes(db, partes);
  return {
    wl: normalizarWhitelist({ ...data, entradas }).wl,
    lecturas: 1 + partes,
  };
}

// ── Escritura ───────────────────────────────────────────────────────────────

export class WhitelistDemasiadoGrande extends Error {
  constructor(public total: number) {
    super(`La lista tiene ${total} entradas y el tope es ${TOPE_ENTRADAS}.`);
    this.name = 'WhitelistDemasiadoGrande';
  }
}

/**
 * Guarda la lista completa: cabecera + partes, y **borra las partes que
 * sobran**.
 *
 * Ese borrado no es un detalle: si la lista baja de 3 partes a 2 y la tercera
 * queda, sus entradas se siguen leyendo y los clientes que alguien sacó de la
 * lista se seguirían liberando. Con una lista que perdona todo, esa es
 * exactamente la fuga que no puede existir.
 */
export async function guardarWhitelist(wl: WhitelistClientes, actor?: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado en esta instancia.');

  // Se normaliza ANTES de guardar: lo que no pasa la validación no llega al
  // documento. Así lo guardado siempre es válido y el Lambda no depende de que
  // la app haya hecho bien su trabajo.
  const n = normalizarWhitelist({ ...wl } as unknown as Record<string, unknown>);
  if (n.wl.entradas.length > TOPE_ENTRADAS) throw new WhitelistDemasiadoGrande(n.wl.entradas.length);

  const ref = doc(db, WHITELIST_COLLECTION, WHITELIST_DOC);
  const nuevas = partir(n.wl.entradas);

  // Cuántas partes había antes, para borrar las que sobran.
  const cabPrevia = await getDoc(ref);
  const previas = cuantasPartes(cabPrevia.data() as Record<string, unknown> | undefined);

  // Firestore permite 500 operaciones por batch. Con partes de 1.000 entradas,
  // 20.000 clientes son 20 partes: entra de sobra, pero se trocea igual para no
  // depender de eso.
  const batchs: ReturnType<typeof writeBatch>[] = [];
  let actual = writeBatch(db);
  let cuantas = 0;
  const agregar = (fn: (b: ReturnType<typeof writeBatch>) => void) => {
    if (cuantas >= 450) { batchs.push(actual); actual = writeBatch(db); cuantas = 0; }
    fn(actual); cuantas++;
  };

  // ORDEN: primero las partes, la cabecera AL FINAL.
  //
  // La cabecera es la que dice cuántas partes leer, así que es el conmutador. Si
  // se escribiera primero y la tanda fallara a la mitad, la lista quedaría
  // apuntando a partes que todavía no existen —o peor, prendida con contenido a
  // medias—. Escribiéndola última, hasta que no está todo lo demás la lista
  // sigue siendo exactamente la anterior.
  nuevas.forEach((trozo, i) => agregar(b => b.set(doc(db, WHITELIST_COLLECTION, nombreParte(i)), { entradas: trozo })));
  for (let i = nuevas.length; i < previas; i++) {
    agregar(b => b.delete(doc(db, WHITELIST_COLLECTION, nombreParte(i))));
  }
  agregar(b => b.set(ref, {
    enabled: n.wl.enabled,
    total: n.wl.entradas.length,
    partes: nuevas.length,
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: actor?.nombre ?? 'system',
  }));
  batchs.push(actual);

  for (const b of batchs) await b.commit();
}

/** Prende o apaga la lista sin reescribir las partes. Una sola escritura. */
export async function cambiarSwitchWhitelist(enabled: boolean, actor?: Actor): Promise<void> {
  const db = getDb() as Firestore | null;
  if (!db) throw new Error('Firestore no está configurado en esta instancia.');
  const batch = writeBatch(db);
  batch.set(doc(db, WHITELIST_COLLECTION, WHITELIST_DOC), {
    enabled,
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: actor?.nombre ?? 'system',
  }, { merge: true });
  await batch.commit();
}

/**
 * Lee un archivo .xlsx / .xls / .csv / .txt y lo convierte en entradas.
 *
 * `xlsx` se importa de forma perezosa: es la dependencia más pesada de la app y
 * no tiene por qué entrar en el bundle de quien nunca importa una base.
 */
export async function parsearArchivo(file: File, opciones: OpcionesImportacion): Promise<ResultadoImportacion> {
  const nombre = file.name.toLowerCase();
  if (/\.(csv|txt|tsv)$/.test(nombre)) {
    return parsearPegado(await file.text(), opciones);
  }
  const XLSX = await import('xlsx');
  const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return { entradas: [], errores: [], encabezadoSalteado: false, filasLeidas: 0 };
  // `header: 1` devuelve filas como arrays, que es lo que necesita el parser:
  // no se depende de los nombres de las columnas, solo de su ORDEN. Con nombres
  // habría que adivinar variantes ("RUT", "Rut cliente", "N° documento"…) y un
  // encabezado distinto silenciaría la importación entera.
  // `raw: false` fuerza texto: sin eso un RUT numérico vuelve como número y
  // pierde ceros a la izquierda.
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: '' })
    .map(f => (f as unknown[]).map(c => String(c ?? '').trim()))
    .filter(f => f.some(Boolean));
  return filasAEntradas(filas, opciones);
}

