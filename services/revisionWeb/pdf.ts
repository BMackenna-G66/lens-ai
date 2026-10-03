// REVISIÓN WEB — el resultado en PDF, fechado. Propio de este módulo: no usa el
// generador de PDF de las fichas.
//
// Primero los cuatro bloques del SCREENING (§12), en ese orden y nada antes del
// encabezado. Después, como anexo, lo que permite rastrear cada cifra: el
// puntaje por dimensión, las páginas leídas y las búsquedas con sus fuentes.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ETIQUETA_USO } from './paso0';
import { kpi } from './puntaje';
import type { Resultado } from './tipos';

const fechaLocal = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });

export function exportarPdf(r: Resultado): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margen = 40;
  let y = margen;
  const ancho = doc.internal.pageSize.getWidth() - margen * 2;
  const siguienteY = () => ((doc as any).lastAutoTable?.finalY ?? y) + 16;

  doc.setFont('helvetica', 'bold').setFontSize(14).text('Revisión web de contraparte — SCREENING', margen, y);
  y += 16;
  doc.setFont('helvetica', 'normal').setFontSize(9)
    .text(`${r.entrada.url} · ${ETIQUETA_USO[r.entrada.uso]}${r.entrada.jurisdiccion ? ` · ${r.entrada.jurisdiccion}` : ''} · ${fechaLocal(r.fecha)}`, margen, y);
  y += 12;

  // 1 · Encabezado KPI
  const k = kpi(r);
  autoTable(doc, {
    startY: y, margin: { left: margen, right: margen },
    head: [['DECISIÓN', 'Acreditación', 'Umbral exigido', 'Riesgo inherente', 'Gatillos de rechazo', 'Hallazgos MAYOR / CRITICO']],
    body: [[k.decision, k.acreditacion, k.umbral, k.riesgo, k.gatillos, k.severos]],
    styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] }, bodyStyles: { fontStyle: 'bold' },
  });
  y = siguienteY();
  doc.setFontSize(9).text(doc.splitTextToSize(r.lectura, ancho), margen, y);
  y += 12 * doc.splitTextToSize(r.lectura, ancho).length + 6;

  // 2 · Hallazgos (máx. 6)
  autoTable(doc, {
    startY: y, margin: { left: margen, right: margen },
    head: [['Severidad', 'Hallazgo', 'Fuente']],
    body: r.hallazgos.slice(0, 6).map(h => [h.severidad, h.texto, h.fuente]),
    styles: { fontSize: 8, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 60 }, 2: { cellWidth: 140 } },
  });
  y = siguienteY();

  // 3 · No verificable
  autoTable(doc, {
    startY: y, margin: { left: margen, right: margen },
    head: [['No verificable']], body: (r.noVerificable.length ? r.noVerificable : ['—']).map(x => [x]),
    styles: { fontSize: 8 },
  });
  y = siguienteY();

  // 4 · Siguiente paso
  doc.setFont('helvetica', 'bold').setFontSize(9).text('Siguiente paso', margen, y);
  y += 12;
  doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(r.siguientePaso, ancho), margen, y);

  // ── Anexo: trazabilidad ────────────────────────────────────────────────
  doc.addPage();
  y = margen;
  doc.setFont('helvetica', 'bold').setFontSize(11).text('Anexo — de dónde sale cada cifra', margen, y);
  autoTable(doc, {
    startY: y + 10, margin: { left: margen, right: margen },
    head: [['Dimensión', 'Puntos', 'Estado', 'Justificación']],
    // La que no aplica va sin puntos: salió del cálculo y la acreditación se
    // escaló sobre las demás.
    body: r.dimensiones.map(d => [d.nombre, d.estado === 'no_aplica' ? 'no aplica' : `${d.puntos} / ${d.max}`, d.estado.replace('_', ' '), d.justificacion]),
    styles: { fontSize: 8, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 50 }, 2: { cellWidth: 70 } },
  });
  autoTable(doc, {
    startY: siguienteY(), margin: { left: margen, right: margen },
    head: [['Página (Ronda A)', 'URL leída', 'Status / error']],
    body: r.paginas.map(p => [p.slot, p.url || '—', p.error || String(p.status ?? '—')]),
    styles: { fontSize: 8, overflow: 'linebreak' },
  });
  autoTable(doc, {
    startY: siguienteY(), margin: { left: margen, right: margen },
    head: [['Prioridad', 'Búsqueda (Ronda B)', 'Ejecutada', 'Fuentes con respaldo']],
    body: r.busquedas.length
      ? r.busquedas.map(b => [String(b.prioridad), b.consulta, b.ejecutada ? 'sí' : 'no', b.resultados.filter(x => x.conFuente).map(x => x.url || x.dominio).join('\n') || '—'])
      : [['—', r.rondaB === 'omitida_por_gatillo' ? 'Omitida: gatillo en la Ronda A' : r.rondaB === 'fallida' ? 'Falló la búsqueda' : 'Sin datos para buscar', '—', '—']],
    styles: { fontSize: 8, overflow: 'linebreak' },
  });
  doc.setFontSize(7).text(`Paso 0: suma ${r.sumaPaso0} · Duración ${Math.round(r.ms / 1000)} s · Las búsquedas son fotos del día (§14).`, margen, siguienteY());

  doc.save(`revision-web_${r.sitio || 'sitio'}_${r.fecha.slice(0, 10)}.pdf`);
}
