import assert from "node:assert/strict";
import test from "node:test";
import { allergenText, buildCustomMenuPlan, describeQuantity, formatMenuDate, lineQuantity, rawItemUnits, type CustomMenuLine, type CustomMenuRecipe } from "./custom-menu";

const now = new Date("2026-11-25T12:00:00Z");
const close = (actual: number | null, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

function fixture() {
  const item = (id: string, unitCost: number, unit = "lb") => ({ id, name: id, category: "Meat", unitCost, unit, priceUpdatedAt: now });
  const recipe = (id: string, overrides: Partial<CustomMenuRecipe>): CustomMenuRecipe => ({ id, name: id, yieldQty: 1, yieldUnit: "oz", items: [], components: [], ...overrides });
  // Rub: 1 lb yield, $2/lb pepper → $2 per lb of rub.
  const rub = recipe("Rub", { yieldQty: 1, yieldUnit: "lb", items: [{ quantity: 1, unit: "lb", item: item("Pepper", 2) }] });
  // Brisket: 16 lb raw at $5/lb + 4 oz rub, yields 160 oz cooked → $80.50 per batch.
  const brisket = recipe("Brisket", { yieldQty: 160, yieldUnit: "oz", items: [{ quantity: 16, unit: "lb", item: item("Beef", 5) }], components: [{ childId: rub.id, quantity: 4, unit: "oz" }] });
  // BBQ sauce: 1 gal yield, $8 per batch.
  const sauce = recipe("BBQ Sauce", { yieldQty: 1, yieldUnit: "gallon", items: [{ quantity: 1, unit: "each", item: item("Base", 8, "each") }] });
  return { recipes: [rub, brisket, sauce], rub, brisket, sauce };
}
const line = (id: string, recipeId: string | null, overrides: Partial<CustomMenuLine> = {}): CustomMenuLine => ({
  id, recipeId, section: "Mains", menuTitle: null, menuDescription: null, portionQty: null, portionUnit: null, totalQty: null, totalUnit: null, sortOrder: 0, ...overrides,
});

test("per-guest portions scale through nested sub-recipes and roll up to cost per guest", () => {
  const f = fixture();
  const plan = buildCustomMenuPlan({ guestCount: 100, pricePerGuest: 25, targetFcp: 30 }, [
    line("brisket", f.brisket.id, { portionQty: 8, portionUnit: "oz", sortOrder: 1, menuTitle: "Smoked Brisket" }),
    line("sauce", f.sauce.id, { section: "Sauces & Condiments", totalQty: 2, totalUnit: "gallon", sortOrder: 2, portionQty: 1, portionUnit: "fl oz" }),
  ], f.recipes, now);

  const [brisket, sauce] = plan.rows;
  assert.equal(brisket.title, "Smoked Brisket");
  assert.equal(brisket.mode, "per-guest");
  close(brisket.qty, 800); // 100 guests × 8 oz
  close(brisket.batches, 5); // 800 oz ÷ 160 oz yield
  close(brisket.cost, 5 * 80.5);
  close(brisket.costPerGuest, 4.025);
  assert.equal(sauce.mode, "fixed", "a fixed total replaces the per-guest amount");
  close(sauce.cost, 16);
  close(plan.totalCost, 402.5 + 16);
  close(plan.costPerGuest, 4.185);
  close(plan.revenue, 2500);
  close(plan.fcp, (418.5 / 2500) * 100);
  assert.equal(plan.overTarget, false);
  assert.deepEqual(plan.sections.map((s) => s.name), ["Mains", "Sauces & Condiments"]);
  assert.deepEqual(plan.costedRecipeIds.sort(), ["BBQ Sauce", "Brisket"]);
  assert.equal(plan.issueCount, 0);
  const beef = plan.shoppingList.categories.flatMap((c) => c.items).find((i) => i.itemId === "Beef");
  assert.ok(beef, "nested ingredients reach the pull list");
});

test("lines that can't be costed are flagged and excluded instead of guessed", () => {
  const f = fixture();
  const plan = buildCustomMenuPlan({ guestCount: 50, pricePerGuest: null, targetFcp: 30 }, [
    line("mismatch", f.sauce.id, { portionQty: 6, portionUnit: "oz" }), // weight vs gallon yield
    line("empty", f.brisket.id, { sortOrder: 1 }),
    line("gone", "deleted-recipe", { sortOrder: 2, portionQty: 1, portionUnit: "each" }),
  ], f.recipes, now);
  assert.deepEqual(plan.rows.map((r) => r.issue), ["unit-mismatch", "no-quantity", "missing-recipe"]);
  assert.ok(plan.rows.every((r) => r.cost === null));
  assert.equal(plan.totalCost, 0);
  assert.equal(plan.issueCount, 3);
  assert.equal(plan.revenue, null);
  assert.equal(plan.fcp, null);
  assert.equal(plan.shoppingList.itemCount, 0);
});

test("per-guest dishes need a guest count; fixed totals do not", () => {
  const f = fixture();
  const plan = buildCustomMenuPlan({ guestCount: 0, pricePerGuest: 20, targetFcp: 30 }, [
    line("brisket", f.brisket.id, { portionQty: 6, portionUnit: "oz" }),
    line("sauce", f.sauce.id, { totalQty: 64, totalUnit: "fl oz", sortOrder: 1 }),
  ], f.recipes, now);
  assert.equal(plan.rows[0].issue, "no-guests");
  close(plan.rows[1].cost, 4); // half a gallon
  assert.equal(plan.costPerGuest, null);
  assert.equal(plan.revenue, null);
});

test("price targets, quantity text and date-only formatting", () => {
  const f = fixture();
  const plan = buildCustomMenuPlan({ guestCount: 10, pricePerGuest: 5, targetFcp: 30 }, [
    line("brisket", f.brisket.id, { portionQty: 8, portionUnit: "oz" }),
  ], f.recipes, now);
  assert.equal(plan.overTarget, true);
  assert.equal(describeQuantity(plan.rows[0], 10, String), "8 oz per guest × 10 = 80 oz");
  assert.deepEqual(lineQuantity({ portionQty: 2, portionUnit: null, totalQty: 0, totalUnit: null }, 3, "lb"), { mode: "per-guest", qty: 6, unit: "lb" });
  assert.equal(formatMenuDate(new Date("2026-12-05T00:00:00Z")), "Saturday, December 5, 2026");
  assert.equal(formatMenuDate(null), null);
});

test("raw ingredients cost by the piece from a case price and reach allergens and the pull list", () => {
  const f = fixture();
  // Potato buns: $42 per case of 96 each; reviewed so the pack converts.
  const buns = { id: "buns", name: "Potato Bun", category: "Bakery", unit: "case", unitCost: 42, priceUpdatedAt: now, allergens: "wheat, milk, eggs", packQty: 96, packUnit: "each", measurementReviewedAt: now };
  const plan = buildCustomMenuPlan({ guestCount: 65, pricePerGuest: null, targetFcp: 20 }, [
    line("brisket", f.brisket.id, { portionQty: 6, portionUnit: "oz" }),
    { ...line("buns", null, { section: "Bread", portionQty: 1, portionUnit: "each", sortOrder: 1 }), itemId: "buns", item: buns },
  ], f.recipes, now);
  const bun = plan.rows[1];
  assert.equal(bun.kind, "item");
  assert.equal(bun.issue, null);
  close(bun.qty, 65);
  close(bun.cost, (65 / 96) * 42);
  assert.deepEqual(bun.itemAllergens, ["milk", "eggs", "wheat"]);
  close(plan.totalCost, plan.rows[0].cost! + (65 / 96) * 42);
  assert.deepEqual(plan.costedRecipeIds, ["Brisket"], "raw lines never enter the scaled recipe guide");
  const pulled = plan.shoppingList.categories.flatMap((c) => c.items).find((i) => i.itemId === "buns");
  assert.ok(pulled, "buns reach the pull list");
  assert.ok(rawItemUnits(buns, ["each", "dozen", "oz"]).includes("each"));
});

test("raw ingredients without a usable conversion are flagged, not guessed", () => {
  const f = fixture();
  // Unreviewed case item: no pack bridge, so "each" can't be priced.
  const chips = { id: "chips", name: "Kettle Chips", category: "Dry", unit: "case", unitCost: 30, priceUpdatedAt: now, allergens: null };
  const plan = buildCustomMenuPlan({ guestCount: 10, pricePerGuest: null, targetFcp: 30 }, [
    { ...line("chips", null, { portionQty: 1, portionUnit: "each" }), itemId: "chips", item: chips },
    { ...line("gone", null, { portionQty: 1, portionUnit: "each", sortOrder: 1 }), itemId: "deleted", item: null },
  ], f.recipes, now);
  assert.deepEqual(plan.rows.map((r) => r.issue), ["no-price-unit", "missing-item"]);
  assert.equal(plan.totalCost, 0);
  assert.deepEqual(rawItemUnits(chips, ["each", "oz"]), ["case"]);
});

test("every menu dish prints an allergen line; missing tags never read as allergen-free", () => {
  assert.equal(allergenText(["milk", "eggs"]), "Contains: Milk, Eggs");
  assert.equal(allergenText([]), "Allergens not recorded — ask the kitchen");
  assert.equal(allergenText(null), "Allergens not recorded — ask the kitchen");
});
