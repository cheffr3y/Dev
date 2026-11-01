import { z } from "zod";
import { readSetup } from "./banquet-setup";

export const baselineSchema = z.object({ version: z.literal(1), guestCount: z.number(), fields: z.record(z.string(), z.string()) });
export type BaselineSnapshot = z.infer<typeof baselineSchema>;
export type BaselineEvent = {
  name: string; date: Date; guestCount: number; status: string; venue: { name: string };
  timeLabel: string | null; location: string | null; areas: string | null;
  setupNotes: string | null; specialInstructions: string | null; notes: string | null; setupPlan: unknown;
  menuItems: Array<{ id: string; orderedQty: number; unit: string; description: string | null;
    recipe: { name: string; allergens?: string | null; criticalNotes?: string | null } }>;
};
export function captureBaseline(event: BaselineEvent): BaselineSnapshot {
  const fields: Record<string, string> = {};
  const set = (key: string, value: unknown) => { fields[key] = value == null ? "" : String(value); };
  for (const [label, value] of Object.entries({ Name: event.name, Date: event.date.toISOString().slice(0, 10),
    Guests: event.guestCount, Status: event.status, Venue: event.venue.name, "Service time": event.timeLabel,
    Location: event.location, Rooms: event.areas, "Setup notes": event.setupNotes,
    "Special instructions": event.specialInstructions, Notes: event.notes })) set(label, value);
  for (const line of event.menuItems) {
    const prefix = `Food ${line.id}`;
    set(`${prefix} / Recipe`, line.recipe.name);
    set(`${prefix} / Quantity`, `${line.orderedQty} ${line.unit}`);
    set(`${prefix} / Instructions`, line.description);
    set(`${prefix} / Allergens`, line.recipe.allergens);
    set(`${prefix} / Critical notes`, line.recipe.criticalNotes);
  }
  const plan = readSetup(event.setupPlan);
  for (const [index, station] of plan.stations.entries()) {
    const prefix = `Station ${station.id}`;
    set(`${prefix} / Order`, index + 1);
    set(`${prefix} / Name`, station.name);
    set(`${prefix} / Service time`, station.serviceTime);
    set(`${prefix} / Notes`, station.notes);
    for (const [itemIndex, item] of station.items.entries()) {
      const itemPrefix = `${prefix} / Food ${item.id}`;
      set(`${itemPrefix} / Order`, itemIndex + 1);
      set(`${itemPrefix} / Food`, item.food);
      set(`${itemPrefix} / Linked line`, item.menuItemId);
      set(`${itemPrefix} / Notes`, item.notes);
      for (const r of item.resources) set(`${itemPrefix} / ${r.category} ${r.id}`, `${r.qty} × ${r.name}`);
    }
    for (const r of station.resources) set(`${prefix} / ${r.category} ${r.id}`, `${r.qty} × ${r.name}`);
  }
  // Packing checks and setupRevision are deliberately excluded.
  return { version: 1, guestCount: event.guestCount, fields };
}
export function baselineChanges(original: unknown, current: BaselineSnapshot) {
  const baseline = baselineSchema.parse(original);
  return [...new Set([...Object.keys(baseline.fields), ...Object.keys(current.fields)])].sort()
    .filter(key => (baseline.fields[key] ?? "") !== (current.fields[key] ?? ""))
    .map(field => ({ field, before: baseline.fields[field] ?? "", after: current.fields[field] ?? "" }));
}

export function baselineFieldLabel(field: string, original: BaselineSnapshot, current: BaselineSnapshot) {
  const path: string[] = [];
  return field.split(" / ").map(part => {
    path.push(part);
    const key = path.join(" / ");
    const value = (suffix: string) => current.fields[`${key} / ${suffix}`] || original.fields[`${key} / ${suffix}`];
    if (part.startsWith("Food ")) return value("Recipe") || value("Food") || "Food line";
    if (part.startsWith("Station ")) return value("Name") || "Station";
    for (const [category, label] of [["vessel", "Vessel"], ["equipment", "Equipment"], ["utensil", "Utensil"]]) {
      if (part.startsWith(`${category} `)) return label;
    }
    return part;
  }).join(" / ");
}

export const baselineInclude = {
  venue: true, baseline: true,
  menuItems: { include: { recipe: { select: { name: true, allergens: true, criticalNotes: true } } }, orderBy: { id: "asc" as const } },
};
