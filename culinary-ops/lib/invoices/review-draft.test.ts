import test from "node:test";
import assert from "node:assert/strict";
import { emptyReviewDraft, reviewDraftSchema, ReviewDraftConflict, ReviewDraftSaver } from "./review-draft";

test("review drafts retain unfinished values without preserving approval verification", () => {
  const draft = emptyReviewDraft(1);
  draft.rows = [{ key: "row", purchaseId: "4e1615d3-5952-4c4e-b54b-25d0f3f9a421", itemId: "", rawCode: null, rawDescription: "", quantity: null, unit: "", unitPrice: null, extendedPrice: null, packQty: 0, packUnit: "", ignored: false, remember: true, newName: "", newUnit: "" }];
  const parsed = reviewDraftSchema.parse({ ...draft, rows: draft.rows.map(row => ({ ...row, verified: true })) });
  assert.equal("verified" in parsed.rows[0], false);
  assert.equal(parsed.rows[0].packQty, 0);
  assert.equal(reviewDraftSchema.parse({ ...draft, currency: "OTHER" }).currency, "USD", "An old currency choice cannot block saving");
  assert.equal(reviewDraftSchema.safeParse({ ...draft, usd: true }).success, false);
});

test("draft saves serialize edits made during a slow save", async () => {
  const initial = emptyReviewDraft(1), requests: number[] = [];
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const saver = new ReviewDraftSaver(initial, 0, async (_, revision) => { requests.push(revision); if (requests.length === 1) await gate; return revision + 1; }, () => {});
  saver.set({ ...initial, date: "2026-11-03" });
  const saving = saver.flush();
  saver.set({ ...initial, date: "2026-11-04" });
  assert.equal(saver.flush(), saving);
  release(); await saving;
  assert.deepEqual(requests, [0, 1]);
  assert.equal(saver.unsaved, false);
});

test("lost draft responses replay the original snapshot before newer edits", async () => {
  const initial = emptyReviewDraft(1), requests: string[] = [];
  const saver = new ReviewDraftSaver(initial, 0, async (payload, revision) => {
    requests.push(`${revision}:${payload.date}`);
    if (requests.length === 1) throw new Error("Response lost");
    return requests.length === 2 ? 1 : 2;
  }, () => {});
  saver.set({ ...initial, date: "2026-11-03" });
  await assert.rejects(saver.flush(), /lost/);
  saver.set({ ...initial, date: "2026-11-04" });
  await saver.flush();
  assert.deepEqual(requests, ["0:2026-11-03", "0:2026-11-03", "1:2026-11-04"]);
});

test("a stale tab stops saving without overwriting its visible draft", async () => {
  let requests = 0;
  const initial = emptyReviewDraft(1);
  const saver = new ReviewDraftSaver(initial, 2, async () => { requests++; throw new ReviewDraftConflict("Other tab"); }, () => {});
  saver.set({ ...initial, date: "2026-11-03" });
  await assert.rejects(saver.flush(), ReviewDraftConflict);
  saver.set({ ...initial, date: "2026-11-04" });
  await assert.rejects(saver.flush(), ReviewDraftConflict);
  assert.equal(requests, 1);
  assert.equal(saver.unsaved, true);
});


test("discarding a draft stops queued saves and navigation warnings even with a request in flight", async () => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  const draft = emptyReviewDraft(1);
  const saver = new ReviewDraftSaver(draft, 0, async () => { requests++; await gate; return 1; }, () => {});
  saver.set({ ...draft, date: "2026-11-03" });
  const pending = saver.flush();
  saver.set({ ...draft, date: "2026-11-04" });
  saver.abandon();
  assert.equal(saver.unsaved, false);
  release(); await pending; await saver.flush();
  assert.equal(requests, 1);
});
