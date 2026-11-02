import { z } from "zod";
import { convertQty, unitFamily } from "../recipes/units";

export const SMOKE_PRODUCTS = [
  "Brisket",
  "Pork shoulder",
  "Ribs",
  "Whole chicken",
  "Cheddar cheese",
  "Jalapeño cheddar sausage",
] as const;
export const CHECKPOINTS = [
  "LOAD",
  "WRAP",
  "PULL",
  "REST",
  "HOLD",
  "COOL",
  "CHECK",
] as const;
const text = (max = 5000) => z.string().trim().max(max);
export const referenceId = z.string().min(1).max(150);
const reference = referenceId.nullable().default(null);
export const smokeDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Choose a real calendar date.");
export const temperature = z.number().finite().min(-100).max(1000).nullable();
export const measureSchema = z.object({
  quantity: z.number().finite().min(0).max(1e8),
  unit: text(40).min(1),
});
export type SmokeMeasure = z.infer<typeof measureSchema>;
export const procedureSchema = z.object({
  product: text(160).min(1),
  mode: z.enum(["HOT", "COLD"]),
  procedure: text(),
  smokerSettings: text(1000),
  woodFuel: text(500),
  seasoning: text(1000),
  targetTemperature: temperature,
  temperatureUnit: z.enum(["F", "C"]),
});
export const profileSchema = procedureSchema.extend({ name: text(160).min(1) });
export const runSchema = z.object({
  name: text(160).min(1),
  smoker: text(160).min(1),
  cookName: text(160).min(1),
  notes: text(),
});
export const planSchema = procedureSchema
  .extend({
    label: text(160).min(1),
    cookName: text(160).min(1),
    assignedUserId: reference,
    recipeId: reference,
    projectId: reference,
    profileId: reference,
    profileRevision: z.number().int().nonnegative().nullable().default(null),
    targetYield: measureSchema.nullable().default(null),
    probes: z
      .array(
        z.object({
          name: text(80).min(1),
          kind: z.enum(["FOOD", "AMBIENT", "UNKNOWN"]),
        }),
      )
      .max(12)
      .default([]),
  })
  .refine(
    (value) =>
      new Set(value.probes.map((probe) => probe.name.toLowerCase())).size ===
      value.probes.length,
    "Probe names must be distinct within a lot.",
  );
export const summarySchema = z.object({
  sourceTitle: text(200),
  sourceDate: smokeDate.nullable(),
  target: temperature,
  peak: temperature,
  temperatureUnit: z.enum(["F", "C"]).nullable(),
  durationMinutes: z.number().int().min(0).max(43200).nullable(),
  probeName: text(80),
  probeKind: z.enum(["FOOD", "AMBIENT", "UNKNOWN"]),
  photoId: reference,
  origin: z.enum(["MANUAL", "LOCAL_OCR"]),
  confirmed: z.literal(true, {
    error: "Confirm the transcription before saving.",
  }),
});
export const actualSchema = z.object({
  handsOnMinutes: z.number().int().min(0).max(43200).nullable().default(null),
  raw: measureSchema.nullable(),
  trimmed: measureSchema.nullable(),
  finished: measureSchema.nullable(),
  wasteNotes: text(1000),
  qualityNotes: text(),
  summary: summarySchema.nullable(),
});
export const recipeCaptureSchema = z
  .object({
    id: referenceId,
    name: z.string(),
    version: z.number(),
    instructions: z.string().nullable(),
    yieldQty: z.number(),
    yieldUnit: z.string(),
  })
  .nullable();
export const projectCaptureSchema = z
  .object({
    id: referenceId,
    recipeId: referenceId,
    recipeName: z.string(),
    contextLabel: z.string(),
  })
  .nullable();
export const reviewSchema = z
  .object({
    actorId: referenceId,
    actorName: z.string(),
    at: z.string().datetime({ offset: true }),
    note: text().min(1),
  })
  .nullable();
export const lotSchema = z.object({
  plan: planSchema,
  actual: actualSchema,
  recipe: recipeCaptureSchema,
  project: projectCaptureSchema,
  status: z.enum(["OPEN", "SUBMITTED", "REVIEWED", "VOID"]),
  review: reviewSchema,
});
export const readingSchema = z.object({
  kind: z.enum(CHECKPOINTS),
  at: z.string().datetime({ offset: true }),
  temperature,
  temperatureUnit: z.enum(["F", "C"]),
  probeName: text(80),
  probeKind: z.enum(["FOOD", "AMBIENT", "UNKNOWN"]),
  notes: text(2000),
  voided: z.boolean().default(false),
});
export type SmokePlan = z.infer<typeof planSchema>;
export type SmokeActual = z.infer<typeof actualSchema>;
export type SmokeLotData = z.infer<typeof lotSchema>;
export type SmokeRunData = z.infer<typeof runSchema>;
export type SmokeReadingData = z.infer<typeof readingSchema>;
export type SmokeProfileData = z.infer<typeof profileSchema>;

export const emptyActual = (): SmokeActual => ({
  handsOnMinutes: null,
  raw: null,
  trimmed: null,
  finished: null,
  wasteNotes: "",
  qualityNotes: "",
  summary: null,
});
export const emptyProcedure = () => ({
  product: "Brisket",
  mode: "HOT" as const,
  procedure: "",
  smokerSettings: "",
  woodFuel: "",
  seasoning: "",
  targetTemperature: null,
  temperatureUnit: "F" as const,
});
export function newPlan(
  cookName: string,
  assignedUserId: string | null = null,
): SmokePlan {
  return {
    ...emptyProcedure(),
    label: "Brisket",
    cookName,
    assignedUserId,
    recipeId: null,
    projectId: null,
    profileId: null,
    profileRevision: null,
    targetYield: null,
    probes: [],
  };
}

export function smokeYield(
  raw: SmokeMeasure | null,
  finished: SmokeMeasure | null,
) {
  if (!raw || !finished || raw.quantity <= 0) return null;
  const family = unitFamily(raw.unit);
  // A free-text package label is not enough to establish a usable yield.
  if (!family || family === "volume" || family !== unitFamily(finished.unit))
    return null;
  const quantity = convertQty(finished.quantity, finished.unit, raw.unit);
  return quantity == null
    ? null
    : {
        percent: (quantity / raw.quantity) * 100,
        shrinkPercent: ((raw.quantity - quantity) / raw.quantity) * 100,
      };
}
export function freshLotFromSetup(source: SmokeLotData): SmokeLotData {
  return {
    plan: { ...structuredClone(source.plan), projectId: null },
    recipe: structuredClone(source.recipe),
    project: null,
    actual: emptyActual(),
    review: null,
    status: "OPEN",
  };
}
export function fmtSmokeTime(value: string | Date) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}
export function fmtMeasure(value: SmokeMeasure | null) {
  return value
    ? `${Number(value.quantity.toFixed(4))} ${value.unit}`
    : "Not recorded";
}
export function smokeTemperature(value: number | null, unit: string | null) {
  return value == null ? "Not recorded" : `${value}°${unit ?? "?"}`;
}
