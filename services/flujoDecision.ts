// LA decisión del flujo automático. Un solo módulo, importado por los dos
// caminos que la ejecutan: la app en el navegador y el Lambda desatendido.
//
// Por qué existe este archivo. Las funciones que deciden ya eran puras, pero
// vivían en `flujoAutomaticoService.ts` (que importa `firebase/firestore` para
// suscribirse a la config) y en `flujoAutomaticoEngine.ts` (que importa los
// servicios que cierran en Salesforce y en Admin). Importar la decisión
// arrastraba todo eso, así que en un Lambda no se podía usar — y la alternativa
// era reescribir las reglas del lado servidor.
//
// Escribir las reglas dos veces es el peor fallo posible de este módulo: las dos
// copias divergen con el tiempo y el flujo desatendido termina liberando algo que
// la app habría retenido, de noche y sin nadie mirando. Mientras la decisión sea
// un solo archivo importado por los dos lados, eso no puede pasar.
//
// REGLA: acá NO entra nada que haga red, toque Firestore, lea localStorage ni
// importe React. Si algo de eso hace falta, va en el llamador.

import { categoriasSensibles } from './delitosSensibles';
import type { CasoSF } from './casosService';

// ── Config del flujo ────────────────────────────────────────────────────────
export interface FlujoOfacConfig {
  enabled: boolean;
  paises: Record<string, boolean>; // por país: { CL: false, CO: false } — todos OFF
  cerrarSF: boolean;        // ejecutar el cierre en Salesforce
  cerrarAdmin: boolean;     // ejecutar el cierre en Admin (bloqueo/desbloqueo)
  tipoLiberarNormal: string; // id de tipología para "Liberar"
  tipoLiberarUcr: string;    // id de tipología para "Liberar UCR"
  tipoBloquear: string;      // id de tipología para "Fully Blocked"
}

export interface FlujoRemesaConfig {
  enabled: boolean;
  cerrarSF: boolean;      // ejecutar el cierre en Salesforce
  cerrarAdmin: boolean;   // liberar la transacción en Admin
  tipoLiberar: string;    // id de la tipología que se aplica
}

// Chile (Regcheq) y Colombia (Inspektor). Para sumar otro, agregarlo acá.
export const PAISES_FLUJO: { code: string; label: string }[] = [
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colombia' },
];

// País del caso → código del catálogo. '' = país sin screening/no soportado, que
// nunca entra al flujo automático.
export function paisCodigo(pais: string): string {
  const p = (pais || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^cl$|chile/.test(p)) return 'CL';
  if (/^co$|colombia/.test(p)) return 'CO';
  return '';
}

export function paisHabilitado(pais: string, cfg: FlujoOfacConfig): boolean {
  const code = paisCodigo(pais);
  return !!code && cfg.paises?.[code] === true;
}

// ── Clasificador: conclusión del screening → id de tipología ────────────────
// Devuelve null cuando la conclusión NO se automatiza (revisión manual, vacía…).
export function tipologiaParaDecision(decision: string | undefined, cfg: FlujoOfacConfig): string | null {
  const d = (decision ?? '').trim().toUpperCase();
  if (!d) return null;
  if (/REVIS/.test(d)) return null;                              // revisión → analista
  if (/BLOCK|BLOQ/.test(d)) return cfg.tipoBloquear;             // Fully Blocked
  if (/UCR|UNDER[_ ]COMPLIANCE/.test(d)) return cfg.tipoLiberarUcr;
  if (/LIBERAR|SIN CAUSAS|SIN RIESGO/.test(d)) return cfg.tipoLiberarNormal;
  return null;
}

// ── Estado del caso ─────────────────────────────────────────────────────────
export type StatusCaso = 'ABIERTO' | 'GESTIONANDO' | 'CERRADO';
const esStatus = (v: string): v is StatusCaso =>
  v === 'ABIERTO' || v === 'GESTIONANDO' || v === 'CERRADO';

// Derivado de los canales de cierre y la asignación. Un caso con los dos canales
// cerrados está CERRADO aunque nadie lo haya marcado.
export function statusDeCaso(c: CasoSF): StatusCaso {
  const guardado = (c.statusCaso ?? '').toUpperCase();
  if (esStatus(guardado)) return guardado;
  const sfOk = c.cierres?.sf?.ok === true;
  const adminOk = c.cierres?.admin?.ok === true;
  if (sfOk && adminOk) return 'CERRADO';
  if (sfOk || adminOk || c.asignacion?.analistaId) return 'GESTIONANDO';
  return 'ABIERTO';
}

export const sigueEnCola = (c: CasoSF): boolean => statusDeCaso(c) !== 'CERRADO';

// ── La decisión ─────────────────────────────────────────────────────────────
export type MotivoNoAuto =
  | 'flujo_apagado'
  | 'pais_apagado'
  | 'ya_cerrado'
  | 'delito_sensible'
  | 'pep'
  | 'sin_conclusion';

export interface EvaluacionAuto {
  automatizable: boolean;
  motivo?: MotivoNoAuto;
  tipologia?: string;
  categorias?: string[];
}

export interface ScreeningParaAuto {
  decision?: string;
  pep?: boolean;
  coincidencias?: Array<{ tipo?: string; detalle?: string }>;
}

// El ORDEN importa y es parte de la regla: los frenos duros se evalúan ANTES de
// mirar la conclusión del screening. Un caso con delito sensible no se libera ni
// aunque la conclusión diga "Liberar".
export function evaluarCasoAuto(
  caso: CasoSF,
  screening: ScreeningParaAuto | undefined,
  cfg: FlujoOfacConfig,
): EvaluacionAuto {
  if (!cfg.enabled) return { automatizable: false, motivo: 'flujo_apagado' };
  if (!paisHabilitado(caso.pais, cfg)) return { automatizable: false, motivo: 'pais_apagado' };
  if (statusDeCaso(caso) === 'CERRADO') return { automatizable: false, motivo: 'ya_cerrado' };

  // Freno duro por delito sensible.
  const categorias = categoriasSensibles(screening?.coincidencias);
  if (categorias.length > 0) return { automatizable: false, motivo: 'delito_sensible', categorias };

  // Freno duro por PEP: un cliente PEP NO se libera solo. Su tratamiento correcto
  // es el bloqueo preventivo + formulario PEP, que hoy no está automatizado, así
  // que el caso queda entero para el analista (tampoco se bloquea solo).
  if (screening?.pep === true) return { automatizable: false, motivo: 'pep', categorias: ['PEP'] };

  const tipologia = tipologiaParaDecision(screening?.decision, cfg);
  if (!tipologia) return { automatizable: false, motivo: 'sin_conclusion' };
  return { automatizable: true, tipologia };
}

// Retención por delito sensible, independiente de la config: sirve para mostrarla
// en la UI aunque el flujo esté apagado.
export const retenidoPorDelito = (screening: ScreeningParaAuto | undefined): string[] =>
  categoriasSensibles(screening?.coincidencias);

// Todo lo que retiene un caso, junto. PEP se suma como una categoría más.
export const motivosRetencion = (screening: ScreeningParaAuto | undefined): string[] => [
  ...categoriasSensibles(screening?.coincidencias),
  ...(screening?.pep === true ? ['PEP'] : []),
];
