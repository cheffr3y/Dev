"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, Input, Select } from "./ui";
import { allergenLabels } from "@/lib/recipes/allergens";
import { money, preciseNum } from "@/lib/recipes/costing";
import { allowedUnitsFor } from "@/lib/recipes/units";
import { buildDependencyPlan, type ConsumerBranch, type DependencyBranch, type DependencyRecipe, type DependencyTotal } from "@/lib/recipes/recipe-dependencies";

const estimatedMoney = (value: number | null) => value !== null && value > 0 && value < 0.00001 ? "<$0.00001" : money(value, value !== null && value > 0 && value < 0.01 ? 5 : 2);

export function RecipeDependencyTree({ rootId, recipes, consumers, asOf }: {
  rootId: string; recipes: DependencyRecipe[]; consumers: { branches: ConsumerBranch[]; truncated: boolean }; asOf: string;
}) {
  const root = recipes.find(recipe => recipe.id === rootId);
  const [quantity, setQuantity] = useState(String(root?.yieldQty ?? 1));
  const [unit, setUnit] = useState(root?.yieldUnit ?? "each");
  const [expanded, setExpanded] = useState(false);
  const validQuantity = quantity.trim() !== "" && Number.isFinite(Number(quantity)) && Number(quantity) > 0 && Number(quantity) <= 100000000;
  const plan = useMemo(() => buildDependencyPlan(rootId, recipes, validQuantity ? Number(quantity) : NaN, unit, new Date(asOf)), [rootId, recipes, validQuantity, quantity, unit, asOf]);
  const units = root ? [...new Set([root.yieldUnit, ...allowedUnitsFor(root.yieldUnit)])] : [];
  if (!plan || !root) return null;
  return <Card className="mt-6 min-w-0" >
    <section aria-label="Recipe dependency and rollup explorer" className="recipe-dependency-explorer">
      <CardHeader>Dependency &amp; Rollup Tree</CardHeader>
      <div className="space-y-5 p-4">
        <p className="text-sm text-zinc-500">Explore this recipe’s inputs and where it is used. Preview quantities use current recipe yields and catalog prices. Each share is a percentage of its immediate parent’s ingredient cost.</p>
        <form className="no-print flex flex-wrap items-end gap-3" onSubmit={event => event.preventDefault()}>
          <label className="min-w-0 text-sm">Preview quantity<Input aria-label="Dependency preview quantity" type="number" min="0.000001" max="100000000" step="any" value={quantity} onChange={event => setQuantity(event.target.value)} aria-invalid={!validQuantity || undefined} /></label>
          <label className="min-w-0 text-sm">Yield unit<Select aria-label="Dependency preview unit" value={unit} onChange={event => setUnit(event.target.value)}>{units.map(value => <option key={value} value={value}>{value}</option>)}</Select></label>
          <button type="button" className="rounded border border-hairline px-3 py-2 text-sm" onClick={() => { setQuantity(String(root.yieldQty)); setUnit(root.yieldUnit); }}>Reset to standard yield</button>
        </form>
        <p className="text-xs text-zinc-500">Preview only; saved recipes and orders are unchanged. Guest counts require a defined portion yield. Weight and volume yields use compatible quantities.</p>
        {!validQuantity && <p role="alert" className="text-sm text-red-600">Enter a quantity greater than 0 and at most 100,000,000.</p>}
        <p role="status" className="text-sm"><strong>Preview cost estimate: <span className="tabular-nums" data-testid="dependency-total-cost">{estimatedMoney(plan.root.cost)}</span></strong> · <span className="tabular-nums">{plan.root.batches === null ? "Unknown scale" : `${preciseNum(plan.root.batches)}× standard batch`}</span></p>
        {plan.stale && <p className="text-sm text-amber-700">Stale source prices are present. Cost estimates and shares need current supplier prices.</p>}
        {!plan.complete && <p className="rounded border border-amber-500 p-3 text-sm text-amber-700">Needs review: some costs or quantities are unknown. Known rows remain visible; totals are incomplete and affected cost shares are omitted.</p>}
        {plan.truncated && <p role="alert" className="text-sm text-amber-700">Large or deeply nested build: this preview is limited to 500 entries and 32 recipe levels. Demand totals below are partial.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Inputs feeding this recipe</h3><button type="button" className="no-print text-sm underline" onClick={() => setExpanded(value => !value)}>{expanded ? "Collapse branches" : "Expand all branches"}</button></div>
        <ul className="min-w-0"><InputBranch key={`${expanded}`} node={plan.root} expanded={expanded} root /></ul>
        <div className="grid min-w-0 gap-5 xl:grid-cols-2"><DemandTotals title="Total raw ingredient demand" rows={plan.ingredients} partial={!plan.complete} /><DemandTotals title="Total sub-recipe demand" rows={plan.subRecipes} partial={!plan.complete} /></div>
        <p className="text-xs text-zinc-500">Sub-recipe costs include their nested inputs. Do not add costs across tiers.</p>
        <div className="border-t border-hairline pt-4"><h3 className="font-semibold">Where this recipe is used</h3><p className="mt-1 text-xs text-zinc-500">Saved parent builds, menu plans and banquet orders, including indirect uses. Statuses distinguish current and historical plans. These saved uses do not change when preview quantities change.</p>
          {!consumers.branches.length ? <p className="mt-3 text-sm text-zinc-500">No parent recipes, menus or banquets currently reference this recipe.</p> : <ul className="mt-3 min-w-0"><ConsumerBranches branches={consumers.branches} /></ul>}
          {consumers.truncated && <p className="text-sm text-amber-700">Consumer tree limited to 300 entries and 32 recipe levels. Open a parent recipe to continue exploring.</p>}
        </div>
      </div>
    </section>
  </Card>;
}

function InputBranch({ node, expanded, root = false }: { node: DependencyBranch; expanded: boolean; root?: boolean }) {
  const label = <><Link href={node.kind === "recipe" ? `/recipes/${encodeURIComponent(node.id)}` : `/items?q=${encodeURIComponent(node.name)}`} className="font-medium underline">{node.name}</Link><span className="ml-2 tabular-nums">{node.quantity === null ? "Unknown quantity" : preciseNum(node.quantity)} {node.unit}</span></>;
  const body = <>
    <p className="mt-1 text-xs tabular-nums">{estimatedMoney(node.cost)} estimated cost{node.kind === "recipe" && ` · ${node.batches === null ? "Unknown" : preciseNum(node.batches)}× batch`}{!root && ` · ${node.share === null ? "Share unavailable" : `${preciseNum(node.share)}% of parent cost`}`}</p>
    <p className="mt-1 text-xs text-zinc-500">Allergens: {allergenLabels(node.allergens) || "No recorded tags"}{node.inherited.length > 0 && ` · Inherited: ${allergenLabels(node.inherited)}`}</p>
    {node.issues.map(issue => <p key={issue} className="mt-1 text-xs text-amber-700">{issue}</p>)}
    {node.children.length > 0 && <ul className="mt-2 min-w-0 border-l border-hairline pl-3 sm:pl-4">{node.children.map(child => <InputBranch key={child.key} node={child} expanded={expanded} />)}</ul>}
  </>;
  return <li className="min-w-0 break-words py-2" data-dependency-id={node.id}>
    {node.children.length ? <details open={expanded || root || undefined}><summary className="cursor-pointer text-sm">{label}</summary><div className="pl-2">{body}</div></details> : <div className="text-sm">{label}{body}</div>}
  </li>;
}
function DemandTotals({ title, rows, partial }: { title: string; rows: DependencyTotal[]; partial: boolean }) {
  return <section className="min-w-0" aria-label={title}><h3 className="font-semibold">{title}{partial && " (partial)"}</h3>{!rows.length ? <p className="mt-2 text-sm text-zinc-500">No demand recorded.</p> : <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Item</th><th className="text-right">Needed</th><th className="text-right">Cost estimate</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.id}:${row.unit}`} className="border-t border-hairline"><th className="break-words py-2 text-left font-normal">{row.name}</th><td className="px-2 text-right tabular-nums">{row.quantity === null ? "Unknown" : preciseNum(row.quantity)} {row.unit}</td><td className="text-right tabular-nums">{estimatedMoney(row.cost)}</td></tr>)}</tbody></table></div>}</section>;
}
function ConsumerBranches({ branches }: { branches: ConsumerBranch[] }) {
  return <>{branches.map(branch => <li key={branch.key} className="min-w-0 break-words py-2 text-sm">{branch.children.length ? <details><summary className="cursor-pointer"><Link href={branch.href} className="font-medium underline">{branch.name}</Link> · {branch.detail}</summary><ul className="ml-2 mt-2 border-l border-hairline pl-3"><ConsumerBranches branches={branch.children} /></ul></details> : <><Link href={branch.href} className="font-medium underline">{branch.name}</Link><p className="text-xs text-zinc-500">{branch.detail}</p></>}</li>)}</>;
}
