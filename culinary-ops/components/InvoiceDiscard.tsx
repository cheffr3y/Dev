"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInvoiceDraft } from "./InvoiceDraftProvider";
import { Button } from "./ui";
import { money } from "@/lib/recipes/costing";

export function InvoiceDiscard({ documentId, filename, lineRevision, ocrRevision, savedLines, expense }: {
  documentId: string; filename: string; lineRevision: number; ocrRevision: number; savedLines: number;
  expense: { revision: number; active: boolean; amountCents: number } | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null), router = useRouter(), { abandon } = useInvoiceDraft();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function discard() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invoice-discard", { method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, lineRevision, ocrRevision, expenseRevision: expense?.revision ?? null }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not discard this invoice.");
      abandon(); dialog.current?.close();
      router.replace("/invoices?discarded=1#invoice-upload"); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not discard this invoice."); setBusy(false); }
  }
  return <div className="mb-4 flex justify-end">
    <Button type="button" variant="secondary" disabled={busy} onClick={() => { setError(""); dialog.current?.showModal(); }}>Discard invoice &amp; start over</Button>
    <dialog ref={dialog} aria-labelledby="discard-invoice-title" aria-describedby="discard-invoice-description" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-hairline bg-canvas p-5 text-ink shadow-xl backdrop:bg-black/60" onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id="discard-invoice-title" className="text-lg font-semibold">Discard this invoice and start over?</h2>
      <div id="discard-invoice-description" className="my-4 space-y-3 text-sm">
        <p className="break-words">{filename}</p>
        <p>This removes the invoice from your inbox and clears all draft entries, OCR results and review choices. Upload the same file or a different invoice to start fresh.</p>
        {savedLines > 0 && <p>{savedLines} saved {savedLines === 1 ? "line will" : "lines will"} be voided and ingredient costs recalculated from the remaining purchases.</p>}
        {expense?.active && <p>The linked {money(expense.amountCents / 100)} food spending entry will be voided and its day reopened for review.</p>}
        <p className="text-zinc-500">Supplier matches stay available. Saved purchase and accounting history is retained.</p>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Keep working</Button><Button type="button" disabled={busy} onClick={() => void discard()}>{busy ? "Discarding…" : "Discard & upload again"}</Button></div>
    </dialog>
  </div>;
}
