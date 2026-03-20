
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExtractedField, CryptoWalletProfile } from '../types';

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
