import { z } from "zod";

export function invoiceFileType(bytes: Uint8Array) {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (text(0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return "image/png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  throw new Error("Choose a PDF, JPEG, PNG or WebP invoice.");
}
export const localInvoiceLineSchema = z.object({
  key: z.string().max(100), page: z.number().int().min(1).max(20), lineNumber: z.number().int().positive(),
  rawText: z.string().max(1500), rawCode: z.string().max(100).nullable(), rawDescription: z.string().min(1).max(500),
  quantity: z.number().finite().nullable(), unit: z.string().max(40), unitPrice: z.number().finite().nullable(), extendedPrice: z.number().finite().nullable(),
  packQty: z.number().finite().positive().nullable(), packUnit: z.string().max(40), warnings: z.array(z.string().max(200)).max(10),
});
export type LocalInvoiceLine = z.infer<typeof localInvoiceLineSchema>;
export const localInvoiceDraftSchema = z.object({ version: z.literal(1), pages: z.array(z.object({ page: z.number().int().min(1).max(20), text: z.string().max(150000) })).min(1).max(20), lines: z.array(localInvoiceLineSchema).max(200) });
export type LocalInvoiceDraft = z.infer<typeof localInvoiceDraftSchema>;
const footer = /^(?:INVOICE\s+(?:TOTAL|NUMBER|NO|DATE)|SUB\s*TOTAL|GRAND\s+TOTAL|TOTAL\s+(?:DUE|AMOUNT)|TAX\b|SALES TAX|PAGE\s+\d|DELIVERY DATE|BILL TO|SHIP TO|TELEPHONE|PHONE|FAX|THANK YOU|PAYMENT TERMS|TERMS:|QTY\s+|ITEM\s+(?:CODE|NUMBER|DESCRIPTION))/i;
function numeric(raw: string) {
  const source = raw.replace(/[, $]/g, "").replace(/^\((.*)\)$/, "-$1");
  const repaired = source.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5");
  const base = Number(repaired);
  const options = [base];
  if (/^[S8]\d+[.]\d{2}$/.test(source)) options.push(Number(source.slice(1)));
  return { options: options.filter(Number.isFinite), changed: source !== repaired };
}
function hash(text: string) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0).toString(36); }
export function invoiceMathWarning(quantity: number | null, unitPrice: number | null, extendedPrice: number | null) {
  return quantity === null || unitPrice === null || extendedPrice === null || Math.abs(quantity * unitPrice - extendedPrice) > 0.020001;
}
export function parseInvoiceText(pages: { page: number; text: string }[]): LocalInvoiceDraft {
  const lines: LocalInvoiceLine[] = [];
  for (const page of pages) for (const [index, source] of page.text.split(/\r?\n/).entries()) {
    const raw = source.trim().replace(/\s+/g, " ");
    if (!raw || footer.test(raw) || /^(?:\+?1[- .])?\(?\d{3}\)?[- .]\d{3}[- .]\d{4}$/.test(raw) || /^\d+\s+.*\b(?:STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR)\.?$/i.test(raw)) continue;
    const money = [...raw.matchAll(/(?:^|\s)([-(]?[\dOIlS$8][\dOIlS,$.]*[.][\dOIlS]{2}\)?)(?=\s|$)/g)];
    if (!money.length) {
      const unknown=raw.match(/^([A-Z0-9-]{3,30})\s+(.+)$/i);
      if(unknown && /\d/.test(unknown[1]) || /^(FUEL SURCHARGE|LINEN BAG)\b/i.test(raw)) {
        if(lines.length>=200)throw new Error("More than 200 candidate lines. Split this invoice.");
        lines.push({key:`p${page.page}-l${index+1}-${hash(raw)}`,page:page.page,lineNumber:index+1,rawText:raw.slice(0,1500),rawCode:unknown&&/\d/.test(unknown[1])?unknown[1]:null,rawDescription:(unknown&&/\d/.test(unknown[1])?unknown[2]:raw).slice(0,500),quantity:null,unit:"",unitPrice:null,extendedPrice:null,packQty:null,packUnit:"",warnings:["Amounts unreadable or missing. Enter manually or mark ignored."]});
      }
      continue;
    }
    if (lines.length >= 200) throw new Error("More than 200 candidate lines. Split this invoice before recognition.");
    const last = money.at(-1)!, prior = money.length > 1 ? money.at(-2)! : null;
    let description = raw.slice(0, prior?.index ?? last.index).trim();
    const warnings: string[] = [];
    const codeMatch = description.match(/^([A-Z0-9-]{3,30})\s+/i);
    let rawCode = codeMatch && /\d/.test(codeMatch[1]) ? codeMatch[1] : null;
    if (rawCode) description = description.slice(codeMatch![0].length);
    const pack = description.match(/\b(\d+(?:[.]\d+)?)\s*[/xX]\s*(\d+(?:[.]\d+)?)\s*(LB|OZ|KG|G|GAL|QT|EA|EACH)\b/i);
    const simplePack = !pack ? description.match(/\b(\d+(?:[.]\d+)?)\s*(LB|OZ|KG|GAL|QT)\b/i) : null;
    const unitPattern = /(?:^|\s)([-\dOIlS.,]+)\s+(CS|CASE|CASES|LB|LBS|OZ|KG|EA|EACH|BAG|BOX|PK|PACK|GAL|QT)(?=\s*$)/i;
    const quantityMatch = description.match(unitPattern) ?? description.match(/(?:^|\s)([-\dOIlS.,]+)\s+(CS|CASE|CASES|LB|LBS|OZ|KG|EA|EACH|BAG|BOX|PK|PACK|GAL|QT)\b/i);
    let quantity = quantityMatch ? numeric(quantityMatch[1]).options[0] ?? null : null;
    const unit = quantityMatch?.[2]?.toLowerCase() ?? "";
    if (quantityMatch) { description = description.replace(quantityMatch[0], " ").trim(); if (numeric(quantityMatch[1]).changed) warnings.push("OCR quantity characters corrected; verify against the invoice."); }
    if (!rawCode) {
      const afterQuantity = description.match(/^([A-Z0-9-]{3,30})\s+/i);
      if (afterQuantity && /\d/.test(afterQuantity[1])) { rawCode = afterQuantity[1]; description = description.slice(afterQuantity[0].length); }
    }
    const prices = prior ? numeric(prior[1]) : null, totals = numeric(last[1]);
    let unitPrice = prices?.options[0] ?? null, extendedPrice = totals.options[0] ?? null;
    if (!quantityMatch) {
      const tail = description.match(/\s+(-?\d+(?:[.]\d+)?)$/);
      if (tail && !/[\d]\s*[/x]\s*\d/.test(tail[0])) { quantity = Number(tail[1]); description = description.slice(0, tail.index); }
      warnings.push("Confirm billed quantity and unit.");
    }
    if (quantity !== null && prices) {
      const matches = prices.options.flatMap(price => totals.options.filter(total => !invoiceMathWarning(quantity, price, total)).map(total => ({ price, total })));
      if (matches.length === 1) { if (unitPrice !== matches[0].price || extendedPrice !== matches[0].total) warnings.push("Ambiguous OCR currency prefix corrected using line math; verify."); unitPrice = matches[0].price; extendedPrice = matches[0].total; }
    }
    if (prices?.changed || totals.changed) warnings.push("OCR price characters corrected; verify against the invoice.");
    if (invoiceMathWarning(quantity, unitPrice, extendedPrice)) warnings.push("Quantity × unit price does not match the paid total, or a number is missing.");
    const simpleContent = simplePack && (!quantityMatch || !quantityMatch[0].includes(simplePack[0])) ? simplePack : null;
    const measured = ["lb","lbs","oz","kg","ea","each","gal","qt"].includes(unit);
    const packQty = pack ? Number(pack[1]) * Number(pack[2]) : simpleContent ? Number(simpleContent[1]) : measured ? 1 : null;
    const packUnit = pack?.[3]?.toLowerCase() ?? simpleContent?.[2]?.toLowerCase() ?? (measured ? unit : "");
    lines.push({ key: `p${page.page}-l${index + 1}-${hash(raw)}`, page: page.page, lineNumber: index + 1, rawText: raw.slice(0,1500), rawCode, rawDescription: (description || raw).slice(0,500), quantity, unit, unitPrice, extendedPrice, packQty, packUnit, warnings });
  }
  return localInvoiceDraftSchema.parse({ version: 1, pages, lines });
}
