// Parser del Excel del masivo de PERÚ (RegcheqTool) → perfiles para la sección
// Perú del Criminal Profile.
//
// Perú NO tiene catálogo de delitos ni motor de decisión: solo PEP. Se agrupa todo
// por persona para revisión y decisión MANUAL, igual que Colombia.
//
// Lo que este parser cuida:
//   · el DNI es SIEMPRE string de 8 dígitos (Excel se come los ceros);
//   · el Excel de entrada del masivo puede traer el mismo DNI varias veces —el
//     archivo de referencia: 2.072 filas, 1.829 DNIs—, así que se DEDUPLICA por
//     DNI y se dice cuántas filas se fusionaron;
//   · lee el mismo archivo que «Exportar Excel» y que el botón «Enviar al
//     Criminal Profile»: un solo contrato de datos;
//   · acepta exports anteriores al arreglo de «Veracidad» y sin la hoja
//     «Otras coincidencias».

import * as XLSX from 'xlsx';
import type { AnalysisAction } from '../types/criminalTypes';
import { normalizaDniPeru, esDniPeruValido } from './regcheqPeru';

export interface PepDetallePeru {
  lista: string; origen: string; conclusion: string;
  /** null si la fila no trae porcentaje. Un 75% puede ser un homónimo. */
  porcentaje: number | null;
  resolucionNombramiento: string; resolucionRetiro: string; actualizado: string;
  /** El cargo que lo hace PEP (o el de funcionario), con su entidad, fechas y fuente. */
  cargo: string; entidad: string; fechaInicio: string; fechaFin: string; fuente: string;
  detalle: string;
}

export interface FamiliarDetallePeru {
  relacion: string; pepVinculado: string; dniPep: string; nivel: string;
  baseRegulatoria: string; veracidad: string; notaVeracidad: string; riesgo: string;
  /** De qué es PEP el vinculado, y qué tan seguro es el vínculo. */
  pepCargo: string; pepOrganismo: string; pepEstado: string; confianzaVinculo: string;
}

export interface OtraDetallePeru {
  lista: string; riesgo: string;
  /** Una SANCIÓN se muestra en rojo y aparte de PEP. */
  sancion: boolean;
  nombre: string; tipos: string; tipoEntidad: string; score: string; estadoMatch: string;
  fuentes: string; paises: string; detalle: string;
}

export interface PeruProfile {
  dni: string;
  nombre: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  riesgoFinal: string;
  esPep: boolean;
  familiarDePep: boolean;
  funcionarioPublico: boolean;
  nivelPep: string;
  totalCoincidencias: number;
  listasConCoincidencia: string[];
  alertasValidacion: string;
  pep: PepDetallePeru[];
  familiares: FamiliarDetallePeru[];
  funcionario: PepDetallePeru[];
  otras: OtraDetallePeru[];
  /** Cuántas filas repetidas de este DNI se fusionaron en este perfil. */
  filasFusionadas: number;
  accion: AnalysisAction;
  estado: 'Pendiente' | 'Revisado';
  notas: string;
}

export interface CargaPeru {
  perfiles: PeruProfile[];
  filasLeidas: number;
  /** Filas que eran el mismo DNI que otra y se fusionaron. */
  duplicados: number;
  avisos: string[];
}

// ── Lectura tolerante de columnas ─────────────────────────────────────────────

/** Sin tildes, sin mayúsculas, sin nada que no sea letra o número. */
export const normal = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

type Fila = Record<string, unknown>;

/** La primera columna que exista, en el orden de preferencia de `nombres`. */
function col(f: Fila, ...nombres: string[]): string {
  const claves = Object.keys(f);
  for (const n of nombres.map(normal)) {
    const k = claves.find(x => normal(x) === n);
    if (k !== undefined) {
      const v = f[k];
      return v === null || v === undefined ? '' : String(v).trim();
    }
  }
  return '';
}

const SI = new Set(['si', 'sí', 'true', 'verdadero', 'x', '1', 'yes']);
const esSi = (v: string) => SI.has(v.trim().toLowerCase());

/** El export viejo escribía la veracidad como «[object Object]»: no es dato. */
const OBJETO_ROTO = '[object Object]';

function hoja(wb: XLSX.WorkBook, ...nombres: string[]): Fila[] | null {
  const buscadas = nombres.map(normal);
  const n = wb.SheetNames.find(s => buscadas.includes(normal(s)));
  return n ? XLSX.utils.sheet_to_json<Fila>(wb.Sheets[n], { defval: '' }) : null;
}

// ── Orden de severidad, para fusionar y ordenar ───────────────────────────────

/** Por CONTENIDO, no por igualdad: el dato real viene «High Risk», «Medium
 *  Risk» y «Low Risk». Con igualdad exacta solo se reconocía «high risk», y los
 *  filtros Medium y Low daban 0 perfiles. */
export function rangoRiesgo(r: string): number {
  const t = String(r ?? '').toLowerCase();
  if (/cr[ií]tic/.test(t)) return 4;
  if (/high|alto/.test(t)) return 3;
  if (/medium|medio/.test(t)) return 2;
  if (/low|bajo/.test(t)) return 1;
  return 0;
}

/** Un nivel numérico de Regcheq pesa más que «PEP», y «PEP» más que «Familiar». */
export function rangoNivel(n: string): number {
  const t = String(n).trim();
  if (/^\d+$/.test(t)) return 100 + Number(t);
  if (/^pep$/i.test(t)) return 2;
  if (/familiar/i.test(t)) return 1;
  return 0;
}

const porcentaje = (s: string): number | null => {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s);
  return m ? Number(m[0].replace(',', '.')) : null;
};

// ── El parser ─────────────────────────────────────────────────────────────────

export function parsePeruWorkbook(wb: XLSX.WorkBook): CargaPeru {
  const resultados = hoja(wb, 'Resultados Regcheq Perú', 'Resultados Regcheq Peru', 'Resultados');
  if (!resultados) {
    throw new Error('El archivo no es el export del masivo de Perú: falta la hoja «Resultados Regcheq Perú».');
  }
  const avisos: string[] = [];
  const porDni = new Map<string, PeruProfile>();
  let invalidas = 0;

  for (const f of resultados) {
    const dni = normalizaDniPeru(col(f, 'DNI'));
    if (!esDniPeruValido(dni)) { invalidas++; continue; }

    const listas = Object.keys(f)
      .filter(k => normal(k).startsWith('coincidencia') && esSi(String(f[k] ?? '')))
      .map(k => k.replace(/^Coincidencia_/i, '').trim());
    const fila: PeruProfile = {
      dni,
      nombre: col(f, 'Nombre completo', 'Nombre'),
      nombres: col(f, 'Nombres'),
      apellidoPaterno: col(f, 'Apellido paterno'),
      apellidoMaterno: col(f, 'Apellido materno'),
      riesgoFinal: col(f, 'Riesgo final Ficha', 'Riesgo final', 'Riesgo'),
      esPep: esSi(col(f, 'Es PEP')),
      familiarDePep: esSi(col(f, 'Familiar de PEP')),
      funcionarioPublico: esSi(col(f, 'Funcionario público', 'Funcionario publico')),
      nivelPep: col(f, 'Nivel PEP'),
      totalCoincidencias: Number(col(f, 'listas_total_coincidencias', 'Total coincidencias')) || 0,
      listasConCoincidencia: listas,
      alertasValidacion: col(f, 'Alertas validación', 'Alertas validacion'),
      pep: [], familiares: [], funcionario: [], otras: [],
      filasFusionadas: 0,
      accion: '', estado: 'Pendiente', notas: '',
    };

    const ya = porDni.get(dni);
    if (!ya) { porDni.set(dni, fila); continue; }
    // El mismo DNI otra vez: se fusiona, quedándose con lo más severo.
    ya.filasFusionadas++;
    ya.nombre ||= fila.nombre;
    ya.nombres ||= fila.nombres;
    ya.apellidoPaterno ||= fila.apellidoPaterno;
    ya.apellidoMaterno ||= fila.apellidoMaterno;
    if (rangoRiesgo(fila.riesgoFinal) > rangoRiesgo(ya.riesgoFinal)) ya.riesgoFinal = fila.riesgoFinal;
    if (rangoNivel(fila.nivelPep) > rangoNivel(ya.nivelPep)) ya.nivelPep = fila.nivelPep;
    ya.esPep ||= fila.esPep;
    ya.familiarDePep ||= fila.familiarDePep;
    ya.funcionarioPublico ||= fila.funcionarioPublico;
    ya.totalCoincidencias = Math.max(ya.totalCoincidencias, fila.totalCoincidencias);
    ya.listasConCoincidencia = [...new Set([...ya.listasConCoincidencia, ...fila.listasConCoincidencia])];
    if (fila.alertasValidacion && !ya.alertasValidacion.includes(fila.alertasValidacion)) {
      ya.alertasValidacion = [ya.alertasValidacion, fila.alertasValidacion].filter(Boolean).join(' · ');
    }
  }

  // ── El detalle, agrupado por DNI y sin repetir ────────────────────────────
  const vistos = new Set<string>();
  const unaVez = (dni: string, tipo: string, registro: object) => {
    const k = `${dni}|${tipo}|${JSON.stringify(registro)}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  };
  let sinPerfil = 0;
  let veracidadRota = 0;

  for (const f of hoja(wb, 'PEP Perú', 'PEP Peru') ?? []) {
    const p = porDni.get(normalizaDniPeru(col(f, 'DNI')));
    if (!p) { sinPerfil++; continue; }
    const tipo = normal(col(f, 'Tipo'));
    if (tipo.includes('familiar')) {
      let veracidad = col(f, 'Veracidad');
      if (veracidad.includes(OBJETO_ROTO)) { veracidad = ''; veracidadRota++; }
      const r: FamiliarDetallePeru = {
        relacion: col(f, 'Relación', 'Relacion'), pepVinculado: col(f, 'PEP vinculado'), dniPep: col(f, 'DNI PEP'),
        nivel: col(f, 'Nivel'), baseRegulatoria: col(f, 'Base regulatoria'), veracidad,
        notaVeracidad: col(f, 'Nota veracidad'), riesgo: col(f, 'Riesgo'),
        pepCargo: col(f, 'Cargo del PEP'), pepOrganismo: col(f, 'Organismo del PEP'),
        pepEstado: col(f, 'Estado PEP'), confianzaVinculo: col(f, 'Confianza del vínculo', 'Confianza del vinculo'),
      };
      if (unaVez(p.dni, 'fam', r)) p.familiares.push(r);
    } else {
      const r: PepDetallePeru = {
        lista: col(f, 'Lista'), origen: col(f, 'Origen'), conclusion: col(f, 'Conclusión', 'Conclusion'),
        porcentaje: porcentaje(col(f, '% coincidencia', 'Porcentaje', 'Coincidencia')),
        resolucionNombramiento: col(f, 'Res. nombramiento', 'Resolución nombramiento'),
        resolucionRetiro: col(f, 'Res. retiro', 'Resolución retiro'),
        actualizado: col(f, 'Actualizado'), cargo: col(f, 'Cargo'), entidad: col(f, 'Entidad'),
        fechaInicio: col(f, 'Inicio cargo'), fechaFin: col(f, 'Fin cargo'), fuente: col(f, 'Fuente'),
        detalle: col(f, 'Detalle'),
      };
      const destino = tipo.includes('funcionario') ? 'func' : 'pep';
      if (unaVez(p.dni, destino, r)) (destino === 'func' ? p.funcionario : p.pep).push(r);
    }
  }

  for (const f of hoja(wb, 'Otras coincidencias') ?? []) {
    const p = porDni.get(normalizaDniPeru(col(f, 'DNI')));
    if (!p) { sinPerfil++; continue; }
    const tipos = col(f, 'Tipos');
    const r: OtraDetallePeru = {
      lista: col(f, 'Lista'), riesgo: col(f, 'Riesgo'),
      sancion: esSi(col(f, 'Sanción', 'Sancion')) || /sanction|sanci[oó]n/i.test(tipos),
      nombre: col(f, 'Nombre del hit'), tipos, tipoEntidad: col(f, 'Tipo entidad'), score: col(f, 'Score'),
      estadoMatch: col(f, 'Estado match'), fuentes: col(f, 'Fuentes'), paises: col(f, 'Países', 'Paises'),
      detalle: col(f, 'Detalle'),
    };
    if (unaVez(p.dni, 'otra', r)) p.otras.push(r);
  }

  const perfiles = [...porDni.values()];
  const duplicados = perfiles.reduce((s, p) => s + p.filasFusionadas, 0);
  if (duplicados) avisos.push(`${duplicados} fila(s) repetidas se fusionaron: el archivo trae ${resultados.length - invalidas} filas y ${perfiles.length} DNIs distintos.`);
  if (invalidas) avisos.push(`${invalidas} fila(s) sin un DNI válido de 8 dígitos se omitieron.`);
  if (sinPerfil) avisos.push(`${sinPerfil} fila(s) de detalle sin un DNI de la hoja de resultados se omitieron.`);
  if (veracidadRota) avisos.push(`La «Veracidad» de ${veracidadRota} familiar(es) vino como «[object Object]» (export anterior al arreglo): se omite. Re-exportando el masivo sale legible.`);
  if (!hoja(wb, 'Otras coincidencias') && perfiles.some(p => p.listasConCoincidencia.some(l => !/pep|funcionario/i.test(l)))) {
    avisos.push('El archivo no trae la hoja «Otras coincidencias» (export anterior): se ve qué listas coincidieron, no el detalle.');
  }
  return { perfiles, filasLeidas: resultados.length, duplicados, avisos };
}

export async function parsePeruMasivo(file: File): Promise<CargaPeru> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return parsePeruWorkbook(wb);
}

/** Las listas con coincidencia que no son PEP ni funcionario (Screening Global…). */
export const otrasListas = (p: PeruProfile) => p.listasConCoincidencia.filter(l => !/pep|funcionario/i.test(l));

/** ¿Hay una sanción? Por los hits de «Otras coincidencias» o, en un export
 *  viejo sin esa hoja, por la etiqueta de una lista que coincidió (OFAC…). */
export const tieneSancion = (p: PeruProfile) =>
  p.otras.some(o => o.sancion) || p.listasConCoincidencia.some(l => /ofac|sanci/i.test(l));

// ── Filtros del dashboard (puros, para poder testearlos) ──────────────────────

export interface FiltrosPeru {
  busqueda: string;
  /** Todos | PEP | Familiar | Funcionario | Sin PEP */
  tipo: string;
  /** Todos | sin | un nivel exacto */
  nivel: string;
  /** Todos | High | Medium | Low */
  riesgo: string;
  /** Todas | Con otras | Sin otras | Con sanción | una lista exacta */
  otras: string;
  /** Todos | Pendiente | Revisado | Sin acción | una acción */
  estado: string;
}

export const FILTROS_PERU_TODOS: FiltrosPeru = { busqueda: '', tipo: 'Todos', nivel: 'Todos', riesgo: 'Todos', otras: 'Todas', estado: 'Todos' };

export function pasaFiltros(p: PeruProfile, f: FiltrosPeru): boolean {
  const q = f.busqueda.trim().toLowerCase();
  if (q && !`${p.dni} ${p.nombre}`.toLowerCase().includes(q)) return false;
  if (f.tipo === 'PEP' && !p.esPep) return false;
  if (f.tipo === 'Familiar' && !p.familiarDePep) return false;
  if (f.tipo === 'Funcionario' && !p.funcionarioPublico) return false;
  if (f.tipo === 'Sin PEP' && (p.esPep || p.familiarDePep || p.funcionarioPublico)) return false;
  if (f.nivel !== 'Todos' && (f.nivel === 'sin' ? !!p.nivelPep : p.nivelPep !== f.nivel)) return false;
  if (f.riesgo !== 'Todos' && rangoRiesgo(p.riesgoFinal) !== rangoRiesgo(f.riesgo)) return false;
  const otras = otrasListas(p);
  if (f.otras === 'Con otras' && otras.length === 0) return false;
  if (f.otras === 'Sin otras' && otras.length > 0) return false;
  if (f.otras === 'Con sanción' && !tieneSancion(p)) return false;
  if (!['Todas', 'Con otras', 'Sin otras', 'Con sanción'].includes(f.otras) && !otras.includes(f.otras)) return false;
  if (f.estado === 'Pendiente' || f.estado === 'Revisado') { if (p.estado !== f.estado) return false; }
  else if (f.estado === 'Sin acción') { if (p.accion) return false; }
  else if (f.estado !== 'Todos' && p.accion !== f.estado) return false;
  return true;
}
