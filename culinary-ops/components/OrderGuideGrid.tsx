"use client";
import { useState } from "react";
import { money, num } from "@/lib/recipes/costing";
import { guideAmounts, type GuideRow, type EditValue, type CatalogItem } from "@/lib/workspace/workspace-options";
import { CatalogCell, catalogColumns } from "./CatalogCells";
import { InlineCell } from "./InlineCell";
import { EditGrid } from "./EditGrid";
import { removeOrderGuideLine } from "@/app/(app)/order-guides/actions";

export function OrderGuideGrid({ rows: initial, vendors, guideId, canEdit }: { rows: GuideRow[]; vendors: { id: string; name: string }[]; guideId: string; canEdit: boolean }) {
  const [edits, setEdits] = useState<Record<string, Partial<GuideRow> & { itemEdits?: Partial<CatalogItem> }>>({});
  const rows = initial.map(row => ({ ...row, ...edits[row.id], item: { ...row.item, ...edits[row.id]?.itemEdits } }));
  const amounts = rows.map(guideAmounts);
  const incomplete = amounts.some(value => value.cost == null);
  const total = amounts.reduce((sum, value) => sum + (value.cost ?? 0), 0);
  function itemEdit(row: GuideRow, field: keyof CatalogItem, value: EditValue) { setEdits(previous => ({ ...previous, [row.id]: { ...previous[row.id], itemEdits: { ...previous[row.id]?.itemEdits, [field]: value } } })); }
  return <>
    {canEdit && <p className="no-print border-b border-hairline p-3 text-xs text-zinc-500">Tab / Shift+Tab across cells · Enter down rows · Escape cancels. Catalog fields update the shared ingredient. Par and order unit belong to this guide.</p>}
    <EditGrid className="catalog-grid overflow-x-auto"><table className="w-full text-sm"><thead><tr>
      <th className="px-3 py-2 text-left">Item</th>{canEdit && catalogColumns.map(([key, label]) => <th key={key} className="no-print px-2 py-2 text-left">{label}</th>)}
      <th className="px-3 py-2 text-right">Par</th><th className="px-3 py-2 text-left">Order unit</th><th className="px-3 py-2 text-right">On Hand</th><th className="px-3 py-2 text-right">Order</th><th className="px-3 py-2 text-right">Est. Cost</th>{canEdit && <th className="no-print" aria-label="Actions" />}
    </tr></thead><tbody className="divide-y divide-hairline">
      {!rows.length && <tr><td colSpan={canEdit ? 13 : 6} className="p-8 text-center text-zinc-500">No items on this guide yet.</td></tr>}
      {rows.map((row, index) => {
        const { have, need, cost } = amounts[index];
        return <tr key={row.id} className={need != null && need > 0 ? "bg-amber-50/40" : undefined}>
          <td className="min-w-48 px-3 py-2 font-medium">{row.item.name}{row.item.packSize && <span className="block text-xs text-zinc-500">{row.item.packSize}</span>}</td>
          {canEdit && catalogColumns.map(([field]) => <td key={field} className="no-print min-w-32 px-1 py-1"><CatalogCell item={row.item} field={field} vendors={vendors} onValue={value => itemEdit(row, field, value)} /></td>)}
          <td className="px-2 py-1 text-right tabular-nums">{canEdit ? <><span className="no-print"><InlineCell entity="guideLine" id={row.id} field="par" value={row.par} row={row.id} label={`Par for ${row.item.name}`} onValue={value => setEdits(previous => ({ ...previous, [row.id]: { ...previous[row.id], par: Number(value) } }))} /></span><span className="hidden print:inline">{num(row.par)}</span></> : num(row.par)}</td>
          <td className="px-2 py-1">{canEdit ? <><span className="no-print"><InlineCell entity="guideLine" id={row.id} field="unit" column="orderUnit" row={row.id} value={row.unit} label={`Order unit for ${row.item.name}`} onValue={value => setEdits(previous => ({ ...previous, [row.id]: { ...previous[row.id], unit: String(value) } }))} /></span><span className="hidden print:inline">{row.unit}</span></> : row.unit}</td>
          <td className="px-3 py-2 text-right tabular-nums">{have == null ? "Check units" : num(have)}</td><td className="px-3 py-2 text-right tabular-nums">{need == null ? "Check units" : need > 0 ? `${num(need)} ${row.unit}` : "—"}</td><td className="px-3 py-2 text-right tabular-nums">{cost == null ? "Check price / units" : need ? money(cost) : "—"}</td>
          {canEdit && <td className="no-print px-3 py-2"><form action={removeOrderGuideLine}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="orderGuideId" value={guideId} /><button className="text-xs text-red-500 hover:underline">remove</button></form></td>}
        </tr>;
      })}
    </tbody><tfoot><tr className="no-print border-t border-hairline font-medium"><td className="px-3 py-3" colSpan={canEdit ? 11 : 5}>Estimated order total {incomplete && <span className="text-xs text-amber-700">(partial — check prices / units)</span>}</td><td className="px-3 py-3 text-right tabular-nums" aria-label="Estimated order total">{money(total)}</td>{canEdit && <td />}</tr><tr className="hidden print:table-row"><td colSpan={5}>Estimated order total{incomplete ? " (partial — check prices / units)" : ""}</td><td className="text-right tabular-nums">{money(total)}</td></tr></tfoot></table></EditGrid>
  </>;
}
