import { InspectorLink } from "./InspectorLink";
import { money } from "@/lib/recipes/costing";
import type { MenuRolloutPlan } from "@/lib/menus/menu-rollout";

export function MenuOrderGuide({ plan }: { plan: MenuRolloutPlan }) {
  return <div className="space-y-6">
    {plan.vendorGroups.length === 0 && <p className="text-sm text-zinc-500">Add menu recipes with orderable ingredients to generate a vendor guide.</p>}
    {plan.vendorGroups.map(vendor => <section key={vendor.id} className="atelier-vendor">
      <h3 className="atelier-vendor-heading mb-2 border-b border-[#E2DDD5] pb-2 font-display text-xl italic text-[#2C3E35]">{vendor.name}</h3>
      <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-xs">
        <thead><tr><th aria-label="Check">[ ]</th><th>Item Name</th><th>Category</th><th>SKU / GCode</th><th>Pack Size</th><th>Unit Cost</th><th>Order Qty</th></tr></thead>
        <tbody>{vendor.lines.map(line => <tr key={line.itemId}>
          <td className="font-mono">[ ]</td><td><InspectorLink kind="item" id={line.itemId}>{line.name}</InspectorLink></td><td>{line.category}</td>
          <td>{line.item.sku || "—"}<span className="block text-zinc-500">{line.item.gcode || "—"}</span></td>
          <td>{line.item.packSize || "—"}</td>
          <td className="font-mono">{line.item.unitCost > 0 ? `${money(line.item.unitCost, 2)} / ${line.item.unit}` : "Unpriced"}</td>
          <td><span className="print-write-in inline-block min-w-16 border-b border-[#9A7B4F]" aria-label={`Order quantity for ${line.name}`}>&nbsp;</span></td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
    {plan.vendorGroups.length > 0 && <p className="text-xs text-zinc-500">Check pantry staples on hand and enter order quantities in vendor packs as needed.</p>}
  </div>;
}
