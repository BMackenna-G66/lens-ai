// REVISIÓN WEB — el SCREENING de punta a punta (§5 a §9). Objetivo: < 60 s.
//
//   Paso 0  → riesgo inherente, de lo que cargó el analista
//   Ronda A → las 4 lecturas en paralelo (Worker) y UNA extracción (modelo)
//   Reglas  → hallazgos y gatillos en código. Un gatillo CORTA acá: sin Ronda B
//   Ronda B → hasta 5 búsquedas armadas por el código, UNA llamada con búsqueda
//   Cierre  → puntaje, severidad, decisión y la salida de cuatro bloques
//
// No hay Ronda C: lo que no se resolvió queda «no verificable» (§5, regla 1).

import { buscarRondaB, extraerRondaA } from './gemini';
import { contactosDeEnlaces, enlaces, formularios, htmlATexto } from './html';
import { leerSitio, normalizarUrl } from './lector';
import { evaluarRondaA, evaluarRondaB, type EvaluacionB } from './evaluacion';
import { armarConsultas, nombreDe } from './busquedas';
import { riesgoDeSuma, sumaPaso0, UMBRAL } from './paso0';
import { acreditacionDe, calcularDimensiones, decidir, lecturaDe, ordenarHallazgos, siguientePasoDe } from './puntaje';
import { guardarRevision } from './almacen';
import type { Avance, Busqueda, Entrada, Extraccion, Formulario, Resultado } from './tipos';

export async function ejecutarRevision(entrada: Entrada, avisar: (a: Avance) => void = () => {}): Promise<Resultado> {
  const t0 = Date.now();
  const url = normalizarUrl(entrada.url);

  // ── Paso 0 ──────────────────────────────────────────────────────────────
  const suma = sumaPaso0(entrada.factores);
  const riesgo = riesgoDeSuma(suma);
  avisar({ etapa: 'paso0', texto: `Riesgo inherente ${riesgo} (suma ${suma}); umbral ${UMBRAL[riesgo]}.`, listo: true });

  // ── Ronda A · lectura ───────────────────────────────────────────────────
  avisar({ etapa: 'rondaA_lectura', texto: 'Leyendo el sitio: inicio, términos, privacidad y nosotros/contacto…', listo: false });
  const { inicio, paginas } = await leerSitio(url);
  const leidas = paginas.filter(p => p.lectura);
  avisar({ etapa: 'rondaA_lectura', texto: `${leidas.length} de 4 páginas leídas.`, listo: true });

  const conHtml = paginas.filter(p => p.lectura?.html);
  const htmlTotal = conHtml.map(p => p.lectura!.html!).join('\n');
  const textos = conHtml.map(p => ({ slot: p.slot, url: p.url, texto: htmlATexto(p.lectura!.html!) }));
  const textoTotal = textos.map(t => t.texto).join('\n');
  const forms: Formulario[] = conHtml.flatMap(p => formularios(p.lectura!.html!, p.lectura!.urlFinal || url, p.slot));
  const contactos = contactosDeEnlaces(conHtml.flatMap(p => enlaces(p.lectura!.html!, p.lectura!.urlFinal || url)));

  // ── Ronda A · extracción ────────────────────────────────────────────────
  let extraccion: Extraccion | null = null;
  if (textoTotal) {
    avisar({ etapa: 'rondaA_extraccion', texto: 'Extrayendo identidad, contacto y textos legales…', listo: false });
    extraccion = await extraerRondaA(textos);
    avisar({ etapa: 'rondaA_extraccion', texto: `Extraído: ${nombreDe(extraccion) || 'sin razón social'}${extraccion.identificador ? ` · ${extraccion.identificador}` : ''}.`, listo: true });
  } else {
    avisar({ etapa: 'rondaA_extraccion', texto: 'Sin texto que extraer.', listo: true });
  }

  // ── Reglas ──────────────────────────────────────────────────────────────
  const a = evaluarRondaA({
    urlPedida: url, jurisdiccionEsperada: entrada.jurisdiccion, inicio, paginas, htmlTotal, textoTotal,
    formularios: forms, contactos, extraccion,
  });
  avisar({ etapa: 'reglas', texto: a.gatillos.length ? `Gatillo ${a.gatillos[0].numero} en la Ronda A: se corta sin Ronda B.` : `${a.hallazgos.length} hallazgo(s) en la Ronda A; sin gatillos.`, listo: true });

  // ── Ronda B ─────────────────────────────────────────────────────────────
  let busquedas: Busqueda[] = [];
  let b: EvaluacionB | null = null;
  let rondaB: Resultado['rondaB'] = 'ejecutada';
  const noVerificable = [...a.noVerificable];
  if (a.gatillos.length) {
    rondaB = 'omitida_por_gatillo';
  } else if (!extraccion || (!extraccion.identificador && !nombreDe(extraccion))) {
    rondaB = 'sin_datos_para_buscar';
    noVerificable.push('Ronda B: el sitio no publica identificador ni razón social que buscar.');
  } else {
    const consultas = armarConsultas(extraccion, a.jurisdiccion, a.plantilla.length > 0);
    avisar({ etapa: 'rondaB', texto: `Buscando en la web (${consultas.length} búsquedas)…`, listo: false });
    try {
      busquedas = await buscarRondaB(consultas, nombreDe(extraccion), extraccion.identificador, a.dominio.registrable);
      b = evaluarRondaB(busquedas, a, extraccion);
      noVerificable.push(...b.noVerificable);
      avisar({ etapa: 'rondaB', texto: `${busquedas.filter(x => x.ejecutada).length} de ${consultas.length} búsquedas ejecutadas.`, listo: true });
    } catch (e) {
      // §5 regla 4: si una consulta falla, se declara. No se rellena.
      rondaB = 'fallida';
      noVerificable.push(`Ronda B: la búsqueda falló (${(e as Error)?.message || e}).`);
      avisar({ etapa: 'rondaB', texto: 'La búsqueda falló: lo que dependía de ella queda no verificable.', listo: true });
    }
  }

  // ── Cierre ──────────────────────────────────────────────────────────────
  const gatillos = [...a.gatillos, ...(b?.gatillos || [])];
  const hallazgos = ordenarHallazgos([...a.hallazgos, ...(b?.hallazgos || [])]);
  const dimensiones = calcularDimensiones(a, b, extraccion);
  for (const d of dimensiones) if (d.estado === 'no_verificable') noVerificable.push(`${d.nombre}: no verificable (${d.justificacion})`);
  const acreditacion = acreditacionDe(dimensiones);
  const v = decidir(riesgo, acreditacion, gatillos, hallazgos);
  avisar({ etapa: 'decision', texto: `${v.decision} · ${acreditacion} / 100.`, listo: true });

  const resultado: Resultado = {
    id: `rw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: new Date().toISOString(),
    entrada: { ...entrada, url },
    sitio: a.dominio.registrable || a.hostSitio,
    riesgo, sumaPaso0: suma, umbral: UMBRAL[riesgo], acreditacion, decision: v.decision,
    gatillos, hallazgos, noVerificable: [...new Set(noVerificable)],
    lectura: lecturaDe(v, riesgo, acreditacion, gatillos, hallazgos, dimensiones),
    siguientePaso: siguientePasoDe(v, riesgo, gatillos, a.jurisdiccion),
    dimensiones,
    paginas: paginas.map(p => ({ slot: p.slot, url: p.url, status: p.lectura?.status ?? null, error: p.lectura?.error ?? (p.lectura ? null : 'no encontrada') })),
    busquedas, rondaB, extraccion,
    ms: Date.now() - t0,
  };
  await guardarRevision(resultado).catch(() => { /* el resultado se muestra igual */ });
  return resultado;
}
