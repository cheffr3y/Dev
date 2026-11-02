"use client";

import { VenueOptions } from "@/components/VenueOptions";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { RecipePicker } from "@/components/RecipePicker";
import { convertQty } from "@/lib/recipes/units";
import type { Supply } from "@/lib/prep/prep-costing";
import type { Recipe, Venue, Item, Request } from "./entry-types";
import { SupplyEditor } from "./SupplyEditor";
import { useSubmission } from "./usePrepSubmission";
const optional = (f: FormData, name: string) => {
  const v = f.get(name);
  return v === null || v === "" ? null : Number(v);
};
export function EntryForm({
  mode,
  date,
  operationKey,
  recipes,
  venues,
  items,
  requests = [],
  correction,
}: {
  mode: "CONFIRM" | "PICKUP";
  date: string;
  operationKey: string;
  recipes: Recipe[];
  venues: Venue[];
  items: Item[];
  requests?: Request[];
  correction?: { transferId: string };
}) {
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? ""),
    [quantity, setQuantity] = useState("");
  const [productionSupplies, setProductionSupplies] = useState<Supply[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [omitted, setOmitted] = useState<Record<string, boolean>>({});
  const [wasteQty, setWasteQty] = useState(0);
  const [extraQty, setExtraQty] = useState(0);
  const [supplies, setSupplies] = useState<Supply[]>([]),
    [requestSupplies, setRequestSupplies] = useState<Record<string, Supply[]>>(
      {},
    );
  const r = recipes.find((r) => r.id === recipeId),
    rows = requests.filter((l) => l.recipeId === recipeId);
  const { send, error, busy } = useSubmission(operationKey);
  const delivered =
    rows
      .filter((l) => !omitted[l.id])
      .reduce(
        (sum, l) =>
          sum +
          (quantities[l.id] ??
            convertQty(l.quantity, l.unit, r?.yieldUnit ?? l.unit) ??
            0),
        0,
      ) + extraQty;
  const kept = Number(quantity) - delivered - wasteQty;
  const standard =
    r?.productionPersonMinutes == null
      ? null
      : (r.productionPersonMinutes * Number(quantity)) / r.yieldQty;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        let saved = false;
        const base = {
          date: String(f.get("date")),
          recipeId,
          quantity: Number(quantity),
          unit: r?.yieldUnit,
          productionOverride: optional(f, "productionOverride"),
          dishwasherMinutes: optional(f, "dishwasherMinutes"),
          ...(optional(f, "productionRate") != null
            ? { productionRate: optional(f, "productionRate") }
            : {}),
          ...(optional(f, "dishwasherRate") != null
            ? { dishwasherRate: optional(f, "dishwasherRate") }
            : {}),
        };
        if (mode === "PICKUP") {
          const pickup = {
            ...base,
            venueId: String(f.get("venueId")),
            supplies,
          };
          saved = await send(
            correction ? "CORRECTION" : "PICKUP",
            correction
              ? {
                  transferId: correction.transferId,
                  date: base.date,
                  reason: String(f.get("reason")),
                  replacement: pickup,
                }
              : pickup,
          );
        } else
          saved = await send("CONFIRM", {
            ...base,
            cookName: String(f.get("cookName")),
            ...(f.get("lot") ? { lot: String(f.get("lot")) } : {}),
            waste: Number(f.get("waste") || 0),
            wasteReason: String(f.get("wasteReason") || ""),
            productionSupplies: productionSupplies.map((s) => ({
              ...s,
              shared: true,
            })),
            deliveries: [
              ...rows
                .filter((l) => f.get(`select_${l.id}`) === "on")
                .map((l) => ({
                  requestLineId: l.id,
                  venueId: l.venueId,
                  quantity: Number(f.get(`qty_${l.id}`)),
                  shortageNote: String(f.get(`note_${l.id}`) || ""),
                  supplies: requestSupplies[l.id] ?? [],
                })),
              ...(Number(f.get("extraQuantity")) > 0
                ? [
                    {
                      venueId: String(f.get("extraVenue")),
                      quantity: Number(f.get("extraQuantity")),
                      supplies,
                    },
                  ]
                : []),
            ],
          });
        if (saved) {
          form.reset();
          setQuantity("");
          setQuantities({});
          setOmitted({});
          setWasteQty(0);
          setExtraQty(0);
          setSupplies([]);
          setRequestSupplies({});
          setProductionSupplies([]);
        }
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Recipe / item">
          <RecipePicker
            recipes={recipes}
            defaultId={recipeId}
            onSelect={(recipe) => {
              setRecipeId(recipe?.id ?? "");
              setQuantity("");
              setQuantities({});
              setOmitted({});
              setExtraQty(0);
              setWasteQty(0);
              setProductionSupplies([]);
              setSupplies([]);
              setRequestSupplies({});
            }}
          />
        </Field>
        <Field
          label={
            mode === "CONFIRM"
              ? `Actual production (${r?.yieldUnit ?? ""})`
              : `Quantity handed out (${r?.yieldUnit ?? ""})`
          }
        >
          <Input
            type="number"
            step="any"
            min={mode === "CONFIRM" || correction ? 0 : 0.000001}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field
          label={
            mode === "CONFIRM"
              ? "Production date"
              : "Transfer / adjustment date"
          }
        >
          <Input
            name="date"
            type="date"
            required
            defaultValue={date}
            readOnly={mode === "CONFIRM"}
          />
        </Field>
        {mode === "CONFIRM" ? (
          <>
            <Field label="Cook">
              <Input name="cookName" required />
            </Field>
            <Field
              label="Actual lot"
              hint="Leave blank to use the selected requests’ printed lot."
            >
              <Input name="lot" />
            </Field>
            <Field label="Production waste">
              <Input
                name="waste"
                onChange={(e) => setWasteQty(Number(e.target.value))}
                type="number"
                step="any"
                min="0"
                defaultValue="0"
              />
            </Field>
            <Field label="Waste reason">
              <Input name="wasteReason" />
            </Field>
          </>
        ) : (
          <Field label="Receiving venue">
            <Select name="venueId" required>
              <VenueOptions venues={venues} />
            </Select>
          </Field>
        )}
        <Field
          label="Production person-minutes"
          hint={`Recipe standard: ${standard == null ? "missing" : standard.toFixed(2)}. Leave blank to use standard; zero is explicit.`}
        >
          <Input
            name="productionOverride"
            type="number"
            min="0"
            step="any"
            placeholder={standard?.toFixed(2) ?? "Missing"}
          />
        </Field>
        <Field
          label="Dishwasher minutes"
          hint="Per item. Blank is pending; enter 0 for none."
        >
          <Input name="dishwasherMinutes" type="number" min="0" step="any" />
        </Field>
      </div>
      <details>
        <summary className="text-sm">Manager rate overrides</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field
            label="Production hourly rate"
            hint="$62/3 (approximately $20.67) by default"
          >
            <Input name="productionRate" type="number" min="0" step="any" />
          </Field>
          <Field label="Dishwasher hourly rate" hint="$18 by default">
            <Input name="dishwasherRate" type="number" min="0" step="any" />
          </Field>
        </div>
      </details>
      {mode === "CONFIRM" ? (
        <>
          <p className="text-sm">
            Select the requests fulfilled by this batch. Enter quantities sent
            in {r?.yieldUnit}. A short or zero delivery closes the selected
            request with a required note. Kept = made − sent − waste.
          </p>
          <p
            aria-live="polite"
            className={
              kept < 0 ? "font-semibold text-red-700" : "font-semibold"
            }
          >
            Sent {delivered.toFixed(2)} {r?.yieldUnit} · Kept {kept.toFixed(2)}{" "}
            {r?.yieldUnit}
            {kept < 0 ? " — exceeds actual output" : ""}
          </p>
          {rows.map((l) => (
            <div key={l.id} className="rounded border p-3">
              <label>
                <input
                  type="checkbox"
                  name={`select_${l.id}`}
                  defaultChecked
                  onChange={(e) =>
                    setOmitted({ ...omitted, [l.id]: !e.target.checked })
                  }
                />{" "}
                {l.venueName} · request #{l.id.slice(-6)} · {l.quantity}{" "}
                {l.unit} requested
              </label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label={`Sent (${r?.yieldUnit})`}>
                  <Input
                    name={`qty_${l.id}`}
                    onChange={(e) =>
                      setQuantities({
                        ...quantities,
                        [l.id]: Number(e.target.value),
                      })
                    }
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={
                      convertQty(l.quantity, l.unit, r?.yieldUnit ?? l.unit) ??
                      0
                    }
                  />
                </Field>
                <Field label="Shortage note">
                  <Input name={`note_${l.id}`} />
                </Field>
              </div>
              <SupplyEditor
                venues={venues}
                items={items}
                value={requestSupplies[l.id] ?? []}
                onChange={(s) =>
                  setRequestSupplies({ ...requestSupplies, [l.id]: s })
                }
              />
            </div>
          ))}
          <details>
            <summary>
              Shared or retained venue supplies for this production
            </summary>
            <p className="my-2 text-sm">
              Record facts here when supplies span destinations or remain with
              retained production. Any deliveries are held for shared-supply
              review; no automatic exclusion is allocated.
            </p>
            <SupplyEditor
              venues={venues}
              items={items}
              value={productionSupplies}
              onChange={setProductionSupplies}
            />
          </details>
          <details>
            <summary>Additional delivery without a request</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Venue">
                <Select name="extraVenue">
                  <VenueOptions venues={venues} />
                </Select>
              </Field>
              <Field label={`Sent (${r?.yieldUnit})`}>
                <Input
                  name="extraQuantity"
                  onChange={(e) => setExtraQty(Number(e.target.value))}
                  type="number"
                  min="0"
                  step="any"
                  defaultValue="0"
                />
              </Field>
            </div>
            <SupplyEditor
              venues={venues}
              items={items}
              value={supplies}
              onChange={setSupplies}
            />
          </details>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            Costs are recipe estimates captured when entered. No stock count or
            production batch is needed.
          </p>
          <SupplyEditor
            venues={venues}
            items={items}
            value={supplies}
            onChange={setSupplies}
          />
        </>
      )}
      {correction && (
        <Field label="Correction reason">
          <Input name="reason" required />
        </Field>
      )}
      {error && (
        <p role="alert" className="text-red-700 whitespace-pre-wrap">
          {error}
        </p>
      )}
      <Button disabled={busy || !r}>
        {busy
          ? "Saving…"
          : correction
            ? "Reverse original & save replacement"
            : mode === "CONFIRM"
              ? "Confirm results"
              : "Record pickup"}
      </Button>
    </form>
  );
}

export { SupplyEditor } from "./SupplyEditor";
export { CloseDayForm, ReturnForm, CompletionForm } from "./CloseoutForms";
