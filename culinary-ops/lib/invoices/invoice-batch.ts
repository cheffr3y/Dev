import { z } from "zod";
import { invoicePurchaseSchema } from "./invoice-purchases";

export const invoiceBatchSchema = z.object({
  operationId: z.string().uuid(),
  documentId: z.string().min(1).max(150),
  expectedLineRevision: z.number().int().nonnegative(),
  lines: z.array(invoicePurchaseSchema).max(200),
  ignoredKeys: z.array(z.string().max(100)).max(200),
  commit: z.boolean(),
  expenseId: z.string().min(1).max(150),
  expenseRevision: z.number().int().nonnegative().nullable(),
}).refine(batch => batch.lines.every(line => line.invoiceDocumentId === batch.documentId), "All lines must belong to this invoice.")
  .refine(batch => new Set(batch.lines.map(line => line.id)).size === batch.lines.length, "Duplicate invoice lines.")
  .refine(batch => new Set(batch.lines.filter(line=>line.ocrLineKey).map(line=>line.ocrLineKey)).size === batch.lines.filter(line=>line.ocrLineKey).length, "Duplicate OCR lines.");
