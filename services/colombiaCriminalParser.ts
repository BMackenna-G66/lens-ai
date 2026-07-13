// Parser del Excel del masivo Inspektor (5 hojas) → perfiles para el flujo Colombia
// del Criminal Profiler. Colombia NO tiene catálogo/scoring: solo agrupamos las
// coincidencias y antecedentes por persona para revisión y decisión MANUAL.

import * as XLSX from 'xlsx';
import { AnalysisAction } from '../types/criminalTypes';

export interface CoincidenciaLista {
  origen: string; nombre: string; identificacion: string; prioridad: string;
  grupoLista: string; nombreLista: string; delito: string; pep: string;
  zona: string; fuente: string; fechaActualizacion: string;
}
export interface ProcRecord {
  nombre: string; identificacion: string; numSiri: string;
  sanciones: string; delitos: string; instancias: string; inhabilidades: string;
}
export interface RamaProceso {
  idProceso: string; llave: string; despacho: string; departamento: string;
  fechaProceso: string; fechaUltimaActuacion: string; esPrivado: string; sujetos: string;
}
export interface JepmsItem {
  ciudad: string; nombreResultado: string; identificacionResultado: string;
  exito: string; fechaConsulta: string; link: string;
}

export interface ColombiaProfile {
  numeroDni: string; nombre: string; tipoDni: string;
  resultado: string;            // resultado original de Inspektor (ALERTA/REVISAR/…)
  totalCoincidencias: number;
  prioridadMaxima: string;
  listas: string;
  coincidencias: CoincidenciaLista[];
  procuraduria: ProcRecord[];
  ramaJudicial: RamaProceso[];
  jepms: JepmsItem[];
  // Revisión manual (sin catálogo)
  accion: AnalysisAction;
  estado: 'Pendiente' | 'Revisado';
  notas: string;
}

export interface TimelineEvent { fecha: string; tipo: string; descripcion: string; }

const S = (v: unknown): string => (v === null || v === undefined) ? '' : String(v).trim();

// Lee una hoja por coincidencia de nombre (tolerante) → filas JSON.
function sheetRows(wb: XLSX.WorkBook, re: RegExp): Record<string, unknown>[] {
  const name = wb.SheetNames.find(n => re.test(n.toLowerCase().replace(/\s+/g, '_')));
  return name ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' }) : [];
}

const dniOf = (r: Record<string, unknown>): string =>
  S(r['numero_dni'] ?? r['numero'] ?? r['numero_documento'] ?? r['dni'] ?? r['documento']);

function groupBy<T>(rows: Record<string, unknown>[], map: (r: Record<string, unknown>) => T): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = dniOf(r);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(map(r));
  }
  return m;
}

export async function parseColombiaMasivo(file: File): Promise<ColombiaProfile[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const resumen = sheetRows(wb, /resumen/);
  if (resumen.length === 0) {
    throw new Error('El archivo no tiene hoja "Resumen". Usa el Excel exportado por la Consulta Masiva de Inspektor.');
  }

  const listasByDni = groupBy<CoincidenciaLista>(sheetRows(wb, /detalle|listas/), r => ({
    origen: S(r['origen']), nombre: S(r['coincidencia_nombre']), identificacion: S(r['coincidencia_identificacion']),
    prioridad: S(r['prioridad']), grupoLista: S(r['grupo_lista']), nombreLista: S(r['nombre_lista']),
    delito: S(r['delito']), pep: S(r['pep']), zona: S(r['zona']), fuente: S(r['fuente']),
    fechaActualizacion: S(r['fecha_actualizacion']),
  }));
  const procByDni = groupBy<ProcRecord>(sheetRows(wb, /procuradur/), r => ({
    nombre: S(r['registro_nombre']), identificacion: S(r['registro_identificacion']), numSiri: S(r['num_siri']),
    sanciones: S(r['sanciones']), delitos: S(r['delitos']), instancias: S(r['instancias']), inhabilidades: S(r['inhabilidades']),
  }));
  const ramaByDni = groupBy<RamaProceso>(sheetRows(wb, /rama/), r => ({
    idProceso: S(r['id_proceso']), llave: S(r['llave_proceso']), despacho: S(r['despacho']), departamento: S(r['departamento']),
    fechaProceso: S(r['fecha_proceso']), fechaUltimaActuacion: S(r['fecha_ultima_actuacion']),
    esPrivado: S(r['es_privado']), sujetos: S(r['sujetos_procesales']),
  }));
  const jepmsByDni = groupBy<JepmsItem>(sheetRows(wb, /jepms/), r => ({
    ciudad: S(r['ciudad']), nombreResultado: S(r['nombre_resultado']), identificacionResultado: S(r['identificacion_resultado']),
    exito: S(r['exito']), fechaConsulta: S(r['fecha_consulta']), link: S(r['link']),
  }));

  return resumen.map((r): ColombiaProfile => {
    const dni = dniOf(r);
    return {
      numeroDni: dni,
      nombre: S(r['nombre_completo'] ?? r['nombre']),
      tipoDni: S(r['tipo_dni'] ?? r['tipo']),
      resultado: S(r['resultado']) || 'SIN_HALLAZGOS',
      totalCoincidencias: Number(r['total_coincidencias']) || 0,
      prioridadMaxima: S(r['prioridad_maxima']),
      listas: S(r['listas']),
      coincidencias: listasByDni.get(dni) ?? [],
      procuraduria: procByDni.get(dni) ?? [],
      ramaJudicial: ramaByDni.get(dni) ?? [],
      jepms: jepmsByDni.get(dni) ?? [],
      accion: '',
      estado: 'Pendiente',
      notas: '',
    };
  }).filter(p => p.numeroDni || p.nombre);
}

// Línea de tiempo consolidada de eventos (rama judicial, JEPMS, listas).
export function buildTimeline(p: ColombiaProfile): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const x of p.ramaJudicial) {
    if (x.fechaProceso) ev.push({ fecha: x.fechaProceso, tipo: 'Rama Judicial', descripcion: [x.despacho, x.departamento].filter(Boolean).join(' · ') });
    if (x.fechaUltimaActuacion) ev.push({ fecha: x.fechaUltimaActuacion, tipo: 'Última actuación', descripcion: x.despacho || x.llave });
  }
  for (const x of p.jepms) if (x.fechaConsulta) ev.push({ fecha: x.fechaConsulta, tipo: 'JEPMS', descripcion: x.ciudad });
  for (const x of p.coincidencias) if (x.fechaActualizacion) ev.push({ fecha: x.fechaActualizacion, tipo: 'Lista', descripcion: x.nombreLista });
  // Orden descendente por fecha (formatos ISO ordenan como string).
  return ev.filter(e => e.fecha).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}
