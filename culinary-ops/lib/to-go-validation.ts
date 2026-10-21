import { z } from "zod";
import { businessDate } from "./prep-dates";
import { SELLING_UNITS, TO_GO_CONFIDENCE, TO_GO_STATUSES } from "./to-go-options";

const text = z.string().trim().max(5000).transform(value => value || null);
const optionalNumber = z.preprocess(value => value === "" || value == null ? null : value,
  z.coerce.number().min(0).max(100000000).nullable());
export const toGoHeaderSchema = z.object({
  name: z.string().trim().min(1).max(200), venueId: text,
  status: z.enum(TO_GO_STATUSES), notes: text, pickupNotes: text,
  orderCutoff: text.refine(value => {
    if (value == null) return true;
    try { businessDate(value); return true; } catch { return false; }
  }, "Enter a valid calendar date."),
});
export const toGoLineSchema = z.object({
  name: z.string().trim().min(1).max(200), section: z.string().trim().min(1).max(100),
  recipeId: text, description: text,
  sellingUnit: text.refine(value => value == null || SELLING_UNITS.some(unit => unit.value === value), "Choose a selling unit."),
  recipeQtyPerUnit: optionalNumber.refine(value => value == null || value > 0, "Amount per selling unit must be greater than zero."),
  recipeAmountUnit: text,
  price: optionalNumber, packagingCost: optionalNumber, forecastQty: optionalNumber,
  productionQty: optionalNumber, actualSoldQty: optionalNumber,
  confidence: z.enum(TO_GO_CONFIDENCE.map(option => option.value)),
  packingNotes: text, customerInstructions: text, notes: text,
  sortOrder: z.coerce.number().int().min(0).max(1000000),
}).superRefine((data, context) => {
  if (data.recipeQtyPerUnit != null && (!data.recipeId || !data.recipeAmountUnit)) {
    context.addIssue({ code: "custom", path: ["recipeQtyPerUnit"], message: "A content amount requires a linked recipe and its measurement unit." });
  }
});
