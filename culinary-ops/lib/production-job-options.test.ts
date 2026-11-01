import assert from "node:assert/strict";
import test from "node:test";
import { finishJobSchema, jobScanHref, sourceFromQuery, elapsedMinutes, durationLabel, safeReturnTo, publicOrigin } from "./production-job-options";
test("QR links retain a prep lot reference and printed multiplier; banquet links identify their food line", () => {
  assert.equal(jobScanHref({ kind: "PREP", lineId: "line-1", scale: 2.5 }), "/prep-orders/closeout/scan?prep=line-1&scale=2.5");
  assert.equal(jobScanHref({ kind: "BANQUET", lineId: "beo-1" }), "/prep-orders/closeout/scan?banquet=beo-1");
  assert.deepEqual(sourceFromQuery({ prep: "line-1", scale: "0.5" }), { kind: "PREP", lineId: "line-1", scale: 0.5 });
  assert.throws(() => sourceFromQuery({ prep: "one", banquet: "two" }));
});
test("elapsed project time is independent of production yields and never negative", () => {
  assert.equal(elapsedMinutes("2026-12-10T15:00:00Z", "2026-12-10T16:30:00Z"), 90);
  assert.equal(elapsedMinutes("2026-12-10T16:00:00Z", "2026-12-10T15:00:00Z"), 0);
  assert.equal(durationLabel(90), "1h 30m");
  assert.equal(durationLabel(0.5), "Less than 1 minute");
});
test("finishing requires measured yield, a unit, labeling confirmation and an explanation for zero output", () => {
  const data = { jobId: "job", actualQty: 12, actualUnit: "qt", notes: "", labeledAndDated: true };
  assert.equal(finishJobSchema.safeParse(data).success, true);
  for (const patch of [{ actualQty: -1 }, { actualQty: Number.NaN }, { actualUnit: " " }, { labeledAndDated: false }, { actualQty: 0 }]) assert.equal(finishJobSchema.safeParse({ ...data, ...patch }).success, false);
  assert.equal(finishJobSchema.safeParse({ ...data, actualQty: 0, notes: "Project cancelled; nothing produced." }).success, true);
});
test("sign-in returns to a local project and rejects external or ambiguous destinations", () => {
  const href = "/prep-orders/closeout/scan?prep=abc&scale=2";
  assert.equal(safeReturnTo(href), href);
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login?returnTo=/login", null]) assert.equal(safeReturnTo(value), "/");
});
test("QR origins support deployed HTTPS and local testing without accepting embedded credentials or paths", () => {
  assert.equal(publicOrigin("https://mise.example/"), "https://mise.example");
  assert.equal(publicOrigin("http://localhost:3107"), "http://localhost:3107");
  for (const value of ["javascript:alert(1)", "https://user:secret@mise.example", "https://mise.example/path", "https://mise.example?token=secret"]) assert.throws(() => publicOrigin(value));
});
