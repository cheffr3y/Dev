import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { displayMeasure } from "./units";
import { RecipeBuildBody, type RecipeTreeNode } from "../components/RecipeBuild";

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
