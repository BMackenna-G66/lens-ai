// Delitos que RETIENEN el caso: nunca se cierran por el flujo automático, ni en
// Salesforce ni en Admin, aunque la conclusión del motor diga "Liberar".
//
// Es un freno duro (no configurable desde la web a propósito): si el screening
// trae algún delito relacionado con estas categorías, el caso queda para revisión
// del analista. Más adelante se reemplaza por un sub-catálogo con detalle por
// delito; por eso las categorías viven acá, en un solo lugar.
//
// Funciones PURAS (sin red ni escrituras) para poder testearlas solas.

export interface CategoriaSensible {
  id: string;
  label: string;
  patron: RegExp;   // se evalúa sobre el texto normalizado (mayúsculas, sin tildes)
}

// El patrón se aplica al texto normalizado, así que va sin tildes.
export const CATEGORIAS_SENSIBLES: CategoriaSensible[] = [
  { id: 'trafico', label: 'Tráfico', patron: /TRAFIC/ },                 // tráfico, tráfico ilícito, traficante
  { id: 'defraudaciones', label: 'Defraudaciones', patron: /DEFRAUD/ },   // defraudación, defraudaciones
  { id: 'armas', label: 'Armas', patron: /\bARMA/ },                      // arma, armas, armada (a mano armada)
  { id: 'lavado', label: 'Lavado de activos', patron: /LAVADO/ },         // lavado de activos/dinero
  { id: 'terrorismo', label: 'Terrorismo', patron: /TERROR/ },            // terrorismo, financiamiento del terrorismo
];

// Mayúsculas y sin tildes, para que "Tráfico" y "TRAFICO" matcheen igual.
export function normalizarDelito(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita diacríticos
    .toUpperCase();
}

// Categorías sensibles presentes en una lista de textos (delito, detalle, etc.).
export function categoriasEnTextos(textos: unknown[]): string[] {
  const norm = textos.map(normalizarDelito).filter(Boolean);
  const encontradas: string[] = [];
  for (const cat of CATEGORIAS_SENSIBLES) {
    if (norm.some(t => cat.patron.test(t)) && !encontradas.includes(cat.label)) {
      encontradas.push(cat.label);
    }
  }
  return encontradas;
}

// Coincidencias del screening → categorías sensibles detectadas (vacío = ninguna).
// Revisa el tipo de delito y el detalle (a veces el delito viene en la descripción).
export function categoriasSensibles(
  coincidencias: Array<{ tipo?: string; detalle?: string }> | undefined,
): string[] {
  if (!coincidencias?.length) return [];
  const textos: unknown[] = [];
  for (const c of coincidencias) { textos.push(c?.tipo); textos.push(c?.detalle); }
  return categoriasEnTextos(textos);
}

export const tieneDelitoSensible = (
  coincidencias: Array<{ tipo?: string; detalle?: string }> | undefined,
): boolean => categoriasSensibles(coincidencias).length > 0;
