import sharp from "sharp";
import { createHash } from "node:crypto";
import { invoiceFileType } from "../invoices/invoice-parser";
import {
  compactInvoice,
  INVOICE_UPLOAD_LIMIT,
} from "../invoices/invoice-storage";

export const SMOKE_UPLOAD_LIMIT = INVOICE_UPLOAD_LIMIT;
export async function compactSmokeDocument(source: Uint8Array) {
  if (!source.length || source.length > SMOKE_UPLOAD_LIMIT)
    throw new Error("Choose a photo or PDF under 8 MB.");
  const mime = invoiceFileType(source);
  if (mime === "application/pdf") return compactInvoice(source);
  const metadata = await sharp(source, {
    limitInputPixels: 60_000_000,
  }).metadata();
  if ((metadata.pages ?? 1) > 1)
    throw new Error("Use a still photo or a PDF for multiple pages.");
  const image = sharp(source, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({
      width: 2600,
      height: 2600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "white" });
  // Screenshots retain lossless text/curve pixels instead of JPEG artifacts.
  const storedMime = mime === "image/png" ? "image/png" : "image/jpeg";
  const data =
    storedMime === "image/png"
      ? await image.png({ compressionLevel: 9 }).toBuffer()
      : await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  if (data.length > SMOKE_UPLOAD_LIMIT)
    throw new Error("The compact photo exceeds 8 MB. Use a smaller image.");
  const preview = await sharp(data)
    .resize({ width: 900, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    data,
    preview,
    mime: storedMime,
    pages: 1,
    originalBytes: source.length,
    storedBytes: data.length,
    fileHash: createHash("sha256").update(source).digest("hex"),
  };
}
