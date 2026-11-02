"use client";
import { Button, Field, Input } from "@/components/ui";
import { useSubmission } from "./usePrepSubmission";
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
      <Button disabled={busy}>Finish day</Button>
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
