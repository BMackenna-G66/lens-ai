// Los «Bloqueado» de la cola OFAC entran a la lista negra de DNI de Admin G66.
// Decisión de Benjamín (23-10-2026): TODO cierre «Bloqueado» (`fully_blocked`)
// de la cola OFAC, lo cierre un analista o el flujo automático, y también los
// del pasado.
//
// Puro, sin red: lo importan el Worker (el paso 6 de /admin/customer-status y
// la carga de históricos), la SPA (la vista previa de los históricos) y el
// Lambda del flujo automático (para armar el pedido). Una sola regla en tres
// lugares.

/** La razón con la que entran. Exacta: la fijó Benjamín. */
export const MOTIVO_BLOQUEADO = 'Matriz de delitos y matriz de riesgo flujo cola de trabajo';

/** La etiqueta del flujo, para el registro `listas_negras`. */
export const FLUJOS_BLOQUEADO = {
  manual: 'colas_trabajo.ofac.bloqueado.manual',
  automatico: 'colas_trabajo.ofac.bloqueado.automatico',
  historico: 'colas_trabajo.ofac.bloqueado.historico',
} as const;
export type OrigenBloqueado = keyof typeof FLUJOS_BLOQUEADO;

/** La tipología de cierre que dispara la lista negra. */
export const TIPOLOGIA_BLOQUEADO = 'fully_blocked';

/** ¿Este cierre agrega a la lista negra? Cola OFAC y tipología «Bloqueado». */
export const esBloqueadoOfac = (cola: string | undefined, tipologia: string | null | undefined): boolean =>
  cola === 'ofac' && tipologia === TIPOLOGIA_BLOQUEADO;

/** El resultado para `colas_trabajo.lista_negra_dni`. */
export type ResultadoColas = 'AGREGADO' | 'ACTIVADO' | 'YA_ACTIVO' | 'ERROR';

// ── El DNI ──────────────────────────────────────────────────────────────────

/**
 * La clave para comparar: solo letras y dígitos, en mayúsculas. «12.345.678-9»,
 * «12345678-9» y «123456789» son el mismo DNI: sin esto, una carga los crearía
 * como registros distintos.
 */
export const claveDni = (v: unknown): string => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

export type FormaDni = 'puntos_guion' | 'guion' | 'puntos' | 'compacto';

/** Cómo está escrito un DNI. `null` si no es ninguna forma conocida. */
export function formaDe(dni: unknown): FormaDni | null {
  const s = String(dni ?? '').trim();
  if (/^\d{1,3}(\.\d{3})+-[\dkK]$/.test(s)) return 'puntos_guion';
  if (/^\d+-[\dkK]$/.test(s)) return 'guion';
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return 'puntos';
  if (/^[0-9A-Za-z]+$/.test(s)) return 'compacto';
  return null;
}

/**
 * La forma en que Admin ya guarda los DNI de ese país: la más frecuente entre
 * los registros existentes. Se MIDE sobre la lista real en cada corrida, no se
 * supone. `null` si el país no tiene registros o ninguna forma predomina.
 */
export function formaDominante(existentes: Record<string, unknown>[], cc: string): FormaDni | null {
  const cuenta = new Map<FormaDni, number>();
  for (const r of existentes) {
    if (String(r?.countryCode ?? '').trim().toUpperCase() !== cc) continue;
    const f = formaDe(r.dni);
    if (f) cuenta.set(f, (cuenta.get(f) ?? 0) + 1);
  }
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  if (!orden.length || (orden[1] && orden[1][1] === orden[0][1])) return null;
  return orden[0][0];
}

const miles = (digitos: string) => digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** El DNI escrito en esa forma. Lo que no se puede escribir así, va como vino. */
export function formatearDni(dniCrudo: unknown, forma: FormaDni | null): string {
  const crudo = String(dniCrudo ?? '').trim();
  const k = claveDni(crudo);
  if (!forma || !k) return crudo;
  if (forma === 'compacto') return k;
  if (forma === 'puntos') return /^\d+$/.test(k) ? miles(k) : crudo;
  // Con guion: el último carácter es el dígito verificador.
  const cuerpo = k.slice(0, -1);
  const dv = k.slice(-1);
  if (!/^\d+$/.test(cuerpo) || !/^[\dK]$/.test(dv)) return crudo;
  return forma === 'guion' ? `${cuerpo}-${dv}` : `${miles(cuerpo)}-${dv}`;
}

// ── La decisión ─────────────────────────────────────────────────────────────

export type RegistroDni = Record<string, unknown>;

export type DecisionDni =
  | { accion: 'agregar'; dniAdmin: string; forma: FormaDni | null }
  | { accion: 'reactivar'; registro: RegistroDni }
  | { accion: 'ya_activo'; registro: RegistroDni }
  | { accion: 'error'; motivo: string };

/**
 * Qué hacer con un DNI, contra la lista vigente de Admin:
 *   · ya está activo → nada (YA_ACTIVO);
 *   · está inactivo → se REACTIVA con un PUT (el PUT de DNI no cambia la razón);
 *   · no está → se agrega, escrito como Admin escribe los de ese país.
 * Sin DNI o sin país no se agrega: es un ERROR con su motivo.
 */
export function decidirDni(dniCrudo: unknown, countryCode: unknown, existentes: RegistroDni[]): DecisionDni {
  const cc = String(countryCode ?? '').trim().toUpperCase();
  const k = claveDni(dniCrudo);
  if (!k) return { accion: 'error', motivo: 'El caso no tiene DNI.' };
  if (!/^[A-Z]{2}$/.test(cc)) return { accion: 'error', motivo: 'El caso no tiene un país reconocido (solo Chile y Colombia).' };
  const mismos = existentes.filter(r => claveDni(r?.dni) === k && String(r?.countryCode ?? '').trim().toUpperCase() === cc);
  const activo = mismos.find(r => Boolean(r.blacklistStatus));
  if (activo) return { accion: 'ya_activo', registro: activo };
  if (mismos.length) return { accion: 'reactivar', registro: mismos[0] };
  const forma = formaDominante(existentes, cc);
  return { accion: 'agregar', dniAdmin: formatearDni(dniCrudo, forma), forma };
}

/** Del resultado del registro `listas_negras` al de `colas_trabajo`. */
export function resultadoColas(resultadoListas: string): ResultadoColas {
  if (resultadoListas === 'CREADO') return 'AGREGADO';
  if (resultadoListas === 'ACTIVADO') return 'ACTIVADO';
  if (resultadoListas === 'OMITIDO_YA_EXISTE_ACTIVO') return 'YA_ACTIVO';
  return 'ERROR';
}

// ── El pedido y los históricos ──────────────────────────────────────────────

/** Lo que el que cierra le manda al Worker en `listaNegraDni`. */
export interface EntradaListaNegraDni {
  customerId: string;
  dni: string;
  countryCode: string;
  numeroCaso: string;
  casoId: string;
  idInternoUsuario: string;
  tipologia: string;
}

/** Lo mínimo de un caso que hace falta. Lo cumplen `CasoSF` y el documento del Lambda. */
export interface CasoParaListaNegra {
  id: string;
  numeroCaso?: string;
  asunto?: string;
  pais?: string;
  datos?: Record<string, unknown>;
  cierres?: { admin?: { ok?: boolean; tipologia?: string | null; en?: string | null } };
}

/** La entrada de un caso. Sin DNI o sin país la arma igual: el Worker lo registra como ERROR. */
export function entradaDeCaso(caso: CasoParaListaNegra, tipologia: string,
                              paisCodigo: (p: string) => string): EntradaListaNegraDni {
  const idInterno = String(caso.datos?.['Id interno del usuario'] ?? '').trim();
  return {
    customerId: idInterno,
    dni: String(caso.datos?.['Número de DNI'] ?? '').trim(),
    countryCode: paisCodigo(caso.pais ?? ''),
    numeroCaso: String(caso.numeroCaso || caso.id),
    casoId: caso.id,
    idInternoUsuario: idInterno,
    tipologia,
  };
}

/**
 * Los «Bloqueado» de la cola OFAC del pasado: cierre en Admin ok y tipología
 * `fully_blocked`, uno por cliente (el cierre más reciente). Un cliente sin id
 * interno se identifica por su DNI y país.
 */
export function filasHistoricas(casos: CasoParaListaNegra[], clasificarCola: (asunto: string | undefined) => string,
                                paisCodigo: (p: string) => string): EntradaListaNegraDni[] {
  const porCliente = new Map<string, { e: EntradaListaNegraDni; en: string }>();
  for (const c of casos) {
    const admin = c.cierres?.admin;
    if (admin?.ok !== true || !esBloqueadoOfac(clasificarCola(c.asunto), admin.tipologia)) continue;
    const e = entradaDeCaso(c, TIPOLOGIA_BLOQUEADO, paisCodigo);
    const cliente = e.idInternoUsuario ? `id|${e.idInternoUsuario}`
      : claveDni(e.dni) ? `dni|${claveDni(e.dni)}|${e.countryCode}` : `caso|${c.id}`;
    const en = String(admin.en ?? '');
    const previo = porCliente.get(cliente);
    if (!previo || en > previo.en) porCliente.set(cliente, { e, en });
  }
  return [...porCliente.values()].map(x => x.e).sort((a, b) => a.numeroCaso.localeCompare(b.numeroCaso));
}

export interface ConteosHistoricos { total: number; agregar: number; reactivar: number; ya_activo: number; error: number }

export function contarDecisiones(decisiones: DecisionDni[]): ConteosHistoricos {
  const c: ConteosHistoricos = { total: decisiones.length, agregar: 0, reactivar: 0, ya_activo: 0, error: 0 };
  for (const d of decisiones) c[d.accion]++;
  return c;
}

// ── Lo que vuelve del Worker, para la auditoría del caso y la pantalla ──────

/** `steps.listaNegraDni` de la respuesta de /admin/customer-status. */
export interface ResultadoPaso6 {
  resultado?: ResultadoColas;
  cambioId?: string;
  flujo?: string;
  countryCode?: string;
  tipologia?: string;
  actor?: { email?: string; nombre?: string; uid?: string };
  automatico?: boolean;
  ocurridoEn?: string;
  registro?: string;
  colas?: boolean;
  detalle?: string;
  omitido?: string;
  en_curso?: boolean;
}

/**
 * La metadata del evento LISTA_NEGRA_DNI del caso, o `null` si el paso 6 no
 * llegó a un resultado (no corrió, o siguió después de responder). SIN el
 * DNI: la auditoría del caso no guarda DNI, y el respaldo diario lo saca del
 * caso. Con todo lo demás de la fila de `colas_trabajo.lista_negra_dni`.
 */
export function metadataAuditoria(r: ResultadoPaso6 | undefined, e: EntradaListaNegraDni): Record<string, unknown> | null {
  if (!r?.resultado || !r.cambioId) return null;
  return {
    cambioId: r.cambioId, casoId: e.casoId, idInternoUsuario: e.idInternoUsuario || null,
    countryCode: r.countryCode || e.countryCode || null, tipologia: r.tipologia || e.tipologia,
    resultado: r.resultado, detalle: r.detalle ?? null, flujo: r.flujo ?? null, automatico: r.automatico === true,
    actorEmail: r.actor?.email ?? null, actorNombre: r.actor?.nombre ?? null, actorUid: r.actor?.uid ?? null,
    ocurridoEn: r.ocurridoEn ?? null, registro: r.registro ?? null,
  };
}

/** El paso 6 dicho en una línea, para la pantalla. */
export function resumenPaso6(r: ResultadoPaso6 | undefined): string | null {
  if (!r) return null;
  if (r.omitido) return r.omitido === 'sin_actor_verificado'
    ? 'Lista negra de DNI: no se agregó (sin sesión verificada); se recupera con la carga de históricos.'
    : null;
  if (r.en_curso) return 'Lista negra de DNI: en curso; el resultado queda en el registro.';
  const txt: Record<ResultadoColas, string> = {
    AGREGADO: 'agregado', ACTIVADO: 'reactivado', YA_ACTIVO: 'ya estaba activo', ERROR: 'error',
  };
  return `Lista negra de DNI: ${r.resultado ? txt[r.resultado] : '?'}${r.detalle ? ` (${r.detalle})` : ''}`;
}
