import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MenuRecipeCard } from "../components/MenuRecipeCard";
import { MenuOrderGuide } from "../components/MenuOrderGuide";
import { buildMenuRollout, platedServingSpec, type RolloutRecipe } from "./menu-rollout";

const recipe = {
  id: "stock", name: "House stock", prodCode: "STK", version: 1,
  yieldQty: 32, yieldUnit: "qt", instructions: "Simmer — Cook gently for 1 hour.", criticalNotes: null,
  items: [{ id: "bones", quantity: 16, unit: "lb", note: null, item: { name: "Bones", category: "Protein" } }],
  components: [{ id: "base", quantity: 4, unit: "qt", note: null, child: { name: "Aromatic base", prodCode: "ARB" } }],
};
const text = (html: string) => html.replace(/<[^>]*>/g, "");
function card(kind: "plated" | "foundation", par: number, overrides = {}) {
  return text(renderToStaticMarkup(<MenuRecipeCard recipe={{ ...recipe, ...overrides }} kind={kind} openingParBatches={par} id="test-card"
    allergenKeys={[]} printedAt={new Date("2026-10-17T12:00:00Z")} context="Annex launch" />));
}

test("foundations always show a full batch regardless of theoretical demand", () => {
  for (const par of [0, 0.00488281, 0.769231, 25]) {
    const content = card("foundation", par);
    assert.match(content, /1× Standard Batch8 gal/);
    assert.match(content, /Standard batch: 32 qt/);
    assert.match(content, /Bones16 lb/);
    assert.match(content, /Aromatic baseSub-recipe · ARB1 gal/);
    assert.doesNotMatch(content, /Opening prep|0\.00488281|0\.769231/);
  }
});

test("plated cards divide ingredients and components into one serving and keep par as metadata", () => {
  const content = card("plated", 2.5, { yieldQty: 10, yieldUnit: "servings" });
  assert.match(content, /1× Single-Serving1 serving/);
  assert.match(content, /Pickup spec: 1 serving · Opening Par Target: 25 servings/);
  assert.match(content, /Bones1.6 lb/);
  assert.match(content, /Aromatic baseSub-recipe · ARB12.8 fl oz/);
  assert.equal(recipe.items[0].quantity, 16);
  assert.equal(recipe.components[0].quantity, 4);
  assert.match(card("plated", 0, { yieldQty: 1, yieldUnit: "serving" }), /Bones16 lb/);
});

test("unsupported serving yields remain explicit and never imply a serving conversion", () => {
  assert.equal(platedServingSpec(recipe), null);
  assert.equal(platedServingSpec({ yieldQty: 0, yieldUnit: "each" }), null);
  assert.equal(platedServingSpec({ yieldQty: 2, yieldUnit: "dozen" })?.servings, 24);
  assert.match(card("plated", 25), /Serving yield needs review/);
});

test("vendor order guide renders blank ordering lines and no theoretical pulls or totals", () => {
  const stock: RolloutRecipe = { ...recipe, station: null, menuPrice: null, allergens: null,
    components: [], items: [{ quantity: 0.000001, unit: "oz", item: { id: "spice", name: "Nutmeg", category: "Spices", unitCost: 1.25, priceUpdatedAt: null, unit: "oz", sku: "N01", gcode: "G01", packSize: "1 lb", vendor: { id: "v", name: "Vendor" } } }] };
  const plan = buildMenuRollout({ items: [{ id: "r", recipeId: stock.id, section: "Small Plates", menuTitle: null, menuDescription: null, menuPrice: null, parBatches: 25, sortOrder: 0 }] }, [stock]);
  const html = renderToStaticMarkup(<MenuOrderGuide plan={plan} />);
  assert.match(text(html), /Item NameCategorySKU \/ GCodePack SizeUnit CostOrder Qty/);
  assert.match(text(html), /NutmegSpicesN01G011 lb\$1.25 \/ oz/);
  assert.match(html, /aria-label="Order quantity for Nutmeg"/);
  assert.doesNotMatch(text(html), /Required|Extended|Storage Category Pull|0\.00|estimate/i);
});
