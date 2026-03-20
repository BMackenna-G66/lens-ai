
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 
import { ExtractedField, CryptoWalletProfile } from '../types';

/**
 * Generates a PDF for Legal Document Analysis (Pre-existing)
 */
export const generatePdf = (fileName: string, data: ExtractedField[]): void => {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(33, 41, 54);
  doc.text(`Resumen de Análisis: ${fileName}`, 14, 20);

  doc.setFontSize(10);
  const generationDate = new Date().toLocaleString('es-CL');
  doc.text(`Fecha de Generación: ${generationDate}`, 14, 28);
  
  const tableData = data.map(item => [item.field, item.value]);

  autoTable(doc, {
    startY: 35,
    head: [['Campo', 'Valor Extraído']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] }, // primary-600 (Indigo)
    styles: {
        font: 'helvetica',
        cellPadding: 3,
        fontSize: 9,
        overflow: 'linebreak',
    },
    columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
    }
  });

  doc.save(`Analisis_${fileName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};

/**
 * Generates a Forensic PDF Report for Crypto Wallets
 */
export const generateCryptoPdf = (data: CryptoWalletProfile): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Header - Purple Theme
  doc.setFillColor(139, 92, 246); // purple-500
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text("LENS - CRYPTO FORENSIC REPORT", margin, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado el: ${new Date().toLocaleString()}`, margin, 34);

  // Section 1: Wallet Identity
  let currentY = 50;
  doc.setTextColor(33, 41, 54);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("1. IDENTIDAD DE LA BILLETERA", margin, currentY);
  
  currentY += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("Dirección:", margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.address, margin + 25, currentY);
  
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text("Red:", margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.network, margin + 25, currentY);

  // Section 2: Risk Assessment
  currentY += 15;
  const riskColor = data.riskAssessment?.riskLevel === 'BAJO' ? [16, 185, 129] : [225, 29, 72];
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("2. EVALUACIÓN DE RIESGO IA", margin, currentY);
  
  currentY += 8;
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 35, 'F');
  
  doc.setFontSize(12);
  doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
  doc.text(`NIVEL DE RIESGO: ${data.riskAssessment?.riskLevel || 'BAJO'} (${data.riskAssessment?.riskScore || 0}/100)`, margin + 5, currentY + 10);
  
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(data.riskAssessment?.summaryAnalysis || "No hay análisis disponible.", pageWidth - (margin * 2) - 10);
  doc.text(summaryLines, margin + 5, currentY + 18);
  
  currentY += 45;

  // Section 3: Financial Summary Table
  doc.setTextColor(33, 41, 54);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("3. RESUMEN FINANCIERO (USD)", margin, currentY);
  
  const financialData = [
    ["Patrimonio Neto Est.", `$ ${data.netWorthUSD.toLocaleString()}`],
    ["Total Recibido (Native + Stables)", `$ ${data.totalReceivedUSD.toLocaleString()}`],
    ["Total Enviado (Native + Stables)", `$ ${data.totalSentUSD.toLocaleString()}`],
    ["Balance Nativo", `${data.nativeBalance.toLocaleString()} ${data.network === 'TRON' ? 'TRX' : 'ETH'}`],
    ["Transacciones Totales", data.totalTxCount.toString()],
    ["Días Activos", data.activeDays.toString()]
  ];

  autoTable(doc, {
    startY: currentY + 5,
    body: financialData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Section 4: Behavioral Patterns
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("4. PATRONES DE COMPORTAMIENTO", margin, currentY);
  
  const patternData = (data.riskAssessment?.patternsDetected || []).map(p => [
    p.name,
    p.detected ? "DETECTADO" : "NO DETECTADO",
    p.description
  ]);

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Patrón', 'Estado', 'Descripción']],
    body: patternData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [139, 92, 246] },
    columnStyles: { 1: { fontStyle: 'bold' } }
  });

  // New Page for Transaction History
  doc.addPage();
  currentY = 20;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("5. ÚLTIMOS MOVIMIENTOS", margin, currentY);

  const txData = data.transactions.slice(0, 30).map(tx => [
    new Date(tx.timeStamp).toLocaleDateString(),
    tx.hash.substring(0, 16) + "...",
    tx.from.substring(0, 10) + "...",
    tx.to.substring(0, 10) + "...",
    `${tx.value.toLocaleString()} ${tx.tokenSymbol || '??'}`
  ]);

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Fecha', 'Hash', 'Desde', 'Hacia', 'Valor']],
    body: txData,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [33, 41, 54] }
  });

  // Save the PDF
  doc.save(`Forense_Crypto_${data.network}_${data.address.substring(0, 8)}.pdf`);
};
