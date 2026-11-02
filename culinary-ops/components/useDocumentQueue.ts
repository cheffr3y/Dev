"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { DocumentQueue, uploadDocument, type UploadState } from "@/lib/uploads/document-queue";

export function useDocumentQueue(endpoint: string, onReady: (id: string) => void) {
  const [entries, setEntries] = useState<UploadState[]>([]);
  const [queue] = useState(() => new DocumentQueue(
    (task, report) => uploadDocument(endpoint, task, report),
    entry => setEntries(previous => previous.some(item => item.key === entry.key) ? previous.map(item => item.key === entry.key ? entry : item) : [...previous, entry]),
  ));
  useEffect(() => () => queue.stop(), [queue]);
  const ready = useEffectEvent(onReady);
  const [notified] = useState(() => new Set<string>());
  useEffect(() => {
    for (const entry of entries) {
      if (entry.status === "ready" && entry.id && !notified.has(entry.key)) {
        notified.add(entry.key); ready(entry.id);
      }
    }
  }, [entries, notified]);
  function enqueue(files: File[], fields: [string, string][] = []) {
    for (const file of files) {
      const key = crypto.randomUUID();
      queue.add({ key, file, fields: [...fields, ["operationId", key]] });
    }
  }
  return { entries, enqueue, retry: (key: string) => queue.retry(key) };
}
