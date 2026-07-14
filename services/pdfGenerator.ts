
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExtractedField, CryptoWalletProfile, ComplianceAnalysisResult, FinancialDocumentProcess, FinancialDocumentType } from '../types';
import { Lens360Result, RegcheqEnrichment } from '../types/lens360';
import { ColombiaProfile, buildTimeline } from './colombiaCriminalParser';
import { ValidationAlert, SEVERITY_META } from './validationRules';

// Convierte el color hex de una severidad a tripleta RGB para jsPDF.
const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};

// Dibuja el bloque "Alertas de Validación" en un PDF. Devuelve la nueva Y.
// Compartido por el analizador individual, el batch y la Vista 360°.
const drawValidationAlerts = (
  doc: jsPDF, alerts: ValidationAlert[] | undefined, margin: number, pageWidth: number, startY: number
): number => {
  if (!alerts || !alerts.length) return startY;
  let y = startY;
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 41, 59);
  doc.text('Alertas de Validación', margin, y); y += 5;
  doc.setFontSize(8);
  for (const a of alerts) {
    if (y > pageHeight - 25) { doc.addPage(); y = 20; }
    const meta = SEVERITY_META[a.severity];
    const [r, g, b] = hexToRgb(meta.hex);
    doc.setTextColor(r, g, b); doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(`[${meta.label}] ${a.title} — ${a.detail}`, pageWidth - margin * 2 - 3);
    doc.text('•', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, margin + 3, y);
    y += lines.length * 4.2 + 1.5;
  }
  doc.setTextColor(30, 41, 59);
  return y + 2;
};

// Colors
const NAVY = [30, 58, 95] as [number, number, number];       // #1e3a5f
const INDIGO = [79, 70, 229] as [number, number, number];    // #4f46e5
const LIGHT_GRAY = [248, 249, 250] as [number, number, number];
const MID_GRAY = [100, 116, 139] as [number, number, number];
const DARK_TEXT = [30, 41, 59] as [number, number, number];
const WHITE = [255, 255, 255] as [number, number, number];

const loadLogoBase64 = async (): Promise<string | null> => {
  try {
    // Try both paths (dev and GitHub Pages)
    const paths = ['/logo_global.jpg', '/lens-ai/logo_global.jpg'];
    for (const path of paths) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          const blob = await res.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch { continue; }
    }
    return null;
  } catch {
    return null;
  }
};

const addPageFooter = (doc: jsPDF, pageNum: number, totalPages: number, date: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(...NAVY);
  doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...WHITE);
  doc.text('LENS AI · Powered by Google Gemini · Team Compliance Global66', 14, pageHeight - 5);
  doc.text(`Página ${pageNum} de ${totalPages} · ${date}`, pageWidth - 14, pageHeight - 5, { align: 'right' });
};

export const generatePdf = async (
  fileName: string,
  data: ExtractedField[],
  executiveSummary?: string,
  enrichment?: RegcheqEnrichment,
): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');

  // --- HEADER ---
  // Background
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Accent line
  doc.setFillColor(...INDIGO);
  doc.rect(0, 38, pageWidth, 2, 'F');

  // Try to add logo
  const logoData = await loadLogoBase64();
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', pageWidth - 58, 8, 44, 13);
    } catch (e) {
      // Logo failed, continue without it
    }
  }

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text('REPORTE DE ANÁLISIS LEGAL', margin, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(196, 210, 230);
  doc.text('Analizador de Escrituras Públicas · LENS AI', margin, 23);

  // --- DOCUMENT INFO BOX ---
  doc.setFillColor(...LIGHT_GRAY);
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, 46, pageWidth - margin * 2, 22, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MID_GRAY);
  doc.text('DOCUMENTO ANALIZADO', margin + 4, 53);
  doc.text('FECHA DE GENERACIÓN', pageWidth / 2, 53);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);

  const cleanFileName = fileName.length > 55 ? fileName.substring(0, 52) + '...' : fileName;
  doc.text(cleanFileName, margin + 4, 61);
  doc.text(generationDate, pageWidth / 2, 61);

  // --- EXTRACTED FIELDS TABLE ---
  let currentY = 76;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('Campos Extraídos', margin, currentY);

  // small underline
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.5);
  doc.line(margin, currentY + 1.5, margin + 38, currentY + 1.5);

  currentY += 5;

  const tableData = data.map(item => [item.field, item.value || 'No especificado']);

  autoTable(doc, {
    startY: currentY,
    head: [['Campo', 'Valor Extraído']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontSize: 9,
      fontStyle: 'bold',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
      textColor: DARK_TEXT,
      lineColor: [220, 228, 240],
    },
    alternateRowStyles: {
      fillColor: [245, 247, 252],
    },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold', textColor: NAVY },
      1: { cellWidth: 'auto' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      addPageFooter(doc, data.pageNumber, 0, generationDate);
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // --- EXECUTIVE SUMMARY ---
  if (executiveSummary) {
    // Check if we need a new page
    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }

    // Summary title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Resumen Ejecutivo', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 42, currentY + 1.5);

    currentY += 6;

    // Summary box
    const summaryLines = doc.splitTextToSize(executiveSummary, pageWidth - margin * 2 - 12);
    const boxHeight = summaryLines.length * 4.5 + 12;

    doc.setFillColor(240, 244, 255);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, boxHeight, 2, 2, 'FD');

    // Left accent bar
    doc.setFillColor(...INDIGO);
    doc.rect(margin, currentY, 3, boxHeight, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_TEXT);
    doc.text(summaryLines, margin + 7, currentY + 7);

    currentY += boxHeight + 6;
  }

  // --- CONSULTA REGCHEQ (AML + SII) ---
  if (enrichment && enrichment.encontrado) {
    if (currentY > 235) { doc.addPage(); currentY = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('Consulta Regcheq — AML + SII', margin, currentY);
    doc.setDrawColor(...INDIGO); doc.setLineWidth(0.5); doc.line(margin, currentY + 1.5, margin + 60, currentY + 1.5);
    currentY += 6;

    // Alertas de validación (motor de reglas)
    currentY = drawValidationAlerts(doc, enrichment.alerts, margin, pageWidth, currentY);

    // Screening AML
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK_TEXT);
    const coincid = enrichment.amlHits.filter(h => h.coincidence).map(h => h.nombre);
    const amlTxt = `Riesgo Regcheq: ${enrichment.regcheqRisk || '—'}${enrichment.pepLevel ? ` · PEP: ${enrichment.pepLevel}` : ''}\nCoincidencias AML: ${coincid.length ? coincid.join(', ') : 'ninguna'}`;
    const amlLines = doc.splitTextToSize(amlTxt, pageWidth - margin * 2);
    doc.text(amlLines, margin, currentY); currentY += amlLines.length * 4.5 + 3;

    // SII
    const t = enrichment.tributaria;
    if (t) {
      const siiTxt = `SII — RUT: ${t.rutContribuyente || '—'} · Inicio actividades: ${t.presentaInicioActividades || '—'}${t.fechaInicioActividades ? ` (${t.fechaInicioActividades.slice(0, 10)})` : ''} · Empresa menor tamaño: ${t.empresaMenorTamano || '—'}`;
      const siiLines = doc.splitTextToSize(siiTxt, pageWidth - margin * 2);
      doc.text(siiLines, margin, currentY); currentY += siiLines.length * 4.5 + 2;
      if (t.situacionesIrregulares.length) {
        doc.setTextColor(146, 64, 14);
        const irr = doc.splitTextToSize(`Situaciones irregulares: ${t.situacionesIrregulares.join(' · ')}`, pageWidth - margin * 2);
        doc.text(irr, margin, currentY); currentY += irr.length * 4.5 + 2; doc.setTextColor(...DARK_TEXT);
      }
      if (t.actividades.length) {
        autoTable(doc, {
          startY: currentY,
          head: [['Código', 'Actividad', 'Categoría', 'Fecha', 'IVA']],
          body: t.actividades.map(a => [a.code, a.name, a.category, a.date ? a.date.slice(0, 10) : '', a.afectoIva]),
          theme: 'grid', headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5, textColor: DARK_TEXT }, columnStyles: { 1: { cellWidth: 70 } },
          margin: { left: margin, right: margin },
          didDrawPage: (d) => addPageFooter(doc, d.pageNumber, 0, generationDate),
        });
        currentY = (doc as any).lastAutoTable.finalY + 6;
      }
    }
  }

  // --- DISCLAIMER ---
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY < pageHeight - 35) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(160, 174, 192);
    const disclaimer = 'Este reporte fue generado automáticamente mediante inteligencia artificial. Su contenido debe ser verificado por un profesional legal antes de tomar decisiones. LENS AI y Global66 no se responsabilizan por decisiones basadas únicamente en este documento.';
    const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - margin * 2);
    doc.text(disclaimerLines, margin, Math.max(currentY, pageHeight - 28));
  }

  // Fix footer page count (re-draw footers with correct total)
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, generationDate);
  }

  doc.save(`${fileName.replace(/[^a-z0-9 _\-]/gi, '_')}.pdf`);
};

/**
 * Generates a Forensic PDF Report for Crypto Wallets
 */
export const generateCryptoPdf = (data: CryptoWalletProfile): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');

  // Header - Purple Theme
  doc.setFillColor(139, 92, 246);
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text("LENS - CRYPTO FORENSIC REPORT", margin, 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado el: ${generationDate} · Team Compliance Global66`, margin, 32);

  let currentY = 52;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text("1. IDENTIDAD DE LA BILLETERA", margin, currentY);

  currentY += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text("Dirección:", margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.address, margin + 24, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text("Red:", margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.network, margin + 24, currentY);

  currentY += 14;
  const riskColor: [number,number,number] = data.riskAssessment?.riskLevel === 'BAJO' ? [16, 185, 129] : [225, 29, 72];
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text("2. EVALUACIÓN DE RIESGO IA", margin, currentY);

  currentY += 6;
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 32, 'F');

  doc.setFontSize(11);
  doc.setTextColor(...riskColor);
  doc.setFont('helvetica', 'bold');
  doc.text(`NIVEL DE RIESGO: ${data.riskAssessment?.riskLevel || 'BAJO'} (${data.riskAssessment?.riskScore || 0}/100)`, margin + 4, currentY + 9);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(data.riskAssessment?.summaryAnalysis || "No hay análisis disponible.", pageWidth - (margin * 2) - 8);
  doc.text(summaryLines, margin + 4, currentY + 17);

  currentY += 42;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text("3. RESUMEN FINANCIERO (USD)", margin, currentY);

  const financialData = [
    ["Patrimonio Neto Est.", `$ ${data.netWorthUSD.toLocaleString()}`],
    ["Total Recibido", `$ ${data.totalReceivedUSD.toLocaleString()}`],
    ["Total Enviado", `$ ${data.totalSentUSD.toLocaleString()}`],
    ["Balance Nativo", `${data.nativeBalance.toLocaleString()} ${data.network === 'TRON' ? 'TRX' : 'ETH'}`],
    ["Transacciones Totales", data.totalTxCount.toString()],
    ["Días Activos", data.activeDays.toString()]
  ];

  autoTable(doc, {
    startY: currentY + 4,
    body: financialData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } },
    headStyles: { fillColor: [139, 92, 246] },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text("4. PATRONES DE COMPORTAMIENTO", margin, currentY);

  const patternData = (data.riskAssessment?.patternsDetected || []).map(p => [
    p.name, p.detected ? "DETECTADO" : "No detectado", p.description
  ]);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Patrón', 'Estado', 'Descripción']],
    body: patternData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [139, 92, 246] },
  });

  doc.addPage();
  currentY = 20;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text("5. ÚLTIMOS MOVIMIENTOS", margin, currentY);

  const txData = data.transactions.slice(0, 30).map(tx => [
    new Date(tx.timeStamp).toLocaleDateString(),
    tx.hash.substring(0, 14) + "...",
    tx.from.substring(0, 10) + "...",
    tx.to.substring(0, 10) + "...",
    `${tx.value.toLocaleString()} ${tx.tokenSymbol || '??'}`
  ]);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Fecha', 'Hash', 'Desde', 'Hacia', 'Valor']],
    body: txData,
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`Forense_Crypto_${data.network}_${data.address.substring(0, 8)}.pdf`);
};

// ---------------------------------------------------------------------------
// COMPLIANCE AML PDF
// ---------------------------------------------------------------------------

export const generateCompliancePdf = async (
  result: ComplianceAnalysisResult,
  fileNames: string[]
): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');

  // --- HEADER ---
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setFillColor(...INDIGO);
  doc.rect(0, 38, pageWidth, 2, 'F');

  const logoData = await loadLogoBase64();
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', pageWidth - 58, 8, 44, 13);
    } catch (_e) {
      // Logo failed, continue without it
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text('EVALUADOR DE CUMPLIMIENTO AML', margin, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(196, 210, 230);
  doc.text('Auditoría bajo Estándar Global66 (GAFI/GAFILAT)', margin, 23);

  // --- DOCUMENT INFO BOX ---
  doc.setFillColor(...LIGHT_GRAY);
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, 46, pageWidth - margin * 2, 22, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MID_GRAY);
  doc.text('DOCUMENTOS ANALIZADOS', margin + 4, 53);
  doc.text('FECHA DE GENERACIÓN', pageWidth / 2, 53);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);

  const filesLabel = fileNames.join(', ');
  const cleanFilesLabel = filesLabel.length > 55 ? filesLabel.substring(0, 52) + '...' : filesLabel;
  doc.text(cleanFilesLabel, margin + 4, 61);
  doc.text(generationDate, pageWidth / 2, 61);

  // --- DICTAMEN BOX ---
  let currentY = 76;

  const dictumUpper = result.onboardingDictum.toUpperCase();
  let dictumFill: [number, number, number];
  let dictumTextColor: [number, number, number];
  if (result.onboardingDictum === 'Apto') {
    dictumFill = [209, 250, 229];
    dictumTextColor = [6, 95, 70];
  } else if (result.onboardingDictum === 'Apto con condiciones') {
    dictumFill = [254, 243, 199];
    dictumTextColor = [120, 53, 15];
  } else {
    dictumFill = [254, 226, 226];
    dictumTextColor = [127, 29, 29];
  }

  doc.setFillColor(...dictumFill);
  doc.setDrawColor(...dictumTextColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...dictumTextColor);
  doc.text(`Dictamen: ${dictumUpper}`, margin + 6, currentY + 12);

  currentY += 24;

  // Justification
  if (result.dictumJustification) {
    const justLines = doc.splitTextToSize(result.dictumJustification, pageWidth - margin * 2 - 12);
    const justBoxH = justLines.length * 4.5 + 10;
    doc.setFillColor(240, 244, 255);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, justBoxH, 2, 2, 'FD');
    doc.setFillColor(...INDIGO);
    doc.rect(margin, currentY, 3, justBoxH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_TEXT);
    doc.text(justLines, margin + 7, currentY + 7);
    currentY += justBoxH + 6;
  }

  // --- SUMMARY ---
  if (result.summary) {
    if (currentY > 220) { doc.addPage(); currentY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Resumen', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 25, currentY + 1.5);
    currentY += 5;

    const summLines = doc.splitTextToSize(result.summary, pageWidth - margin * 2 - 12);
    const summBoxH = summLines.length * 4.5 + 10;
    doc.setFillColor(...LIGHT_GRAY);
    doc.setDrawColor(220, 228, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, summBoxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_TEXT);
    doc.text(summLines, margin + 4, currentY + 7);
    currentY += summBoxH + 8;
  }

  // --- COMPARISON TABLE ---
  if (result.comparisonTable && result.comparisonTable.length > 0) {
    if (currentY > 230) { doc.addPage(); currentY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Tabla Comparativa de Pilares', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 62, currentY + 1.5);
    currentY += 5;

    const tableBody = result.comparisonTable.map(row => [
      row.pillar,
      row.status,
      row.evidence,
      row.risk,
      row.recommendation,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Pilar', 'Estado', 'Evidencia', 'Riesgo', 'Recomendación']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7.5,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        textColor: DARK_TEXT,
        lineColor: [220, 228, 240],
      },
      alternateRowStyles: {
        fillColor: [245, 247, 252],
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 22 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 28 },
        4: { cellWidth: 35 },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.column.index === 1 && data.section === 'body') {
          const val = data.cell.raw as string;
          if (val === 'Cumple') {
            data.cell.styles.textColor = [6, 95, 70];
            data.cell.styles.fillColor = [209, 250, 229];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'Parcial') {
            data.cell.styles.textColor = [120, 53, 15];
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'No cumple') {
            data.cell.styles.textColor = [127, 29, 29];
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawPage: (data) => {
        addPageFooter(doc, data.pageNumber, 0, generationDate);
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // --- GAPS ---
  if (result.gaps && result.gaps.length > 0) {
    if (currentY > 230) { doc.addPage(); currentY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Brechas Identificadas', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 50, currentY + 1.5);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_TEXT);
    for (const gap of result.gaps) {
      if (currentY > 270) { doc.addPage(); currentY = 20; }
      const gapLines = doc.splitTextToSize(`• ${gap}`, pageWidth - margin * 2 - 6);
      doc.text(gapLines, margin + 3, currentY);
      currentY += gapLines.length * 4.5 + 1.5;
    }
    currentY += 4;
  }

  // --- SPECIFIC RECOMMENDATIONS ---
  if (result.specificRecommendations && result.specificRecommendations.length > 0) {
    if (currentY > 230) { doc.addPage(); currentY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Recomendaciones Específicas', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 66, currentY + 1.5);
    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_TEXT);
    for (const rec of result.specificRecommendations) {
      if (currentY > 270) { doc.addPage(); currentY = 20; }
      const recLines = doc.splitTextToSize(`• ${rec}`, pageWidth - margin * 2 - 6);
      doc.text(recLines, margin + 3, currentY);
      currentY += recLines.length * 4.5 + 1.5;
    }
  }

  // Fix footer page count
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, generationDate);
  }

  doc.save(`Compliance_AML_${Date.now()}.pdf`);
};

// ---------------------------------------------------------------------------
// FINANCIAL PDF
// ---------------------------------------------------------------------------

const formatCurrency = (value: number | null | undefined, currencyCode?: string): string => {
  if (value === null || value === undefined) return 'N/D';
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: currencyCode || 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(value);
  }
};

export const generateFinancialPdf = async (doc_in: FinancialDocumentProcess): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');

  const subtitleMap: Record<FinancialDocumentType, string> = {
    financial_statement: 'Estado Financiero',
    bank_statement: 'Cartola Bancaria',
    tax_folder: 'Carpeta Tributaria SII',
    mixed: 'Análisis Combinado',
  };
  const subtitle = subtitleMap[doc_in.docType] ?? doc_in.docType;

  // --- HEADER ---
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setFillColor(...INDIGO);
  doc.rect(0, 38, pageWidth, 2, 'F');

  const logoData = await loadLogoBase64();
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', pageWidth - 58, 8, 44, 13);
    } catch (_e) {
      // Logo failed, continue without it
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text('ANÁLISIS FINANCIERO – LÍMITES TRANSACCIONALES', margin, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(196, 210, 230);
  doc.text(subtitle, margin, 23);

  // --- DOCUMENT INFO BOX ---
  doc.setFillColor(...LIGHT_GRAY);
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, 46, pageWidth - margin * 2, 22, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MID_GRAY);
  doc.text('DOCUMENTO ANALIZADO', margin + 4, 53);
  doc.text('FECHA DE GENERACIÓN', pageWidth / 2, 53);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);

  const cleanFileName = doc_in.fileName.length > 55
    ? doc_in.fileName.substring(0, 52) + '...'
    : doc_in.fileName;
  doc.text(cleanFileName, margin + 4, 61);
  doc.text(generationDate, pageWidth / 2, 61);

  let currentY = 76;

  // ---- financial_statement ----
  if (doc_in.docType === 'financial_statement' && doc_in.financialResult) {
    const fr = doc_in.financialResult;
    const cur = fr.currencyCode;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(`Empresa: ${fr.companyName}`, margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 60, currentY + 1.5);
    currentY += 7;

    // Metrics table: rows = metrics, columns = years
    const metricLabels = [
      'Ingresos Operativos',
      'Activo Corriente',
      'Pasivo Corriente',
      'Capital de Trabajo',
      'Total Efectivo',
      'Razón Corriente',
      'Prueba Ácida',
      'Razón de Efectivo',
    ];

    const yearHeaders = fr.years.map(y => y.year);
    const head = [['Métrica', ...yearHeaders]];

    const bodyRows = metricLabels.map(label => {
      const row: string[] = [label];
      for (const yd of fr.years) {
        const d = yd.data;
        let val: string;
        if (label === 'Ingresos Operativos') val = formatCurrency(d.ingresosOperativos, cur);
        else if (label === 'Activo Corriente') val = formatCurrency(d.activoCorriente, cur);
        else if (label === 'Pasivo Corriente') val = formatCurrency(d.pasivoCorriente, cur);
        else if (label === 'Capital de Trabajo') val = formatCurrency(d.capitalTrabajoNeto, cur);
        else if (label === 'Total Efectivo') val = formatCurrency(d.totalEfectivoEquivalentes, cur);
        else if (label === 'Razón Corriente') {
          val = d.pasivoCorriente !== 0
            ? (d.activoCorriente / d.pasivoCorriente).toFixed(2)
            : 'N/D';
        } else if (label === 'Prueba Ácida') {
          val = d.pasivoCorriente !== 0
            ? ((d.activoCorriente - d.inventarios) / d.pasivoCorriente).toFixed(2)
            : 'N/D';
        } else if (label === 'Razón de Efectivo') {
          val = d.pasivoCorriente !== 0
            ? (d.totalEfectivoEquivalentes / d.pasivoCorriente).toFixed(2)
            : 'N/D';
        } else {
          val = '';
        }
        row.push(val);
      }
      return row;
    });

    autoTable(doc, {
      startY: currentY,
      head,
      body: bodyRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 }, textColor: DARK_TEXT, lineColor: [220, 228, 240] },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 55 } },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => { addPageFooter(doc, data.pageNumber, 0, generationDate); },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ---- bank_statement ----
  if (doc_in.docType === 'bank_statement' && doc_in.bankResult) {
    const br = doc_in.bankResult;
    const cur = br.currencyCode;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Resumen de Cartola Bancaria', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 60, currentY + 1.5);
    currentY += 5;

    const bankBody = br.summaries.map(s => [
      s.banco,
      s.mesAnio,
      formatCurrency(s.totalIngresos, cur),
      formatCurrency(s.totalEgresos, cur),
      formatCurrency(s.saldoCierre, cur),
      formatCurrency(s.promedioDiario, cur),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Banco', 'Período', 'Ingresos', 'Egresos', 'Saldo Final', 'Promedio Diario']],
      body: bankBody,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 }, textColor: DARK_TEXT, lineColor: [220, 228, 240] },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY } },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => { addPageFooter(doc, data.pageNumber, 0, generationDate); },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ---- tax_folder ----
  if (doc_in.docType === 'tax_folder' && doc_in.taxFolderResult) {
    const tf = doc_in.taxFolderResult;
    const id = tf.extraction?.identidad_contribuyente;

    // Identity box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Identidad del Contribuyente', margin, currentY);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 1.5, margin + 62, currentY + 1.5);
    currentY += 6;

    const idFields: [string, string][] = [
      ['Razón Social', id?.razon_social ?? 'N/D'],
      ['RUT', id?.rut ?? 'N/D'],
      ['Inicio Actividades', id?.fecha_inicio_actividades ?? 'N/D'],
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...DARK_TEXT);
    for (const [label, value] of idFields) {
      if (currentY > 270) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin + 2, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(value, margin + 42, currentY);
      currentY += 5.5;
    }
    currentY += 4;

    // KYB Checklist
    const checklist = tf.checklist?.kyb_checklist_carpeta_tributaria ?? [];
    if (checklist.length > 0) {
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text('Checklist KYB', margin, currentY);
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 1.5, margin + 30, currentY + 1.5);
      currentY += 5;

      const checkBody = checklist.map((item: any) => [
        item.item ?? '',
        item.estado ?? '',
        item.hallazgo ?? '',
        item.accion_recomendada ?? '',
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Item', 'Estado', 'Hallazgo', 'Acción']],
        body: checkBody,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8.5, fontStyle: 'bold', cellPadding: 3 },
        bodyStyles: { fontSize: 7.5, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: DARK_TEXT, lineColor: [220, 228, 240] },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY },
          1: { cellWidth: 20 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 40 },
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.column.index === 1 && data.section === 'body') {
            const v = data.cell.raw as string;
            if (v === 'PASS') { data.cell.styles.textColor = [6, 95, 70]; data.cell.styles.fillColor = [209, 250, 229]; data.cell.styles.fontStyle = 'bold'; }
            else if (v === 'REVIEW') { data.cell.styles.textColor = [120, 53, 15]; data.cell.styles.fillColor = [254, 243, 199]; data.cell.styles.fontStyle = 'bold'; }
            else if (v === 'FAIL') { data.cell.styles.textColor = [127, 29, 29]; data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.fontStyle = 'bold'; }
          }
        },
        didDrawPage: (data) => { addPageFooter(doc, data.pageNumber, 0, generationDate); },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Origen de Fondos
    const fo = tf.funds_origin?.capacidad_economica_tributaria_proxy;
    if (fo) {
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text('Origen de Fondos', margin, currentY);
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 1.5, margin + 42, currentY + 1.5);
      currentY += 6;

      const foFields: [string, string][] = [
        ['Exportaciones Total', formatCurrency(fo.exportaciones_total)],
        ['PPM Total', formatCurrency(fo.ppm_total)],
        ['Período', `${fo.periodo_desde ?? 'N/D'} — ${fo.periodo_hasta ?? 'N/D'}`],
      ];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...DARK_TEXT);
      for (const [label, value] of foFields) {
        if (currentY > 270) { doc.addPage(); currentY = 20; }
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}:`, margin + 2, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(value, margin + 50, currentY);
        currentY += 5.5;
      }
      currentY += 4;
    }

    // Red Flags
    const redFlags = tf.funds_origin?.red_flags_carpeta_tributaria ?? [];
    if (redFlags.length > 0) {
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(127, 29, 29);
      doc.text('Red Flags', margin, currentY);
      doc.setDrawColor(127, 29, 29);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 1.5, margin + 22, currentY + 1.5);
      currentY += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK_TEXT);
      for (const flag of redFlags) {
        if (currentY > 270) { doc.addPage(); currentY = 20; }
        const flagText = `• [${flag.severidad ?? '?'}] ${flag.red_flag ?? ''}${flag.evidencia ? ' — ' + flag.evidencia : ''}`;
        const flagLines = doc.splitTextToSize(flagText, pageWidth - margin * 2 - 6);
        doc.text(flagLines, margin + 3, currentY);
        currentY += flagLines.length * 4.5 + 1.5;
      }
    }
  }

  // ---- combined (mixed) ----
  if (doc_in.docType === 'mixed' && doc_in.combinedResult) {
    const cr = doc_in.combinedResult;

    // Financial summary sub-table
    if (cr.financial) {
      const fr = cr.financial;
      const cur = fr.currencyCode;
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(`Estado Financiero — ${fr.companyName}`, margin, currentY);
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 1.5, margin + 80, currentY + 1.5);
      currentY += 5;

      const yearHeaders = fr.years.map(y => y.year);
      const finRows = ['Ingresos Operativos', 'Activo Corriente', 'Pasivo Corriente', 'Capital de Trabajo', 'Total Efectivo'].map(label => {
        const row: string[] = [label];
        for (const yd of fr.years) {
          const d = yd.data;
          if (label === 'Ingresos Operativos') row.push(formatCurrency(d.ingresosOperativos, cur));
          else if (label === 'Activo Corriente') row.push(formatCurrency(d.activoCorriente, cur));
          else if (label === 'Pasivo Corriente') row.push(formatCurrency(d.pasivoCorriente, cur));
          else if (label === 'Capital de Trabajo') row.push(formatCurrency(d.capitalTrabajoNeto, cur));
          else row.push(formatCurrency(d.totalEfectivoEquivalentes, cur));
        }
        return row;
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Métrica', ...yearHeaders]],
        body: finRows,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold', cellPadding: 3 },
        bodyStyles: { fontSize: 7.5, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: DARK_TEXT, lineColor: [220, 228, 240] },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 55 } },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => { addPageFooter(doc, data.pageNumber, 0, generationDate); },
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Bank summary sub-table
    if (cr.bank) {
      const br = cr.bank;
      const cur = br.currencyCode;
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text('Cartola Bancaria', margin, currentY);
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 1.5, margin + 38, currentY + 1.5);
      currentY += 5;

      const bankRows = br.summaries.map(s => [
        s.banco,
        s.mesAnio,
        formatCurrency(s.totalIngresos, cur),
        formatCurrency(s.totalEgresos, cur),
        formatCurrency(s.saldoCierre, cur),
        formatCurrency(s.promedioDiario, cur),
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Banco', 'Período', 'Ingresos', 'Egresos', 'Saldo Final', 'Promedio Diario']],
        body: bankRows,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold', cellPadding: 3 },
        bodyStyles: { fontSize: 7.5, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: DARK_TEXT, lineColor: [220, 228, 240] },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY } },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => { addPageFooter(doc, data.pageNumber, 0, generationDate); },
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Cross-check conclusion box
    if (cr.crossCheck) {
      const cc = cr.crossCheck;
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text('Conclusión de Cruce de Información', margin, currentY);
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 1.5, margin + 78, currentY + 1.5);
      currentY += 6;

      const conclusionLines = doc.splitTextToSize(cc.conclusion ?? '', pageWidth - margin * 2 - 12);
      const conclusionBoxH = conclusionLines.length * 4.5 + 22;
      doc.setFillColor(240, 244, 255);
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, currentY, pageWidth - margin * 2, conclusionBoxH, 2, 2, 'FD');
      doc.setFillColor(...INDIGO);
      doc.rect(margin, currentY, 3, conclusionBoxH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY);
      doc.text(`Coincidencia: ${cc.matchPercentage?.toFixed(1) ?? 'N/D'}%`, margin + 7, currentY + 7);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      doc.text(conclusionLines, margin + 7, currentY + 14);
      currentY += conclusionBoxH + 6;

      // Risk alerts
      if (cc.riskAlerts && cc.riskAlerts.length > 0) {
        if (currentY > 260) { doc.addPage(); currentY = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(127, 29, 29);
        doc.text('Alertas de Riesgo', margin, currentY);
        currentY += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...DARK_TEXT);
        for (const alert of cc.riskAlerts) {
          if (currentY > 270) { doc.addPage(); currentY = 20; }
          const alertLines = doc.splitTextToSize(`• ${alert}`, pageWidth - margin * 2 - 6);
          doc.text(alertLines, margin + 3, currentY);
          currentY += alertLines.length * 4.5 + 1.5;
        }
      }
    }
  }

  // Fix footer page count
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, generationDate);
  }

  doc.save(`Financiero_${doc_in.fileName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`);
};

// ─────────────────────────────────────────────────────────────────────────────
// generateComplianceVsManualPdf
// Branded PDF comparing an uploaded AML policy against the Global66 LAFT manual
// ─────────────────────────────────────────────────────────────────────────────
import { ComplianceVsManualResult } from '../types';

export const generateComplianceVsManualPdf = async (
  result: ComplianceVsManualResult,
  fileNames: string[]
): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');
  const logoBase64 = await loadLogoBase64();

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'JPEG', margin, 6, 38, 11); } catch { /* ok */ }
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('INFORME DE CUMPLIMIENTO AML', pageWidth / 2, 16, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Comparación contra Manual G81-MAN-003 v9.0 · Global66', pageWidth / 2, 23, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text(`Generado el ${generationDate}`, pageWidth / 2, 29, { align: 'center' });

  let y = 46;

  // ── Info box ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_GRAY);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 20, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text('Documentos evaluados:', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_GRAY);
  const filesText = fileNames.join(' · ') || 'Sin nombre';
  doc.text(doc.splitTextToSize(filesText, pageWidth - margin * 2 - 8), margin + 4, y + 13);
  y += 26;

  // ── Dictamen box ─────────────────────────────────────────────────────────────
  const dictumColor: [number, number, number] =
    result.dictamen === 'Alineado' ? [34, 197, 94] :
    result.dictamen === 'Parcialmente Alineado' ? [234, 179, 8] :
    [239, 68, 68];

  doc.setFillColor(...dictumColor);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(`DICTAMEN: ${result.dictamen.toUpperCase()}  ·  ${result.nivelCumplimientoGlobal}% de alineación`, pageWidth / 2, y + 9, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const justLines = doc.splitTextToSize(result.dictamenJustificacion, pageWidth - margin * 2 - 8);
  doc.text(justLines.slice(0, 1), pageWidth / 2, y + 16, { align: 'center' });
  y += 28;

  // ── Score bar ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text('Nivel de Cumplimiento Global', margin, y + 4);
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(margin, y + 7, pageWidth - margin * 2, 5, 2, 2, 'F');
  doc.setFillColor(...dictumColor);
  const barW = ((pageWidth - margin * 2) * result.nivelCumplimientoGlobal) / 100;
  doc.roundedRect(margin, y + 7, barW, 5, 2, 2, 'F');
  y += 18;

  // ── Resumen general ──────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('Resumen General', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  const summaryLines = doc.splitTextToSize(result.resumenGeneral, pageWidth - margin * 2);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 4.5 + 6;

  // ── Pillar table ─────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('Comparación por Pilar — Manual G81-MAN-003 vs Documento Evaluado', margin, y);
  y += 5;

  const statusColorMap: Record<string, [number, number, number]> = {
    'Cumple': [34, 197, 94],
    'Cumple Parcialmente': [234, 179, 8],
    'No Cumple': [239, 68, 68],
    'No Aplica': [148, 163, 184],
  };
  const riskColorMap: Record<string, [number, number, number]> = {
    'Alto': [239, 68, 68],
    'Medio': [234, 179, 8],
    'Bajo': [59, 130, 246],
    'Sin Riesgo': [34, 197, 94],
  };

  autoTable(doc, {
    startY: y,
    head: [['Sección', 'Estado', 'Riesgo', 'Semejanzas', 'Diferencias / Brechas']],
    body: result.tablaPilares.map(p => [
      `${p.seccion}\n${p.referenciaManual}`,
      p.estadoDocumento,
      p.nivelRiesgo,
      p.semejanzas || '—',
      [p.diferencias, p.brechas ? `⚠ ${p.brechas}` : ''].filter(Boolean).join('\n') || '—',
    ]),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 45 },
      4: { cellWidth: 45 },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.column.index === 1) {
          const color = statusColorMap[data.cell.raw as string] || [148, 163, 184];
          data.cell.styles.textColor = color;
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 2) {
          const color = riskColorMap[data.cell.raw as string] || [148, 163, 184];
          data.cell.styles.textColor = color;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      const currentPage = data.pageNumber;
      addPageFooter(doc, currentPage, (doc as any).internal.pages.length - 1, generationDate);
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Add new page if needed
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // ── Semejanzas y Diferencias ─────────────────────────────────────────────────
  ensureSpace(30);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('Semejanzas Globales', margin, y);
  y += 5;
  for (const s of result.semejanzasGlobales) {
    ensureSpace(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK_TEXT);
    const lines = doc.splitTextToSize(`• ${s}`, pageWidth - margin * 2 - 4);
    doc.text(lines, margin + 3, y);
    y += lines.length * 4 + 1;
  }
  y += 6;

  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('Diferencias Identificadas', margin, y);
  y += 5;
  for (const d of result.diferenciasGlobales) {
    ensureSpace(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK_TEXT);
    const lines = doc.splitTextToSize(`• ${d}`, pageWidth - margin * 2 - 4);
    doc.text(lines, margin + 3, y);
    y += lines.length * 4 + 1;
  }
  y += 6;

  // ── Brechas críticas ─────────────────────────────────────────────────────────
  if (result.brechasCriticas.length > 0) {
    ensureSpace(30);
    doc.setFillColor(255, 240, 240);
    doc.setDrawColor(239, 68, 68);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 8 + result.brechasCriticas.length * 7, 3, 3, 'FD');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text('🚨 Brechas Críticas', margin + 4, y + 6);
    y += 10;
    for (const b of result.brechasCriticas) {
      const lines = doc.splitTextToSize(`• ${b}`, pageWidth - margin * 2 - 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(185, 28, 28);
      doc.text(lines, margin + 6, y);
      y += lines.length * 4 + 1;
    }
    y += 8;
  }

  // ── Recomendaciones ──────────────────────────────────────────────────────────
  ensureSpace(30);
  doc.setFillColor(238, 242, 255);
  doc.setDrawColor(...INDIGO);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 8 + result.recomendacionesPriorizadas.length * 7, 3, 3, 'FD');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('Recomendaciones Priorizadas', margin + 4, y + 6);
  y += 10;
  result.recomendacionesPriorizadas.forEach((r, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${r}`, pageWidth - margin * 2 - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(55, 48, 163);
    doc.text(lines, margin + 6, y);
    y += lines.length * 4 + 1;
  });

  // ── Footers for all pages ────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, generationDate);
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`Compliance_vs_Manual_${timestamp}.pdf`);
};

// ─── Criminal Profile PDF ────────────────────────────────────────────────────
import { PersonProfile } from '../types/criminalTypes';

export const generateCriminalProfilePdf = async (profile: PersonProfile): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(...INDIGO);
  doc.rect(0, 38, pageWidth, 2, 'F');

  const logoData = await loadLogoBase64();
  if (logoData) {
    try { doc.addImage(logoData, 'JPEG', pageWidth - 58, 8, 44, 13); } catch { /* no logo */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text('INFORME DE PERFIL CRIMINAL', margin, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(196, 210, 230);
  doc.text('CriminalProfile AI · Compliance Team Global66', margin, 24);
  doc.text(generationDate, pageWidth - margin, 24, { align: 'right' });

  let y = 48;

  // ── Profile info box ──────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_GRAY);
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...DARK_TEXT);
  doc.text(`${profile.nombre} ${profile.apellido}`.toUpperCase(), margin + 4, y + 8);

  if (profile.isPep) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 120, 0);
    doc.text('★ ES PEP', margin + 4, y + 15);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  doc.text(`RUT: ${profile.rut}`, margin + 4, y + (profile.isPep ? 22 : 15));
  doc.text(`ID Cliente: ${profile.customerId}`, margin + 4 + 55, y + (profile.isPep ? 22 : 15));
  doc.text(`Nombre Cuenta: ${profile.nombreCuenta}`, margin + 4 + 110, y + (profile.isPep ? 22 : 15));

  y += 38;

  // ── System Recommendation ─────────────────────────────────────────────────
  if (profile.preEvaluation) {
    const isLiberar = profile.preEvaluation.decision.toLowerCase().includes('liber');
    const isBlocked = profile.preEvaluation.decision.toLowerCase().includes('block');
    const fillColor: [number,number,number] = isLiberar ? [240,253,244] : isBlocked ? [254,242,242] : [255,251,235];
    const borderColor: [number,number,number] = isLiberar ? [134,239,172] : isBlocked ? [252,165,165] : [252,211,77];
    const textColor: [number,number,number] = isLiberar ? [21,128,61] : isBlocked ? [185,28,28] : [146,64,14];

    doc.setFillColor(...fillColor);
    doc.setDrawColor(...borderColor);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MID_GRAY);
    doc.text('RECOMENDACIÓN DEL SISTEMA', margin + 4, y + 6);
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.text(profile.preEvaluation.decision.toUpperCase(), margin + 4, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK_TEXT);
    const razonLines = doc.splitTextToSize(profile.preEvaluation.razon, pageWidth - margin * 2 - 80);
    doc.text(razonLines, margin + 60, y + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INDIGO);
    doc.text(`Valor Total: ${profile.preEvaluation.scoreTotal}`, pageWidth - margin - 4, y + 14, { align: 'right' });
    y += 30;
  }

  // ── Score breakdown ───────────────────────────────────────────────────────
  const precedentes = profile.crimes.filter(c => (c.catalogType || '').toUpperCase().includes('PRECEDENTE'));
  const noPrecedentes = profile.crimes.filter(c => !(c.catalogType || '').toUpperCase().includes('PRECEDENTE'));
  const preScore = precedentes.reduce((s, c) => s + (c.catalogValue || 0), 0);
  const noPreScore = noPrecedentes.reduce((s, c) => s + (c.catalogValue || 0), 0);
  const totalScore = preScore + noPreScore;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('DESGLOSE DE PUNTAJE', margin, y + 5);
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 6.5, margin + 52, y + 6.5);
  y += 10;

  const drawScoreRow = (label: string, count: number, score: number, maxScore: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...DARK_TEXT);
    doc.text(`${label}: ${count} causa(s) → ${score} pts`, margin + 4, y);
    // bar bg
    doc.setFillColor(220, 228, 240);
    doc.roundedRect(margin + 4, y + 2, pageWidth - margin * 2 - 8, 4, 1, 1, 'F');
    // bar fill
    const barWidth = maxScore > 0 ? Math.min(1, score / maxScore) * (pageWidth - margin * 2 - 8) : 0;
    if (barWidth > 0) {
      doc.setFillColor(...INDIGO);
      doc.roundedRect(margin + 4, y + 2, barWidth, 4, 1, 1, 'F');
    }
    y += 10;
  };

  drawScoreRow('Precedentes', precedentes.length, preScore, Math.max(totalScore, 1));
  drawScoreRow('No Precedentes', noPrecedentes.length, noPreScore, Math.max(totalScore, 1));

  // total bar
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(`Total: ${totalScore} pts`, margin + 4, y);
  y += 10;

  // ── Crimes table ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('HISTORIAL JUDICIAL DETALLADO', margin, y + 5);
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 6.5, margin + 70, y + 6.5);
  y += 10;

  const crimeRows = profile.crimes.map(c => [
    c.tipo || 'N/A',
    c.fecha && c.fecha !== '0' ? c.fecha : 'Sin fecha',
    c.estado || 'N/A',
    `${c.ruc || 'N/A'} / ${c.rit || 'N/A'}`,
    c.riesgo || 'N/A',
    c.catalogValue !== undefined ? String(c.catalogValue) : 'N/A',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Tipo', 'Fecha', 'Estado', 'RUC/RIT', 'Riesgo', 'Val. Cat.']],
    body: crimeRows,
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 2.5 },
    bodyStyles: { fontSize: 7, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: DARK_TEXT, lineColor: [220, 228, 240] },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 22 },
      2: { cellWidth: 25 },
      3: { cellWidth: 35 },
      4: { cellWidth: 20 },
      5: { cellWidth: 16 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      addPageFooter(doc, data.pageNumber, 0, generationDate);
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Action & Notes ────────────────────────────────────────────────────────
  if (profile.selectedAction || profile.notes) {
    if (y > pageHeight - 50) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text('DECISIÓN DEL ANALISTA', margin, y);
    doc.setDrawColor(...INDIGO);
    doc.line(margin, y + 1.5, margin + 58, y + 1.5);
    y += 8;

    if (profile.selectedAction) {
      const isLiberar = profile.selectedAction === 'Liberar';
      const isBlocked = profile.selectedAction === 'Fully Blocked';
      const actionFill: [number,number,number] = isLiberar ? [240,253,244] : isBlocked ? [254,242,242] : profile.selectedAction === 'Liberar + UCR' ? [238,242,255] : [255,251,235];
      const actionText: [number,number,number] = isLiberar ? [21,128,61] : isBlocked ? [185,28,28] : profile.selectedAction === 'Liberar + UCR' ? [67,56,202] : [146,64,14];
      doc.setFillColor(...actionFill);
      doc.setDrawColor(220, 228, 240);
      doc.roundedRect(margin, y, 60, 10, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...actionText);
      doc.text(`Acción: ${profile.selectedAction}`, margin + 4, y + 7);
      y += 14;
    }

    if (profile.notes) {
      const notesLines = doc.splitTextToSize(profile.notes, pageWidth - margin * 2 - 8);
      doc.setFillColor(240, 244, 255);
      doc.setDrawColor(...INDIGO);
      doc.roundedRect(margin, y, pageWidth - margin * 2, notesLines.length * 4.5 + 12, 2, 2, 'FD');
      doc.setFillColor(...INDIGO);
      doc.rect(margin, y, 3, notesLines.length * 4.5 + 12, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...DARK_TEXT);
      doc.text('Notas del Analista:', margin + 7, y + 6);
      doc.text(notesLines, margin + 7, y + 11);
      y += notesLines.length * 4.5 + 16;
    }
  }

  // ── Footers ───────────────────────────────────────────────────────────────
  const totalPages2 = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= totalPages2; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages2, generationDate);
  }

  const safeName = `${profile.nombre}_${profile.apellido}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  doc.save(`Perfil_${safeName}_${new Date().toISOString().slice(0,10)}.pdf`);
};

// ─── Batch Company PDF ────────────────────────────────────────────────────────
export interface BatchDocSummary {
  docName: string;
  extractedData: ExtractedField[];
  executiveSummary?: string;
}

export interface BatchCompanyPdfMetadata {
  source: 'local_folder' | 'empresa_docs';
  companyId?: string;
  identificationNumber?: string;
  country?: string;
  complianceStatus?: string;
  kycStage1?: string;
  docsAnalyzed?: number;
  docsFailed?: number;
}

// ─── Batch enrichment PDF helpers ────────────────────────────────────────────

import { BatchEnrichedData } from '../types/batch';

const NA = 'No disponible';
const isNA = (v?: string) => !v || v === NA || v === 'N/A' || v === 'No especificado';

function addEnrichedSection(
  doc: InstanceType<typeof jsPDF>,
  title: string,
  rows: [string, string][],
  startY: number,
  margin: number,
  pageWidth: number,
  accentColor: [number, number, number] = [79, 70, 229]
): number {
  let yPos = startY;
  if (yPos > 260) { doc.addPage(); yPos = 20; }

  doc.setFillColor(241, 245, 255);
  doc.rect(margin, yPos - 3, pageWidth - margin * 2, 9, 'F');
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.6);
  doc.line(margin, yPos - 3, margin, yPos + 6);
  doc.setTextColor(...accentColor);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin + 3, yPos + 3);
  yPos += 11;

  if (rows.length === 0) return yPos + 3;

  autoTable(doc, {
    startY: yPos,
    margin: { left: margin, right: margin },
    body: rows,
    styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, overflow: 'linebreak' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 58, fillColor: [245, 247, 255] }, 1: { cellWidth: 'auto' } },
    tableWidth: pageWidth - margin * 2,
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

function buildValidacionesList(enrichedData: BatchEnrichedData): { pass: boolean; text: string }[] {
  const items: { pass: boolean; text: string }[] = [];
  const c = enrichedData.consistenciaDocumental;
  const v = enrichedData.verificacionRepresentante;
  const t = enrichedData.informacionTributaria;

  if (c) {
    if (c.razonSocialConsistente != null)
      items.push({ pass: !!c.razonSocialConsistente, text: c.razonSocialConsistente ? 'Razón social consistente entre documentos' : 'Inconsistencia detectada en Razón Social' });
    if (c.rutConsistente != null)
      items.push({ pass: !!c.rutConsistente, text: c.rutConsistente ? 'RUT consistente entre documentos' : 'Inconsistencia detectada en RUT' });
    if (c.representanteConsistente != null)
      items.push({ pass: !!c.representanteConsistente, text: c.representanteConsistente ? 'Representante Legal consistente entre documentos' : 'Inconsistencia detectada en Representante Legal' });
    if (c.fechaConstitucionConsistente != null)
      items.push({ pass: !!c.fechaConstitucionConsistente, text: c.fechaConstitucionConsistente ? 'Fecha de constitución consistente entre documentos' : 'Inconsistencia detectada en Fecha de Constitución' });
    if (c.inconsistencias && c.inconsistencias.length > 0)
      c.inconsistencias.forEach(i => items.push({ pass: false, text: i }));
  }
  if (v?.identityVerification && v.identityVerification !== NA)
    items.push({ pass: v.identityVerification === 'PASSED', text: v.identityVerification === 'PASSED' ? 'Representante validado mediante Jumio' : `Validación Jumio: ${v.identityVerification}` });
  if (t?.actividadesEconomicas && t.actividadesEconomicas.length > 0)
    items.push({ pass: true, text: 'Actividades económicas vigentes identificadas' });

  return items;
}

export const generateBatchCompanyPdf = async (
  companyName: string,
  docs: BatchDocSummary[],
  metadata?: BatchCompanyPdfMetadata,
  enrichedData?: BatchEnrichedData,
  enrichment?: RegcheqEnrichment
): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const generationDate = new Date().toLocaleString('es-CL');

  // ── Header bar ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(...INDIGO);
  doc.rect(0, 38, pageWidth, 2, 'F');

  const logoData = await loadLogoBase64();
  if (logoData) {
    try { doc.addImage(logoData, 'JPEG', pageWidth - 58, 8, 44, 13); } catch { /* no logo */ }
  }

  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA EMPRESA — ANÁLISIS BATCH', margin, 17);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado: ${generationDate}  |  Documentos analizados: ${metadata?.docsAnalyzed ?? docs.length}`, margin, 26);

  // ── Company name banner ──
  let yPos = 48;
  doc.setFillColor(230, 235, 250);
  doc.rect(0, yPos, pageWidth, 14, 'F');
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const nameLines = doc.splitTextToSize(companyName.toUpperCase(), pageWidth - margin * 2);
  doc.text(nameLines[0], margin, yPos + 9);
  yPos += 20;

  // ── Origin metadata block ──
  if (metadata) {
    const isEmpresaDocs = metadata.source === 'empresa_docs';
    const metaRows: [string, string][] = isEmpresaDocs
      ? [
          ['Origen', 'EmpresaDocs'],
          ...(metadata.companyId        ? [['Company ID', metadata.companyId] as [string, string]]              : []),
          ...(metadata.identificationNumber ? [['RUT / DNI', metadata.identificationNumber] as [string, string]] : []),
          ...(metadata.country          ? [['País', metadata.country] as [string, string]]                       : []),
          ...(metadata.complianceStatus ? [['Compliance Status', metadata.complianceStatus] as [string, string]] : []),
          ...(metadata.kycStage1        ? [['KYC Stage', metadata.kycStage1] as [string, string]]                : []),
          ['Documentos analizados', String(metadata.docsAnalyzed ?? 0)],
          ['Documentos fallidos',   String(metadata.docsFailed ?? 0)],
        ]
      : [
          ['Origen', 'Carpeta Local'],
          ['Nombre carpeta', companyName],
          ['Documentos analizados', String(metadata.docsAnalyzed ?? 0)],
          ['Documentos fallidos',   String(metadata.docsFailed ?? 0)],
        ];

    autoTable(doc, {
      startY: yPos,
      margin: { left: margin, right: margin },
      body: metaRows,
      styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [241, 245, 255] }, 1: { cellWidth: 'auto' } },
      tableWidth: pageWidth - margin * 2,
    });
    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Enriched sections (new) ──────────────────────────────────────────────────
  if (enrichedData) {
    const { estructuraSocietaria: es, restriccionesSocietarias: rs,
            informacionTributaria: it, verificacionRepresentante: vr,
            informacionComercial: ic, consistenciaDocumental: cd } = enrichedData;

    // 1. Estructura Societaria
    if (es) {
      const rows: [string, string][] = [
        ['Tipo de Sociedad',         es.tipoSociedad        ?? NA],
        ['Cantidad de Accionistas',  es.cantidadAccionistas ?? NA],
        ['Accionista Controlador',   es.accionistaControlador ?? NA],
        ['Participación Accionaria', es.participacionAccionaria ?? NA],
        ['Forma de Administración',  es.formaAdministracion ?? NA],
      ].filter(([, v]) => !isNA(v)) as [string, string][];
      if (rows.length > 0)
        yPos = addEnrichedSection(doc, 'Estructura Societaria', rows, yPos, margin, pageWidth, [30, 58, 95]);
    }

    // 2. Restricciones Societarias
    if (rs) {
      const rows: [string, string][] = [
        ['Restricción transferencia de acciones', rs.restriccionTransferenciaAcciones ?? NA],
        ['Derecho preferente de accionistas',     rs.derechoPreferente               ?? NA],
        ['Delegación de facultades permitida',    rs.delegacionFacultades            ?? NA],
      ].filter(([, v]) => !isNA(v)) as [string, string][];
      if (rows.length > 0)
        yPos = addEnrichedSection(doc, 'Restricciones y Particularidades', rows, yPos, margin, pageWidth, [120, 53, 15]);
    }

    // 3. Información Tributaria
    if (it) {
      const actividadesStr = it.actividadesEconomicas && it.actividadesEconomicas.length > 0
        ? it.actividadesEconomicas.join('\n')
        : NA;
      const rows: [string, string][] = [
        ['Fecha Inicio Actividades',     it.fechaInicioActividades ?? NA],
        ['Empresa de Menor Tamaño',      it.empresaMenorTamano    ?? NA],
        ['Actividades Económicas (SII)', actividadesStr],
      ].filter(([, v]) => !isNA(v)) as [string, string][];
      if (rows.length > 0)
        yPos = addEnrichedSection(doc, 'Información Tributaria', rows, yPos, margin, pageWidth, [21, 128, 61]);
    }

    // 4. Verificación Representante Legal
    if (vr) {
      const idRows: [string, string][] = [
        ['Documento Identidad',       vr.documentoIdentidad      ?? NA],
        ['Nacionalidad',              vr.nacionalidad             ?? NA],
        ['Fecha Nacimiento',          vr.fechaNacimiento          ?? NA],
        ['Sexo',                      vr.sexo                     ?? NA],
        ['Lugar Nacimiento',          vr.lugarNacimiento          ?? NA],
        ['Fecha Emisión Documento',   vr.fechaEmisionDocumento    ?? NA],
        ['Fecha Expiración Documento',vr.fechaExpiracionDocumento ?? NA],
      ].filter(([, v]) => !isNA(v)) as [string, string][];
      const valRows: [string, string][] = [
        ['Identity Verification', vr.identityVerification ?? NA],
        ['Similarity',            vr.similarity           ?? NA],
        ['Liveness',              vr.liveness             ?? NA],
        ['Risk Score',            vr.riskScore            ?? NA],
      ].filter(([, v]) => !isNA(v)) as [string, string][];
      if (idRows.length > 0 || valRows.length > 0)
        yPos = addEnrichedSection(doc, 'Validación Identidad Representante', [...idRows, ...valRows], yPos, margin, pageWidth, [109, 40, 217]);
    }

    // 5. Información Comercial
    if (ic) {
      const rows: [string, string][] = [
        ['Marcas representadas',   ic.marcasRepresentadas    ?? NA],
        ['Correos corporativos',   ic.correosCorporativos    ?? NA],
        ['Teléfonos corporativos', ic.telefonosCorporativos  ?? NA],
        ['Horario atención',       ic.horarioAtencion        ?? NA],
      ].filter(([, v]) => !isNA(v)) as [string, string][];
      if (rows.length > 0)
        yPos = addEnrichedSection(doc, 'Información Comercial', rows, yPos, margin, pageWidth, [14, 116, 144]);
    }

    // 6. Consistencia Documental
    if (cd) {
      const consistRows: [string, string][] = [
        ['Razón Social Consistente',         cd.razonSocialConsistente       == null ? 'Sin datos suficientes' : cd.razonSocialConsistente       ? 'Sí' : 'No — Discrepancia detectada'],
        ['RUT Consistente',                  cd.rutConsistente               == null ? 'Sin datos suficientes' : cd.rutConsistente               ? 'Sí' : 'No — Discrepancia detectada'],
        ['Representante Consistente',        cd.representanteConsistente     == null ? 'Sin datos suficientes' : cd.representanteConsistente     ? 'Sí' : 'No — Discrepancia detectada'],
        ['Fecha Constitución Consistente',   cd.fechaConstitucionConsistente == null ? 'Sin datos suficientes' : cd.fechaConstitucionConsistente ? 'Sí' : 'No — Discrepancia detectada'],
      ];
      if (cd.inconsistencias && cd.inconsistencias.length > 0)
        consistRows.push(['Inconsistencias detectadas', cd.inconsistencias.join('\n')]);
      yPos = addEnrichedSection(doc, 'Validación Cruzada Documental', consistRows, yPos, margin, pageWidth, [185, 28, 28]);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── One section per document ──
  for (let i = 0; i < docs.length; i++) {
    const { docName, extractedData, executiveSummary } = docs[i];

    if (yPos > 250) { doc.addPage(); yPos = 20; }

    // Section header
    doc.setFillColor(241, 245, 255);
    doc.rect(margin, yPos - 3, pageWidth - margin * 2, 9, 'F');
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos - 3, margin, yPos + 6);
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Documento ${i + 1}: ${docName}`, margin + 3, yPos + 3);
    yPos += 12;

    // Fields table
    const validFields = extractedData.filter(
      f => f.value && f.value !== 'N/A' && f.value !== 'No especificado' && f.value !== 'No encontrado'
    );
    if (validFields.length > 0) {
      autoTable(doc, {
        startY: yPos,
        margin: { left: margin, right: margin },
        head: [['Campo', 'Valor extraído']],
        body: validFields.map(f => [f.field, f.value]),
        styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, overflow: 'linebreak' },
        headStyles: { fillColor: NAVY as [number, number, number], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [247, 249, 255] },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 }, 1: { cellWidth: 'auto' } },
        tableWidth: pageWidth - margin * 2,
      });
      yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }

    // Executive summary
    if (executiveSummary) {
      if (yPos > 260) { doc.addPage(); yPos = 20; }
      doc.setFillColor(240, 253, 244);
      doc.setDrawColor(34, 197, 94);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, yPos, pageWidth - margin * 2, 6, 1, 1, 'FD');
      doc.setTextColor(21, 128, 61);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN EJECUTIVO', margin + 3, yPos + 4);
      yPos += 9;

      doc.setTextColor(...DARK_TEXT);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(executiveSummary, pageWidth - margin * 2 - 4);
      const maxLines = 20;
      lines.slice(0, maxLines).forEach((line: string) => {
        if (yPos > 278) { doc.addPage(); yPos = 20; }
        doc.text(line, margin + 2, yPos);
        yPos += 4.5;
      });
      yPos += 5;
    }

    // VALIDACIONES DOCUMENTALES — rendered once, after last doc's summary
    if (i === docs.length - 1 && enrichedData) {
      const validaciones = buildValidacionesList(enrichedData);
      if (validaciones.length > 0) {
        if (yPos > 250) { doc.addPage(); yPos = 20; }
        doc.setFillColor(30, 58, 138);
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, yPos, pageWidth - margin * 2, 6, 1, 1, 'FD');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('VALIDACIONES DOCUMENTALES', margin + 3, yPos + 4);
        yPos += 9;

        validaciones.forEach(({ pass, text }) => {
          if (yPos > 280) { doc.addPage(); yPos = 20; }
          const icon = pass ? '✓' : '✗';
          const color: [number, number, number] = pass ? [21, 128, 61] : [185, 28, 28];
          doc.setTextColor(...color);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.text(icon, margin + 2, yPos);
          doc.setTextColor(...DARK_TEXT);
          doc.setFont('helvetica', 'normal');
          doc.text(text, margin + 8, yPos);
          yPos += 5;
        });
        yPos += 4;
      }
    }
  }

  // ── Consulta Regcheq (AML + SII) ──
  if (enrichment && enrichment.encontrado) {
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('Consulta Regcheq — AML + SII', margin, yPos); yPos += 6;
    yPos = drawValidationAlerts(doc, enrichment.alerts, margin, pageWidth, yPos);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK_TEXT);
    const coincid = enrichment.amlHits.filter(h => h.coincidence).map(h => h.nombre);
    const amlLines = doc.splitTextToSize(`Riesgo Regcheq: ${enrichment.regcheqRisk || '—'}${enrichment.pepLevel ? ` · PEP: ${enrichment.pepLevel}` : ''}\nCoincidencias AML: ${coincid.length ? coincid.join(', ') : 'ninguna'}`, pageWidth - margin * 2);
    doc.text(amlLines, margin, yPos); yPos += amlLines.length * 4.5 + 3;
    const t = enrichment.tributaria;
    if (t) {
      const siiLines = doc.splitTextToSize(`SII — RUT: ${t.rutContribuyente || '—'} · Inicio actividades: ${t.presentaInicioActividades || '—'}${t.fechaInicioActividades ? ` (${t.fechaInicioActividades.slice(0, 10)})` : ''} · Empresa menor tamaño: ${t.empresaMenorTamano || '—'}`, pageWidth - margin * 2);
      doc.text(siiLines, margin, yPos); yPos += siiLines.length * 4.5 + 2;
      if (t.situacionesIrregulares.length) {
        doc.setTextColor(146, 64, 14);
        const irr = doc.splitTextToSize(`Situaciones irregulares: ${t.situacionesIrregulares.join(' · ')}`, pageWidth - margin * 2);
        doc.text(irr, margin, yPos); yPos += irr.length * 4.5 + 2; doc.setTextColor(...DARK_TEXT);
      }
      if (t.actividades.length) {
        autoTable(doc, {
          startY: yPos,
          head: [['Código', 'Actividad', 'Categoría', 'Fecha', 'IVA']],
          body: t.actividades.map(a => [a.code, a.name, a.category, a.date ? a.date.slice(0, 10) : '', a.afectoIva]),
          theme: 'grid', headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5, textColor: DARK_TEXT }, columnStyles: { 1: { cellWidth: 70 } },
          margin: { left: margin, right: margin },
        });
      }
    }
  }

  // ── Page numbers ──
  const totalPages = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...MID_GRAY);
    doc.text(`Pág. ${p} / ${totalPages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }

  return doc.output('blob');
};

// ─── Vista 360° — reporte consolidado ────────────────────────────────────────
async function buildLens360Doc(r: Lens360Result): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const date = new Date().toLocaleString('es-CL');

  // Header
  doc.setFillColor(...NAVY); doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(...INDIGO); doc.rect(0, 38, pageWidth, 2, 'F');
  const logo = await loadLogoBase64();
  if (logo) { try { doc.addImage(logo, 'JPEG', pageWidth - 58, 8, 44, 13); } catch { /* sin logo */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...WHITE);
  doc.text('REPORTE 360°', margin, 16);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(196, 210, 230);
  doc.text('Consulta consolidada AML / Penal · LENS AI', margin, 23);

  // Info box
  doc.setFillColor(...LIGHT_GRAY); doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, 46, pageWidth - margin * 2, 22, 2, 2, 'FD');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MID_GRAY);
  doc.text('PERSONA / EMPRESA', margin + 4, 53);
  doc.text('FECHA DE GENERACIÓN', pageWidth / 2, 53);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DARK_TEXT);
  doc.text(`${r.nombre} · ${r.rut}`.slice(0, 60), margin + 4, 61);
  doc.text(date, pageWidth / 2, 61);

  let y = 76;

  // Veredicto
  const vc: [number, number, number] = r.verdict === 'ALTO' ? [220, 38, 38]
    : r.verdict === 'MEDIO' ? [217, 119, 6]
    : r.verdict === 'BAJO' ? [5, 150, 105] : MID_GRAY;
  doc.setFillColor(...vc); doc.roundedRect(margin, y, pageWidth - margin * 2, 12, 2, 2, 'F');
  doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`VEREDICTO: RIESGO ${r.verdict}`, margin + 4, y + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`${r.personType === 'legal' ? 'Persona jurídica' : 'Persona natural'} · ${r.country}${r.pepLevel ? ` · PEP: ${r.pepLevel}` : ''}`, pageWidth - margin - 4, y + 8, { align: 'right' });
  y += 17;

  doc.setTextColor(...DARK_TEXT); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  r.verdictReasons.forEach(reason => {
    const lines = doc.splitTextToSize(`•  ${reason}`, pageWidth - margin * 2);
    doc.text(lines, margin, y); y += lines.length * 4.3;
  });
  y += 4;

  // Alertas de validación (motor de reglas)
  y = drawValidationAlerts(doc, r.alerts, margin, pageWidth, y);

  // Screening AML Chile
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text('Screening AML · Chile (Regcheq)', margin, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Lista', 'Coincidencia', 'Riesgo']],
    body: r.amlHits.length ? r.amlHits.map(h => [h.nombre, h.coincidence ? 'SÍ' : '—', h.risk || '—']) : [['Sin datos', '—', '—']],
    theme: 'grid', headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK_TEXT }, margin: { left: margin, right: margin },
    didDrawPage: d => addPageFooter(doc, d.pageNumber, 0, date),
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Antecedentes penales
  if (r.criminalDecision || r.crimes.length) {
    if (y > 235) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('Antecedentes Penales · Decisión Criminal', margin, y); y += 6;
    if (r.criminalDecision) {
      const cd = r.criminalDecision;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK_TEXT);
      const txt = `Decisión: ${cd.decision} — ${cd.razon}\nPuntaje: ${cd.totalEquivalente}  ·  Precedentes: ${cd.precedentes} (${cd.preScore} pts)  ·  No precedentes: ${cd.noPrecedentes} (${cd.noPreScore} pts)`;
      const lines = doc.splitTextToSize(txt, pageWidth - margin * 2);
      doc.text(lines, margin, y); y += lines.length * 4.3 + 3;
    }
    if (r.crimes.length) {
      autoTable(doc, {
        startY: y,
        head: [['Delito', 'Estado', 'Fecha', 'RUC']],
        body: r.crimes.map(c => [c.crimen, c.estado || '—', c.fecha || '—', c.ruc || '—']),
        theme: 'grid', headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: DARK_TEXT }, columnStyles: { 0: { cellWidth: 82 } },
        margin: { left: margin, right: margin },
        didDrawPage: d => addPageFooter(doc, d.pageNumber, 0, date),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Servicio de Impuestos Internos (SII)
  if (r.tributaria) {
    const t = r.tributaria;
    if (y > 235) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('Servicio de Impuestos Internos (SII)', margin, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK_TEXT);
    const datos = [
      `RUT contribuyente: ${t.rutContribuyente || '—'}`,
      `Nombre SII: ${t.nombreSii || '—'}`,
      `Inicio de actividades: ${t.presentaInicioActividades || '—'}${t.fechaInicioActividades ? ` (${t.fechaInicioActividades.slice(0, 10)})` : ''}`,
      `Empresa menor tamaño: ${t.empresaMenorTamano || '—'}   ·   Moneda extranjera: ${t.monedaExtranjera || '—'}`,
      `Última actualización SII: ${t.ultimaActualizacion ? t.ultimaActualizacion.slice(0, 10) : '—'}`,
    ];
    datos.forEach(line => { doc.text(doc.splitTextToSize(line, pageWidth - margin * 2), margin, y); y += 5; });
    if (t.situacionesIrregulares.length) {
      const lines = doc.splitTextToSize(`Situaciones irregulares: ${t.situacionesIrregulares.join(' · ')}`, pageWidth - margin * 2);
      doc.setTextColor(146, 64, 14); doc.text(lines, margin, y); y += lines.length * 4.5; doc.setTextColor(...DARK_TEXT);
    }
    y += 2;
    if (t.actividades.length) {
      autoTable(doc, {
        startY: y,
        head: [['Código', 'Actividad', 'Categoría', 'Fecha', 'IVA']],
        body: t.actividades.map(a => [a.code, a.name, a.category, a.date ? a.date.slice(0, 10) : '', a.afectoIva]),
        theme: 'grid', headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: DARK_TEXT }, columnStyles: { 1: { cellWidth: 70 } },
        margin: { left: margin, right: margin },
        didDrawPage: d => addPageFooter(doc, d.pageNumber, 0, date),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Screening Colombia (Inspektor)
  if (r.country === 'CO' && r.inspektor) {
    if (y > 235) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('Screening AML · Colombia (Inspektor)', margin, y); y += 4;
    if (r.inspektor.error) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MID_GRAY);
      doc.text(doc.splitTextToSize(`No disponible: ${r.inspektor.error}`, pageWidth - margin * 2), margin, y + 4);
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Grupo', 'Detalle']],
        body: r.inspektor.hits.length ? r.inspektor.hits.map(h => [h.grupo, h.detalle || '—']) : [['Sin coincidencias', '—']],
        theme: 'grid', headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, textColor: DARK_TEXT }, margin: { left: margin, right: margin },
        didDrawPage: d => addPageFooter(doc, d.pageNumber, 0, date),
      });
    }
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) { doc.setPage(i); addPageFooter(doc, i, totalPages, date); }
  return doc;
}

export const generateLens360Pdf = async (r: Lens360Result): Promise<void> => {
  const doc = await buildLens360Doc(r);
  doc.save(`360_${r.rut.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
};

export const generateLens360Blob = async (r: Lens360Result): Promise<Blob> => {
  const doc = await buildLens360Doc(r);
  return doc.output('blob');
};

// ─── Informe de Perfil — Colombia (mismo formato visual que el de Chile) ──────────
export const generateColombiaProfilePdf = async (p: ColombiaProfile): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const date = new Date().toLocaleString('es-CL');

  // Header
  doc.setFillColor(...NAVY); doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(...INDIGO); doc.rect(0, 38, pageWidth, 2, 'F');
  const logo = await loadLogoBase64();
  if (logo) { try { doc.addImage(logo, 'JPEG', pageWidth - 58, 8, 44, 13); } catch { /* no logo */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...WHITE);
  doc.text('INFORME DE PERFIL — COLOMBIA', margin, 16);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(196, 210, 230);
  doc.text('CriminalProfile AI · Compliance Team Global66', margin, 24);
  doc.text(date, pageWidth - margin, 24, { align: 'right' });

  let y = 48;

  // Info box
  doc.setFillColor(...LIGHT_GRAY); doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 24, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK_TEXT);
  doc.text((p.nombre || p.numeroDni).toUpperCase(), margin + 4, y + 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID_GRAY);
  doc.text(`Documento: ${p.numeroDni} (${p.tipoDni})`, margin + 4, y + 16);
  doc.text(`Resultado Inspektor: ${p.resultado}${p.prioridadMaxima ? ` · P${p.prioridadMaxima}` : ''}`, margin + 4, y + 21);
  doc.text(`Coincidencias: ${p.totalCoincidencias}`, pageWidth - margin - 4, y + 16, { align: 'right' });
  y += 32;

  // Decisión manual
  const acc = (p.accion || 'PENDIENTE').toLowerCase();
  const isLib = acc.includes('liber'); const isBlock = acc.includes('block');
  const fill: [number, number, number] = isLib ? [240, 253, 244] : isBlock ? [254, 242, 242] : [255, 251, 235];
  const border: [number, number, number] = isLib ? [134, 239, 172] : isBlock ? [252, 165, 165] : [252, 211, 77];
  const txt: [number, number, number] = isLib ? [21, 128, 61] : isBlock ? [185, 28, 28] : [146, 64, 14];
  const notasLines = p.notas ? doc.splitTextToSize(`Notas: ${p.notas}`, pageWidth - margin * 2 - 8) : [];
  const boxH = 16 + notasLines.length * 4;
  doc.setFillColor(...fill); doc.setDrawColor(...border);
  doc.roundedRect(margin, y, pageWidth - margin * 2, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...MID_GRAY);
  doc.text('DECISIÓN MANUAL DEL ANALISTA', margin + 4, y + 6);
  doc.setFontSize(12); doc.setTextColor(...txt);
  doc.text((p.accion || 'PENDIENTE').toUpperCase(), margin + 4, y + 13);
  if (notasLines.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...DARK_TEXT); doc.text(notasLines, margin + 4, y + 18); }
  y += boxH + 8;

  const sectionTitle = (t: string) => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text(t, margin, y); y += 2;
  };
  const afterTable = () => { y = (doc as any).lastAutoTable.finalY + 8; };
  const tableOpts = {
    theme: 'grid' as const, headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' as const },
    bodyStyles: { fontSize: 7.5, textColor: DARK_TEXT }, margin: { left: margin, right: margin },
    didDrawPage: (d: { pageNumber: number }) => addPageFooter(doc, d.pageNumber, 0, date),
  };

  // Coincidencias en listas
  sectionTitle(`Coincidencias en Listas (${p.coincidencias.length})`);
  autoTable(doc, {
    startY: y + 3,
    head: [['Lista', 'Prio', 'Delito / Cargo', 'Zona', 'Fuente']],
    body: p.coincidencias.length ? p.coincidencias.map(c => [c.nombreLista || c.grupoLista, c.prioridad, c.delito || c.pep, c.zona, c.fuente]) : [['Sin coincidencias', '', '', '', '']],
    columnStyles: { 0: { cellWidth: 55 }, 2: { cellWidth: 55 } }, ...tableOpts,
  });
  afterTable();

  // Procuraduría
  if (p.procuraduria.length) {
    sectionTitle(`Procuraduría (${p.procuraduria.length})`);
    autoTable(doc, {
      startY: y + 3,
      head: [['Nombre', 'Sanciones', 'Inhabilidades']],
      body: p.procuraduria.map(r => [r.nombre, r.sanciones, r.inhabilidades]),
      ...tableOpts,
    });
    afterTable();
  }

  // Rama Judicial
  if (p.ramaJudicial.length) {
    sectionTitle(`Rama Judicial (${p.ramaJudicial.length})`);
    autoTable(doc, {
      startY: y + 3,
      head: [['Despacho', 'Depto', 'Inicio', 'Últ. actuación']],
      body: p.ramaJudicial.map(r => [r.despacho, r.departamento, r.fechaProceso.slice(0, 10), r.fechaUltimaActuacion.slice(0, 10)]),
      columnStyles: { 0: { cellWidth: 70 } }, ...tableOpts,
    });
    afterTable();
  }

  // JEPMS
  if (p.jepms.length) {
    sectionTitle(`JEPMS (${p.jepms.length})`);
    autoTable(doc, {
      startY: y + 3,
      head: [['Ciudad', 'Fecha', 'Link']],
      body: p.jepms.map(j => [j.ciudad, j.fechaConsulta.slice(0, 10), j.link]),
      columnStyles: { 2: { cellWidth: 90 } }, ...tableOpts,
    });
    afterTable();
  }

  // Línea de tiempo
  const timeline = buildTimeline(p);
  if (timeline.length) {
    sectionTitle(`Línea de Tiempo (${timeline.length})`);
    autoTable(doc, {
      startY: y + 3,
      head: [['Fecha', 'Tipo', 'Descripción']],
      body: timeline.map(e => [e.fecha.slice(0, 10), e.tipo, e.descripcion]),
      columnStyles: { 2: { cellWidth: 100 } }, ...tableOpts,
    });
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) { doc.setPage(i); addPageFooter(doc, i, totalPages, date); }
  doc.save(`perfil_colombia_${p.numeroDni.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
};
