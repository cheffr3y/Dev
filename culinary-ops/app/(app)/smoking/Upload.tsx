"use client";
import { useRouter } from "next/navigation";
import type { RunView } from "@/lib/smoking/view";
import { useDocumentQueue } from "@/components/useDocumentQueue";
import { DocumentQueueStatus } from "@/components/DocumentQueueStatus";
export function Upload({ run, lotId = null }: { run: RunView; lotId?: string | null }) {
  const router = useRouter();
  const { entries, enqueue, retry } = useDocumentQueue("/api/smoking", () => router.refresh());
  return <form aria-label="Attach smoking photo" className="smoke-form" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const files = new FormData(form).getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
    enqueue(files, [["runId", run.id], ["lotId", lotId ?? ""]]);
    form.reset();
  }}>
    <label>Photo / supporting PDF (under 8 MB)
      <input type="file" name="file" multiple accept="image/png,image/jpeg,application/pdf" required />
    </label>
    <button>Attach source document</button>
    <p className="smoke-muted">Select multiple files to queue them for this run or lot. Keep this page open until the queue finishes.</p>
    <DocumentQueueStatus entries={entries} retry={retry} />
  </form>;
}
