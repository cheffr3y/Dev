import { convertQty } from "./units";

export type PrepRequest = {
  id: string;
  prepOrderId: string;
  recipeId: string;
  recipeName: string;
  yieldUnit: string;
  yieldQty: number;
  productionPersonMinutes: number | null;
  venueId: string;
  venueName: string;
  quantity: number;
  unit: string;
  lot: string | null;
  status: string;
  instructions?: string | null;
};
export function groupPrepRequests(requests: PrepRequest[]) {
  const groups = new Map<string, PrepRequest[]>();
  for (const request of requests) {
    const rows = groups.get(request.recipeId) ?? [];
    rows.push(request);
    groups.set(request.recipeId, rows);
  }
  return [...groups]
    .map(([recipeId, rows]) => {
      const unit = rows.every((r) => r.unit === rows[0].unit)
        ? rows[0].unit
        : rows[0].yieldUnit;
      const converted = rows.map((r) => convertQty(r.quantity, r.unit, unit));
      return {
        recipeId,
        name: rows[0].recipeName,
        unit,
        rows,
        requested: converted.every((q) => q != null)
          ? converted.reduce<number>((sum, q) => sum + q!, 0)
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export type PrepGroup = ReturnType<typeof groupPrepRequests>[number];
