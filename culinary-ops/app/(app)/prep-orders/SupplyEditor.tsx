"use client";
import { VenueOptions } from "@/components/VenueOptions";
import { Field, Input, Select } from "@/components/ui";
import type { Supply } from "@/lib/prep/prep-costing";
import type { Venue, Item } from "./entry-types";
export function SupplyEditor({
  venues,
  items,
  value,
  onChange,
  allowShared = true,
}: {
  venues: Venue[];
  items: Item[];
  allowShared?: boolean;
  value: Supply[];
  onChange: (s: Supply[]) => void;
}) {
  return (
    <div className="my-3 space-y-2">
      <p className="text-sm">Venue-supplied ingredients</p>
      {value.map((s, i) => (
        <div key={i} className="grid gap-2 rounded border p-3 sm:grid-cols-3">
          <Field label="Ingredient">
            <Select
              aria-label="Supplied ingredient"
              required
              value={s.itemId}
              onChange={(e) =>
                onChange(
                  value.map((v, j) =>
                    j === i
                      ? {
                          ...v,
                          itemId: e.target.value,
                          unit:
                            items.find((x) => x.id === e.target.value)?.unit ??
                            "",
                        }
                      : v,
                  ),
                )
              }
            >
              <option value="">Ingredient</option>
              {items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplied by">
            <Select
              aria-label="Source venue"
              required
              value={s.venueId}
              onChange={(e) =>
                onChange(
                  value.map((v, j) =>
                    j === i ? { ...v, venueId: e.target.value } : v,
                  ),
                )
              }
            >
              <option value="">Source venue</option>
              <VenueOptions venues={venues} current={venues.find(venue => venue.id === s.venueId)} />
            </Select>
          </Field>
          <Field label="Quantity supplied">
            <Input
              aria-label="Supplied quantity"
              type="number"
              step="any"
              min="0.000001"
              required
              value={s.quantity || ""}
              onChange={(e) =>
                onChange(
                  value.map((v, j) =>
                    j === i ? { ...v, quantity: Number(e.target.value) } : v,
                  ),
                )
              }
            />
          </Field>
          <Field label="Unit">
            <Input
              aria-label="Supplied unit"
              required
              value={s.unit}
              onChange={(e) =>
                onChange(
                  value.map((v, j) =>
                    j === i ? { ...v, unit: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          <Field label="Note">
            <Input
              aria-label="Supply note"
              required
              placeholder="Supply note"
              value={s.note}
              onChange={(e) =>
                onChange(
                  value.map((v, j) =>
                    j === i ? { ...v, note: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          {allowShared && (
            <label className="text-sm">
              <input
                type="checkbox"
                checked={s.shared}
                onChange={(e) =>
                  onChange(
                    value.map((v, j) =>
                      j === i ? { ...v, shared: e.target.checked } : v,
                    ),
                  )
                }
              />{" "}
              Shared across venues — hold for review
            </label>
          )}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            Remove ingredient
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-blue-700"
        onClick={() =>
          onChange([
            ...value,
            {
              itemId: "",
              venueId: venues.length === 1 ? venues[0].id : "",
              quantity: 0,
              unit: "",
              note: "",
              shared: false,
            },
          ])
        }
      >
        + Supplied ingredient
      </button>
    </div>
  );
}
