import { z } from "zod";
import { businessDate, chicagoToday } from "./prep-dates";

export const operatingDate = z.string().refine(value => {
  try { const date = businessDate(value); return date.getUTCFullYear() >= 1900 && date.getUTCFullYear() <= 2100; } catch { return false; }
}, "Use a valid date between 1900 and 2100.");
export function dollarsToCents(value: string, signed = false): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!(signed ? /^-?\d{1,8}(\.\d{1,2})?$/ : /^\d{1,8}(\.\d{1,2})?$/).test(text)) throw new Error("Enter a dollar amount with at most two decimal places.");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (text.startsWith("-") ? -1 : 1);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 2_000_000_000) throw new Error("Keep each amount below $20,000,000.01.");
  return cents;
}
export const operatingEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("day"), venueId: z.string().min(1).max(150), date: operatingDate,
    revision: z.number().int().min(0).nullable(), grossSales: z.string().max(30), labor: z.string().max(30),
    foodReviewed: z.boolean(), notes: z.string().trim().max(5000), reason: z.string().trim().max(1000).default("") }),
  z.object({ kind: z.literal("expense"), id: z.string().min(1).max(150), venueId: z.string().min(1).max(150), invoiceDate: operatingDate,
    revision: z.number().int().min(0).nullable(), amount: z.string().max(30), description: z.string().trim().min(1).max(500),
    invoiceDocumentId: z.string().min(1).max(150).nullable(), invoiceLineRevision: z.number().int().min(0).nullable().default(null), voided: z.boolean().default(false), reason: z.string().trim().max(1000).default("") }),
]);
export type OperatingEdit = z.input<typeof operatingEditSchema>;
export type OperatingDayData = { id: string; venueId: string; businessDate: string; grossSalesCents: number | null; laborCents: number | null; foodReviewed: boolean; notes: string; revision: number; history: unknown };
export type FoodExpenseData = { id: string; venueId: string; invoiceDate: string; amountCents: number; description: string; invoiceDocumentId: string | null; voided: boolean; revision: number; history: unknown; invoiceLineRevision?: number | null; invoiceReviewPending?: boolean; invoice?: { filename: string; vendor: string | null; invoiceNumber: string | null } | null };
export function operatingMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a valid month.");
  const start = businessDate(`${month}-01`);
  if (start.getUTCFullYear() < 1900 || start.getUTCFullYear() > 2100) throw new Error("Choose a month between 1900 and 2100.");
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const previous = new Date(start); previous.setUTCMonth(previous.getUTCMonth() - 1);
  return { start, end, previous: previous.toISOString().slice(0, 7), next: end.toISOString().slice(0, 7),
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    dayCount: Math.round((end.getTime() - start.getTime()) / 86400000), offset: start.getUTCDay() };
}
export const costRate = (cost: number | null, sales: number | null) => cost == null || sales == null || sales <= 0 ? null : cost / sales * 100;
export function buildOperatingMonth(month: string, entries: OperatingDayData[], expenses: FoodExpenseData[], today = chicagoToday()) {
  const range = operatingMonth(month), byDate = new Map(entries.map(entry => [entry.businessDate, entry]));
  const days = Array.from({ length: range.dayCount }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`, entry = byDate.get(date) ?? null;
    const food = expenses.filter(expense => expense.invoiceDate === date && !expense.voided);
    const foodCents = food.length ? food.reduce((sum, expense) => sum + expense.amountCents, 0) : entry?.foodReviewed ? 0 : null;
    const grossSalesCents = entry?.grossSalesCents ?? null, laborCents = entry?.laborCents ?? null;
    return { date, day: index + 1, entry, food, foodCents, grossSalesCents, laborCents,
      laborRate: costRate(laborCents, grossSalesCents), foodRate: costRate(foodCents, grossSalesCents),
      complete: grossSalesCents != null && laborCents != null && !!entry?.foodReviewed && !food.some(expense => expense.invoiceReviewPending),
      future: date > today, hasData: !!entry || food.length > 0 };
  });
  const sum = (key: "grossSalesCents" | "laborCents" | "foodCents") => days.some(day => day[key] != null)
    ? days.reduce((total, day) => total + (day[key] ?? 0), 0) : null;
  const grossSalesCents = sum("grossSalesCents"), laborCents = sum("laborCents"), foodCents = sum("foodCents");
  const elapsed = days.filter(day => !day.future), completeCount = elapsed.filter(day => day.complete).length;
  return { month, ...range, days, totals: { grossSalesCents, laborCents, foodCents,
    laborRate: costRate(laborCents, grossSalesCents), foodRate: costRate(foodCents, grossSalesCents),
    completeCount, elapsedCount: elapsed.length, provisional: completeCount < elapsed.length || !elapsed.length } };
}
export function operatingCsv(model: ReturnType<typeof buildOperatingMonth>, venueName: string) {
  const amount = (cents: number | null) => cents == null ? "" : (cents / 100).toFixed(2);
  const rate = (value: number | null) => value == null ? "" : value.toFixed(2);
  const rows = [["Venue", "Business date", "Gross sales USD", "Labor USD", "Food purchases USD", "Labor / gross sales %", "Purchases / gross sales %", "Food reviewed", "Status", "Notes"],
    ...model.days.map(day => [venueName, day.date, amount(day.grossSalesCents), amount(day.laborCents), amount(day.foodCents), rate(day.laborRate), rate(day.foodRate), day.entry?.foodReviewed ? "Yes" : "No", day.complete ? "Complete" : day.future ? "Future" : "Incomplete", day.entry?.notes ?? ""])];
  return rows.map(row => row.map((cell, index) => {
    const safe = (index === 0 || index === 9) && /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
