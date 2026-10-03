// REVISIÓN WEB — puntaje (§7), severidad (§8), decisión (§9) y la salida (§12).
// Todo en código y puro. El puntaje mide EVIDENCIA OBTENIDA: lo que no se
// verificó vale 0 y se nombra como «no verificable»; no se estima. Lo que no
// aplica sale del cálculo (ver `acreditacionDe`).
//
// Las reglas de cada dimensión están escritas abajo, con sus puntos. El
// procedimiento fija los máximos pero no el reparto interno: el reparto lo
// confirmó Benjamín el 03-10-2026.

import { analizarTelefono, declaraLicencia, mismoNombre, soloCredencialesAutodeclaradas } from './reglas';
import { nombreCalzaConDominio, type EvaluacionA, type EvaluacionB } from './evaluacion';
import { UMBRAL } from './paso0';
import type { Decision, Dimension, Extraccion, Gatillo, Hallazgo, Resultado, RiesgoInherente, Severidad } from './tipos';

const ORDEN_SEVERIDAD: Severidad[] = ['CRITICO', 'MAYOR', 'MENOR', 'INFO'];

export function ordenarHallazgos(h: Hallazgo[]): Hallazgo[] {
  return [...h].sort((a, b) => ORDEN_SEVERIDAD.indexOf(a.severidad) - ORDEN_SEVERIDAD.indexOf(b.severidad));
}

/** «No aplica» y «no verificable» valen 0 los dos, pero NO son lo mismo:
 *  la que no aplica sale del denominador (ver `acreditacionDe`), la que no se
 *  verificó se queda adentro con 0 y se nombra. */
const dim = (clave: Dimension['clave'], nombre: string, max: number, puntos: number, estado: Dimension['estado'], justificacion: string): Dimension =>
  ({ clave, nombre, max, puntos: estado === 'verificado' ? Math.max(0, Math.min(max, puntos)) : 0, estado, justificacion });

/** Una parte de una dimensión, que puede no aplicar. */
interface Parte { puntos: number; max: number; aplica: boolean; texto: string }

/** Los puntos de una dimensión a partir de sus partes, con la MISMA regla que
 *  la acreditación: lo que no aplica sale del denominador y el resto se escala
 *  al máximo de la dimensión. Regalar la parte que no aplica le daba puntos a
 *  un sitio sin evidencia. */
function escalarPartes(partes: Parte[], max: number): { puntos: number; justificacion: string } {
  const aplican = partes.filter(p => p.aplica);
  const tope = aplican.reduce((s, p) => s + p.max, 0);
  const obtenido = aplican.reduce((s, p) => s + p.puntos, 0);
  const puntos = tope ? Math.round(max * obtenido / tope) : 0;
  const texto = partes.map(p => p.aplica ? `${p.texto} (${p.puntos}/${p.max})` : `${p.texto} (no aplica)`).join('; ');
  return { puntos, justificacion: `${texto}${tope && tope !== max ? ` → ${obtenido} de ${tope} aplicables, escalado a ${puntos}/${max}` : ''}.` };
}

export function calcularDimensiones(a: EvaluacionA, b: EvaluacionB | null, e: Extraccion | null): Dimension[] {
  const sinSitio = !a.legible || !e;
  const d: Dimension[] = [];

  // ── Identidad (25): publicado 5 · DV válido 5 · confirmado fuera del sitio 15
  if (sinSitio) d.push(dim('identidad', 'Identidad', 25, 0, 'no_verificable', 'El sitio no se pudo leer.'));
  else {
    let p = 0;
    const j: string[] = [];
    const id = a.identificador;
    if (id && id.valido !== false) { p += 5; j.push(`${id.tipo} publicado (+5)`); }
    else j.push('sin identificador publicado (0)');
    if (id?.valido === true) { p += 5; j.push('dígito verificador válido (+5)'); }
    else if (id?.valido === null) j.push('sin dígito verificador, no validable (0)');
    if (!b) j.push('confirmación externa no verificable (0)');
    else if (b.identidadConfirmada) { p += 15; j.push('identificador confirmado fuera del sitio (+15)'); }
    else if (b.nombreConfirmado) { p += 5; j.push('razón social con rastro externo, identificador no confirmado (+5)'); }
    else j.push('sin confirmación externa (0)');
    d.push(dim('identidad', 'Identidad', 25, p, 'verificado', j.join('; ') + '.'));
  }

  // ── Coherencia interna (20): cinco cruces de 4 puntos. El que no se puede
  // hacer por falta de dato vale 0 y se nombra.
  if (sinSitio) d.push(dim('coherencia', 'Coherencia interna', 20, 0, 'no_verificable', 'El sitio no se pudo leer.'));
  else {
    const j: string[] = [];
    let p = 0;
    let evaluables = 0;
    const cruce = (nombre: string, ok: boolean | null) => {
      if (ok === null) { j.push(`${nombre}: sin dato (0)`); return; }
      evaluables++;
      if (ok) { p += 4; j.push(`${nombre} (+4)`); } else j.push(`${nombre}: no coincide (0)`);
    };
    cruce('razón social / dominio', e!.razonSocial || e!.nombreComercial ? nombreCalzaConDominio(e!, a.dominio.registrable) : null);
    const propios = a.correos.filter(c => (c.split('@')[1] || '').endsWith(a.dominio.registrable));
    cruce('correo / dominio', a.correos.length ? propios.length > 0 : null);
    const tels = a.telefonos.map(analizarTelefono).filter(t => !t.placeholder);
    cruce('teléfono / jurisdicción', !tels.length ? null : a.jurisdiccion === 'CL' || a.jurisdiccion === 'CO' ? tels.some(t => t.pais === a.jurisdiccion) : tels.some(t => t.enPlan));
    cruce('identificador / jurisdicción', !a.identificador || a.identificador.tipo === 'desconocido' || !a.jurisdiccion || a.jurisdiccion === 'OTRA' ? null
      : (a.identificador.tipo === 'RUT') === (a.jurisdiccion === 'CL'));
    const legalDistinta = a.hallazgos.some(h => h.codigo === 'JURISDICCION_LEGAL_DISTINTA');
    cruce('textos legales / jurisdicción', e!.jurisdiccionTextosLegales ? !legalDistinta : null);
    d.push(dim('coherencia', 'Coherencia interna', 20, p, evaluables ? 'verificado' : 'no_verificable', j.join('; ') + '.'));
  }

  // ── Situación regulatoria (15)
  if (sinSitio) d.push(dim('regulatoria', 'Situación regulatoria', 15, 0, 'no_verificable', 'El sitio no se pudo leer.'));
  else if (!a.regulado) d.push(dim('regulatoria', 'Situación regulatoria', 15, 0, 'no_aplica', 'No ofrece servicios que requieran licencia: la búsqueda de alertas no corresponde (§5, prioridad 2). Sale del cálculo.'));
  else {
    const j: string[] = [];
    let p = 0;
    const lic = declaraLicencia(e!.credencialesRegulatorias) && !soloCredencialesAutodeclaradas(e!.credencialesRegulatorias);
    if (lic) { p += 5; j.push('declara licencia o supervisión (+5)'); } else j.push('no declara licencia (0)');
    if (!b?.busquedaAlertasEjecutada) j.push('búsqueda de alertas no ejecutada: no verificable (0)');
    else { p += 5; j.push('sin alertas de regulador en la búsqueda (+5)'); }
    if (b?.autorizacionConfirmada) { p += 5; j.push('autorización confirmada en el sitio del regulador (+5)'); }
    else j.push('autorización no confirmada externamente (0)');
    d.push(dim('regulatoria', 'Situación regulatoria', 15, p, b?.busquedaAlertasEjecutada ? 'verificado' : 'no_verificable', j.join('; ') + '.'));
  }

  // ── Ausencia de señales de plantilla (15): −5 por señal, hasta 0
  if (sinSitio || a.cascaronJs) d.push(dim('plantilla', 'Ausencia de señales de plantilla', 15, 0, 'no_verificable', a.cascaronJs ? 'El sitio se arma con JavaScript: el texto no se pudo evaluar.' : 'El sitio no se pudo leer.'));
  else {
    const senales = [...a.plantilla];
    if (b?.hallazgos.some(h => h.codigo === 'CONTACTO_REUTILIZADO')) senales.push('dato de contacto reutilizado en sitios ajenos');
    d.push(dim('plantilla', 'Ausencia de señales de plantilla', 15, 15 - 5 * senales.length, 'verificado',
      senales.length ? `${senales.length} señal(es): ${senales.join('; ')} (−5 cada una).` : 'Sin señales de plantilla (15).'));
  }

  // ── Medios de pago legítimos y a nombre de la empresa (15):
  //    pasarela integrada 7 (si vende en línea) · sin medios ilegítimos 4 ·
  //    titular = razón social 4 (si publica titular). La parte que no aplica
  //    sale del denominador y el resto se escala a 15.
  if (sinSitio) d.push(dim('pagos', 'Medios de pago', 15, 0, 'no_verificable', 'El sitio no se pudo leer.'));
  else if (!e!.declaraVentaEnLinea && !e!.titularCuentaPago && !(e!.mediosPagoSolicitados || []).length) {
    d.push(dim('pagos', 'Medios de pago', 15, 0, 'no_aplica', 'No cobra en el sitio ni publica instrucciones de pago. Sale del cálculo.'));
  } else {
    const ventaEnLinea = e!.declaraVentaEnLinea;
    const titular = e!.titularCuentaPago;
    const conPasarela = ventaEnLinea && !a.cascaronJs && a.pasarelas.length > 0;
    const legitimos = !a.gatillos.some(g => g.numero === 4);
    const titularOk = !!titular && !!e!.razonSocial && mismoNombre(titular, e!.razonSocial);
    const r = escalarPartes([
      { aplica: ventaEnLinea, max: 7, puntos: conPasarela ? 7 : 0,
        texto: !ventaEnLinea ? 'pasarela' : a.cascaronJs ? 'pasarela no evaluable sin navegador' : conPasarela ? `pasarela integrada: ${a.pasarelas.join(', ')}` : 'vende en línea sin pasarela' },
      { aplica: true, max: 4, puntos: legitimos ? 4 : 0, texto: legitimos ? 'sin medios de pago ilegítimos' : 'medio de pago ilegítimo' },
      { aplica: !!titular, max: 4, puntos: titularOk ? 4 : 0, texto: !titular ? 'titular de cuenta' : titularOk ? 'titular = razón social' : 'titular distinto de la razón social' },
    ], 15);
    d.push(dim('pagos', 'Medios de pago', 15, r.puntos, 'verificado', r.justificacion));
  }

  // ── Rastro externo independiente (10): dominios ajenos con fuente real
  if (!b) d.push(dim('rastro', 'Rastro externo independiente', 10, 0, 'no_verificable', 'La Ronda B no se ejecutó.'));
  else {
    const n = b.independientes.length;
    const p = n >= 3 ? 10 : n === 2 ? 7 : n === 1 ? 4 : 0;
    d.push(dim('rastro', 'Rastro externo independiente', 10, p, 'verificado',
      n ? `${n} fuente(s) independiente(s): ${b.independientes.slice(0, 4).join(', ')} (${p}).` : 'Sin fuentes independientes con fuente verificable (0).'));
  }
  return d;
}

/** La acreditación, 0–100 (§7). Mide EVIDENCIA OBTENIDA:
 *
 *  · una dimensión que NO APLICA sale del denominador, y lo obtenido se escala
 *    a 100 sobre el máximo de las que sí aplican. Regalarle el máximo hacía que
 *    un sitio folleto sumara 30 puntos sin acreditar nada (decisión de
 *    Benjamín, 03-10-2026). 50 de 70 aplicables = 71 / 100.
 *  · una dimensión NO VERIFICABLE se queda en el denominador con 0, y se nombra.
 */
export function acreditacionDe(d: Dimension[]): number {
  const aplican = d.filter(x => x.estado !== 'no_aplica');
  const tope = aplican.reduce((s, x) => s + x.max, 0);
  const obtenido = aplican.reduce((s, x) => s + x.puntos, 0);
  return tope ? Math.round(100 * obtenido / tope) : 0;
}

// ── Decisión (§9) ──────────────────────────────────────────────────────────

const RANGO: Record<Decision, number> = {
  ONBOARDING_REJECTED: 0, ONBOARDING_ON_HOLD: 1, ONBOARDING_CONDITIONAL: 2, ONBOARDING_APPROVED: 3,
};

export interface Veredicto { decision: Decision; motivo: 'gatillo' | 'critico' | 'riesgo_critico_sin_acreditacion' | 'deficit' | 'mayores' | 'visto_bueno_oc' | 'un_mayor' | 'alcanza' }

export function decidir(riesgo: RiesgoInherente, acreditacion: number, gatillos: Gatillo[], hallazgos: Hallazgo[]): Veredicto {
  if (gatillos.length) return { decision: 'ONBOARDING_REJECTED', motivo: 'gatillo' };
  if (hallazgos.some(h => h.severidad === 'CRITICO')) return { decision: 'ONBOARDING_REJECTED', motivo: 'critico' };
  const mayores = hallazgos.filter(h => h.severidad === 'MAYOR').length;
  const umbral = UMBRAL[riesgo];

  let v: Veredicto;
  if (acreditacion >= umbral) {
    if (riesgo === 'CRITICO') v = { decision: 'ONBOARDING_ON_HOLD', motivo: 'visto_bueno_oc' };
    else if (mayores === 0) v = { decision: 'ONBOARDING_APPROVED', motivo: 'alcanza' };
    else v = { decision: 'ONBOARDING_CONDITIONAL', motivo: 'un_mayor' };
  } else if (riesgo === 'CRITICO') v = { decision: 'ONBOARDING_REJECTED', motivo: 'riesgo_critico_sin_acreditacion' };
  else if (riesgo === 'ALTO') v = { decision: 'ONBOARDING_ON_HOLD', motivo: 'deficit' };
  else v = { decision: 'ONBOARDING_CONDITIONAL', motivo: 'deficit' };

  // §8: dos o más MAYOR topean en ON_HOLD, aunque el puntaje alcance.
  if (mayores >= 2 && RANGO[v.decision] > RANGO.ONBOARDING_ON_HOLD) v = { decision: 'ONBOARDING_ON_HOLD', motivo: 'mayores' };
  return v;
}

// ── Salida (§12) ───────────────────────────────────────────────────────────

/** El encabezado KPI: acreditación como `N / 100` y gatillos como `N de 6`,
 *  nunca un adjetivo. */
export function kpi(r: Pick<Resultado, 'decision' | 'acreditacion' | 'umbral' | 'riesgo' | 'gatillos' | 'hallazgos'>) {
  return {
    decision: r.decision,
    acreditacion: `${r.acreditacion} / 100`,
    umbral: String(r.umbral),
    riesgo: r.riesgo,
    gatillos: `${r.gatillos.length} de 6`,
    severos: `${r.hallazgos.filter(h => h.severidad === 'MAYOR').length} / ${r.hallazgos.filter(h => h.severidad === 'CRITICO').length}`,
  };
}

const HABILITA: Record<Decision, string> = {
  ONBOARDING_APPROVED: 'Habilita todas las actividades.',
  ONBOARDING_CONDITIONAL: 'Habilita conversaciones comerciales, alcance y pruebas en ambiente aislado; bloquea datos de clientes, producción y fondos.',
  ONBOARDING_ON_HOLD: 'Habilita conversaciones comerciales y solicitud de documentación; bloquea firma, integración técnica, flujo de fondos y entrega de datos.',
  ONBOARDING_REJECTED: 'No habilita ninguna actividad.',
};

const VIGENCIA: Record<RiesgoInherente, string> = { CRITICO: '6 meses', ALTO: '12 meses', MEDIO: '24 meses', BAJO: 'al cambiar el alcance' };

/** La línea bajo el encabezado: naturaleza del déficit, puntos faltantes y qué
 *  habilita o bloquea. Impersonal y con cifras (§12, registro de redacción). */
export function lecturaDe(v: Veredicto, riesgo: RiesgoInherente, acreditacion: number, gatillos: Gatillo[], hallazgos: Hallazgo[], dimensiones: Dimension[]): string {
  const umbral = UMBRAL[riesgo];
  const faltan = Math.max(0, umbral - acreditacion);
  const noVer = dimensiones.filter(d => d.estado === 'no_verificable').map(d => d.nombre.toLowerCase());
  const conNoVer = noVer.length ? ` (no verificable: ${noVer.join(', ')})` : '';
  const mayores = hallazgos.filter(h => h.severidad === 'MAYOR').length;
  switch (v.motivo) {
    case 'gatillo': return `Gatillo ${gatillos[0].numero}: ${gatillos[0].nombre.toLowerCase()} — ${gatillos[0].detalle}. ${HABILITA[v.decision]}`;
    case 'critico': return `Evidencia adversa: ${hallazgos.find(h => h.severidad === 'CRITICO')!.texto} ${HABILITA[v.decision]}`;
    case 'riesgo_critico_sin_acreditacion': return `Riesgo inherente CRITICO sin acreditación: faltan ${faltan} puntos para el umbral ${umbral}${conNoVer}. ${HABILITA[v.decision]}`;
    case 'visto_bueno_oc': return `Alcanza el umbral ${umbral} con riesgo inherente CRITICO: requiere visto bueno del Oficial de Cumplimiento. ${HABILITA[v.decision]}`;
    case 'mayores': return `Tope por severidad: ${mayores} hallazgos MAYOR${faltan ? `; además faltan ${faltan} puntos para el umbral ${umbral}` : ''}. ${HABILITA[v.decision]}`;
    case 'deficit': return `Déficit de evidencia: faltan ${faltan} puntos para el umbral ${umbral}${conNoVer}. ${HABILITA[v.decision]}`;
    case 'un_mayor': return `Alcanza el umbral ${umbral} con 1 hallazgo MAYOR. ${HABILITA[v.decision]}`;
    default: return `Alcanza el umbral ${umbral} sin hallazgos MAYOR ni CRITICO. ${HABILITA[v.decision]}`;
  }
}

export function siguientePasoDe(v: Veredicto, riesgo: RiesgoInherente, gatillos: Gatillo[], jurisdiccion: string): string {
  const expediente = riesgo === 'ALTO' || riesgo === 'CRITICO' ? ` Riesgo ${riesgo}: corresponde EXPEDIENTE (§11).` : '';
  const manual = jurisdiccion === 'CO' ? 'RUES y certificado de Cámara de Comercio' : jurisdiccion === 'CL' ? 'SII (situación tributaria) y Registro de Empresas y Sociedades' : 'el registro mercantil del país de constitución';
  if (v.decision === 'ONBOARDING_REJECTED') {
    return gatillos.some(g => g.numero === 3 || g.numero === 5)
      ? 'Escalar por suplantación (§16): no interactuar con formularios, preservar evidencia fechada y reportar.'
      : 'Registrar el rechazo con su fuente y no continuar el onboarding.';
  }
  if (v.decision === 'ONBOARDING_ON_HOLD') return `Solicitar por escrito la entidad que firma con su identificador y el comprobante bancario a nombre de la sociedad; verificar manualmente ${manual}.${expediente}`;
  if (v.decision === 'ONBOARDING_CONDITIONAL') return `Fijar condiciones fechadas y verificar manualmente ${manual}.${expediente}`;
  return `Fechar la revisión y recertificar en ${VIGENCIA[riesgo]} (§14).${expediente}`;
}
