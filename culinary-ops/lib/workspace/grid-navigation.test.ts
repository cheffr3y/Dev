import test from "node:test";
import assert from "node:assert/strict";
import { gridTarget, type GridPosition } from "./grid-navigation";

const cells: GridPosition[] = [
  { row: "a", column: "cost" }, { row: "a", column: "par" }, { row: "a", column: "unit" },
  { row: "b", column: "cost" }, { row: "b", column: "unit" },
  { row: "c", column: "cost" }, { row: "c", column: "par" }, { row: "c", column: "unit" },
];
test("vertical grid navigation follows matching columns through sparse rows", () => {
  assert.equal(gridTarget(cells, 1, "ArrowDown"), 6);
  assert.equal(gridTarget(cells, 6, "ArrowUp"), 1);
  assert.equal(gridTarget(cells, 2, "Enter"), 4);
  assert.equal(gridTarget(cells, 4, "Enter", true), 2);
});
test("horizontal arrows stay in their logical row and Tab wraps", () => {
  assert.equal(gridTarget(cells, 1, "ArrowLeft"), 0);
  assert.equal(gridTarget(cells, 1, "ArrowRight"), 2);
  assert.equal(gridTarget(cells, 2, "ArrowRight"), null);
  assert.equal(gridTarget(cells, 3, "ArrowLeft"), null);
  assert.equal(gridTarget(cells, 2, "Tab"), 3);
  assert.equal(gridTarget(cells, 3, "Tab", true), 2);
});
test("grid boundaries have no implicit wrap, target or form submission", () => {
  assert.equal(gridTarget(cells, 0, "ArrowUp"), null);
  assert.equal(gridTarget(cells, 7, "Enter"), null);
  assert.equal(gridTarget(cells, 7, "Tab"), null);
  assert.equal(gridTarget(cells, 0, "Tab", true), null);
  assert.equal(gridTarget([], 0, "Enter"), null);
  assert.equal(gridTarget(cells, -1, "Enter"), null);
});
