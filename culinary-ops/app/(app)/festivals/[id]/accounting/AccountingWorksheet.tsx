"use client";

import { useState } from "react";
import { buildFestivalAccounting, type FestivalExpenseInputs } from "@/lib/festival-accounting";
import { money } from "@/lib/costing";
import { Button, Card, CardHeader, Field, Input, StatCard } from "@/components/ui";
import { INPUT_CELL, WorksheetLegend } from "../../worksheet";
import { updateFestivalAccounting } from "../../actions";

type Props = {
  festivalId: string;
  revenue: number;
  foodCost: number;
  initial: FestivalExpenseInputs;
  canEdit: boolean;
};

const inputKeys = [
  ["boothFee", "Booth / vendor fee"],
  ["equipmentCost", "Equipment / rentals"],
  ["disposablesCost", "Disposables / packaging"],
  ["transportCost", "Transport / fuel"],
  ["otherCost", "Other event costs"],
] as const;

export function AccountingWorksheet({ festivalId, revenue, foodCost, initial, canEdit }: Props) {
  const [values, setValues] = useState(initial);
  const result = buildFestivalAccounting(revenue, foodCost, values);
  const setNumber = (key: keyof FestivalExpenseInputs, raw: string | number) =>
    setValues((current) => ({ ...current, [key]: Math.max(0, Number(raw) || 0) }));

  const targetMargin = values.targetMarginPct * 100;
  const marginLabel = result.netMarginPct == null ? "—" : `${(result.netMarginPct * 100).toFixed(1)}%`;
  const profitTone = result.projectedProfit >= 0 ? "text-emerald-700" : "text-red-600";

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Projected revenue" value={money(revenue)} sub="forecast sales before fees" />
        <StatCard label="All-in cost" value={money(result.totalCost)} sub={`${money(foodCost)} food + event costs`} />
        <StatCard
          label="Projected profit"
          value={<span className={profitTone}>{money(result.projectedProfit)}</span>}
          sub="after food, labor, fees & expenses"
        />
        <StatCard label="Net margin" value={marginLabel} sub={`${targetMargin.toFixed(0)}% target`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader>Event expense assumptions</CardHeader>
          <form action={updateFestivalAccounting} className="p-5">
            <input type="hidden" name="festivalId" value={festivalId} />
            {canEdit && <WorksheetLegend />}
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Labor hours">
                <Input
                  name="laborHours"
                  type="number"
                  min="0"
                  step="0.25"
                  value={values.laborHours}
                  readOnly={!canEdit}
                  onChange={(e) => setNumber("laborHours", e.target.value)}
                  className={canEdit ? INPUT_CELL : "text-right tabular-nums"}
                />
              </Field>
              <Field label="Average hourly rate">
                <Input
                  name="laborRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.laborRate}
                  readOnly={!canEdit}
                  onChange={(e) => setNumber("laborRate", e.target.value)}
                  className={canEdit ? INPUT_CELL : "text-right tabular-nums"}
                />
              </Field>
              <Field label="Calculated labor">
                <Input value={money(result.laborCost)} readOnly className="bg-zinc-100 text-right tabular-nums text-zinc-600" />
              </Field>
              {inputKeys.map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    name={key}
                    type="number"
                    min="0"
                    step="0.01"
                    value={values[key]}
                    readOnly={!canEdit}
                    onChange={(e) => setNumber(key, e.target.value)}
                    className={canEdit ? INPUT_CELL : "text-right tabular-nums"}
                  />
                </Field>
              ))}
              <Field label="Sales / card fees (%)" hint="Applied to projected revenue">
                <Input
                  name="salesFeePct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number((values.salesFeePct * 100).toFixed(2))}
                  readOnly={!canEdit}
                  onChange={(e) => setNumber("salesFeePct", e.target.valueAsNumber / 100)}
                  className={canEdit ? INPUT_CELL : "text-right tabular-nums"}
                />
              </Field>
              <Field label="Target net margin (%)">
                <Input
                  name="targetMarginPct"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Number((values.targetMarginPct * 100).toFixed(2))}
                  readOnly={!canEdit}
                  onChange={(e) => setNumber("targetMarginPct", e.target.valueAsNumber / 100)}
                  className={canEdit ? INPUT_CELL : "text-right tabular-nums"}
                />
              </Field>
            </div>
            {canEdit && (
              <Button type="submit" className="mt-5">
                Save accounting assumptions
              </Button>
            )}
          </form>
        </Card>

        <Card>
          <CardHeader>Price check</CardHeader>
          <dl className="divide-y divide-zinc-100 p-5 text-sm">
            <Row label="Recipe food cost" value={money(foodCost)} />
            <Row label="Labor" value={money(result.laborCost)} />
            <Row label="Other fixed event costs" value={money(result.fixedCosts - result.laborCost)} />
            <Row label="Sales / card fees" value={money(result.salesFees)} />
            <Row label="Break-even revenue" value={money(result.breakEvenRevenue)} strong />
            <Row
              label={`Revenue for ${targetMargin.toFixed(0)}% net margin`}
              value={result.targetRevenue == null ? "Not possible at these rates" : money(result.targetRevenue)}
              strong
            />
          </dl>
          <div className="border-t border-hairline bg-zinc-50 p-5 text-sm">
            {result.targetRevenue == null ? (
              <p className="font-medium text-red-700">Sales fees plus target margin must total less than 100%.</p>
            ) : result.revenueGap != null && result.revenueGap > 0 ? (
              <p>
                To hit the target, find <strong>{money(result.revenueGap)}</strong> more revenue—about a{" "}
                <strong>{(((result.priceMultiplier ?? 1) - 1) * 100).toFixed(1)}%</strong> price lift if volume stays the same.
              </p>
            ) : (
              <p className="font-medium text-emerald-700">The current forecast clears the target margin.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-zinc-600">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "font-semibold text-ink" : "text-zinc-800"}`}>{value}</dd>
    </div>
  );
}
