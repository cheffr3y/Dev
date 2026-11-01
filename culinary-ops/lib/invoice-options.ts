import { z } from "zod";
import { convertQty } from "./units";
export const invoiceLineSchema = z.object({ description: z.string().max(500), sku: z.string().nullable(), gcode: z.string().nullable(), packSize: z.string().nullable(), quantity: z.number().finite().nullable(), unitPrice: z.number().finite().nullable(), priceUnit: z.string().nullable(), packQuantity: z.number().finite().nullable(), packUnit: z.string().nullable(), extendedTotal: z.number().finite().nullable(), notes: z.string().nullable() });
export const invoiceSchema = z.object({ vendorName: z.string().max(300), invoiceNumber: z.string().nullable(), invoiceDate: z.string().nullable(), currency: z.string(), lines: z.array(invoiceLineSchema).min(1).max(200) });
export type ParsedInvoice = z.infer<typeof invoiceSchema>;
export type InvoiceLine = ParsedInvoice["lines"][number];
export const decisionSchema = z.object({ line: z.number().int().min(0).max(199), itemId: z.string().min(1), unitCost: z.number().finite().positive().max(100000000), expectedCost: z.number().finite().min(0), expectedUnit: z.string().min(1), expectedUpdatedAt: z.string(), acknowledge: z.literal(true) });
export const reviewSchema = z.object({ vendorId: z.string().min(1), confirmedUsd: z.literal(true), decisions: z.array(decisionSchema).min(1).max(200) });
export type InvoiceReview = z.infer<typeof reviewSchema>;
export function invoiceCost(line: InvoiceLine, itemUnit: string) {
  if (line.unitPrice == null || line.unitPrice <= 0 || !line.priceUnit) return null;
  let units = convertQty(1, line.priceUnit, itemUnit);
  if (units == null && /^(case|cs|pack|pk|box)$/i.test(line.priceUnit) && line.packQuantity != null && line.packQuantity > 0 && line.packUnit) units = convertQty(line.packQuantity, line.packUnit, itemUnit);
  return units != null && units > 0 ? line.unitPrice / units : null;
}
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export function invoiceMatches(line: InvoiceLine, vendorName: string, items: { id: string; name: string; sku: string | null; gcode: string | null; vendor: { name: string } | null }[]) {
  const tokens = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1));
  const source = tokens(line.description);
  return items.map(item => {
    const target = tokens(item.name), overlap = [...source].filter(token => target.has(token)).length;
    const nameScore = overlap / Math.max(1, new Set([...source, ...target]).size);
    const sameVendor = !!vendorName && !!item.vendor && key(vendorName) === key(item.vendor.name);
    const sku = sameVendor && !!line.sku && !!item.sku && key(line.sku) === key(item.sku);
    const gcode = !!line.gcode && !!item.gcode && key(line.gcode) === key(item.gcode);
    return { id: item.id, score: gcode ? 3 : sku ? 2 : nameScore, reason: gcode ? "GCODE" : sku ? "Same-vendor SKU" : "Description similarity — verify product and pack" };
  }).filter(item => item.score > 0).sort((a,b) => b.score-a.score).slice(0,5);
}
