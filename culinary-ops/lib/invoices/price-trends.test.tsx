import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "../../components/Sparkline";
import { PriceTrend } from "../../components/PriceTrend";
import { priceJump, priceTrend, priceVariance, varianceThreshold, type PriceObservation } from "./price-trends";
const row = (price: number, patch: Partial<PriceObservation> = {}): PriceObservation => ({ vendorId: "a", vendorName: "Supplier A", normalizedUnit: "lb", normalizedUnitCost: price, amountCents: 1000, invoiceDate: "2026-11-02", ...patch });
test("price variance handles direction, invalid bases and strict configurable thresholds", () => {
  assert.equal(priceVariance(8, 10), 25);
  assert.equal(priceVariance(10, 8), -20);
  for (const value of [0, -1, NaN, Infinity, null]) assert.equal(priceVariance(value, 10), null);
  assert.equal(priceVariance(10, 0), null);
  assert.equal(priceJump(priceVariance(1, 1.1), 10), false);
  assert.equal(priceJump(priceVariance(1, 1.10001), 10), true);
  assert.equal(varianceThreshold("5"), 5);
  assert.equal(varianceThreshold("0"), 0);
  for (const value of ["", "bad", -1, Infinity]) assert.equal(varianceThreshold(value), 10);
});
test("trends compare normalized same-supplier positive reviewed purchases and retain only eight points", () => {
  const trend = priceTrend([row(0.75, { normalizedUnit: "oz" }), row(100, { vendorId: "b" }), row(999, { voided: true }), row(888, { amountCents: -100 }), row(10, { normalizedUnit: "gal" }), row(8)], "lb", "a");
  assert.deepEqual(trend?.prices, [8, 12]);
  assert.equal(trend?.change, 50);
  assert.equal(priceTrend([row(10)], "lb", "missing"), null);
  assert.deepEqual(priceTrend(Array.from({ length: 12 }, (_, i) => row(12 - i)), "lb")?.prices, [5,6,7,8,9,10,11,12]);
});
test("sparkline renders accessible finite, flat and single-point series without invalid SVG coordinates", () => {
  assert.equal(renderToStaticMarkup(<Sparkline values={[]} label="Empty" />), "");
  assert.equal(renderToStaticMarkup(<Sparkline values={[2]} label="Single" />), "");
  const html = renderToStaticMarkup(<Sparkline values={[2, NaN, 2, Infinity]} label="Supplier price trend" />);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Supplier price trend"/);
  assert.match(html, /2,12 78,12/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
test("price warnings describe paid observations and respect the configured threshold", () => {
  const trend = priceTrend([row(12),row(8)], "lb")!;
  const html = renderToStaticMarkup(<PriceTrend trend={trend} />);
  assert.match(html, /Paid price \+50.0%/);
  assert.match(html, /no-print/);
  assert.match(html, /Supplier A/);
  assert.doesNotMatch(renderToStaticMarkup(<PriceTrend trend={{ ...trend, threshold: 60 }} />), /Paid price \+/);
});
