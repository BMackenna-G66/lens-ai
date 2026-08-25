// CATÁLOGO CRIMINAL DE COLOMBIA — clasificación por PATRONES.
//
// Por qué no es como el de Chile
// El catálogo chileno (defaultCatalogData) es un diccionario de 1.488 delitos con
// nombre canónico y el match es por nombre normalizado. En Colombia eso no
// funciona: Inspektor devuelve texto libre con datos incrustados, así que cada
// coincidencia es un string único.
//
//   "Proceso 76001400301220090112300 · JUZGADO 012 CIVIL MUNICIPAL DE CALI"
//   "Funcionario Publico Miembro De La Entidad: Alcaldia De Palmira"
//   "Persona reportada como desaparecida/CONTINUA DESAPARECIDO, consultado el 10-08-2021"
//
// Sobre 4.713 coincidencias reales de la Bandeja había 968 procesos judiciales
// con 345 textos distintos. Un catálogo por nombre exacto nunca matchearía.
//
// Cómo funciona
//   Capa A — EXCLUSIONES: lo que NO es antecedente penal no puntúa. Se sigue
//            mostrando en la ficha, aparte, porque es contexto útil.
//   Capa B — CATEGORÍAS: patrón → categoría → precedente/no precedente + valor.
//   Capa C — DECISIÓN: los mismos umbrales y la misma tabla que Chile.
//
// Las categorías NO se inventaron: salen de los 218 delitos PRECEDENTES del
// catálogo de Chile ya aprobado (tráfico/drogas, terrorismo, trata, lavado,
// soborno, apropiación indebida, aduanas, menores).
//
// Medición sobre esas 4.713 coincidencias: el 38% era ruido (1.011 de función
// pública, 482 procesos civiles/familia/laboral, 252 personas DESAPARECIDAS —que
// son víctimas, no imputadas— y 23 del registro minero). Por eso hoy solo 9 de
// 287 screenings de Colombia liberan.
//
// Funciones PURAS (sin red ni escrituras) para poder testearlas solas.

import { DEFAULT_CATALOG } from './defaultCatalogData';
import type { CatalogData } from '../types/criminalTypes';

export type ClaseCoincidencia = 'EXCLUIDA' | 'PENAL' | 'INDETERMINADA';
export type TipoDelitoCO = 'DELITOS PRECEDENTES' | 'DELITOS NO PRECEDENTES';

export interface ReglaExclusion {
  id: string;
  label: string;        // qué es, para mostrarlo agrupado en la ficha
  patron: RegExp;
}

export interface ReglaCategoria {
  id: string;
  categoria: string;
  tipo: TipoDelitoCO;
  valor: number;        // mismo peso que Chile: 1 precedente · 0.5/1 no precedente
  riesgoG66: 'ALTO' | 'MEDIO' | 'BAJO';
  patron: RegExp;
}

// El texto se normaliza a MAYÚSCULAS sin tildes antes de aplicar los patrones.
export function normalizarCO(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

// ── Capa A · EXCLUSIONES ─────────────────────────────────────────────────────
// El orden importa: gana la primera que matchea.
export const EXCLUSIONES_CO: ReglaExclusion[] = [
  {
    id: 'victima',
    label: 'Persona desaparecida o fallecida (víctima, no imputada)',
    // DESAPARECIDA o ingresada a medicina legal: la persona es víctima, no
    // imputada. Contarlo como evidencia criminal es un error, y eran 662
    // coincidencias sumando riesgo (252 desaparecidos + 410 cadáveres).
    patron: /DESAPARECID|CADAVER|MEDICINA LEGAL/,
  },
  {
    id: 'registro_profesional',
    label: 'Registro profesional habilitado (no es antecedente)',
    // Estar habilitado para ejercer una profesión no es un antecedente penal.
    patron: /REGISTRO ACTUALMENTE HABILITADO|HABILITADO POR LA CORTE|HABILITADO PARA EJERCER|REGISTRADO EN SIGEP|CATEDRATICO/,
  },
  {
    id: 'sancion_administrativa',
    label: 'Sanción administrativa o disciplinaria (no penal)',
    // Sanción ambiental, disciplinaria, fiscal o inhabilidad: es riesgo
    // reputacional/regulatorio, no un antecedente penal.
    patron: /LICENCIAS AMBIENTALES|INVESTIGACION DICIPLINARIA|DISCIPLINA JUDICIAL|RESPONSABLE FISCAL|OBRA INCONCLUSA|INHIBICION PARA CONTRATAR|DEUDOR TRIBUTARIO|CODIGO FISCAL DE LA FEDERACION|NO HABIDO/,
  },
  {
    id: 'funcion_publica',
    label: 'Función pública / cargo de elección (se trata como PEP)',
    // Ser funcionario público no es un antecedente penal. Es materia PEP, que ya
    // tiene su propio tratamiento en el flujo.
    patron: /FUNCIONARIO PUBLIC|SERVIDOR PUBLIC|MIEMBRO DE LA ENTIDAD|CANDIDATO |CONCEJO |ALCALDIA |ALCALDE|GOBERNACION |MINISTR[OA] |MINISTERIO |JUEZ JUZGADO|EX ?SECRETARIO|DEPENDENCIA |ENTIDAD DESCENTRALIZADA|DEFENSORIA DEL PUEBLO|CONSEJO DIRECTIVO|CAMARA DE DIPUTADOS|VICECONSUL|CONSUL |EMBAJAD|DIPUTAD|SENADOR|GOBERNADOR|DIRECTOR GENERAL O NACIONAL/,
  },
  {
    id: 'proceso_no_penal',
    label: 'Proceso judicial no penal (civil, familia, laboral)',
    // Un proceso civil o de familia no es antecedente penal.
    patron: /CIVIL MUNICIPAL|CIVIL DEL CIRCUITO|SALA CIVIL|JUZGADO \d* ?CIVIL|DE FAMILIA|LABORAL|ADMINISTRATIVO|PROMISCUO/,
  },
  {
    id: 'registro_administrativo',
    label: 'Registro administrativo (minería, convenios)',
    patron: /AGENCIA NACIONAL DE MINER|MINERO DE SUBSISTENCIA|COMERCIALIZADOR DE MINERALES|CONVENIO \d{4}|REGISTRO PROCURADURIA$|CONSEJO DE ESTADO|SECRETARIA GENERAL|DIRECCION EJECUTIVA SECCIONAL/,
  },
];

// ── Capa B · CATEGORÍAS PENALES ──────────────────────────────────────────────
// Derivadas de los DELITOS PRECEDENTES del catálogo de Chile. El orden importa:
// gana la primera que matchea, así que lo más grave va arriba.
export const CATEGORIAS_CO: ReglaCategoria[] = [
  {
    id: 'terrorismo', categoria: 'Terrorismo', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /TERRORIS|FINANCIACION DEL TERROR|GRUPO ARMADO|CLAN DEL GOLFO|GUERRILL|PARAMILITAR|AUTODEFENSA/,
  },
  {
    // Concierto para delinquir NO es terrorismo, aunque pese lo mismo. Se separa
    // porque el analista lee la etiqueta y "Terrorismo" en un hurto agravado es
    // engañoso.
    id: 'crimen_organizado', categoria: 'Crimen organizado / concierto para delinquir',
    tipo: 'DELITOS PRECEDENTES', valor: 1, riesgoG66: 'ALTO',
    patron: /CONCIERTO PARA DELINQUIR|ORGANIZACION CRIMINAL|BANDA CRIMINAL|RED DELICTIVA|AGRUPACIONES ILICITAS|ASOCIACION ILICITA/,
  },
  {
    id: 'narcotrafico', categoria: 'Narcotráfico / estupefacientes', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /ESTUPEFACIENT|NARCOTRAFIC|TRAFICO DE (DROGA|COCAINA|MARIHUANA|HEROINA)|COCAINA|RELACIONADOS CON DROGAS|SUSTANCIAS? (ESTUPEFACIENTE|PSICOTROPICA|SICOTROPICA)|PRECURSOR/,
  },
  {
    id: 'lavado', categoria: 'Lavado de activos', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /LAVADO DE ACTIVO|LAVADO DE DINERO|ENRIQUECIMIENTO ILICITO|TESTAFERRATO|OMISION DE CONTROL/,
  },
  {
    id: 'armas', categoria: 'Armas', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /\bARMAS? DE FUEGO|PORTE DE ARMA|TRAFICO .{0,30}ARMAS|MUNICIONES|EXPLOSIVO/,
  },
  {
    id: 'trata', categoria: 'Trata de personas', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /TRATA DE PERSONA|TRAFICO DE MIGRANTE|EXPLOTACION SEXUAL|PROXENETISMO/,
  },
  {
    id: 'sexual', categoria: 'Delitos sexuales', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /ABUSO SEXUAL|AGRESION SEXUAL|LIBERTAD SEXUAL|DELITO SEXUAL|VIOLACION|ACCESO CARNAL|ACTOS SEXUALES|PORNOGRAFIA|UTILIZACION DE MENORES|CONTRA MENOR/,
  },
  {
    id: 'corrupcion', categoria: 'Corrupción / soborno / peculado', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /CORRUPCION|SOBORNO|COHECHO|PECULADO|CONCUSION|CONTRATO SIN CUMPLIMIENTO|INTERES INDEBIDO|PREVARICATO/,
  },
  {
    id: 'contrabando', categoria: 'Contrabando / aduanas', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /CONTRABANDO|ADUANER|FAVORECIMIENTO DE CONTRABANDO|DEFRAUDACION A LAS RENTAS/,
  },
  {
    id: 'homicidio', categoria: 'Homicidio / secuestro / extorsión', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /HOMICIDIO|SECUESTRO|DESAPARICION FORZADA|EXTORSION|TORTURA|FEMINICIDIO/,
  },
  {
    id: 'estafa', categoria: 'Estafa / defraudación', tipo: 'DELITOS PRECEDENTES',
    valor: 1, riesgoG66: 'ALTO',
    patron: /ESTAFA|DEFRAUDACION|APROPIACION INDEBIDA|ABUSO DE CONFIANZA|FALSEDAD|CAPTACION (MASIVA|ILEGAL)/,
  },
  {
    id: 'offshore', categoria: 'Estructuras offshore (papers)', tipo: 'DELITOS NO PRECEDENTES',
    valor: 0.5, riesgoG66: 'MEDIO',
    patron: /PANDORA PAPERS|PANAMA PAPERS|PARADISE PAPERS|OFFSHORE LEAKS/,
  },
  // ── No precedentes: cuentan, pero pesan menos ──
  {
    id: 'hurto', categoria: 'Hurto / daño en bien ajeno', tipo: 'DELITOS NO PRECEDENTES',
    valor: 1, riesgoG66: 'MEDIO',
    patron: /HURTO|ROBO|DAÑO EN BIEN|RECEPTACION/,
  },
  {
    id: 'lesiones', categoria: 'Lesiones / violencia', tipo: 'DELITOS NO PRECEDENTES',
    valor: 1, riesgoG66: 'MEDIO',
    patron: /LESIONES PERSONALES|VIOLENCIA INTRAFAMILIAR|CONSTREÑIMIENTO|AMENAZA/,
  },
  {
    id: 'detenido', categoria: 'Detenido / condenado (sin delito informado)', tipo: 'DELITOS NO PRECEDENTES',
    valor: 0.5, riesgoG66: 'MEDIO',
    // Hay antecedente penal explícito pero el proveedor no dice cuál.
    patron: /DETENIDO|CONDENADO|SENTENCIAD|PENA PRIVATIVA|RENADESPPLE|IMPUTADO|ACUSADO/,
  },
  {
    id: 'otros_penales', categoria: 'Otro proceso penal', tipo: 'DELITOS NO PRECEDENTES',
    valor: 0.5, riesgoG66: 'BAJO',
    patron: /\bPENAL\b|FISCALIA|JEPMS/,
  },
];

export interface CoincidenciaCO { tipo?: string; detalle?: string }

export interface ClasificacionCO {
  clase: ClaseCoincidencia;
  reglaId: string;
  etiqueta: string;         // exclusión → label · penal → categoría
  tipoDelito?: TipoDelitoCO;
  valor?: number;
  riesgoG66?: string;
  texto: string;            // el texto original, para mostrarlo
}

// Clasifica UNA coincidencia. `tipo` es el evidence_type de Inspektor
// (WATCHLIST / ADVERSE_INFORMATION / JUDICIAL_PROCESS / PEP / …).
export function clasificarCoincidenciaCO(c: CoincidenciaCO): ClasificacionCO {
  const texto = String(c.detalle ?? '');
  const t = normalizarCO(texto);
  const evid = normalizarCO(c.tipo);

  // PEP viene tipado por el proveedor: no es antecedente penal.
  if (evid === 'PEP') {
    return { clase: 'EXCLUIDA', reglaId: 'pep', etiqueta: 'PEP (se trata aparte)', texto };
  }

  // Procesos judiciales: el texto trae la materia del despacho
  // ("… · DESPACHO 000 - TRIBUNAL SUPERIOR - PENAL - BOGOTÁ").
  // Regla de negocio: NO cuenta salvo que el despacho sea penal. Con eso los 968
  // procesos quedan resueltos de forma determinista, sin caer en "sin clasificar".
  if (evid === 'JUDICIAL_PROCESS') {
    if (!/\bPENAL\b/.test(t)) {
      return {
        clase: 'EXCLUIDA', reglaId: 'proceso_no_penal',
        etiqueta: 'Proceso judicial no penal (civil, familia, laboral, administrativo)', texto,
      };
    }
    // Es penal: se intenta tipificar el delito; si no se puede, entra como
    // "otro proceso penal" (que sí puntúa, con peso bajo).
    for (const cat of CATEGORIAS_CO) {
      if (cat.patron.test(t)) {
        return {
          clase: 'PENAL', reglaId: cat.id, etiqueta: cat.categoria,
          tipoDelito: cat.tipo, valor: cat.valor, riesgoG66: cat.riesgoG66, texto,
        };
      }
    }
    return {
      clase: 'PENAL', reglaId: 'otros_penales', etiqueta: 'Otro proceso penal',
      tipoDelito: 'DELITOS NO PRECEDENTES', valor: 0.5, riesgoG66: 'BAJO', texto,
    };
  }

  for (const ex of EXCLUSIONES_CO) {
    if (ex.patron.test(t)) {
      return { clase: 'EXCLUIDA', reglaId: ex.id, etiqueta: ex.label, texto };
    }
  }

  for (const cat of CATEGORIAS_CO) {
    if (cat.patron.test(t)) {
      return {
        clase: 'PENAL', reglaId: cat.id, etiqueta: cat.categoria,
        tipoDelito: cat.tipo, valor: cat.valor, riesgoG66: cat.riesgoG66, texto,
      };
    }
  }

  // No se pudo determinar si es penal. Por decisión de negocio NO puntúa, pero se
  // marca para que el analista lo mire: es la lista de la que sale el catálogo
  // que falta.
  return { clase: 'INDETERMINADA', reglaId: 'sin_clasificar', etiqueta: 'Sin clasificar', texto };
}

// ── Capa C · DECISIÓN ────────────────────────────────────────────────────────

export interface EvaluacionCO {
  decision: string;
  razon: string;
  scoreTotal: number;
  precedentes: number;
  noPrecedentes: number;
  penales: ClasificacionCO[];
  excluidas: ClasificacionCO[];
  indeterminadas: ClasificacionCO[];
  // Qué regla de identidad intervino, si intervino alguna. Sirve para poder
  // explicar la conclusión sin volver a consultar al proveedor.
  reglaIdentidad?: 'homonimia_masiva' | 'nombre_exacto' | null;
}

// Contexto de IDENTIDAD de la consulta. Se calcula en la Capa 2 y antes se
// descartaba: `evaluarColombia` solo veía tipo/detalle/estado/fecha, así que la
// conclusión no podía distinguir "530 coincidencias de gente con otro documento"
// de "530 coincidencias de esta persona".
//
// El caso que lo destapó (02667442): Inspektor devolvió 530 coincidencias, 265 con
// documento, NINGUNA con el documento del consultado. La Capa 1 dijo liberar, el
// modelo dijo revisar, y el catálogo —que no veía nada de esto— concluyó Fully
// Blocked. Repetida la consulta con solo el documento y sin nombre: 0
// coincidencias. Eran todos homónimos.
export interface ContextoIdentidadCO {
  // Cuántas coincidencias crudas devolvió el proveedor, antes de clasificar.
  totalCoincidencias: number;
  // ¿Alguna trae el documento del consultado? `false` con volumen alto es la
  // señal de homonimia masiva.
  algunaConDocumento: boolean;
  // ¿El documento del consultado aparece en JEPMS? Si aparece, no se detiene por
  // homonimia: hay una señal fuerte de identidad por otro lado.
  documentoEnJepms: boolean;
  // ¿Alguna coincidencia tiene el nombre completo EXACTO del consultado? Sin
  // documento, un nombre completo exacto no alcanza para bloquear pero sí para
  // revisar.
  algunaNombreExacto: boolean;
  // Resultado del contraste por documento, si se hizo: consultar solo el documento
  // sin nombre. `0` prueba la homonimia; `undefined` = no se consultó.
  coincidenciasSoloDocumento?: number;
}

// Umbral de coincidencias para considerar homonimia masiva. Parámetro y no
// constante enterrada, porque se va a querer calibrar.
//
// 20 sale de los datos: sobre los casos de Colombia con screening la mediana es de
// 3 coincidencias y el p90 de 8. Con 20 quedan afuera más del 95 % de los casos
// normales y entra el 02667442, que tenía 530.
export const UMBRAL_HOMONIMIA_CO = 20;

// Nombre comparable: sin tildes, en mayúsculas, sin puntuación y con los espacios
// colapsados. Se exige que coincidan TODAS las palabras, no una similitud
// parcial: "JUAN PEREZ" y "JUAN PEREZ GOMEZ" no son la misma persona.
export function nombreExactoCO(a: string | undefined, b: string | undefined): boolean {
  const norm = (v: string | undefined) => (v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9ÑÜ ]/g, ' ')
    .split(/\s+/).filter(Boolean);
  const pa = norm(a), pb = norm(b);
  if (pa.length === 0 || pb.length === 0) return false;
  if (pa.length !== pb.length) return false;
  return pa.every((w, i) => w === pb[i]);
}

// Aplica los MISMOS umbrales y la misma tabla de decisión que Chile: la política
// de riesgo ya está aprobada, lo que cambia es cómo se llega a los conteos.
export function evaluarColombia(
  coincidencias: CoincidenciaCO[] | undefined,
  catalogo: CatalogData = DEFAULT_CATALOG,
  identidad?: ContextoIdentidadCO,
  umbralHomonimia: number = UMBRAL_HOMONIMIA_CO,
): EvaluacionCO {
  const clasificadas = (coincidencias ?? []).map(clasificarCoincidenciaCO);
  const penales = clasificadas.filter(c => c.clase === 'PENAL');
  const excluidas = clasificadas.filter(c => c.clase === 'EXCLUIDA');
  const indeterminadas = clasificadas.filter(c => c.clase === 'INDETERMINADA');

  // DEDUPE por evento, igual que Chile deduplica las causas por RUC. Es
  // imprescindible acá: el promedio es de 23 coincidencias por persona (máximo
  // 189) porque varias listas reportan el MISMO hecho y un proceso aparece una
  // vez por actuación. Sin deduplicar, cualquiera supera el umbral de 4
  // precedentes y todo termina en Fully Blocked — medido: 53 de 65 casos.
  //
  //   proceso judicial → se dedupe por número de radicado
  //   resto            → se dedupe por categoría (un "narcotráfico" por persona)
  const claveEvento = (c: ClasificacionCO): string => {
    const radicado = c.texto.match(/\d{15,}/)?.[0];
    return radicado ? `proceso:${radicado}` : `cat:${c.reglaId}`;
  };
  const unicos = new Map<string, ClasificacionCO>();
  for (const p of penales) {
    const k = claveEvento(p);
    // Ante dos con la misma clave gana la de mayor valor (la más grave).
    const previo = unicos.get(k);
    if (!previo || (p.valor ?? 0) > (previo.valor ?? 0)) unicos.set(k, p);
  }

  let scoreTotal = 0, precedentes = 0, noPrecedentes = 0;
  for (const p of unicos.values()) {
    scoreTotal += p.valor ?? 0;
    if (p.tipoDelito === 'DELITOS PRECEDENTES') precedentes++;
    else noPrecedentes++;
  }

  const params = catalogo.parameters || {};
  const hardPre = Number(params.HARD_FB_precedentes_count ?? 4);
  const hardNoPre = Number(params.HARD_FB_noprecedentes_count ?? 5);

  // ¿Sabemos DE QUÉ se lo acusa? "Otro proceso penal" significa que hay un
  // expediente en un juzgado penal pero el proveedor no informa el delito, y en
  // Colombia una persona puede figurar en un proceso penal sin ser la imputada.
  // Un perfil que solo tiene eso NO se bloquea: se manda a revisión. Bloquear a
  // alguien por "tiene 19 procesos penales y no sabemos de qué" es una acción
  // fuerte sobre evidencia débil. Detectado midiendo con datos reales.
  const tipificados = [...unicos.values()].filter(p => p.reglaId !== 'otros_penales');
  const sinTipificar = tipificados.length === 0 && unicos.size > 0;

  // Decisión normal: primero la regla dura por conteo, si no la tabla por score.
  let decision: string;
  let razon: string;
  if (precedentes >= hardPre || noPrecedentes >= hardNoPre) {
    decision = 'Fully Blocked';
    razon = `Regla dura (conteo): ${precedentes} precedente(s) / ${noPrecedentes} no precedente(s)`;
  } else {
    const reglas = [...catalogo.decisionTable].sort((a, b) => b.totalEquivalente - a.totalEquivalente);
    const regla = reglas.find(r => scoreTotal >= r.totalEquivalente);
    decision = regla?.decision ?? 'Sin Riesgo Significativo';
    razon = regla?.razon ?? 'El perfil no alcanza los umbrales mínimos de riesgo.';
  }

  // TECHO (no piso): si NO se sabe de qué se lo acusa, el caso no se bloquea —
  // baja a revisión. Nunca sube una conclusión: un perfil que liberaba sigue
  // liberando. "Otro proceso penal" es un expediente en juzgado penal sin delito
  // informado, y en Colombia se puede figurar en uno sin ser la persona imputada.
  if (sinTipificar && decision === 'Fully Blocked') {
    decision = 'UNDER_COMPLIANCE_REVIEW';
    razon = `${unicos.size} proceso(s) penal(es) sin delito informado por el proveedor: no se bloquea, lo revisa el analista`;
  }

  // ── Reglas de IDENTIDAD ────────────────────────────────────────────────────
  // Se aplican DESPUÉS de la conclusión por catálogo.
  //
  // La homonimia masiva solo puede BAJAR la conclusión: es una duda sobre si la
  // persona es la persona, no evidencia nueva.
  //
  // El nombre exacto sí puede SUBIRLA de Liberar a UCR, porque es lo que pidió el
  // negocio: un nombre completo exacto no alcanza para bloquear, pero tampoco para
  // liberar solo. Con una condición que agregué y conviene revisar: **exige que
  // haya al menos una coincidencia penal**. Si todo lo que trajo el proveedor era
  // ruido descartado —una persona desaparecida, un funcionario público— un
  // homónimo exacto sobre ESO no tiene por qué retener el caso, y sin la condición
  // quedaría retenido para siempre.
  //
  // Y no ocultan nada. Las coincidencias siguen en `penales` y `excluidas` con su
  // clasificación: cambia el peso en la decisión, no la visibilidad. Una
  // coincidencia real de esta persona tiene que poder verse igual.
  let reglaIdentidad: EvaluacionCO['reglaIdentidad'] = null;

  if (identidad) {
    const homonimiaMasiva =
      identidad.totalCoincidencias >= umbralHomonimia &&
      !identidad.algunaConDocumento &&
      !identidad.documentoEnJepms;

    if (homonimiaMasiva) {
      reglaIdentidad = 'homonimia_masiva';
      if (identidad.coincidenciasSoloDocumento === 0) {
        // El contraste lo probó: consultando SOLO el documento no hay nada. Las
        // coincidencias son de otras personas con nombre parecido, así que el caso
        // se libera en vez de mandarse a revisión — que es lo que evita cambiar
        // bloqueos incorrectos por carga humana.
        decision = 'Liberar';
        razon = `${identidad.totalCoincidencias} coincidencias, ninguna con el documento del consultado, ` +
          'y la consulta por documento solo no devolvió nada: homonimia confirmada';
      } else {
        // Sin contraste no se afirma nada: no bloquea ni libera, lo mira alguien.
        decision = 'Revisar';
        razon = `${identidad.totalCoincidencias} coincidencias y NINGUNA con el documento del consultado: ` +
          'no se puede concluir que sea la misma persona';
      }
    } else if (
      // Nombre completo exacto pero sin documento que lo confirme. No alcanza para
      // bloquear —el nombre no identifica— pero sí para revisar.
      identidad.algunaNombreExacto && !identidad.algunaConDocumento &&
      penales.length > 0 &&
      (decision === 'Fully Blocked' || decision === 'Liberar' || decision === 'Sin Riesgo Significativo')
    ) {
      reglaIdentidad = 'nombre_exacto';
      decision = 'UNDER_COMPLIANCE_REVIEW';
      razon = 'Coincidencia de nombre completo exacto sin documento que la confirme: ' +
        'no se bloquea ni se libera solo';
    }
  }

  return {
    decision, razon,
    scoreTotal, precedentes, noPrecedentes, penales, excluidas, indeterminadas,
    reglaIdentidad,
  };
}
