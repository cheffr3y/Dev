import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { num } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { PrintButton } from "@/components/PrintButton";

// Kitchen-facing recipe card: ingredients, method, critical food-safety data
// and storage — no costs or margins. `?x=N` scales quantities for batches.

const BATCH_OPTIONS = [1, 2, 3, 4];

function parseSteps(instructions: string | null): string[] {
  if (!instructions) return [];
  return instructions
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
}

export default async function RecipePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ x?: string }>;
}) {
  const [{ id }, { x }] = await Promise.all([params, searchParams]);
  await requireUser();

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { items: { include: { item: true }, orderBy: { item: { name: "asc" } } } },
  });
  if (!recipe) notFound();

  const batch = Math.min(Math.max(Number(x) || 1, 0.25), 100);
  const steps = parseSteps(recipe.instructions);
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const updatedOn = recipe.updatedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      {/* Toolbar (screen only) */}
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-blue-600 hover:underline">
          ← Back to recipe
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Batch</span>
          {BATCH_OPTIONS.map((b) => (
            <Link
              key={b}
              href={`/recipes/${recipe.id}/print${b === 1 ? "" : `?x=${b}`}`}
              className={
                b === batch
                  ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              }
            >
              ×{b}
            </Link>
          ))}
          <PrintButton label="Print recipe card" />
        </div>
      </div>

      {/* Recipe card sheet */}
      <div className="print-sheet rounded-xl border border-zinc-200 bg-white p-10 shadow-sm">
        {/* Masthead */}
        <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          <span>Mise · Culinary Ops</span>
          <span>Standardized Recipe</span>
        </div>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{recipe.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {recipe.category}
          {recipe.station ? ` · ${recipe.station} station` : ""}
          {batch !== 1 ? ` · batch ×${num(batch)} (scaled)` : ""}
        </p>

        {/* Spec bar */}
        <div className="mt-5 grid grid-cols-2 gap-px border-y-2 border-zinc-900 bg-zinc-200 sm:grid-cols-4">
          {[
            { label: "Yield", value: `${num(recipe.yieldQty * batch)} ${recipe.yieldUnit}` },
            { label: "Prep", value: recipe.prepMinutes != null ? `${recipe.prepMinutes} min` : "—" },
            { label: "Cook", value: recipe.cookMinutes != null ? `${recipe.cookMinutes} min` : "—" },
            { label: "Total", value: totalMinutes > 0 ? `${totalMinutes} min` : "—" },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">{s.label}</p>
              <p className="mt-0.5 text-base font-semibold text-zinc-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Allergen banner */}
        {recipe.allergens && (
          <div className="mt-5 border-2 border-zinc-900 px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-900">
              Contains allergens:
            </span>{" "}
            <span className="text-sm font-semibold uppercase text-zinc-900">{recipe.allergens}</span>
          </div>
        )}

        {/* Ingredients */}
        <h2 className="mt-8 border-b border-zinc-200 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
          Ingredients
        </h2>
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400">
              <th className="w-20 py-2 pr-3 text-right font-medium">Qty</th>
              <th className="w-16 py-2 pr-4 font-medium">Unit</th>
              <th className="py-2 pr-4 font-medium">Ingredient</th>
              <th className="py-2 font-medium">Prep / Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {recipe.items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-zinc-400">
                  No ingredients recorded.
                </td>
              </tr>
            )}
            {recipe.items.map((ri) => (
              <tr key={ri.id}>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums text-zinc-900">
                  {num(ri.quantity * batch)}
                </td>
                <td className="py-2 pr-4 text-zinc-600">{unitLabel(ri.unit)}</td>
                <td className="py-2 pr-4 text-zinc-900">{ri.item.name}</td>
                <td className="py-2 text-zinc-500">{ri.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Method */}
        <h2 className="mt-8 border-b border-zinc-200 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
          Method
        </h2>
        {steps.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No method recorded.</p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-800">
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-zinc-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Critical food-safety box */}
        {recipe.criticalNotes && (
          <div className="mt-8 border-2 border-zinc-900">
            <div className="border-b-2 border-zinc-900 bg-zinc-900 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
              ⚠ Critical · Food Safety
            </div>
            <p className="whitespace-pre-wrap px-4 py-3 text-sm font-medium leading-relaxed text-zinc-900">
              {recipe.criticalNotes}
            </p>
          </div>
        )}

        {/* Storage */}
        {(recipe.storage || recipe.shelfLife) && (
          <div className="mt-5 border border-zinc-300">
            <div className="border-b border-zinc-200 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900">
              Storage &amp; Shelf Life
            </div>
            <div className="space-y-1.5 px-4 py-3 text-sm leading-relaxed text-zinc-800">
              {recipe.storage && <p className="whitespace-pre-wrap">{recipe.storage}</p>}
              {recipe.shelfLife && (
                <p>
                  <span className="font-semibold">Shelf life:</span> {recipe.shelfLife}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sign-off footer */}
        <div className="mt-10 grid grid-cols-3 gap-6 border-t border-zinc-200 pt-6">
          {["Prepared by", "Date / Time", "Verified by"].map((label) => (
            <div key={label}>
              <div className="h-7 border-b border-zinc-400" />
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
          Printed {printedOn} · Recipe updated {updatedOn}
          {batch !== 1 ? ` · quantities scaled ×${num(batch)}` : ""}
        </p>
      </div>
    </div>
  );
}
