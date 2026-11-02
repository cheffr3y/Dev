"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPrepOperation } from "./workflow-actions";
export function useSubmission(initialKey: string) {
  const [key, setKey] = useState(initialKey),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function send(kind: string, payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await submitPrepOperation(kind, key, payload);
      if (!r.ok) {
        setError(r.error ?? "Unable to save");
        return false;
      } else {
        setKey(crypto.randomUUID());
        router.refresh();
        return true;
      }
    } catch {
      setError(
        "Connection interrupted. Retry to retrieve the original result.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, error, busy };
}
