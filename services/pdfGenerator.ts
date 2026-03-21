
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExtractedField, CryptoWalletProfile, ComplianceAnalysisResult, FinancialDocumentProcess } from '../types';

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
  executiveSummary?: string
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

  doc.save(`Analisis_${fileName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
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

  const subtitleMap: Record<string, string> = {
    financial_statement: 'Estado Financiero',
    bank_statement: 'Cartola Bancaria',
    tax_folder: 'Carpeta Tributaria SII',
    combined: 'Análisis Combinado',
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

  // ---- combined ----
  if ((doc_in.docType === 'combined' || doc_in.docType === 'mixed') && doc_in.combinedResult) {
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
