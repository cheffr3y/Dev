import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { captureBaseline, baselineChanges, type BaselineEvent } from "./banquet-baseline";
import { BanquetRevision } from "../../components/BanquetRevision";
import { emptySetup } from "./banquet-setup";

const event: BaselineEvent = { name: "Wedding", date: new Date("2026-12-10T00:00:00Z"), guestCount: 80, status: "CONFIRMED", venue: { name: "Hall" }, timeLabel: "5pm", location: null, areas: "Ballroom", setupNotes: null, specialInstructions: "Separate allergy plate", notes: null, setupPlan: emptySetup(), menuItems: [{ id: "line", orderedQty: 80, unit: "each", description: "No garnish", recipe: { name: "Dinner", allergens: "dairy" } }] };
test("locked baseline detects guests, service, allergen instructions and menu line changes", () => {
  const before = captureBaseline(event);
  const after = captureBaseline({ ...event, guestCount: 115, timeLabel: "6pm", specialInstructions: "Dairy-free allergy plate", menuItems: [{ ...event.menuItems[0], orderedQty: 115 }] });
  const fields = baselineChanges(before, after).map(c => c.field);
  assert.deepEqual(fields, ["Food line / Quantity", "Guests", "Service time", "Special instructions"]);
  const markup = renderToStaticMarkup(<BanquetRevision data={{ snapshot: before, current: after, createdAt: "2026-11-01T12:00:00Z", updatedAt: "2026-12-08T12:00:00Z" }} />);
  assert.match(markup, /REVISED:/); assert.match(markup, /Pax \+35/); assert.match(markup, /Dairy-free/); assert.match(markup, /80 each/); assert.match(markup, /115 each/);
  assert.match(markup, /Dinner \/ Quantity/); assert.doesNotMatch(markup, /Food line \/ Quantity/);
});
test("packing checks do not generate BEO revisions and removed food lines are preserved in diff", () => {
  const baseline = captureBaseline(event);
  assert.deepEqual(baselineChanges(baseline, captureBaseline({ ...event, setupPlan: { ...emptySetup(), packed: { pan: "checked" } } })), []);
  const changes = baselineChanges(baseline, captureBaseline({ ...event, menuItems: [] }));
  assert.ok(changes.some(change => change.before === "Dinner" && change.after === ""));
});
test("setup quantities and timelines generate a revision", () => {
  const setup = { ...emptySetup(), stations: [{ id: "station", name: "Buffet", serviceTime: "5pm", notes: "", items: [], resources: [{ id: "pan", category: "vessel" as const, name: "Pan", qty: 2 }] }] };
  const baseline = captureBaseline({ ...event, setupPlan: setup });
  const changed = captureBaseline({ ...event, setupPlan: { ...setup, stations: [{ ...setup.stations[0], serviceTime: "6pm", resources: [{ ...setup.stations[0].resources[0], qty: 3 }] }] } });
  assert.equal(baselineChanges(baseline, changed).length, 2);
});
