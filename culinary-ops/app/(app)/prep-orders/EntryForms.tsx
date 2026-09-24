"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { submitPrepOperation } from "./workflow-actions";
import { convertQty } from "@/lib/units";
import type { Supply } from "@/lib/prep-costing";
type Recipe = {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  productionPersonMinutes: number | null;
};
type Venue = { id: string; name: string };
type Item = { id: string; name: string; unit: string };
type Request = {
  id: string;
  recipeId: string;
  venueId: string;
  venueName: string;
  quantity: number;
  unit: string;
};
const optional = (f: FormData, name: string) => {
  const v = f.get(name);
  return v === null || v === "" ? null : Number(v);
};
function useSubmission(initialKey: string) {
  const [key, setKey] = useState(initialKey),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function send(kind: string, payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await submitPrepOperation(kind, key, payload);
      if (!r.ok) {
        setError(r.error ?? "Unable to save");
        return false;
      } else {
        setKey(crypto.randomUUID());
        router.refresh();
        return true;
      }
    } catch {
      setError(
        "Connection interrupted. Retry to retrieve the original result.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, error, busy };
}
function SupplyEditor({
  venues,
  items,
  value,
  onChange,
}: {
  venues: Venue[];
  items: Item[];
  value: Supply[];
  onChange: (s: Supply[]) => void;
}) {
  return (
    <div className="my-3 space-y-2">
      <p className="text-sm">Venue-supplied ingredients</p>
      {value.map((s, i) => (
        <div key={i} className="grid gap-2 rounded border p-3 sm:grid-cols-3">
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
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
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
              venueId: "",
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
          <Select
            required
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value);
              setQuantity("");
              setQuantities({});
              setOmitted({});
              setExtraQty(0);
              setWasteQty(0);
              setProductionSupplies([]);
              setSupplies([]);
              setRequestSupplies({});
            }}
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
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
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
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
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
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
      <Button disabled={busy}>
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
export function CloseDayForm({
  date,
  operationKey,
}: {
  date: string;
  operationKey: string;
}) {
  const { send, error, busy } = useSubmission(operationKey);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send("CLOSE", { date });
      }}
    >
      <p className="mb-3 text-sm">
        Closeout locks this day’s operational records. Missing cost information
        remains pending.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-red-700">
          {error}
        </p>
      )}
      <Button disabled={busy}>Close day</Button>
    </form>
  );
}
export function ReturnForm({
  id,
  date,
  operationKey,
  unit,
}: {
  id: string;
  date: string;
  operationKey: string;
  unit: string;
}) {
  const { send, error, busy } = useSubmission(operationKey);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void send("RETURN", {
          transferId: id,
          date: String(f.get("date")),
          quantity: Number(f.get("quantity")),
          reason: String(f.get("reason")),
        });
      }}
      className="space-y-3"
    >
      <Field label="Return date">
        <Input name="date" type="date" defaultValue={date} required />
      </Field>
      <Field label={`Quantity returned (${unit})`}>
        <Input
          name="quantity"
          type="number"
          min="0.000001"
          step="any"
          required
        />
      </Field>
      <Field label="Reason">
        <Input name="reason" required />
      </Field>
      <p className="text-sm">
        Credits original net food and both labor charges. Returned product is
        commissary waste.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button disabled={busy}>Record return & credit</Button>
    </form>
  );
}
export function CompletionForm({
  id,
  date,
  operationKey,
  issues,
}: {
  id: string;
  date: string;
  operationKey: string;
  issues: string[];
}) {
  const { send, error, busy } = useSubmission(operationKey);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const patch: {
          prices: Record<string, number>;
          gcodes: Record<string, string>;
          conversions: Record<string, number>;
          productionMinutes?: number;
          dishwasherMinutes?: number;
        } = { prices: {}, gcodes: {}, conversions: {} };
        for (const issue of issues) {
          const [kind, key] = issue.split(":");
          const v = f.get(`${kind}:${key}`);
          if (v === null || v === "") continue;
          if (kind === "PRICE") patch.prices[key] = Number(v);
          if (kind === "GCODE") patch.gcodes[key] = String(v);
          if (kind === "UNIT") patch.conversions[key] = Number(v);
          if (kind === "LABOR") {
            if (key === "production") patch.productionMinutes = Number(v);
            else patch.dishwasherMinutes = Number(v);
          }
        }
        void send("COMPLETE", {
          transferId: id,
          date: String(f.get("date")),
          reason: String(f.get("reason")),
          patch,
        });
      }}
      className="space-y-3"
    >
      <Field label="Completion date">
        <Input name="date" type="date" defaultValue={date} required />
      </Field>
      {issues.map((issue) => {
        const [kind, key] = issue.split(":");
        return (
          <Field
            key={issue}
            label={issue}
            hint={
              kind === "UNIT"
                ? "Enter conversion factor from captured unit to target unit."
                : undefined
            }
          >
            {["PRICE", "GCODE", "UNIT", "LABOR"].includes(kind) ? (
              <Input
                name={`${kind}:${key}`}
                type={kind === "GCODE" ? "text" : "number"}
                min={kind === "UNIT" ? 0.000001 : 0}
                step="any"
              />
            ) : (
              <p>Held for review. Resolve through a documented correction.</p>
            )}
          </Field>
        );
      })}
      <Field label="Reason / source of missing information">
        <Input name="reason" required />
      </Field>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button disabled={busy}>Save linked cost completion</Button>
    </form>
  );
}
