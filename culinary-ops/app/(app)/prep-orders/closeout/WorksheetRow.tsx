"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { convertQty } from "@/lib/recipes/units";
import type { PrepGroup } from "@/lib/prep/prep-worksheet";
import type { Charge, Supply } from "@/lib/prep/prep-costing";
import { SupplyEditor } from "../SupplyEditor";
import { ChargePreview } from "./ChargePreview";
import {
  previewPrepProduction,
  submitPrepOperation,
} from "../workflow-actions";

export type ReviewedResult = { cookName: string; quantity: number; unit: string; notes: string; elapsed: string };
export type Ingredient = { id: string; name: string; unit: string };
type Preview = { requestLineId?: string; venueId: string; charge: Charge }[];
const number = (value: number) => String(Number(value.toFixed(4)));

export function WorksheetRow({
  date,
  group,
  items,
  onDirty, projectCode, reviewedResult,
}: {
  date: string;
  group: PrepGroup;
  items: Ingredient[];
  onDirty: (id: string, dirty: boolean) => void;
  projectCode?: ReactNode;
  reviewedResult?: ReviewedResult;
}) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [made, setMade] = useState("");
  const [cookName, setCookName] = useState("");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState<Record<string, string>>({});
  const [waste, setWaste] = useState("");
  const [supplies, setSupplies] = useState<Record<string, Supply[]>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef<unknown>(null);
  const [previewRequests, setPreviewRequests] = useState("");
  const requestsSignature = group.rows
    .map((r) => `${r.id}:${r.quantity}:${r.unit}:${r.lot}`)
    .join("|");
  const validPreview =
    preview !== null && previewRequests === requestsSignature;
  const changed = () => {
    onDirty(group.recipeId, true);
    setPreview(null);
    setError("");
  };
  const delivered = group.rows.reduce(
    (sum, row) => sum + Number(sent[row.id] || 0),
    0,
  );
  const kept = Number(made) - delivered - Number(waste || 0);
  const multipleLots =
    new Set(group.rows.flatMap((r) => (r.lot ? [r.lot] : []))).size > 1;
  const root = group.rows[0];
  const convertedMade = convertQty(Number(made), group.unit, root.yieldUnit);
  const standard =
    root.productionPersonMinutes == null || convertedMade == null
      ? null
      : (root.productionPersonMinutes * convertedMade) / root.yieldQty;
  const venues = [
    ...new Map(
      group.rows.map((r) => [r.venueId, { id: r.venueId, name: r.venueName }]),
    ).values(),
  ];

  if (saved)
    return (
      <Card className="p-5">
        <strong>{group.name}</strong>
        <p role="status">Results saved.</p>
      </Card>
    );
  return (
    <Card className="p-4 sm:p-6">
      <form
        onInvalidCapture={(e) => {
          const details = (e.target as HTMLElement).closest("details");
          if (details) details.open = true;
        }}
        data-worksheet-row="true"
        onChange={changed}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const intent = (
            event.nativeEvent as SubmitEvent
          ).submitter?.getAttribute("value");
          setBusy(true);
          setError("");
          try {
            if (intent === "save" && (validPreview || uncertain)) {
              const result = await submitPrepOperation(
                "CONFIRM",
                key,
                pending.current,
              );
              if (!result.ok) {
                setUncertain(false);
                setError(result.error ?? "Unable to save.");
                return;
              }
              onDirty(group.recipeId, false);
              setSaved(true);
              router.refresh();
            } else {
              const f = new FormData(form);
              const optional = (name: string) =>
                f.get(name) === "" || f.get(name) === null
                  ? null
                  : Number(f.get(name));
              const payload = {
                date,
                recipeId: group.recipeId,
                quantity: Number(made),
                unit: group.unit,
                cookName: String(f.get("cookName") || ""),
                notes: String(f.get("notes") || ""),
                ...(f.get("lot") ? { lot: String(f.get("lot")) } : {}),
                waste: Number(waste || 0),
                wasteReason: String(f.get("wasteReason") || ""),
                productionOverride: optional("productionOverride"),
                dishwasherMinutes: optional("dishwasherMinutes"),
                ...(optional("productionRate") != null
                  ? { productionRate: optional("productionRate") }
                  : {}),
                ...(optional("dishwasherRate") != null
                  ? { dishwasherRate: optional("dishwasherRate") }
                  : {}),
                deliveries: group.rows.map((row) => ({
                  requestLineId: row.id,
                  venueId: row.venueId,
                  quantity: Number(sent[row.id]),
                  shortageNote: String(f.get(`shortage_${row.id}`) || ""),
                  supplies: supplies[row.id] ?? [],
                })),
              };
              const result = await previewPrepProduction(payload);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              pending.current = payload;
              setPreviewRequests(requestsSignature);
              setPreview(result.deliveries);
            }
          } catch {
            if (intent === "save") setUncertain(true);
            setError(
              intent === "save"
                ? "Connection interrupted. Retry save to retrieve the original result before changing this item."
                : "Connection interrupted. Try the preview again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || uncertain} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            {projectCode}
            <div>
              <h2 className="text-xl font-semibold">{group.name}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {group.requested == null
                  ? "Check request units"
                  : `${number(group.requested)} ${group.unit} ordered`}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={group.requested == null}
              onClick={() => {
                setMade(number(group.requested!));
                setSent(
                  Object.fromEntries(
                    group.rows.map((r) => [
                      r.id,
                      number(convertQty(r.quantity, r.unit, group.unit)!),
                    ]),
                  ),
                );
                changed();
              }}
            >
              Use ordered quantities
            </Button>
          </div>
          {reviewedResult && <div className="rounded-lg border border-hairline p-3 text-sm"><p>Reviewed cook result: {reviewedResult.quantity} {reviewedResult.unit} · {reviewedResult.cookName} · {reviewedResult.elapsed} elapsed</p><Button className="mt-2" type="button" variant="secondary" disabled={convertQty(reviewedResult.quantity, reviewedResult.unit, group.unit) == null} onClick={() => { setMade(number(convertQty(reviewedResult.quantity, reviewedResult.unit, group.unit)!)); setCookName(reviewedResult.cookName); setNotes(reviewedResult.notes); changed(); }}>Use reviewed cook result</Button><p className="mt-2 text-xs text-zinc-500">Copies yield, cook, and notes. Confirm destination quantities and labor before saving.</p></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Made (${group.unit})`}>
              <Input
                aria-label={`Made (${group.unit})`}
                required
                type="number"
                min="0"
                step="any"
                value={made}
                onChange={(e) => setMade(e.target.value)}
              />
            </Field>
            <Field label="Cook">
              <Input aria-label="Cook" name="cookName" required value={cookName} onChange={event => setCookName(event.target.value)} />
            </Field>
          </div>
          <div className="space-y-3">
            {group.rows.map((row) => {
              const requested = convertQty(row.quantity, row.unit, group.unit);
              const short =
                sent[row.id] !== undefined &&
                sent[row.id] !== "" &&
                requested != null &&
                Number(sent[row.id]) < requested - 1e-8;
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-hairline p-3 sm:p-4"
                >
                  <div className="grid items-end gap-3 sm:grid-cols-2">
                    <div>
                      <h3 className="font-medium">{row.venueName}</h3>
                      <p className="text-sm text-zinc-500">
                        {row.quantity} {row.unit} ordered
                      </p>
                      {row.instructions && (
                        <p className="mt-1 text-sm">{row.instructions}</p>
                      )}
                    </div>
                    <Field label={`Sent (${group.unit})`}>
                      <Input
                        aria-label={`Sent to ${row.venueName} (${group.unit})`}
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={sent[row.id] ?? ""}
                        onChange={(e) =>
                          setSent({ ...sent, [row.id]: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  {short && (
                    <div className="mt-3">
                      <Field label="Why was less sent?">
                        <Input
                          aria-label={`Shortage reason for ${row.venueName}`}
                          name={`shortage_${row.id}`}
                          required
                        />
                      </Field>
                    </div>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm">
                      Ingredient supplied by a venue
                      {(supplies[row.id]?.length ?? 0) > 0
                        ? ` (${supplies[row.id].length})`
                        : ""}
                    </summary>
                    <p className="mt-2 text-sm text-zinc-500">
                      Deduct an ingredient supplied by {row.venueName} from this
                      delivery’s food charge. Labor stays the same.
                    </p>
                    <SupplyEditor
                      allowShared={false}
                      venues={venues.filter((v) => v.id === row.venueId)}
                      items={items}
                      value={supplies[row.id] ?? []}
                      onChange={(value) => {
                        setSupplies({ ...supplies, [row.id]: value });
                        changed();
                      }}
                    />
                  </details>
                </div>
              );
            })}
          </div>
          <Field
            label="Notes"
            hint="What happened with this item? Notes alone do not change the charge."
          >
            <Textarea
              aria-label="Production notes"
              name="notes"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              maxLength={5000}
              placeholder="For example: Brewpub supplied the bacon."
            />
          </Field>
          <p
            aria-live="polite"
            className={kept < 0 ? "font-medium text-red-700" : "font-medium"}
          >
            Kept:{" "}
            {made === "" || group.rows.some((r) => !sent[r.id])
              ? "—"
              : `${number(kept)} ${group.unit}`}
            {made !== "" && kept < 0
              ? " — sent plus waste exceeds what was made"
              : ""}
          </p>
          <details>
            <summary className="cursor-pointer text-sm">Waste, if any</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={`Waste (${group.unit})`}>
                <Input
                  aria-label="Waste quantity"
                  type="number"
                  min="0"
                  step="any"
                  value={waste}
                  onChange={(e) => setWaste(e.target.value)}
                  placeholder="0"
                />
              </Field>
              {Number(waste) > 0 && (
                <Field label="Waste reason">
                  <Input
                    aria-label="Waste reason"
                    name="wasteReason"
                    required
                  />
                </Field>
              )}
            </div>
          </details>
          <details>
            <summary className="cursor-pointer text-sm">
              Labor{" "}
              {standard == null
                ? "· Production time needs review"
                : "· Recipe standard applied"}{" "}
              · Enter dishwasher time
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="Production person-minutes"
                hint={
                  standard == null
                    ? "Recipe standard is missing. Enter minutes or leave pending."
                    : `Recipe standard: ${number(standard)} minutes. Leave blank to use it.`
                }
              >
                <Input
                  aria-label="Production person-minutes"
                  name="productionOverride"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    standard == null ? "Needs cost review" : number(standard)
                  }
                />
              </Field>
              <Field
                label="Dishwasher minutes"
                hint="Blank needs cost review; enter 0 for none."
              >
                <Input
                  aria-label="Dishwasher minutes"
                  name="dishwasherMinutes"
                  type="number"
                  min="0"
                  step="any"
                />
              </Field>
            </div>
            <details className="mt-3">
              <summary className="text-sm">Hourly rate overrides</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Production hourly rate"
                  hint="Default: $62/3 per hour (about $20.67)"
                >
                  <Input
                    aria-label="Production hourly rate"
                    name="productionRate"
                    type="number"
                    min="0"
                    step="any"
                  />
                </Field>
                <Field
                  label="Dishwasher hourly rate"
                  hint="Default: $18 per hour"
                >
                  <Input
                    aria-label="Dishwasher hourly rate"
                    name="dishwasherRate"
                    type="number"
                    min="0"
                    step="any"
                  />
                </Field>
              </div>
            </details>
          </details>
          <details open={(multipleLots && Number(made) > 0) || undefined}>
            <summary className="cursor-pointer text-sm">
              Production lot
              {multipleLots && Number(made) > 0
                ? " · Actual lot required"
                : " (optional)"}
            </summary>
            <div className="mt-3">
              <Field
                label="Actual lot"
                hint={
                  multipleLots
                    ? "These requests have different printed lots. Enter the lot used by the cook."
                    : "Leave blank to use the printed lot, or assign one automatically."
                }
              >
                <Input
                  aria-label="Actual lot"
                  name="lot"
                  required={multipleLots && Number(made) > 0}
                />
              </Field>
            </div>
          </details>
          <Button type="submit" value="preview" variant="secondary">
            {busy ? "Working…" : "Preview charges"}
          </Button>
        </fieldset>
        {validPreview && (
          <ChargePreview preview={preview!} venues={venues} />
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 whitespace-pre-wrap text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {(validPreview || uncertain) && (
          <Button className="mt-4" type="submit" value="save" disabled={busy}>
            {busy ? "Saving…" : uncertain ? "Retry save" : "Save item results"}
          </Button>
        )}
      </form>
    </Card>
  );
}
