import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth/session";
import { getVenues } from "@/lib/venues/venue";
import { buildCustomMenuPlan, describeQuantity, formatMenuDate, ISSUE_TEXT, rowAllergenKeys } from "@/lib/menus/custom-menu";
import { loadCustomMenu, loadCustomMenuIngredients } from "@/lib/menus/custom-menu-data";
import { buildRecipeTree } from "@/components/RecipeBuild";
import { allergenLabels } from "@/lib/recipes/allergens";
import { money, num, pct } from "@/lib/recipes/costing";
import { unitLabel } from "@/lib/recipes/units";
import { Card, CardHeader, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { CostIntegrityBanner } from "@/components/CostAudit";
import { InspectorLink } from "@/components/InspectorLink";
import { WorkspaceInspector } from "@/components/WorkspaceInspector";
import { CustomMenuForm, CustomMenuItemForm } from "../CustomMenuForms";
import { deleteCustomMenu, duplicateCustomMenu, removeCustomMenuItem } from "../actions";

export default async function CustomMenuWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [{ menu, recipes }, venues, ingredients] = await Promise.all([loadCustomMenu(id), getVenues(), loadCustomMenuIngredients()]);
  if (!menu) notFound();
  const canEdit = hasRole(user, "MANAGER");
  const plan = buildCustomMenuPlan(menu, menu.items, recipes);
  const tree = buildRecipeTree(recipes);
  const recipeOptions = recipes.map((r) => ({ id: r.id, name: r.name, prodCode: r.prodCode, yieldQty: r.yieldQty, yieldUnit: r.yieldUnit }));
  const nextSortOrder = Math.max(-1, ...menu.items.map((item) => item.sortOrder)) + 1;
  const when = [formatMenuDate(menu.date) ?? "No date yet", menu.serviceTime, menu.venue?.name ?? "No venue"].filter(Boolean).join(" · ");

  return <WorkspaceInspector><div>
    <Link href="/custom-menus" className="mb-4 inline-block text-sm text-gold hover:underline">← Custom Menus</Link>
    <PageHeader title={menu.name} subtitle={`${when} · ${menu.guestCount} guests · ${menu.status.toLowerCase()}${menu.subtitle ? ` · ${menu.subtitle}` : ""}`} />
    <div className="mb-6 flex flex-wrap gap-2">
      <LinkButton href={`/custom-menus/${id}/packet`} variant="gold">Print full packet (with costing)</LinkButton>
      <LinkButton href={`/custom-menus/${id}/packet?copy=kitchen`} variant="secondary">Print kitchen / client copy</LinkButton>
    </div>

    <CostIntegrityBanner unpriced={plan.priceGaps.unpriced} stale={plan.priceGaps.stale} unreviewed={plan.priceGaps.unreviewed} reviewStale={plan.priceGaps.reviewStale} />
    {plan.issueCount > 0 && <aside role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>{plan.issueCount} {plan.issueCount === 1 ? "dish isn't" : "dishes aren't"} costed yet.</strong> They are left out of totals, recipes and the pull list until fixed.
    </aside>}

    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Total food cost" value={money(plan.totalCost)} sub={`${plan.rows.length - plan.issueCount} of ${plan.rows.length} dishes costed`} />
      <StatCard label="Cost per guest" value={money(plan.costPerGuest)} sub={`${menu.guestCount} guests`} />
      <StatCard label="Price per guest" value={money(menu.pricePerGuest)} sub={menu.pricePerGuest ? `${money(plan.revenue)} total` : "Cost-only menu"} />
      <StatCard label="Food cost %" value={pct(plan.fcp)} sub={`Target ${pct(menu.targetFcp)}${plan.overTarget ? " · over target" : ""}`} />
    </div>

    {plan.sections.length === 0 && <Card className="mb-6 p-8 text-center text-zinc-500">Add your first recipe or sub-recipe below.</Card>}
    {plan.sections.map((section) => <Card key={section.name} className="mb-6">
      <CardHeader>{section.name}</CardHeader>
      <div className="overflow-x-auto"><table className="atelier-table w-full text-left text-sm">
        <thead><tr><th>Dish</th><th>Amount</th><th>Batches</th><th>Allergens</th><th className="text-right">Cost</th><th className="text-right">Per guest</th></tr></thead>
        <tbody>{section.rows.map((row) => <tr key={row.id}>
          <td className="min-w-72 align-top">
            {row.kind === "item"
              ? <InspectorLink kind="item" id={row.itemId ?? ""} className="font-medium text-ink hover:underline">{row.title}</InspectorLink>
              : <InspectorLink kind="recipe" id={row.recipeId ?? ""} className="font-medium text-ink hover:underline">{row.title}</InspectorLink>}
            {row.kind === "item" && <p className="text-xs text-zinc-500">Raw ingredient{row.menuTitle ? `: ${row.recipeName}` : ""}</p>}
            {row.kind === "recipe" && row.menuTitle && <p className="text-xs text-zinc-500">Recipe: {row.recipeName}</p>}
            {row.menuDescription && <p className="text-xs italic text-zinc-600">{row.menuDescription}</p>}
            {row.issue && <p className="mt-1 text-xs font-medium text-amber-800">⚠ {ISSUE_TEXT[row.issue]}</p>}
            {canEdit && <details className="mt-2"><summary className="cursor-pointer text-xs text-gold">Edit dish</summary>
              <div className="mt-3 min-w-80">
                <CustomMenuItemForm customMenuId={id} line={row} recipes={recipeOptions} ingredients={ingredients} guestCount={menu.guestCount} />
                <form action={removeCustomMenuItem} className="mt-3">
                  <input type="hidden" name="id" value={row.id} /><input type="hidden" name="customMenuId" value={id} />
                  <button className="text-xs text-red-700">Remove from menu</button>
                </form>
              </div>
            </details>}
          </td>
          <td className="align-top text-xs">{describeQuantity(row, menu.guestCount, num)}</td>
          <td className="whitespace-nowrap align-top font-mono text-xs">{row.issue ? "—" : row.kind === "item" ? "Purchased" : `${num(row.batches)} × ${num(row.yieldQty)} ${unitLabel(row.yieldUnit)}`}</td>
          <td className="align-top text-xs">{(() => { const keys = rowAllergenKeys(row, tree); return keys == null ? "—" : allergenLabels(keys) || "None recorded"; })()}</td>
          <td className="whitespace-nowrap text-right align-top tabular-nums">{money(row.cost)}</td>
          <td className="whitespace-nowrap text-right align-top tabular-nums">{money(row.costPerGuest)}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>)}

    {canEdit && <Card className="mb-6 p-5">
      <h2 className="mb-1 font-display text-2xl italic text-ink">Add a dish</h2>
      <p className="mb-4 text-sm text-zinc-500">Any saved recipe or sub-recipe, or a raw ingredient you buy ready to serve (buns, chips, pickles). Need a new dish, like a one-time rub? <Link href="/recipes?new=1#new-recipe" className="text-gold underline">Create the recipe</Link>, then add it here.</p>
      <CustomMenuItemForm key={menu.items.length} customMenuId={id} recipes={recipeOptions} ingredients={ingredients} nextSortOrder={nextSortOrder} guestCount={menu.guestCount} />
    </Card>}

    {(menu.serviceNotes || menu.notes) && <Card className="mb-6 space-y-3 p-5 text-sm">
      {menu.serviceNotes && <p className="whitespace-pre-wrap"><strong>Service notes:</strong> {menu.serviceNotes}</p>}
      {menu.notes && <p className="whitespace-pre-wrap"><strong>Internal notes:</strong> {menu.notes}</p>}
    </Card>}

    {canEdit && <details className="mb-6"><summary className="cursor-pointer text-sm text-gold">Menu details, guests &amp; pricing</summary>
      <Card className="mt-3 p-5"><CustomMenuForm menu={menu} venues={venues} /></Card>
    </details>}

    {canEdit && <div className="flex flex-wrap items-start gap-6 border-t border-hairline pt-4 text-sm">
      <form action={duplicateCustomMenu}><input type="hidden" name="id" value={id} /><button className="text-gold underline">Duplicate this menu</button></form>
      <form action={deleteCustomMenu} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex items-center gap-1 text-xs text-zinc-600"><input type="checkbox" name="confirm" value="delete" required /> Confirm</label>
        <button className="text-red-700 underline">Delete menu</button>
      </form>
    </div>}
  </div></WorkspaceInspector>;
}
