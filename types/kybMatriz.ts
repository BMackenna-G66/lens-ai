// MANTENEDOR de los 11 componentes de la matriz KYB y sus pesos.
//
// Eran 12. `forma_legal` (peso 8) se sacó por pedido del negocio: no se evalúa
// ni se muestra más. Sus 8 puntos se repartieron sobre los 11 restantes por
// resto mayor, que preserva el orden relativo exacto — sacar un campo no puede
// cambiar de paso qué componente pesa más que cuál. El denominador sigue en 100.
//
// ⚠️ ESTA ES UNA PROPUESTA, no una definición firmada. El plan la marca como
// definición de negocio pendiente. Está armada sobre lo que Admin REALMENTE
// devuelve (55 campos verificados con la empresa 2058470) y sobre lo que el
// pipeline de Lens ya extrae de los documentos, con pesos que suman 100.
//
// Para cambiar la matriz se edita SOLO este archivo: el comparador y el motor de
// certidumbre leen de acá.
//
// Dos componentes son de FUENTE ÚNICA y por eso se VALIDAN en vez de compararse:
//   · Capital social — no existe en Admin (verificado). Sale solo de la escritura.
//   · Estructura societaria — solo Admin la tiene (malla de relationships).
// Un componente de fuente única no puede "discrepar": o está, o falta.

export type EstadoComparacion =
  | 'COINCIDE'      // los dos lados dicen lo mismo
  | 'PARCIAL'       // se parecen pero no son idénticos (nombre similar, monto en tolerancia)
  | 'DISCREPA'      // los dos lados tienen dato y NO coinciden — es el caso grave
  | 'SOLO_LENS'     // está en los documentos y no en Admin
  | 'SOLO_ADMIN'    // está en Admin y no en los documentos
  | 'SIN_DATOS';    // ninguno de los dos lo aporta

export type FuenteComponente = 'AMBAS' | 'SOLO_LENS' | 'SOLO_ADMIN';

export interface DefinicionComponente {
  id: string;
  label: string;
  peso: number;                  // los 11 suman 100
  fuente: FuenteComponente;      // AMBAS = se compara · resto = se valida
  // true = una discrepancia acá es de IDENTIDAD y frena el flujo automático en
  // las dos direcciones: significa que los datos están mal, no la empresa.
  esIdentidad?: boolean;
  descripcion: string;
}

export const COMPONENTES_KYB: DefinicionComponente[] = [
  {
    id: 'razon_social', label: 'Razón social', peso: 13, fuente: 'AMBAS', esIdentidad: true,
    descripcion: 'Nombre legal de la empresa, sin sufijos societarios (SPA, LTDA, SAS).',
  },
  {
    id: 'identificacion', label: 'Identificación tributaria', peso: 13, fuente: 'AMBAS', esIdentidad: true,
    descripcion: 'RUT / NIT con su tipo. En Chile se valida el dígito verificador (módulo 11).',
  },
  {
    id: 'representantes', label: 'Representantes legales', peso: 13, fuente: 'AMBAS', esIdentidad: true,
    descripcion: 'Personas con poder de representación. Se emparejan por documento y, si no hay, por nombre.',
  },
  {
    id: 'accionistas', label: 'Accionistas / beneficiarios finales', peso: 12, fuente: 'AMBAS',
    descripcion: 'Socios y beneficiarios finales. En Admin vienen como dict {categoría: [personas]}.',
  },
  {
    id: 'constitucion', label: 'Constitución', peso: 9, fuente: 'AMBAS',
    descripcion: 'Fecha de constitución y número de escritura.',
  },
  {
    id: 'domicilio', label: 'Domicilio', peso: 9, fuente: 'AMBAS',
    descripcion: 'Dirección legal. Se compara por huella normalizada, no por texto literal.',
  },
  {
    id: 'actividad', label: 'Actividad económica', peso: 9, fuente: 'AMBAS',
    descripcion: 'Giro e industria. Admin la reparte en cinco campos distintos; se unifican.',
  },
  {
    id: 'facultades', label: 'Facultades y firma', peso: 7, fuente: 'AMBAS',
    descripcion: 'Administración conjunta y facultades de firma. Admin SÍ los trae.',
  },
  {
    id: 'financiero', label: 'Perfil financiero', peso: 6, fuente: 'AMBAS',
    descripcion: 'Facturación, ingresos, egresos, activos y pasivos. Con tolerancia relativa.',
  },
  {
    id: 'directorio', label: 'Directorio', peso: 5, fuente: 'AMBAS',
    descripcion: 'Miembros del directorio (board-member).',
  },
  {
    id: 'estructura', label: 'Estructura societaria', peso: 4, fuente: 'SOLO_ADMIN',
    descripcion: 'Malla de relaciones. Solo Admin la tiene: se valida que exista, no se compara.',
  },
];

// El denominador es FIJO en 100: si un componente no aplica, su peso NO se
// redistribuye. Un 70% tiene que significar lo mismo entre dos empresas
// distintas, y con denominador variable no lo significaría.
export const PESO_TOTAL_KYB = 100;

// Invariante del catálogo: los pesos suman exactamente 100.
export function pesosSuman100(): boolean {
  return COMPONENTES_KYB.reduce((s, c) => s + c.peso, 0) === PESO_TOTAL_KYB;
}

export const componentePorId = (id: string): DefinicionComponente | undefined =>
  COMPONENTES_KYB.find(c => c.id === id);

// ── Resultado de comparar un componente ──────────────────────────────────────
export interface ResultadoComponente {
  id: string;
  label: string;
  peso: number;
  estado: EstadoComparacion;
  valorLens?: string;      // legible, para mostrar en la matriz
  valorAdmin?: string;
  detalle?: string;        // por qué quedó en ese estado
  // Para los componentes de personas: qué se emparejó y qué quedó suelto.
  emparejados?: number;
  soloEnLens?: string[];
  soloEnAdmin?: string[];
  // Cómo se emparejó cada persona, con su puntaje de identidad. Es lo que
  // permite ver que una "discrepancia" era la misma persona con el cargo pegado
  // al nombre — antes la matriz solo decía "sin ninguna coincidencia".
  identidades?: {
    lens: string;
    admin: string;
    puntaje: number;
    estado: 'EXACTO' | 'APROXIMADO';
    porDocumento: boolean;
    motivo: string;
    documentoSospechoso?: boolean;
  }[];
}

// Factor de aporte de cada estado al porcentaje de certidumbre.
// DISCREPA y SIN_DATOS aportan 0 pero SÍ pesan en el denominador (que es fijo),
// así que restan certidumbre en vez de ser neutros.
export const FACTOR_ESTADO: Record<EstadoComparacion, number> = {
  COINCIDE: 1.00,
  PARCIAL: 0.60,
  SOLO_LENS: 0.35,
  SOLO_ADMIN: 0.35,
  DISCREPA: 0.00,
  SIN_DATOS: 0.00,
};
