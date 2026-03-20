
import { ProcessedDocument, ExtractedField } from '../types';
import { PREDEFINED_FIELDS } from '../constants';

const escapeCsvValue = (value: string | undefined | null): string => {
  if (value === null || value === undefined) {
    return '';
  }
  let strValue = String(value);
  // If the value contains a comma, newline, or double quote, wrap it in double quotes.
  // Also, escape any existing double quotes by doubling them.
  if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
    strValue = `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
};

export const generateCsv = (documents: ProcessedDocument[]): void => {
  if (documents.length === 0) {
    return;
  }

  const headers = ['FileName', ...PREDEFINED_FIELDS];
  let csvContent = headers.map(escapeCsvValue).join(',') + '\r\n';

  documents.forEach(doc => {
    if (doc.status !== 'COMPLETED') return;

    const row: string[] = [doc.fileName];
    const dataMap = new Map(doc.extractedData.map(ef => [ef.field, ef.value]));
    
    PREDEFINED_FIELDS.forEach(field => {
      row.push(dataMap.get(field) || "No especificado");
    });
    csvContent += row.map(escapeCsvValue).join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "analisis_documentos.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
