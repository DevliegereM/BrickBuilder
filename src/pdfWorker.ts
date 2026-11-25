import type { GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Web build: the worker is a separate file served next to the app. */
export function setupPdfWorker(options: typeof GlobalWorkerOptions) {
  options.workerSrc = workerUrl;
}
