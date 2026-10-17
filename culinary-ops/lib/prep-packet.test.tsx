import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { displayMeasure } from "./units";
import { RecipeBuildBody, RecipeBuildCard, buildRecipeTree, consolidateSharedSubBuilds, SharedBuildCard, type RecipeTreeNode } from "../components/RecipeBuild";
import { RecipeReferences } from "../components/RecipeReferences";
import { buildRecipeReferences } from "./recipe-references";
import { RecipeDossier } from "../components/RecipeDossier";

const textContent = (html: string) => html.replace(/<[^>]*>/g, "");

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
  assert.match(textContent(shared), /4000 g/);
  assert.match(shared, /pull from lot TEST/);
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
  const main = renderToStaticMarkup(<RecipeBuildCard node={wraps} byId={byId} totalBatches={3}
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
  assert.match(textContent(appendix), /Total needed: 1.5 gal/);
  assert.match(textContent(appendix), /Total needed: 12 oz/);
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
  const main = renderToStaticMarkup(<RecipeBuildCard node={wraps} byId={byId} totalBatches={3}
    compact={false} depth={0} stack={new Set()} references={references} sharedRefs={sharedRefs} />);
  assert.match(main, /pull from lot RANCH-01/);
  assert.doesNotMatch(main, /Whisk the ranch dressing/);
  const appendix = renderToStaticMarkup(<RecipeReferences references={references} byId={byId} sharedRefs={sharedRefs} weightInGrams />);
  assert.match(textContent(appendix), /Total needed: 566.99 g/);
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

test("dossier preserves fractional scaling, culinary stages, cues and inherited allergens", () => {
  const { wraps, ranch, byId } = referenceFixture();
  wraps.category = "Lunch";
  wraps.station = "Garde Manger";
  wraps.prepMinutes = 10;
  wraps.cookMinutes = 20;
  wraps.shelfLife = "2 days refrigerated";
  wraps.storage = "Store covered.\nLabel each container.";
  wraps.instructions = "1. Finish — Cook for 1 minute to 165°F, then use an Ice Bath.";
  wraps.items = [
    { id: "greens", name: "Greens", quantity: 4, unit: "oz", note: "washed", category: "Produce" },
    { id: "salt", name: "Salt", quantity: 1, unit: "oz", note: null, category: "Legacy category" },
  ];
  const html = renderToStaticMarkup(<RecipeBuildCard node={wraps} byId={byId} totalBatches={2.5}
    compact={false} depth={0} stack={new Set()} references={buildRecipeReferences([{ node: wraps, totalBatches: 2.5 }], byId)} />);
  const text = textContent(html);
  assert.match(text, /25 each/);
  assert.match(html, /recipe-masthead/);
  assert.match(text, /2.5× Batch/);
  assert.match(text, /Prepared By.*Date &amp; Time.*Verified By/);
  assert.match(text, /Garde Manger.*Lunch/);
  assert.match(text, /30m/);
  assert.match(text, /I\. House Sub-Recipes/);
  assert.match(text, /II\. Produce &amp; Botanicals/);
  assert.match(text, /III\. Seasonings &amp; Aromatics/);
  assert.match(text, /Greenswashed10 oz/);
  assert.match(text, /1 minute/);
  assert.match(text, /165°F/);
  assert.match(html, /aria-label="Method cues"/);
  assert.match(html, /aria-label="Time: 1 min"/);
  assert.match(html, /aria-label="Temperature: 165°F"/);
  assert.match(text, /Storage, Stewardship &amp; Shelf Life/);
  const profile = html.slice(html.indexOf("Allergen Profile"), html.indexOf('class="recipe-workspace'));
  assert.match(profile, /Milk.*Eggs/);
  assert.match(text, new RegExp(ranch.name));
});

test("new recipe trees retain display metadata and historical snapshots render without inventing metadata", () => {
  const row = {
    id: "frozen", name: "Frozen soup", prodCode: "FS", version: 2, yieldQty: 1, yieldUnit: "quart",
    instructions: "Stir the captured soup.", allergens: null, criticalNotes: null,
    items: [{ id: "carrot", quantity: 1, unit: "lb", note: "diced", item: { name: "Carrot" } }], components: [],
  };
  const legacy = buildRecipeTree([row]).get(row.id)!;
  assert.equal(legacy.category, undefined);
  assert.equal(legacy.items[0].category, undefined);
  const historical = renderToStaticMarkup(<RecipeBuildCard node={legacy} byId={new Map([[legacy.id, legacy]])}
    totalBatches={2} compact={false} depth={0} stack={new Set()} />);
  assert.match(textContent(historical), /Stir the captured soup/);
  assert.doesNotMatch(historical, /Invalid Date|undefined|null/);
  const updatedAt = "2026-10-15T12:00:00.000Z";
  const modern = buildRecipeTree([{ ...row, category: "Soup", station: "Saucier", prepMinutes: 0,
    cookMinutes: 15, shelfLife: "2 days", storage: "Covered", updatedAt,
    items: [{ ...row.items[0], item: { name: "Carrot", category: "Produce" } }],
  }]).get(row.id)!;
  assert.equal(modern.updatedAt, updatedAt);
  assert.equal(modern.prepMinutes, 0);
  assert.equal(modern.items[0].category, "Produce");
  assert.equal(modern.storage, "Covered");
});

test("multiple dossier instances keep accessible heading ids unique", () => {
  const { wraps, byId } = referenceFixture();
  const props = { node: wraps, byId, totalBatches: 1, compact: false, depth: 0, stack: new Set<string>() };
  const html = renderToStaticMarkup(<><RecipeBuildCard {...props} /><RecipeBuildCard {...props} /></>);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, target] of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
    assert.ok(ids.includes(target));
  }
});

test("editorial recursion stops cycles and consolidated festival builds retain pull quantities", () => {
  const { wraps, salad, ranch, garlic, byId } = referenceFixture();
  const { shared, sharedRefs } = consolidateSharedSubBuilds([
    { node: wraps, totalBatches: 3 }, { node: salad, totalBatches: 2 },
  ], byId);
  assert.equal(shared.find((build) => build.node.id === ranch.id)!.totalBatches, 8);
  const ranchCard = renderToStaticMarkup(<SharedBuildCard build={shared.find((build) => build.node.id === ranch.id)!}
    byId={byId} sharedRefs={sharedRefs} />);
  assert.match(textContent(ranchCard), /Make 2 gal — once/);
  assert.match(textContent(ranchCard), /Feeds: Chicken wraps · Garden salad/);
  const dish = renderToStaticMarkup(<RecipeBuildCard node={wraps} byId={byId} totalBatches={3}
    compact={false} depth={0} stack={new Set()} sharedRefs={sharedRefs} />);
  assert.match(textContent(dish), /pull from shared build above/);
  assert.doesNotMatch(dish, /Whisk the ranch dressing/);
  garlic.components.push({ id: "cycle", childId: wraps.id, quantity: 10, unit: "each" });
  const cyclic = renderToStaticMarkup(<RecipeBuildCard node={wraps} byId={byId} totalBatches={1}
    compact={false} depth={0} stack={new Set()} />);
  assert.equal((cyclic.match(/Assemble the wraps\./g) ?? []).length, 1);
});

test("standalone and packet dossiers share grouping and preserve zero yield and time", () => {
  const { wraps } = referenceFixture();
  const html = renderToStaticMarkup(<RecipeDossier recipe={{ ...wraps, prepMinutes: 0, cookMinutes: 0, holdLifeDays: 0 }}
    scale={0} allergenKeys={[]} titleLevel={1} lines={[
      { id: "lettuce", name: "Lettuce", quantity: 2, unit: "each", note: null, category: "Produce" },
    ]} />);
  assert.match(textContent(html), /0 each/);
  assert.match(textContent(html), /0m \/ 0m/);
  assert.match(textContent(html), /0 Days/);
  assert.doesNotMatch(html, /recipe-stage-title/);
  assert.match(html, /<h1 /);
});
