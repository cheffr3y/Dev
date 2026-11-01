"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockBanquetBaseline } from "../../setup-actions";

export function LockBaseline({ id, expected }: { id: string; expected: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <div className="no-print mb-4 rounded border border-hairline p-3 text-sm">
    <p>Lock the saved BEO and setup as the reference for future changes. Save any setup edits first.</p>
    <button disabled={pending} className="mt-2 rounded border px-3 py-2 disabled:opacity-50" onClick={() => start(async () => {
      try { const result = await lockBanquetBaseline(id, expected); setMessage(result.error ?? "Baseline locked."); if (!result.error) router.refresh(); }
      catch { setMessage("Unable to lock baseline. Reload and try again."); }
    })}>{pending ? "Locking…" : "Lock BEO baseline"}</button>
    <p role="status">{message}</p>
  </div>;
}
