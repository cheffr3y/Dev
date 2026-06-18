"use client";

import { useRef, useState } from "react";

let uid = 0;
const nextId = () => `step-${uid++}`;

type Step = { id: string; text: string };

// Inline, reorderable method editor. Each step renders a real <input> bound to
// the recipe form (via `form="recipeForm"`) so the existing "Save changes"
// button persists the method alongside the rest of the recipe details.
export function MethodEditor({ initialSteps }: { initialSteps: string[] }) {
  const [steps, setSteps] = useState<Step[]>(() =>
    (initialSteps.length ? initialSteps : [""]).map((text) => ({ id: nextId(), text })),
  );
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function update(id: string, text: string) {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, text } : st)));
  }
  function remove(id: string) {
    setSteps((s) => (s.length > 1 ? s.filter((st) => st.id !== id) : [{ id: nextId(), text: "" }]));
  }
  function add() {
    setSteps((s) => [...s, { id: nextId(), text: "" }]);
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
              "flex items-center gap-2 rounded-sm " +
              (overIndex === i ? "ring-1 ring-form-focus" : "")
            }
          >
            <span
              className="cursor-grab select-none px-1 text-zinc-400 hover:text-zinc-600"
              aria-hidden
              title="Drag to reorder"
            >
              ⠿
            </span>
            <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400">
              {i + 1}.
            </span>
            <input
              name="step"
              form="recipeForm"
              value={step.text}
              onChange={(e) => update(step.id, e.target.value)}
              placeholder={`Step ${i + 1}…`}
              className="w-full rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm text-ink placeholder:text-zinc-400 focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-form-focus"
            />
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
