import assert from "node:assert/strict";
import test from "node:test";
import { ANNEX_METHODS, cleanedAnnexInstructions, missingAnnexMethod } from "./annex-launch-repairs";

test("Annex repair removes migration artifacts without losing production instructions", () => {
  const stock = "Roast bones — Roast at 425°F for 30 min.\n14. — Migrated notes —\n15. Recipe type: batch";
  assert.equal(cleanedAnnexInstructions("GCS", stock), "Roast bones — Roast at 425°F for 30 min.");
  const carrots = "Peel carrots – 5 min\nStep 2 — Portion carrots into bags.\n— Migrated notes —\nRecipe type: batch";
  const fixed = cleanedAnnexInstructions("SVC", carrots);
  assert.equal(fixed, "Prep Carrots — Peel carrots – 5 min\nBag Carrots — Portion carrots into bags.");
  assert.equal(cleanedAnnexInstructions("SVC", fixed), fixed);
  assert.equal(cleanedAnnexInstructions("GRG", "Incorporate creamy base — Blend mayonnaise and crème fraîche until smooth."), "Incorporate creamy base — Blend mayonnaise and sour cream until smooth.");
});

test("all five missing methods receive actionable steps and estimated prep/cook times", () => {
  for (const code of Object.keys(ANNEX_METHODS)) {
    const patch = missingAnnexMethod(code, null)!;
    assert.ok(patch.instructions.split("\n").length >= 4);
    assert.ok(patch.instructions.split("\n").every(step => step.includes(" — ")));
    assert.ok(patch.prepMinutes > 0 && patch.cookMinutes > 0);
    assert.equal(missingAnnexMethod(code, patch.instructions), null);
  }
  assert.match(missingAnnexMethod("PPF", null)!.instructions, /350°F.*165°F/);
  assert.match(missingAnnexMethod("PPF", null)!.instructions, /3.5 g/);
  assert.match(missingAnnexMethod("PCB", null)!.instructions, /355°F for 3–5 min/);
  assert.equal(missingAnnexMethod("OTHER", null), null);
  assert.equal(missingAnnexMethod("PPF", "Chef's current method"), null);
});
