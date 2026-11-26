import { test } from "node:test";
import assert from "node:assert/strict";
import { orderLine, parseOnHand } from "./purchase-count";

test("to order is need minus on hand, never below zero, rounded up to packs", () => {
  assert.deepEqual(orderLine(38.88, 10, 15), { toOrder: 28.88, packs: 2, counted: true });
  assert.deepEqual(orderLine(12, 20, 6), { toOrder: 0, packs: 0, counted: true });
  assert.deepEqual(orderLine(30, 0, 15), { toOrder: 30, packs: 2, counted: true });
  assert.deepEqual(orderLine(4.86, null, null), { toOrder: 4.86, packs: null, counted: false });
  assert.deepEqual(orderLine(0.1 + 0.2, 0, 0.3), { toOrder: 0.3, packs: 1, counted: true });
});

test("typed counts: blank clears, negatives and junk are rejected, commas work", () => {
  assert.equal(parseOnHand(""), null);
  assert.equal(parseOnHand(" 3.5 "), 3.5);
  assert.equal(parseOnHand("2,25"), 2.25);
  assert.equal(parseOnHand("-1"), "invalid");
  assert.equal(parseOnHand("lots"), "invalid");
});
