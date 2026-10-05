// REGCHEQ · PERUANOS — lo propio de las fichas peruanas, puro y testeable.
//
// El módulo Regcheq (components/RegcheqTool.tsx) replica para Perú la lógica de
// Chile: individual y masivo, crear o actualizar fichas, y consultar las que ya
// existen. Lo que cambia —y lo que, si se pierde, deja mal la ficha sin avisar—
// vive acá:
//
//   · El DNI peruano son 8 dígitos y SIEMPRE string: Excel se come los ceros
//     de la izquierda, y `01234567` no es `1234567`.
//   · Toda creación —también la automática del masivo ante un 404— lleva
//     `nationality: "Peru"` y el `dniType` de Perú. El body por defecto de Chile
//     crearía la ficha como chilena.
//   · El refresco va SIN nombre: si se manda, Regcheq lo pisa (ver la memoria de
//     fichas). Y es obligatorio: un GET sin refresco devuelve las listas viejas.
//   · Las listas de Perú (pepPeru, pepPeruConsanguineos, pepPeruRegcheq,
//     funcPeru) no están en el mapa de Chile, y el `pepLevel` de la raíz viene
//     null aunque haya coincidencia: el nivel se deriva.

export const DNI_TYPE_PERU = { country: 'Peru', person: 'natural', document: 'DNI' } as const;

export const NOMBRE_LISTA_PERU: Record<string, string> = {
  pepPeru: 'PEP Perú',
  pepPeruConsanguineos: 'PEP Perú — familiares',
  pepPeruRegcheq: 'PEP Perú (Regcheq)',
  funcPeru: 'Funcionarios públicos Perú',
};

// ── DNI ────────────────────────────────────────────────────────────────────

/** El DNI como lo espera Regcheq: 8 dígitos, string, con los ceros de la
 *  izquierda que Excel se comió. Lo que no son dígitos se devuelve tal cual,
 *  para que la validación falle mostrando el valor. */
export function normalizaDniPeru(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let s = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw).trim();
  s = s.replace(/\.0+$/, '');                 // «1234567.0», si vino como número escrito
  const d = s.replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(d)) return d;
  return d.length < 8 ? d.padStart(8, '0') : d;
}

export const esDniPeruValido = (dni: string): boolean => /^\d{8}$/.test(dni);

// ── Bodies ─────────────────────────────────────────────────────────────────

export interface DatosPersonaPeru {
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  /** Si el masivo trae solo «nombre completo», va entero en `name`. */
  nombreCompleto?: string;
  email?: string;
  telefono?: string;
}

/** Refresco: SIN nombre. Mandarlo haría que Regcheq lo pise. */
export function bodyRefrescoPeru(dni: string): Record<string, unknown> {
  return { dni, personType: 'natural', nationality: 'Peru', dniType: { ...DNI_TYPE_PERU } };
}

/** Creación o actualización: el body de refresco más el nombre, en mayúsculas. */
export function bodyCreacionPeru(dni: string, d: DatosPersonaPeru): Record<string, unknown> {
  const b = bodyRefrescoPeru(dni);
  const may = (s?: string) => String(s ?? '').trim().toUpperCase();
  if (d.nombres?.trim() || d.apellidoPaterno?.trim() || d.apellidoMaterno?.trim()) {
    if (d.nombres?.trim()) b.name = may(d.nombres);
    if (d.apellidoPaterno?.trim()) b.fatherName = may(d.apellidoPaterno);
    if (d.apellidoMaterno?.trim()) b.motherName = may(d.apellidoMaterno);
  } else if (d.nombreCompleto?.trim()) {
    b.name = may(d.nombreCompleto);
  }
  if (d.email?.trim()) b.email = d.email.trim();
  if (d.telefono?.trim()) b.phone = d.telefono.trim();
  return b;
}

// ── Listas ─────────────────────────────────────────────────────────────────

export interface EntradaLista { coincidence: boolean; risk: string; data: unknown }

type Crudo = Record<string, any>;

/** Una clave de `listas` es una lista si es un objeto con `coincidence` o
 *  `data`. `lastChecked`, por ejemplo, es una fecha y no una lista. */
const esLista = (v: unknown): v is Crudo =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('coincidence' in (v as object) || 'data' in (v as object));

function entrada(raw: Crudo | undefined | null): EntradaLista {
  let data = raw?.data ?? null;
  if (typeof data === 'string' && !data.trim()) data = null;
  return { coincidence: Boolean(raw?.coincidence), risk: String(raw?.risk ?? ''), data };
}

/**
 * Las listas de una ficha peruana:
 *   1. las cuatro de Perú, SIEMPRE —son el foco, y si no vienen se ve que no
 *      vinieron en vez de desaparecer—;
 *   2. las conocidas del mapa general, solo si vienen: una ficha peruana no
 *      trae «Causas Penales Chile», y mostrarla como «consultada» mentiría;
 *   3. cualquier otra clave que venga, con la clave como etiqueta, para que una
 *      lista nueva no se pierda.
 * Mismo criterio de fusión que Chile: si dos claves comparten etiqueta, gana
 * la que tiene coincidencia.
 */
export function listasPeru(listasRaw: Crudo, conocidas: Record<string, string>): Record<string, EntradaLista> {
  const raw = listasRaw && typeof listasRaw === 'object' ? listasRaw : {};
  const out: Record<string, EntradaLista> = {};
  const poner = (etiqueta: string, e: EntradaLista) => {
    const ya = out[etiqueta];
    if (!ya || e.coincidence || !ya.coincidence) out[etiqueta] = e;
  };
  for (const [k, etiqueta] of Object.entries(NOMBRE_LISTA_PERU)) poner(etiqueta, entrada(raw[k]));
  for (const [k, etiqueta] of Object.entries(conocidas)) if (esLista(raw[k])) poner(etiqueta, entrada(raw[k]));
  for (const [k, v] of Object.entries(raw)) {
    if (k in NOMBRE_LISTA_PERU || k in conocidas || !esLista(v)) continue;
    poner(k, entrada(v));
  }
  return out;
}

// ── Foco PEP ───────────────────────────────────────────────────────────────

export interface CoincidenciaPepPeru {
  lista: string; origen: string; conclusion: string; porcentaje: string;
  resolucionNombramiento: string; resolucionRetiro: string; fechaUpdate: string;
  tipoDocumento: string; documento: string;
}

export interface FamiliarPepPeru {
  relacion: string; pepVinculado: string; dniPep: string; nivel: string; baseRegulatoria: string;
  vinculo: string; lugarTrabajo: string; veracidad: string; riesgo: string;
}

export interface ResumenPepPeru {
  esPep: boolean;
  familiarDePep: boolean;
  funcionarioPublico: boolean;
  /** pepPeruRegcheq si es > 0; si no, «PEP» o «Familiar de PEP»; si no, vacío. */
  nivel: string;
  coincidencias: CoincidenciaPepPeru[];
  funcionario: CoincidenciaPepPeru[];
  familiares: FamiliarPepPeru[];
}

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Las filas de detalle de una lista: `data.additionalData`, o `data` si ya
 *  es una lista. */
export function filasDe(raw: Crudo | undefined | null): Crudo[] {
  const d = raw?.data;
  if (d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.additionalData)) return d.additionalData;
  if (Array.isArray(d)) return d;
  if (Array.isArray(raw?.additionalData)) return raw!.additionalData;
  return [];
}

/** `pepPeruRegcheq.data.pepLevel`, o null si no es un número. */
export function nivelPepRegcheq(raw: Crudo | undefined | null): number | null {
  const v = raw?.data?.pepLevel ?? raw?.pepLevel;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** El nivel PEP de una ficha peruana. El de la raíz viene null aunque haya
 *  coincidencia, así que se deriva de las listas. */
export function derivarNivelPepPeru(listasRaw: Crudo): string {
  const raw = listasRaw || {};
  const n = nivelPepRegcheq(raw.pepPeruRegcheq);
  if (n !== null && n > 0) return String(n);
  if (raw.pepPeru?.coincidence) return 'PEP';
  if (raw.pepPeruConsanguineos?.coincidence) return 'Familiar de PEP';
  return '';
}

const aCoincidencia = (f: Crudo): CoincidenciaPepPeru => ({
  lista: txt(f.nombreLista), origen: txt(f.origenLista), conclusion: txt(f.conclusion),
  porcentaje: txt(f.porcentajeCoincidencia), resolucionNombramiento: txt(f.nroresolucionnombramiento),
  resolucionRetiro: txt(f.nroresolucionretirocargo), fechaUpdate: txt(f.fechaUpdate),
  tipoDocumento: txt(f.tipoDocumento), documento: txt(f.nroIdentificacion),
});

const aFamiliar = (f: Crudo): FamiliarPepPeru => ({
  relacion: txt(f.relation), pepVinculado: txt(f.namePep), dniPep: txt(f.dniPep), nivel: txt(f.level),
  baseRegulatoria: txt(f.regulatoryBasis), vinculo: txt(f.linkedPep), lugarTrabajo: txt(f.relativeWorkplace),
  veracidad: txt(f.veracity), riesgo: txt(f.risk),
});

export function resumenPepPeru(listasRaw: Crudo): ResumenPepPeru {
  const raw = listasRaw || {};
  const nivelRegcheq = nivelPepRegcheq(raw.pepPeruRegcheq);
  const pep = !!raw.pepPeru?.coincidence;
  const familiar = !!raw.pepPeruConsanguineos?.coincidence;
  const func = !!raw.funcPeru?.coincidence;
  return {
    esPep: pep || (nivelRegcheq !== null && nivelRegcheq > 0),
    familiarDePep: familiar,
    funcionarioPublico: func,
    nivel: derivarNivelPepPeru(raw),
    coincidencias: pep ? filasDe(raw.pepPeru).map(aCoincidencia) : [],
    funcionario: func ? filasDe(raw.funcPeru).map(aCoincidencia) : [],
    familiares: familiar ? filasDe(raw.pepPeruConsanguineos).map(aFamiliar) : [],
  };
}

// ── Masivo: columnas del Excel ─────────────────────────────────────────────

/** Los alias de cada columna, ya en minúsculas y sin espacios en los bordes
 *  (así llegan las cabeceras desde el componente). */
export const COLUMNAS_PERU = {
  dni: ['dni', 'documento', 'nro documento', 'nro. documento', 'nro_documento', 'numero documento', 'número documento', 'n° documento'],
  nombres: ['nombres', 'nombre'],
  paterno: ['apellido paterno', 'apellido_paterno', 'paterno'],
  materno: ['apellido materno', 'apellido_materno', 'materno'],
  completo: ['nombre completo', 'nombre_completo', 'nombres y apellidos'],
} as const;

const primera = (row: Record<string, unknown>, alias: readonly string[]): unknown => {
  const k = alias.find(a => row[a] !== undefined && String(row[a]).trim() !== '');
  return k ? row[k] : undefined;
};

export function columnaDniPeru(cabeceras: string[]): string | null {
  return COLUMNAS_PERU.dni.find(a => cabeceras.includes(a)) ?? null;
}

export interface FilaPeru { dni: string; datos: DatosPersonaPeru }

export function filaMasivoPeru(row: Record<string, unknown>): FilaPeru {
  return {
    dni: normalizaDniPeru(primera(row, COLUMNAS_PERU.dni)),
    datos: {
      nombres: txt(primera(row, COLUMNAS_PERU.nombres)),
      apellidoPaterno: txt(primera(row, COLUMNAS_PERU.paterno)),
      apellidoMaterno: txt(primera(row, COLUMNAS_PERU.materno)),
      nombreCompleto: txt(primera(row, COLUMNAS_PERU.completo)),
    },
  };
}

// ── Llamadas a Regcheq (con fetch inyectado, para poder testearlas) ────────

export interface DepsRegcheq {
  fetch: typeof fetch;
  base: string;
  key: string;
  esperar?: (ms: number) => Promise<void>;
}

export class FichaNoExiste extends Error {
  constructor(dni: string) {
    super(`No hay ficha en Regcheq para el DNI ${dni}. Para crearla, marcá «Crear o actualizar ficha» y cargá nombres y apellido paterno.`);
    this.name = 'FichaNoExiste';
  }
}

const tieneListas = (j: unknown): j is Crudo => !!j && typeof j === 'object' && !!(j as Crudo).listas && typeof (j as Crudo).listas === 'object';

async function json(r: Response): Promise<unknown> {
  try { return await r.json(); } catch { return null; }
}

async function getFicha(dni: string, deps: DepsRegcheq): Promise<{ status: number; json: unknown }> {
  const r = await deps.fetch(`${deps.base}/record/${dni}/${deps.key}`);
  return { status: r.status, json: r.ok ? await json(r) : null };
}

async function postFicha(body: Record<string, unknown>, deps: DepsRegcheq): Promise<{ status: number; ok: boolean; json: unknown }> {
  const r = await deps.fetch(`${deps.base}/record/${deps.key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, ok: r.ok, json: await json(r) };
}

const espera = (deps: DepsRegcheq, ms: number) => (deps.esperar ?? (t => new Promise<void>(res => setTimeout(res, t))))(ms);

/** Después de un POST que no trajo las listas, la lectura. */
async function leerTrasPost(dni: string, deps: DepsRegcheq, ms: number): Promise<Crudo> {
  await espera(deps, ms);
  const g = await getFicha(dni, deps);
  if (g.status !== 200 || !tieneListas(g.json)) throw new Error(`API ${g.status} al leer la ficha ${dni}`);
  return g.json;
}

/** Crear o actualizar: el POST con el nombre. Su respuesta ya trae las listas. */
async function crearOActualizar(dni: string, datos: DatosPersonaPeru, deps: DepsRegcheq): Promise<Crudo> {
  const p = await postFicha(bodyCreacionPeru(dni, datos), deps);
  if (!p.ok) throw new Error(`Regcheq rechazó crear o actualizar la ficha ${dni} (API ${p.status})`);
  return tieneListas(p.json) ? p.json : leerTrasPost(dni, deps, 800);
}

/** Refrescar una ficha que existe: el POST SIN nombre. Si el refresco falla
 *  se declara: las listas guardadas pueden ser viejas, y mostrarlas como de
 *  hoy sería peor que no mostrarlas. */
async function refrescar(dni: string, deps: DepsRegcheq): Promise<Crudo> {
  const p = await postFicha(bodyRefrescoPeru(dni), deps);
  if (!p.ok) throw new Error(`No se pudo refrescar la ficha ${dni} (API ${p.status}); no se muestran listas desactualizadas`);
  return tieneListas(p.json) ? p.json : leerTrasPost(dni, deps, 500);
}

/**
 * Individual.
 *   · Con «Crear o actualizar ficha»: POST con el nombre.
 *   · Sin: se mira que la ficha exista y se refresca SIN nombre. Si no existe,
 *     se avisa en vez de crearla: un refresco sobre una ficha inexistente la
 *     crearía sin nombre.
 */
export async function consultarPeru(dni: string, crear: boolean, datos: DatosPersonaPeru, deps: DepsRegcheq): Promise<Crudo> {
  if (crear) return crearOActualizar(dni, datos, deps);
  const g = await getFicha(dni, deps);
  if (g.status === 404) throw new FichaNoExiste(dni);
  if (g.status !== 200) throw new Error(`API ${g.status} al consultar la ficha ${dni}`);
  return refrescar(dni, deps);
}

/**
 * Masivo, una fila. Igual que Chile: si no se pidió crear y la ficha no existe,
 * se crea automáticamente —con el body PERUANO y el nombre del Excel— y se lee.
 * Si existe, se refresca sin nombre.
 */
export async function procesarFilaPeru(fila: FilaPeru, crear: boolean, deps: DepsRegcheq, avisar: (texto: string) => void = () => {}): Promise<Crudo> {
  if (crear) return crearOActualizar(fila.dni, fila.datos, deps);
  const g = await getFicha(fila.dni, deps);
  if (g.status === 404) {
    avisar(`  ↳ 404 para ${fila.dni} — creando ficha peruana automáticamente…`);
    return crearOActualizar(fila.dni, fila.datos, deps);
  }
  if (g.status !== 200) throw new Error(`API ${g.status} al consultar la ficha ${fila.dni}`);
  return refrescar(fila.dni, deps);
}
