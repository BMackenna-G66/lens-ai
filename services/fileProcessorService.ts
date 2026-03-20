
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import type { TextItem, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.js`;

let tesseractWorker: Tesseract.Worker | null = null;
let isTesseractInitialized = false;

const initializeTesseract = async (): Promise<Tesseract.Worker> => {
    console.log('[Tesseract] Initializing Tesseract worker...');
    const worker = await Tesseract.createWorker('spa', undefined, { 
        logger: m => {
            console.log(`[Tesseract] ${m.status}${m.progress ? ` (${(m.progress * 100).toFixed(2)}%)` : ''}`);
        },
    });
    isTesseractInitialized = true;
    console.log('[Tesseract] Tesseract worker initialized and Spanish language loaded.');
    return worker;
};

const getTesseractWorker = async (): Promise<Tesseract.Worker> => {
    if (tesseractWorker && isTesseractInitialized) {
        return tesseractWorker;
    }
    tesseractWorker = await initializeTesseract();
    return tesseractWorker;
};


export const getTextFromFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      extractTextFromPdfWithOcr(file).then(resolve).catch(reject);
    } else if (file.type === 'text/plain') {
      extractTextFromTxt(file).then(resolve).catch(reject);
    } else if (file.type === 'image/png') {
      extractTextFromPngWithOcr(file).then(resolve).catch(reject);
    }
     else {
      reject(new Error('Tipo de archivo no soportado. Solo PDF, PNG y TXT.'));
    }
  });
};

const extractTextFromTxt = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && typeof event.target.result === 'string') {
        resolve(event.target.result);
      } else {
        reject(new Error('No se pudo leer el archivo TXT.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Error al leer el archivo TXT.'));
    };
    reader.readAsText(file);
  });
};

const extractTextFromPngWithOcr = async (file: File): Promise<string> => {
  console.log(`[extractTextFromPngWithOcr] Starting OCR text extraction for ${file.name}`);
  try {
    const worker = await getTesseractWorker();
    
    console.log(`[extractTextFromPngWithOcr] Performing OCR on image ${file.name}`);
    const { data: { text: ocrText } } = await worker.recognize(file); // Tesseract can take a File object
    
    const trimmedOcrText = ocrText.trim();
    if (!trimmedOcrText) {
        console.warn(`[extractTextFromPngWithOcr] No text could be extracted by OCR from ${file.name}.`);
        throw new Error("OCR_NO_TEXT_DETECTED_PNG");
    }
    
    console.log(`[extractTextFromPngWithOcr] Successfully extracted text via OCR from ${file.name}. Total length: ${trimmedOcrText.length}. Preview (first 200 chars): "${trimmedOcrText.substring(0, 200).replace(/\n/g, ' ')}"`);
    return trimmedOcrText;

  } catch (error: any) {
    console.error(`[extractTextFromPngWithOcr] Error during PNG OCR for ${file.name}:`, error);
    const originalErrorMessage = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.stack) {
        console.error("[extractTextFromPngWithOcr] Original error stack:", error.stack);
    }

    if (originalErrorMessage === "OCR_NO_TEXT_DETECTED_PNG") {
        throw new Error(`OCR no pudo detectar texto en la imagen PNG "${file.name}".`);
    }
    if (originalErrorMessage.toLowerCase().includes('failed to load script') || originalErrorMessage.toLowerCase().includes('networkerror')) {
      throw new Error(`OCR_INIT_ERROR_PNG: Error al cargar recursos de OCR para PNG (posible problema de red o CDN): ${originalErrorMessage}`);
    }
    if (originalErrorMessage.toLowerCase().includes('language')) {
         throw new Error(`OCR_INIT_ERROR_PNG: Error al cargar datos de idioma para OCR de PNG: ${originalErrorMessage}`);
    }
    
    throw new Error(`OCR_PROCESSING_ERROR_PNG: ${originalErrorMessage}`);
  }
};


const extractTextFromPdfWithOcr = async (file: File): Promise<string> => {
  console.log(`[extractTextFromPdfWithOcr] Starting OCR text extraction for ${file.name}`);
  let pdfDocProxy: PDFDocumentProxy | null = null; 

  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfDocProxy = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    console.log(`[extractTextFromPdfWithOcr] PDF loaded. Number of pages: ${pdfDocProxy.numPages}`);
    
    if (pdfDocProxy.numPages === 0) {
        console.warn(`[extractTextFromPdfWithOcr] PDF ${file.name} has 0 pages.`);
        throw new Error("PDF_ZERO_PAGES"); 
    }

    const worker = await getTesseractWorker(); 
    
    let fullText = '';
    for (let i = 1; i <= pdfDocProxy.numPages; i++) {
      console.log(`[extractTextFromPdfWithOcr] Rendering page ${i} of ${pdfDocProxy.numPages} for OCR`);
      const page = await pdfDocProxy.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); 

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        console.error(`[extractTextFromPdfWithOcr] Failed to get 2D context for page ${i}`);
        throw new Error(`OCR_CANVAS_CONTEXT_ERROR: No se pudo obtener el contexto del canvas para la página ${i}.`);
      }
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      console.log(`[extractTextFromPdfWithOcr] Performing OCR on page ${i}`);
      const { data: { text: ocrText } } = await worker.recognize(canvas);
      
      if (ocrText && ocrText.trim() !== "") {
        fullText += ocrText.trim() + '\n\n'; 
        console.log(`[extractTextFromPdfWithOcr] Page ${i} OCR Result (first 100 chars): ${ocrText.substring(0,100).replace(/\n/g, ' ')}`);
      } else {
        console.log(`[extractTextFromPdfWithOcr] Page ${i}: No text detected by OCR or text was empty.`);
      }
      page.cleanup(); 
    }

    const trimmedFullText = fullText.trim();
    if (!trimmedFullText) {
        console.warn(`[extractTextFromPdfWithOcr] No text could be extracted by OCR from ${file.name} after processing all pages.`);
        throw new Error("OCR_NO_TEXT_DETECTED"); 
    }
    
    console.log(`[extractTextFromPdfWithOcr] Successfully extracted text via OCR from ${file.name}. Total length: ${trimmedFullText.length}. Preview (first 200 chars): "${trimmedFullText.substring(0, 200).replace(/\n/g, ' ')}"`);
    return trimmedFullText;

  } catch (error: any) {
    console.error(`[extractTextFromPdfWithOcr] Error during PDF OCR for ${file.name}:`, error);
    const originalErrorMessage = error instanceof Error ? error.message : String(error);
     if (error instanceof Error && error.stack) {
        console.error("[extractTextFromPdfWithOcr] Original error stack:", error.stack);
    }

    if (["PDF_ZERO_PAGES", "OCR_NO_TEXT_DETECTED", "OCR_CANVAS_CONTEXT_ERROR"].includes(originalErrorMessage)) {
        throw error; 
    }
    if (originalErrorMessage.toLowerCase().includes('failed to load script') || originalErrorMessage.toLowerCase().includes('networkerror')) {
      throw new Error(`OCR_INIT_ERROR: Error al cargar recursos de OCR (posible problema de red o CDN): ${originalErrorMessage}`);
    }
    if (originalErrorMessage.toLowerCase().includes('language')) {
         throw new Error(`OCR_INIT_ERROR: Error al cargar datos de idioma para OCR: ${originalErrorMessage}`);
    }
    
    throw new Error(`OCR_PROCESSING_ERROR: ${originalErrorMessage}`);
  }
};
