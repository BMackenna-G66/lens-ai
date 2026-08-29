// Identidad de personas para el KYB: cuánta confianza hay en que dos registros
// son la MISMA persona, y cuánto en que un texto sea siquiera un nombre.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
// El emparejador daba un binario: o coincide o no. Sobre una empresa real eso
// produjo esto en el componente de peso 13:
//
//   documentos → "Víctor Manuel Fernández Gómez (Gerente General)"
//   Admin      → "Víctor Manuel Fernández Gómez", documento 194541619
//   resultado  → DISCREPA · "1 en documentos y 1 en Admin, sin ninguna coincidencia"
//
// Es la misma persona. La similitud daba 67 % contra un corte de 70 porque
// `(Gerente General)` aportaba dos tokens al lado documentos y la métrica divide
// por el lado MÁS LARGO: 4 tokens compartidos sobre 6. Sin el cargo da 100.
//
// El acento no tenía nada que ver — `normalizarTexto` ya lo saca.
//
// ── Qué hace distinto ──────────────────────────────────────────────────────
// 1. Separa el CARGO y el DOCUMENTO del nombre antes de comparar. Un rol no es
//    parte de la identidad y no puede restar parecido.
// 2. Puntúa por CONTENCIÓN, no por el lado más largo: si un lado trae todos los
//    tokens del otro, eso es una coincidencia con información de más, no una
//    discrepancia. Los tokens sobrantes penalizan poco y de forma explícita.
// 3. Tolera lo que rompe un OCR: una inicial contra el nombre entero
//    ("J. Pérez" ↔ "Juan Pérez") y una letra cambiada en tokens largos
//    ("FERNANDEZ" ↔ "FERNANDES").
// 4. Devuelve APROXIMADO como estado propio, con el motivo en palabras. El
//    analista tiene que poder ver POR QUÉ se parecen, no solo un número.
//
// Y aparte: `pareceNombreDePersona` decide si un texto es un nombre. En la misma
// empresa, el componente de accionistas comparaba estos dos "socios" extraídos
// de los documentos:
//
//   "equivalentes a $ de pesos"        (documento 1000000)
//   "que paga en dinero efectivo y al contado."
//
// Son trozos de prosa de la escritura. El filtro que había era un tope de
// palabras (8), y el primero tiene 5, así que pasaba. Un tope de largo no puede
// distinguir una cláusula corta de un nombre: hace falta preguntar si las
// palabras son de nombre. Esos dos fantasmas además se mandaron a screening —
// uno volvió con "ERROR del proveedor Regcheq 404".

import { normalizarTexto } from '../casosComplianceMapper';

// Cortes del puntaje de identidad. Más bajos que los de `CORTES_NOMBRE` a
// propósito: acá el puntaje ya viene limpio de cargos y tolera OCR, así que un
// 80 significa más que antes.
export const CORTES_IDENTIDAD = { exacto: 97, aproximado: 78 } as const;

export type EstadoIdentidad = 'EXACTO' | 'APROXIMADO' | 'DISTINTO';

export interface Identidad {
  nombre: string;
  cargo?: string;
  documento?: string;
}

export interface CoincidenciaIdentidad {
  puntaje: number;              // 0..100 — confianza en que es la misma persona
  estado: EstadoIdentidad;
  porDocumento: boolean;
  motivo: string;               // en palabras, para la matriz
  // Aviso fuerte: mismo número, dígito verificador distinto. NO es un match —
  // un DV distinto es otro RUT— pero tampoco es "no se parecen en nada", y la
  // diferencia importa: suele ser un dígito mal tipeado en Admin.
  documentoSospechoso?: boolean;
}

// ── Partículas y ruido ──────────────────────────────────────────────────────
// Partículas que SÍ pueden estar dentro de un nombre ("de la Fuente", "Del
// Río"). No cuentan para el parecido, pero tampoco descalifican.
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'DA', 'DOS', 'VAN', 'VON', 'DI', 'SAN', 'SANTA', 'Y', 'E']);

// Palabras que NO aparecen en el nombre de una persona. Sacadas de los
// fantasmas reales que se colaron: prosa de escritura sobre aportes y pagos.
// Una sola de estas descalifica el texto entero — es la señal más barata y la
// más certera de que estamos leyendo una cláusula, no un nombre.
const PALABRAS_DE_PROSA = new Set([
  'QUE', 'PAGA', 'PAGAN', 'PAGADO', 'PAGADA', 'PAGAR', 'PAGO', 'PAGOS',
  'EQUIVALENTE', 'EQUIVALENTES', 'PESO', 'PESOS', 'DOLAR', 'DOLARES', 'EURO', 'EUROS',
  'DINERO', 'EFECTIVO', 'CONTADO', 'SUMA', 'MONTO', 'MONTOS', 'CAPITAL',
  'ACCION', 'ACCIONES', 'APORTE', 'APORTES', 'APORTA', 'CUOTA', 'CUOTAS',
  'TOTAL', 'VALOR', 'MONEDA', 'UNIDAD', 'UNIDADES', 'FOMENTO',
  'DIVIDIDO', 'DIVIDIDA', 'DIVIDIDAS', 'DIVIDIDOS', 'SUSCRITO', 'SUSCRITA',
  'ENTERADO', 'ENTERADA', 'RESPECTIVAMENTE', 'MEDIANTE', 'SEGUN', 'CONFORME',
  'CADA', 'CUAL', 'CUALES', 'CUYO', 'CUYA', 'SOCIEDAD', 'EMPRESA', 'COMPANIA',
  'PORCENTAJE', 'PARTICIPACION', 'ESCRITURA', 'CLAUSULA', 'ARTICULO', 'PLAZO',
  'DOMICILIO', 'REPRESENTACION', 'ADMINISTRACION', 'FACULTAD', 'FACULTADES',
  'NACIONALIDAD', 'ESTADO', 'CIVIL', 'PROFESION', 'CEDULA', 'IDENTIDAD',
]);

const tokens = (v: unknown): string[] =>
  normalizarTexto(v).replace(/[^A-Z0-9ÑÜ ]/g, ' ').split(/\s+/).filter(Boolean);

// ── ¿Es un nombre de persona? ───────────────────────────────────────────────
// Positivo, no por descarte de largo. Devuelve el puntaje además del veredicto
// para poder mostrar cuán seguros estamos.
export function pareceNombreDePersona(v: unknown): { esNombre: boolean; puntaje: number; motivo: string } {
  const bruto = String(v ?? '').trim();
  if (!bruto) return { esNombre: false, puntaje: 0, motivo: 'vacío' };

  // Símbolos de plata o porcentaje: es una cláusula de aportes, no una persona.
  if (/[$%€]/.test(bruto)) return { esNombre: false, puntaje: 0, motivo: 'trae símbolo de monto' };

  const ts = tokens(bruto);
  if (!ts.length) return { esNombre: false, puntaje: 0, motivo: 'sin palabras' };

  const prosa = ts.filter(t => PALABRAS_DE_PROSA.has(t));
  if (prosa.length) {
    return { esNombre: false, puntaje: 0, motivo: `palabra de cláusula: ${prosa.slice(0, 3).join(', ').toLowerCase()}` };
  }

  // Los que sí cuentan como parte del nombre: alfabéticos, sin partículas.
  const utiles = ts.filter(t => !PARTICULAS.has(t) && /^[A-ZÑÜ]+$/.test(t) && t.length > 1);
  const numericos = ts.filter(t => /\d/.test(t)).length;

  if (utiles.length < 2) {
    return { esNombre: false, puntaje: 25, motivo: 'menos de dos palabras de nombre' };
  }
  // Un nombre de persona no tiene ocho palabras propias. Es el mismo tope de
  // antes, pero ahora se aplica a las palabras ÚTILES: las partículas no gastan
  // cupo, así que "María de los Ángeles del Río Fernández" ya no se cae.
  if (utiles.length > 6) {
    return { esNombre: false, puntaje: 30, motivo: `${utiles.length} palabras: parece una cláusula` };
  }

  // Números sueltos entre las palabras restan confianza pero no descalifican:
  // puede ser el documento pegado al nombre.
  const puntaje = Math.max(40, 100 - numericos * 10);
  return { esNombre: true, puntaje, motivo: `${utiles.length} palabras de nombre` };
}

// ── Recortar el nombre del principio de una cláusula ────────────────────────
// Un trozo de escritura suele empezar con la persona y seguir con lo que hizo:
//
//   "Víctor Manuel Fernández Gómez, 1.000 acciones equivalentes a $1.000.000"
//                                   └─ desde acá ya no es nombre ─┘
//
// Rechazar el trozo entero mata al socio real junto con el ruido: probado, el
// componente pasaba de tener dos fantasmas a no tener a nadie. Lo correcto es
// cortar en la primera palabra que no puede ser parte de un nombre y quedarse
// con el prefijo.
//
// Devuelve '' cuando el trozo NO empieza con un nombre — que es lo que pasa con
// "que paga en dinero efectivo y al contado.": el primer token ya es prosa.
export function nombreAlPrincipio(texto: unknown): string {
  const bruto = String(texto ?? '').trim();
  if (!bruto) return '';
  const piezas = bruto.split(/\s+/);
  const salida: string[] = [];
  let utiles = 0;
  for (const pieza of piezas) {
    const t = normalizarTexto(pieza).replace(/[^A-Z0-9ÑÜ]/g, '');
    if (!t) {
      // Puntuación suelta: si ya hay nombre, ahí termina.
      if (utiles) break;
      continue;
    }
    if (PALABRAS_DE_PROSA.has(t)) break;
    // Un número o un símbolo de monto cortan: el nombre no sigue después.
    if (/\d/.test(t) || /[$%€]/.test(pieza)) break;
    if (PARTICULAS.has(t)) { salida.push(pieza); continue; }
    if (!/^[A-ZÑÜ]+$/.test(t) || t.length < 2) break;
    salida.push(pieza);
    if (++utiles >= 6) break;      // un nombre no tiene más de seis palabras propias
    // Una coma después del nombre cierra: "Víctor Fernández, 1.000 acciones".
    if (/[,;]$/.test(pieza)) break;
  }
  if (utiles < 2) return '';
  return salida.join(' ').replace(/[,;.\s]+$/, '').trim();
}

// ── Separar nombre, cargo y documento ───────────────────────────────────────
// El paréntesis puede traer un cargo ("(Gerente General)") o un documento
// ("(194541619)"). Se decide por el contenido, no por la posición.
export function separarIdentidad(texto: unknown, documentoConocido = ''): Identidad {
  let s = String(texto ?? '').trim();
  let cargo = '';
  let documento = String(documentoConocido ?? '').trim();

  // Todos los paréntesis, no solo el último.
  s = s.replace(/\(([^)]*)\)/g, (_, dentro: string) => {
    const d = String(dentro).trim();
    if (!d) return ' ';
    const soloDigitos = d.replace(/[^0-9kK]/g, '');
    // Mayoría de dígitos → es un documento.
    if (soloDigitos.length >= 7 && soloDigitos.length / d.replace(/\s/g, '').length > 0.6) {
      if (!documento) documento = soloDigitos.toUpperCase();
    } else {
      cargo = cargo ? `${cargo} · ${d}` : d;
    }
    return ' ';
  });

  // Cargo pegado al final sin paréntesis, con separador.
  const mSep = s.match(/[,;–-]\s*(GERENTE|REPRESENTANTE|DIRECTOR|PRESIDENTE|SOCIO|APODERADO|ADMINISTRADOR)[^,;]*$/i);
  if (mSep) {
    cargo = cargo ? `${cargo} · ${mSep[1]}` : mSep[0].replace(/^[,;–-]\s*/, '').trim();
    s = s.slice(0, mSep.index).trim();
  }

  const nombre = s.replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return { nombre, cargo: cargo || undefined, documento: documento || undefined };
}

// ── Documento ───────────────────────────────────────────────────────────────
export const canonDocumento = (v: unknown): string =>
  String(v ?? '').replace(/[^0-9kK]/g, '').toUpperCase().replace(/^0+/, '');

// ¿Este número puede ser un documento de identidad?
//
// Hace falta porque `personaDeTexto` agarra CUALQUIER número de la prosa. De
// "Víctor Manuel Fernández Gómez, 1.000 acciones" salía documento "1000", y ese
// 1000 después le ganaba a un nombre idéntico: la regla "documentos distintos =
// personas distintas" lo tomaba en serio y devolvía DISCREPA sobre la misma
// persona. Medido sobre Ad Astra SPA, componente de peso 12.
//
// Un documento de identidad de la región tiene 7 dígitos o más. Con menos, es
// un monto, un número de acciones o un artículo.
export const documentoPlausible = (v: unknown): boolean => canonDocumento(v).length >= 7;

// Cuerpo del RUT sin el dígito verificador.
const cuerpoRut = (d: string): string => (d.length > 1 ? d.slice(0, -1) : d);

// ── Parecido de nombre, con tolerancia a OCR ───────────────────────────────
// Distancia de edición acotada a 1: alcanza para una letra cambiada, agregada o
// faltante, que es lo que produce un OCR. Más que eso ya no es un typo.
function difiereEnUnaLetra(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0, j = 0, fallos = 0;
  while (i < corto.length && j < largo.length) {
    if (corto[i] === largo[j]) { i++; j++; continue; }
    if (++fallos > 1) return false;
    if (corto.length === largo.length) { i++; j++; } else { j++; }
  }
  return fallos + (largo.length - j) <= 1;
}

// ¿Estos dos tokens son la misma palabra del nombre?
function mismoToken(a: string, b: string): 'exacto' | 'inicial' | 'aproximado' | null {
  if (a === b) return 'exacto';
  // Inicial contra nombre entero: "J" ↔ "JUAN".
  if (a.length === 1 || b.length === 1) {
    return (a[0] === b[0]) ? 'inicial' : null;
  }
  if (a.length >= 5 && b.length >= 5 && difiereEnUnaLetra(a, b)) return 'aproximado';
  return null;
}

export interface ParecidoNombre {
  puntaje: number;
  compartidos: number;
  sobrantes: number;
  inexactos: number;   // difieren en una letra (típico de OCR)
  iniciales: number;   // una inicial contra el nombre entero
  motivo: string;
}

// Puntaje por CONTENCIÓN: cuántos tokens del lado más corto están en el otro.
// Los sobrantes del lado largo penalizan 6 puntos cada uno, no invalidan.
//
// El cambio respecto de `similitudNombre`, que divide por el lado más largo:
// "Víctor Manuel Fernández Gómez" contra "Víctor Manuel Fernández" da 100 acá y
// 75 allá. Un segundo apellido que Admin no trae no es una persona distinta.
export function parecidoNombre(a: unknown, b: unknown): ParecidoNombre {
  const ta = tokens(a).filter(t => !PARTICULAS.has(t));
  const tb = tokens(b).filter(t => !PARTICULAS.has(t));
  if (!ta.length || !tb.length) {
    return { puntaje: 0, compartidos: 0, sobrantes: 0, inexactos: 0, iniciales: 0, motivo: 'un lado no trae nombre' };
  }
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const disponibles = [...largo];
  let compartidos = 0, inexactos = 0, iniciales = 0;
  for (const t of corto) {
    let mejor = -1, tipo: ReturnType<typeof mismoToken> = null;
    for (let i = 0; i < disponibles.length; i++) {
      const m = mismoToken(t, disponibles[i]);
      if (!m) continue;
      // Un match exacto gana siempre sobre uno aproximado.
      if (m === 'exacto') { mejor = i; tipo = m; break; }
      if (mejor < 0) { mejor = i; tipo = m; }
    }
    if (mejor >= 0) {
      compartidos++;
      if (tipo === 'aproximado') inexactos++;
      else if (tipo === 'inicial') iniciales++;
      disponibles.splice(mejor, 1);
    }
  }
  const sobrantes = largo.length - compartidos;
  const cobertura = (compartidos / corto.length) * 100;
  const puntaje = Math.max(0, Math.round(cobertura - sobrantes * 6 - inexactos * 3 - iniciales * 3));
  const partes = [`${compartidos} de ${corto.length} palabras coinciden`];
  if (inexactos) partes.push(`${inexactos} con diferencia de una letra`);
  if (iniciales) partes.push(`${iniciales} abreviada(s) a la inicial`);
  if (sobrantes) partes.push(`${sobrantes} palabra(s) solo en un lado`);
  return { puntaje, compartidos, sobrantes, inexactos, iniciales, motivo: partes.join(' · ') };
}

// ── El veredicto de identidad ───────────────────────────────────────────────
export function compararIdentidad(a: Identidad, b: Identidad): CoincidenciaIdentidad {
  // Solo se consideran los documentos que PUEDEN serlo. Uno de cuatro dígitos
  // salido de "1.000 acciones" no puede desempatar nada, y menos declarar que
  // dos registros con el mismo nombre son personas distintas.
  const da = documentoPlausible(a.documento) ? canonDocumento(a.documento) : '';
  const db = documentoPlausible(b.documento) ? canonDocumento(b.documento) : '';

  // 1. Documento igual: es la misma persona y no hace falta mirar el nombre.
  if (da && db && da === db) {
    return { puntaje: 100, estado: 'EXACTO', porDocumento: true, motivo: 'mismo documento' };
  }

  const n = parecidoNombre(a.nombre, b.nombre);

  // 2. Mismo cuerpo de RUT con dígito verificador distinto. No empareja —es otro
  // RUT— pero se avisa, porque casi siempre es un dígito mal tipeado y el
  // analista tiene que verlo en vez de leer "sin coincidencia".
  if (da && db && da !== db && cuerpoRut(da) === cuerpoRut(db)) {
    return {
      puntaje: Math.min(n.puntaje, 60), estado: 'APROXIMADO', porDocumento: false,
      documentoSospechoso: true,
      motivo: `mismo número de documento con dígito verificador distinto (${da} vs ${db})`,
    };
  }

  // 3. Documentos distintos de verdad: son personas distintas por más que el
  // nombre se parezca. Dos hermanos pueden llamarse casi igual.
  if (da && db && da !== db) {
    return {
      puntaje: 0, estado: 'DISTINTO', porDocumento: false,
      motivo: `documentos distintos (${da} vs ${db})`,
    };
  }

  // 4. Solo queda el nombre. Es el caso mayoritario: los documentos casi nunca
  // vienen del lado de las escrituras.
  //
  // EXACTO exige que no haya NADA aproximado: ni una letra distinta, ni una
  // inicial en lugar del nombre, ni palabras de más. El puntaje solo no alcanza
  // —una letra cambiada da 97, que es el corte— y decir "mismo nombre" cuando
  // "Fernández" y "Fernandes" difieren es exactamente el tipo de afirmación que
  // una herramienta de compliance no puede hacer. Si hay aproximación, se dice.
  const limpio = n.inexactos === 0 && n.iniciales === 0 && n.sobrantes === 0
    && n.puntaje >= CORTES_IDENTIDAD.exacto;
  const estado: EstadoIdentidad =
    limpio ? 'EXACTO'
    : n.puntaje >= CORTES_IDENTIDAD.aproximado ? 'APROXIMADO'
    : 'DISTINTO';
  const soloUnLadoTieneDoc = (!!da) !== (!!db);
  return {
    puntaje: n.puntaje, estado, porDocumento: false,
    motivo: estado === 'EXACTO'
      ? 'mismo nombre'
      : `${n.motivo}${soloUnLadoTieneDoc ? ' · solo un lado trae documento' : ''}`,
  };
}
