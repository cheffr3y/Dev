"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useInvoiceDraft } from "./InvoiceDraftProvider";
import { Button } from "./ui";

const SourceContext = createContext<(page: number) => void>(() => {});
export const useInvoiceSource = () => useContext(SourceContext);

type Document = { id: string; filename: string; mime: string; pages: number; invoiceNumber?: string | null; notes?: string | null };

function DocumentCanvas({ document, page, zoom }: { document: Document; page: number; zoom: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState("Loading document…");
  useEffect(() => {
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        if (abort.signal.aborted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
        const response = await fetch(`/api/invoices/file?id=${encodeURIComponent(document.id)}`, { signal: abort.signal });
        if (!response.ok) throw new Error("Document unavailable. Try opening the full invoice.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (abort.signal.aborted) return;
        const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true, standardFontDataUrl: "/ocr/pdf/standard_fonts/", wasmUrl: "/ocr/pdf/wasm/" });
        dispose = () => { void task.destroy(); };
        const pdf = await task.promise;
        if (abort.signal.aborted) return;
        const sheet = await pdf.getPage(page);
        const viewport = sheet.getViewport({ scale: Math.min(2, 1800 / sheet.getViewport({ scale: 1 }).width) });
        const target = canvas.current;
        if (!target || abort.signal.aborted) return;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const context = target.getContext("2d");
        if (!context) throw new Error("Document preview unavailable. Open the full invoice to review it.");
        const rendering = sheet.render({ canvas: target, canvasContext: context, viewport, background: "white" });
        dispose = () => { rendering.cancel(); void task.destroy(); };
        await rendering.promise;
        if (!abort.signal.aborted) setMessage("");
      } catch (error) {
        if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to preview this page.");
      }
    }
    void render();
    return () => { abort.abort(); dispose?.(); };
  }, [document.id, page]);
  return <>{message && <p role="status" className="p-4 text-sm text-zinc-500">{message}</p>}<canvas ref={canvas} role="img" aria-label={`${document.filename}, page ${page}`} className="block h-auto max-w-none bg-white" style={{ width: `${zoom}%` }} /></>;
}

export function InvoiceWorkspace({ document, children }: { document: Document; children: ReactNode }) {
  const { draft, update } = useInvoiceDraft();
  const [page, setPage] = useState(Math.min(document.pages, draft.view.page)), [zoom, setZoom] = useState<number>(draft.view.zoom), [mobileSource, setMobileSource] = useState(draft.view.mobileSource);
  useEffect(() => { update(previous => ({ ...previous, view: { page, zoom: zoom as 100 | 150 | 200, mobileSource } })); }, [page, zoom, mobileSource, update]);
  const file = `/api/invoices/file?id=${encodeURIComponent(document.id)}`;
  const selectPage = useCallback((value: number) => { setPage(Math.max(1, Math.min(document.pages, value))); }, [document.pages]);
  return <SourceContext.Provider value={selectPage}>
    <div className="sticky top-14 z-20 mb-3 flex gap-2 bg-cream py-2 lg:hidden" aria-label="Invoice workspace view">
      <Button type="button" variant={mobileSource ? "secondary" : "primary"} aria-pressed={!mobileSource} onClick={() => setMobileSource(false)}>Review lines</Button>
      <Button type="button" variant={mobileSource ? "primary" : "secondary"} aria-pressed={mobileSource} onClick={() => setMobileSource(true)}>View invoice · p{page}</Button>
    </div>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section aria-label="Invoice source document" className={`${mobileSource ? "block" : "hidden"} min-w-0 overflow-hidden rounded-lg border border-hairline bg-canvas lg:sticky lg:top-20 lg:block`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-3">
          <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Source document</p><p className="mt-1 break-words text-sm font-medium">{document.filename}</p></div>
          <div className="flex gap-3 text-sm text-blue-600 underline"><a href={file} target="_blank" rel="noreferrer">Open full invoice</a><a href={`${file}&download=1`}>Download</a></div>
        </div>
        {(document.invoiceNumber || document.notes) && <details className="border-b border-hairline px-3 py-2 text-sm"><summary className="cursor-pointer text-zinc-500">{document.invoiceNumber ? `Invoice ${document.invoiceNumber}` : "Document notes"}</summary>{document.notes && <p className="mt-2 whitespace-pre-wrap break-words">{document.notes}</p>}</details>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-3">
          <div className="flex items-center gap-2"><Button type="button" variant="secondary" aria-label="Previous invoice page" disabled={page === 1} onClick={() => selectPage(page - 1)}>←</Button><label className="text-sm">Page <select aria-label="Invoice source page" className="rounded border border-hairline bg-canvas p-1" value={page} onChange={event => selectPage(Number(event.target.value))}>{Array.from({ length: document.pages }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select> of {document.pages}</label><Button type="button" variant="secondary" aria-label="Next invoice page" disabled={page === document.pages} onClick={() => selectPage(page + 1)}>→</Button></div>
          <label className="text-sm">Zoom <select aria-label="Invoice source zoom" className="rounded border border-hairline bg-canvas p-1" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={100}>Fit width</option><option value={150}>150%</option><option value={200}>200%</option></select></label>
        </div>
        <div className="max-h-[65dvh] overflow-auto bg-stone p-3" tabIndex={0} role="region" aria-label="Scrollable invoice preview">
          {document.mime === "application/pdf" ? <DocumentCanvas key={`${document.id}:${page}`} document={document} page={page} zoom={zoom} /> :
            /* Authenticated document URL; native image retains original resolution for zoom. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file} alt={document.filename} className="block h-auto max-w-none" style={{ width: `${zoom}%` }} />}
        </div>
      </section>
      <div className={`${mobileSource ? "hidden" : "block"} min-w-0 lg:block`}>{children}</div>
    </div>
  </SourceContext.Provider>;
}
