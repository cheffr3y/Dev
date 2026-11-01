import { redirect, notFound } from "next/navigation";
import { requirePrepUser } from "@/lib/prep-session";
import { businessDate } from "@/lib/prep-dates";

// Preserve old day-prep bookmarks while keeping cook work event-specific.
export default async function BanquetDayPage({ params }: { params: Promise<{ date: string }> }) {
  await requirePrepUser();
  const { date } = await params;
  try { businessDate(date); } catch { notFound(); }
  redirect(`/production?${new URLSearchParams({ from: date, to: date, view: "events" })}`);
}
