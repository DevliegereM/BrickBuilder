import type { GlobalWorkerOptions } from 'pdfjs-dist';
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

/**
 * Standalone build (BrickBuilder.html opened from disk): there is no server to load a
 * worker file from, and browsers refuse module workers on file:// pages. The embedded
 * ES-module worker is rewritten into a classic script and started from a blob URL.
 * If workers are unavailable entirely, pdf.js runs on the main thread instead.
 */
const classicSource = workerSource
  .replace(/export\s*\{[^}]*\};?\s*$/, '')
  .replace(/import\.meta\.url/g, 'self.location.href');

export function setupPdfWorker(options: typeof GlobalWorkerOptions) {
  try {
    const url = URL.createObjectURL(new Blob([classicSource], { type: 'text/javascript' }));
    options.workerPort = new Worker(url);
  } catch {
    // Main-thread fallback: pdf.js picks up globalThis.pdfjsWorker as a "fake worker".
    (0, eval)(classicSource);
  }
}
