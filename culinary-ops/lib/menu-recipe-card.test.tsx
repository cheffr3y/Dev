import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MenuRecipeCard } from "../components/MenuRecipeCard";

const recipe = {
  id: "stock", name: "House stock", prodCode: "STK", version: 1,
  yieldQty: 32, yieldUnit: "qt", instructions: "Simmer — Cook gently for 1 hour.", criticalNotes: null,
  items: [{ id: "bones", quantity: 16, unit: "lb", note: null, item: { name: "Bones", category: "Protein" } }],
  components: [{ id: "base", quantity: 4, unit: "qt", note: null, child: { name: "Aromatic base", prodCode: "ARB" } }],
};
const text = (html: string) => html.replace(/<[^>]*>/g, "");
function card(scale: number, overrides = {}) {
  return renderToStaticMarkup(<MenuRecipeCard recipe={{ ...recipe, ...overrides }} scale={scale} id="test-card"
    allergenKeys={[]} printedAt={new Date("2026-10-17T12:00:00Z")} context="Opening prep for the launch" />);
}

test("recipe cards keep batch badge, target yield, ingredients and sub-recipe pulls on the same scale", () => {
  const html = card(0.5);
  const content = text(html);
  assert.match(content, /0.5× Batch4 gal/);
  assert.match(content, /Opening prep: 0.5× · Target yield: 16 qt.*Standard batch: 32 qt/);
  assert.match(content, /Bones8 lb/);
  assert.match(content, /Aromatic baseSub-recipe · ARB2 qt/);
  assert.match(content, /Cook gently for 1 hour/);
  assert.doesNotMatch(content, /1× Batch/);
  assert.equal(recipe.yieldQty, 32);
  assert.equal(recipe.items[0].quantity, 16);
});

test("fractional sub-batches preserve enough precision to identify the actual prep target", () => {
  const content = text(card(0.625, { yieldQty: 1 }));
  assert.match(content, /0.625× Batch20 fl oz/);
  assert.match(content, /Target yield: 0.625 qt.*Standard batch: 1 qt/);
  const tiny = text(card(0.00025));
  assert.match(tiny, /0.00025× Batch/);
  assert.match(tiny, /Target yield: 0.008 qt/);
});

test("a zero par prints zero production instead of silently falling back to 1×", () => {
  const content = text(card(0));
  assert.match(content, /0× Batch/);
  assert.match(content, /Target yield: 0 qt/);
  assert.match(content, /No opening prep planned/);
  assert.doesNotMatch(content, /1× Batch/);
});
