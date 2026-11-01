import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { invoiceFileType } from "./invoice-parser";
export const INVOICE_UPLOAD_LIMIT = 8 * 1024 * 1024;
export const INVOICE_PAGE_LIMIT = 20;
export type CompactInvoice = { data: Buffer; preview: Buffer; mime: string; pages: number; originalBytes: number; storedBytes: number; fileHash: string };
export async function compactInvoice(source: Uint8Array): Promise<CompactInvoice> {
  if (!source.length || source.length > INVOICE_UPLOAD_LIMIT) throw new Error("Choose an invoice between 1 byte and 8 MB.");
  const mime = invoiceFileType(source), originalBytes = source.length;
  let data: Buffer, preview: Buffer, pages = 1, storedMime = mime === "application/pdf" ? mime : "image/jpeg";
  if (mime !== "application/pdf") {
    const metadata = await sharp(source, { limitInputPixels: 60_000_000 }).metadata();
    if ((metadata.pages ?? 1) > 1) throw new Error("Use a still photo or a PDF for multi-page invoices.");
    data = await sharp(source, { limitInputPixels: 60_000_000 }).rotate().resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: true }).flatten({ background: "white" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (mime === "image/png") {
      const png = await sharp(source, {limitInputPixels:60_000_000}).rotate().resize({width:2600,height:2600,fit:"inside",withoutEnlargement:true}).flatten({background:"white"}).png({compressionLevel:9}).toBuffer();
      if (png.length < data.length) { data = png; storedMime = "image/png"; }
    }
    preview = await sharp(data).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  } else {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // These assets are explicitly included in Next's deployment tracing.
    // A computed createRequire() is rewritten by webpack and loses .resolve.
    const root = join(process.cwd(), "node_modules", "pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(root,"legacy/build/pdf.worker.mjs")).href;
    const task = pdfjs.getDocument({ data: new Uint8Array(source), useSystemFonts: false, standardFontDataUrl: join(root,"standard_fonts/"), wasmUrl: join(root,"wasm/"), maxImageSize: 60_000_000, verbosity: 0 });
    try {
      const document = await task.promise;
      if (document.numPages < 1 || document.numPages > INVOICE_PAGE_LIMIT) throw new Error(`Use a PDF with 1–${INVOICE_PAGE_LIMIT} pages.`);
      pages = document.numPages;
      const output = await PDFDocument.create();
      let first: Buffer | null = null;
      for (let index = 1; index <= pages; index++) {
        const page = await document.getPage(index), base = page.getViewport({scale:1});
        const scale = Math.min(150/72, 2600/Math.max(base.width,base.height));
        const viewport = page.getViewport({scale});
        if (!Number.isFinite(viewport.width*viewport.height) || viewport.width < 1 || viewport.height < 1 || viewport.width*viewport.height > 7_000_000) throw new Error("This PDF page is too large to process safely. Export standard-sized pages first.");
        const canvas = createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport, background:"white" }).promise;
        const image = await sharp(canvas.toBuffer("image/png")).jpeg({quality:82,mozjpeg:true}).toBuffer();
        if (!first) first = image;
        const embedded = await output.embedJpg(image);
        output.addPage([base.width,base.height]).drawImage(embedded,{x:0,y:0,width:base.width,height:base.height});
        page.cleanup();
      }
      const compressed = Buffer.from(await output.save({useObjectStreams:true}));
      // Digital PDFs can already be smaller and sharper than a rasterized copy.
      data = compressed.length < source.length ? compressed : Buffer.from(source);
      preview = await sharp(first!).resize({width:900,withoutEnlargement:true}).jpeg({quality:78}).toBuffer();
    } catch(error) {
      if (error instanceof Error && /password/i.test(error.message)) throw new Error("Export an unlocked PDF before uploading.");
      throw error;
    } finally { await task.destroy(); }
  }
  if (data.length > INVOICE_UPLOAD_LIMIT) throw new Error("The compact invoice exceeds 8 MB. Split the document into smaller uploads.");
  return { data, preview, mime: storedMime, pages, originalBytes, storedBytes:data.length, fileHash:createHash("sha256").update(source).digest("hex") };
}
