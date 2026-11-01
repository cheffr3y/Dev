import Link from "next/link";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { getActiveVenue, getVenues } from "@/lib/venues/venue";
import { prisma } from "@/lib/db/prisma";
import { chicagoToday } from "@/lib/prep/prep-dates";
import { operatingMonth } from "@/lib/accounting/operating-calendar";
import { loadOperatingMonth } from "@/lib/accounting/operating-calendar-data";
import { PageHeader, Button, Input, Select, Card } from "@/components/ui";
import { OperatingCalendar } from "./OperatingCalendar";

export default async function MonthlyTracker({ searchParams }: { searchParams: Promise<{ month?: string; venue?: string; day?: string }> }) {
  const user = await requirePrepUser("MANAGER"), query = await searchParams, today = chicagoToday();
  const month = query.month || today.slice(0, 7);
  let range;
  try { range = operatingMonth(month); } catch { return <Card className="p-5"><p role="alert">Choose a valid month between 1900 and 2100.</p><Link className="text-gold underline" href="/operating-calendar">Current month</Link></Card>; }
  const { active } = await getActiveVenue(user.homeVenueId);
  const venues = await getVenues({ includeIds: [query.venue, active?.id] });
  const venue = query.venue ? venues.find(v => v.id === query.venue) : active;
  if (!venue) return <Card className="p-5"><p role="alert">Choose an existing venue to record daily figures.</p><Link className="text-gold underline" href="/operating-calendar">Reset venue selection</Link></Card>;
  const [data, documents] = await Promise.all([loadOperatingMonth(venue.id, month), prisma.invoiceDocument.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, filename: true, vendor: { select: { name: true } }, invoiceNumber: true } })]);
  const href = (next: string) => `/operating-calendar?${new URLSearchParams({ month: next, venue: venue.id })}`;
  return <div className="operating-page"><PageHeader title="Monthly labor, sales & food" subtitle={`${venue.name} · Gross sales · Food purchases by invoice date`} />
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <form className="flex flex-wrap items-end gap-3"><label className="text-sm">Month<Input name="month" type="month" min="1900-01" max="2100-12" defaultValue={month} required /></label><label className="text-sm">Venue<Select name="venue" defaultValue={venue.id}>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></label><Button>Open month</Button></form>
      <div className="flex flex-wrap gap-3 text-sm"><Link className="text-gold underline" href={href(range.previous)}>← Previous</Link><strong>{range.label}</strong><Link className="text-gold underline" href={href(range.next)}>Next →</Link><a className="text-gold underline" href={`/operating-calendar/export?${new URLSearchParams({ month, venue: venue.id })}`}>Export CSV</a><Link className="text-gold underline" href="/vendors/invoices">Invoice documents</Link></div>
    </div>
    <OperatingCalendar key={`${venue.id}:${month}`} month={month} venueId={venue.id} venues={venues.map(v => ({ id: v.id, name: v.name }))} entries={data.entries} expenses={data.expenses} invoices={documents.map(doc => ({ ...doc, vendor: doc.vendor?.name ?? null }))} today={today} initialDay={query.day} />
  </div>;
}
