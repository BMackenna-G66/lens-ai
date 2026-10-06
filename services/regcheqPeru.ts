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

import * as XLSX from 'xlsx';

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
  /** El cargo que hace PEP a la persona: en pepPeru viene en `record`
   *  (cargoRelacionado, dependencia, fechas, fuente); en funcPeru, como
   *  cargoPersonal y dependencia. Es lo más útil para juzgar un PEP. */
  cargo: string; entidad: string; fechaInicio: string; fechaFin: string; fuente: string;
  /** TODOS los campos de la fila, aplanados. Lo que el mapeo no conoce no se
   *  pierde: funcPeru no trae las claves de pepPeru, y así se vio en el
   *  export (68 funcionarios con solo el % de coincidencia). */
  detalle: string;
}

export interface FamiliarPepPeru {
  relacion: string; pepVinculado: string; dniPep: string; nivel: string; baseRegulatoria: string;
  lugarTrabajo: string;
  /** «confianza · tipo de evidencia · método de match», de `veracity`. */
  veracidad: string;
  /** `veracity.note`, aparte. */
  notaVeracidad: string;
  riesgo: string;
  /** De qué es PEP el vinculado (`linkedPep`): sin esto, «PEP vinculado» no
   *  decía de qué. */
  pepCargo: string; pepOrganismo: string; pepEstado: string;
  /** `provenance.linkConfidence`: qué tan seguro es el vínculo. */
  confianzaVinculo: string;
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

// ── Lectura de campos ────────────────────────────────────────────────────────
//
// Las claves se comparan SIN mayúsculas ni separadores: `nroResolucionNombramiento`,
// `nro_resolucion_nombramiento` y `nroresolucionnombramiento` son la misma. Es
// una defensa ante variantes del proveedor. OJO: las resoluciones que salían
// vacías en el export NO eran un nombre mal puesto —la clave real es
// `nroresolucionnombramiento` y viene vacía en el dato—; lo que se perdía era
// `record` (ver aCoincidencia).

const normalClave = (k: string) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/** El primer campo que exista entre los candidatos, en forma legible. */
export function campo(f: Crudo | null | undefined, ...candidatos: string[]): string {
  if (!f || typeof f !== 'object') return '';
  const buscadas = candidatos.map(normalClave);
  for (const b of buscadas) {
    const k = Object.keys(f).find(x => normalClave(x) === b);
    if (k !== undefined) {
      const v = legible(f[k]);
      if (v) return v;
    }
  }
  return '';
}

/** Claves que no aportan nada a quien lee. */
const CLAVES_RUIDO = new Set(['_id', '__v', 'id', 'createdat', 'updatedat']);

/**
 * Cualquier valor como texto legible. Un objeto sale «clave: valor · clave:
 * valor» y una lista «a · b». La veracidad de los familiares es un objeto, y
 * salía «[object Object]» en las 485 filas del export.
 */
export function legible(v: unknown, profundidad = 0): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v !== 'object') return String(v).trim();
  if (profundidad > 3) return '';
  if (Array.isArray(v)) return v.map(x => legible(x, profundidad + 1)).filter(Boolean).join(' · ');
  return Object.entries(v as Crudo)
    .filter(([k]) => !CLAVES_RUIDO.has(normalClave(k)))
    .map(([k, x]) => {
      const t = legible(x, profundidad + 1);
      return t ? `${k}: ${typeof x === 'object' && x !== null ? `(${t})` : t}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/** Todos los campos de una fila, aplanados en una línea. */
export const aplanar = (f: Crudo | null | undefined): string => legible(f ?? {});

/** pepPeru. Claves reales (en minúsculas las de las resoluciones, que vienen
 *  vacías en el dato: no es un nombre mal puesto). El cargo, la dependencia y
 *  las fechas viven en `record`. */
const aCoincidencia = (f: Crudo): CoincidenciaPepPeru => {
  const rec = (f?.record && typeof f.record === 'object') ? f.record as Crudo : {};
  return {
    lista: campo(f, 'nombreLista'),
    origen: campo(f, 'origenLista'),
    conclusion: campo(f, 'conclusion'),
    porcentaje: campo(f, 'porcentajeCoincidencia'),
    resolucionNombramiento: campo(f, 'nroresolucionnombramiento'),
    resolucionRetiro: campo(f, 'nroresolucionretirocargo'),
    fechaUpdate: campo(f, 'fechaUpdate'),
    tipoDocumento: campo(f, 'tipoDocumento'),
    documento: campo(f, 'nroIdentificacion'),
    cargo: campo(rec, 'cargoRelacionado', 'cargo'),
    entidad: campo(rec, 'dependencia', 'entidad'),
    fechaInicio: campo(rec, 'fechaInicio'),
    fechaFin: campo(rec, 'fechaFin'),
    fuente: campo(rec, 'fuente'),
    detalle: aplanar(f),
  };
};

/** funcPeru: no trae nombreLista, origenLista ni conclusion —por eso salían
 *  vacías—; trae cargoPersonal, dependencia y fechaRegistro. */
const aFuncionario = (f: Crudo): CoincidenciaPepPeru => ({
  lista: '', origen: '', conclusion: campo(f, 'coincidencia'),
  porcentaje: campo(f, 'porcentajeCoincidencia'),
  resolucionNombramiento: '', resolucionRetiro: '',
  fechaUpdate: campo(f, 'fechaRegistro'),
  tipoDocumento: campo(f, 'vinculadoIdTipoIdentificacion'),
  documento: campo(f, 'vinculadoNroIdentificacion'),
  cargo: campo(f, 'cargoPersonal', 'cargo'),
  entidad: campo(f, 'dependencia', 'entidad'),
  fechaInicio: '', fechaFin: '', fuente: '',
  detalle: aplanar(f),
});

/** Familiares. La veracidad es { evidenceType, confidence, matchMethod, note }:
 *  sale «confianza · evidencia · método» y la nota aparte, no «[object Object]». */
const aFamiliar = (f: Crudo): FamiliarPepPeru => {
  const ver = (f?.veracity && typeof f.veracity === 'object') ? f.veracity as Crudo : {};
  const pep = (f?.linkedPep && typeof f.linkedPep === 'object') ? f.linkedPep as Crudo : {};
  const prov = (f?.provenance && typeof f.provenance === 'object') ? f.provenance as Crudo : {};
  const veracidad = [campo(ver, 'confidence'), campo(ver, 'evidenceType'), campo(ver, 'matchMethod')].filter(Boolean).join(' · ')
    || (typeof f?.veracity === 'string' ? f.veracity : '');
  return {
    relacion: campo(f, 'relation'),
    pepVinculado: campo(f, 'namePep') || campo(pep, 'name'),
    dniPep: campo(f, 'dniPep') || campo(pep, 'dni'),
    nivel: campo(f, 'level') || campo(pep, 'level'),
    baseRegulatoria: campo(f, 'regulatoryBasis') || campo(pep, 'regulatoryBasis'),
    lugarTrabajo: campo(f, 'relativeWorkplace'),
    veracidad,
    notaVeracidad: campo(ver, 'note'),
    riesgo: campo(f, 'risk'),
    pepCargo: campo(pep, 'position'),
    pepOrganismo: campo(pep, 'organism'),
    pepEstado: campo(pep, 'pepStatus'),
    confianzaVinculo: campo(prov, 'linkConfidence'),
  };
};

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
    funcionario: func ? filasDe(raw.funcPeru).map(aFuncionario) : [],
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

/** La ficha peruana se crea con el DNI Y EL NOMBRE COMPLETO (pedido de
 *  Benjamín): nombres + apellido paterno, o el nombre completo entero. */
export function tieneNombreParaCrear(d: DatosPersonaPeru): boolean {
  return (!!d.nombres?.trim() && !!d.apellidoPaterno?.trim()) || !!d.nombreCompleto?.trim();
}

export class SinNombre extends Error {
  constructor(dni: string) {
    super(`sin nombre: no se crea la ficha peruana ${dni} (faltan nombres y apellido paterno, o nombre completo)`);
    this.name = 'SinNombre';
  }
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

/** Crear o actualizar: el POST con el nombre. Su respuesta ya trae las listas.
 *  Sin nombre completo NO se crea: ni con «crear» marcado ni en la creación
 *  automática del masivo. Se levanta `SinNombre` y la fila queda como error. */
async function crearOActualizar(dni: string, datos: DatosPersonaPeru, deps: DepsRegcheq): Promise<Crudo> {
  if (!tieneNombreParaCrear(datos)) throw new SinNombre(dni);
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

// ── Las coincidencias que no son PEP ────────────────────────────────────────
//
// El export decía «Screening Global: True» en 107 personas sin decir QUÉ
// gatilló. Sin el detalle, el Criminal Profile no puede mostrarlo.

export const ETIQUETAS_PEP_PERU = new Set(Object.values(NOMBRE_LISTA_PERU));

export interface OtraCoincidencia {
  lista: string;
  riesgo: string;
  /** Del hit: a quién encontró y qué tipo de registro es (pep, sanction…). */
  nombre: string;
  tipos: string;
  tipoEntidad: string;
  score: string;
  estadoMatch: string;
  /** El hit es una SANCIÓN: se muestra en rojo y aparte de PEP. */
  sancion: boolean;
  /** Las fuentes, con su URL, y si la fuente dejó de listar a la persona
   *  (eso cambia la lectura del hit). */
  fuentes: string;
  paises: string;
  /** Todos los campos aplanados: la red para claves nuevas. */
  detalle: string;
}

const esSancion = (tipos: string) => /sanction|sanci[oó]n/i.test(tipos);

/** Un hit del screening global: `additionalData` es la BÚSQUEDA (un objeto
 *  con `hits`), no una lista. `source_notes` tiene claves dinámicas —una por
 *  fuente— y se recorre con Object.values. `match_types_details` está indexado
 *  por el nombre de la persona: no se exporta. */
function deHit(lista: string, riesgo: string, busqueda: Crudo, hit: Crudo): OtraCoincidencia {
  const doc = (hit?.doc && typeof hit.doc === 'object') ? hit.doc as Crudo : {};
  const notas = (doc.source_notes && typeof doc.source_notes === 'object') ? Object.values(doc.source_notes as Crudo) as Crudo[] : [];
  const fuentes = notas.map(n => [
    txt(n?.name),
    n?.listing_ended_utc ? `dejó de listar: ${txt(n.listing_ended_utc).slice(0, 10)}` : '',
    txt(n?.url),
  ].filter(Boolean).join(' · ')).filter(Boolean);
  if (!fuentes.length && Array.isArray(doc.sources)) fuentes.push(...doc.sources.map(txt).filter(Boolean));
  const paises = [...new Set(notas.flatMap(n => (Array.isArray(n?.country_codes) ? n.country_codes : []).map(txt)))].filter(Boolean);
  const tipos = Array.isArray(doc.types) ? doc.types.map(txt).filter(Boolean).join(', ') : txt(doc.types);
  const score = typeof hit?.score === 'number' ? hit.score.toFixed(2) : txt(hit?.score);
  return {
    lista, riesgo, nombre: txt(doc.name), tipos, tipoEntidad: txt(doc.entity_type), score,
    estadoMatch: txt(busqueda?.match_status), sancion: esSancion(tipos),
    fuentes: fuentes.join(' | '), paises: paises.join(', '),
    detalle: aplanar(doc).slice(0, 4000),
  };
}

/** Cualquier otra lista: lo que se pueda leer de cada registro, y el detalle. */
function deRegistro(lista: string, riesgo: string, it: Crudo): OtraCoincidencia {
  const tipos = campo(it, 'types', 'type', 'program', 'programa', 'list', 'lista');
  return {
    lista, riesgo, nombre: campo(it, 'name', 'nombre', 'nombreCompleto', 'fullName'), tipos,
    tipoEntidad: campo(it, 'entity_type', 'entityType'), score: campo(it, 'score'), estadoMatch: campo(it, 'match_status', 'status'),
    sancion: esSancion(tipos) || /ofac|sanci/i.test(lista), fuentes: campo(it, 'source', 'fuente', 'sources'), paises: campo(it, 'country', 'pais', 'country_codes'),
    detalle: aplanar(it).slice(0, 4000),
  };
}

/** Una fila por hit de cada lista NO PEP con coincidencia. */
export function otrasCoincidencias(listas: Record<string, EntradaLista>): OtraCoincidencia[] {
  const out: OtraCoincidencia[] = [];
  for (const [lista, e] of Object.entries(listas || {})) {
    if (!e?.coincidence || ETIQUETAS_PEP_PERU.has(lista)) continue;
    const d = (e.data && typeof e.data === 'object' && !Array.isArray(e.data)) ? e.data as Crudo : null;
    const ad = d?.additionalData;
    if (ad && typeof ad === 'object' && !Array.isArray(ad) && Array.isArray((ad as Crudo).hits)) {
      for (const h of (ad as Crudo).hits as Crudo[]) out.push(deHit(lista, e.risk, ad as Crudo, h));
      continue;
    }
    const items = Array.isArray(ad) ? ad as Crudo[]
      : Array.isArray(e.data) ? (e.data as unknown[]).map(x => (x && typeof x === 'object' ? x as Crudo : { valor: x }))
      : d ? [d] : [];
    if (!items.length) out.push({ ...deRegistro(lista, e.risk, {}), detalle: '(la respuesta no trae detalle)' });
    for (const it of items) out.push(deRegistro(lista, e.risk, it));
  }
  return out;
}

// ── El Excel del masivo de Perú ──────────────────────────────────────────────
//
// Lo arma UNA función, y la usan los dos caminos: «Exportar Excel» y «Enviar al
// Criminal Profile». El Criminal Profile lo lee con el mismo parser que una
// subida manual: lo que llega directo es idéntico a descargar y subir, sin un
// segundo contrato de datos que se desincronice.

export const HOJAS_PERU = {
  resultados: 'Resultados Regcheq Perú',
  pep: 'PEP Perú',
  otras: 'Otras coincidencias',
  resumen: 'Resumen',
} as const;

export const COLUMNAS_PEP_PERU = [
  'DNI', 'Nombre', 'Tipo', 'Lista', 'Origen', 'Conclusión', '% coincidencia', 'Cargo', 'Entidad',
  'Inicio cargo', 'Fin cargo', 'Fuente', 'Res. nombramiento', 'Res. retiro', 'Actualizado',
  'Relación', 'PEP vinculado', 'DNI PEP', 'Cargo del PEP', 'Organismo del PEP', 'Estado PEP', 'Nivel',
  'Base regulatoria', 'Veracidad', 'Nota veracidad', 'Confianza del vínculo', 'Riesgo', 'Detalle',
] as const;

export const COLUMNAS_OTRAS_PERU = [
  'DNI', 'Nombre', 'Lista', 'Riesgo', 'Sanción', 'Nombre del hit', 'Tipos', 'Tipo entidad', 'Score',
  'Estado match', 'Fuentes', 'Países', 'Detalle',
] as const;

/** Lo que el export necesita de cada resultado del masivo. */
export interface FilaExportPeru {
  dni: string;
  nombre: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  riesgoFinal: string;
  nivelPep: string;
  pep?: ResumenPepPeru;
  listas: Record<string, EntradaLista>;
  alertasTexto: string;
}

export function armarWorkbookPeru(filas: FilaExportPeru[], ahora = new Date()): { wb: XLSX.WorkBook; nombre: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  const nombre = `resultado_regcheq_peru_${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}.xlsx`;
  const siNo = (b?: boolean) => (b ? 'Sí' : 'No');
  const etiquetas = [...new Set(filas.flatMap(r => Object.keys(r.listas)))];

  const resultados = filas.map(r => {
    const fila: Record<string, string | number> = {
      'DNI': r.dni,
      'Nombre completo': r.nombre,
      'Nombres': r.nombres,
      'Apellido paterno': r.apellidoPaterno,
      'Apellido materno': r.apellidoMaterno,
      'Riesgo final Ficha': r.riesgoFinal,
      'Es PEP': siNo(r.pep?.esPep),
      'Familiar de PEP': siNo(r.pep?.familiarDePep),
      'Nivel PEP': r.nivelPep,
      'Funcionario público': siNo(r.pep?.funcionarioPublico),
      'listas_total_coincidencias': Object.values(r.listas).filter(e => e.coincidence).length,
    };
    for (const e of etiquetas) fila[`Coincidencia_${e}`] = r.listas[e]?.coincidence ? 'True' : 'False';
    fila['Alertas validación'] = r.alertasTexto;
    return fila;
  });

  const pep: Record<string, string>[] = [];
  for (const r of filas) {
    const p = r.pep;
    if (!p) continue;
    for (const [tipo, lista] of [['PEP', p.coincidencias], ['Funcionario público', p.funcionario]] as const) {
      for (const c of lista) pep.push({
        'DNI': r.dni, 'Nombre': r.nombre, 'Tipo': tipo, 'Lista': c.lista, 'Origen': c.origen,
        'Conclusión': c.conclusion, '% coincidencia': c.porcentaje,
        'Cargo': c.cargo, 'Entidad': c.entidad, 'Inicio cargo': c.fechaInicio, 'Fin cargo': c.fechaFin,
        'Fuente': c.fuente, 'Res. nombramiento': c.resolucionNombramiento, 'Res. retiro': c.resolucionRetiro,
        'Actualizado': c.fechaUpdate, 'Detalle': c.detalle,
      });
    }
    for (const f of p.familiares) pep.push({
      'DNI': r.dni, 'Nombre': r.nombre, 'Tipo': 'Familiar de PEP', 'Relación': f.relacion,
      'PEP vinculado': f.pepVinculado, 'DNI PEP': f.dniPep, 'Cargo del PEP': f.pepCargo,
      'Organismo del PEP': f.pepOrganismo, 'Estado PEP': f.pepEstado, 'Nivel': f.nivel,
      'Base regulatoria': f.baseRegulatoria, 'Veracidad': f.veracidad, 'Nota veracidad': f.notaVeracidad,
      'Confianza del vínculo': f.confianzaVinculo, 'Riesgo': f.riesgo,
    });
  }

  const otras = filas.flatMap(r => otrasCoincidencias(r.listas).map(o => ({
    'DNI': r.dni, 'Nombre': r.nombre, 'Lista': o.lista, 'Riesgo': o.riesgo, 'Sanción': o.sancion ? 'Sí' : 'No',
    'Nombre del hit': o.nombre, 'Tipos': o.tipos, 'Tipo entidad': o.tipoEntidad, 'Score': o.score,
    'Estado match': o.estadoMatch, 'Fuentes': o.fuentes, 'Países': o.paises, 'Detalle': o.detalle,
  })));

  const resumen = [
    { 'Generado': 'Total personas', [ts]: filas.length },
    { 'Generado': 'High Risk', [ts]: filas.filter(r => (r.riesgoFinal || '').toLowerCase().includes('high')).length },
    { 'Generado': 'PEP', [ts]: filas.filter(r => r.pep?.esPep).length },
    { 'Generado': 'Familiar de PEP', [ts]: filas.filter(r => r.pep?.familiarDePep).length },
    { 'Generado': 'Funcionario público', [ts]: filas.filter(r => r.pep?.funcionarioPublico).length },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultados), HOJAS_PERU.resultados);
  // Columnas fijas: si la primera fila es de un familiar, json_to_sheet
  // ordenaría las columnas por esa fila.
  if (pep.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pep, { header: [...COLUMNAS_PEP_PERU] }), HOJAS_PERU.pep);
  if (otras.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(otras, { header: [...COLUMNAS_OTRAS_PERU] }), HOJAS_PERU.otras);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), HOJAS_PERU.resumen);
  return { wb, nombre };
}
