import { z } from "zod";
import { readSetup } from "./banquet-setup";
import { parseAllergens } from "../recipes/allergens";

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

export type BaselineChange = { field: string; before: string; after: string };
export type BaselineChangeStyle = { tone: "added" | "modified" | "alert"; label: string };

// Keep comparison presentation separate from the saved version-1 snapshot format.
export function baselineChangeStyle(change: BaselineChange, original: BaselineSnapshot, current: BaselineSnapshot): BaselineChangeStyle {
  const { field, before, after } = change;
  const entity = field.match(/^(Station [^/]+(?: \/ Food [^/]+)?|Food [^/]+) \/ /)?.[1];
  const exists = (snapshot: BaselineSnapshot) => entity && Object.keys(snapshot.fields).some(key => key.startsWith(`${entity} / `));
  if (entity && !exists(current)) return { tone: "alert", label: "− Removed item" };
  if (field.endsWith(" / Allergens")) {
    // Retain unknown legacy tokens for comparison rather than silently dropping them.
    const tokens = (value: string) => new Set(value.split(",").map(token =>
      parseAllergens(token)[0] ?? token.trim().toLowerCase()).filter(Boolean));
    const previous = tokens(before);
    if ([...tokens(after)].some(token => !previous.has(token))) return { tone: "alert", label: "! New allergen" };
    return { tone: "modified", label: "~ Allergens changed" };
  }
  // An added/removed entity includes its instructions and quantities, even when
  // those fields are blank in one snapshot. Ordinary cleared notes are edits.
  if (entity && !exists(original)) return { tone: "added", label: "+ Added item" };
  if (field === "Guests") {
    const delta = current.guestCount - original.guestCount;
    return { tone: delta > 0 ? "added" : "modified", label: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} Guests` };
  }
  // Resources are single fields, rather than entities with sub-fields.
  if (/ \/ (vessel|equipment|utensil) [^/]+$/.test(field)) {
    if (!after) return { tone: "alert", label: "− Removed item" };
    if (!before) return { tone: "added", label: "+ Added item" };
  }
  return { tone: "modified", label: "~ Modified" };
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
