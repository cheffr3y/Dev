import test from "node:test";
import assert from "node:assert/strict";
import { parseSmokeOcr, type OcrLine } from "./ocr-parser";
import {
  emptyActual,
  freshLotFromSetup,
  newPlan,
  smokeDate,
  smokeYield,
} from "./smoking";
const line = (
  text: string,
  x: number,
  y: number,
  confidence = 96,
): OcrLine => ({
  text,
  confidence,
  bbox: { x0: x, y0: y, x1: x + 150, y1: y + 30 },
});
const example = [
  line("Breast: Well Done", 40, 100),
  line("Wireless Thermometer", 40, 160),
  line("Oct 31, 2026", 40, 220),
  line("Target Temp", 40, 300),
  line("Cooking Time", 350, 300),
  line("165°F", 40, 345),
  line("6hr 22min", 350, 345),
  line("Peak Temp", 40, 430),
  line("144.8°F", 40, 475),
];
test("thermometer parser uses nearby labels across columns and preserves reported facts", () => {
  assert.deepEqual(parseSmokeOcr(example), {
    sourceTitle: "Breast: Well Done",
    sourceDate: "2026-10-31",
    target: 165,
    peak: 144.8,
    temperatureUnit: "F",
    durationMinutes: 382,
  });
  const moved = example.map((l) => ({
    ...l,
    bbox: {
      x0: l.bbox.x0 * 2 + 125,
      y0: l.bbox.y0 * 2 + 300,
      x1: l.bbox.x1 * 2 + 125,
      y1: l.bbox.y1 * 2 + 300,
    },
  }));
  assert.deepEqual(parseSmokeOcr(moved), parseSmokeOcr(example));
});
test("uncertain, missing and conflicting OCR values remain blank", () => {
  assert.deepEqual(parseSmokeOcr([]), {
    sourceTitle: "",
    sourceDate: null,
    target: null,
    peak: null,
    temperatureUnit: null,
    durationMinutes: null,
  });
  assert.equal(
    parseSmokeOcr(
      example.map((l) => (l.text === "165°F" ? { ...l, confidence: 12 } : l)),
    ).target,
    null,
  );
  assert.equal(
    parseSmokeOcr([...example, line("166°F", 40, 385)]).target,
    null,
  );
  assert.equal(
    parseSmokeOcr(
      example.map((l) => (l.text === "144.8°F" ? { ...l, text: "63°C" } : l)),
    ).peak,
    null,
  );
  assert.equal(parseSmokeOcr([line("Target Temp: 70°C", 10, 10)]).target, 70);
  assert.equal(parseSmokeOcr([line("Feb 30, 2026", 10, 10)]).sourceDate, null);
});
test("yields only compare recognized compatible weight or count measures", () => {
  assert.deepEqual(
    smokeYield({ quantity: 10, unit: "lb" }, { quantity: 112, unit: "oz" }),
    { percent: 70, shrinkPercent: 30 },
  );
  assert.equal(
    smokeYield({ quantity: 1, unit: "kg" }, { quantity: 750, unit: "g" })
      ?.percent,
    75,
  );
  assert.equal(
    smokeYield({ quantity: 1, unit: "dozen" }, { quantity: 9, unit: "each" })
      ?.percent,
    75,
  );
  for (const unit of ["case", "gal", "unknown"])
    assert.equal(
      smokeYield({ quantity: 1, unit }, { quantity: 1, unit }),
      null,
    );
  assert.equal(
    smokeYield({ quantity: 0, unit: "lb" }, { quantity: 1, unit: "lb" }),
    null,
  );
  assert.equal(
    smokeYield({ quantity: 1, unit: "lb" }, { quantity: 1, unit: "each" }),
    null,
  );
});
test("repeat setup clears actuals, project identity and review while preserving captured recipe", () => {
  const source = {
    plan: { ...newPlan("Chef"), projectId: "old-job" },
    actual: { ...emptyActual(), raw: { quantity: 20, unit: "lb" } },
    recipe: {
      id: "recipe",
      name: "Brisket",
      version: 2,
      instructions: "Historical method",
      yieldQty: 10,
      yieldUnit: "lb",
    },
    project: {
      id: "old-job",
      recipeId: "recipe",
      recipeName: "Brisket",
      contextLabel: "Party",
    },
    status: "REVIEWED" as const,
    review: {
      actorId: "manager",
      actorName: "M",
      at: new Date().toISOString(),
      note: "Checked",
    },
  };
  const copy = freshLotFromSetup(source);
  assert.deepEqual(copy.actual, emptyActual());
  assert.equal(copy.review, null);
  assert.equal(copy.project, null);
  assert.equal(copy.plan.projectId, null);
  assert.equal(copy.status, "OPEN");
  assert.deepEqual(copy.recipe, source.recipe);
  copy.plan.procedure = "Edited";
  assert.notEqual(copy.plan.procedure, source.plan.procedure);
  assert.equal(smokeDate.safeParse("2026-02-30").success, false);
});
