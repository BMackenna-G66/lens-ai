// REVISIÓN WEB — las DOS llamadas al modelo. Prompts propios, esquema propio.
//
// No se usa ninguna función de documentos de geminiService: esto es otro
// análisis. El modelo solo EXTRAE y COPIA: no decide severidad, ni puntaje, ni
// gatillos. Eso es de `reglas`, `evaluacion` y `puntaje`.

import { GoogleGenAI, Type } from '@google/genai';
import { dominioRegistrable } from './reglas';
import type { Busqueda, Consulta, Extraccion, ResultadoWeb, Slot } from './tipos';

export const MODELO_REVISION_WEB = 'gemini-3.5-flash';

/** Por página, para que una sola página enorme no se coma el contexto. */
const TOPE_TEXTO_PAGINA = 15_000;

const cliente = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// ── Ronda A · extracción, una llamada, esquema plano ──────────────────────

const ESQUEMA_EXTRACCION = {
  type: Type.OBJECT,
  properties: {
    razonSocial: { type: Type.STRING },
    nombreComercial: { type: Type.STRING },
    tipoSocietario: { type: Type.STRING },
    identificador: { type: Type.STRING },
    tipoIdentificador: { type: Type.STRING },
    correos: { type: Type.ARRAY, items: { type: Type.STRING } },
    telefonos: { type: Type.ARRAY, items: { type: Type.STRING } },
    direcciones: { type: Type.ARRAY, items: { type: Type.STRING } },
    jurisdiccionTextosLegales: { type: Type.STRING },
    mercadosDeclarados: { type: Type.ARRAY, items: { type: Type.STRING } },
    serviciosRegulados: { type: Type.ARRAY, items: { type: Type.STRING } },
    declaraVentaEnLinea: { type: Type.BOOLEAN },
    declaraTrayectoria: { type: Type.BOOLEAN },
    anioFundacion: { type: Type.STRING },
    dotacion: { type: Type.STRING },
    titularCuentaPago: { type: Type.STRING },
    identificadorTitularCuentaPago: { type: Type.STRING },
    mediosPagoSolicitados: { type: Type.ARRAY, items: { type: Type.STRING } },
    credencialesRegulatorias: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['razonSocial', 'identificador', 'correos', 'telefonos', 'direcciones'],
};

const PROMPT_EXTRACCION = `Extraé datos de las páginas de un sitio web. COPIÁ solo lo que está escrito en el texto; no infieras, no completes, no corrijas. Si un dato no aparece, dejalo vacío ("" o []).

Campos:
- razonSocial: la razón social o denominación legal tal como aparece (con su forma societaria si la tiene).
- nombreComercial: la marca o nombre de fantasía.
- tipoSocietario: SpA, S.A., Ltda., S.A.S., LLC, etc., si aparece.
- identificador: el identificador tributario de la EMPRESA tal como está escrito (RUT, NIT, RUC, EIN…), con su dígito verificador si lo tiene.
- tipoIdentificador: "RUT", "NIT" u "otro", según cómo lo nombre el sitio.
- correos, telefonos, direcciones: los de contacto de la empresa, tal como aparecen.
- jurisdiccionTextosLegales: la ley o el país que citan los términos o la política de privacidad (ej. "leyes de la República de Chile"). Vacío si no citan ninguno.
- mercadosDeclarados: los países donde dice operar.
- serviciosRegulados: de esta lista, los que OFRECE: pagos, remesas, inversion, credito, factoring, cripto, seguros.
- declaraVentaEnLinea: true si vende o cobra en línea en el propio sitio.
- declaraTrayectoria: true si declara años de trayectoria, tamaño, cantidad de empleados o presencia en varios países.
- anioFundacion, dotacion: si los declara.
- titularCuentaPago, identificadorTitularCuentaPago: si publica datos de una cuenta para recibir pagos, el titular y su identificador.
- mediosPagoSolicitados: los medios con los que PIDE que se le pague, de esta lista: transferencia, tarjeta, cripto, tarjeta_regalo, efectivo, otro.
- credencialesRegulatorias: las licencias, registros o supervisiones que el sitio declara (ej. "registrada como MSB ante FinCEN", "vigilada por la Superfinanciera"), copiadas.`;

function textoUtil(paginas: { slot: Slot; url: string | null; texto: string }[]): string {
  return paginas
    .filter(p => p.texto)
    .map(p => `=== Página: ${p.slot} (${p.url}) ===\n${p.texto.slice(0, TOPE_TEXTO_PAGINA)}`)
    .join('\n\n');
}

const lista = (v: unknown): string[] => Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : [];
const texto = (v: unknown): string => typeof v === 'string' ? v.trim() : '';

export function normalizarExtraccion(crudo: any): Extraccion {
  const r = crudo && typeof crudo === 'object' ? crudo : {};
  return {
    razonSocial: texto(r.razonSocial), nombreComercial: texto(r.nombreComercial), tipoSocietario: texto(r.tipoSocietario),
    identificador: texto(r.identificador), tipoIdentificador: texto(r.tipoIdentificador),
    correos: lista(r.correos), telefonos: lista(r.telefonos), direcciones: lista(r.direcciones),
    jurisdiccionTextosLegales: texto(r.jurisdiccionTextosLegales), mercadosDeclarados: lista(r.mercadosDeclarados),
    serviciosRegulados: lista(r.serviciosRegulados), declaraVentaEnLinea: r.declaraVentaEnLinea === true,
    declaraTrayectoria: r.declaraTrayectoria === true, anioFundacion: texto(r.anioFundacion), dotacion: texto(r.dotacion),
    titularCuentaPago: texto(r.titularCuentaPago), identificadorTitularCuentaPago: texto(r.identificadorTitularCuentaPago),
    mediosPagoSolicitados: lista(r.mediosPagoSolicitados), credencialesRegulatorias: lista(r.credencialesRegulatorias),
  };
}

export async function extraerRondaA(paginas: { slot: Slot; url: string | null; texto: string }[]): Promise<Extraccion> {
  const contenido = textoUtil(paginas);
  if (!contenido) return normalizarExtraccion({});
  const r = await cliente().models.generateContent({
    model: MODELO_REVISION_WEB,
    contents: [{ role: 'user', parts: [{ text: `${PROMPT_EXTRACCION}\n\n${contenido}` }] }],
    config: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA_EXTRACCION },
  });
  return normalizarExtraccion(JSON.parse(r.text || '{}'));
}

// ── Ronda B · búsqueda, una llamada con googleSearch ──────────────────────

function promptBusqueda(consultas: Consulta[], nombre: string, identificador: string, sitio: string): string {
  return `Ejecutá en Google EXACTAMENTE estas búsquedas, una vez cada una, en este orden. No agregues otras ni las cambies:
${consultas.map((c, i) => `${i + 1}. ${c.consulta}`).join('\n')}

Entidad: ${nombre || '(sin nombre)'}${identificador ? ` · identificador ${identificador}` : ''} · sitio ${sitio}.

Para cada búsqueda, COPIÁ hasta 5 resultados relevantes tal como aparecen. No inventes resultados ni completes: si una búsqueda no devolvió nada útil, "resultados": []. Respondé SOLO con un JSON, sin texto alrededor, con esta forma:
[{"consulta": "...", "ejecutada": true, "resultados": [{"titulo": "...", "url": "...", "dominio": "...", "extracto": "texto literal breve",
  "mencionaIdentificador": false, "mencionaNombre": false, "esAlertaRegulador": false, "esAutorizacionRegulador": false, "esReclamo": false}],
  "anioFundacion": "", "dotacion": "", "nota": ""}]

- mencionaIdentificador: el resultado contiene el identificador exacto.
- mencionaNombre: el resultado se refiere a esta entidad por su nombre.
- esAlertaRegulador: es una advertencia o alerta OFICIAL de un regulador sobre esta entidad (entidad no autorizada, suspendida, sancionada).
- esAutorizacionRegulador: es un registro oficial donde la entidad figura autorizada o supervisada.
- esReclamo: es un reclamo o queja de clientes sobre esta entidad.
- anioFundacion, dotacion: solo si un resultado los indica.`;
}

/** El primer JSON del texto: el modelo con búsqueda no admite esquema
 *  estructurado, así que el formato se pide y se valida acá. */
export function extraerJson(t: string): unknown {
  const limpio = String(t || '').replace(/```(?:json)?/gi, '');
  const ini = limpio.search(/[[{]/);
  if (ini < 0) return null;
  const abre = limpio[ini];
  const cierra = abre === '[' ? ']' : '}';
  const fin = limpio.lastIndexOf(cierra);
  if (fin <= ini) return null;
  try { return JSON.parse(limpio.slice(ini, fin + 1)); } catch { return null; }
}

const normalConsulta = (s: string) => String(s || '').toLowerCase().replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();

/** Las fuentes REALES de la respuesta: los dominios que trajo la búsqueda. Un
 *  resultado cuyo dominio no está acá no puntúa (§5: nada se simula). */
export function fuentesDeGrounding(meta: any): Set<string> {
  const s = new Set<string>();
  for (const c of meta?.groundingChunks || []) {
    const w = c?.web;
    if (!w) continue;
    const titulo = String(w.title || '').toLowerCase().trim();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(titulo)) s.add(dominioRegistrable(titulo));
    try {
      const host = new URL(String(w.uri || '')).hostname;
      if (host && !/vertexaisearch|googleusercontent|google\.com$/.test(host)) s.add(dominioRegistrable(host));
    } catch { /* uri de redirección */ }
  }
  return s;
}

export function armarBusquedas(consultas: Consulta[], crudo: unknown, fuentes: Set<string>, ejecutadasPorGoogle: string[] | null): Busqueda[] {
  const lista = Array.isArray(crudo) ? crudo : [];
  const ejecutadas = (ejecutadasPorGoogle || []).map(normalConsulta);
  return consultas.map((c, i) => {
    const r: any = lista.find((x: any) => normalConsulta(x?.consulta) === normalConsulta(c.consulta)) ?? lista[i] ?? {};
    // Si la API dice qué búsquedas corrió, manda eso y no lo que dice el modelo.
    // Cuenta como ejecutada si una de las de Google tiene TODOS sus términos: un
    // `site:cmfchile.cl "Acme"` no se da por hecho porque Google buscó «Acme».
    const terminos = normalConsulta(c.consulta).split(' ').filter(Boolean);
    const ejecutada = ejecutadasPorGoogle
      ? ejecutadas.some(q => terminos.every(t => q.includes(t)))
      : r.ejecutada === true;
    const resultados: ResultadoWeb[] = (Array.isArray(r.resultados) ? r.resultados : []).slice(0, 5).map((x: any) => {
      let dominio = texto(x?.dominio).toLowerCase();
      if (!dominio) { try { dominio = new URL(texto(x?.url)).hostname; } catch { dominio = ''; } }
      dominio = dominio.replace(/^www\./, '');
      return {
        titulo: texto(x?.titulo), url: texto(x?.url), dominio, extracto: texto(x?.extracto).slice(0, 400),
        mencionaIdentificador: x?.mencionaIdentificador === true, mencionaNombre: x?.mencionaNombre === true,
        esAlertaRegulador: x?.esAlertaRegulador === true, esAutorizacionRegulador: x?.esAutorizacionRegulador === true,
        esReclamo: x?.esReclamo === true,
        conFuente: !!dominio && fuentes.has(dominioRegistrable(dominio)),
      };
    });
    return {
      ...c, ejecutada, resultados: ejecutada ? resultados : [],
      anioFundacion: texto(r.anioFundacion), dotacion: texto(r.dotacion),
      nota: ejecutada ? texto(r.nota) : 'la búsqueda no figura entre las que ejecutó Google',
    };
  });
}

export async function buscarRondaB(consultas: Consulta[], nombre: string, identificador: string, sitio: string): Promise<Busqueda[]> {
  if (!consultas.length) return [];
  const r = await cliente().models.generateContent({
    model: MODELO_REVISION_WEB,
    contents: [{ role: 'user', parts: [{ text: promptBusqueda(consultas, nombre, identificador, sitio) }] }],
    config: { temperature: 0, tools: [{ googleSearch: {} }] },
  });
  const meta = r.candidates?.[0]?.groundingMetadata;
  const fuentes = fuentesDeGrounding(meta);
  const corridas = Array.isArray(meta?.webSearchQueries) ? meta!.webSearchQueries! : [];
  return armarBusquedas(consultas, extraerJson(r.text || ''), fuentes, corridas);
}
