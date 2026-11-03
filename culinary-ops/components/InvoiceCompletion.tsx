"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/recipes/costing";
import { Button, Card } from "./ui";

export type InvoiceCompletionData = {
  id: string; reviewState: string; lineRevision: number; ocrRevision: number;
  saved: number; voided: number; ignored: number; foodTotal: number;
  accounting: "unconfirmed" | "current" | "changed" | "not_needed"; nextHref: string | null; inboxHref: string;
  changes: { id: string; name: string; before: number; after: number; unit: string }[];
  recipes: { id: string; name: string }[];
};
export function InvoiceCompletion({ data }: { data: InvoiceCompletionData }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  if (!["READY", "COMPLETE"].includes(data.reviewState)) return null;
  const complete = data.reviewState === "COMPLETE";
  return <Card className="mb-5 space-y-3 border-emerald-600/30 p-4" aria-label="Invoice completion summary">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{complete ? "Invoice review complete" : "Ready to finish review"}</h2><p className="mt-1 text-sm text-zinc-500">{data.saved} saved lines · {data.voided} voided · {data.ignored} ignored</p></div>
      {!complete && <Button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const response = await fetch("/api/invoice-review-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id, lineRevision: data.lineRevision, ocrRevision: data.ocrRevision }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); router.refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Could not finish review. Retry."); } finally { setBusy(false); } }}> {busy ? "Finishing…" : "Finish invoice review"}</Button>}
    </div>
    <p className="text-sm">Food-line total <strong className="tabular-nums">{money(data.foodTotal / 100)}</strong> · {data.accounting === "not_needed" ? "No food lines to confirm" : data.accounting === "current" ? "Accounting total confirmed" : data.accounting === "changed" ? "Accounting total needs reconfirmation" : "Accounting total not yet confirmed"}</p>
    <details><summary className="cursor-pointer text-sm">{data.changes.length} ingredient {data.changes.length===1?"price":"prices"} changed · {data.recipes.length} affected {data.recipes.length===1?"recipe":"recipes"}</summary><div className="mt-3 space-y-2 text-sm">{data.changes.map(change => <p key={`${change.id}:${change.unit}`}><Link href={`/items/${change.id}`} className="text-blue-600 underline">{change.name}</Link> · {money(change.before, 5)} → {money(change.after, 5)} / {change.unit}</p>)}<div className="flex flex-wrap gap-3">{data.recipes.map(recipe => <Link className="text-blue-600 underline" key={recipe.id} href={`/recipes/${recipe.id}`}>{recipe.name}</Link>)}</div>{!data.changes.length && <p className="text-zinc-500">No catalog price changes were recorded for this invoice.</p>}</div></details>
    <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="text-blue-600 underline" onClick={() => { const details = document.getElementById("invoice-accounting") as HTMLDetailsElement | null; if (details) { details.open = true; details.scrollIntoView({ block: "start" }); } }}>Review food total / saved lines</button>{complete && data.nextHref && <Link className="font-medium text-blue-600 underline" href={data.nextHref}>Review next invoice →</Link>}<Link href={data.inboxHref} className="text-blue-600 underline">Back to invoice inbox</Link></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </Card>;
}
