import Link from "next/link";
import { hasRole } from "@/lib/auth/session";
import { requirePrepUser } from "@/lib/auth/prep-session";
import { getActiveVenue } from "@/lib/venues/venue";
import { loadMorningPulse } from "@/lib/dashboard/morning-pulse-data";
import { addDays, fmtShortDate } from "@/lib/banquets/banquet-week";
import { businessDate } from "@/lib/prep/prep-dates";
import { pct } from "@/lib/recipes/costing";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";

export default async function DashboardPage() {
  const user = await requirePrepUser();
  const { active } = await getActiveVenue(user.homeVenueId);
  const admin = user.role === "ADMIN";
  const pulse = await loadMorningPulse(active?.id ?? null, admin);
  const { integrity, margins, queue, dates } = pulse;
  const load = [
    ...pulse.banquets.map(row => ({ ...row, kind: "Banquet", href: `/banquets/${row.id}`, detail: `${row.guestCount} pax · ${row.venue.code}` })),
    ...pulse.events.map(row => ({ ...row, kind: "Event", href: `/events/${row.id}`, detail: `${row.guestCount} pax · ${row.venue.code}` })),
    ...pulse.festivals.map(row => ({ ...row, kind: "Festival", href: `/festivals/${row.id}`, detail: `${row.expectedAttendance} expected attendees` })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name));
  const guests = [...pulse.banquets, ...pulse.events].reduce((sum, row) => sum + row.guestCount, 0);

  return (
    <div>
      <PageHeader title="Morning Pulse"
        subtitle={`${fmtShortDate(dates.start)} · ${active?.name ?? "All venues"} · Welcome, ${user.name.split(" ")[0]}`}
        action={<LinkButton href={`/banquets/week/${dates.week}`} variant="secondary">This week’s banquet prep</LinkButton>} />
      <p className="mb-5 text-sm text-zinc-500">Your next seven days, cost exceptions, and work awaiting closeout. Use ⌘K / Ctrl+K for quick actions.</p>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><h2>Costing & price integrity</h2></CardHeader>
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <p><strong className="text-3xl tabular-nums text-ink">{integrity.total}</strong><span className="ml-2 text-sm text-zinc-500">ingredients need attention</span></p>
              <Badge color={integrity.total ? "amber" : "green"}>{integrity.total ? "Review needed" : "Complete"}</Badge>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
              <div><dt>Missing cost</dt><dd className="mt-1 text-lg tabular-nums text-ink">{integrity.missingCost}</dd></div>
              <div><dt>Missing unit</dt><dd className="mt-1 text-lg tabular-nums text-ink">{integrity.missingUnit}</dd></div>
              <div><dt>No vendor</dt><dd className="mt-1 text-lg tabular-nums text-ink">{integrity.missingVendor}</dd></div>
            </dl>
            <p className="text-xs text-zinc-500">Company-wide · {integrity.inUse} ingredients used in recipes, inventory, order guides, or festival counts. Each ingredient counts once in the total.</p>
            <LinkButton href={hasRole(user, "MANAGER") ? "/items/cleanup#price-integrity" : "/items?flag=integrity"} variant="secondary">Review ingredient integrity →</LinkButton>
          </div>
        </Card>

        <Card>
          <CardHeader><h2>This week’s event & banquet load</h2></CardHeader>
          <div className="p-4">
            <p className="text-3xl font-semibold tabular-nums text-ink">{load.length}<span className="ml-2 text-sm font-normal text-zinc-500">scheduled · {guests} banquet / event pax</span></p>
            <p className="mt-2 text-xs text-zinc-500">{fmtShortDate(dates.start)} – {fmtShortDate(addDays(dates.end, -1))} · {pulse.banquets.length} {pulse.banquets.length === 1 ? "banquet" : "banquets"} · {pulse.events.length} {pulse.events.length === 1 ? "event" : "events"} · {pulse.festivals.length} {pulse.festivals.length === 1 ? "festival" : "festivals"}</p>
          </div>
          {load.length ? <ul className="divide-y divide-hairline">
            {load.slice(0, 7).map(row => <li key={`${row.kind}-${row.id}`}>
              <Link href={row.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-stone">
                <span className="min-w-0"><span className="block font-medium text-ink">{row.name}</span><span className="text-xs text-zinc-500">{row.kind} · {row.detail}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-500">{fmtShortDate(row.date)}</span>
              </Link>
            </li>)}
          </ul> : <p className="px-4 pb-4 text-sm text-zinc-500">No active events scheduled in the next seven days.</p>}
          {load.length > 7 && <p className="p-4 text-xs text-zinc-500">Showing the next 7 of {load.length}. <Link href="/banquets" className="underline">Banquets</Link> · <Link href="/events" className="underline">Events</Link> · <Link href="/festivals" className="underline">Festivals</Link></p>}
        </Card>

        <Card>
          <CardHeader><h2>Prep & closeout queue</h2></CardHeader>
          <div className="p-4">
            {queue ? <>
              <p className="text-3xl font-semibold tabular-nums text-ink">{queue.length}<span className="ml-2 text-sm font-normal text-zinc-500">open days · {queue.reduce((sum, row) => sum + row.transfers, 0)} transfers awaiting closeout</span></p>
              <p className="mt-2 text-xs text-zinc-500">Company-wide · Today and earlier · Oldest unfinished day first</p>
              {queue.length === 0 && <p className="mt-3 text-sm text-zinc-500">No unfinished prep days or transfers.</p>}
            </> : <p className="text-sm text-zinc-500">Daily closeout and transfer accounting are managed by admins. View today’s shared prep list for production work.</p>}
          </div>
          {queue && queue.length > 0 && <ul className="divide-y divide-hairline">{queue.slice(0, 5).map(row => <li key={row.day}>
            <Link href={`/prep-orders/closeout?date=${row.day}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-stone">
              <span className="tabular-nums text-ink">{businessDate(row.day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
              <span className="text-xs tabular-nums text-zinc-500">{row.requests} {row.requests === 1 ? "order" : "orders"} · {row.batches} {row.batches === 1 ? "batch" : "batches"} · {row.transfers} {row.transfers === 1 ? "transfer" : "transfers"}</span>
            </Link>
          </li>)}</ul>}
          {queue && queue.length > 5 && <details className="px-4 pt-3"><summary className="cursor-pointer text-xs text-zinc-500">Show {queue.length - 5} more open days</summary><ul className="mt-2 space-y-2">{queue.slice(5).map(row => <li key={row.day}><Link href={`/prep-orders/closeout?date=${row.day}`} className="text-sm underline">{row.day}</Link></li>)}</ul></details>}
          <div className="flex flex-wrap gap-2 p-4">
            <LinkButton href={`/prep-orders?date=${dates.day}`} variant="secondary">Daily prep</LinkButton>
            {admin && <LinkButton href={`/prep-orders/closeout?date=${dates.day}`} variant="secondary">Open today’s closeout →</LinkButton>}
          </div>
        </Card>

        <Card>
          <CardHeader><h2>Menu margin watchlist</h2></CardHeader>
          <div className="p-4">
            <p className="text-3xl font-semibold tabular-nums text-ink">{margins.rows.length}<span className="ml-2 text-sm font-normal text-zinc-500">{margins.rows.length === 1 ? "dish" : "dishes"} above target</span></p>
            <p className="mt-2 text-xs text-zinc-500">{pulse.activeMenus} active menus · Selected venue and company-wide menus · Current catalog costs</p>
            {margins.needsReview > 0 && <p className="mt-3 text-xs text-amber-700">{margins.needsReview} {margins.needsReview === 1 ? "dish needs" : "dishes need"} price, yield, or unit review before a reliable margin can be calculated.</p>}
            {!margins.rows.length && <p className="mt-3 text-sm text-zinc-500">{pulse.activeMenus ? "No fully costed dishes are above target." : "No active menus in this view."}</p>}
          </div>
          {margins.rows.length > 0 && <ul className="divide-y divide-hairline">{margins.rows.slice(0, 5).map(row => <li key={row.id}>
            <Link href={`/menus/${row.menuId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-stone">
              <span className="min-w-0"><span className="block font-medium text-ink">{row.title}</span><span className="text-xs text-zinc-500">{row.menuName}{row.stale ? " · Stale ingredient prices" : ""}</span></span>
              <span className="shrink-0 text-right"><Badge color="red">{pct(row.fcp)}</Badge><span className="mt-1 block text-xs tabular-nums text-zinc-500">Target {pct(row.target)}</span></span>
            </Link>
          </li>)}</ul>}
          <div className="p-4"><Link href="/menus" className="text-sm text-blue-600 hover:underline">{margins.rows.length > 5 ? `Review all menus · ${margins.rows.length - 5} more flagged dishes →` : "Review menus →"}</Link></div>
        </Card>
      </div>
    </div>
  );
}
