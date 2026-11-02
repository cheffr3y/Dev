import Link from "next/link";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { prisma } from "@/lib/db/prisma";
import { chicagoToday } from "@/lib/prep/prep-dates";
import { Card, PageHeader } from "@/components/ui";
import { NewPreservationForm } from "../PreservationForms";

export default async function NewPreservationPage() {
  const user = await requirePrepUser();
  const [venues, recipes, items] = await Promise.all([
    prisma.venue.findMany({ where: user.role === "STAFF" ? { id: user.homeVenueId ?? "no-assigned-venue" } : {}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
  ]);
  return <div><Link href="/production/preservation" className="text-sm underline">← Preservation batches</Link><PageHeader title="New preservation batch" subtitle="Record initial net weight, reviewed input cost and assigned label dates." /><Card className="max-w-5xl p-4 sm:p-6">{venues.length ? <NewPreservationForm venues={venues} recipes={recipes} items={items.map(item => ({ id: item.id, name: `${item.name} · cost per ${item.unit}` }))} today={chicagoToday()} defaultVenue={user.homeVenueId ?? venues[0].id} /> : <p>A manager must assign your venue before you can start a batch.</p>}</Card></div>;
}
