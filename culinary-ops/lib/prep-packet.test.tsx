import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { displayMeasure } from "./units";
import { RecipeBuildBody, type RecipeTreeNode } from "../components/RecipeBuild";
import { RecipeReferences } from "../components/RecipeReferences";
import { buildRecipeReferences } from "./recipe-references";

test("grams converts scaled weights while preserving volume, count and unknown units", () => {
  assert.ok(Math.abs(displayMeasure(2, "lbs", true).qty - 907.184) < 0.01);
  assert.deepEqual(displayMeasure(2, "kg", true), { qty: 2000, label: "g" });
  assert.deepEqual(displayMeasure(0.25, "g", true), { qty: 0.25, label: "g" });
  for (const unit of ["cup", "fl oz", "each", "bunch"]) {
    assert.deepEqual(displayMeasure(2, unit, true), displayMeasure(2, unit));
  }
  assert.deepEqual(displayMeasure(32, "oz"), { qty: 2, label: "lb" });
});

test("grams reaches nested builds and shared pull amounts without changing default packets", () => {
  const child: RecipeTreeNode = {
    id: "child", name: "Dough", prodCode: "D", version: 1, yieldQty: 1, yieldUnit: "kg",
    instructions: null, allergens: null, criticalNotes: null,
    items: [{ id: "flour", name: "Flour", quantity: 500, unit: "g", note: null }], components: [],
  };
  const parent: RecipeTreeNode = { ...child, id: "parent", name: "Bread", items: [],
    components: [{ id: "dough", childId: "child", quantity: 2, unit: "kg" }] };
  const props = { node: parent, byId: new Map([[parent.id, parent], [child.id, child]]),
    totalBatches: 2, compact: false, depth: 0, stack: new Set<string>() };
  const grams = renderToStaticMarkup(<RecipeBuildBody {...props} weightInGrams />);
  assert.match(grams, /4000/);
  assert.match(grams, /2000/);
  assert.doesNotMatch(grams, />lb</);
  assert.match(renderToStaticMarkup(<RecipeBuildBody {...props} />), />lb</);
  const shared = renderToStaticMarkup(<RecipeBuildBody {...props} weightInGrams sharedRefs={new Map([[child.id, "lot TEST"]])} />);
  assert.match(shared, /pull 4000 g/);
  assert.match(shared, /lot TEST/);
  assert.doesNotMatch(shared, /Flour/);
});

test("cooling log groups destination splits by lot and preserves separate batches", async () => {
  const { PrepCoolingLog } = await import("../components/PrepCoolingLog");
  const line = { id: "a", lot: "LOT-A", recipe: { name: "Soup" }, requestedQty: 2,
    requestedUnit: "quart", destinationVenue: { name: "Main" } };
  const html = renderToStaticMarkup(<PrepCoolingLog madeOn="Sep 17, 2026" lines={[
    line,
    { ...line, id: "b", destinationVenue: { name: "Annex" } },
    { ...line, id: "c", lot: "LOT-B" },
    { ...line, id: "d", lot: null, recipe: { name: "Unprinted" } },
  ]} />);
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  assert.match(html, /2 qt → Main · 2 qt → Annex/);
  assert.doesNotMatch(html, /Unprinted/);
  assert.match(html, /135°F to 70°F or below within 2 hours/);
  assert.match(html, /41°F or below within 6 hours total from 135°F/);
  assert.match(html, /Due: start \+ 6 hours/);
  assert.match(html, /Chef cooling review signature/);
  assert.equal(renderToStaticMarkup(<PrepCoolingLog madeOn="Sep 17, 2026" lines={[]} />), "");
});

function referenceFixture() {
  const node = (id: string, name: string, overrides: Partial<RecipeTreeNode> = {}): RecipeTreeNode => ({
    id, name, prodCode: id.toUpperCase(), version: 3, yieldQty: 1, yieldUnit: "qt",
    instructions: null, allergens: null, criticalNotes: null, items: [], components: [], ...overrides,
  });
  const garlic = node("garlic", "Roasted garlic", {
    yieldQty: 16, yieldUnit: "oz", instructions: "Puree the roasted cloves.",
    items: [{ id: "cloves", name: "Roasted cloves", quantity: 16, unit: "oz", note: null }],
    criticalNotes: "Garlic reference safety instruction.",
  });
  const mayo = node("mayo", "House mayonnaise", {
    yieldQty: 2, allergens: "eggs", instructions: "Emulsify the mayonnaise.",
    components: [{ id: "mayo-garlic", childId: garlic.id, quantity: 4, unit: "oz" }],
  });
  const ranch = node("ranch", "Ranch dressing", {
    allergens: "milk", instructions: "Whisk the ranch dressing.",
    components: [{ id: "ranch-mayo", childId: mayo.id, quantity: 1, unit: "qt" }],
  });
  const wraps = node("wraps", "Chicken wraps", {
    yieldQty: 10, yieldUnit: "each", instructions: "Assemble the wraps.",
    components: [{ id: "wraps-ranch", childId: ranch.id, quantity: 2, unit: "qt" }],
  });
  const salad = node("salad", "Garden salad", {
    yieldQty: 10, yieldUnit: "each",
    components: [{ id: "salad-ranch", childId: ranch.id, quantity: 1, unit: "qt" }],
  });
  return { wraps, salad, ranch, mayo, garlic, byId: new Map([wraps, salad, ranch, mayo, garlic].map(r => [r.id, r])) };
}

test("packet keeps the first sub-recipe inline and prints deeper instructions once at the back", () => {
  const { wraps, byId } = referenceFixture();
  const references = buildRecipeReferences([{ node: wraps, totalBatches: 3 }], byId);
  assert.deepEqual([...references.keys()], ["mayo", "garlic"]);
  const main = renderToStaticMarkup(<RecipeBuildBody node={wraps} byId={byId} totalBatches={3}
    compact={false} depth={0} stack={new Set()} references={references} />);
  assert.match(main, /Sub-recipe of Chicken wraps/);
  assert.match(main, /Whisk the ranch dressing/);
  assert.match(main, /Needed: 1.5 gal/);
  assert.match(main, /Reference A.1 at the back/);
  assert.match(main, /Milk.*Eggs/);
  assert.doesNotMatch(main, /Emulsify the mayonnaise|Puree the roasted cloves|make /);

  const appendix = renderToStaticMarkup(<RecipeReferences references={references} byId={byId} />);
  assert.match(appendix, /print:break-before-page/);
  assert.match(appendix, /Reference A.1 · Sub-recipe of Ranch dressing/);
  assert.match(appendix, /Total needed: 1.5 gal/);
  assert.match(appendix, /Total needed: 12 oz/);
  assert.match(appendix, /Reference A.2 at the back/);
  assert.match(appendix, /Garlic reference safety instruction/);
  assert.equal((appendix.match(/Emulsify the mayonnaise/g) ?? []).length, 1);
  assert.equal((appendix.match(/Puree the roasted cloves/g) ?? []).length, 1);
  for (const [, target] of (main + appendix).matchAll(/href="#([^"]+)"/g)) {
    assert.ok(appendix.includes(`id="${target}"`), `missing reference target ${target}`);
  }
});

test("deep reference demand sums shared dishes and mixed-depth uses without multiplying descendants twice", () => {
  const { wraps, salad, mayo, garlic, byId } = referenceFixture();
  const references = buildRecipeReferences([
    { node: wraps, totalBatches: 3 }, { node: salad, totalBatches: 2 },
  ], byId);
  assert.equal(references.get(mayo.id)!.totalBatches * mayo.yieldQty, 8);
  assert.equal(references.get(garlic.id)!.totalBatches * garlic.yieldQty, 16);
  assert.deepEqual(references.get(mayo.id)!.roots, [wraps.name, salad.name]);

  salad.components.push({ id: "salad-mayo", childId: mayo.id, quantity: 1, unit: "qt" });
  const mixed = buildRecipeReferences([{ node: salad, totalBatches: 2 }], byId);
  assert.equal(mixed.get(mayo.id)!.totalBatches * mayo.yieldQty, 4);
  assert.equal(mixed.get(garlic.id)!.totalBatches * garlic.yieldQty, 8);
});

test("printed lot references use their own batch demand and preserve grams in the appendix", () => {
  const { wraps, ranch, mayo, garlic, byId } = referenceFixture();
  const sharedRefs = new Map([[ranch.id, "lot RANCH-01"]]);
  const references = buildRecipeReferences([
    { node: wraps, totalBatches: 3 }, { node: ranch, totalBatches: 10 },
  ], byId, sharedRefs);
  // Ranch is already a requested batch, so wrap demand must not count its
  // components again. Mayo is immediate to that batch, garlic is the deep ref.
  assert.equal(references.has(mayo.id), false);
  assert.equal(references.get(garlic.id)!.totalBatches * garlic.yieldQty, 20);
  const main = renderToStaticMarkup(<RecipeBuildBody node={wraps} byId={byId} totalBatches={3}
    compact={false} depth={0} stack={new Set()} references={references} sharedRefs={sharedRefs} />);
  assert.match(main, /pull from lot RANCH-01/);
  assert.doesNotMatch(main, /Whisk the ranch dressing/);
  const appendix = renderToStaticMarkup(<RecipeReferences references={references} byId={byId} sharedRefs={sharedRefs} weightInGrams />);
  assert.match(appendix, /Total needed: 566.99 g/);
  assert.doesNotMatch(appendix, /Total needed:.*lb/);
});

test("reference collection terminates cycles and omits missing recipes and empty appendices", () => {
  const { wraps, ranch, mayo, garlic, byId } = referenceFixture();
  garlic.components.push({ id: "cycle", childId: wraps.id, quantity: 10, unit: "each" });
  mayo.components.push({ id: "missing", childId: "missing", quantity: 1, unit: "qt" });
  const references = buildRecipeReferences([{ node: wraps, totalBatches: 1 }], byId);
  assert.deepEqual([...references.keys()], [mayo.id, garlic.id]);
  assert.ok(!references.has(wraps.id) && !references.has(ranch.id));
  assert.equal(renderToStaticMarkup(<RecipeReferences references={new Map()} byId={byId} />), "");
});
