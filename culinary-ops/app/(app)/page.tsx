import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { prisma } from "@/lib/prisma";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { num } from "@/lib/costing";

const STATUS_COLOR: Record<string, "gray" | "blue" | "green" | "amber" | "red"> = {
  PLANNED: "amber",
  CONFIRMED: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const { active } = await getActiveVenue(user.homeVenueId);

  const [recipeCount, itemCount, venueCount, vendorCount, lowStock, upcoming] = await Promise.all([
    prisma.recipe.count(),
    prisma.item.count(),
    prisma.venue.count(),
    prisma.vendor.count(),
    active
      ? prisma.inventoryItem.findMany({
          where: { venueId: active.id },
          include: { item: true },
        })
      : Promise.resolve([]),
    prisma.event.findMany({
      where: { date: { gte: new Date() }, status: { not: "CANCELLED" } },
      include: { venue: true, _count: { select: { menuItems: true } } },
      orderBy: { date: "asc" },
      take: 5,
    }),
  ]);

  const lowItems = lowStock.filter((s) => s.quantity < s.par);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={active ? `Working in ${active.name}` : "No venue selected"}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Recipes & Builds" value={recipeCount} href="/recipes" />
        <StatCard label="Catalog Items" value={itemCount} href="/items" />
        <StatCard label="Venues" value={venueCount} href="/venues" />
        <StatCard label="Vendors" value={vendorCount} href="/vendors" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span>Low stock {active ? `· ${active.code}` : ""}</span>
              <Link href="/inventory" className="text-xs font-normal text-blue-600 hover:underline">
                View inventory
              </Link>
            </div>
          </CardHeader>
          {lowItems.length === 0 ? (
            <div className="p-5">
              <p className="text-sm text-zinc-500">Everything is at or above par. 🎉</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {lowItems.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-zinc-800">{s.item.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-zinc-500">
                      {num(s.quantity)} / {num(s.par)} {s.unit}
                    </span>
                    <Badge color="red">Low</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span>Upcoming events</span>
              <Link href="/events" className="text-xs font-normal text-blue-600 hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          {upcoming.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No upcoming events" hint="Plan one from the Events page." />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {upcoming.map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <Link href={`/events/${e.id}`} className="flex items-center justify-between">
                    <span>
                      <span className="font-medium text-zinc-800">{e.name}</span>
                      <span className="ml-2 text-zinc-400">
                        {e.venue.code} · {e.guestCount} guests · {e._count.menuItems} dishes
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-zinc-500">
                        {e.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <Badge color={STATUS_COLOR[e.status]}>{e.status.toLowerCase()}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
