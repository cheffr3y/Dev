import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { dateFromParam, startOfUtcWeek, addDays, isoDate, fmtWeekRange } from "@/lib/banquets/banquet-week";
import { PageHeader, LinkButton, Card } from "@/components/ui";
import { preciseNum } from "@/lib/recipes/costing";
import { PrintController } from "@/components/PrintController";
import { PrintSpecHeader } from "@/components/PrintSpecHeader";

export default async function BanquetWeek({ params }: { params: Promise<{ date: string }> }) {
  await requirePrepUser();
  const { date } = await params;
  const requested = dateFromParam(date);
  if (!requested) notFound();
  const start = startOfUtcWeek(requested), end = addDays(start, 7);
  const banquets = await prisma.banquet.findMany({ where: { date: { gte: start, lt: end }, status: { in: ["PLANNED", "CONFIRMED"] } }, include: { venue: true, menuItems: { include: { recipe: { select: { name: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: [{ date: "asc" }, { name: "asc" }] });
  return <PrintController>
    <div className="no-print mb-5"><PageHeader title="Weekly banquet prep" subtitle={fmtWeekRange(start)} /><div className="flex flex-wrap gap-3">
      <LinkButton href="/banquets" variant="secondary">Banquets</LinkButton><LinkButton href={`/banquets/week/${isoDate(addDays(start, -7))}`} variant="secondary">Previous week</LinkButton><LinkButton href={`/banquets/week/${isoDate(addDays(start, 7))}`} variant="secondary">Next week</LinkButton>
      <LinkButton href={`/banquets/week/${isoDate(start)}/shopping-list`} variant="secondary">Combined shopping list</LinkButton><LinkButton href={`/banquets/week/${isoDate(start)}/packet`}>Event cook packets</LinkButton>
    </div></div>
    <PrintSpecHeader venue="Banquets" title="Weekly event prep" targetLabel={fmtWeekRange(start)} printedAt={new Date()} />
    <p className="my-4 text-sm">{banquets.length} active events · Each event keeps its own prep and cook packet. Use the combined shopping list for purchasing.</p>
    {!banquets.length && <Card className="p-5">No active banquets this week.</Card>}
    {banquets.map(b => <article key={b.id} className="event-work-sheet atelier-paper mb-5 border border-hairline p-4">
      <h2 className="text-xl font-semibold">{b.name}</h2><p className="mt-1 text-sm">{isoDate(b.date)} · {b.timeLabel || "Service time to confirm"} · {b.venue.name} · {b.guestCount} guests</p><p className="text-sm">{[b.location, b.areas].filter(Boolean).join(" · ")}</p>
      {b.specialInstructions && <p className="my-3 whitespace-pre-wrap border-l-2 border-gold pl-3 text-sm font-semibold">{b.specialInstructions}</p>}{b.notes && <p className="my-2 whitespace-pre-wrap text-sm">{b.notes}</p>}
      <div className="no-print my-3 flex flex-wrap gap-4 text-sm"><Link className="text-gold underline" href={`/banquets/${b.id}`}>Event details</Link><Link className="text-gold underline" href={`/banquets/${b.id}/prep-sheet`}>Event prep sheet</Link><Link className="text-gold underline" href={`/banquets/${b.id}/packet`}>Event cook packet</Link></div>
      <p className="print-write-in text-sm">Prep ready by: ____________________ · Assigned cook: ____________________</p>
      <div className="overflow-x-auto"><table className="atelier-table mt-3 w-full text-left text-sm"><thead><tr><th>Dish</th><th>Event quantity</th><th>Instructions</th><th>Done / initials</th></tr></thead><tbody>{b.menuItems.map(l => <tr key={l.id}><td>{l.recipe.name}</td><td className="tabular-nums">{preciseNum(l.orderedQty)} {l.unit}</td><td className="whitespace-pre-wrap">{l.description}</td><td className="print-write-in">[  ] __________</td></tr>)}</tbody></table></div>
    </article>)}
  </PrintController>;
}
