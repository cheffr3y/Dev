import { z } from "zod";

const id = z.string().max(150);
const numeric = z.number().finite().nullable();
// Drafts deliberately accept incomplete/invalid business values. Approval uses
// the existing, stricter purchase validator; no verification flags are saved.
export const reviewRowSchema = z.object({
  eachWeightOz: z.number().finite().nullable().optional(),
  key: id, purchaseId: z.string().uuid(), itemId: id,
  rawCode: z.string().max(100).nullable(), rawDescription: z.string().max(500),
  quantity: numeric, unit: z.string().max(40), unitPrice: numeric, extendedPrice: numeric,
  totalMode: z.enum(["calculated", "entered"]).optional(),
  packQty: numeric, packUnit: z.string().max(40), ignored: z.boolean(), remember: z.boolean(),
  newName: z.string().max(500), newUnit: z.string().max(40), manual: z.boolean().optional(),
});
export const reviewDraftSchema = z.object({
  version: z.literal(1), sourceRevision: z.number().int().nonnegative(),
  supplier: id, date: z.string().max(40), venue: id, selectedKey: id.nullable(),
  // Normalize older drafts that stored a currency choice. All invoices use USD.
  currency: z.unknown().transform(() => "USD" as const),
  editor: z.string().max(150).nullable(),
  manual: z.object({ key: z.string().max(200), id: z.string().max(150), lineRevision: z.number().int().nonnegative().nullable(), fields: z.record(z.string().max(60), z.string().max(1000)).refine(value => Object.keys(value).length <= 30) }).nullable(),
  showIgnored: z.boolean(), rows: z.array(reviewRowSchema).max(200),
  pending: z.array(z.object({ key: id, hash: z.string().max(5000), operationId: z.string().uuid() })).max(200),
  view: z.object({ page: z.number().int().min(1).max(20), zoom: z.union([z.literal(100), z.literal(150), z.literal(200)]), mobileSource: z.boolean() }),
}).strict();
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
export type ReviewRowDraft = z.infer<typeof reviewRowSchema>;
export type SavedReviewDraft = { revision: number; payload: ReviewDraft } | null;
export function emptyReviewDraft(sourceRevision: number): ReviewDraft {
  return { version: 1, sourceRevision, supplier: "", date: "", venue: "", currency: "USD", selectedKey: null, editor: null, manual: null, showIgnored: false, rows: [], pending: [], view: { page: 1, zoom: 100, mobileSource: false } };
}

export function serializeReviewDraft(payload: ReviewDraft): string {
  return JSON.stringify(payload, (_, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}

export type DraftSaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";
export class ReviewDraftConflict extends Error {}

/** Serialize saves and retain the expected revision on a lost response. */
export class ReviewDraftSaver {
  private latest: ReviewDraft;
  private saved: string;
  private running: Promise<void> | null = null;
  private blocked = false;
  private abandoned = false;
  private retry: ReviewDraft | null = null;
  constructor(payload: ReviewDraft, private revision: number,
    private request: (payload: ReviewDraft, revision: number) => Promise<number>,
    private changed: (state: DraftSaveState, message?: string) => void) {
    this.latest = payload;
    this.saved = serializeReviewDraft(payload);
  }
  abandon() { this.abandoned = true; this.retry = null; }
  set(payload: ReviewDraft) {
    if (this.abandoned) return;
    this.latest = payload;
    if (!this.blocked) this.changed(this.saved === serializeReviewDraft(payload) ? "saved" : "unsaved");
  }
  get hasSaved() { return this.revision > 0; }
  get unsaved() { return !this.abandoned && this.saved !== serializeReviewDraft(this.latest); }
  flush(): Promise<void> {
    if (this.abandoned) return Promise.resolve();
    if (this.blocked) return Promise.reject(new ReviewDraftConflict("This draft changed in another tab. Reload to use the saved draft."));
    if (this.running) return this.running;
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }
  private async drain() {
    try {
      while (!this.abandoned && (this.retry || this.unsaved)) {
        this.changed("saving");
        const payload = this.retry ?? this.latest, serialized = serializeReviewDraft(payload);
        this.retry = payload;
        this.revision = await this.request(payload, this.revision);
        this.saved = serialized;
        this.retry = null;
      }
      this.changed("saved");
    } catch (error) {
      this.blocked = error instanceof ReviewDraftConflict;
      this.changed(this.blocked ? "conflict" : "error", error instanceof Error ? error.message : "Draft could not be saved.");
      throw error;
    }
  }
}
