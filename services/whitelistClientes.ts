// WHITELIST DE CLIENTES — clientes autorizados a liberarse solos.
//
// ── Qué es ─────────────────────────────────────────────────────────────────
// Una lista de clientes que, cuando aparecen en la cola de REMESAS, se liberan
// automáticamente: se cierra el caso en Salesforce y se libera la transacción
// en Admin. Sirve para los clientes que remesan seguido y cuya revisión ya se
// hizo, para que no vuelvan a caer en la cola una y otra vez.
//
// **Solo REMESAS.** No aplica a la cola de OFAC y no tiene por qué: lo que se
// decide en OFAC es qué hacer con el CLIENTE —bloquearlo o no—, y eso no se
// delega a una lista. Acá se libera una transacción puntual de un cliente que
// ya se revisó. Si alguna vez hace falta lo mismo para OFAC, es una lista
// aparte con su propio switch, no una columna más en esta.
//
// ── Lo que hay que tener clarísimo ─────────────────────────────────────────
// **Esta lista PERDONA TODO, sin excepción.** Es una decisión de negocio
// explícita y autorizada: un cliente de la whitelist se libera aunque el
// screening traiga coincidencia en listas de sanciones (OFAC, ONU, UE, GAFI) y
// aunque traiga un delito de categoría sensible. Los frenos duros que el flujo
// automático respeta —`delito_sensible`, `coincidencia_listas`, `pep`— **no
// aplican** acá. Ese es el punto de la lista, no un descuido.
//
// La consecuencia directa: **una entrada mal cargada libera plata**. Por eso
// todo el peso del control está en la CARGA, no en la evaluación:
//
//   1. Switch propio (`enabled`), APAGADO por defecto y aparte del flujo
//      automático. No se hereda de `ofac.enabled` ni de `remesa.enabled`: si
//      la whitelist colgara del flujo, prender el flujo para otra cosa
//      prendería también la lista sin que nadie lo pida.
//   2. Toda entrada guarda **quién, cuándo y por qué**. Sin motivo no se carga.
//   3. Las llaves se normalizan y se validan: una entrada sin documento
//      utilizable NI customerId utilizable se DESCARTA al normalizar. Dos
//      vacíos son iguales entre sí, y esa es la forma en que una lista como
//      esta libera la cola entera.
//   4. Vigencia opcional: una entrada puede vencer sola.
//
// ── Lo que la whitelist NO pasa por encima ─────────────────────────────────
// Dos frenos que no son de riesgo sino de coordinación del trabajo, y que se
// mantienen:
//   · `ya_cerrado` — no hay nada que hacer.
//   · `asignado`   — si un analista tomó el caso, lo termina el analista. Si no,
//     el cron le cerraría por debajo el caso que está mirando.
//
// ── Regla del archivo ──────────────────────────────────────────────────────
// Funciones PURAS: sin red, sin Firestore, sin React. Lo importan la app y el
// Lambda desatendido, igual que `flujoDecision.ts` y por el mismo motivo: si
// cada lado decidiera por su cuenta quién está en la lista, divergirían.

import type { CasoSF } from './casosService';
// Se reusa la normalización de documentos de `remesaSamePerson` a propósito: es
// la misma que ya decide si dos documentos son la misma persona. Si la whitelist
// normalizara distinto, un documento podría estar en la lista y no coincidir con
// el del caso por una diferencia de puntuación.
import { canonDocumento, documentoUtilizable, MIN_LARGO_DNI } from './remesaSamePerson';

// ── Llaves ──────────────────────────────────────────────────────────────────
// Los dos campos del caso por los que se puede entrar. Un caso coincide si
// empata CUALQUIERA de los dos (decisión explícita: cubre al cliente que cambió
// de cuenta y al que trae el documento escrito distinto).
export const CAMPO_DOCUMENTO = 'Número de DNI';
export const CAMPO_CUSTOMER_ID = 'Id interno del usuario';

// Largo mínimo del customerId ya normalizado. Los ids de Admin son de 7 dígitos
// (4535350, 4536637); cuatro es un piso holgado que descarta "0", "1", "99" sin
// dejar afuera ids viejos más cortos.
export const MIN_LARGO_CUSTOMER_ID = 4;

/** Normaliza un customerId para comparar: solo dígitos. */
export const canonCustomerId = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

/**
 * ¿Sirve este documento como llave de la whitelist?
 *
 * Es `documentoUtilizable` (la de `remesaSamePerson`, que es la que decide si
 * dos documentos son la misma persona) **más una condición**: tiene que tener
 * al menos un dígito.
 *
 * La condición de más existe porque los dos usos no son simétricos. Allá se
 * comparan DOS documentos entre sí, así que un texto basura tendría que empatar
 * con otro texto basura idéntico para hacer daño. Acá la llave se carga a mano
 * desde una planilla, y una celda con `SIN DATO`, `PENDIENTE` o `NO SIRVE` pasa
 * el largo mínimo y entra a la lista como si fuera un documento. No liberaría a
 * nadie —ningún caso trae eso como DNI—, pero ensucia la lista con entradas que
 * parecen cargadas y nunca aplican, y en una lista que perdona todo eso es
 * justo lo que no se quiere: que nadie sepa qué contiene de verdad.
 *
 * La función compartida NO se toca: cambiarla movería la regla de "envío a sí
 * mismo", que es otro flujo y ya está en producción.
 */
export const documentoParaWhitelist = (v: unknown): boolean =>
  documentoUtilizable(v) && /\d/.test(canonDocumento(v));

/** ¿Esto parece un customerId de verdad, o es un hueco disfrazado? */
export function customerIdUtilizable(v: unknown): boolean {
  const c = canonCustomerId(v);
  if (c.length < MIN_LARGO_CUSTOMER_ID) return false;
  if (/^0+$/.test(c)) return false;
  return true;
}

// ── La entrada ──────────────────────────────────────────────────────────────
export interface EntradaWhitelist {
  /** Documento del cliente, ya canónico (sin puntos ni guion, mayúscula). '' si se cargó solo por id. */
  documento: string;
  /** Id interno del usuario en Admin, solo dígitos. '' si se cargó solo por documento. */
  customerId: string;
  /** Nombre del cliente. Solo para que la lista se pueda leer; NO participa del match. */
  nombre: string;
  /** Por qué está en la lista. Obligatorio: una whitelist sin motivos no se puede auditar. */
  motivo: string;
  /** Caso, ticket o acta que autorizó la excepción. Opcional pero muy recomendable. */
  referencia: string;
  /** 'YYYY-MM-DD'. null = no vence. Vencida, la entrada deja de aplicar sola. */
  vigenciaHasta: string | null;
  agregadoPor: string;
  /** ISO. */
  agregadoEn: string;
}

export interface WhitelistClientes {
  /** Switch propio. APAGADO por defecto y aparte del flujo automático. */
  enabled: boolean;
  entradas: EntradaWhitelist[];
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

export const WHITELIST_DEFAULT: WhitelistClientes = {
  enabled: false,
  entradas: [],
  actualizadoEn: null,
  actualizadoPor: null,
};

// ── Cuántas entradas entran ─────────────────────────────────────────────────
// La lista se guarda PARTIDA en varios documentos de Firestore (ver
// `whitelistClientesService.ts`): una cabecera chica con el switch y el conteo,
// y N partes con las entradas. Eso existe por dos límites reales que tiran para
// lados opuestos:
//
//   · Un documento de Firestore no puede pasar de 1 MiB. A ~400 bytes por
//     entrada, eso son unas 2.600 por documento. De ahí el tamaño de parte.
//   · La cuota del plan Spark son 50.000 lecturas/día compartidas por TODO Lens
//     —cuando se agota no cae solo la Bandeja, cae la app entera—, así que la
//     lista no puede ser un documento por cliente: sería una lectura por cliente
//     en cada carga de la cola y en cada corrida del cron.
//
// Partida en trozos de `POR_PARTE`, leer 10.000 clientes cuesta 11 lecturas.
export const POR_PARTE = 1000;
/** Tope duro de la lista completa. 20 partes; más que eso conviene repensarlo. */
export const TOPE_ENTRADAS = 20000;
/** A partir de acá el mantenedor avisa que la lista se está poniendo grande. */
export const AVISO_ENTRADAS = 15000;

// ── Normalización ───────────────────────────────────────────────────────────
// Mismo criterio que `normalizarFlujoConfig`: **un campo ausente no puede
// habilitar nada**. `enabled` ausente ⇒ apagado.

export interface WhitelistNormalizada {
  wl: WhitelistClientes;
  /** Entradas que se descartaron al normalizar, con el motivo. Se muestran en el mantenedor. */
  descartadas: { indice: number; motivo: string; crudo: unknown }[];
}

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

// 'YYYY-MM-DD' y nada más. Una fecha con otro formato se trata como ausente
// (= no vence), que es la dirección peligrosa, así que se descarta la ENTRADA
// en vez de ignorar la fecha en silencio.
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function normalizarWhitelist(raw: Record<string, unknown> | undefined): WhitelistNormalizada {
  const descartadas: WhitelistNormalizada['descartadas'] = [];
  const crudas = Array.isArray(raw?.entradas) ? (raw!.entradas as unknown[]) : [];
  const entradas: EntradaWhitelist[] = [];
  // Una misma llave cargada dos veces no es un error de negocio, pero sí ruido:
  // la segunda nunca se usa. Se descarta para que la lista diga la verdad.
  const vistas = new Set<string>();

  crudas.forEach((c, indice) => {
    if (!c || typeof c !== 'object') {
      descartadas.push({ indice, motivo: 'No es un objeto', crudo: c });
      return;
    }
    const e = c as Record<string, unknown>;
    const doc = documentoParaWhitelist(e.documento) ? canonDocumento(e.documento) : '';
    const cid = customerIdUtilizable(e.customerId) ? canonCustomerId(e.customerId) : '';

    // LA regla que evita que la lista libere la cola entera: sin ninguna llave
    // utilizable, la entrada coincidiría con todo caso que tampoco traiga esos
    // campos. Dos vacíos son iguales entre sí.
    if (!doc && !cid) {
      descartadas.push({ indice, motivo: 'Sin documento ni customerId utilizables', crudo: c });
      return;
    }

    const motivo = texto(e.motivo);
    if (!motivo) {
      descartadas.push({ indice, motivo: 'Sin motivo: una excepción sin motivo no se puede auditar', crudo: c });
      return;
    }

    const vig = texto(e.vigenciaHasta);
    if (vig && !FECHA_ISO.test(vig)) {
      descartadas.push({ indice, motivo: `Vigencia con formato inválido ("${vig}"): se espera YYYY-MM-DD`, crudo: c });
      return;
    }

    const llave = `${doc}·${cid}`;
    if (vistas.has(llave)) {
      descartadas.push({ indice, motivo: 'Duplicada: ya hay una entrada con las mismas llaves', crudo: c });
      return;
    }
    vistas.add(llave);

    entradas.push({
      documento: doc,
      customerId: cid,
      nombre: texto(e.nombre),
      motivo,
      referencia: texto(e.referencia),
      vigenciaHasta: vig || null,
      agregadoPor: texto(e.agregadoPor) || 'desconocido',
      agregadoEn: texto(e.agregadoEn) || '',
    });
  });

  // El tope se aplica DESPUÉS de descartar, y lo que sobra se reporta: cortar en
  // silencio dejaría entradas cargadas que nunca aplican.
  if (entradas.length > TOPE_ENTRADAS) {
    for (let i = TOPE_ENTRADAS; i < entradas.length; i++) {
      descartadas.push({ indice: i, motivo: `Pasa el tope de ${TOPE_ENTRADAS} entradas`, crudo: entradas[i] });
    }
    entradas.length = TOPE_ENTRADAS;
  }

  return {
    descartadas,
    wl: {
      enabled: raw?.enabled === true,
      entradas,
      actualizadoEn: (raw?.actualizadoEn as string | undefined) ?? null,
      actualizadoPor: (raw?.actualizadoPor as string | undefined) ?? null,
    },
  };
}

// ── Búsqueda ────────────────────────────────────────────────────────────────
export interface CoincidenciaWhitelist {
  entrada: EntradaWhitelist;
  /** Por cuál de las dos llaves entró. Va al log y a la ficha. */
  por: 'documento' | 'customerId';
  /** El valor normalizado con el que se hizo el match. */
  valor: string;
}

interface IndiceWhitelist {
  porDocumento: Map<string, EntradaWhitelist>;
  porCustomerId: Map<string, EntradaWhitelist>;
}

// Índice memoizado por identidad del array de entradas. La cola puede tener 500
// casos y la lista 2.000 entradas: recorrerla por caso son un millón de
// comparaciones por render. Firestore entrega un array nuevo en cada snapshot,
// así que la identidad cambia exactamente cuando cambia el contenido.
const indices = new WeakMap<EntradaWhitelist[], IndiceWhitelist>();

function indexar(entradas: EntradaWhitelist[]): IndiceWhitelist {
  const cache = indices.get(entradas);
  if (cache) return cache;
  const idx: IndiceWhitelist = { porDocumento: new Map(), porCustomerId: new Map() };
  for (const e of entradas) {
    // La PRIMERA gana. `normalizarWhitelist` ya descarta duplicados exactos;
    // esto cubre el caso de dos entradas distintas que comparten una llave.
    if (e.documento && !idx.porDocumento.has(e.documento)) idx.porDocumento.set(e.documento, e);
    if (e.customerId && !idx.porCustomerId.has(e.customerId)) idx.porCustomerId.set(e.customerId, e);
  }
  indices.set(entradas, idx);
  return idx;
}

/** ¿La entrada sigue vigente a esta fecha? Sin vigencia, siempre. */
export function entradaVigente(e: EntradaWhitelist, hoy: string): boolean {
  if (!e.vigenciaHasta) return true;
  // Comparación de strings 'YYYY-MM-DD': ordena igual que la fecha. El día de
  // vencimiento se incluye (vence al terminar ese día).
  return hoy <= e.vigenciaHasta;
}

/** Hoy en 'YYYY-MM-DD'. Se pasa como parámetro para poder testear el vencimiento. */
export const hoyISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * ¿Este caso es de un cliente de la whitelist?
 *
 * Devuelve `null` cuando no aplica — y eso incluye la lista apagada, que es lo
 * que hace que agregar esto no cambie absolutamente nada hasta que alguien
 * prenda el switch a propósito.
 *
 * Solo tiene sentido llamarla con casos de la cola de REMESAS: la lista no
 * aplica a OFAC. Quien llama es responsable de eso, igual que con el resto de
 * las reglas que dependen de la cola.
 */
export function buscarEnWhitelist(
  caso: Pick<CasoSF, 'datos'> | undefined,
  wl: WhitelistClientes | undefined,
  hoy: string = hoyISO(),
): CoincidenciaWhitelist | null {
  if (!wl?.enabled || !wl.entradas?.length || !caso) return null;
  const idx = indexar(wl.entradas);

  const aplica = (e: EntradaWhitelist | undefined): e is EntradaWhitelist =>
    !!e && entradaVigente(e, hoy);

  // El documento va primero: es la llave más estable de las dos (el customerId
  // puede repetirse entre ambientes; el documento identifica a la persona).
  const docCaso = caso.datos?.[CAMPO_DOCUMENTO];
  if (documentoParaWhitelist(docCaso)) {
    const canon = canonDocumento(docCaso);
    const e = idx.porDocumento.get(canon);
    if (aplica(e)) return { entrada: e, por: 'documento', valor: canon };
  }

  const cidCaso = caso.datos?.[CAMPO_CUSTOMER_ID];
  if (customerIdUtilizable(cidCaso)) {
    const canon = canonCustomerId(cidCaso);
    const e = idx.porCustomerId.get(canon);
    if (aplica(e)) return { entrada: e, por: 'customerId', valor: canon };
  }

  return null;
}

/** Texto corto para la ficha y los logs. */
export const motivoWhitelistLegible = (c: CoincidenciaWhitelist): string =>
  `Whitelist por ${c.por === 'documento' ? 'documento' : 'customer ID'} ${c.valor}`
  + (c.entrada.referencia ? ` · ${c.entrada.referencia}` : '')
  + ` · ${c.entrada.motivo}`;

// ── Alta de una entrada ─────────────────────────────────────────────────────
// Se usa desde el mantenedor y desde la importación por archivo. Devuelve el
// error en vez de lanzar: el importador necesita seguir con las demás filas.

export interface BorradorEntrada {
  documento?: unknown;
  customerId?: unknown;
  nombre?: unknown;
  motivo?: unknown;
  referencia?: unknown;
  vigenciaHasta?: unknown;
}

export function construirEntrada(
  b: BorradorEntrada,
  agregadoPor: string,
  ahora: string = new Date().toISOString(),
): { ok: true; entrada: EntradaWhitelist } | { ok: false; error: string } {
  const doc = documentoParaWhitelist(b.documento) ? canonDocumento(b.documento) : '';
  const cid = customerIdUtilizable(b.customerId) ? canonCustomerId(b.customerId) : '';
  if (!doc && !cid) {
    return { ok: false, error: `Hace falta un documento (≥${MIN_LARGO_DNI} caracteres, con al menos un dígito) o un customer ID (≥${MIN_LARGO_CUSTOMER_ID} dígitos) utilizable.` };
  }
  const motivo = texto(b.motivo);
  if (!motivo) return { ok: false, error: 'El motivo es obligatorio.' };
  const vig = texto(b.vigenciaHasta);
  if (vig && !FECHA_ISO.test(vig)) return { ok: false, error: 'La vigencia va en formato YYYY-MM-DD.' };

  return {
    ok: true,
    entrada: {
      documento: doc, customerId: cid,
      nombre: texto(b.nombre), motivo, referencia: texto(b.referencia),
      vigenciaHasta: vig || null,
      agregadoPor: agregadoPor || 'desconocido',
      agregadoEn: ahora,
    },
  };
}

/** ¿Estas dos entradas ocupan la misma llave? Sirve para reemplazar en vez de duplicar. */
export const mismaLlave = (a: EntradaWhitelist, b: EntradaWhitelist): boolean =>
  (!!a.documento && a.documento === b.documento) || (!!a.customerId && a.customerId === b.customerId);
// ── Carga masiva ────────────────────────────────────────────────────────────
// Dos caminos, el mismo parser: pegar desde Excel/Sheets, o subir un archivo
// (.xlsx / .xls / .csv / .txt). Para las bases masivas el archivo es el camino:
// pegar 8.000 filas en un textarea funciona, pero es incómodo y el navegador se
// pone lento.
//
// Columnas, en este orden:
//   documento · customerId · nombre · motivo · referencia · vigenciaHasta
//
// Solo las dos primeras son llaves y con UNA alcanza. El motivo es obligatorio:
// una excepción sin motivo no se puede auditar. Si el archivo no trae motivo por
// fila, se puede pasar un `motivoPorDefecto` (el mantenedor lo ofrece) y se usa
// para las filas que lo tengan vacío.

export interface ResultadoImportacion {
  entradas: EntradaWhitelist[];
  errores: { linea: number; crudo: string; error: string }[];
  /** Se detectó y salteó una fila de encabezado. */
  encabezadoSalteado: boolean;
  /** Filas leídas del archivo, encabezado incluido. Para poder decir "8.000 filas → 7.998 entradas". */
  filasLeidas: number;
}

export interface OpcionesImportacion {
  agregadoPor: string;
  /** Se aplica a las filas sin motivo propio. Sin esto, esas filas se descartan. */
  motivoPorDefecto?: string;
  /** Ídem para la referencia (número de acta, ticket, nombre de la base). */
  referenciaPorDefecto?: string;
  /** Ídem para la vigencia, en YYYY-MM-DD. */
  vigenciaPorDefecto?: string;
}

const SEPARADOR = /\t|;|,/;
const PARECE_ENCABEZADO = /documento|rut|dni|customer|nombre|motivo/i;

/** El parser que comparten el pegado y el archivo: una fila ya partida en celdas. */
export function filasAEntradas(
  filas: string[][],
  opciones: OpcionesImportacion,
): ResultadoImportacion {
  const entradas: EntradaWhitelist[] = [];
  const errores: ResultadoImportacion['errores'] = [];
  let encabezadoSalteado = false;
  const ahora = new Date().toISOString();

  filas.forEach((celdas, i) => {
    const linea = celdas.join(' · ');
    // Encabezado: solo la primera fila, y solo si NINGUNA celda parece una llave
    // real. Sin esa segunda condición, un cliente cuyo nombre incluya "motivo"
    // se perdería en silencio.
    if (i === 0 && PARECE_ENCABEZADO.test(linea) && !/\d{6,}/.test(linea)) {
      encabezadoSalteado = true;
      return;
    }
    const b: BorradorEntrada = {
      documento: celdas[0] ?? '',
      customerId: celdas[1] ?? '',
      nombre: celdas[2] ?? '',
      motivo: (celdas[3] ?? '').trim() || opciones.motivoPorDefecto || '',
      referencia: (celdas[4] ?? '').trim() || opciones.referenciaPorDefecto || '',
      vigenciaHasta: (celdas[5] ?? '').trim() || opciones.vigenciaPorDefecto || '',
    };
    const r = construirEntrada(b, opciones.agregadoPor, ahora);
    if (r.ok) entradas.push(r.entrada);
    else errores.push({ linea: i + 1, crudo: linea, error: r.error });
  });

  return { entradas, errores, encabezadoSalteado, filasLeidas: filas.length };
}

/** Pegado desde Excel/Sheets (TAB) o CSV (`,` o `;`). */
export function parsearPegado(contenido: string, opciones: OpcionesImportacion): ResultadoImportacion {
  const filas = contenido.split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(SEPARADOR).map(c => c.trim().replace(/^"|"$/g, '')));
  return filasAEntradas(filas, opciones);
}

/**
 * Fusiona entradas nuevas sobre las existentes. La NUEVA gana sobre una que
 * ocupe alguna de sus llaves: quien vuelve a cargar un cliente está corrigiendo,
 * no duplicando.
 *
 * Con bases masivas esto tiene que ser por índice y no por `findIndex`: 8.000
 * nuevas contra 8.000 existentes serían 64 millones de comparaciones y el
 * navegador se cuelga.
 */
export function fusionarEntradas(
  existentes: EntradaWhitelist[],
  nuevas: EntradaWhitelist[],
): { entradas: EntradaWhitelist[]; reemplazadas: number; agregadas: number } {
  const porDoc = new Map<string, number>();
  const porCid = new Map<string, number>();
  const resultado = [...existentes];
  resultado.forEach((e, i) => {
    if (e.documento && !porDoc.has(e.documento)) porDoc.set(e.documento, i);
    if (e.customerId && !porCid.has(e.customerId)) porCid.set(e.customerId, i);
  });

  let reemplazadas = 0, agregadas = 0;
  for (const n of nuevas) {
    const i = (n.documento ? porDoc.get(n.documento) : undefined)
      ?? (n.customerId ? porCid.get(n.customerId) : undefined);
    if (i !== undefined) { resultado[i] = n; reemplazadas++; continue; }
    const j = resultado.push(n) - 1;
    if (n.documento) porDoc.set(n.documento, j);
    if (n.customerId) porCid.set(n.customerId, j);
    agregadas++;
  }
  return { entradas: resultado, reemplazadas, agregadas };
}

/** La lista en CSV, para respaldarla o revisarla fuera de la app. */
export function whitelistACsv(entradas: EntradaWhitelist[]): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const filas = [
    ['documento', 'customerId', 'nombre', 'motivo', 'referencia', 'vigenciaHasta', 'agregadoPor', 'agregadoEn'],
    ...entradas.map(e => [
      e.documento, e.customerId, e.nombre, e.motivo, e.referencia,
      e.vigenciaHasta ?? '',
      e.agregadoPor, e.agregadoEn,
    ]),
  ];
  return filas.map(f => f.map(c => esc(String(c ?? ''))).join(',')).join('\n');
}
