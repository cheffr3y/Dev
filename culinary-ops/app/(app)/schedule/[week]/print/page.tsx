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
  dateFromParam,
  fmtHours,
  fmtTimeRange,
  fmtWeekRange,
  isoDate,
  shiftHours,
  startOfUtcWeek,
  thisWeekStart,
  weekDays,
} from "@/lib/schedule";

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

  const shiftAt = new Map(shiftRows.map((s) => [`${s.cookId}|${isoDate(s.date)}`, s]));
  const noteAt = new Map(dayNoteRows.map((n) => [isoDate(n.date), n.body]));
  const days = weekDays(weekStart).map((d, i) => ({
    iso: isoDate(d),
    short: WEEKDAYS[i].short,
    dayNum: d.getUTCDate(),
    weekend: i >= 5,
  }));

  const cellFor = (cookId: string, iso: string) => shiftAt.get(`${cookId}|${iso}`) ?? null;
  const cookHours = (cookId: string) =>
    days.reduce((sum, d) => {
      const s = cellFor(cookId, d.iso);
      return sum + shiftHours(s?.start, s?.end);
    }, 0);
  const dayHours = (iso: string) =>
    cooks.reduce((sum, c) => {
      const s = cellFor(c.id, iso);
      return sum + shiftHours(s?.start, s?.end);
    }, 0);
  const weekTotal = days.reduce((sum, d) => sum + dayHours(d.iso), 0);

  const th = "border border-zinc-300 px-2 py-1.5 text-center align-middle";
  const td = "border border-zinc-300 px-2 py-1.5 align-top text-center";

  return (
    <div className="print-full">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href={`/schedule/${isoDate(weekStart)}`} className="text-sm text-blue-600 hover:underline">
          ← Back to editor
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Tip: print in landscape for the full week.</span>
          <PrintButton label="Print / save PDF" />
        </div>
      </div>

      <div className="print-sheet mx-auto max-w-[100rem] rounded-lg border border-hairline bg-canvas p-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-zinc-300 pb-3">
          <div>
            <h1 className="font-display text-3xl leading-none tracking-tight text-ink">Kitchen Schedule</h1>
            <p className="mt-1 text-sm text-zinc-600">{venue.name}</p>
          </div>
          <p className="font-mono text-sm uppercase tracking-[0.02em] text-zinc-600">{fmtWeekRange(weekStart)}</p>
        </header>

        {cooks.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">No cooks on the roster for this venue.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className={cn(th, "text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600")}>Cook</th>
                {days.map((d) => (
                  <th key={d.iso} className={cn(th, d.weekend && "bg-pale-gold/50")}>
                    <div className="font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600">{d.short}</div>
                    <div className="font-display text-base text-ink">{d.dayNum}</div>
                  </th>
                ))}
                <th className={cn(th, "font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600")}>Hrs</th>
              </tr>
            </thead>
            <tbody>
              {cooks.map((cook) => (
                <tr key={cook.id} className="even:bg-zinc-50/60">
                  <th className={cn(td, "text-left")}>
                    <div className="font-medium text-ink">{cook.name}</div>
                    {cook.role && <div className="text-[11px] text-zinc-500">{cook.role}</div>}
                  </th>
                  {days.map((d) => {
                    const s = cellFor(cook.id, d.iso);
                    return (
                      <td key={d.iso} className={cn(td, d.weekend && "bg-pale-gold/20")}>
                        {!s ? (
                          <span className="text-zinc-300">·</span>
                        ) : s.kind === "OFF" ? (
                          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Off</span>
                        ) : (
                          <>
                            <div className="font-semibold tabular-nums text-ink">{fmtTimeRange(s.start, s.end) || "—"}</div>
                            {s.role && <div className="text-[11px] text-gold">{s.role}</div>}
                            {s.note && <div className="text-[11px] text-zinc-500">{s.note}</div>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className={cn(td, "tabular-nums font-semibold")}>{cookHours(cook.id) > 0 ? fmtHours(cookHours(cook.id)) : "—"}</td>
                </tr>
              ))}

              <tr>
                <th className={cn(td, "text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600")}>Daily notes</th>
                {days.map((d) => (
                  <td key={d.iso} className={cn(td, "text-left align-top", d.weekend && "bg-pale-gold/20")}>
                    {noteAt.get(d.iso) ? (
                      <span className="whitespace-pre-wrap text-[11px] leading-snug text-zinc-600">{noteAt.get(d.iso)}</span>
                    ) : (
                      <span className="text-zinc-300">·</span>
                    )}
                  </td>
                ))}
                <td className={td} />
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-zinc-50">
                <th className={cn(td, "text-left font-mono text-[11px] uppercase tracking-[0.02em] text-zinc-600")}>Day hours</th>
                {days.map((d) => (
                  <td key={d.iso} className={cn(td, "tabular-nums text-zinc-600", d.weekend && "bg-pale-gold/30")}>
                    {dayHours(d.iso) > 0 ? fmtHours(dayHours(d.iso)) : "—"}
                  </td>
                ))}
                <td className={cn(td, "tabular-nums font-semibold text-ink")}>{fmtHours(weekTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {weekNote?.body && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-1 font-mono text-xs uppercase tracking-[0.02em] text-zinc-600">Announcements</h2>
            <p className="whitespace-pre-wrap rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700">
              {weekNote.body}
            </p>
          </section>
        )}

        <p className="mt-6 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
          {venue.name} · Week of {fmtWeekRange(weekStart)} · Printed{" "}
          {new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} · Mise — Culinary Ops
        </p>
      </div>
    </div>
  );
}
