"use client";
import type { ReactNode } from "react";
import { useSave } from "./useSmokeSave";
import type { Payload } from "./smoke-form-data";
export function SaveForm({
  label,
  children,
  onSave,
  button = "Save record",
  className = "",
}: {
  label: string;
  children: ReactNode;
  onSave: (form: FormData) => Payload;
  button?: string;
  className?: string;
}) {
  const { save, pending, message } = useSave();
  return (
    <form
      aria-label={label}
      className={`smoke-form ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await save(onSave(new FormData(form)));
      }}
    >
      <fieldset disabled={pending}>{children}</fieldset>
      <div className="smoke-actions">
        <button disabled={pending}>{pending ? "Saving…" : button}</button>
        <p role="status">{message}</p>
      </div>
    </form>
  );
}
