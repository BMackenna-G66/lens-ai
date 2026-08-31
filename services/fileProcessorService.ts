import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import type { TextItem, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.js`;

// Tesseract.js uses Web Workers internally — one worker is created and reused
// across all OCR calls to avoid the overhead of spawning a new worker per page.
let tesseractWorker: Tesseract.Worker | null = null;
let isTesseractInitialized = false;

// Per-call progress callback — updated before each recognize() call so the
// Tesseract logger can forward progress to whichever caller is active.
let activeProgressCallback: ((progress: number, status: string) => void) | null = null;

const initializeTesseract = async (): Promise<Tesseract.Worker> => {
    console.log('[Tesseract] Initializing Tesseract worker...');
    const worker = await Tesseract.createWorker('spa', undefined, {
        logger: m => {
            console.log(`[Tesseract] ${m.status}${m.progress ? ` (${(m.progress * 100).toFixed(2)}%)` : ''}`);
            if (m.progress !== undefined && activeProgressCallback) {
                activeProgressCallback(Math.round(m.progress * 100), m.status || 'Procesando...');
            }
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

/**
 * Terminates the shared Tesseract worker and resets state.
 * Call this when the application is shutting down or when you want to free
 * the worker thread resources explicitly.
 */
export const terminateTesseractWorker = async (): Promise<void> => {
    if (tesseractWorker) {
        await tesseractWorker.terminate();
        tesseractWorker = null;
        isTesseractInitialized = false;
        activeProgressCallback = null;
        console.log('[Tesseract] Worker terminated.');
    }
};


// `maxPaginasOcr` es OPCIONAL y por defecto no limita nada: el Lens clásico
// sigue leyendo el documento entero, exactamente como antes.
//
// Existe porque el bucle de OCR recorre TODAS las páginas, renderizando a escala
// 2.0 y pasando Tesseract por cada una. Una escritura escaneada de 40 páginas son
// 40 renders más 40 reconocimientos: varios minutos para UN documento. La cola
// KYB tiene un presupuesto por empresa y con eso se le iba entero — medido:
// "Lectura de documentos: no respondió en 240s".
export interface OpcionesTexto {
  maxPaginasOcr?: number;
  // Avisa cuando el tope RECORTÓ el documento. Sin esto se leerían 15 de 40
  // páginas en silencio, que es exactamente lo que una herramienta de compliance
  // no puede hacer: quien revisa tiene que saber que el documento se leyó
  // parcial.
  onTope?: (leidas: number, total: number) => void;
}

export const getTextFromFile = async (
  file: File,
  onProgress?: (progress: number, status: string) => void,
  opciones?: OpcionesTexto,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log(`Processing file type: ${file.type}`);

    if (file.type === 'application/pdf') {
      extractTextFromPdfWithOcr(file, onProgress, opciones).then(resolve).catch(reject);
    } else if (file.type === 'text/plain') {
      extractTextFromTxt(file).then(resolve).catch(reject);
    } else if (
        file.type === 'image/png' ||
        file.type === 'image/jpeg' ||
        file.type === 'image/jpg'
    ) {
      extractTextFromImageWithOcr(file, onProgress).then(resolve).catch(reject);
    } else {
      reject(new Error(`Tipo de archivo no soportado (${file.type}). Solo se permiten PDF, PNG, JPG y TXT.`));
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

const extractTextFromImageWithOcr = async (
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<string> => {
  console.log(`[extractTextFromImageWithOcr] Starting OCR text extraction for ${file.name}`);
  try {
    // Set the active progress callback so the shared Tesseract logger can forward it
    activeProgressCallback = onProgress ?? null;
    const worker = await getTesseractWorker();

    console.log(`[extractTextFromImageWithOcr] Performing OCR on image ${file.name}`);
    const { data: { text: ocrText } } = await worker.recognize(file); // Tesseract can take a File object
    activeProgressCallback = null;
    
    const trimmedOcrText = ocrText.trim();
    if (!trimmedOcrText) {
        console.warn(`[extractTextFromImageWithOcr] No text could be extracted by OCR from ${file.name}.`);
        throw new Error("OCR_NO_TEXT_DETECTED_IMG");
    }
    
    console.log(`[extractTextFromImageWithOcr] Successfully extracted text via OCR from ${file.name}. Total length: ${trimmedOcrText.length}. Preview (first 200 chars): "${trimmedOcrText.substring(0, 200).replace(/\n/g, ' ')}"`);
    return trimmedOcrText;

  } catch (error: any) {
    activeProgressCallback = null;
    console.error(`[extractTextFromImageWithOcr] Error during Image OCR for ${file.name}:`, error);
    const originalErrorMessage = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.stack) {
        console.error("[extractTextFromImageWithOcr] Original error stack:", error.stack);
    }

    if (originalErrorMessage === "OCR_NO_TEXT_DETECTED_IMG") {
        throw new Error(`OCR no pudo detectar texto en la imagen "${file.name}".`);
    }
    if (originalErrorMessage.toLowerCase().includes('failed to load script') || originalErrorMessage.toLowerCase().includes('networkerror')) {
      throw new Error(`OCR_INIT_ERROR_IMG: Error al cargar recursos de OCR (posible problema de red o CDN): ${originalErrorMessage}`);
    }
    if (originalErrorMessage.toLowerCase().includes('language')) {
         throw new Error(`OCR_INIT_ERROR_IMG: Error al cargar datos de idioma para OCR: ${originalErrorMessage}`);
    }
    
    throw new Error(`OCR_PROCESSING_ERROR_IMG: ${originalErrorMessage}`);
  }
};


const extractTextFromPdfWithOcr = async (
  file: File,
  onProgress?: (progress: number, status: string) => void,
  opciones?: OpcionesTexto,
): Promise<string> => {
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

    // Reuse the single shared Tesseract worker across all pages — avoids
    // the overhead of spinning up a new worker thread per page.
    const worker = await getTesseractWorker();

    let fullText = '';
    // Tope de páginas para el OCR. Sin `maxPaginasOcr` se leen todas, que es el
    // comportamiento histórico. Con tope se leen las PRIMERAS N: en una escritura
    // la identidad —RUT, razón social, comparecencia, capital, objeto social—
    // está al principio, y las últimas páginas son firmas y timbres.
    const paginasDelPdf = pdfDocProxy.numPages;
    const tope = opciones?.maxPaginasOcr && opciones.maxPaginasOcr > 0
      ? Math.min(opciones.maxPaginasOcr, paginasDelPdf)
      : paginasDelPdf;
    const totalPages = tope;
    if (tope < paginasDelPdf) {
      console.log(`[extractTextFromPdfWithOcr] Tope de OCR: ${tope} de ${paginasDelPdf} páginas`);
      opciones?.onTope?.(tope, paginasDelPdf);
    }
    for (let i = 1; i <= totalPages; i++) {
      console.log(`[extractTextFromPdfWithOcr] Rendering page ${i} of ${totalPages} for OCR`);

      // Emit coarse page-level progress to the caller before OCR starts on
      // each page, then let the Tesseract logger emit fine-grained progress.
      if (onProgress) {
        const pageStartPct = Math.round(((i - 1) / totalPages) * 100);
        onProgress(pageStartPct, `Página ${i} de ${totalPages}: preparando...`);
        // Wire the shared callback so Tesseract's internal logger forwards
        // per-recognition progress for this page.
        activeProgressCallback = (pct: number, status: string) => {
          const pagePct = Math.round(((i - 1) / totalPages) * 100 + (pct / totalPages));
          onProgress(pagePct, `Página ${i} de ${totalPages}: ${status}`);
        };
      } else {
        activeProgressCallback = null;
      }

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

    // Clear the progress callback once all pages are done
    activeProgressCallback = null;

    const trimmedFullText = fullText.trim();
    if (!trimmedFullText) {
        console.warn(`[extractTextFromPdfWithOcr] No text could be extracted by OCR from ${file.name} after processing all pages.`);
        throw new Error("OCR_NO_TEXT_DETECTED"); 
    }
    
    console.log(`[extractTextFromPdfWithOcr] Successfully extracted text via OCR from ${file.name}. Total length: ${trimmedFullText.length}. Preview (first 200 chars): "${trimmedFullText.substring(0, 200).replace(/\n/g, ' ')}"`);
    return trimmedFullText;

  } catch (error: any) {
    activeProgressCallback = null;
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