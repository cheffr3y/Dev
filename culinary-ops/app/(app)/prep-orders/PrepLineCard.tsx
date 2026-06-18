"use client";

import Link from "next/link";
import { useState } from "react";
import { num } from "@/lib/costing";
import { unitLabel, UNIT_OPTIONS } from "@/lib/units";
import { Badge } from "@/components/ui";
import { prepStatusLabel, PREP_STATUS_COLOR, type PrepStatus } from "@/lib/prep";
import { updatePrepLine, removePrepLine } from "./actions";

export type PrepLineCardData = {
  id: string;
  recipeId: string;
  recipeName: string;
  prodCode: string;
  requestedQty: number;
  requestedUnit: string;
  destinationVenueId: string;
  destinationVenueName: string;
  status: string;
  lot: string | null;
  actualQty: number | null;
  actualUnit: string | null;
  split: boolean;
};

export function PrepLineCard({
  line,
  orderId,
  venues,
  canManage,
}: {
  line: PrepLineCardData;
  orderId: string;
  venues: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const editable = canManage && line.status === "REQUESTED";

  if (editing) {
    return (
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <form
          action={updatePrepLine}
          onSubmit={() => setEditing(false)}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="id" value={line.id} />
          <input type="hidden" name="prepOrderId" value={orderId} />
          <span className="min-w-[140px] flex-1 truncate text-sm font-medium text-zinc-700">
            {line.recipeName} <span className="font-mono text-[11px] text-zinc-400">({line.prodCode})</span>
          </span>
          <select
            name="destinationVenueId"
            defaultValue={line.destinationVenueId}
            className="w-40 rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input
            name="requestedQty"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={num(line.requestedQty)}
            className="w-24 rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm"
          />
          <select
            name="requestedUnit"
            defaultValue={line.requestedUnit}
            className="w-28 rounded-sm border border-zinc-300 bg-canvas px-3 py-2 text-sm"
          >
            {UNIT_OPTIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-hairline bg-canvas px-4 py-2 text-sm text-zinc-600 hover:border-ink"
          >
            Cancel
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-hairline bg-canvas p-4">
      <div className="min-w-0">
        <p className="text-zinc-900">
          <Link href={`/recipes/${line.recipeId}`} className="font-medium hover:underline">
            {line.recipeName}
          </Link>{" "}
          <span className="font-mono text-[12px] text-zinc-400">({line.prodCode})</span>
          {line.split && (
            <span className="ml-2 align-middle">
              <Badge color="blue">split</Badge>
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {line.destinationVenueName} · {num(line.requestedQty)} {unitLabel(line.requestedUnit)}
          {line.lot && (
            <>
              {" · "}
              <span className="font-mono text-zinc-600">{line.lot}</span>
            </>
          )}
          {line.actualQty != null && (
            <>
              {" · actual "}
              {num(line.actualQty)} {unitLabel(line.actualUnit ?? "")}
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge color={PREP_STATUS_COLOR[line.status as PrepStatus]}>{prepStatusLabel(line.status)}</Badge>
        {editable && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full border border-hairline bg-canvas px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              Edit
            </button>
            <form action={removePrepLine}>
              <input type="hidden" name="id" value={line.id} />
              <input type="hidden" name="prepOrderId" value={orderId} />
              <button className="text-sm text-red-500 hover:underline">remove</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
