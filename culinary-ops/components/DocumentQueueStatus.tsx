"use client";
import Link from "next/link";
import type { UploadState } from "@/lib/uploads/document-queue";
export function DocumentQueueStatus({ entries, retry, href }: { entries: UploadState[]; retry: (key: string) => void; href?: (id: string) => string }) {
  return <ul aria-label="File queue" className="space-y-3">{entries.map(entry => <li key={entry.key} className="rounded border border-hairline p-3">
    <p className="break-words font-medium">{entry.filename}</p>
    <p role={entry.status === "error" ? "alert" : "status"}>{entry.message}</p>
    {entry.status === "working" && <progress className="w-full" aria-label={`Progress for ${entry.filename}`} max={entry.total ?? 1} value={entry.completed} />}
    {entry.status === "error" && <button type="button" className="mt-2 underline" onClick={() => retry(entry.key)}>Retry {entry.filename}</button>}
    {entry.id && href && <Link className="mt-2 inline-block underline" href={href(entry.id)}>Review {entry.filename}</Link>}
  </li>)}</ul>;
}
