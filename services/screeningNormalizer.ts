// Contrato interno común de screening (§19). Función PURA.
// Toma el resultado que ya unifica `casosCriminalService.screenCaso` (Regcheq para
// Chile / Inspektor para Colombia, ambos como `coincidencias[]`) y lo lleva a
// `ScreeningNormalizado` con alertas dedupeadas. NO hace red ni reparsea payloads
// crudos del proveedor (reusa lo que screenCaso ya extrajo → no se duplica el fetch).

import type { CasoSF } from './casosService';
import type { CasoScreening, Coincidencia } from './casosCriminalService';
import type { AlertaScreening, TipoCasoCompliance, NivelRiesgo } from './casosComplianceTypes';
import { inferirTipoCaso, normalizarTexto } from './casosComplianceMapper';
import { dedupKey, mergeAlertas } from './alertDeduplication';

export interface ScreeningNormalizado {
  tipo: TipoCasoCompliance;
  fuente: CasoScreening['fuente'];
  estado: CasoScreening['estado'];
  screenedAt: string;
  decision: string;
  razon: string;
  alertas: AlertaScreening[];
  coincidenciasLegacy: CasoScreening['coincidencias'];
}

// Mapea el riesgo textual del proveedor a NivelRiesgo interno.
function mapRiesgo(r?: string): NivelRiesgo {
  const s = normalizarTexto(r);
  if (/CRITIC/.test(s)) return 'CRITICO';
  if (/HIGH|ALTO/.test(s)) return 'ALTO';
  if (/MEDIUM|MEDIO/.test(s)) return 'MEDIO';
  if (/LOW|BAJO/.test(s)) return 'BAJO';
  return s ? 'MEDIO' : 'BAJO';
}

// Convierte una coincidencia (delito/evento) en una AlertaScreening con dedupKey estable.
function coincidenciaAAlerta(
  co: Coincidencia, caso: CasoSF, fuente: string, tipo: TipoCasoCompliance, screenedAt: string,
): AlertaScreening {
  const lista = fuente || '—';
  const providerMatchId = (co.detalle || '').match(/\d{3,}/)?.[0] ?? null; // heurística RUC/ID
  const key = dedupKey([caso.numeroCaso, tipo, fuente, lista, providerMatchId, co.tipo, co.detalle, co.fecha]);
  return {
    alertaId: key,
    dedupKey: key,
    tipo,
    fuente,
    providerMatchId,
    lista,
    nombreCoincidente: co.tipo || co.detalle || '',
    aliases: [],
    scoreProveedor: null,
    scoreNormalizado: null,
    riesgo: mapRiesgo(co.riesgo),
    estado: 'ABIERTA',
    coincidencia: { fechaNacimiento: null, nacionalidades: [], paises: [], documentosEnmascarados: [] },
    evidencias: [{ detalle: co.detalle, estado: co.estado, fecha: co.fecha, fuente: co.fuente }],
    creadaEn: screenedAt,
    actualizadaEn: screenedAt,
  };
}

export function normalizarScreening(cs: CasoScreening, caso: CasoSF, screenedAt: string): ScreeningNormalizado {
  const tipo = inferirTipoCaso(caso);
  const alertas = mergeAlertas(
    [],
    (cs.coincidencias ?? []).map(co => coincidenciaAAlerta(co, caso, cs.fuente, tipo, screenedAt)),
  );
  return {
    tipo,
    fuente: cs.fuente,
    estado: cs.estado,
    screenedAt,
    decision: cs.decision,
    razon: cs.razon,
    alertas,
    coincidenciasLegacy: cs.coincidencias,
  };
}
