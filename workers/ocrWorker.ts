// Web Worker for Tesseract OCR processing
// This runs in a separate thread to avoid blocking the main UI

import { createWorker } from 'tesseract.js';

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  if (type === 'OCR_IMAGE') {
    try {
      self.postMessage({ id, type: 'OCR_PROGRESS', payload: { progress: 0, status: 'Iniciando OCR...' } });

      const worker = await createWorker('spa', 1, {
        logger: (m: any) => {
          if (m.progress !== undefined) {
            self.postMessage({
              id,
              type: 'OCR_PROGRESS',
              payload: { progress: Math.round(m.progress * 100), status: m.status || 'Procesando...' }
            });
          }
        }
      });

      const { data: { text } } = await worker.recognize(payload.imageData);
      await worker.terminate();

      self.postMessage({ id, type: 'OCR_COMPLETE', payload: { text } });
    } catch (error: any) {
      self.postMessage({ id, type: 'OCR_ERROR', payload: { error: error.message } });
    }
  }

  if (type === 'OCR_PDF_PAGE') {
    try {
      const worker = await createWorker('spa', 1, {
        logger: (m: any) => {
          if (m.progress !== undefined) {
            self.postMessage({
              id,
              type: 'OCR_PROGRESS',
              payload: { progress: Math.round(m.progress * 100), status: `Página ${payload.pageNum}: ${m.status || 'procesando'}` }
            });
          }
        }
      });

      const { data: { text } } = await worker.recognize(payload.imageData);
      await worker.terminate();

      self.postMessage({ id, type: 'OCR_PAGE_COMPLETE', payload: { text, pageNum: payload.pageNum } });
    } catch (error: any) {
      self.postMessage({ id, type: 'OCR_ERROR', payload: { error: error.message } });
    }
  }
};
