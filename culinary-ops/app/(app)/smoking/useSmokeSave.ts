"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Payload } from "./smoke-form-data";
export function useSave() {
  const router = useRouter(),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    request = useRef<{ key: string; id: string } | null>(null);
  async function save(
    payload: Payload | FormData,
    success?: (id: string) => void,
  ) {
    if (pending) return false;
    setPending(true);
    setMessage("");
    const key =
      payload instanceof FormData
        ? JSON.stringify(
            Array.from(payload.entries()).map(([k, v]) => [
              k,
              v instanceof File ? `${v.name}:${v.size}:${v.lastModified}` : v,
            ]),
          )
        : JSON.stringify(payload);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (payload instanceof FormData) {
        payload.set("operationId", request.current.id);
        body = payload;
      } else {
        body = JSON.stringify({ ...payload, operationId: request.current.id });
        headers = { "Content-Type": "application/json" };
      }
      const response = await fetch("/api/smoking", {
          method: "POST",
          body,
          headers,
        }),
        result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save.");
      request.current = null;
      setMessage("Saved.");
      router.refresh();
      success?.(result.id);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection interrupted. Your entries are retained; retry to check the same request.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  return { save, pending, message };
}
