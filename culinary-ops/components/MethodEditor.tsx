"use client";

import { useRef, useState } from "react";

import { joinStep, splitStep } from "@/lib/method";

let uid = 0;
const nextId = () => `step-${uid++}`;

type Step = { id: string; action: string; detail: string };

// Inline, reorderable method editor. Each step has a short bold "action" label
// (e.g. "Build Roux") plus the detail, combined into a single line that posts
// via a hidden `step` field bound to the recipe form (via `form="recipeForm"`)
// so the existing "Save changes" button persists the method alongside the rest
// of the recipe details.
export function MethodEditor({ initialSteps }: { initialSteps: string[] }) {
  const [steps, setSteps] = useState<Step[]>(() =>
    (initialSteps.length ? initialSteps : [""]).map((text) => {
      const { action, detail } = splitStep(text);
      return { id: nextId(), action, detail };
    }),
  );
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function update(id: string, patch: Partial<Pick<Step, "action" | "detail">>) {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  }
  function remove(id: string) {
    setSteps((s) =>
      s.length > 1 ? s.filter((st) => st.id !== id) : [{ id: nextId(), action: "", detail: "" }],
    );
  }
  function add() {
    setSteps((s) => [...s, { id: nextId(), action: "", detail: "" }]);
  }
  function move(from: number, to: number) {
    if (from === to) return;
    setSteps((s) => {
      const next = [...s];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div className="p-4">
      <ul className="space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.id}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(i);
            }}
            onDrop={() => {
              if (dragIndex.current != null) move(dragIndex.current, i);
              dragIndex.current = null;
              setOverIndex(null);
            }}
            onDragEnd={() => {
              dragIndex.current = null;
              setOverIndex(null);
            }}
            className={
              "flex items-start gap-2 rounded-sm " +
              (overIndex === i ? "ring-1 ring-form-focus" : "")
            }
          >
            <span
              className="cursor-grab select-none px-1 pt-2 text-zinc-400 hover:text-zinc-600"
              aria-hidden
              title="Drag to reorder"
            >
              ⠿
            </span>
            <span className="w-6 shrink-0 pt-2 text-right font-mono text-xs tabular-nums text-zinc-400">
              {i + 1}.
            </span>
            {/* Combined value the form actually submits. */}
            <input type="hidden" name="step" form="recipeForm" value={joinStep(step.action, step.detail)} />
            <div className="flex w-full flex-col gap-1 sm:flex-row sm:items-stretch">
              <input
                value={step.action}
                onChange={(e) => update(step.id, { action: e.target.value })}
                placeholder="Action"
                aria-label={`Step ${i + 1} action`}
                className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus sm:w-40 sm:shrink-0"
              />
              <input
                value={step.detail}
                onChange={(e) => update(step.id, { detail: e.target.value })}
                placeholder={`Step ${i + 1} details…`}
                aria-label={`Step ${i + 1} details`}
                className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(step.id)}
              title="Delete step"
              className="shrink-0 rounded-sm p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                <path d="M6 7h12M9 7V5h6v2m-1 0v12H8V7m2 3v6m4-6v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-3 w-full rounded-sm border border-dashed border-zinc-300 py-2 text-sm font-medium text-zinc-500 transition-colors hover:border-ink hover:text-ink"
      >
        + Add Step
      </button>
    </div>
  );
}
