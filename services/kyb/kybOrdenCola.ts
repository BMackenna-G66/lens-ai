// Orden y filtrado de la cola KYB. Puro: entra la lista y los criterios, sale
// la lista. Sin estado, sin red, sin React — así se puede probar.

import type { EmpresaKyb } from '../../types/kyb';

export type ColumnaOrden =
  | 'razonSocial' | 'companyId' | 'identificacion' | 'complianceStatus'
  | 'certidumbre' | 'sugerencia' | 'estado' | 'decision' | 'recibidoEn';

// Gravedad de la conclusión del motor de Chile, de peor a mejor. Ordenar la
// sugerencia alfabéticamente pondría "Fully Blocked" entre medio de "Liberar",
// que es exactamente lo contrario de lo que hay que mirar primero.
const ORDEN_GRAVEDAD = [
  'fully blocked', 'under_compliance_review', 'liberar + ucr', 'revisar',
  'liberar', 'sin causas penales',
];

export function gravedadSugerencia(s?: string): number {
  if (!s) return -1;   // sin screening: no es "lo más leve", es "no se sabe"
  const t = s.toLowerCase();
  const i = ORDEN_GRAVEDAD.findIndex(x => t.includes(x));
  return i === -1 ? 0 : ORDEN_GRAVEDAD.length - i;
}

// Documento comparable: "78.144.880-K", "78144880-k" y "78144880k" tienen que
// encontrar lo mismo. Sin esto, buscar el RUT como lo muestra Admin no encuentra.
const soloDoc = (v: string) => v.toLowerCase().replace(/[.\-\s]/g, '');

export interface CriteriosCola {
  texto?: string;
  sugerencia?: string;      // valor exacto, o 'SIN' para las que no tienen
  estadoAnalisis?: string;
  orden?: ColumnaOrden;
  asc?: boolean;
}

export function ordenarYFiltrar(items: EmpresaKyb[], c: CriteriosCola): EmpresaKyb[] {
  const f = (c.texto ?? '').trim().toLowerCase();
  const fDoc = soloDoc(f);
  let out = items;

  if (f) {
    out = out.filter(i =>
      i.razonSocial.toLowerCase().includes(f) ||
      i.companyId.toLowerCase().includes(f) ||
      soloDoc(i.identificacion ?? '').includes(fDoc));
  }
  if (c.sugerencia) {
    out = out.filter(i => c.sugerencia === 'SIN'
      ? !i.ultimoAnalisis?.sugerenciaCriminal
      : (i.ultimoAnalisis?.sugerenciaCriminal ?? '') === c.sugerencia);
  }
  if (c.estadoAnalisis) {
    out = out.filter(i => (i.ultimoAnalisis?.estado ?? 'SIN_ANALIZAR') === c.estadoAnalisis);
  }

  // Se ordena una COPIA: `items` viene de la suscripción de Firestore y mutarlo
  // rompería la referencia con la que React decide si re-renderizar.
  const dir = (c.asc ?? false) ? 1 : -1;
  const txt = (v: unknown) => String(v ?? '').toLowerCase();

  return [...out].sort((a, b) => {
    switch (c.orden ?? 'recibidoEn') {
      case 'razonSocial':
        return dir * a.razonSocial.localeCompare(b.razonSocial, 'es');
      // Numérico: como texto, "10" iría antes de "9".
      case 'companyId':
        return dir * ((Number(a.companyId) || 0) - (Number(b.companyId) || 0));
      case 'identificacion':
        return dir * txt(a.identificacion).localeCompare(txt(b.identificacion), 'es');
      case 'complianceStatus':
        return dir * txt(a.complianceStatus).localeCompare(txt(b.complianceStatus));
      // Sin análisis va SIEMPRE al final, en las dos direcciones: no es "0%", es
      // "no se sabe", y mezclarlo con los porcentajes más bajos miente.
      case 'certidumbre': {
        const ca = a.ultimoAnalisis?.certidumbre ?? null;
        const cb = b.ultimoAnalisis?.certidumbre ?? null;
        if (ca === null && cb === null) return 0;
        if (ca === null) return 1;
        if (cb === null) return -1;
        return dir * (ca - cb);
      }
      case 'sugerencia': {
        const ga = gravedadSugerencia(a.ultimoAnalisis?.sugerenciaCriminal);
        const gb = gravedadSugerencia(b.ultimoAnalisis?.sugerenciaCriminal);
        // Las sin screening quedan al final en las dos direcciones: "no se sabe"
        // no es "lo más leve".
        if (ga === -1 && gb === -1) return 0;
        if (ga === -1) return 1;
        if (gb === -1) return -1;
        // Misma forma que el resto de las columnas: `dir * (a - b)`. Como la
        // gravedad crece con lo grave, descendente deja Fully Blocked arriba.
        return dir * (ga - gb);
      }
      case 'estado':
        return dir * txt(a.ultimoAnalisis?.estado ?? 'SIN_ANALIZAR')
          .localeCompare(txt(b.ultimoAnalisis?.estado ?? 'SIN_ANALIZAR'));
      case 'decision':
        return dir * txt(a.decision?.tipo).localeCompare(txt(b.decision?.tipo));
      default:
        return dir * txt(a.recibidoEn).localeCompare(txt(b.recibidoEn));
    }
  });
}

// Valores presentes en la cola, para no ofrecer filtros que no filtran nada.
export function sugerenciasPresentes(items: EmpresaKyb[]): string[] {
  const set = new Set<string>();
  items.forEach(i => { const s = i.ultimoAnalisis?.sugerenciaCriminal; if (s) set.add(s); });
  return [...set].sort((a, b) => gravedadSugerencia(b) - gravedadSugerencia(a));
}

export function estadosPresentes(items: EmpresaKyb[]): string[] {
  const set = new Set<string>();
  items.forEach(i => set.add(i.ultimoAnalisis?.estado ?? 'SIN_ANALIZAR'));
  return [...set].sort();
}
