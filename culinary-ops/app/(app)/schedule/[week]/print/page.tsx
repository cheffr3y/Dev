import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { PrintButton } from "@/components/PrintButton";
import { cn } from "@/components/ui";
import {
  WEEKDAYS,
  addDays,
  computeTotals,
  dateFromParam,
  fmtHours,
  fmtWeekRange,
  isoDate,
  startOfUtcWeek,
  thisWeekStart,
  weekDays,
  weekNumberLabel,
} from "@/lib/schedule";
import {
  DayHeadContent,
  EmployeeCellContent,
  PrintFooter,
  ScheduleColgroup,
  ShiftCellContent,
  type CookLite,
  type DayLite,
} from "../../schedule-ui";

export default async function SchedulePrintPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const user = await requireUser();

  const requested = dateFromParam(week);
  if (!requested) redirect(`/schedule/${isoDate(thisWeekStart())}/print`);

  const weekStart = startOfUtcWeek(requested);
  if (isoDate(weekStart) !== week) redirect(`/schedule/${isoDate(weekStart)}/print`);
  const weekEnd = addDays(weekStart, 7);

  const { active: venue } = await getActiveVenue(user.homeVenueId);
  if (!venue) redirect(`/schedule/${isoDate(weekStart)}`);

  const [cooks, shiftRows, dayNoteRows, weekNote] = await Promise.all([
    prisma.cook.findMany({
      where: { venueId: venue.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
    prisma.shift.findMany({
      where: { date: { gte: weekStart, lt: weekEnd }, cook: { venueId: venue.id } },
      select: { cookId: true, date: true, kind: true, start: true, end: true, role: true, note: true },
    }),
    prisma.dayNote.findMany({
      where: { venueId: venue.id, date: { gte: weekStart, lt: weekEnd } },
      select: { date: true, body: true },
    }),
    prisma.scheduleNote.findUnique({
      where: { venueId_weekStart: { venueId: venue.id, weekStart } },
      select: { body: true },
    }),
  ]);

  const cookList: CookLite[] = cooks;
  const shiftAt = new Map(shiftRows.map((s) => [`${s.cookId}|${isoDate(s.date)}`, { ...s, date: isoDate(s.date) }]));
  const noteAt = new Map(dayNoteRows.map((n) => [isoDate(n.date), n.body]));
  const days: DayLite[] = weekDays(weekStart).map((d, i) => ({
    iso: isoDate(d),
    short: WEEKDAYS[i].short,
    dayNum: d.getUTCDate(),
    weekend: i >= 5,
  }));

  const cellFor = (cookId: string, iso: string) => shiftAt.get(`${cookId}|${iso}`) ?? null;
  const { dayTotals, cookTotals, weekTotal } = computeTotals(cookList, days, cellFor);
  const hasAnyDayNote = dayNoteRows.some((n) => n.body.trim());
  const weekRange = fmtWeekRange(weekStart);

  const cell = "border border-[--sched-border-strong] px-1.5 py-1 align-middle";

  return (
    <div className="print-full">
      {/* Route-scoped landscape page — only present while this print view is
          mounted, so recipe/prep prints keep the global portrait @page. */}
      <style>{"@media print { @page { size: letter landscape; margin: 0.4in; } }"}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href={`/schedule/${isoDate(weekStart)}`} className="text-sm text-blue-600 hover:underline">
          ← Back to editor
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Prints as US Letter landscape.</span>
          <PrintButton label="Print / save PDF" />
        </div>
      </div>

      <div className="schedule-print print-sheet mx-auto max-w-[100rem] rounded-[--sched-radius] border border-[--sched-border] bg-canvas p-6">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-[--sched-border-strong] pb-2">
          <div>
            <h1 className="font-display text-2xl leading-none tracking-tight text-ink">Kitchen Schedule</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-600">{venue.name}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-gold">{weekNumberLabel(weekStart)}</p>
            <p className="mt-0.5 font-display text-base leading-none text-ink">{weekRange}</p>
          </div>
        </header>

        {cookList.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">No cooks on the roster for this venue.</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-[13px]">
            <ScheduleColgroup days={days} />
            <caption className="sr-only">
              Weekly kitchen schedule for {venue.name}, {weekRange}.
            </caption>
            <thead>
              <tr className="sched-fill-header">
                <th scope="col" className={cn(cell, "text-left font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-600")}>
                  Cook
                </th>
                {days.map((d) => (
                  <th key={d.iso} scope="col" className={cn(cell, "text-center", d.weekend && "sched-fill-weekend")}>
                    <DayHeadContent day={d} />
                  </th>
                ))}
                <th scope="col" className={cn(cell, "text-right font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-600")}>
                  Hrs
                </th>
              </tr>
            </thead>
            <tbody>
              {cookList.map((cook) => (
                <tr key={cook.id}>
                  <th scope="row" className={cn(cell, "text-left")}>
                    <EmployeeCellContent cook={cook} />
                  </th>
                  {days.map((d) => (
                    <td key={d.iso} className={cn(cell, "text-center", d.weekend && "sched-fill-weekend")}>
                      <ShiftCellContent shift={cellFor(cook.id, d.iso)} defaultRole={cook.role} variant="print" />
                    </td>
                  ))}
                  <td className={cn(cell, "text-right font-semibold tabular-nums")}>
                    {(cookTotals.get(cook.id) ?? 0) > 0 ? fmtHours(cookTotals.get(cook.id) ?? 0) : "—"}
                  </td>
                </tr>
              ))}

            </tbody>
            <tfoot>
              <tr className="sched-fill-totals">
                <th scope="row" className={cn(cell, "text-left font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-600")}>
                  Day hours
                </th>
                {dayTotals.map((h, i) => (
                  <td key={days[i].iso} className={cn(cell, "text-center font-medium tabular-nums text-zinc-700", days[i].weekend && "sched-fill-weekend")}>
                    {h > 0 ? fmtHours(h) : "—"}
                  </td>
                ))}
                <td className={cn(cell, "text-right font-semibold tabular-nums text-ink")}>{fmtHours(weekTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="print-tight">
          {hasAnyDayNote && (
            <section className="break-avoid mt-4" aria-labelledby="daily-notes-heading">
              <h2
                id="daily-notes-heading"
                className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600"
              >
                Daily notes
              </h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-1.5">
                {days.map((d) => {
                  const note = noteAt.get(d.iso)?.trim();
                  if (!note) return null;

                  return (
                    <article
                      key={d.iso}
                      className={cn(
                        "rounded-sm border border-[--sched-border-strong] bg-[--sched-fill-header] px-2.5 py-2",
                        d.weekend && "sched-fill-weekend",
                      )}
                    >
                      <h3 className="mb-1 flex items-baseline gap-1.5 border-b border-[--sched-border] pb-1 font-mono uppercase tracking-[0.08em]">
                        <span className="text-[9px] font-semibold text-zinc-600">{d.short}</span>
                        <span className="font-display text-sm leading-none text-ink">{d.dayNum}</span>
                      </h3>
                      <p className="whitespace-pre-wrap text-[10px] leading-[1.4] text-zinc-700">{note}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {weekNote?.body && (
            <section className="break-avoid mt-5">
              <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-600">Weekly announcements</h2>
              <p className="whitespace-pre-wrap rounded-md border border-[--sched-border-strong] bg-[--sched-fill-header] px-4 py-3 text-sm leading-relaxed text-zinc-700">
                {weekNote.body}
              </p>
            </section>
          )}

          <PrintFooter venueName={venue.name} weekRange={weekRange} />
        </div>
      </div>
    </div>
  );
}
