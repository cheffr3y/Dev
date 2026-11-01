// Single source of truth for recipe categories — menu courses first,
// then kitchen prep/component categories, then catch-alls.
export const RECIPE_CATEGORIES = [
  "Starter",
  "Entrée",
  "Side",
  "Salad",
  "Soup",
  "Dessert",
  "Sauce",
  "Dressing/Vinaigrette",
  "Marinade/Brine",
  "Stock/Broth",
  "Seasoning/Rub",
  "Protein Fab",
  "Garnish",
  "Pickle/Ferment",
  "Dough/Batter",
  "Bread/Baked",
  "Prep/Build",
  "Beverage",
  "Other",
];

// Category labels remain useful before accounting supplies account numbers.
export function accountingCategory(category: string) {
  if (["Protein", "Poultry", "Seafood"].includes(category)) return "Meat / Seafood";
  if (category === "Produce") return "Produce";
  if (category === "Dairy") return "Dairy";
  if (category === "Paper & Disposables") return "Paper / Disposables";
  if (category === "Cleaning & Chemicals") return "Cleaning / Chemicals";
  if (category === "Beverage") return "Beverage";
  if (category === "Other" || !category) return "Other";
  return "Dry Goods / Other Food";
}
export const ACCOUNTING_CATEGORIES = ["Meat / Seafood", "Produce", "Dairy", "Dry Goods / Other Food", "Paper / Disposables", "Cleaning / Chemicals", "Beverage", "Other"];
