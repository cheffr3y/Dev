import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser, hasRole } from "@/lib/auth/session";
import { getVenues } from "@/lib/venues/venue";
import { buildCustomMenuPlan, CUSTOM_MENU_STATUSES, formatMenuDate } from "@/lib/menus/custom-menu";
import { customMenuRecipeSelect } from "@/lib/menus/custom-menu-data";
import { money, pct } from "@/lib/recipes/costing";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CustomMenuForm } from "./CustomMenuForms";

export default async function CustomMenusPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");
  const [menus, venues] = await Promise.all([
    prisma.customMenu.findMany({ include: { venue: true, items: true }, orderBy: [{ date: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }] }),
    getVenues(),
  ]);
  const recipes = menus.some((menu) => menu.items.length) ? await prisma.recipe.findMany({ select: customMenuRecipeSelect }) : [];

  return <div>
    <PageHeader title="Custom Menus" subtitle="One-off menus for a single occasion: cost them, then print a packet with recipes, allergens and descriptions." />
    {canEdit && <details className="mb-8" open={menus.length === 0}>
      <summary className="cursor-pointer font-medium text-gold">+ New custom menu</summary>
      <Card className="mt-3 p-5"><CustomMenuForm venues={venues} defaultVenueId={user.homeVenueId} /></Card>
    </details>}
    {menus.length === 0 && <Card className="p-10 text-center text-zinc-500">No custom menus yet. Start one for an internal event, a pop-up or a tasting.</Card>}
    {CUSTOM_MENU_STATUSES.map((status) => {
      const matches = menus.filter((menu) => menu.status === status);
      if (!matches.length) return null;
      return <section key={status} className="mb-8">
        <h2 className="mb-3 font-mono text-xs tracking-widest text-gold">{status}</h2>
        <div className="grid gap-4 lg:grid-cols-2">{matches.map((menu) => {
          const plan = buildCustomMenuPlan(menu, menu.items, recipes);
          const when = [formatMenuDate(menu.date, "short") ?? "No date yet", menu.serviceTime, menu.venue?.name].filter(Boolean).join(" · ");
          return <Card key={menu.id} className="p-5">
            <div className="flex justify-between gap-3">
              <Link href={`/custom-menus/${menu.id}`} className="font-display text-2xl text-ink hover:underline">{menu.name}</Link>
              <Badge>{menu.items.length} {menu.items.length === 1 ? "dish" : "dishes"}</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{when}</p>
            <p className="mt-3 font-mono text-xs text-zinc-600">
              {menu.guestCount} guests · Food cost {money(plan.totalCost)}{plan.costPerGuest != null && ` · ${money(plan.costPerGuest)} per guest`}
              {plan.fcp != null && ` · ${pct(plan.fcp)} of price`}
            </p>
            {plan.issueCount > 0 && <p className="mt-2 text-xs text-amber-800">{plan.issueCount} {plan.issueCount === 1 ? "dish needs" : "dishes need"} a quantity check</p>}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gold">
              <Link href={`/custom-menus/${menu.id}/packet`} className="underline">Full packet (with costing)</Link>
              <Link href={`/custom-menus/${menu.id}/packet?copy=kitchen`} className="underline">Kitchen / client copy</Link>
            </div>
          </Card>;
        })}</div>
      </section>;
    })}
  </div>;
}
