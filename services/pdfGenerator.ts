
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Changed from side-effect import
import { ExtractedField } from '../types';

export const generatePdf = (fileName: string, data: ExtractedField[]): void => {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(`Resumen de Análisis: ${fileName}`, 14, 20);

  doc.setFontSize(10);
  const generationDate = new Date().toLocaleString('es-CL');
  doc.text(`Fecha de Generación: ${generationDate}`, 14, 28);
  
  const tableData = data.map(item => [item.field, item.value]);

  // Changed from doc.autoTable to autoTable(doc, ...)
  autoTable(doc, {
    startY: 35,
    head: [['Campo', 'Valor Extraído']],
    body: tableData,
    theme: 'striped', // or 'grid', 'plain'
    headStyles: { fillColor: [22, 160, 133] }, // Dark cyan
    alternateRowStyles: { fillColor: [245, 245, 245] }, // Light gray for alternate rows
    styles: {
        font: 'helvetica', // Using a standard font
        cellPadding: 2,
        fontSize: 9,
        overflow: 'linebreak', // Handle long text by breaking lines
    },
    columnStyles: {
        0: { cellWidth: 'auto' }, // Field name column
        1: { cellWidth: 'auto' }, // Value column
    },
    didParseCell: function (hookData: any) { 
        // You can customize cell content here if needed
        // For example, to handle very long strings or specific formatting
        if (hookData.section === 'body' && hookData.column.index === 1) {
            if (hookData.cell.raw && typeof hookData.cell.raw === 'string' && hookData.cell.raw.length > 100) {
                 // Potentially truncate or add ellipsis, though 'linebreak' handles most cases
            }
        }
    }
  });

  doc.save(`Analisis_${fileName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};