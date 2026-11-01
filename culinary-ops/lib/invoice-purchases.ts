import { z } from "zod";
import { convertQty } from "./units";
import { operatingDate } from "./operating-calendar";
export const invoicePurchaseSchema = z.object({
  id: z.string().min(1).max(150), invoiceDocumentId: z.string().min(1).max(150), revision: z.number().int().min(0).nullable(),
  itemId: z.string().min(1).max(150).nullable(), vendorId: z.string().min(1).max(150), venueId: z.string().min(1).max(150),
  invoiceDate: operatingDate, description: z.string().trim().min(1).max(500), amount: z.string().max(30),
  quantity: z.number().finite().positive().max(1e8), purchaseUnit: z.string().trim().min(1).max(40),
  packQty: z.number().finite().positive().max(1e8), packUnit: z.string().trim().min(1).max(40),
  countsAsFood: z.boolean(), voided: z.boolean().default(false), reason: z.string().trim().max(1000).default(""),
});
export type InvoicePurchaseInput = z.input<typeof invoicePurchaseSchema>;
export function normalizedInvoicePrice(amountCents: number, quantity: number, packQty: number, packUnit: string, catalogUnit: string) {
  if (![amountCents, quantity, packQty].every(Number.isFinite) || quantity <= 0 || packQty <= 0 || !packUnit.trim() || !catalogUnit.trim()) throw new Error("Confirm the billed quantity and pack contents.");
  const content = convertQty(quantity * packQty, packUnit, catalogUnit);
  if (content == null || !Number.isFinite(content) || content <= 0) throw new Error(`Pack contents in ${packUnit} do not convert to the ingredient's ${catalogUnit} unit. Confirm the pack specification.`);
  const price = amountCents / 100 / content;
  if (!Number.isFinite(price) || Math.abs(price) > 1e9) throw new Error("The calculated unit price is outside the supported range. Review quantities and pack contents.");
  return price;
}
export type InvoicePurchaseData = Omit<z.infer<typeof invoicePurchaseSchema>, "amount" | "reason"> & { amountCents: number; itemName: string | null; normalizedUnit: string | null; normalizedUnitCost: number | null; history: unknown };
