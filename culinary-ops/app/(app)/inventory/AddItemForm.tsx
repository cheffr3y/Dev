"use client";

import { useState } from "react";
import { ComboPicker, type ComboOption } from "@/components/ComboPicker";
import { Button, Field, Input } from "@/components/ui";
import { addInventoryItem } from "./actions";

type Item = { id: string; name: string; unit: string };

// Add an item to a venue's inventory. Searchable item picker in place of the
// old long dropdown; the counts stay disabled until an item is chosen.
export function AddItemForm({ venueId, items }: { venueId: string; items: Item[] }) {
  const [picked, setPicked] = useState(false);

  const options: ComboOption[] = items.map((it) => ({ id: it.id, label: it.name, meta: it.unit }));

  return (
    <form action={addInventoryItem} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="venueId" value={venueId} />
      <div className="min-w-[200px] flex-1">
        <Field label="Item">
          <ComboPicker options={options} name="itemId" placeholder="Search items…" onSelect={(o) => setPicked(!!o)} />
        </Field>
      </div>
      <div className="w-24">
        <Field label="On Hand">
          <Input name="quantity" type="number" step="0.01" min="0" defaultValue={0} disabled={!picked} />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Par">
          <Input name="par" type="number" step="0.01" min="0" defaultValue={0} disabled={!picked} />
        </Field>
      </div>
      <div className="w-24">
        <Field label="Unit">
          <Input name="unit" defaultValue="each" disabled={!picked} />
        </Field>
      </div>
      <Button type="submit" disabled={!picked}>
        Add
      </Button>
    </form>
  );
}
