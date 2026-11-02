import { z } from "zod";
import { businessDate } from "../prep/prep-dates";
import { convertQty, unitFamily } from "../recipes/units";
import { ALLERGENS } from "../recipes/allergens";

export const PRESERVATION_METHODS = ["Dehydration", "Freeze-drying", "Curing", "Fermentation", "Other preservation"] as const;
const text = (max: number) => z.string().trim().max(max);
const weight = z.number().finite().min(0).max(1e8);
const date = z.string().refine(value => { try { businessDate(value); return true; } catch { return false; } }, "Choose a real calendar date.");
const instant = z.string().datetime({ offset: true });
export const preservationCreateSchema = z.object({
  id: z.string().uuid(), name: text(160).min(1), venueId: text(150).min(1), recipeId: text(150).min(1).nullable(), itemId: text(150).min(1).nullable(),
  method: z.enum(PRESERVATION_METHODS), productionDate: date, startedAt: instant,
  unit: z.enum(["kg", "lb", "gram", "oz"]), wetGross: weight, wetTare: weight,
  inputCost: z.number().finite().min(0).max(1e8), costNotes: text(1000).min(1),
  equipment: text(160), temperature: z.number().finite().min(-150).max(1000).nullable(), temperatureUnit: z.enum(["F", "C"]),
  humidity: z.number().finite().min(0).max(100).nullable(), cycleMinutes: z.number().int().min(0).max(525600).nullable(),
  shelfLife: text(300), useBy: date.nullable(), allergens: z.array(z.string().refine(value => ALLERGENS.some(tag => tag.key === value))).max(30), notes: text(5000),
}).strict().refine(data => data.wetGross > data.wetTare, "Initial gross weight must exceed its tare.")
  .refine(data => !data.useBy || data.useBy >= data.productionDate, "Use-by cannot precede the production date.");
export type PreservationInput = z.infer<typeof preservationCreateSchema>;
export const preservationFinishSchema = z.object({ gross: weight, tare: weight, finishedAt: instant, notes: text(5000) }).strict()
  .refine(value => value.gross >= value.tare, "Finished gross weight cannot be less than its tare.");
export const preservationFactsSchema = z.object({
  version: z.literal(1), input: preservationCreateSchema,
  recipe: z.object({ id: z.string(), name: z.string(), version: z.number() }).nullable(),
  item: z.object({ id: z.string(), name: z.string(), unit: z.string() }).nullable(),
  venueName: z.string(), allergens: z.string(),
  finished: preservationFinishSchema.nullable(),
  posting: z.object({ at: instant, actorName: z.string(), previousCost: z.number(), cost: z.number(), unit: z.string() }).nullable(),
  void: z.object({ at: instant, actorName: z.string(), reason: z.string() }).nullable(),
});
export type PreservationFacts = z.infer<typeof preservationFactsSchema>;

export function preservationMetrics(input: Pick<PreservationInput, "wetGross" | "wetTare" | "unit" | "inputCost" | "startedAt">, finished: z.infer<typeof preservationFinishSchema> | null) {
  const wet = input.wetGross - input.wetTare;
  if (!Number.isFinite(wet) || wet <= 0 || input.wetGross < 0 || input.wetTare < 0 || !Number.isFinite(input.inputCost) || input.inputCost < 0 || unitFamily(input.unit) !== "weight") throw new Error("Invalid initial weight or input cost.");
  const net = finished ? finished.gross - finished.tare : null;
  if (net !== null && (!Number.isFinite(net) || net < 0 || finished!.gross < 0 || finished!.tare < 0)) throw new Error("Invalid finished weight.");
  const yieldPct = net === null ? null : Math.abs(net - wet) <= Math.max(1, net, wet) * 1e-12 ? 100 : net / wet * 100;
  const elapsed = finished ? (new Date(finished.finishedAt).getTime() - new Date(input.startedAt).getTime()) / 60000 : null;
  if (yieldPct !== null && !Number.isFinite(yieldPct)) throw new Error("Measurements exceed the calculation range.");
  if (elapsed !== null && (!Number.isFinite(elapsed) || elapsed < 0)) throw new Error("Finish time cannot precede start time.");
  return { wet, finished: net, yieldPct, lossPct: yieldPct === null ? null : 100 - yieldPct, elapsedMinutes: elapsed,
    unitCost: net !== null && net > 0 && Number.isFinite(input.inputCost / net) ? input.inputCost / net : null };
}

export function preservationCatalogCost(facts: PreservationFacts, itemUnit: string) {
  const { finished } = preservationMetrics(facts.input, facts.finished);
  if (unitFamily(itemUnit) !== "weight" || finished === null || finished <= 0) return null;
  const quantity = convertQty(finished, facts.input.unit, itemUnit);
  const cost = quantity !== null && quantity > 0 ? facts.input.inputCost / quantity : null;
  return cost !== null && Number.isFinite(cost) && cost <= 1e8 ? cost : null;
}
