import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregateSetup, emptySetup, readSetup, resolveSetup, retainPacking, setupSchema, setupWarnings, type BanquetSetup } from "./banquet-setup";
import { BanquetSetupPacket, BanquetSetupSheet, type SetupEvent } from "../components/BanquetSetupSheet";

function fixture(): BanquetSetup {
  return { ...emptySetup(), stations: [{
    id: "s1", name: "Adult appetizers", serviceTime: "5 pm", notes: "Refill from kitchen",
    resources: [{ id: "lamp", category: "equipment", name: "Heatlamp", qty: 1 }],
    items: [
      { id: "i1", food: "Crudité", menuItemId: "m1", notes: "", resources: [
        { id: "r1", category: "vessel", name: "Boos Block", qty: 2 },
        { id: "r2", category: "utensil", name: "Tongs", qty: 3 },
      ] },
      { id: "i2", food: "Fruit", menuItemId: null, notes: "", resources: [
        { id: "r3", category: "vessel", name: "  boos   block ", qty: 1 },
        { id: "r4", category: "vessel", name: "Round Chafer", qty: 1 },
      ] },
      { id: "i3", food: "Hot sauce", menuItemId: null, notes: "On table — no vessel needed", resources: [] },
    ],
  }] };
}
const menu = [{ id: "m1", name: "Seasonal crudité", orderedQty: 150, unit: "servings" }];
const event: SetupEvent = { name: "Minkin banquet", venue: "Main", date: "Oct 24, 2026", guestCount: 150, timeLabel: "5–11 pm", location: "Ballroom", areas: null, setupNotes: "Two rows of bowls", specialInstructions: "Confirm dietary meals with chef" };

test("pulls merge whitespace/case without multiplying equipment or guessing fuel", () => {
  const pulls = aggregateSetup(fixture());
  assert.equal(pulls.find(p => p.key === "vessel:boos block")?.qty, 3);
  assert.equal(pulls.find(p => p.key === "utensil:tongs")?.qty, 3);
  assert.equal(pulls.find(p => p.key === "equipment:heatlamp")?.qty, 1);
  assert.equal(pulls.length, 4);
  assert.ok(!pulls.some(p => /fuel|water pan|on table/i.test(p.name)));
});
test("sizes and categories remain distinct", () => {
  const plan = fixture();
  plan.stations[0].resources.push(
    { id: "large", name: "Square Tray (Large)", category: "vessel", qty: 2 },
    { id: "small", name: "Square Tray (Small)", category: "vessel", qty: 1 },
    { id: "other", name: "Tongs", category: "equipment", qty: 1 },
  );
  assert.equal(aggregateSetup(plan).length, 7);
});
test("packing survives reordering but clears for quantity and allocation changes", () => {
  const plan = fixture();
  const pull = aggregateSetup(plan).find(p => p.key === "vessel:boos block")!;
  plan.packed[pull.key] = pull.signature;
  const next = structuredClone(plan);
  next.stations[0].items.reverse();
  assert.equal(retainPacking(next, plan).packed[pull.key], pull.signature);
  next.stations[0].items[2].resources[0].qty = 1;
  next.stations[0].items[1].resources[0].qty = 2;
  assert.equal(aggregateSetup(next).find(p => p.key === pull.key)?.qty, 3);
  assert.deepEqual(retainPacking(next, plan).packed, {});
  next.stations[0].items[1].resources[0].qty = 3;
  assert.deepEqual(retainPacking(next, plan).packed, {});
  assert.deepEqual(retainPacking(emptySetup(), plan).packed, {});
});
test("validation rejects invalid counts, duplicate IDs, oversized notes and future versions", () => {
  for (const qty of [0, -1, 1.5, NaN, Infinity, 10000]) {
    const plan = fixture(); plan.stations[0].resources[0].qty = qty;
    assert.equal(setupSchema.safeParse(plan).success, false);
  }
  const plan = fixture();
  plan.stations[0].resources[0].id = "i1";
  assert.equal(setupSchema.safeParse(plan).success, false);
  assert.throws(() => readSetup({ version: 2 }));
  assert.throws(() => readSetup({ ...fixture(), stations: [{ ...fixture().stations[0], notes: "a".repeat(1001) }] }));
  assert.deepEqual(readSetup(null), emptySetup());
});
test("linked dishes resolve current names and expose unassigned and removed lines", () => {
  assert.equal(resolveSetup(fixture(), menu).stations[0].items[0].food, "Seasonal crudité");
  assert.deepEqual(setupWarnings(fixture(), menu), []);
  assert.match(setupWarnings(emptySetup(), menu)[0], /Not assigned/);
  assert.match(setupWarnings(fixture(), [])[0], /removed/);
});
test("print sheet includes live food quantities, full notes, checklist and signoffs without controls", () => {
  const plan = fixture();
  plan.stations[0].notes = "Long setup notes ".repeat(30);
  const html = renderToStaticMarkup(<BanquetSetupSheet plan={plan} menu={menu} event={event} revision={4} />);
  for (const text of ["Seasonal crudité", "150 servings ordered", "Long setup notes ".repeat(30), "Revision 4", "Consolidated pull checklist", "Verified by:", "Ballroom", "Confirm dietary meals with chef"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<input|<select|<textarea|<button|Sterno/);
  assert.match(renderToStaticMarkup(<BanquetSetupSheet plan={plan} menu={menu} event={event} revision={4} draft />), /UNSAVED DRAFT/);
});
test("packet embeds saved setup even without recipes and omits unconfigured setup", () => {
  const banquet = { ...event, date: new Date("2026-10-24T00:00:00Z"), venue: { name: event.venue }, setupRevision: 4, setupPlan: fixture() };
  assert.match(renderToStaticMarkup(<BanquetSetupPacket banquet={banquet} menu={[]} />), /Consolidated pull checklist/);
  assert.equal(renderToStaticMarkup(<BanquetSetupPacket banquet={{ ...banquet, setupPlan: null }} menu={[]} />), "");
});
