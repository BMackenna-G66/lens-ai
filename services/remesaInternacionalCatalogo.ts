// Catálogo propio de las remesas INTERNACIONALES.
//
// Mismo reparto que Chile y Colombia: el screening consulta, el catálogo
// concluye. La consulta vive en `remesaScreeningService.leerInternacionalRegcheq`
// y va contra REGCHEQ — Inspektor cubre Colombia y no corresponde acá.
//
// ── El problema que resuelve ────────────────────────────────────────────────
// Regcheq no busca por nombre: busca fichas identificadas por un documento
// (verificado: no existe ningún endpoint de búsqueda por nombre, los 9 que
// probé devuelven 404). Cuando el beneficiario no traía documento, el código lo
// fabricaba desde el nombre y la API lo rechazaba con `400 dni invalid-554`. De
// 9 remesas internacionales abiertas, 7 quedaban en `estado: 'error'` — las 7
// sin documento.
//
// Lo que faltaba para los que sí traen documento era mandar `dniType` como
// objeto con el país. Con eso la ficha extranjera se crea y se screenea.
//
// ── La tabla de decisión ────────────────────────────────────────────────────
//
//   | Identidad | Coincidencias | Conclusión |
//   |---|---|---|
//   | documento + país | ninguna | **Liberar** |
//   | documento + país | una o más | **Revisar** |
//   | solo nombre y apellido | — | **Revisar** — homonimia no descartable |
//
// La tercera fila es la regla de negocio explícita: sin documento el cruce solo
// puede ser por nombre, y con nombre y un apellido la homonimia no se puede
// descartar. Eso lo mira una persona; no se libera solo y tampoco se marca como
// error, porque no falló nada — falta un dato.
//
// Medido sobre la cola real: de 18 remesas internacionales abiertas, 12 no traen
// documento (7 a España, 2 a Estados Unidos, y una a México, Irlanda y SWIFT), y
// 11 de esas 12 tienen apenas dos palabras en el nombre.

import { leerInternacionalRegcheq, type ListaCoincidencia } from './remesaScreeningService';

export type MotivoInternacional =
  | 'sin_coincidencias'      // libera
  | 'con_coincidencias'      // hay match en listas
  | 'identidad_insuficiente' // solo nombre y apellido: homonimia no descartable
  | 'error_proveedor';

export interface ScreeningInternacional {
  estado: 'ok' | 'sin_causas' | 'error' | 'na';
  flujo: 'INTL';
  fuente: 'Regcheq';
  decision: 'Liberar' | 'Revisar' | '—';
  motivo: MotivoInternacional;
  razon?: string;
  listas: ListaCoincidencia[];
  mensaje?: string;

  // Con qué se cruzó. Un proceso que libera plata sin nadie mirando tiene que
  // poder explicar después con qué datos decidió.
  cruce: {
    porDocumento: boolean;
    pais?: string;
    palabrasEnNombre: number;
    documentoTipo?: string;
    tipoSustituido?: boolean;
    listasConCoincidencia: number;
  };
}

const limpiar = (v: unknown): string => String(v ?? '').trim();
const palabras = (v: unknown): number => limpiar(v).split(/\s+/).filter(Boolean).length;

export async function screenRemesaInternacional(
  nombre: string,
  dni: string,
  pais: string,
  tipoDocumento = '',
): Promise<ScreeningInternacional> {
  const base = {
    flujo: 'INTL' as const,
    fuente: 'Regcheq' as const,
    listas: [] as ListaCoincidencia[],
  };
  const cruceBase = {
    porDocumento: !!limpiar(dni),
    pais: limpiar(pais) || undefined,
    palabrasEnNombre: palabras(nombre),
    listasConCoincidencia: 0,
  };

  const lectura = await leerInternacionalRegcheq(nombre, dni, pais, tipoDocumento);

  // Sin documento no hay ficha posible, y el cruce por nombre y un apellido no
  // descarta homonimia. Va a revisión manual, NO a error: no falló el proveedor,
  // falta un dato del beneficiario.
  if (lectura.sinDocumento) {
    return {
      ...base, estado: 'na', decision: 'Revisar', motivo: 'identidad_insuficiente',
      razon: cruceBase.palabrasEnNombre <= 2
        ? 'Sin documento y con nombre y un apellido: la homonimia no se puede descartar.'
        : 'Sin documento del beneficiario: la homonimia no se puede descartar.',
      cruce: cruceBase,
      mensaje: lectura.mensaje,
    };
  }

  if (!lectura.ok) {
    return {
      ...base, estado: 'error', decision: '—', motivo: 'error_proveedor',
      mensaje: lectura.mensaje, cruce: cruceBase,
    };
  }

  const cruce = {
    ...cruceBase,
    documentoTipo: lectura.documentoTipo,
    tipoSustituido: lectura.tipoSustituido,
    listasConCoincidencia: lectura.listas.length,
  };

  if (lectura.listas.length === 0) {
    return {
      ...base, estado: 'sin_causas', decision: 'Liberar', motivo: 'sin_coincidencias',
      razon: `Sin coincidencias cruzando documento ${lectura.documentoTipo ?? ''} de ${cruce.pais ?? 'destino'}.`.replace('  ', ' ')
        + (lectura.tipoSustituido
          // Auditable: si liberó con el tipo sustituido, tiene que decirlo. El
          // screening igual corre sobre nombre + número, pero la ficha quedó con
          // un tipo que no es el declarado y eso se mira después.
          ? ` Ojo: el tipo declarado no existe en Regcheq, se consultó como ${lectura.documentoTipo}.`
          : ''),
      cruce,
    };
  }

  return {
    ...base, estado: 'ok', decision: 'Revisar', motivo: 'con_coincidencias',
    razon: `${lectura.listas.length} lista(s) con coincidencia: ${lectura.listas.map(l => l.lista).join(', ')}`
      + (lectura.tipoSustituido ? ` · ojo: el tipo de documento declarado no existe en Regcheq, se consultó como ${lectura.documentoTipo}` : ''),
    listas: lectura.listas,
    cruce,
  };
}
