"use client";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
export type InspectorTarget = { kind: "recipe" | "item"; id: string };
export const InspectorContext = createContext<((target: InspectorTarget, opener: HTMLElement) => void) | null>(null);
export function InspectorLink({ kind, id, children, className = "hover:underline" }: InspectorTarget & { children: ReactNode; className?: string }) {
  const inspect = useContext(InspectorContext);
  return <Link href={`/${kind === "recipe" ? "recipes" : "items"}/${id}`} className={className} onClick={event => {
    if (!inspect || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); inspect({ kind, id }, event.currentTarget);
  }}>{children}</Link>;
}
