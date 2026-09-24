import { businessDate, chicagoToday } from "./prep-dates";
export function defaultPrepReportRange(now = new Date()) {
  const today = businessDate(chicagoToday(now)),
    sunday = new Date(today);
  sunday.setUTCDate(today.getUTCDate() - today.getUTCDay());
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    from: sunday.toISOString().slice(0, 10),
    to: saturday.toISOString().slice(0, 10),
  };
}
export function prepReportDates(from?: string | null, to?: string | null) {
  const defaults = defaultPrepReportRange();
  const start = from || defaults.from,
    end = to || defaults.to,
    fromDate = businessDate(start),
    toDate = businessDate(end);
  if (
    toDate < fromDate ||
    toDate.getTime() - fromDate.getTime() > 366 * 86400000
  )
    throw new Error("Choose a date range of up to one year.");
  toDate.setUTCHours(23, 59, 59, 999);
  return { from: start, to: end, fromDate, toDate };
}
