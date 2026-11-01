import { z } from "zod";

const id = z.string().min(1).max(100);
const text = z.string().trim().max(1000);
export const resourceSchema = z.object({
  id,
  category: z.enum(["vessel", "equipment", "utensil"]),
  name: z.string().trim().min(1, "Name each pull item.").max(120),
  qty: z.number().int().min(1).max(9999),
});
export const setupSchema = z.object({
  version: z.literal(1),
  stations: z.array(z.object({
    id,
    name: z.string().trim().min(1, "Name each station.").max(120),
    serviceTime: z.string().trim().max(120),
    notes: text,
    items: z.array(z.object({
      id,
      menuItemId: id.nullable(),
      food: z.string().trim().min(1, "Name each food item.").max(200),
      notes: text,
      resources: z.array(resourceSchema).max(30),
    })).max(100),
    resources: z.array(resourceSchema).max(100),
  })).max(50),
  packed: z.record(z.string().max(250), z.string().max(100000)),
}).superRefine((plan, ctx) => {
  const ids = plan.stations.flatMap(s => [s.id, ...s.resources.map(r => r.id),
    ...s.items.flatMap(i => [i.id, ...i.resources.map(r => r.id)])]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Setup rows must have unique IDs." });
});

export type BanquetSetup = z.infer<typeof setupSchema>;
export type SetupStation = BanquetSetup["stations"][number];
export type SetupItem = SetupStation["items"][number];
export type SetupResource = z.infer<typeof resourceSchema>;
export type SetupMenuItem = { id: string; name: string; orderedQty: number; unit: string };
export const CATEGORY_LABELS = { vessel: "Vessels & pans", equipment: "Equipment & support", utensil: "Serving utensils" };
export const RESOURCE_OPTIONS = {
  vessel: ["Boos Block", "Square Tray (Small)", "Square Tray (Large)", "Round Chafer", "Small Bowl", "Half Hotel Pan", "Full Hotel Pan", "Chafer Water Pan"],
  equipment: ["Heatlamp", "Ice Bath Insert", "Chafer Stand", "Fuel Can", "Extension Cord", "Riser"],
  utensil: ["Tongs", "Serving Spoon", "Slotted Spoon", "Ladle", "Serving Fork", "Spatula / Server"],
};
export function emptySetup(): BanquetSetup { return { version: 1, stations: [], packed: {} }; }
export function readSetup(value: unknown): BanquetSetup {
  if (value == null) return emptySetup();
  // Do not silently erase an unreadable or future version.
  return setupSchema.parse(value);
}
export function resourceKey(category: SetupResource["category"], name: string) {
  return `${category}:${name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")}`;
}
export type SetupPull = {
  key: string; category: SetupResource["category"]; name: string; qty: number;
  allocations: string[]; signature: string;
};
export function aggregateSetup(plan: BanquetSetup): SetupPull[] {
  const entries = new Map<string, SetupPull & { parts: string[] }>();
  function add(resources: SetupResource[], station: SetupStation, item?: SetupItem) {
    for (const r of resources) {
      const key = resourceKey(r.category, r.name);
      const entry = entries.get(key) ?? {
        key, category: r.category, name: r.name.trim().replace(/\s+/g, " "),
        qty: 0, allocations: [], parts: [], signature: "",
      };
      entry.qty += r.qty;
      entry.allocations.push(`${station.name} / ${item?.food ?? "Shared setup"}: ${r.qty}`);
      // Allocation changes invalidate packing even when total quantity stays the same.
      entry.parts.push(JSON.stringify([station.id, item?.id ?? "", r.id, r.qty]));
      entries.set(key, entry);
    }
  }
  for (const station of plan.stations) {
    add(station.resources, station);
    for (const item of station.items) add(item.resources, station, item);
  }
  return [...entries.values()].map(({ parts, ...entry }) => ({ ...entry, signature: JSON.stringify(parts.sort()) }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
export function retainPacking(plan: BanquetSetup, previous: BanquetSetup): BanquetSetup {
  return { ...plan, packed: Object.fromEntries(aggregateSetup(plan)
    .filter(p => previous.packed[p.key] === p.signature).map(p => [p.key, p.signature])) };
}
export function resolveSetup(plan: BanquetSetup, menu: SetupMenuItem[]): BanquetSetup {
  const byId = new Map(menu.map(m => [m.id, m]));
  return { ...plan, stations: plan.stations.map(s => ({ ...s, items: s.items.map(i => ({
    ...i, food: (i.menuItemId && byId.get(i.menuItemId)?.name) || i.food,
  })) })) };
}
export function setupWarnings(plan: BanquetSetup, menu: SetupMenuItem[]): string[] {
  const assigned = new Set(plan.stations.flatMap(s => s.items.map(i => i.menuItemId)));
  const missing = menu.filter(m => !assigned.has(m.id));
  const warnings: string[] = [];
  if (missing.length) warnings.push(`Not assigned to a station: ${missing.map(m => m.name).join(", ")}.`);
  for (const station of plan.stations) for (const item of station.items) {
    if (item.menuItemId && !menu.some(m => m.id === item.menuItemId)) warnings.push(`${station.name} / ${item.food}: linked food line was removed; review this setup.`);
    if (!item.resources.length && !item.notes.trim()) warnings.push(`${station.name} / ${item.food}: add pull items or a note such as “On table — no vessel needed”.`);
  }
  return warnings;
}
