// Screening del BENEFICIARIO de una remesa (cola Remesa de la Bandeja).
//
// A diferencia de OFAC, acá no se screenea al cliente del caso sino a quien
// recibe la plata, y el flujo depende de su país:
//
//   · Chile     → Regcheq, mismo perfil criminal que usa OFAC (causas penales
//                 contra el catálogo de delitos + flag PEP).
//   · Colombia  → Inspektor, mismo modelo criminal de Colombia (Legal Policy
//                 Gate + capas), con las mismas conclusiones.
//   · Resto     → envío internacional: Regcheq **solo por nombre** contra las
//                 listas. No hay catálogo todavía, así que NO se concluye nada:
//                 se reporta EN QUÉ LISTAS coincide y de qué tipo, para que el
//                 analista lo revise.
//
// Reusa los motores ya probados de Chile y Colombia (no los reimplementa) y trae
// la lógica internacional del módulo Regcheq replicándola acá, sin tocarlo.

import { evaluarSamePerson } from './remesaSamePerson';
import { screenRemesaInternacional } from './remesaInternacionalCatalogo';
import { screenChileCriminal } from './lens360Service';
import { screenColombia } from './casosCriminalService';
import type { Coincidencia } from './casosCriminalService';
import type { RemesaRow } from './remesasService';

const REGCHEQ_BASE = 'https://external-api.regcheq.com';
const REGCHEQ_KEY = ((import.meta as unknown) as { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

export type FlujoRemesa = 'CL' | 'CO' | 'INTL' | 'SIN_DATO';
// `same_person` NO es un resultado del screening: es que no hubo screening. El
// beneficiario resultó ser el mismo cliente y se tomó el atajo antes de llamar a
// ningún proveedor. Tiene su propio estado justamente para que no se confunda
// con `sin_causas`, que sí significa "se consultó y no había nada".
export type EstadoRemesaScreening = 'ok' | 'sin_causas' | 'error' | 'na' | 'same_person';

// Un match concreto dentro de una lista (Screening Global trae varios).
export interface HitLista {
  nombre?: string;
  tipos?: string[];       // adverse-media, sanction, pep, narcotics-aml-cft, …
  fuentes?: string[];
  score?: number;
  matchTypes?: string[];  // name_exact, name_fuzzy, …
}

// Una lista de Regcheq con coincidencia (lo que importa en el flujo internacional).
export interface ListaCoincidencia {
  clave: string;      // key cruda de la API
  lista: string;      // nombre legible
  riesgo?: string;    // nivel que reporta Regcheq
  detalle?: string;   // resumen del match
  // Screening Global devuelve los matches en additionalData.hits[]: nombre, tipos
  // (incluye cosas como narcotics-aml-cft), fuente y score. Sin esto la ficha
  // mostraba solo "Screening Global · medium" y se perdía TODO el contenido.
  hits?: HitLista[];
  totalHits?: number;
  estadoMatch?: string;   // match_status que reporta el proveedor
}

export interface RemesaScreening {
  estado: EstadoRemesaScreening;
  flujo: FlujoRemesa;
  fuente: 'Regcheq' | 'Inspektor' | '—';
  decision: string;            // conclusión (CL/CO) o resumen de listas (INTL)
  razon?: string;
  delitosUnicos: number;
  pep?: boolean;
  coincidencias: Coincidencia[];   // delitos/causas (CL y CO)
  listas: ListaCoincidencia[];     // listas con match (INTL)
  mensaje?: string;                // error legible
  // Trazabilidad del cruce internacional: con qué datos se consultó y qué se
  // encontró. Solo lo llena el camino INTL.
  cruceInternacional?: {
    porDocumento: boolean; pais?: string; palabrasEnNombre: number;
    documentoTipo?: string; tipoSustituido?: boolean; listasConCoincidencia: number;
  };
  // Envío a sí mismo. Cuando `samePerson` es true NO se consultó a ningún
  // proveedor: `evidencia` guarda con qué documentos se hizo la comparación,
  // que es lo único que respalda la liberación.
  samePerson?: boolean;
  evidenciaSamePerson?: {
    documento?: string;          // el documento normalizado que coincidió
    dniCliente?: string;         // tal cual venía en el caso
    dniBeneficiario?: string;    // tal cual venía en la transacción
    tipoDniCliente?: string;
  };
}

// Nombres legibles de las listas (replicado del módulo Regcheq).
const ETIQUETA_LISTA: Record<string, string> = {
  ofac: 'OFAC', onu: 'ONU', ue: 'Unión Europea', pep: 'PEP',
  rtp: 'RTP / PDI', rtpResult: 'RTP / PDI', pdi: 'PDI Chile', pdiResult: 'PDI Chile',
  gafi: 'GAFI', gafiResult: 'GAFI', screeningGlobal: 'Screening Global',
  interestList: 'Lista de Interés', internationalOrganizations: 'Organismos Internacionales',
  ofacAddressResult: 'OFAC Domicilio', bicResult: 'BIC', keywordsResult: 'Palabras Clave',
  riskComments: 'Comentarios de Riesgo', internList: 'Lista Interna',
  regcheqList: 'Lista Regcheq', causasPenalesRegcheq: 'Causas Penales Chile',
  // Faltaban: sin etiqueta la ficha mostraba la key cruda ("pepChile", etc.).
  pepChile: 'PEP Chile', funcPublicChile: 'Función Pública Chile',
  secondCriminalCasesChile: 'Causas Penales Chile',
};

const etiqueta = (k: string): string => ETIQUETA_LISTA[k] ?? k;

// Extrae el contenido real de una lista. Screening Global —la que importa en los
// envíos internacionales— guarda los matches en `additionalData.hits[]`; antes se
// buscaba `data.name`, que ahí no existe, así que la ficha mostraba la lista sin
// ningún detalle. El resto de las listas sí traen name/description.
function detalleDeLista(data: unknown): Pick<ListaCoincidencia, 'detalle' | 'hits' | 'totalHits' | 'estadoMatch'> {
  if (Array.isArray(data)) return { detalle: `${data.length} coincidencia(s)` };
  const d = (data ?? {}) as Record<string, unknown>;
  const ad = (d.additionalData ?? d) as Record<string, unknown>;
  const crudos = Array.isArray(ad.hits) ? (ad.hits as Record<string, unknown>[]) : null;

  if (crudos?.length) {
    const hits: HitLista[] = crudos.slice(0, 10).map(h => {   // top 10: puede traer 100
      const doc = (h.doc ?? {}) as Record<string, unknown>;
      return {
        nombre: limpiar(doc.name) || undefined,
        tipos: Array.isArray(doc.types) ? (doc.types as string[]) : undefined,
        fuentes: Array.isArray(doc.sources)
          ? (doc.sources as Array<Record<string, unknown> | string>).map(s => limpiar(typeof s === 'string' ? s : s?.name)).filter(Boolean)
          : undefined,
        score: typeof h.score === 'number' ? h.score : undefined,
        matchTypes: Array.isArray(h.match_types) ? (h.match_types as string[]) : undefined,
      };
    });
    const total = Number(ad.total_matches ?? ad.total_hits ?? crudos.length);
    return {
      detalle: `${total} coincidencia(s)`,
      hits, totalHits: total,
      estadoMatch: limpiar(ad.match_status) || undefined,
    };
  }

  const info = (d.info ?? {}) as Record<string, unknown>;
  return { detalle: limpiar(d.name ?? d.description ?? info.name) || undefined };
}

// Las causas penales se tratan aparte (tienen su propio motor), no como "lista".
const NO_ES_LISTA = new Set(['causasPenalesRegcheq', 'secondCriminalCasesChile']);

const limpiar = (v: unknown): string => String(v ?? '').trim();
const normalizar = (v: string): string =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// NACIONALIDAD del beneficiario → flujo de screening. Es lo único que decide:
//   Chile → CL · Colombia → CO · cualquier otra → INTL · vacía/nula → SIN_DATO
// SIN_DATO no se screenea: sin nacionalidad no se puede elegir proveedor, así que
// el caso queda marcado "Sin revisión" para que el analista lo mire.
export function flujoDeBeneficiario(row: Pick<RemesaRow, 'beneficiary_country_name'>): FlujoRemesa {
  const pais = normalizar(limpiar(row?.beneficiary_country_name));
  if (!pais || pais === 'null' || pais === 'n/a' || pais === '-') return 'SIN_DATO';
  if (/chile/.test(pais) || pais === 'cl' || pais === 'chl') return 'CL';
  if (/colombia/.test(pais) || pais === 'co' || pais === 'col') return 'CO';
  return 'INTL';
}

// Nombre completo del beneficiario (la API internacional busca por nombre).
export function nombreBeneficiario(row: Partial<RemesaRow>): string {
  const compuesto = [row?.beneficiary_first_name, row?.beneficiary_last_name]
    .map(limpiar).filter(Boolean).join(' ');
  return limpiar(row?.beneficiary_name) || compuesto;
}

// ── Flujo internacional: Regcheq, ficha con documento extranjero ────────────
//
// Regcheq no busca por nombre: busca FICHAS, y la ficha se identifica con un
// documento. Lo que rompía antes era que el código, cuando el beneficiario no
// traía documento, lo fabricaba desde el nombre (`JUAN_PEREZ`) — y eso la API lo
// rechaza siempre. Medido: 7 de 9 internacionales abiertos en `estado: 'error'`,
// exactamente los 7 sin documento.
//
// Lo que faltaba para los que SÍ traen documento es `dniType`, y hay que
// mandarlo como OBJETO. Verificado contra la API:
//
//   {country:'Perú',  person:'natural', document:'DNI'}      → 200 (Peru/DNI)
//   {country:'España',person:'natural', document:'DNI'}      → 200 (Spain/DNI)
//   {country:'Brasil',person:'natural', document:'CPF'}      → 200 (Brazil/CPF)
//   {country:'México',person:'natural', document:'CURP'}     → 200 (Mexico/CURP)
//   {country:'Estados Unidos',        …, document:'PASSPORT'}→ 200
//   dniType ausente, o country en ISO ('PE')                 → 400 dni invalid-554
//
// Sin `dniType` la API asume RUT chileno: valida el dígito verificador y rechaza
// todo lo demás. Con `dniType` la ficha se crea y SE SCREENEA — verificado que el
// GET de una ficha peruana devuelve `screeningGlobal`,
// `internationalOrganizations`, `ofacAddressResult`, `gafiResult`, `rtpResult`,
// `bicResult` y `keywordsResult`.
//
// `NIE` y `CUIL` NO existen como tipo en Regcheq (400 con cualquier formato), así
// que se cae a `PASSPORT`, que sí acepta en todos los países probados. Cuál se
// usó queda anotado en el screening: una ficha con el tipo sustituido no es un
// dato limpio y quien revise tiene que poder verlo.
export interface LecturaInternacional {
  ok: boolean;
  sinDocumento: boolean;          // no hay con qué armar la ficha
  listas: ListaCoincidencia[];    // listas con coincidencia
  documentoTipo?: string;         // el `document` que aceptó Regcheq
  tipoSustituido?: boolean;       // se usó PASSPORT porque el declarado no existe
  mensaje?: string;
}

// Tipos que Regcheq reconoce. `NIE` y `CUIL` quedaron fuera a propósito: probados
// con formatos válidos, devuelven 400.
const DOCS_REGCHEQ = new Set(['DNI', 'CPF', 'CURP', 'PASSPORT', 'RUT', 'RUC', 'CI']);

export async function leerInternacionalRegcheq(
  nombre: string,
  dni: string,
  pais: string,
  tipoDocumento: string,
): Promise<LecturaInternacional> {
  // Solo lo alfanumérico: los separadores varían por país (CUIL con guiones, CPF
  // con puntos) y la ficha se identifica por el número.
  const ref = limpiar(dni).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  // SIN DOCUMENTO NO SE INVENTA NADA. Antes acá se armaba un `dni` con el
  // nombre; el resultado era un 400 garantizado disfrazado de error de API.
  //
  // Va ANTES de mirar la key a propósito: que el beneficiario no traiga
  // documento es un hecho del caso, no una falla de configuración. Al revés, una
  // key ausente disfrazaba de "error del proveedor" a 12 casos que en realidad
  // son revisión manual por identidad insuficiente.
  if (!ref) return { ok: false, sinDocumento: true, listas: [] };
  if (!limpiar(nombre)) return { ok: false, sinDocumento: true, listas: [], mensaje: 'El beneficiario no trae nombre.' };

  if (!REGCHEQ_KEY) return { ok: false, sinDocumento: false, listas: [], mensaje: 'Falta la key de Regcheq' };

  const paisRegcheq = limpiar(pais);
  const declarado = limpiar(tipoDocumento).toUpperCase();
  // Orden de intento: el tipo declarado si Regcheq lo conoce, después PASSPORT.
  const candidatos = [...new Set([
    ...(DOCS_REGCHEQ.has(declarado) ? [declarado] : []),
    'PASSPORT',
  ])];

  // ¿La ficha ya existe? Si existe NO se manda el nombre: la API lo pisa
  // partiéndolo en name/fatherName. Y `personType` no se puede modificar después
  // de creada, así que se respeta el que tenga.
  let personType = 'natural';
  let existia = false;
  try {
    const previa = await fetch(`${REGCHEQ_BASE}/record/${ref}/${REGCHEQ_KEY}`);
    if (previa.ok) {
      existia = true;
      const p = await previa.json().catch(() => ({})) as { personType?: string };
      personType = String(p.personType ?? 'natural');
    }
  } catch { /* si falla la previa se intenta crear igual */ }

  let creada = false;
  let documentoTipo: string | undefined;
  let ultimoError = '';
  // La ficha NO siempre queda guardada con el número que se mandó: Regcheq
  // normaliza. Un CPF brasileño con ceros a la izquierda entra con 11 caracteres
  // y se guarda con 9, así que el GET con el número original devolvía 404 y el
  // caso salía como "la ficha no quedó disponible a tiempo" cuando existía.
  //
  // Por eso se lee el `dni` que devuelve el POST y se usa ESE para consultar, en
  // vez de adivinar qué normalización aplica cada país.
  let refGuardada = ref;
  for (const doc of candidatos) {
    const cuerpo: Record<string, unknown> = {
      dni: ref, personType,
      dniType: { country: paisRegcheq, person: personType, document: doc },
      ...(existia ? {} : { name: limpiar(nombre).toUpperCase() }),
    };
    try {
      const post = await fetch(`${REGCHEQ_BASE}/record/${REGCHEQ_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (post.ok) {
        creada = true; documentoTipo = doc;
        const j = await post.json().catch(() => ({})) as { dni?: unknown };
        const devuelto = limpiar(j.dni);
        if (devuelto) refGuardada = devuelto;
        break;
      }
      ultimoError = `POST ${post.status}: ${(await post.text()).slice(0, 140)}`;
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : String(e);
    }
  }
  if (!creada && !existia) {
    return { ok: false, sinDocumento: false, listas: [], mensaje: `no se pudo crear la ficha (${ultimoError}) · país "${paisRegcheq}"` };
  }

  // La ficha recién creada tarda en indexarse: se reintenta con esperas
  // crecientes, igual que el módulo Regcheq.
  let perfil: Record<string, unknown> | null = null;
  let ultimoEstado = 0;
  // Esperas más largas que el resto del módulo a propósito: una ficha extranjera
  // recién creada tarda más en indexarse. Con [1s,2s,3s] un CPF brasileño recién
  // creado devolvía 404 en los tres intentos y el caso salía como error del
  // proveedor cuando la ficha existía. Ahora suma hasta 16 s.
  for (const espera of [creada ? 1500 : 300, 2500, 4000, 8000]) {
    await new Promise(r => setTimeout(r, espera));
    try {
      const resp = await fetch(`${REGCHEQ_BASE}/record/${encodeURIComponent(refGuardada)}/${REGCHEQ_KEY}`);
      ultimoEstado = resp.status;
      if (resp.ok) { perfil = await resp.json(); break; }
      if (resp.status !== 404) break;
    } catch (e) {
      return { ok: false, sinDocumento: false, listas: [], mensaje: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!perfil) {
    return { ok: false, sinDocumento: false, listas: [], mensaje: `la ficha no quedó disponible a tiempo (GET ${ultimoEstado})` };
  }

  const listasRaw = (perfil.listas ?? {}) as Record<string, Record<string, unknown>>;
  const listas: ListaCoincidencia[] = [];
  for (const [clave, entrada] of Object.entries(listasRaw)) {
    if (NO_ES_LISTA.has(clave) || !entrada?.coincidence) continue;
    listas.push({
      clave, lista: etiqueta(clave),
      riesgo: limpiar(entrada.risk) || undefined,
      ...detalleDeLista(entrada.data),
    });
  }
  // Dedup por nombre legible: la API repite claves con alias (rtp / rtpResult).
  const vistas = new Set<string>();
  const unicas = listas.filter(l => (vistas.has(l.lista) ? false : (vistas.add(l.lista), true)));

  return {
    ok: true, sinDocumento: false, listas: unicas,
    documentoTipo,
    tipoSustituido: !!documentoTipo && !!declarado && documentoTipo !== declarado,
  };
}

/**
 * Opciones del atajo de envío a sí mismo.
 *
 * Es OPCIONAL a propósito: sin `opciones`, `screenBeneficiario` se comporta
 * exactamente como antes. Nada del camino existente cambia si el llamador no
 * pasa nada.
 */
export interface OpcionesScreening {
  /** Documento del CLIENTE que envía (sale del caso, no de Redshift). */
  dniCliente?: string;
  /** Solo informativo, para la evidencia. */
  tipoDniCliente?: string;
  /**
   * El switch del mantenedor. Si está apagado, el atajo NO se aplica y se
   * consulta al proveedor como siempre: con la automatización apagada el
   * analista necesita la evidencia para decidir a mano.
   */
  samePersonActivo?: boolean;
}

export async function screenBeneficiario(
  row: RemesaRow,
  opciones?: OpcionesScreening,
): Promise<RemesaScreening> {
  const flujo = flujoDeBeneficiario(row);
  const nombre = nombreBeneficiario(row);
  const dni = limpiar(row?.beneficiary_dni);

  // ── Atajo: envío a sí mismo ───────────────────────────────────────────────
  // Va ANTES de todo lo demás: si el beneficiario es el propio cliente, no hay
  // proveedor que consultar. Ese cliente ya pasó el onboarding.
  //
  // Solo se evalúa con el switch prendido y con un documento del cliente. Sin
  // alguna de las dos cosas, el flujo sigue de largo como siempre.
  if (opciones?.samePersonActivo && opciones?.dniCliente) {
    const sp = evaluarSamePerson({ dniCliente: opciones.dniCliente, dniBeneficiario: dni, flujo });
    if (sp.esMismaPersona) {
      return {
        estado: 'same_person', flujo, fuente: '—',
        decision: 'Envío a sí mismo',
        razon: sp.motivo,
        delitosUnicos: 0, coincidencias: [], listas: [],
        samePerson: true,
        evidenciaSamePerson: {
          documento: sp.documento,
          dniCliente: sp.dniClienteCrudo,
          dniBeneficiario: sp.dniBeneficiarioCrudo,
          tipoDniCliente: opciones.tipoDniCliente || undefined,
        },
        mensaje: 'No se consultó a ningún proveedor: el beneficiario es el mismo cliente.',
      };
    }
  }

  if (flujo === 'SIN_DATO') {
    return {
      estado: 'na', flujo, fuente: '—', decision: 'Sin revisión',
      delitosUnicos: 0, coincidencias: [], listas: [],
      mensaje: 'El beneficiario no trae nacionalidad: no se puede determinar el flujo.',
    };
  }

  try {
    if (flujo === 'CL') {
      const r = await screenChileCriminal(dni, nombre);
      return {
        estado: r.estado, flujo, fuente: 'Regcheq',
        decision: r.decision, razon: r.razon,
        delitosUnicos: r.delitosUnicos, pep: r.pep,
        coincidencias: (r.crimes ?? []).map(c => ({
          tipo: c.crimen || 'Causa penal',
          detalle: c.ruc || c.tribunal || '—',
          estado: c.estado, fecha: c.fecha, fuente: 'Regcheq',
        })) as Coincidencia[],
        // El catálogo de Chile concluye con causas penales + PEP, pero el
        // beneficiario puede coincidir en OFAC/GAFI/etc. sin tener causas: esas
        // listas se reportan igual para que el analista las vea.
        listas: (r.otrasListas ?? []).map(l => ({ clave: l.clave, lista: l.lista, riesgo: l.riesgo })),
        mensaje: r.mensaje,
      };
    }

    if (flujo === 'CO') {
      const tipo = normalizar(limpiar(row?.beneficiary_dni_type));
      const tipoDocumento = /nit/.test(tipo) ? 3 : 1;   // 3 = NIT (jurídica) · 1 = cédula
      const r = await screenColombia(nombre, dni, tipoDocumento);
      return {
        estado: r.estado === 'na' ? 'na' : r.estado, flujo, fuente: 'Inspektor',
        decision: r.decision, razon: r.razon, delitosUnicos: r.delitosUnicos,
        coincidencias: r.coincidencias, listas: [], mensaje: r.mensaje,
      };
    }

    // Internacional: ficha en Regcheq con el documento extranjero, y catálogo
    // propio. Ver `leerInternacionalRegcheq` para por qué hace falta `dniType`.
    const r = await screenRemesaInternacional(
      nombre, dni,
      limpiar(row?.beneficiary_country_name),
      limpiar(row?.beneficiary_dni_type),
    );
    return {
      estado: r.estado, flujo: 'INTL', fuente: 'Regcheq',
      decision: r.decision, razon: r.razon,
      delitosUnicos: 0, coincidencias: [], listas: r.listas,
      mensaje: r.mensaje,
      cruceInternacional: r.cruce,
    };
  } catch (e) {
    return {
      estado: 'error', flujo,
      fuente: flujo === 'CO' ? 'Inspektor' : 'Regcheq',
      decision: '—', delitosUnicos: 0, coincidencias: [], listas: [],
      mensaje: e instanceof Error ? e.message : String(e),
    };
  }
}
