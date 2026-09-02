export function defaultPrepReportRange(now: Date = new Date()): { from: string; to: string } {
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sunday = new Date(todayUtc);
  sunday.setUTCDate(todayUtc.getUTCDate() - todayUtc.getUTCDay());
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  return { from: sunday.toISOString().slice(0, 10), to: saturday.toISOString().slice(0, 10) };
}

export function prepReportDates(from?: string | null, to?: string | null) {
  const defaults = defaultPrepReportRange();
  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ? from! : defaults.from;
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(to ?? "") ? to! : defaults.to;
  return {
    from: safeFrom,
    to: safeTo,
    fromDate: new Date(`${safeFrom}T00:00:00Z`),
    toDate: new Date(`${safeTo}T23:59:59Z`),
  };
}
