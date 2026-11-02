"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui";
import { computeTotals, fmtHours } from "@/lib/schedule/schedule";
import { ShiftEditor } from "./ShiftEditor";
import { useScheduleGridNavigation } from "./useScheduleGridNavigation";
import { ShiftCell } from "./ShiftCell";
import { DayNoteEditor } from "./DayNoteEditor";
import {
  DayHeadContent,
  EmployeeCellContent,
  ScheduleColgroup,
  type CookLite,
  type DayEventLite,
  type DayLite,
  type ShiftLite,
} from "./schedule-ui";

// Re-exported so existing importers (the week page) keep their import path.
export type { CookLite, DayLite, ShiftLite } from "./schedule-ui";

export function ScheduleGrid({
  venueId,
  canEdit,
  cooks,
  shifts,
  days,
  dayEvents,
  roleSuggestions,
}: {
  venueId: string;
  canEdit: boolean;
  cooks: CookLite[];
  shifts: ShiftLite[];
  days: DayLite[];
  dayEvents: Array<{ iso: string; events: DayEventLite[] }>;
  roleSuggestions: string[];
}) {
  const { editing, openEditor, closeEditor } = useScheduleGridNavigation();

  const shiftAt = useMemo(() => {
    const m = new Map<string, ShiftLite>();
    for (const s of shifts) m.set(`${s.cookId}|${s.date}`, s);
    return m;
  }, [shifts]);
  const eventsAt = useMemo(() => new Map(dayEvents.map((n) => [n.iso, n.events])), [dayEvents]);

  const { dayTotals, cookTotals, weekTotal } = useMemo(
    () => computeTotals(cooks, days, (cookId, iso) => shiftAt.get(`${cookId}|${iso}`)),
    [cooks, days, shiftAt],
  );

  const hasAnyEvent = dayEvents.some((d) => d.events.length > 0);
  const showNotesRow = canEdit || hasAnyEvent;

  return (
    <>
      <div className="overflow-x-auto rounded-[--sched-radius] border border-[--sched-border] bg-canvas shadow-[0_1px_2px_rgba(26,26,26,0.04)]">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <ScheduleColgroup days={days} />
          <caption className="sr-only">
            Weekly kitchen schedule. Rows list each cook; columns are the seven days of the week with a
            weekly hours total.
          </caption>
          <thead>
            <tr className="sched-fill-header border-b-2 border-[--sched-border-strong]">
              <th
                scope="col"
                className="sched-sticky sched-fill-header px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
              >
                Cook
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  scope="col"
                  className={cn("px-1.5 py-2 text-center", d.weekend && "sched-fill-weekend")}
                >
                  <DayHeadContent day={d} />
                </th>
              ))}
              <th
                scope="col"
                className="px-2 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
              >
                Hrs
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[--sched-border]">
            {cooks.map((cook) => (
              <tr key={cook.id} className="group/row">
                <th
                  scope="row"
                  className="sched-sticky sched-fill-header px-4 py-2 text-left align-middle"
                >
                  <EmployeeCellContent cook={cook} />
                </th>
                {days.map((d) => {
                  const shift = shiftAt.get(`${cook.id}|${d.iso}`) ?? null;
                  return (
                    <td key={d.iso} className={cn("p-0 align-middle", d.weekend && "sched-fill-weekend")}>
                      <ShiftCell
                        cook={cook}
                        day={d}
                        shift={shift}
                        canEdit={canEdit}
                        onOpen={(el) => openEditor({ cook, day: d, shift }, el)}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right align-middle tabular-nums">
                  {(cookTotals.get(cook.id) ?? 0) > 0 ? (
                    <span className="font-semibold text-ink">{fmtHours(cookTotals.get(cook.id) ?? 0)}</span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Day-specific notes: one controlled cell per day (events, deliveries, VIPs). */}
            {showNotesRow && (
              <tr className="border-t-2 border-[--sched-border-strong]">
                <th
                  scope="row"
                  className="sched-sticky sched-fill-header px-4 py-2 text-left align-top font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
                >
                  Daily notes
                </th>
                {days.map((d) => (
                  <td key={d.iso} className={cn("p-1 align-top", d.weekend && "sched-fill-weekend")}>
                    <DayNoteEditor venueId={venueId} dateIso={d.iso} initialEvents={eventsAt.get(d.iso) ?? []} canEdit={canEdit} />
                  </td>
                ))}
                <td className="sched-fill-totals" />
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className="sched-fill-totals border-t-2 border-[--sched-border-strong]">
              <th
                scope="row"
                className="sched-sticky sched-fill-totals px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-600"
              >
                Day hours
              </th>
              {dayTotals.map((h, i) => (
                <td
                  key={days[i].iso}
                  className={cn("px-1.5 py-2.5 text-center font-medium tabular-nums text-zinc-700", days[i].weekend && "sched-fill-weekend")}
                >
                  {h > 0 ? fmtHours(h) : <span className="text-zinc-300">—</span>}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right align-middle">
                <span className="font-display text-base tabular-nums text-ink">{fmtHours(weekTotal)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <ShiftEditor
          key={`${editing.cook.id}|${editing.day.iso}`}
          editing={editing}
          roleSuggestions={roleSuggestions}
          onClose={closeEditor}
        />
      )}
    </>
  );
}
