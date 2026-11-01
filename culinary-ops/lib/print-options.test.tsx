import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { printScale, validPrintScale, printOptionHref, printTargetDate } from "./print-options";
import { PrintSpecHeader, ScaledProductionBanner } from "../components/PrintSpecHeader";

test("custom print scales accept fractional batches and legacy 4x, rejecting invalid and unsafe values", () => {
  for (const [input, expected] of [["0.5", 0.5], ["2.75", 2.75], ["4", 4], ["100", 100], ["0", 1], ["-2", 1], ["Infinity", 1], ["NaN", 1], ["101", 1], ["", 1], [" ", 1]] as const) assert.equal(printScale(input), expected);
  assert.equal(printScale(["2", "3"]), 1);
  assert.equal(printScale(undefined), 1);
  assert.equal(validPrintScale(Number.NaN), false);
  assert.equal(validPrintScale(-1), false);
});

test("print option links retain density alongside content modes without adding other parameters", () => {
  assert.equal(printOptionHref("/recipes/abc/print?scale=2&costs=1", "compact"), "/recipes/abc/print?scale=2&costs=1&density=compact");
  assert.equal(printOptionHref("/print", "compact"), "/print?density=compact");
  assert.equal(printOptionHref("/print", undefined), "/print");
});

test("target calendar dates do not move with the server timezone", () => {
  assert.equal(printTargetDate("2026-11-01"), "Nov 1, 2026");
  assert.equal(printTargetDate(new Date("2026-11-01T00:00:00Z")), "Nov 1, 2026");
});

test("spec headers distinguish target dates from Chicago print time and supply portrait page counters", () => {
  const html = renderToStaticMarkup(createElement(PrintSpecHeader, { venue: "Main Kitchen", title: "Prep packet", targetDate: "2026-11-01", printedAt: new Date("2026-11-01T04:30:00Z") }));
  assert.match(html, /Main Kitchen/);
  assert.match(html, /Nov 1, 2026/);
  assert.match(html, /Oct 31, 2026, 11:30 PM CDT/);
  assert.match(html, /letter portrait/);
  assert.match(html, /counter\(pages\)/);
});

test("schedule headers keep landscape while reference documents label their target explicitly", () => {
  const html = renderToStaticMarkup(createElement(PrintSpecHeader, { venue: "Main", title: "Schedule", targetLabel: "Nov 2 - Nov 8", printedAt: new Date("2026-11-01T12:00:00Z"), landscape: true }));
  assert.match(html, /letter landscape/);
  assert.match(html, /Nov 2 - Nov 8/);
});

test("every nonstandard recipe batch carries the binder warning, including half batches", () => {
  assert.equal(renderToStaticMarkup(createElement(ScaledProductionBanner, { scale: 1 })), "");
  for (const scale of [0.5, 2.75, 4]) {
    const html = renderToStaticMarkup(createElement(ScaledProductionBanner, { scale }));
    assert.ok(html.includes(`SCALED PRODUCTION BATCH (${scale}x)`));
    assert.match(html, /DO NOT FILE IN MASTER BINDER/);
  }
});
