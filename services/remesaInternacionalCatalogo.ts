// Catálogo propio de las remesas INTERNACIONALES.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
// El camino internacional consultaba Regcheq, y Regcheq no busca por nombre:
// busca fichas, identificadas por un `dni` que el proveedor valida como RUT
// chileno. Probado contra la API: pasaporte bien formado (`XX1234567`), dígitos
// sueltos (`999888777`), alfanumérico, nombre con guiones bajos y hasta un RUT
// con dígito verificador incorrecto devuelven todos el mismo
// `400 dni invalid-554`. Un RUT válido devuelve 200 y la ficha llega clasificada
// como `dniType: { country: "Chile", document: "RUT" }`.
//
// O sea: el endpoint es de Chile. Un beneficiario extranjero sin RUT no puede
// tener ficha, y el código lo tapaba armando un `dni` con el nombre
// (`JUAN_PEREZ`), que la API rechaza. Resultado medido sobre la cola real: de 9
// remesas internacionales abiertas, **7 quedaban en `estado: 'error'`** — las 7
// sin documento— y las 2 que funcionaban eran las que traían algo con forma de
// RUT.
//
// ── Qué hace en cambio ─────────────────────────────────────────────────────
// Cruza por NOMBRE COMPLETO, que es el único dato que siempre está, sumando
// documento cuando existe. El proveedor es Inspektor (`ConsultaPrincipal`), que
// sí acepta consultas sin identificación y cubre listas internacionales:
// verificado contra la API que devuelve OFAC, SAM de Estados Unidos, sanciones
// de Panamá, el consolidado TIAR y los consolidados de PEPs internacionales.
//
// El país se guarda para trazabilidad pero NO se manda: `ConsultaPrincipal` no
// tiene filtro de país. Decir que filtra por país cuando no lo hace sería peor
// que no tenerlo.
//
// ── La tabla de decisión (el mini catálogo) ────────────────────────────────
//
//   | Coincidencias | Conclusión |
//   |---|---|
//   | ninguna | **Liberar** |
//   | una o más | **Revisar** — la ve una persona |
//
// Deliberadamente más simple que el catálogo de Colombia: no clasifica delitos
// ni descarta ruido. Para internacional no hay muestra con la que calibrar un
// filtro, y mientras no la haya la regla conservadora es que cualquier
// coincidencia la mire alguien. Se reportan TODAS las listas con coincidencia
// para que esa persona pueda triar.
//
// Ojo con el ruido: Inspektor mezcla listas restrictivas con fuentes de prensa
// (`LISTAS INFORMATIVAS`). Sobre un nombre público sancionado devolvió 190
// coincidencias, de las que 110 eran UNA investigación periodística. Eso no
// cambia la conclusión —cualquier coincidencia retiene igual— pero sí importa
// para dimensionar cuántos casos van a revisión, así que el screening deja
// contados los grupos aparte.

import { inspektorLogin, INSPEKTOR_BASE, type Coincidencia } from './casosCriminalService';

// Grupos que Inspektor marca como informativos: prensa, no listas restrictivas.
// No se usan para decidir (cualquier coincidencia retiene), solo para contar y
// para que quien revise sepa qué tiene delante.
const GRUPOS_INFORMATIVOS = /INFORMATIVA/i;

export interface ListaInternacional {
  clave: string;        // idTipoLista de Inspektor
  lista: string;        // nombreTipoLista, el nombre legible
  grupo?: string;       // nombreGrupoLista: restrictiva / PEP / informativa
  riesgo?: string;      // prioridad que reporta el proveedor
  detalle?: string;     // de dónde salió
  matches: number;      // cuántas coincidencias trae esta lista
  informativa: boolean; // prensa, no lista restrictiva
}

export interface ScreeningInternacional {
  estado: 'ok' | 'sin_causas' | 'error' | 'na';
  flujo: 'INTL';
  fuente: 'Inspektor';
  decision: 'Liberar' | 'Revisar' | '—';
  razon?: string;
  delitosUnicos: number;
  coincidencias: Coincidencia[];
  listas: ListaInternacional[];
  mensaje?: string;

  // Trazabilidad del cruce: con qué se consultó y qué se encontró. Un proceso
  // que libera plata sin nadie mirando tiene que poder explicar después con qué
  // datos decidió.
  cruce?: {
    porNombre: boolean;
    porDocumento: boolean;
    pais?: string;
    totalCoincidencias: number;
    nombreExacto: number;      // coinciden con el nombre completo, normalizado
    soloParciales: number;     // coinciden por palabras, no por el nombre entero
    restrictivas: number;      // coincidencias en listas NO informativas
    informativas: number;      // coincidencias en fuentes de prensa
  };
}

const limpiar = (v: unknown): string => String(v ?? '').trim();

// Normalización para comparar nombres: minúsculas, sin tildes, espacios
// colapsados. La misma idea que `nombreExactoCO`, escrita acá para no acoplar
// este catálogo al de Colombia — son dos reglas de negocio distintas y una
// puede cambiar sin la otra.
const normalizarNombre = (v: unknown): string =>
  limpiar(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

interface MatchInspektor {
  idTipoLista?: unknown; nombreTipoLista?: unknown; nombreGrupoLista?: unknown;
  prioridad?: unknown; fuenteConsulta?: unknown; delito?: unknown;
  nombreCompleto?: unknown; documentoIdentidad?: unknown; fecha?: unknown;
  link?: unknown; peps?: unknown;
}

export async function screenRemesaInternacional(
  nombre: string,
  dni: string,
  pais: string,
): Promise<ScreeningInternacional> {
  const base: ScreeningInternacional = {
    estado: 'error', flujo: 'INTL', fuente: 'Inspektor', decision: '—',
    delitosUnicos: 0, coincidencias: [], listas: [],
  };

  const nombreLimpio = limpiar(nombre);
  // Sin nombre no hay cruce posible. No es un error del proveedor: es un dato
  // que el caso no trae, y se marca distinto para que no se lea como falla.
  if (!nombreLimpio) {
    return { ...base, estado: 'na', mensaje: 'El beneficiario no trae nombre: no hay con qué cruzar.' };
  }

  const documento = limpiar(dni).replace(/[.\s]/g, '');

  let data: { listas?: unknown[]; listas_propias?: unknown[] };
  try {
    const token = await inspektorLogin();
    const resp = await fetch(`${INSPEKTOR_BASE}/ConsultaPrincipal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nombreLimpio,
        identificacion: documento,
        // 1 = cédula. Es lo que espera la API; para un documento extranjero no
        // hay código propio, y con `identificacion` vacía el campo se ignora.
        tipoDocumento: 1,
        tienePrioridad_4: true,
        cantidadPalabras: '3',
        // Las tres fuentes judiciales colombianas se piden apagadas: acá el
        // beneficiario NO es colombiano por definición del flujo, así que
        // consultarlas solo agrega latencia y ruido.
        procuraduria: false,
        ramaJudicial: false,
        ramaJEPMS: false,
      }),
    });
    if (!resp.ok) {
      return { ...base, mensaje: `Consulta Inspektor ${resp.status}` };
    }
    data = (await resp.json()) as typeof data;
  } catch (e) {
    return { ...base, mensaje: e instanceof Error ? e.message : String(e) };
  }

  const matches = [...(data.listas ?? []), ...(data.listas_propias ?? [])] as MatchInspektor[];

  // Agrupado por lista: "todas las listas que tengan coincidencias", que es lo
  // que se muestra.
  const porLista = new Map<string, ListaInternacional>();
  for (const m of matches) {
    const lista = limpiar(m.nombreTipoLista) || 'Lista sin nombre';
    const grupo = limpiar(m.nombreGrupoLista);
    const clave = limpiar(m.idTipoLista) || lista;
    const previa = porLista.get(clave);
    if (previa) { previa.matches += 1; continue; }
    porLista.set(clave, {
      clave, lista, grupo: grupo || undefined,
      riesgo: limpiar(m.prioridad) || undefined,
      detalle: limpiar(m.fuenteConsulta) || undefined,
      matches: 1,
      informativa: GRUPOS_INFORMATIVOS.test(grupo),
    });
  }
  const listas = [...porLista.values()].sort((a, b) => b.matches - a.matches);

  const objetivo = normalizarNombre(nombreLimpio);
  const nombreExacto = matches.filter(m => normalizarNombre(m.nombreCompleto) === objetivo).length;
  const informativas = matches.filter(m => GRUPOS_INFORMATIVOS.test(limpiar(m.nombreGrupoLista))).length;

  const coincidencias: Coincidencia[] = matches.map(m => ({
    tipo: limpiar(m.delito) || limpiar(m.nombreTipoLista) || 'Coincidencia en lista',
    detalle: limpiar(m.fuenteConsulta) || limpiar(m.link) || '—',
    estado: limpiar(m.nombreGrupoLista) || undefined,
    fecha: limpiar(m.fecha) || undefined,
    fuente: 'Inspektor',
    riesgo: limpiar(m.prioridad) || undefined,
  }));

  const cruce = {
    porNombre: true,
    porDocumento: !!documento,
    pais: limpiar(pais) || undefined,
    totalCoincidencias: matches.length,
    nombreExacto,
    soloParciales: matches.length - nombreExacto,
    restrictivas: matches.length - informativas,
    informativas,
  };

  // La tabla de decisión, entera.
  if (matches.length === 0) {
    return {
      ...base, estado: 'sin_causas', decision: 'Liberar',
      razon: documento
        ? 'Sin coincidencias cruzando nombre completo y documento.'
        : 'Sin coincidencias cruzando el nombre completo.',
      coincidencias: [], listas: [], cruce,
    };
  }

  const conDoc = matches.filter(m => limpiar(m.documentoIdentidad)).length;
  return {
    ...base,
    estado: 'ok',
    decision: 'Revisar',
    razon: `${matches.length} coincidencia(s) en ${listas.length} lista(s)`
      + ` · ${nombreExacto} con el nombre completo exacto`
      + ` · ${cruce.restrictivas} en listas restrictivas y ${informativas} en fuentes informativas`
      + ` · ${conDoc} traen documento.`,
    delitosUnicos: new Set(coincidencias.map(c => c.tipo)).size,
    coincidencias,
    listas,
    cruce,
  };
}
