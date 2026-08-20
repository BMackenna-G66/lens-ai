// Barrido de empresas desde Admin hacia la cola KYB (Fase 4 · ingesta automática).
//
// Va por el Worker (`/admin/company-sweep`), que guarda el refresh-token y aplica
// la allowlist de filtros. Solo lectura del lado de Admin.
//
// ⚠️ El riesgo que define este archivo: Admin IGNORA EN SILENCIO los parámetros
// que no conoce y devuelve el universo completo — al momento de escribir esto,
// 72.207 empresas. Un typo en el nombre de un filtro no da error: trae todo. Por
// eso el flujo es en dos pasos obligatorios:
//
//   1. `simularBarrido()` — devuelve el conteo y si el filtro EFECTIVAMENTE filtró
//   2. `barrer()` — trae las empresas, y SE NIEGA a hacerlo si el filtro no filtró
//      o si el resultado supera el tope
//
// Sin esa guarda, un typo encolaría 72 mil empresas.

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const barridoDisponible = (): boolean => !!PROXY;

// Filtros verificados contra la API. Los que Admin ignora (countryCode,
// institutional) NO están: aceptarlos daría una falsa sensación de filtro.
export interface FiltrosBarrido {
  kycStage1?: string;
  kycStage2?: string;
  kycStage3?: string;
  complianceStatus?: string;
  country?: string;
  riskLevel?: string;
  segmentationType?: string;
  page?: number;
  size?: number;
}

export interface EmpresaBarrida {
  companyId: string;
  razonSocial: string;
  identificacion?: string;
  pais?: string;
  complianceStatus?: string;
  kycStage1?: string;
  riskLevel?: string;
  institucional?: boolean;
  creadoEn?: string;
  // Registro crudo de Admin tal como vino en el listado. Es un SNAPSHOT con la
  // fecha del barrido, no una fuente de verdad: sirve para poder abrir la ficha
  // sin analizar. El análisis siempre re-consulta.
  crudo?: Record<string, unknown>;
}

export interface ResultadoSimulacion {
  total: number;
  totalSinFiltro: number;
  filtroAplicado: boolean;
  filtros: Record<string, string>;
  parametrosIgnorados: string[];
}

export interface ResultadoBarrido extends ResultadoSimulacion {
  empresas: EmpresaBarrida[];
}

// Tope de seguridad. Un barrido no debería traer más que esto de una vez: si el
// filtro da más, hay que afinarlo, no subir el tope.
export const TOPE_BARRIDO = 500;

function qs(f: FiltrosBarrido, dryRun: boolean): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  if (dryRun) p.set('dryRun', '1');
  return p.toString();
}

async function pedir(f: FiltrosBarrido, dryRun: boolean): Promise<Record<string, unknown>> {
  if (!PROXY) throw new Error('Proxy no configurado (EMPRESADOCS_PROXY_URL).');
  const resp = await fetch(`${PROXY}/admin/company-sweep?${qs(f, dryRun)}`);
  const texto = await resp.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(texto) as Record<string, unknown>; }
  catch { throw new Error(texto.slice(0, 200) || `HTTP ${resp.status}`); }
  if (!resp.ok) throw new Error(String(data.error ?? `HTTP ${resp.status}`));
  return data;
}

// Paso 1: cuántas empresas caen y si el filtro sirvió. NO trae empresas.
export async function simularBarrido(f: FiltrosBarrido): Promise<ResultadoSimulacion> {
  const d = await pedir({ ...f, size: 1, page: 0 }, true);
  return {
    total: Number(d.total ?? 0),
    totalSinFiltro: Number(d.totalSinFiltro ?? 0),
    filtroAplicado: d.filtroAplicado === true,
    filtros: (d.filtros ?? {}) as Record<string, string>,
    parametrosIgnorados: (d.parametrosIgnorados ?? []) as string[],
  };
}

// Paso 2: trae las empresas. Se NIEGA si el filtro no filtró o si supera el tope.
// Es deliberado que sea un error y no un warning: encolar 72 mil empresas por un
// typo no es algo de lo que se pueda volver con un botón.
export async function barrer(f: FiltrosBarrido, tope = TOPE_BARRIDO): Promise<ResultadoBarrido> {
  const sim = await simularBarrido(f);

  if (!sim.filtroAplicado) {
    throw new Error(
      `Los filtros no redujeron nada: ${sim.total} de ${sim.totalSinFiltro} empresas. ` +
      `Admin ignora los parámetros que no conoce, así que probablemente haya un nombre mal escrito` +
      (sim.parametrosIgnorados.length ? ` (rechazados: ${sim.parametrosIgnorados.join(', ')})` : '') +
      '. No se trae nada.',
    );
  }
  if (sim.total > tope) {
    throw new Error(
      `El filtro da ${sim.total} empresas y el tope es ${tope}. Afiná el filtro en vez de subir el tope.`,
    );
  }

  const size = Math.min(sim.total || 1, tope);
  const d = await pedir({ ...f, size, page: 0 }, false);
  return {
    ...sim,
    empresas: (d.empresas ?? []) as EmpresaBarrida[],
  };
}

// Cambio de ciclo: si una empresa ya CERRADA cambió su kycStage1 en Admin, NO se
// reabre sola. Se marca para que reabrir sea decisión de alguien.
export function detectarReingresos(
  enCola: { companyId: string; statusKyb: string; kycStage1?: string }[],
  barridas: EmpresaBarrida[],
): { companyId: string; motivo: string }[] {
  const porId = new Map(barridas.map(b => [b.companyId, b]));
  const out: { companyId: string; motivo: string }[] = [];
  for (const e of enCola) {
    if (e.statusKyb !== 'CERRADO') continue;
    const b = porId.get(e.companyId);
    if (!b?.kycStage1 || !e.kycStage1) continue;
    if (b.kycStage1 !== e.kycStage1) {
      out.push({ companyId: e.companyId, motivo: `kycStage1 pasó de ${e.kycStage1} a ${b.kycStage1}` });
    }
  }
  return out;
}


// ── PRESET: la cola "en vivo" ────────────────────────────────────────────────
//
// Lo que se pidió: kycStage1 = UPLOADED_MANUAL · país Chile · todos los
// complianceStatus MENOS BLOCKED y FULLY_BLOCKED · creadas en los últimos N días.
//
// Dos cosas NO se pueden hacer del lado de Admin, verificadas contra la API:
//
//   1. complianceStatus no acepta múltiples valores ni negación. Probados:
//      "NORMAL,UNDER_COMPLIANCE_REVIEW" (error), el parámetro repetido (toma uno
//      solo) y complianceStatusNot (ignorado). Por eso la exclusión es del lado
//      del cliente. Se excluye en vez de listar los permitidos a propósito: hay
//      35 empresas cuyo estado no es ninguno de los 5 conocidos, y con "todos
//      menos dos" entran, mientras que con una lista blanca se perderían.
//
//   2. No hay filtro de fecha. Probados 8 nombres (createdFrom, createdAt,
//      dateFrom, startDate, from, createdAfter…): todos ignorados. Pero el ORDEN
//      NATURAL del listado ya viene de más nueva a más vieja (verificado: page 0
//      = hoy, page 50 = abril, page 200 = noviembre 2024), así que se pagina
//      desde el principio y se corta al pasarse de la fecha.
//
// El corte por fecha es lo que hace la cola manejable: el filtro base da 1.182
// empresas, y 30 días son unas 200.

export const ESTADOS_EXCLUIDOS = ['BLOCKED', 'FULLY_BLOCKED'] as const;

export interface PresetEnVivo {
  kycStage1: string;
  country: string;
  diasAtras: number;
  estadosExcluidos: string[];
}

export const PRESET_EN_VIVO: PresetEnVivo = {
  kycStage1: 'UPLOADED_MANUAL',
  country: 'CL',
  diasAtras: 30,
  estadosExcluidos: [...ESTADOS_EXCLUIDOS],
};

export interface ResultadoEnVivo {
  empresas: EmpresaBarrida[];
  totalBase: number;          // lo que da el filtro antes de cortar por fecha
  paginasLeidas: number;
  excluidasPorEstado: number;
  excluidasPorFecha: number;
  cortadoPorTope: boolean;
  desde: string;              // fecha de corte usada (ISO)
}

const TAMANO_PAGINA = 100;
// Tope de páginas: 30 días son ~2-3 páginas de 100. Si se piden muchos días más,
// esto evita recorrer las 72 mil empresas sin querer.
const MAX_PAGINAS = 25;

export async function barrerEnVivo(
  preset: PresetEnVivo = PRESET_EN_VIVO,
  tope = TOPE_BARRIDO,
): Promise<ResultadoEnVivo> {
  const base: FiltrosBarrido = { kycStage1: preset.kycStage1, country: preset.country };

  // Se mantiene la guarda: si el filtro base no redujo el universo, no se sigue.
  const sim = await simularBarrido(base);
  if (!sim.filtroAplicado) {
    throw new Error(
      `El filtro base no redujo nada: ${sim.total} de ${sim.totalSinFiltro}. ` +
      'Admin ignora los parámetros que no conoce, así que revisá los nombres. No se trae nada.',
    );
  }

  const corte = new Date(Date.now() - preset.diasAtras * 24 * 60 * 60 * 1000);
  const excluidos = new Set(preset.estadosExcluidos.map(e => e.toUpperCase()));

  const empresas: EmpresaBarrida[] = [];
  const vistos = new Set<string>();
  let paginasLeidas = 0, excluidasPorEstado = 0, excluidasPorFecha = 0;
  let cortadoPorTope = false;
  let seguir = true;

  for (let page = 0; page < MAX_PAGINAS && seguir; page++) {
    const d = await pedir({ ...base, page, size: TAMANO_PAGINA }, false);
    const lote = (d.empresas ?? []) as EmpresaBarrida[];
    paginasLeidas++;
    if (lote.length === 0) break;

    for (const e of lote) {
      const fecha = e.creadoEn ? new Date(e.creadoEn) : null;
      // El listado viene de más nueva a más vieja: en cuanto aparece una anterior
      // al corte, ya no hace falta seguir pidiendo páginas.
      if (fecha && !Number.isNaN(fecha.getTime()) && fecha < corte) {
        excluidasPorFecha++;
        seguir = false;
        continue;
      }
      if (excluidos.has((e.complianceStatus ?? '').toUpperCase())) { excluidasPorEstado++; continue; }
      if (vistos.has(e.companyId)) continue;
      vistos.add(e.companyId);
      empresas.push(e);
      if (empresas.length >= tope) { cortadoPorTope = true; seguir = false; break; }
    }
    if (lote.length < TAMANO_PAGINA) break;   // última página
  }

  return {
    empresas, totalBase: sim.total, paginasLeidas,
    excluidasPorEstado, excluidasPorFecha, cortadoPorTope,
    desde: corte.toISOString().slice(0, 10),
  };
}
