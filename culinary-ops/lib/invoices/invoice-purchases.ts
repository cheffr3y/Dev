import { z } from "zod";
import { convertQty } from "../recipes/units";
import { convertIngredientQty, type IngredientMeasure } from "../ingredients/measurements";
import { operatingDate } from "../accounting/operating-calendar";
export const invoicePurchaseSchema = z.object({
  expectedMeasurementVersion: z.number().int().nonnegative().optional(),
  eachWeightOz: z.number().finite().positive().max(1e7).nullable().default(null),
  rawCode: z.string().trim().max(100).nullable().default(null), ocrLineKey: z.string().max(100).nullable().default(null), remember: z.boolean().default(false),
  ocrReviewed: z.boolean().default(false), confirmedUsd: z.boolean().default(true),
  billedUnitPrice: z.number().finite().nullable().default(null),
  id: z.string().min(1).max(150), invoiceDocumentId: z.string().min(1).max(150), revision: z.number().int().min(0).nullable(),
  itemId: z.string().min(1).max(150).nullable(), vendorId: z.string().min(1).max(150), venueId: z.string().min(1).max(150),
  invoiceDate: operatingDate, description: z.string().trim().min(1).max(500), amount: z.string().max(30),
  quantity: z.number().finite().positive().max(1e8), purchaseUnit: z.string().trim().min(1).max(40),
  packQty: z.number().finite().positive().max(1e8), packUnit: z.string().trim().min(1).max(40),
  countsAsFood: z.boolean(), voided: z.boolean().default(false), reason: z.string().trim().max(1000).default(""),
}).refine(row=>!row.ocrLineKey || row.ocrReviewed, "Verify the OCR line against the invoice before approval.");
export type InvoicePurchaseInput = z.input<typeof invoicePurchaseSchema>;
export function normalizedInvoicePrice(amountCents: number, quantity: number, packQty: number, packUnit: string, catalogUnit: string, measure: IngredientMeasure = {}) {
  if (![amountCents, quantity, packQty].every(Number.isFinite) || quantity <= 0 || packQty <= 0 || !packUnit.trim() || !catalogUnit.trim()) throw new Error("Confirm the billed quantity and pack contents.");
  const content = measure.measurementReviewedAt || measure.eachWeightOz != null || measure.densityGPerMl != null ? convertIngredientQty(quantity * packQty, packUnit, catalogUnit, measure) : convertQty(quantity * packQty, packUnit, catalogUnit);
  if (content == null || !Number.isFinite(content) || content <= 0) throw new Error(`Pack contents in ${packUnit} do not convert to the ingredient's ${catalogUnit} unit. Confirm the pack specification.`);
  const price = amountCents / 100 / content;
  if (!Number.isFinite(price) || Math.abs(price) > 1e9) throw new Error("The calculated unit price is outside the supported range. Review quantities and pack contents.");
  return price;
}
export type InvoicePurchaseData = Omit<z.infer<typeof invoicePurchaseSchema>, "amount" | "reason" | "remember" | "ocrReviewed" | "confirmedUsd" | "eachWeightOz" | "expectedMeasurementVersion"> & { measurementSnapshot?: IngredientMeasure | null; eachWeightOz?: number | null; amountCents: number; itemName: string | null; normalizedUnit: string | null; normalizedUnitCost: number | null; history: unknown; previousUnitCost?: number | null; priceChange?: number | null; varianceThreshold?: number };

export function invoiceNormalizationMeasure(item:IngredientMeasure & {unit:string}, current: {itemId:string|null;quantity:number;packQty:number;packUnit:string;normalizedUnit:string|null;measurementSnapshot?:unknown} | null | undefined, edit:{itemId:string|null;quantity:number;packQty:number;packUnit:string;eachWeightOz?:number|null}) {
  const captured = current?.measurementSnapshot as (IngredientMeasure & {eachWeightOverride?:number|null}) | null;
  const sameBasis = !!current && (edit.eachWeightOz??null)===(captured?.eachWeightOverride??null) && current.itemId===edit.itemId && current.quantity===edit.quantity && current.packQty===edit.packQty && current.packUnit===edit.packUnit && current.normalizedUnit===item.unit;
  return {sameBasis,measure:sameBasis ? captured??{} : {...item,eachWeightOz:edit.eachWeightOz??item.eachWeightOz}};
}
