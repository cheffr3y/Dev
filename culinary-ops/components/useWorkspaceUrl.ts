"use client";
import { useSearchParams } from "next/navigation";
import { patchUrl } from "@/lib/workspace/url-state";

export function useWorkspaceUrl() {
  const params = useSearchParams();
  function update(values: Record<string, string | string[] | null>, replace = false) {
    const href = patchUrl(window.location.href, values);
    if (href === window.location.pathname + window.location.search + window.location.hash) return;
    window.history[replace ? "replaceState" : "pushState"](null, "", href);
  }
  return { params, update };
}
