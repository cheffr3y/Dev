export const PRINT_SCALE_OPTIONS = [0.5, 1, 2, 3, 4] as const;
export const MAX_PRINT_SCALE = 100;
export type PrintQuery = {
  scale?: string | string[];
  density?: string | string[];
  print?: string | string[];
};

export function validPrintScale(value: number) {
  return Number.isFinite(value) && value > 0 && value <= MAX_PRINT_SCALE;
}

export function printScale(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !raw.trim()) return 1;
  const value = Number(raw);
  return validPrintScale(value) ? value : 1;
}

// Section/content links retain the current density without carrying another
// document's scale or auto-print request into the destination.
export function printOptionHref(href: string, density: PrintQuery["density"]) {
  if (density !== "compact") return href;
  return `${href}${href.includes("?") ? "&" : "?"}density=compact`;
}

export function printTargetDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00.000Z`) : date;
  return value.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
