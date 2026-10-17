import { z } from "zod";
import { serializeAllergens } from "./allergens";

export const INGREDIENT_CATEGORIES = ["Produce", "Protein", "Poultry", "Seafood", "Dairy", "Frozen", "Bakery", "Dry Goods", "Grains & Pasta", "Canned & Jarred", "Oils & Vinegars", "Spices & Seasonings", "Condiments & Sauces", "Baking", "Beverage", "Paper & Disposables", "Cleaning & Chemicals", "Other"];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"), category: z.string().trim().min(1),
  unit: z.string().trim().min(1), unitCost: z.coerce.number().finite().min(0),
  packSize: z.string().trim().nullable(), packQty: z.coerce.number().finite().positive().nullable(),
  packUnit: z.string().trim().nullable(), yieldFactor: z.coerce.number().finite().positive(),
  sku: z.string().trim().nullable(), gcode: z.string().trim().nullable(), vendorId: z.string().trim().nullable(),
});
export function parseIngredientForm(form: FormData) {
  const nullable = (key: string) => form.get(key) || null;
  return { ...schema.parse({ name: form.get("name"), category: form.get("category") || "Other", unit: form.get("unit") || "each",
    unitCost: form.get("unitCost") || 0, packSize: nullable("packSize"), packQty: nullable("packQty"), packUnit: nullable("packUnit"),
    yieldFactor: form.get("yieldFactor") || 1, sku: nullable("sku"), gcode: nullable("gcode"), vendorId: nullable("vendorId") }),
    allergens: serializeAllergens(form.getAll("allergen").map(String)) || null };
}
