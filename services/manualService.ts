// manualService.ts
// Loads the Global66 LAFT Prevention Manual (G81-MAN-003 v9) from the public
// folder, extracts its text with pdfjs-dist, and caches it in localStorage so
// subsequent calls are instantaneous.

import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const CACHE_KEY = 'lens_ai_manual_laft_v9_text';

let _cachedText: string | null = null;

async function fetchManualPdf(): Promise<ArrayBuffer> {
  // Try GitHub Pages path first, then local dev path
  const paths = ['/lens-ai/manual_laft.pdf', '/manual_laft.pdf'];
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.arrayBuffer();
    } catch { /* try next */ }
  }
  throw new Error('No se pudo cargar el manual de referencia LAFT.');
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is any => 'str' in item)
      .map((item: any) => item.str)
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n');
}

/**
 * Returns the full text of the Global66 LAFT manual.
 * - First call: fetches + extracts (takes ~2-3s), caches in memory + localStorage.
 * - Subsequent calls: returns immediately from memory.
 * - Page reload: restores from localStorage in <50ms.
 */
export async function getManualText(): Promise<string> {
  // 1. In-memory cache (fastest)
  if (_cachedText) return _cachedText;

  // 2. localStorage cache
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored && stored.length > 1000) {
      _cachedText = stored;
      return _cachedText;
    }
  } catch { /* storage unavailable */ }

  // 3. Fetch + extract
  const buffer = await fetchManualPdf();
  const text = await extractTextFromPdf(buffer);

  _cachedText = text;
  try {
    localStorage.setItem(CACHE_KEY, text);
  } catch { /* quota exceeded – skip cache */ }

  return text;
}

/** Invalidate cache (useful if manual is updated) */
export function clearManualCache(): void {
  _cachedText = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ok */ }
}
