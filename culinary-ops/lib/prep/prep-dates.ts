/** Business dates are Chicago calendar dates stored as UTC-midnight labels. */
export function chicagoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function businessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("A valid business date is required.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid business date.");
  return date;
}
