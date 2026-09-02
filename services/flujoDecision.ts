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
  // Por DESTINO del beneficiario, no por país del cliente. Cada uno se prende
  // aparte porque el screening de cada destino es distinto y madura distinto:
  // Chile va por Regcheq con causas penales, Colombia por Inspektor, e INTL solo
  // consulta listas internacionales y NO concluye (ver `screenInternacional`).
  // Todos arrancan apagados: un campo ausente no puede liberar plata.
  paises: Record<string, boolean>;
  // Envío a sí mismo: si el documento del beneficiario es el mismo que el del
  // cliente, no se consulta a ningún proveedor y se libera. Ese cliente ya fue
  // validado en el onboarding.
  //
  // El switch gobierna las DOS cosas —saltear el screening y liberar—, no solo
  // la liberación: si controlara únicamente lo segundo, con el flujo apagado se
  // habría salteado igual el proveedor y el analista se quedaría sin evidencia
  // para decidir a mano. Ver `remesaSamePerson.ts`.
  samePerson: boolean;
  // Internacional sin documento del beneficiario: se libera igual.
  //
  // Regla de negocio explícita, autorizada y con el riesgo asumido: la cola de
  // remesas tiene un apetito de riesgo más amplio que OFAC porque acá se libera
  // una transacción puntual, no se vincula a un cliente. La cola está para
  // detener HALLAZGOS, no identidades incompletas.
  //
  // Qué pasa cuando está prendido: el beneficiario internacional que no trae
  // documento no se puede cruzar contra Regcheq —la API solo busca por
  // documento, no existe endpoint por nombre— así que ese caso se libera SIN
  // screening de listas. Es el segundo camino que saltea el control, junto con
  // `samePerson`, y por eso tiene switch propio y arranca apagado.
  //
  // Qué NO cambia: un error del proveedor sigue reteniendo (un fallo de API no
  // es "sin hallazgos"), cualquier coincidencia de lista retiene, el delito
  // sensible retiene siempre, y el destino INTL tiene que estar habilitado.
  intlSinDocumento: boolean;
}

// Destinos que el flujo de remesas puede tener habilitados. `INTL` no es un país:
// es "cualquier destino que no sea Chile ni Colombia".
export const DESTINOS_REMESA: { code: string; label: string }[] = [
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colombia' },
  { code: 'INTL', label: 'Internacional' },
];

// El destino del beneficiario, normalizado igual que `flujoDeBeneficiario` de
// `remesaScreeningService`. Vive acá porque la decisión lo necesita y el screening
// no puede importarse en el Lambda sin arrastrar red.
export function destinoHabilitado(flujo: string | undefined, cfg: FlujoRemesaConfig): boolean {
  const f = (flujo ?? '').toUpperCase();
  if (!f || f === 'SIN_DATO') return false;
  return cfg.paises?.[f] === true;
}

export interface FlujoConfig {
  ofac: FlujoOfacConfig;
  remesa: FlujoRemesaConfig;
  actualizadoEn?: string | null;
  actualizadoPor?: string | null;
}

// Por pedido explícito: ambos flujos arrancan APAGADOS.
export const FLUJO_CONFIG_DEFAULT: FlujoConfig = {
  ofac: {
    enabled: false,
    paises: { CL: false, CO: false },   // por pedido explícito: todos apagados
    cerrarSF: true,
    cerrarAdmin: true,
    tipoLiberarNormal: 'liberar_normal',
    tipoLiberarUcr: 'liberar_ucr',
    tipoBloquear: 'fully_blocked',
  },
  remesa: {
    enabled: false,          // por pedido explícito: arranca APAGADO
    cerrarSF: true,
    cerrarAdmin: true,
    tipoLiberar: 'liberar',
    paises: { CL: false, CO: false, INTL: false },   // todos apagados
    samePerson: false,       // por pedido explícito: arranca APAGADO
    intlSinDocumento: false, // ídem: saltear listas no se prende por defecto
  },
  actualizadoEn: null,
  actualizadoPor: null,
};

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

// ── Normalización de la config ──────────────────────────────────────────────
// Va acá, junto a la decisión, por el mismo motivo que la decisión: si cada lado
// normaliza a su manera, la decisión no puede divergir pero su INPUT sí, y el
// modo de fallo es el mismo una capa más abajo.
//
// Lo encontró la auditoría comparando app vs Lambda: con los tres `tipo*`
// ausentes, la app caía a sus defaults y el Lambda a `''`, así que el Lambda
// dejaba de liberar. La dirección era segura —liberaba de menos— pero silenciosa:
// cada caso salía `sin_conclusion`, que es un motivo legítimo, y no había forma
// de distinguirlo de "no había nada que hacer".
//
// `camposAusentes` es la respuesta a eso: quien corre desatendido puede decir en
// su resumen qué campos leyó por defecto, en vez de degradarse en silencio.
export interface ConfigNormalizada {
  cfg: FlujoConfig;
  camposAusentes: string[];
}

export function normalizarFlujoConfig(raw: Record<string, unknown> | undefined): ConfigNormalizada {
  const ofacRaw = (raw?.ofac ?? {}) as Partial<FlujoOfacConfig>;
  const remesaRaw = (raw?.remesa ?? {}) as Partial<FlujoRemesaConfig>;
  const d = FLUJO_CONFIG_DEFAULT;
  const ausentes: string[] = [];
  const marcar = (nombre: string, v: unknown) => { if (v === undefined || v === null || v === '') ausentes.push(nombre); };

  marcar('ofac.enabled', ofacRaw.enabled);
  marcar('ofac.paises', ofacRaw.paises);
  marcar('ofac.cerrarSF', ofacRaw.cerrarSF);
  marcar('ofac.cerrarAdmin', ofacRaw.cerrarAdmin);
  marcar('ofac.tipoLiberarNormal', ofacRaw.tipoLiberarNormal);
  marcar('ofac.tipoLiberarUcr', ofacRaw.tipoLiberarUcr);
  marcar('ofac.tipoBloquear', ofacRaw.tipoBloquear);
  marcar('remesa.enabled', remesaRaw.enabled);
  marcar('remesa.paises', remesaRaw.paises);
  marcar('remesa.tipoLiberar', remesaRaw.tipoLiberar);

  return {
    camposAusentes: ausentes,
    cfg: {
      ofac: {
        // `enabled` y los países SIEMPRE por defecto apagados: un campo ausente no
        // puede prender un cierre automático.
        enabled: ofacRaw.enabled === true,
        paises: Object.fromEntries(PAISES_FLUJO.map(p => [p.code, (ofacRaw.paises ?? {})[p.code] === true])),
        // Los canales y las tipologías sí caen al default, que es lo que la app ya
        // hacía: sin esto un doc viejo o recreado dejaría de funcionar.
        cerrarSF: ofacRaw.cerrarSF !== false,
        cerrarAdmin: ofacRaw.cerrarAdmin !== false,
        tipoLiberarNormal: ofacRaw.tipoLiberarNormal || d.ofac.tipoLiberarNormal,
        tipoLiberarUcr: ofacRaw.tipoLiberarUcr || d.ofac.tipoLiberarUcr,
        tipoBloquear: ofacRaw.tipoBloquear || d.ofac.tipoBloquear,
      },
      remesa: {
        enabled: remesaRaw.enabled === true,
        cerrarSF: remesaRaw.cerrarSF !== false,
        cerrarAdmin: remesaRaw.cerrarAdmin !== false,
        tipoLiberar: remesaRaw.tipoLiberar || d.remesa.tipoLiberar,
        // Igual que en OFAC: los destinos arrancan APAGADOS si el campo falta. Un
        // campo ausente no puede habilitar la liberación de una transacción.
        paises: Object.fromEntries(DESTINOS_REMESA.map(p => [p.code, (remesaRaw.paises ?? {})[p.code] === true])),
        // Mismo criterio: ausente ⇒ apagado. Saltear el control de sanciones no
        // puede quedar activado por un campo que faltaba en el documento.
        samePerson: remesaRaw.samePerson === true,
        intlSinDocumento: remesaRaw.intlSinDocumento === true,
      },
      actualizadoEn: (raw?.actualizadoEn as string | undefined) ?? null,
      actualizadoPor: (raw?.actualizadoPor as string | undefined) ?? null,
    },
  };
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

// El status DESPUÉS de cerrar un canal. Distinto de `statusDeCaso`: acá los
// CANALES mandan sobre el valor guardado.
//
// La diferencia importa y costó caro. `statusDeCaso` da prioridad al campo
// guardado y solo deriva si no está — correcto para leer. Pero al ESCRIBIR después
// de un cierre, usar esa función deja el status como estaba: con `ABIERTO` guardado
// y los dos canales cerrados, devolvía ABIERTO.
//
// Medido en producción: 54 casos con los dos canales cerrados seguían marcados
// ABIERTO, así que se quedaban en la cola y el flujo los reprocesaba en CADA
// corrida, reportándolos como "cerrado" otra vez. El conteo de cerrados estaba
// inflado y la cola no bajaba.
//
// Un caso ya CERRADO no se reabre por un cierre parcial posterior.
export function statusTrasCierre(
  cierres: { sf?: { ok?: boolean }; admin?: { ok?: boolean } } | undefined,
  statusPrevio: string | undefined,
  tieneAnalista = false,
): StatusCaso {
  const sfOk = cierres?.sf?.ok === true;
  const adminOk = cierres?.admin?.ok === true;
  const previo = (statusPrevio ?? '').toUpperCase();
  if (sfOk && adminOk) return 'CERRADO';
  if (previo === 'CERRADO') return 'CERRADO';
  if (sfOk || adminOk || tieneAnalista) return 'GESTIONANDO';
  return esStatus(previo) ? previo : 'ABIERTO';
}

// ── La decisión ─────────────────────────────────────────────────────────────
export type MotivoNoAuto =
  | 'flujo_apagado'
  | 'pais_apagado'
  | 'ya_cerrado'
  | 'asignado'
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

  // Un caso con dueño no se cierra solo. Es el caso mixto: un caso NO sensible
  // que un analista abrió para revisar hoy podía ser cerrado por el flujo
  // mientras lo miraba, y el analista perdía el trabajo sin enterarse.
  //
  // Quien lo tomó lo cierra, o lo libera y entonces el flujo lo agarra.
  if (caso.asignacion?.analistaId) return { automatizable: false, motivo: 'asignado' };

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

// ── Decisión de la cola REMESA ──────────────────────────────────────────────
// Aparte de la de OFAC a propósito: acá se libera la TRANSACCIÓN, no se toca al
// cliente, y los frenos no son los mismos.
//
// La diferencia que más importa: **PEP NO retiene la remesa.** En OFAC un cliente
// PEP no se libera solo porque lo que corresponde es el bloqueo preventivo más el
// formulario PEP. Acá se libera una transacción puntual, no se vincula a un
// cliente, así que por decisión de negocio la marca PEP del beneficiario no frena.
// Está acá abajo escrito una sola vez, igual que el resto: si el Lambda lo
// reimplementara, ese matiz es justo el que se perdería.

// EN QUÉ COLA VA UN CASO. El asunto es lo que manda y las colas no se mezclan:
// es una regla de negocio explícita, no una heurística de presentación. Vive acá
// porque el flujo desatendido tiene que separar las dos colas igual que la app —
// si clasificara distinto, un caso de remesa podría entrar al flujo de OFAC y
// cerrarse con la tipología equivocada.
export type ColaCaso = 'ofac' | 'remesa' | 'otros';

export function clasificarCola(asunto: string | undefined): ColaCaso {
  const a = (asunto || '').trim();
  if (a.toLowerCase() === 'coincidencia ofac') return 'ofac';
  if (/DETIENE\s+TX/i.test(a)) return 'remesa';
  return 'otros';
}

// El número de transacción sale del ASUNTO del caso. Vive acá porque el flujo
// desatendido necesita exactamente la misma extracción: si cambia el formato del
// asunto y esto está escrito en dos lados, uno de los dos deja de encontrar la TX
// y los casos se quedan sin liberar sin motivo visible.
export function extraerRemesa(asunto: string | undefined): string {
  const m = (asunto || '').match(/TX\s*(\d+)/i);
  return m ? m[1] : '';
}

export type MotivoNoAutoRemesa =
  | 'flujo_apagado'
  | 'destino_apagado'
  | 'ya_cerrado'
  | 'asignado'
  | 'sin_screening'
  | 'sin_nacionalidad'
  | 'identidad_insuficiente'
  | 'delito_sensible'
  | 'con_coincidencias'
  | 'same_person_apagado';

export interface EvaluacionRemesa {
  automatizable: boolean;
  motivo?: MotivoNoAutoRemesa;
  tipologia?: string;
  categorias?: string[];
}

// Forma mínima del screening del beneficiario que necesita la decisión.
export interface ScreeningRemesaParaAuto {
  estado?: string;    // ok | sin_causas | error | na | same_person
  flujo?: string;     // CL | CO | INTL | SIN_DATO
  decision?: string;
  pep?: boolean;      // se ignora a propósito (ver arriba)
  coincidencias?: Array<{ tipo?: string; detalle?: string }>;
  listas?: Array<{ lista?: string }>;
  // Envío a sí mismo: el beneficiario ES el cliente. Cuando viene en true no se
  // consultó a ningún proveedor — el atajo ocurrió ANTES del screening.
  samePerson?: boolean;
}

export function evaluarRemesaAuto(
  caso: CasoSF,
  screening: ScreeningRemesaParaAuto | undefined,
  cfg: FlujoRemesaConfig,
): EvaluacionRemesa {
  if (!cfg.enabled) return { automatizable: false, motivo: 'flujo_apagado' };
  if (statusDeCaso(caso) === 'CERRADO') return { automatizable: false, motivo: 'ya_cerrado' };

  // Destino apagado en el mantenedor. Va ANTES del screening porque no tiene
  // sentido evaluar hallazgos de un destino que nadie habilitó — y porque así el
  // motivo dice la verdad: no se liberó por configuración, no por el beneficiario.
  if (!destinoHabilitado(screening?.flujo, cfg)) {
    return { automatizable: false, motivo: 'destino_apagado' };
  }
  // Igual que en OFAC: un caso con dueño lo trabaja su dueño.
  if (caso.asignacion?.analistaId) return { automatizable: false, motivo: 'asignado' };

  // ── Envío a sí mismo ──────────────────────────────────────────────────────
  // El beneficiario es el mismo cliente, ya validado en el onboarding. No se
  // consultó a ningún proveedor y no hace falta: se libera.
  //
  // Va DESPUÉS de los frenos de configuración y asignación —el atajo no puede
  // pasar por encima de un destino apagado ni de un caso con dueño— y ANTES de
  // los chequeos de hallazgos, que acá no aplican porque no hay screening que
  // mirar.
  //
  // El `cfg.samePerson` se vuelve a exigir aunque el screening ya lo respetó:
  // si alguien apagó el switch entre la corrida del screening y esta
  // evaluación, un resultado cacheado no puede seguir liberando.
  if (screening?.samePerson === true) {
    return cfg.samePerson
      ? { automatizable: true, tipologia: cfg.tipoLiberar }
      : { automatizable: false, motivo: 'same_person_apagado' };
  }

  // Sin screening resuelto no se libera nada. Incluye el caso en que el proveedor
  // devolvió error: un fallo de la API NO puede leerse como "sin hallazgos".
  if (!screening || screening.estado === 'error' || screening.estado === 'loading') {
    return { automatizable: false, motivo: 'sin_screening' };
  }
  if (screening.flujo === 'SIN_DATO') {
    return { automatizable: false, motivo: 'sin_nacionalidad' };
  }
  // `na` = no se pudo screenear. En internacional eso significa que el
  // beneficiario no trae documento (Regcheq solo busca por documento), en el
  // resto que no trae nacionalidad y no hay proveedor que elegir.
  //
  // Con `intlSinDocumento` prendido, el internacional sin documento NO retiene:
  // sigue de largo a los chequeos de hallazgos de abajo, que con las listas
  // vacías lo liberan. Es la regla autorizada —la cola detiene hallazgos, no
  // identidades incompletas— y por eso el switch es lo único que la habilita.
  //
  // "Sin nacionalidad" queda afuera del atajo a propósito: sin destino no se
  // puede saber qué switch del mantenedor aplica, así que no hay autorización
  // que consultar. Sigue reteniendo.
  if (screening.estado === 'na') {
    const intlSinDoc = screening.flujo === 'INTL';
    if (!intlSinDoc || !cfg.intlSinDocumento) {
      return {
        automatizable: false,
        motivo: intlSinDoc ? 'identidad_insuficiente' : 'sin_nacionalidad',
      };
    }
  }

  // Freno duro por delito sensible, antes de mirar cualquier conclusión.
  const categorias = categoriasSensibles(screening.coincidencias);
  if (categorias.length > 0) return { automatizable: false, motivo: 'delito_sensible', categorias };

  // OJO: acá NO va el freno por PEP. Es deliberado (ver arriba).

  // Cualquier otra coincidencia —causa penal no sensible o lista internacional—
  // la revisa el analista.
  if ((screening.coincidencias?.length ?? 0) > 0) return { automatizable: false, motivo: 'con_coincidencias' };
  if ((screening.listas?.length ?? 0) > 0) return { automatizable: false, motivo: 'con_coincidencias' };

  return { automatizable: true, tipologia: cfg.tipoLiberar };
}

export const retenidoPorDelitoRemesa = (s: ScreeningRemesaParaAuto | undefined): string[] =>
  categoriasSensibles(s?.coincidencias);

export const motivoRemesaLegible = (m: MotivoNoAutoRemesa | undefined): string => ({
  flujo_apagado: 'Flujo automático apagado',
  destino_apagado: 'El destino del beneficiario está apagado en el mantenedor',
  ya_cerrado: 'El caso ya está cerrado',
  asignado: 'Lo tiene un analista asignado',
  sin_screening: 'Sin screening resuelto (o el proveedor falló)',
  sin_nacionalidad: 'El beneficiario no trae nacionalidad',
  identidad_insuficiente: 'Sin documento del beneficiario: homonimia no descartable',
  delito_sensible: 'Retenido por delito sensible',
  con_coincidencias: 'Tiene coincidencias: lo revisa el analista',
  same_person_apagado: 'Es un envío a sí mismo, pero la liberación automática same person está apagada',
}[m ?? 'sin_screening'] ?? '—');
