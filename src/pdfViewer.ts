import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function countPages(data: Blob): Promise<number> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

export class PdfViewer {
  private doc: pdfjs.PDFDocumentProxy | null = null;
  private loading: pdfjs.PDFDocumentLoadingTask | null = null;
  private canvas = document.createElement('canvas');
  private task: pdfjs.RenderTask | null = null;
  private zoom = 1;
  private resizeObs: ResizeObserver;
  page = 1;

  constructor(
    private scroller: HTMLElement,
    private onPage: (page: number, total: number) => void,
  ) {
    scroller.appendChild(this.canvas);
    this.resizeObs = new ResizeObserver(() => void this.render());
    this.resizeObs.observe(scroller);
  }

  get total() {
    return this.doc?.numPages ?? 0;
  }

  async open(data: Blob, page: number) {
    this.task?.cancel();
    const old = this.loading;
    this.doc = null;
    void old?.destroy();
    this.scroller.scrollTo({ top: 0, left: 0 });
    this.loading = pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) });
    this.doc = await this.loading.promise;
    this.page = Math.min(Math.max(1, page), this.doc.numPages);
    await this.render();
  }

  go(page: number) {
    if (!this.doc) return;
    const next = Math.min(Math.max(1, page), this.doc.numPages);
    if (next === this.page) return;
    this.page = next;
    this.scroller.scrollTo({ top: 0, left: 0 });
    void this.render();
  }

  setZoom(factor: number) {
    this.zoom = Math.min(4, Math.max(0.5, this.zoom * factor));
    void this.render();
  }

  resetZoom() {
    this.zoom = 1;
    void this.render();
  }

  private async render() {
    if (!this.doc) return;
    const width = this.scroller.clientWidth;
    if (!width) return;
    this.task?.cancel();
    const page = await this.doc.getPage(this.page);
    const base = page.getViewport({ scale: 1 });
    // Fit whole page into the panel, then apply user zoom.
    const fit = Math.min(width / base.width, this.scroller.clientHeight / base.height || Infinity);
    const css = page.getViewport({ scale: fit * this.zoom });
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vp = page.getViewport({ scale: fit * this.zoom * dpr });
    const off = document.createElement('canvas');
    off.width = Math.floor(vp.width);
    off.height = Math.floor(vp.height);
    this.task = page.render({ canvas: off, viewport: vp });
    try {
      await this.task.promise;
    } catch {
      return; // cancelled by a newer render
    }
    this.canvas.width = off.width;
    this.canvas.height = off.height;
    this.canvas.style.width = `${Math.floor(css.width)}px`;
    this.canvas.style.height = `${Math.floor(css.height)}px`;
    this.canvas.getContext('2d')!.drawImage(off, 0, 0);
    this.onPage(this.page, this.doc.numPages);
  }

  async destroy() {
    this.resizeObs.disconnect();
    this.task?.cancel();
    this.doc = null;
    await this.loading?.destroy();
  }
}
