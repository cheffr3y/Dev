"use client";
import { useState } from "react";
import { ComboPicker } from "./ComboPicker";
import { Button } from "./ui";

export function IngredientMergePicker({ items, sourceId = "" }: { items: { id: string; name: string; meta: string }[]; sourceId?: string }) {
  const [source, setSource] = useState(sourceId);
  const [target, setTarget] = useState("");
  const options = items.map(item => ({ id: item.id, label: item.name, meta: item.meta }));
  return <form action="/items/merge" method="get" className="grid gap-4 sm:grid-cols-2">
    <label className="block text-sm"><span className="mb-2 block font-medium">Ingredient to replace</span><ComboPicker name="source" options={options} defaultId={sourceId} placeholder="Find an old / duplicate ingredient…" onSelect={option => setSource(option?.id ?? "")} /></label>
    <label className="block text-sm"><span className="mb-2 block font-medium">Keep / replace with</span><ComboPicker name="target" options={options.filter(option => option.id !== source)} placeholder="Find the ingredient to keep…" onSelect={option => setTarget(option?.id ?? "")} /></label>
    <div className="sm:col-span-2"><Button type="submit" disabled={!source || !target || source === target}>Compare usage and changes →</Button></div>
  </form>;
}
