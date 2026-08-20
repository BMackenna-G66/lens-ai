// Screening criminal de la EMPRESA y de sus personas relacionadas.
//
// Usa el mismo motor y el mismo catálogo de delitos de Chile que la cola de
// trabajo de Salesforce (`screenChileCriminal` → Regcheq + DEFAULT_CATALOG), así
// que la sugerencia que sale acá es comparable con la de esa cola. No se
// reimplementa nada del motor.
//
// A quién se screenea:
//   · la empresa, por su RUT
//   · representantes legales, accionistas y directorio
// Las personas se deduplican por documento antes de consultar: un accionista que
// también es representante legal es UNA consulta, no dos.
//
// La regla que pidió el negocio y que define el diseño: cuando NO hay
// coincidencias tiene que quedar dicho explícitamente que la empresa y sus
// relacionados PASARON por screening. "No se consultó" y "se consultó y está
// limpio" no pueden verse iguales — es la misma lección de los falsos negativos
// de Regcheq, y acá el valor está justamente en poder afirmar que está limpio.

import { screenChileCriminal } from '../lens360Service';
import { runPool } from '../casosCriminalService';
import type { LadoCanonico, PersonaCanonica } from '../../types/kybCanonico';
import { categoriasSensibles } from '../delitosSensibles';

export type EstadoScreeningKyb =
  | 'SIN_COINCIDENCIAS'   // se consultó y no hay nada — esto es lo que da seguridad
  | 'CON_COINCIDENCIAS'   // se consultó y hay causas penales
  | 'SOLO_PEP'            // sin causas penales, pero marcado PEP
  | 'SIN_DOCUMENTO'       // no se pudo consultar: no hay RUT
  | 'ERROR';              // el proveedor falló — NO es lo mismo que estar limpio

export interface SujetoScreening {
  tipo: 'EMPRESA' | 'REPRESENTANTE' | 'ACCIONISTA' | 'DIRECTOR';
  nombre: string;
  documento: string;
  estado: EstadoScreeningKyb;
  // Sugerencia del motor de decisión, con el catálogo de delitos de Chile. Es el
  // mismo texto que produce la cola de Salesforce (Liberar / UCR / Fully Blocked).
  sugerencia?: string;
  razon?: string;
  delitosUnicos: number;
  pep: boolean;
  delitos: { tipo: string; detalle?: string; estado?: string; fecha?: string }[];
  categoriasSensibles: string[];
  otrasListas: string[];
  mensaje?: string;
}

export interface ResultadoScreeningKyb {
  corridoEn: string;
  sujetos: SujetoScreening[];
  // Resumen para la fila de la cola y para los frenos del flujo automático.
  totalConsultados: number;
  sinCoincidencias: number;
  conCoincidencias: number;
  conError: number;
  sinDocumento: number;
  peps: number;
  categoriasSensibles: string[];
  // Sugerencia agregada de la empresa: la MÁS restrictiva de todas. Un socio con
  // causas graves manda por encima de una empresa limpia.
  sugerenciaGlobal: string;
  // true = TODOS los sujetos con documento se consultaron sin error y sin
  // hallazgos. Es la afirmación fuerte: "pasó screening y está limpio".
  limpioVerificado: boolean;
}

// Orden de restricción de las conclusiones del motor de Chile, de más grave a
// menos. Se usa para agregar: gana la peor.
const ORDEN_SUGERENCIA = ['Fully Blocked', 'UNDER_COMPLIANCE_REVIEW', 'Liberar + UCR', 'Revisar', 'Liberar', 'Sin causas penales'];

function peorSugerencia(sugerencias: string[]): string {
  for (const s of ORDEN_SUGERENCIA) {
    if (sugerencias.some(x => (x ?? '').toUpperCase().includes(s.toUpperCase()))) return s;
  }
  return sugerencias.find(Boolean) ?? '—';
}

// Los sujetos a consultar, deduplicados por documento.
export function sujetosDe(admin: LadoCanonico, lens: LadoCanonico): { tipo: SujetoScreening['tipo']; nombre: string; documento: string }[] {
  const out: { tipo: SujetoScreening['tipo']; nombre: string; documento: string }[] = [];
  const vistos = new Set<string>();

  const agregar = (tipo: SujetoScreening['tipo'], nombre: string, documento: string) => {
    const clave = documento || nombre.toUpperCase();
    if (!clave || vistos.has(clave)) return;
    vistos.add(clave);
    out.push({ tipo, nombre, documento });
  };

  // La empresa primero: su RUT es el sujeto principal.
  const rutEmpresa = admin.identificacionNumero || lens.identificacionNumero || '';
  const nombreEmpresa = admin.razonSocial || lens.razonSocial || '';
  if (rutEmpresa || nombreEmpresa) agregar('EMPRESA', nombreEmpresa, rutEmpresa);

  // Las personas, priorizando el lado de Admin (es el dato oficial) y sumando lo
  // que aparezca solo en los documentos.
  const grupos: [SujetoScreening['tipo'], PersonaCanonica[]][] = [
    ['REPRESENTANTE', [...(admin.representantesLegales ?? []), ...(lens.representantesLegales ?? [])]],
    ['ACCIONISTA', [...(admin.accionistas ?? []), ...(lens.accionistas ?? [])]],
    ['DIRECTOR', [...(admin.directorio ?? []), ...(lens.directorio ?? [])]],
  ];
  for (const [tipo, personas] of grupos) {
    for (const p of personas) agregar(tipo, p.nombre, p.documento);
  }
  return out;
}

// Concurrencia baja: cada consulta a Regcheq crea/refresca una ficha y se cobra.
const CONCURRENCIA = 3;

export async function screenearEmpresaKyb(
  admin: LadoCanonico,
  lens: LadoCanonico,
  onProgreso?: (hechos: number, total: number, nombre: string) => void,
): Promise<ResultadoScreeningKyb> {
  const aConsultar = sujetosDe(admin, lens);
  const sujetos: SujetoScreening[] = [];
  let hechos = 0;

  await runPool(aConsultar, async s => {
    onProgreso?.(hechos, aConsultar.length, s.nombre);

    if (!s.documento) {
      // Sin RUT no se puede consultar. Queda dicho, NO se asume limpio.
      sujetos.push({
        tipo: s.tipo, nombre: s.nombre, documento: '',
        estado: 'SIN_DOCUMENTO', delitosUnicos: 0, pep: false,
        delitos: [], categoriasSensibles: [], otrasListas: [],
        mensaje: 'No tiene documento: no se pudo consultar',
      });
      hechos++;
      return;
    }

    const r = await screenChileCriminal(s.documento, s.nombre);
    const delitos = (r.crimes ?? []).map(c => ({
      tipo: c.crimen || 'Causa penal',
      detalle: c.ruc || c.tribunal || undefined,
      estado: c.estado || undefined,
      fecha: c.fecha || undefined,
    }));
    const cats = categoriasSensibles(delitos.map(d => ({ tipo: d.tipo, detalle: d.detalle })));

    const estado: EstadoScreeningKyb =
      r.estado === 'error' ? 'ERROR'
        : delitos.length > 0 ? 'CON_COINCIDENCIAS'
          : r.pep ? 'SOLO_PEP'
            : 'SIN_COINCIDENCIAS';

    sujetos.push({
      tipo: s.tipo, nombre: s.nombre, documento: s.documento,
      estado,
      sugerencia: r.decision || undefined,
      razon: r.razon || undefined,
      delitosUnicos: r.delitosUnicos ?? 0,
      pep: r.pep === true,
      delitos,
      categoriasSensibles: cats,
      otrasListas: (r.otrasListas ?? []).map(l => l.lista),
      mensaje: r.mensaje,
    });
    hechos++;
  }, CONCURRENCIA);

  // Se ordena como se pidió a consultar, para que la empresa quede primera.
  const orden = new Map(aConsultar.map((s, i) => [s.documento || s.nombre.toUpperCase(), i]));
  sujetos.sort((a, b) => (orden.get(a.documento || a.nombre.toUpperCase()) ?? 99)
    - (orden.get(b.documento || b.nombre.toUpperCase()) ?? 99));

  const conDocumento = sujetos.filter(s => s.estado !== 'SIN_DOCUMENTO');
  const conError = sujetos.filter(s => s.estado === 'ERROR').length;
  const conCoincidencias = sujetos.filter(s => s.estado === 'CON_COINCIDENCIAS').length;
  const cats = [...new Set(sujetos.flatMap(s => s.categoriasSensibles))];

  return {
    corridoEn: new Date().toISOString(),
    sujetos,
    totalConsultados: conDocumento.length,
    sinCoincidencias: sujetos.filter(s => s.estado === 'SIN_COINCIDENCIAS').length,
    conCoincidencias,
    conError,
    sinDocumento: sujetos.filter(s => s.estado === 'SIN_DOCUMENTO').length,
    peps: sujetos.filter(s => s.pep).length,
    categoriasSensibles: cats,
    sugerenciaGlobal: peorSugerencia(sujetos.map(s => s.sugerencia ?? '')),
    // La afirmación fuerte solo se hace si TODOS los que tenían documento se
    // consultaron bien y ninguno arrojó nada. Un error de proveedor la invalida:
    // no se puede decir "está limpio" si una consulta falló.
    limpioVerificado: conDocumento.length > 0 && conError === 0 && conCoincidencias === 0,
  };
}

// Traducción al shape que consumen las alertas DOC_007 / DOC_008 / DOC_009.
// Con esto las tres pasan de "no evaluables" a evaluadas.
export function aScreeningPersonas(r: ResultadoScreeningKyb | undefined) {
  if (!r) return undefined;
  return r.sujetos.map(s => ({
    nombre: `${s.nombre}${s.tipo !== 'EMPRESA' ? ` (${s.tipo.toLowerCase()})` : ''}`,
    coincidencias: s.delitos.map(d => ({ tipo: d.tipo, detalle: d.detalle })),
    pep: s.pep,
  }));
}

// Texto para la columna de la cola. Distingue explícitamente el caso limpio del
// caso sin consultar, que es justamente lo que se pidió.
export function resumenScreeningLegible(r: ResultadoScreeningKyb | undefined): string {
  if (!r) return 'Sin screening';
  if (r.conError > 0) return `⚠️ ${r.conError} consulta(s) con error`;
  if (r.limpioVerificado) return `✓ Sin coincidencias (${r.totalConsultados} consultado/s)`;
  if (r.conCoincidencias > 0) return `${r.conCoincidencias} con causas · ${r.sugerenciaGlobal}`;
  if (r.peps > 0) return `${r.peps} PEP · sin causas penales`;
  if (r.totalConsultados === 0) return 'Nadie tenía documento para consultar';
  return r.sugerenciaGlobal;
}
