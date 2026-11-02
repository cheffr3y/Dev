"use client";
import { useRef, useState } from "react";
import type { Editing } from "./ShiftEditor";
export function useScheduleGridNavigation() {
  const [editing, setEditing] = useState<Editing | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  function openEditor(next: Editing, trigger: HTMLElement) {
    lastFocused.current = trigger;
    setEditing(next);
  }
  function closeEditor() {
    setEditing(null);
    // Return focus to the cell that opened the dialog.
    lastFocused.current?.focus();
  }

  return { editing, openEditor, closeEditor };
}
