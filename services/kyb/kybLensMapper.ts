// Documentos (pipeline de Lens) → modelo canónico del KYB. Función PURA.
//
// El pipeline (batchProcessor → geminiService) devuelve `ExtractedField[]`: una
// lista plana de {field, value} con los nombres tal como los nombró el modelo.
// Acá se reconocen por patrón y se llevan al canónico, que es lo que compara el
// comparador.
//
// Se reconoce por PATRÓN y no por nombre exacto a propósito: el prompt puede
// devolver "Razón Social", "razon_social" o "Nombre de la empresa" para lo mismo,
// y no queremos que un cambio de redacción del prompt rompa la matriz.

import type { ExtractedField } from '../../types';
import type { LadoCanonico, PersonaCanonica } from '../../types/kybCanonico';
import { normalizarTexto } from '../casosComplianceMapper';
import { aNumero, clavePersona, normalizarDocumento, dedupPersonas } from './kybAdminMapper';
import { fechaAIso, huellaDireccion, formaLegalDesdeRazonSocial, rutValido
} from './kybNormalizadores';

// Reglas de reconocimiento. La PRIMERA que matchea gana, así que lo más
// específico va antes (ej. "capital social" antes que "capital").
interface Regla { campo: keyof LadoCanonico | 'capital' | 'escritura'; patron: RegExp }

const REGLAS: Regla[] = [
  { campo: 'razonSocial', patron: /RAZON SOCIAL|NOMBRE (DE LA )?(EMPRESA|SOCIEDAD)|DENOMINACION/ },
  { campo: 'identificacionNumero', patron: /\b(RUT|NIT|RUC|CUIT)\b|IDENTIFICACION (TRIBUTARIA|FISCAL)|TAX ID/ },
  { campo: 'formaLegal', patron: /(FORMA|TIPO) (LEGAL|SOCIETARI|DE SOCIEDAD)|CLASIFICACION (DE )?ENTIDAD/ },
  { campo: 'escritura', patron: /(NUMERO|N) DE ESCRITURA|REPERTORIO|ESCRITURA PUBLICA/ },
  { campo: 'fechaConstitucion', patron: /FECHA (DE )?CONSTITUCION|CONSTITUIDA|FECHA DE INICIO DE ACTIVIDADES/ },
  { campo: 'capital', patron: /CAPITAL (SOCIAL|SUSCRITO|PAGADO|ENTERADO)/ },
  { campo: 'domicilio', patron: /DOMICILIO|DIRECCION|ADDRESS/ },
  { campo: 'paisTributario', patron: /PAIS (TRIBUTARIO|DE TRIBUTACION)/ },
  { campo: 'sitioWeb', patron: /SITIO WEB|WEBSITE|PAGINA WEB/ },
  { campo: 'facturacionAnualEstimada', patron: /FACTURACION (ANUAL|ESTIMADA)|VENTAS ANUALES|INGRESOS ANUALES/ },
  { campo: 'ingresoMensual', patron: /INGRESO(S)? MENSUAL/ },
  { campo: 'egresoMensual', patron: /EGRESO(S)? MENSUAL|GASTOS MENSUALES/ },
  { campo: 'activosTotales', patron: /ACTIVOS? (TOTAL|TOTALES)/ },
  { campo: 'pasivosTotales', patron: /PASIVOS? (TOTAL|TOTALES)/ },
];

// Separadores con los que el modelo suele listar varias personas o actividades
// en un solo campo.
//
// La coma es ambigua: separa personas ("Juan Pérez, María López") pero también
// aparece DENTRO de una ("Juan Pérez, RUT 11.111.111-1"). Cortar siempre en la
// coma partía esa persona en dos —una sin documento y otra sin nombre— y el
// comparador reportaba un representante faltante que no faltaba. Por eso no se
// corta cuando lo que sigue es un documento.
const partir = (v: string): string[] =>
  v.split(/[;\n|]|,(?!\s*(?:RUT|NIT|RUC|CC|CI|DNI|C\.C|N°|NRO|\d))/i)
    .map(s => s.trim()).filter(Boolean);

// De un texto tipo "Juan Pérez, RUT 11.111.111-1" saca nombre y documento.
// Un nombre de persona completo, con apellidos compuestos y partículas, llega a
// 7 u 8 palabras. Una cláusula de escritura arranca en 13.
const MAX_PALABRAS_NOMBRE = 8;

function personaDeTexto(texto: string, rol?: string): PersonaCanonica | null {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  // El dígito verificador es OPCIONAL: la cédula colombiana suele venir sin él
  // ("44.444.444") y con el patrón anterior no matcheaba, así que el número
  // quedaba pegado al nombre y la persona no se podía emparejar por documento.
  // El prefijo se CAPTURA (antes era no-capturante): saber si el número venía
  // rotulado es lo que distingue un documento de un monto suelto.
  const mDoc = limpio.match(/\b(RUT|NIT|RUC|CC|CI|DNI)?\s*[:.]?\s*(\d{1,3}(?:[.\s]\d{3})+(?:[-–][\dkK])?|\d{7,12}(?:[-–][\dkK])?)\b/i);
  const documento = mDoc ? normalizarDocumento(mDoc[2]) : '';
  const rotulado = !!mDoc?.[1];
  const nombre = (mDoc ? limpio.replace(mDoc[0], ' ') : limpio)
    .replace(/\b(RUT|NIT|RUC|CC|CI|DNI)\b/gi, ' ')
    .replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nombre && !documento) return null;

  // Una cláusula no es una persona. El umbral de palabras se aplica SIEMPRE, y
  // lo único que permite saltearlo es un documento que CONFIRME que hay alguien:
  // un RUT que valida por módulo 11, o un número que venía rotulado como
  // documento en el texto.
  //
  // La versión anterior salteaba el umbral con cualquier `documento` presente, y
  // eso dejaba entrar justo lo que quería filtrar: `personaDeTexto` agarra
  // cualquier número de la prosa —un monto, un número de artículo— y lo guarda
  // como documento. Medido: cláusulas de 13 a 18 palabras pasaban con
  // "documentos" 1000000, 25000000, 2058. El ruido traía su propia llave.
  //
  // Un nombre corto pasa igual con documento basura: es una persona real cuyo
  // documento se leyó mal, y perderla es peor que arrastrar un documento sucio.
  const confirma = documento !== '' && (rotulado || rutValido(documento));
  if (!confirma && nombre.split(/\s+/).length > MAX_PALABRAS_NOMBRE) return null;
  return {
    nombre, documento, tipoDocumento: '',
    clave: clavePersona(nombre, documento),
    rol,
  };
}

// Los campos de personas no se resuelven con las REGLAS porque pueden venir
// varios y con roles distintos.
// Campos que CONTIENEN una palabra de persona pero no traen personas. "Juntas de
// Accionistas" es uno de los 18 campos que devuelve el extractor y trae prosa
// sobre cómo se convocan las juntas; caía en la regla de accionistas y cada
// oración se parseaba como un socio. Verificado: generaba 1-2 socios fantasma
// por empresa en el componente de peso 11.
const NO_SON_PERSONAS = /JUNTA(S)? (DE|GENERAL|ORDINARIA|EXTRAORDINARIA)|RESOLUCION DE CONFLICTOS|DISTRIBUCION DE UTILIDADES|MEDIO DE COMUNICACION/;

const PATRONES_PERSONAS: { destino: 'representantesLegales' | 'accionistas' | 'directorio'; patron: RegExp; rol: string }[] = [
  { destino: 'representantesLegales', patron: /REPRESENTANTE(S)? LEGAL/, rol: 'Representante legal' },
  { destino: 'accionistas', patron: /ACCIONISTA|SOCIO|BENEFICIARIO (FINAL|EFECTIVO)|CONFORMACION (DE LA )?SOCIEDAD/, rol: 'Accionista' },
  { destino: 'directorio', patron: /DIRECTOR(IO|ES)?|MIEMBRO(S)? DEL? (DIRECTORIO|CONSEJO)/, rol: 'Director' },
];

const PATRON_ACTIVIDAD = /ACTIVIDAD(ES)? (ECONOMICA|COMERCIAL|PRINCIPAL)?|GIRO|OBJETO SOCIAL|RUBRO/;
const PATRON_FACULTADES = /FACULTAD(ES)?|PODER(ES)?|FIRMA (AUTORIZADA|CONJUNTA|INDIVIDUAL)/;
const PATRON_ADMIN_CONJUNTA = /ADMINISTRACION CONJUNTA|ACTUACION CONJUNTA|FIRMA CONJUNTA/;

const VACIO = new Set(['', '-', '—', 'N/A', 'NA', 'NO INFORMADO', 'NO APLICA', 'SIN INFORMACION', 'NULL']);
const tieneValor = (v: string): boolean => !VACIO.has(normalizarTexto(v));

export function mapLensALadoCanonico(campos: ExtractedField[] | undefined): LadoCanonico {
  const lado: LadoCanonico = {};
  const actividades: string[] = [];
  const facultades: string[] = [];
  const personas: Record<string, PersonaCanonica[]> = {
    representantesLegales: [], accionistas: [], directorio: [],
  };

  for (const f of campos ?? []) {
    const valor = String(f?.value ?? '').trim();
    if (!tieneValor(valor)) continue;
    const nombreCampo = normalizarTexto(f?.field);

    // Personas primero: un campo "Representante legal" no debe caer en la regla
    // genérica de nombre. Pero antes se descartan los campos que mencionan una
    // palabra de persona sin traer personas.
    const reglaPersona = NO_SON_PERSONAS.test(nombreCampo)
      ? undefined
      : PATRONES_PERSONAS.find(p => p.patron.test(nombreCampo));
    if (reglaPersona) {
      for (const trozo of partir(valor)) {
        const p = personaDeTexto(trozo, reglaPersona.rol);
        if (p) personas[reglaPersona.destino].push(
          reglaPersona.destino === 'representantesLegales' ? { ...p, esRepresentanteLegal: true } : p,
        );
      }
      continue;
    }

    if (PATRON_ADMIN_CONJUNTA.test(nombreCampo)) {
      const n = normalizarTexto(valor);
      lado.administracionConjunta = /^(SI|SÍ|TRUE|CONJUNTA)/.test(n) ? true
        : /^(NO|FALSE|INDIVIDUAL)/.test(n) ? false : null;
      continue;
    }
    if (PATRON_FACULTADES.test(nombreCampo)) { facultades.push(...partir(valor)); continue; }
    if (PATRON_ACTIVIDAD.test(nombreCampo)) { actividades.push(...partir(valor)); continue; }

    const regla = REGLAS.find(r => r.patron.test(nombreCampo));
    if (!regla) continue;

    switch (regla.campo) {
      case 'razonSocial': lado.razonSocial ??= valor; break;
      case 'identificacionNumero':
        lado.identificacionNumero ??= normalizarDocumento(valor);
        lado.identificacionTipo ??= /NIT/.test(nombreCampo) ? 'NIT' : /RUC/.test(nombreCampo) ? 'RUC' : 'RUT';
        break;
      case 'formaLegal': lado.formaLegal ??= valor; break;
      case 'escritura': lado.numeroEscritura ??= valor; break;
      case 'fechaConstitucion': lado.fechaConstitucion ??= fechaAIso(valor) || valor; break;
      case 'capital': {
        const n = aNumero(valor);
        if (n !== null && !lado.capitalSocial) lado.capitalSocial = { valor: n, moneda: monedaDe(valor) };
        break;
      }
      case 'domicilio':
        lado.domicilio ??= { textoCompleto: valor, huella: huellaDireccion(valor) };
        break;
      case 'paisTributario': lado.paisTributario ??= valor; break;
      case 'sitioWeb': lado.sitioWeb ??= valor; break;
      default: {
        // Los montos financieros restantes.
        const n = aNumero(valor);
        if (n === null) break;
        const k = regla.campo as keyof LadoCanonico;
        if (!(k in lado)) (lado as Record<string, unknown>)[k] = { valor: n, moneda: monedaDe(valor) };
      }
    }
  }

  // La forma legal casi nunca viene rotulada en una escritura: va dentro del
  // nombre. Si la regla por etiqueta no la encontró, se deriva del sufijo de la
  // razón social — que es el documento diciéndolo, no una suposición nuestra.
  // Se marca como derivada para que la matriz lo muestre.
  if (!lado.formaLegal && lado.razonSocial) {
    const derivada = formaLegalDesdeRazonSocial(lado.razonSocial);
    if (derivada) {
      lado.formaLegal = derivada;
      lado.formaLegalDerivada = true;
    }
  }

  if (actividades.length) lado.actividades = [...new Set(actividades)];
  if (facultades.length) lado.facultades = [...new Set(facultades)];
  for (const [k, v] of Object.entries(personas)) {
    if (v.length) (lado as Record<string, unknown>)[k] = dedupPersonas(v);
  }
  return lado;
}

function monedaDe(v: string): string | undefined {
  const s = normalizarTexto(v);
  if (/USD|DOLAR|US\$/.test(s)) return 'USD';
  if (/EUR|€/.test(s)) return 'EUR';
  if (/CLP|PESOS? CHILENO/.test(s)) return 'CLP';
  if (/COP|PESOS? COLOMBIANO/.test(s)) return 'COP';
  return undefined;
}

// Qué campos del canónico quedaron sin poblar desde los documentos. Es lo que
// alimenta `faltantes` del análisis: sirve para decir "no se puede decidir
// todavía" en vez de decidir con la mitad de los datos.
export function faltantesLens(lado: LadoCanonico): string[] {
  const esperados: [keyof LadoCanonico, string][] = [
    ['razonSocial', 'Razón social'],
    ['identificacionNumero', 'Identificación tributaria'],
    ['formaLegal', 'Forma legal'],
    ['fechaConstitucion', 'Fecha de constitución'],
    ['domicilio', 'Domicilio'],
    ['representantesLegales', 'Representantes legales'],
  ];
  return esperados
    .filter(([k]) => {
      const v = lado[k];
      return v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    })
    .map(([, label]) => label);
}
