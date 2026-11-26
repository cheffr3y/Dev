import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveDiet, dietMenuText, type DietNode } from "./diet";
import { allergenReview, allergenReviewText, priceGapNames, ALLERGEN_REVIEW_DAYS } from "./costing";

const item = (name: string, diet: string | null) => ({ item: { name, diet } });
const tree = (nodes: Record<string, DietNode>) => new Map(Object.entries(nodes));

test("vegan only when every ingredient and sub-recipe is vegan", () => {
  const byId = tree({
    glaze: { items: [item("Black Garlic", "vegan"), item("Molasses", "vegan")], components: [] },
    maitake: { items: [item("Maitake", "vegan")], components: [{ childId: "glaze" }] },
  });
  assert.deepEqual(effectiveDiet("maitake", byId), { diet: "vegan", overridden: false, untagged: [] });
});

test("dairy makes it vegetarian; meat anywhere makes it neither, even with untagged items", () => {
  const byId = tree({
    mac: { items: [item("Pasta", "vegan"), item("Cheddar", "vegetarian")], components: [] },
    beans: { items: [item("Green Beans", "vegan"), item("Bacon", "neither"), item("Mystery Spice", null)], components: [] },
  });
  assert.equal(effectiveDiet("mac", byId).diet, "vegetarian");
  const beans = effectiveDiet("beans", byId);
  assert.equal(beans.diet, "neither");
  assert.deepEqual(beans.untagged, ["Mystery Spice"]);
});

test("one untagged ingredient means no claim; override wins and is marked", () => {
  const byId = tree({
    slaw: { items: [item("Cabbage", "vegan")], components: [{ childId: "dressing" }] },
    dressing: { items: [item("Mayonnaise", null)], components: [] },
    rolls: { dietOverride: "vegetarian", items: [item("Bun", null)], components: [] },
    empty: { items: [], components: [] },
  });
  assert.deepEqual(effectiveDiet("slaw", byId), { diet: null, overridden: false, untagged: ["Mayonnaise"] });
  assert.deepEqual(effectiveDiet("rolls", byId), { diet: "vegetarian", overridden: true, untagged: ["Bun"] });
  assert.equal(effectiveDiet("empty", byId).diet, null);
  assert.equal(dietMenuText("vegan"), "Vegan");
  assert.equal(dietMenuText("neither"), "");
  assert.equal(dietMenuText(null), "");
});

test("allergen review: never reviewed, fresh, and older than six months", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  assert.equal(allergenReview(null, now).unreviewed, true);
  assert.equal(allergenReview(new Date("2026-10-01T00:00:00Z"), now).stale, false);
  assert.equal(allergenReview(new Date(now.getTime() - ALLERGEN_REVIEW_DAYS * 86400000), now).stale, true);
});

test("review gaps roll up like price gaps and only for items that carry the field", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const fresh = new Date("2026-11-01T00:00:00Z");
  const old = new Date("2025-01-01T00:00:00Z");
  const gaps = priceGapNames([
    { id: "dish", items: [{ itemId: "a", unitCost: 1, priceUpdatedAt: fresh, allergenReviewedAt: null }], components: [{ childId: "sauce" }] },
    { id: "sauce", items: [{ itemId: "b", unitCost: 1, priceUpdatedAt: fresh, allergenReviewedAt: old }, { itemId: "c", unitCost: 1, priceUpdatedAt: fresh, allergenReviewedAt: fresh }, { itemId: "d", unitCost: 1, priceUpdatedAt: fresh }] },
  ].map((r) => ({ components: [], ...r })), ["dish"], new Map([["a", "Ketchup"], ["b", "Mayonnaise"], ["c", "Salt"], ["d", "Legacy"]]), now);
  assert.deepEqual(gaps.unreviewed, ["Ketchup"]);
  assert.deepEqual(gaps.reviewStale, ["Mayonnaise"]);
  assert.equal(allergenReviewText(gaps), "never reviewed — Ketchup; over 6 months — Mayonnaise.");
  assert.equal(allergenReviewText({ unreviewed: [], reviewStale: [] }), "");
});
