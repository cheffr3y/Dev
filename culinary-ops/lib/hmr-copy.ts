import type { ToGoLine } from "./to-go-rollup";

// Copy only reusable menu setup. IDs and period-specific sales/production facts
// never carry into the next rollout, and the source record stays untouched.
export function hmrCopyData(source: { venueId: string | null; items: ToGoLine[] }, name: string) {
  return {
    name, venueId: source.venueId, status: "DRAFT", orderCutoff: null, pickupNotes: null, notes: null,
    items: { create: source.items.map(item => ({
      recipeId: item.recipeId, name: item.name, section: item.section, description: item.description,
      sellingUnit: item.sellingUnit, recipeQtyPerUnit: item.recipeQtyPerUnit, recipeAmountUnit: item.recipeAmountUnit,
      price: item.price, packagingCost: item.packagingCost, packingNotes: item.packingNotes,
      customerInstructions: item.customerInstructions, sortOrder: item.sortOrder,
      forecastQty: null, productionQty: null, actualSoldQty: null, confidence: "NEW", notes: null,
    })) },
  };
}
