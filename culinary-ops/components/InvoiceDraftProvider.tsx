"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { emptyReviewDraft, serializeReviewDraft, ReviewDraftConflict, ReviewDraftSaver, type DraftSaveState, type ReviewDraft, type SavedReviewDraft } from "@/lib/invoices/review-draft";
import { Button } from "./ui";

type DraftContext = { draft: ReviewDraft; update: (change: (previous: ReviewDraft) => ReviewDraft) => void; flush: () => Promise<void>; recovered: boolean };
const Context = createContext<DraftContext | null>(null);
export function useInvoiceDraft() {
  const context = useContext(Context);
  if (!context) throw new Error("Invoice review needs its draft provider.");
  return context;
}

export function InvoiceDraftProvider({ documentId, sourceRevision, initial, children }: { documentId: string; sourceRevision: number; initial: SavedReviewDraft; children: ReactNode }) {
  const [draft, setDraft] = useState(() => initial?.payload.sourceRevision === sourceRevision ? initial.payload : { ...emptyReviewDraft(sourceRevision), supplier: initial?.payload.supplier ?? "", date: initial?.payload.date ?? "", venue: initial?.payload.venue ?? "" });
  const current = useRef(draft);
  const [recovered] = useState(() => !!initial && initial.payload.sourceRevision === sourceRevision && (!!initial.payload.rows.length || !!initial.payload.manual));
  const [save, setSave] = useState<{ state: DraftSaveState; message?: string }>({ state: "saved" });
  const [saver] = useState(() => new ReviewDraftSaver(draft, initial?.revision ?? 0, async (payload, expectedRevision) => {
    const response = await fetch("/api/invoice-review-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, expectedRevision, payload }), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (response.status === 409) throw new ReviewDraftConflict(result.error);
    if (!response.ok || !result.ok) throw new Error(result.error || "Draft could not be saved. Retry to keep your changes.");
    return result.revision;
  }, (state, message) => setSave({ state, message })));
  const update = useCallback((change: (previous: ReviewDraft) => ReviewDraft) => {
    const next = change(current.current);
    if (serializeReviewDraft(next) === serializeReviewDraft(current.current)) return;
    current.current = next;
    saver.set(next);
    setDraft(next);
  }, [saver]);
  useEffect(() => {
    const timer = setTimeout(() => { if (saver.unsaved) void saver.flush().catch(() => {}); }, 400);
    return () => clearTimeout(timer);
  }, [draft, saver]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saver.unsaved) { event.preventDefault(); event.returnValue = ""; } };
    const leaving = () => { void saver.flush().catch(() => {}); };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", leaving);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("pagehide", leaving); leaving(); };
  }, [saver]);
  const failed = save.state === "error" || save.state === "conflict";
  return <Context.Provider value={{ draft, update, flush: () => saver.flush(), recovered }}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Invoice draft status">
      <p role={failed ? "alert" : "status"} className={failed ? "text-amber-700" : "text-zinc-500"}>{failed ? save.message : save.state === "saved" ? saver.hasSaved ? "Draft saved to your account" : "No unsaved draft changes" : save.state === "saving" ? "Saving draft…" : "Unsaved draft changes"}</p>
      {save.state === "error" && <Button type="button" variant="secondary" onClick={() => { void saver.flush().catch(() => {}); }}>Retry draft save</Button>}
      {save.state === "conflict" && <Button type="button" variant="secondary" onClick={() => window.location.reload()}>Reload saved draft</Button>}
    </div>
    {children}
  </Context.Provider>;
}
