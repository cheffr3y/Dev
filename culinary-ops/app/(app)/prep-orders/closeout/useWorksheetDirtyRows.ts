"use client";
import { useCallback, useEffect, useState } from "react";
export function useWorksheetDirtyRows() {
  const [dirtyRows, setDirtyRows] = useState<Record<string, boolean>>({});
  const dirty = Object.values(dirtyRows).some(Boolean);
  const markDirty = useCallback(
    (id: string, value: boolean) =>
      setDirtyRows((previous) => ({ ...previous, [id]: value })),
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    const question = "You have unsaved prep results. Leave this worksheet?";
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !target ||
        target.getAttribute("target") === "_blank" ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (!window.confirm(question)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const submit = (event: Event) => {
      if (
        event.target instanceof HTMLFormElement &&
        !event.target.dataset.worksheetRow &&
        !window.confirm(question)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        return;
      }
      if (!window.confirm(question)) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(1);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      window.removeEventListener("popstate", pop, true);
    };
  }, [dirty]);
  return { dirty, markDirty };
}
