import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import { RecipeBuildCard, SharedBuildCard, buildRecipeTree, consolidateSharedSubBuilds, type RecipeTreeNode } from "@/components/RecipeBuild";
import { RecipePrintSettings } from "@/components/RecipeDossier";
import { requireUser } from "@/lib/auth/session";
import { allergenText, buildCustomMenuPlan, describeQuantity, formatMenuDate, ISSUE_TEXT, rowAllergenKeys, type CustomMenuRow } from "@/lib/menus/custom-menu";
import { loadCustomMenu } from "@/lib/menus/custom-menu-data";
import { ALLERGENS, MAJOR_ALLERGENS } from "@/lib/recipes/allergens";
import { allergenReviewText, money, num, pct } from "@/lib/recipes/costing";
import { unitLabel } from "@/lib/recipes/units";
import styles from "./packet.module.css";

// Two copies of one packet:
//   • full    — menu, costing rollup, allergens, scaled recipes, pull list
//   • kitchen — the same without any dollar amounts or internal notes, safe
//               to send to a kitchen team or a client.
// "Save as PDF" in the browser print dialog produces the file to send.

type Query = { copy?: string | string[]; print?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CustomMenuPacket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireUser();
  const { menu, recipes } = await loadCustomMenu(id);
  if (!menu) notFound();

  const kitchen = first(query.copy) === "kitchen";
  const plan = buildCustomMenuPlan(menu, menu.items, recipes);
  const tree = buildRecipeTree(recipes);
  const date = formatMenuDate(menu.date);
  const eventLabel = [menu.name, date].filter(Boolean).join(" · ");
  const copyLabel = kitchen ? "Kitchen / client copy" : "Full packet · Internal";
  const otherCopy = kitchen ? { href: `/custom-menus/${id}/packet`, label: "Switch to full packet (with costing)" } : { href: `/custom-menus/${id}/packet?copy=kitchen`, label: "Switch to kitchen / client copy" };

  // Scaled recipes: combine repeated recipes, then pull shared sub-recipes up front.
  const entries = new Map<string, { node: RecipeTreeNode; totalBatches: number; uses: CustomMenuRow[] }>();
  for (const row of plan.rows) {
    const node = row.recipeId ? tree.get(row.recipeId) : undefined;
    if (row.issue || !node) continue;
    const entry = entries.get(node.id) ?? { node, totalBatches: 0, uses: [] };
    entry.totalBatches += row.batches;
    entry.uses.push(row);
    entries.set(node.id, entry);
  }
  const builds = [...entries.values()];
  const { shared, sharedRefs } = consolidateSharedSubBuilds(builds.map((b) => ({ node: b.node, totalBatches: b.totalBatches })), tree);

  const allergenRows = plan.rows.map((row) => ({ row, keys: rowAllergenKeys(row, tree) }));
  const purchased = plan.rows.filter((row) => row.kind === "item" && !row.issue);
  const otherAllergens = ALLERGENS.filter((a) => a.group !== "major");

  return (
    <div className={`recipe-print recipe-packet mx-auto max-w-[8.5in] ${styles.packet}`}>
      <RecipePrintSettings />
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/custom-menus/${id}`} className="text-sm text-blue-600 hover:underline">← {menu.name}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={otherCopy.href} className="text-sm text-blue-600 hover:underline">{otherCopy.label}</Link>
          <PrintButton label="Print / Save as PDF" autoPrint={first(query.print) === "1"} />
        </div>
      </div>
      {plan.issueCount > 0 && <p className="no-print mb-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        {plan.issueCount} {plan.issueCount === 1 ? "dish has" : "dishes have"} no usable quantity and {plan.issueCount === 1 ? "is" : "are"} left out of the recipes and pull list. Fix {plan.issueCount === 1 ? "it" : "them"} on the menu before sending.
      </p>}

      {(() => {
        const missing = allergenRows.filter(({ keys }) => !keys?.length).map(({ row }) => row.title);
        return missing.length > 0 && <p className="no-print mb-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          No allergens recorded for {missing.join(", ")}. The menu will print &ldquo;Allergens not recorded — ask the kitchen&rdquo; for {missing.length === 1 ? "it" : "them"}. Tag the recipe or ingredient before sending to the client.
        </p>;
      })()}

      {/* 1 · Cover and menu */}
      <section className={styles.sheet} aria-labelledby="custom-packet-title">
        <header className="border-b-2 border-ink pb-3">
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-600">{copyLabel}</p>
          <h1 id="custom-packet-title" className="mt-1 font-display text-4xl leading-tight text-ink">{menu.name}</h1>
          {menu.subtitle && <p className="mt-1 text-base italic text-zinc-700">{menu.subtitle}</p>}
          <p className="mt-1 text-sm text-zinc-700">{[date ?? "Date to be set", menu.serviceTime, menu.venue?.name, `${num(menu.guestCount)} guests`].filter(Boolean).join(" · ")}</p>
        </header>
        <div className="mx-auto mt-6 max-w-xl text-center">
          {plan.sections.length === 0 && <p className="text-sm text-zinc-600">No dishes on this menu yet.</p>}
          {plan.sections.map((section) => <div key={section.name} className="mb-6 break-inside-avoid">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">{section.name}</h2>
            {section.rows.map((row) => <div key={row.id} className="mb-3">
              <p className="font-display text-xl text-ink">{row.title}</p>
              {row.menuDescription && <p className="text-sm italic text-zinc-700">{row.menuDescription}</p>}
              {(() => { const keys = rowAllergenKeys(row, tree); return <p className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">{allergenText(keys)}</p>; })()}
            </div>)}
          </div>)}
        </div>
        {menu.serviceNotes && <p className="mt-4 whitespace-pre-line border-t border-zinc-300 pt-3 text-sm"><strong>Service notes:</strong> {menu.serviceNotes}</p>}
      </section>

      {/* 2 · Costing rollup (full packet only) */}
      {!kitchen && <section className={`${styles.sheet} ${styles.nextSheet}`} aria-labelledby="custom-packet-costing">
        <SectionHeader id="custom-packet-costing" title="Costing rollup" eventLabel={eventLabel} />
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <Metric label="Total food cost" value={money(plan.totalCost)} detail={`${plan.rows.length - plan.issueCount} of ${plan.rows.length} dishes costed`} />
          <Metric label="Cost per guest" value={money(plan.costPerGuest)} detail={`${num(menu.guestCount)} guests`} />
          <Metric label="Price per guest" value={money(menu.pricePerGuest)} detail={plan.revenue != null ? `${money(plan.revenue)} total` : "Cost-only menu"} />
          <Metric label="Food cost %" value={pct(plan.fcp)} detail={`${pct(menu.targetFcp)} target${plan.overTarget ? " · over" : ""}`} />
        </dl>
        {(plan.priceGaps.unpriced.length > 0 || plan.priceGaps.stale.length > 0) && <p className="mt-3 border-l-2 border-amber-600 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
          <strong>Cost review needed:</strong>{" "}
          {[plan.priceGaps.unpriced.length > 0 && `no price for ${plan.priceGaps.unpriced.join(", ")}`, plan.priceGaps.stale.length > 0 && `stale price for ${plan.priceGaps.stale.join(", ")}`].filter(Boolean).join("; ")}. Food cost may be understated.
        </p>}
        {(plan.priceGaps.unreviewed.length > 0 || plan.priceGaps.reviewStale.length > 0) && <p className="mt-2 border-l-2 border-amber-600 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
          <strong>Allergen review needed:</strong> {allergenReviewText(plan.priceGaps)} Check these against the product label before the allergen grid goes to a client.
        </p>}
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Dish costs">
            <thead><tr>
              <th scope="col">Dish / recipe</th><th scope="col">Amount</th><th scope="col" className={styles.number}>Batches</th>
              <th scope="col" className={styles.number}>Food cost</th><th scope="col" className={styles.number}>Per guest</th><th scope="col" className={styles.number}>Share</th>
            </tr></thead>
            {plan.sections.map((section) => <tbody key={section.name}>
              <tr><th scope="rowgroup" colSpan={6} className="bg-zinc-100">{section.name}</th></tr>
              {section.rows.map((row) => <tr key={row.id}>
                <th scope="row">{row.title}{(row.menuTitle || row.kind === "item") && <span className="block text-xs font-normal text-zinc-600">{row.kind === "item" ? `Raw ingredient${row.menuTitle ? ` · ${row.recipeName}` : ""}` : row.recipeName}</span>}
                  {row.issue && <span className="block text-xs font-normal text-amber-800">{ISSUE_TEXT[row.issue]}</span>}</th>
                <td className="text-xs">{describeQuantity(row, menu.guestCount, num)}</td>
                <td className={styles.number}>{row.issue ? "—" : row.kind === "item" ? "Purchased" : `${num(row.batches)} × ${num(row.yieldQty)} ${unitLabel(row.yieldUnit)}`}</td>
                <td className={styles.number}>{money(row.cost)}</td>
                <td className={styles.number}>{money(row.costPerGuest)}</td>
                <td className={styles.number}>{pct(row.cost != null && plan.totalCost > 0 ? (row.cost / plan.totalCost) * 100 : null)}</td>
              </tr>)}
            </tbody>)}
            <tfoot><tr>
              <th scope="row" colSpan={3}>Total</th>
              <td className={styles.number}><strong>{money(plan.totalCost)}</strong></td>
              <td className={styles.number}><strong>{money(plan.costPerGuest)}</strong></td>
              <td />
            </tr></tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-700">Food cost uses current ingredient prices, including nested sub-recipes. It excludes labor, disposables and service. Prices change as invoices are approved, so reprint before sending.</p>
        {menu.notes && <p className="mt-3 whitespace-pre-line text-sm"><strong>Internal notes:</strong> {menu.notes}</p>}
      </section>}

      {/* 3 · Allergens */}
      <section className={`${styles.sheet} ${styles.nextSheet}`} aria-labelledby="custom-packet-allergens">
        <SectionHeader id="custom-packet-allergens" title="Allergen grid" eventLabel={eventLabel} />
        <p className="text-sm text-zinc-700">From recorded tags on each recipe, its ingredients and its sub-recipes. Verify product labels and cross-contact before sharing with guests.</p>
        {allergenRows.length > 0 ? <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>
              <th scope="col">Dish</th>
              {MAJOR_ALLERGENS.map((a) => <th key={a.key} scope="col" className="text-center text-[10px]">{a.label}</th>)}
              <th scope="col">Other tags</th>
            </tr></thead>
            <tbody>{allergenRows.map(({ row, keys }) => <tr key={row.id}>
              <th scope="row">{row.title}</th>
              {MAJOR_ALLERGENS.map((a) => <td key={a.key} className="text-center font-semibold">{keys?.includes(a.key) ? "●" : ""}</td>)}
              <td className="text-xs">{keys == null ? "Not linked — verify" : otherAllergens.filter((a) => keys.includes(a.key)).map((a) => a.label).join(", ") || (keys.length ? "" : "None recorded — verify")}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="mt-3 text-sm text-zinc-600">No dishes to review.</p>}
      </section>

      {/* 4 · Scaled recipes */}
      <section className={styles.nextSheet} aria-labelledby="custom-packet-recipes">
        <SectionHeader id="custom-packet-recipes" title="Scaled recipes" eventLabel={eventLabel} />
        {purchased.length > 0 && <div className="mb-6 break-inside-avoid border border-zinc-300 p-3">
          <h3 className="text-sm font-semibold">Purchased items — no recipe</h3>
          <ul className="mt-1 text-sm">{purchased.map((row) => <li key={row.id}>{row.title}{row.menuTitle ? ` (${row.recipeName})` : ""}: {describeQuantity(row, menu.guestCount, num)}</li>)}</ul>
        </div>}
        {builds.length === 0 && purchased.length === 0 && <p className="text-sm text-zinc-600">No recipes to scale yet.</p>}
        {shared.length > 0 && <>
          <h3 className="mb-4 border-b border-zinc-300 pb-1 font-display text-2xl text-ink print:break-after-avoid">Shared builds — make these first</h3>
          <div className="recipe-packet-builds space-y-8">
            {shared.map((b) => <SharedBuildCard key={b.node.id} build={b} byId={tree} sharedRefs={sharedRefs} context={<p>{eventLabel}</p>} />)}
          </div>
          <h3 className="mb-4 mt-8 border-b border-zinc-300 pb-1 font-display text-2xl text-ink print:break-after-avoid">Dishes</h3>
        </>}
        <div className="recipe-packet-builds space-y-8">
          {builds.map((b) => <RecipeBuildCard key={b.node.id} node={b.node} byId={tree} totalBatches={b.totalBatches}
            compact={false} depth={0} stack={new Set()} sharedRefs={sharedRefs}
            context={<>
              <p className="font-medium text-[#4B1F3B]">{eventLabel}</p>
              <ul className="mt-1 space-y-0.5">{b.uses.map((use) => <li key={use.id}>{use.title}: {describeQuantity(use, menu.guestCount, num)}</li>)}</ul>
            </>} />)}
        </div>
      </section>

      {/* 5 · Pull list */}
      {plan.shoppingList.itemCount > 0 && <section className={`${styles.sheet} ${styles.nextSheet}`} aria-labelledby="custom-packet-pull">
        <SectionHeader id="custom-packet-pull" title="Ingredient pull list" eventLabel={eventLabel} />
        <p className="text-sm text-zinc-700">Combined raw ingredients for every dish and sub-recipe, before inventory and pack rounding.</p>
        {plan.shoppingList.unscaledRecipes.length > 0 && <p className="mt-2 text-sm font-semibold">Verify scaling for: {plan.shoppingList.unscaledRecipes.join(", ")}.</p>}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col" className="w-6"><span className="sr-only">Pulled</span></th><th scope="col">Ingredient</th><th scope="col" className={styles.number}>Quantity</th></tr></thead>
            {plan.shoppingList.categories.map((category) => <tbody key={category.category}>
              <tr><th scope="rowgroup" colSpan={3} className="bg-zinc-100">{category.category}</th></tr>
              {category.items.map((item) => <tr key={item.itemId}>
                <td><span aria-hidden className="inline-block h-3 w-3 border border-zinc-500" /></td>
                <th scope="row" className="font-normal">{item.name}</th>
                <td className={styles.number}>{item.amounts.map((amount) => `${num(amount.qty)} ${amount.unit}`).join(" + ")}</td>
              </tr>)}
            </tbody>)}
          </table>
        </div>
      </section>}
    </div>
  );
}


function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-zinc-300 px-2 py-1.5">
      <dt className="text-xs text-zinc-700">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
      {detail && <dd className="text-xs text-zinc-600">{detail}</dd>}
    </div>
  );
}

function SectionHeader({ id, title, eventLabel }: { id: string; title: ReactNode; eventLabel: string }) {
  return (
    <header className="mb-3 border-b-2 border-ink pb-2 print:break-after-avoid">
      <p className="text-xs text-zinc-600">{eventLabel}</p>
      <h2 id={id} className="mt-1 font-display text-2xl text-ink">{title}</h2>
    </header>
  );
}
