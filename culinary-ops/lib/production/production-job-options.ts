import { z } from "zod";
import { businessDate } from "../prep/prep-dates";
import { printScale } from "../printing/print-options";

export const jobSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PREP"), lineId: z.string().min(1).max(150), scale: z.number().finite().positive().max(100).default(1) }),
  z.object({ kind: z.literal("BANQUET"), lineId: z.string().min(1).max(150) }),
]);
export type JobSource = z.infer<typeof jobSourceSchema>;
export const finishJobSchema = z.object({
  jobId: z.string().min(1),
  actualQty: z.number().finite().min(0).max(1e8),
  actualUnit: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(5000).default(""),
  labeledAndDated: z.literal(true, { error: "Confirm labeling and dating before finishing." }),
}).refine(data => data.actualQty > 0 || data.notes.length > 0, "Explain zero output in the notes.");

export const reviewedYieldSchema = z.object({ quantity: z.number().finite().min(0).max(1e8), unit: z.string().trim().min(1).max(40) });

export function jobScanHref(source: JobSource) {
  const params = new URLSearchParams();
  params.set(source.kind === "PREP" ? "prep" : "banquet", source.lineId);
  if (source.kind === "PREP" && source.scale !== 1) params.set("scale", String(source.scale));
  return `/prep-orders/closeout/scan?${params}`;
}
export function sourceFromQuery(query: { prep?: string; banquet?: string; scale?: string }): JobSource | null {
  if (query.prep && query.banquet) throw new Error("Choose one production project.");
  if (query.prep) return jobSourceSchema.parse({ kind: "PREP", lineId: query.prep, scale: printScale(query.scale) });
  if (query.banquet) return jobSourceSchema.parse({ kind: "BANQUET", lineId: query.banquet });
  return null;
}
export function jobDate(raw: string) { return businessDate(raw); }
export function elapsedMinutes(startedAt: Date | string, finishedAt: Date | string = new Date()) {
  return Math.max(0, (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000);
}
export function durationLabel(minutes: number) {
  if (minutes < 1) return "Less than 1 minute";
  const rounded = Math.floor(minutes);
  const hours = Math.floor(rounded / 60), remainder = rounded % 60;
  return hours ? `${hours}h ${remainder}m` : `${rounded} min`;
}
export { safeReturnTo } from "../auth/login-return";
export function publicOrigin(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("APP_BASE_URL must be the application origin.");
  return url.origin;
}
