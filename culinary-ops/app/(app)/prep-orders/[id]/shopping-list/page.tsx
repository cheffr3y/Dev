import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFrozenPacket } from "@/lib/prep-packets";
import { requireUser } from "@/lib/session";
import { buildShoppingList, type ShoppingRecipeNode } from "@/lib/shopping";
import { ShoppingListBody } from "@/components/ShoppingList";
import { PrintButton } from "@/components/PrintButton";

// Shopping / pull list — the companion to the cook packet. Every raw
// ingredient needed across all printed batches, summed and grouped by
// category. Sub-recipes are exploded down to their purchasable items, so this
// lists only things you actually buy or pull, in the amounts the day requires.

// forDate-derived dates are UTC-midnight; format in UTC so the day is stable.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const frozen = await loadFrozenPacket(id);
  if (!frozen) notFound();
  const { order, shoppingRecipes: recipes } = frozen;

  // Match the cook packet: only printed lines (those with a lot) are in play.
  const printed = order.lines.filter((l) => l.lot);

  const nodes: ShoppingRecipeNode[] = recipes.map((r) => ({
    id: r.id,
    yieldQty: r.yieldQty,
    yieldUnit: r.yieldUnit,
    items: r.items.map((ri) => ({
      itemId: ri.item.id,
      name: ri.item.name,
      category: ri.item.category,
      quantity: ri.quantity,
      unit: ri.unit,
    })),
    components: r.components,
  }));

  const list = buildShoppingList(
    printed.map((l) => ({
      recipeId: l.recipeId,
      recipeName: l.recipe.name,
      requestedQty: l.requestedQty,
      requestedUnit: l.requestedUnit,
    })),
    nodes,
  );

  const forDate = fmtDate(order.forDate);
  const printedOn = fmtDate(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link
          href={`/prep-orders/${order.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to order
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/prep-orders/${order.id}/packet`}
            className="text-sm text-blue-600 hover:underline"
          >
            Cook packet
          </Link>
          <PrintButton label="Print shopping list" />
        </div>
      </div>

      {printed.length === 0 || list.itemCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-600">
            {printed.length === 0
              ? "No printed lines yet."
              : "No ingredients to list."}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {printed.length === 0
              ? "Generate the cook packet from the order to build the shopping list."
              : "The printed recipes have no ingredients recorded."}
          </p>
        </div>
      ) : (
        <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Mise · Shopping List</span>
            <span>Production {forDate}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-zinc-900">
            Commissary Prep
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {list.itemCount} ingredient{list.itemCount === 1 ? "" : "s"} across{" "}
            {printed.length} batch
            {printed.length === 1 ? "" : "es"} · sub-recipes broken down to raw
            items.
          </p>

          <ShoppingListBody list={list} />

          <p className="mt-10 border-t border-zinc-200 pt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Printed {printedOn} · Quantities summed across all printed batches ·
            Mise · Culinary Ops
          </p>
        </div>
      )}
    </div>
  );
}
