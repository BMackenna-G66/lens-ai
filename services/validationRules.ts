// Motor de reglas de validación COMPARTIDO por las 4 herramientas (Analizador
// individual, Batch, Vista 360° y herramienta Regcheq). Recibe una entrada común
// con los datos que ya extraemos (screening AML, PEP, riesgo Regcheq, SII y
// personas relacionadas) y devuelve una lista de alertas con severidad.
//
// Comportamiento: SOLO visual + reflejo en PDF/Excel. No bloquea ni altera el
// veredicto de ningún módulo.

import { Lens360ListHit, Lens360Tributaria } from '../types/lens360';

export type AlertSeverity = 'critica' | 'alta' | 'media';

export interface ValidationAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface RelatedForRules {
  name?: string;
  hasAml?: boolean;    // coincidencia AML en el relacionado
  hasPenal?: boolean;  // coincidencia penal en el relacionado
}

export interface ValidationInput {
  regcheqRisk?: string;
  pepLevel?: string;
  amlHits?: Lens360ListHit[];
  tributaria?: Lens360Tributaria;
  related?: RelatedForRules[];
  penalCoincidencia?: boolean;   // causas penales Chile (cuando no viene como amlHit)
}

// Etiquetas visibles de listas de sanciones (críticas).
const SANCIONES = new Set(['OFAC', 'ONU', 'Unión Europea', 'INTERPOL', 'OFAC Domicilio']);
// Etiquetas de causas penales.
const PENALES = new Set(['Causas Penales Chile']);
// Etiquetas que son PEP.
const PEP_LISTAS = new Set(['PEP Chile']);

const norm = (s: string) => (s ?? '').trim();

// ¿El pepLevel indica que ES PEP? (descarta vacío / "none" / "no" / "0").
function esPep(pepLevel?: string): boolean {
  const v = norm(pepLevel ?? '').toLowerCase();
  return !!v && !['none', 'no', '0', 'n/a', '—', 'sin pep', 'no pep'].includes(v);
}

// Meses transcurridos desde una fecha (varios formatos: ISO, dd-mm-yyyy, dd/mm/yyyy).
function mesesDesde(fecha: string): number | null {
  const v = norm(fecha);
  if (!v) return null;
  let d: Date | null = null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (dmy) d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  else { const t = Date.parse(v); if (!Number.isNaN(t)) d = new Date(t); }
  if (!d || Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

export const SII_STALE_MESES = 6;

// Evalúa las 9 reglas y devuelve las alertas disparadas, ordenadas por severidad.
export function evaluateValidationRules(input: ValidationInput): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];
  const hits = (input.amlHits ?? []).filter(h => h.coincidence);
  const push = (id: string, severity: AlertSeverity, title: string, detail: string) =>
    alerts.push({ id, severity, title, detail });

  // ── 🔴 Críticas ─────────────────────────────────────────────────────────────
  // 1. Sanciones (OFAC / ONU / UE / INTERPOL)
  const sanc = hits.filter(h => SANCIONES.has(h.nombre));
  if (sanc.length) push('sanciones', 'critica', 'Coincidencia en listas de sanciones',
    sanc.map(h => h.nombre).join(', '));

  // 2. Causas penales Chile
  const penalHit = hits.some(h => PENALES.has(h.nombre)) || !!input.penalCoincidencia;
  if (penalHit) push('penal', 'critica', 'Coincidencia en causas penales (Chile)',
    'Registra causas penales en Chile.');

  // 3. Riesgo efectivo Regcheq = HIGH
  const risk = norm(input.regcheqRisk ?? '').toUpperCase();
  if (risk === 'HIGH' || risk === 'ALTO') push('riesgo-high', 'critica',
    'Riesgo efectivo Regcheq: ALTO', `Riesgo calculado: ${input.regcheqRisk}`);

  // ── 🟠 Altas ─────────────────────────────────────────────────────────────────
  // 4. PEP (titular)
  if (esPep(input.pepLevel) || hits.some(h => PEP_LISTAS.has(h.nombre)))
    push('pep', 'alta', 'Persona Expuesta Políticamente (PEP)',
      input.pepLevel ? `Nivel PEP: ${input.pepLevel}` : 'Coincidencia en lista PEP.');

  // 5. Persona relacionada con coincidencia AML o penal
  const relMarcadas = (input.related ?? []).filter(r => r.hasAml || r.hasPenal);
  if (relMarcadas.length) push('relacionado', 'alta',
    'Persona relacionada con coincidencia AML/penal',
    relMarcadas.map(r => r.name || 'Relacionado').join(', '));

  // 6. SII: situaciones irregulares
  const irregs = input.tributaria?.situacionesIrregulares ?? [];
  if (irregs.length) push('sii-irregular', 'alta', 'Situaciones irregulares en el SII',
    irregs.join('; '));

  // ── 🟡 Medias ────────────────────────────────────────────────────────────────
  // 7. Empresa sin inicio de actividades en el SII
  if (input.tributaria && norm(input.tributaria.presentaInicioActividades).toLowerCase() === 'no')
    push('sii-sin-inicio', 'media', 'Empresa sin inicio de actividades en el SII',
      'No presenta inicio de actividades ante el SII.');

  // 8. Ficha SII desactualizada (> 6 meses)
  const meses = mesesDesde(input.tributaria?.ultimaActualizacion ?? '');
  if (meses !== null && meses > SII_STALE_MESES) push('sii-desactualizada', 'media',
    'Ficha SII desactualizada',
    `Última actualización hace ${meses} meses (umbral: ${SII_STALE_MESES}).`);

  // 9. Screening / listas de interés (no-sanción, no-PEP, no-penal)
  const otras = hits.filter(h => !SANCIONES.has(h.nombre) && !PENALES.has(h.nombre) && !PEP_LISTAS.has(h.nombre));
  if (otras.length) push('screening', 'media', 'Coincidencia en listas de screening/interés',
    otras.map(h => h.nombre).join(', '));

  const orden: Record<AlertSeverity, number> = { critica: 0, alta: 1, media: 2 };
  return alerts.sort((a, b) => orden[a.severity] - orden[b.severity]);
}

// Severidad máxima de un conjunto de alertas (para pintar un semáforo global).
export function maxSeverity(alerts: ValidationAlert[]): AlertSeverity | null {
  if (alerts.some(a => a.severity === 'critica')) return 'critica';
  if (alerts.some(a => a.severity === 'alta')) return 'alta';
  if (alerts.some(a => a.severity === 'media')) return 'media';
  return null;
}

// Metadatos de presentación (colores/etiquetas) reutilizables en UI y export.
export const SEVERITY_META: Record<AlertSeverity, { label: string; emoji: string; hex: string }> = {
  critica: { label: 'Crítica', emoji: '🔴', hex: '#dc2626' },
  alta:    { label: 'Alta',    emoji: '🟠', hex: '#ea580c' },
  media:   { label: 'Media',   emoji: '🟡', hex: '#ca8a04' },
};
