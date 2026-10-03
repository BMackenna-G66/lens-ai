// REVISIÓN WEB — los tipos del screening de contrapartes.
//
// Módulo AISLADO del análisis de documentos, por regla de Benjamín:
//   · no importa nada del pipeline de documentos (fileProcessorService,
//     constants, las funciones de documentos de geminiService, la ficha), y el
//     de documentos no importa nada de acá;
//   · no usa, no importa ni invoca nada que lea o guarde en S3 o AWS: ni el
//     relay, ni EmpresaDocs, ni colasLogService, ni lensPersistenciaService, ni
//     la API, ni ningún Lambda. Los sitios los lee el Worker `lens-lector-web`,
//     que no tiene secretos ni bindings.
// Lo único compartido con el Analizador es dónde vive el botón en la UI.
//
// Especificación: «Procedimiento — Verificación de legitimidad de contrapartes»
// v1.0 (01-10-2026), fase SCREENING. Los § de los comentarios son de ese
// documento. El EXPEDIENTE queda fuera.

export type UsoPrevisto = 'cliente_b2b' | 'proveedor_pagos' | 'integracion' | 'link_reportado';
export type Jurisdiccion = 'CL' | 'CO' | 'OTRA' | '';
export type RiesgoInherente = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type Severidad = 'CRITICO' | 'MAYOR' | 'MENOR' | 'INFO';
export type Decision =
  | 'ONBOARDING_APPROVED'
  | 'ONBOARDING_CONDITIONAL'
  | 'ONBOARDING_ON_HOLD'
  | 'ONBOARDING_REJECTED';

/** §4: los factores del riesgo inherente. Dependen del SERVICIO, no del sitio. */
export interface FactoresPaso0 {
  fondos: boolean;            // +3 toca o custodia fondos de clientes
  mercadoVigilado: boolean;   // +2 opera donde Global66 es vigilada (CL / CO)
  datosPersonales: boolean;   // +2 trata datos personales o documentación KYC
  accesoSistemas: boolean;    // +2 acceso a sistemas, producción o credenciales
  caraCliente: boolean;       // +1 es cara al cliente final
  sustituible: boolean;       // −1 sustituible con bajo costo de salida
}

/** §3: lo que carga el analista. Nada sale de la ficha. */
export interface Entrada {
  url: string;
  uso: UsoPrevisto;
  jurisdiccion: Jurisdiccion;
  factores: FactoresPaso0;
}

// ── Ronda A ────────────────────────────────────────────────────────────────

export type Slot = 'inicio' | 'terminos' | 'privacidad' | 'nosotros';

/** Lo que devuelve el Worker por URL. */
export interface LecturaWorker {
  pedida: string;
  ok: boolean;
  status: number | null;
  urlFinal: string | null;
  redirecciones: { url: string; status: number; destino: string }[];
  contentType: string | null;
  headers: Record<string, string>;
  html: string | null;
  bytes: number;
  truncado: boolean;
  ms: number;
  error: string | null;
}

/** Una de las 4 lecturas de §5: la página que ocupó el lugar, o por qué no hubo. */
export interface Pagina {
  slot: Slot;
  url: string | null;
  lectura: LecturaWorker | null;
  intentadas: string[];
}

export interface Campo { tipo: string; nombre: string; etiqueta: string }
export interface Formulario { action: string; method: string; campos: Campo[]; pagina: Slot }

/** Ronda A, una sola llamada de extracción con esquema PLANO. El modelo solo
 *  copia lo que está escrito; toda evaluación es de código. */
export interface Extraccion {
  razonSocial: string;
  nombreComercial: string;
  tipoSocietario: string;
  identificador: string;
  tipoIdentificador: string;          // RUT | NIT | otro | ''
  correos: string[];
  telefonos: string[];
  direcciones: string[];
  jurisdiccionTextosLegales: string;
  mercadosDeclarados: string[];
  serviciosRegulados: string[];       // pagos | remesas | inversion | credito | factoring | cripto | seguros
  declaraVentaEnLinea: boolean;
  declaraTrayectoria: boolean;
  anioFundacion: string;
  dotacion: string;
  titularCuentaPago: string;
  identificadorTitularCuentaPago: string;
  mediosPagoSolicitados: string[];    // transferencia | tarjeta | cripto | tarjeta_regalo | efectivo | otro
  credencialesRegulatorias: string[];
}

// ── Ronda B ────────────────────────────────────────────────────────────────

export interface Consulta { prioridad: 1 | 2 | 3 | 4 | 5; consulta: string; motivo: string }

export interface ResultadoWeb {
  titulo: string;
  url: string;
  dominio: string;
  extracto: string;
  mencionaIdentificador: boolean;
  mencionaNombre: boolean;
  esAlertaRegulador: boolean;
  esAutorizacionRegulador: boolean;
  esReclamo: boolean;
  /** El dominio está entre las fuentes REALES que devolvió la búsqueda
   *  (grounding). Sin esto el resultado no puntúa: §5 «nada se simula». */
  conFuente: boolean;
}

export interface Busqueda extends Consulta {
  ejecutada: boolean;
  resultados: ResultadoWeb[];
  anioFundacion: string;
  dotacion: string;
  nota: string;
}

// ── Resultado ──────────────────────────────────────────────────────────────

export interface Hallazgo { codigo: string; severidad: Severidad; texto: string; fuente: string }

export interface Gatillo { numero: 1 | 2 | 3 | 4 | 5 | 6; nombre: string; detalle: string; fuente: string }

export type EstadoDimension = 'verificado' | 'no_verificable' | 'no_aplica';

export interface Dimension {
  clave: 'identidad' | 'coherencia' | 'regulatoria' | 'plantilla' | 'pagos' | 'rastro';
  nombre: string;
  max: number;
  puntos: number;
  estado: EstadoDimension;
  justificacion: string;
}

export type Etapa = 'paso0' | 'rondaA_lectura' | 'rondaA_extraccion' | 'reglas' | 'rondaB' | 'decision';

export interface Avance { etapa: Etapa; texto: string; listo: boolean }

export interface Resultado {
  id: string;
  fecha: string;               // ISO: las búsquedas son fotos del día (§14)
  entrada: Entrada;
  sitio: string;               // dominio registrable leído
  riesgo: RiesgoInherente;
  sumaPaso0: number;
  umbral: number;
  acreditacion: number;
  decision: Decision;
  gatillos: Gatillo[];
  hallazgos: Hallazgo[];       // todos; la salida muestra 6
  noVerificable: string[];
  lectura: string;             // la línea bajo el encabezado (§12)
  siguientePaso: string;
  dimensiones: Dimension[];
  paginas: { slot: Slot; url: string | null; status: number | null; error: string | null }[];
  busquedas: Busqueda[];
  rondaB: 'ejecutada' | 'omitida_por_gatillo' | 'sin_datos_para_buscar' | 'fallida';
  extraccion: Extraccion | null;
  ms: number;
}
