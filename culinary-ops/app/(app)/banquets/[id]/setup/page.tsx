import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasRole, requireUser } from "@/lib/session";
import { readSetup } from "@/lib/banquet-setup";
import { SetupEditor } from "./SetupEditor";

export default async function BanquetSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const banquet = await prisma.banquet.findUnique({
    where: { id }, include: { venue: true, menuItems: { include: { recipe: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!banquet) notFound();
  return <div className="atelier-packet mx-auto max-w-6xl">
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link className="text-sm text-blue-600 hover:underline" href={`/banquets/${id}`}>← Back to banquet</Link>
      <Link className="text-sm text-blue-600 hover:underline" href={`/banquets/${id}/packet`}>Cook packet →</Link>
    </div>
    <div className="no-print mb-5"><h1 className="font-display text-3xl">Setup & vessel pull</h1><p className="mt-1 text-sm text-zinc-500">{banquet.name} · {banquet.venue.name}</p></div>
    <SetupEditor id={id} initialPlan={readSetup(banquet.setupPlan)} initialRevision={banquet.setupRevision}
      canEdit={hasRole(user, "MANAGER")}
      menu={banquet.menuItems.map(m => ({ id: m.id, name: m.recipe.name, orderedQty: m.orderedQty, unit: m.unit }))}
      event={{ name: banquet.name, venue: banquet.venue.name, date: banquet.date.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }),
        guestCount: banquet.guestCount, timeLabel: banquet.timeLabel, location: banquet.location, areas: banquet.areas,
        setupNotes: banquet.setupNotes, specialInstructions: banquet.specialInstructions }} />
  </div>;
}
