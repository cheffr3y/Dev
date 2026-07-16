import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasRole } from "@/lib/session";
import { getActiveVenue } from "@/lib/venue";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import {
  ROLE_SUGGESTIONS,
  WEEKDAYS,
  addDays,
  dateFromParam,
  fmtWeekRange,
  isoDate,
  startOfUtcWeek,
  thisWeekStart,
  weekDays,
} from "@/lib/schedule";
import { ScheduleGrid, type CookLite, type DayLite, type ShiftLite } from "../ScheduleGrid";
import { WeekNoteEditor } from "../WeekNoteEditor";
import { copyPreviousWeek } from "../actions";

export default async function ScheduleWeekPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const user = await requireUser();
  const canEdit = hasRole(user, "MANAGER");

  const requested = dateFromParam(week);
  if (!requested) redirect(`/schedule/${isoDate(thisWeekStart())}`);

  // Snap any in-week date to the Monday that anchors it so the URL is canonical.
  const weekStart = startOfUtcWeek(requested);
  if (isoDate(weekStart) !== week) redirect(`/schedule/${isoDate(weekStart)}`);
  const weekIso = isoDate(weekStart);
  const weekEnd = addDays(weekStart, 7);

  const { active } = await getActiveVenue(user.homeVenueId);
  if (!active) {
    return (
      <div>
        <PageHeader title="Weekly Schedule" />
        <EmptyState title="No venue yet" hint="Create a venue before building a schedule." />
      </div>
    );
  }

  const [cooks, shiftRows, dayNoteRows, weekNote] = await Promise.all([
    prisma.cook.findMany({
      where: { venueId: active.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
    prisma.shift.findMany({
      where: { date: { gte: weekStart, lt: weekEnd }, cook: { venueId: active.id } },
      select: { cookId: true, date: true, kind: true, start: true, end: true, role: true, note: true },
    }),
    prisma.dayNote.findMany({
      where: { venueId: active.id, date: { gte: weekStart, lt: weekEnd } },
      select: { date: true, body: true },
    }),
    prisma.scheduleNote.findUnique({
      where: { venueId_weekStart: { venueId: active.id, weekStart } },
      select: { body: true },
    }),
  ]);

  const cookList: CookLite[] = cooks;
  const shifts: ShiftLite[] = shiftRows.map((s) => ({
    cookId: s.cookId,
    date: isoDate(s.date),
    kind: s.kind,
    start: s.start,
    end: s.end,
    role: s.role,
    note: s.note,
  }));
  const days: DayLite[] = weekDays(weekStart).map((d, i) => ({
    iso: isoDate(d),
    short: WEEKDAYS[i].short,
    dayNum: d.getUTCDate(),
    weekend: i >= 5,
  }));
  const dayNotes = dayNoteRows.map((n) => ({ iso: isoDate(n.date), body: n.body }));

  const isCurrentWeek = weekIso === isoDate(thisWeekStart());

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/schedule/${isoDate(addDays(weekStart, -7))}`}
            className="rounded-full border border-hairline px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-ink hover:text-ink"
          >
            ← Prev
          </Link>
          {!isCurrentWeek && (
            <Link
              href={`/schedule/${isoDate(thisWeekStart())}`}
              className="rounded-full border border-hairline px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-ink hover:text-ink"
            >
              This week
            </Link>
          )}
          <Link
            href={`/schedule/${isoDate(addDays(weekStart, 7))}`}
            className="rounded-full border border-hairline px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-ink hover:text-ink"
          >
            Next →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <form action={copyPreviousWeek}>
              <input type="hidden" name="venueId" value={active.id} />
              <input type="hidden" name="weekStart" value={weekIso} />
              <button
                type="submit"
                className="rounded-full border border-hairline px-4 py-1.5 text-sm text-zinc-600 transition-colors hover:border-ink hover:text-ink"
              >
                Copy last week
              </button>
            </form>
          )}
          {canEdit && (
            <Link href="/schedule/cooks" className="rounded-full border border-hairline px-4 py-1.5 text-sm text-zinc-600 transition-colors hover:border-ink hover:text-ink">
              Manage cooks
            </Link>
          )}
          <LinkButton href={`/schedule/${weekIso}/print`} variant="secondary">
            Print / post
          </LinkButton>
        </div>
      </div>

      <PageHeader title="Weekly Schedule" subtitle={`${active.name} · ${fmtWeekRange(weekStart)}`} />

      {cookList.length === 0 ? (
        <EmptyState
          title="No cooks on the roster yet"
          hint={canEdit ? "Add your cooks to start building the schedule." : "A manager needs to add cooks first."}
        />
      ) : (
        <>
          <ScheduleGrid
            venueId={active.id}
            canEdit={canEdit}
            cooks={cookList}
            shifts={shifts}
            days={days}
            dayNotes={dayNotes}
            roleSuggestions={[...ROLE_SUGGESTIONS]}
          />
          {canEdit && (
            <p className="mt-2 text-xs text-zinc-500">
              Tap any cell to set a cook’s hours, station, or day off. Times over midnight (e.g. 6p–2a) count as overnight.
            </p>
          )}
        </>
      )}

      <Card className="mt-6">
        <CardHeader>Weekly announcements</CardHeader>
        <div className="p-4">
          {canEdit || weekNote?.body ? (
            <WeekNoteEditor venueId={active.id} weekStart={weekIso} initialBody={weekNote?.body ?? ""} canEdit={canEdit} />
          ) : (
            <p className="text-sm text-zinc-400">No announcements posted for this week.</p>
          )}
        </div>
      </Card>

      {cookList.length === 0 && canEdit && (
        <div className="mt-6">
          <LinkButton href="/schedule/cooks">Add cooks →</LinkButton>
        </div>
      )}
    </div>
  );
}
