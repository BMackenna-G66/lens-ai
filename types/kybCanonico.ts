// Modelo CANÓNICO del KYB: las dos caras que se comparan.
//
// La idea es que el comparador nunca vea nombres de campo del proveedor. Admin
// tiene 55 campos con nombres heredados (`indActivity`, `nosisActivity`,
// `signatureAuthorizationLegalRepresentatives`…) y Lens extrae de documentos con
// otra forma. Los dos se traducen primero a ESTA forma, y recién ahí se comparan.
// Si Admin cambia un nombre de campo, se arregla en el mapper y el comparador no
// se entera.
//
// Los nombres de campo de abajo salen de la respuesta REAL de `/company/bo`
// (verificada con la empresa 2058470, 55 campos), no de la documentación.

// ── Persona (representante legal, accionista, director, usuario) ──────────────
// Forma única para las cuatro fuentes de personas de Admin, que traen shapes
// distintos (`firstName|name`, `lastName|surname`, `identificationNumber|docNumber`).
export interface PersonaCanonica {
  nombre: string;            // nombre completo normalizado
  documento: string;         // sin puntos ni guiones, en mayúsculas
  tipoDocumento: string;
  // Clave de emparejamiento: documento normalizado si hay, si no el nombre.
  // Es el primitivo con el que se cruzan los dos lados.
  clave: string;
  email?: string;
  nacionalidad?: string;
  // Rol dentro de la empresa. En Admin `shareholders` es un dict
  // {categoría: [personas]} y la CLAVE del dict es el rol.
  rol?: string;
  esRepresentanteLegal?: boolean;
  // % de participación. OJO: NO viene a nivel empresa en `/company/bo`; si
  // aparece, viene dentro de cada accionista. Queda null hasta confirmarlo con
  // una empresa que tenga socios cargados.
  participacionPct?: number | null;
  estado?: string;
  nivelKyc?: string;
}

// ── Monto con moneda ─────────────────────────────────────────────────────────
// Los montos financieros se comparan con tolerancia relativa, no por igualdad.
export interface MontoCanonico {
  valor: number | null;
  moneda?: string;
}

// ── Domicilio ────────────────────────────────────────────────────────────────
export interface DomicilioCanonico {
  pais?: string;
  // Admin devuelve `addressCountry` como OBJETO con el desglose completo:
  // {country, state, city, street, number, complementAddress, district, postalCode}.
  // El mapper leía `.name`, que no existe, así que el domicilio salía SIEMPRE
  // vacío del lado de Admin. Verificado contra la API.
  region?: string;          // state
  ciudad?: string;          // city
  calle?: string;           // street
  numero?: string;
  complemento?: string;     // complementAddress
  textoCompleto?: string;
  // Huella normalizada (vía + número, sin sinónimos ni abreviaturas) para poder
  // comparar "Av. Providencia 1234" con "Avenida Providencia N° 1234".
  huella?: string;
}

// Datos generales de la empresa, en el orden en que se muestran en la ficha.
// Es la vista "quién es este cliente" antes de cualquier comparación.
export interface DatosGeneralesEmpresa {
  nombre?: string;
  pais?: string;
  tipoIdentificacion?: string;
  numeroIdentificacion?: string;
  tributacionInternacional?: boolean | null;
  region?: string;
  ciudad?: string;
  calle?: string;
  numero?: string;
  direccionComplementaria?: string;
  administracionConjunta?: boolean | null;
  institucional?: boolean | null;
  paginaWeb?: string;
  relacionContractual?: string;
  industria?: string;
  actividad?: string;             // "código - nombre"
  facturacionAnualEstimada?: string;   // es un RANGO de texto, no un número
  montosEnviosEsperados?: string;
  frecuenciaEnviosEsperada?: string;
  segmentacion?: string;
  nivelRiesgoPartner?: string;    // riskLevelRegcheq
  nivelRiesgoGlobal66?: string;   // riskLevel
  telefono?: string;
  formaLegal?: string;
  fechaConstitucion?: string;
  creadoEn?: string;
}

// ── Un lado de la comparación ────────────────────────────────────────────────
// La misma forma para Admin y para Lens. Un campo en `undefined` significa "esta
// fuente no lo aporta" y el comparador lo trata como SIN_DATOS, no como discrepancia.
export interface LadoCanonico {
  // Identidad
  razonSocial?: string;
  identificacionNumero?: string;
  identificacionTipo?: string;
  formaLegal?: string;

  // Constitución
  fechaConstitucion?: string;        // ISO
  numeroEscritura?: string;
  // Capital social: NO existe en Admin (verificado). Queda como fuente única
  // desde los documentos: se valida que esté, no se compara.
  capitalSocial?: MontoCanonico;

  // Domicilio y contacto
  domicilio?: DomicilioCanonico;
  paisTributario?: string;
  sitioWeb?: string;
  telefono?: string;

  // Personas, por fuente. Se comparan por separado: un accionista que aparece
  // como representante legal no es lo mismo que un representante faltante.
  representantesLegales?: PersonaCanonica[];
  accionistas?: PersonaCanonica[];
  directorio?: PersonaCanonica[];
  usuarios?: PersonaCanonica[];

  // Actividad económica. Admin la trae repartida en cinco campos distintos
  // (`activity`, `indActivity`, `nosisActivity`, `companyFinancialActivity`,
  // `industries`), así que el canónico junta todo en una lista.
  actividades?: string[];
  industrias?: string[];

  // Facultades y firma. Admin SÍ los trae
  // (`signatureAuthorization`, `signatureAuthorizationLegalRepresentatives`),
  // al contrario de lo que se asumió al planificar.
  administracionConjunta?: boolean | null;
  facultades?: string[];

  // Perfil financiero
  facturacionAnualEstimada?: MontoCanonico;
  ingresoMensual?: MontoCanonico;
  egresoMensual?: MontoCanonico;
  activosTotales?: MontoCanonico;
  pasivosTotales?: MontoCanonico;

  // Perfil transaccional declarado (solo Admin).
  montosEnvio?: string;
  frecuenciaEnvio?: string;

  // Los montos de Admin vienen como RANGO DE TEXTO, no como número
  // ("Entre USD 100,000 y USD 1MM"). Se guardan tal cual para mostrarlos; el
  // comparador numérico no puede usarlos y el componente queda de fuente única.
  facturacionTexto?: string;

  // Estructura societaria (malla). Solo Admin.
  relaciones?: RelacionCanonica[];
}

// Un nodo de la malla societaria (`/company/bo/relationships/{id}`).
export interface RelacionCanonica {
  nombre?: string;
  documento?: string;
  tipo?: string;
  nivel?: number;
  participacionPct?: number | null;
}

// ── Estado de compliance en Admin (contexto, no se compara) ───────────────────
// Es la foto de cómo está la empresa hoy en Admin: sirve para los frenos duros y
// para saber si la decisión ya está aplicada, no para la matriz.
export interface EstadoAdminEmpresa {
  companyId: string;
  complianceStatus?: string;
  complianceStatusComment?: string;
  kycStage1?: string;
  kycStage2?: string;
  kycStage3?: string;
  riskLevel?: string;
  riskLevelRegcheq?: string;
  institucional?: boolean | null;
  segmentacion?: string;
  proposito?: string;
  // Tax compliance: Admin trae `crs` y `fatca`.
  crs?: unknown;
  fatca?: unknown;
  creadoEn?: string;
}
