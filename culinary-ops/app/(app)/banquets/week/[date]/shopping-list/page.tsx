import { redirect, notFound } from "next/navigation";
import { requirePrepUser } from "@/lib/prep-session";
import { prisma } from "@/lib/prisma";
import { dateFromParam, startOfUtcWeek, addDays, isoDate } from "@/lib/banquet-week";

export default async function WeekShoppingList({ params }: { params: Promise<{ date: string }> }) {
  await requirePrepUser();
  const { date } = await params;
  const requested = dateFromParam(date);
  if (!requested) notFound();
  const start = startOfUtcWeek(requested), end = addDays(start, 7);
  const events = await prisma.banquet.findMany({ where: { date: { gte: start, lt: end }, status: { in: ["PLANNED", "CONFIRMED"] } }, select: { id: true } });
  const query = new URLSearchParams({ from: isoDate(start), to: isoDate(addDays(start, 6)), view: "shopping" });
  for (const event of events) query.append("source", `banquet:${event.id}`);
  redirect(`/production?${query}`);
}
