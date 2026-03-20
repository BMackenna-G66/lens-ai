// Service to manage OCR Web Worker

let workerInstance: Worker | null = null;
const pendingJobs = new Map<string, {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number, status: string) => void;
}>();

const getWorker = (): Worker => {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../workers/ocrWorker.ts', import.meta.url), { type: 'module' });

    workerInstance.onmessage = (event: MessageEvent) => {
      const { id, type, payload } = event.data;
      const job = pendingJobs.get(id);
      if (!job) return;

      if (type === 'OCR_PROGRESS' && job.onProgress) {
        job.onProgress(payload.progress, payload.status);
      } else if (type === 'OCR_COMPLETE' || type === 'OCR_PAGE_COMPLETE') {
        pendingJobs.delete(id);
        job.resolve(payload.text);
      } else if (type === 'OCR_ERROR') {
        pendingJobs.delete(id);
        job.reject(new Error(payload.error));
      }
    };

    workerInstance.onerror = (error) => {
      console.error('OCR Worker error:', error);
      // Reject all pending jobs
      pendingJobs.forEach(job => job.reject(new Error('OCR Worker crashed')));
      pendingJobs.clear();
      workerInstance = null;
    };
  }
  return workerInstance;
};

export const runOCROnImageData = (
  imageData: ImageData | HTMLCanvasElement | string,
  onProgress?: (progress: number, status: string) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const id = `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Check if Web Workers are supported
    if (typeof Worker === 'undefined') {
      reject(new Error('Web Workers not supported'));
      return;
    }

    try {
      const worker = getWorker();
      pendingJobs.set(id, { resolve, reject, onProgress });

      worker.postMessage({
        id,
        type: 'OCR_IMAGE',
        payload: { imageData }
      });
    } catch (error: any) {
      reject(new Error(`Failed to start OCR worker: ${error.message}`));
    }
  });
};

export const terminateOCRWorker = (): void => {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    pendingJobs.clear();
  }
};
