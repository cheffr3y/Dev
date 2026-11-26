import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMethodAndNotes } from "./method";

test("migrated notes come off the numbered steps and bookkeeping lines are dropped", () => {
  const text = [
    "1. Combine — Whisk water and vinegar.",
    "2. Blend until smooth",
    "",
    "— Migrated notes —",
    "Equipment: immersion blender, cambros",
    "Critical steps: Whisk tomato paste fully into liquid",
    "Add xanthan slowly",
    "Recipe type: batch",
    "Source venue: Annex",
  ].join("\n");
  assert.deepEqual(splitMethodAndNotes(text), {
    steps: ["Combine — Whisk water and vinegar.", "Blend until smooth"],
    notes: ["Equipment: immersion blender, cambros", "Critical steps: Whisk tomato paste fully into liquid", "Add xanthan slowly"],
  });
});

test("numbered migrated marker and stray recipe-type steps are handled", () => {
  assert.deepEqual(splitMethodAndNotes("1. Fry\n7. — Migrated notes —\n8. Recipe type: batch"), { steps: ["Fry"], notes: [] });
  assert.deepEqual(splitMethodAndNotes(null), { steps: [], notes: [] });
});
