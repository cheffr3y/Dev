import type { IngredientMeasure } from "../ingredients/measurements";
import { VENUE_DIRECTORY, normalizedVenueName } from "../venues/venue-directory";

export type InvoicePack = { unit: string | null; packQty: number | null; packUnit: string | null; rawCode?: string | null };
export function invoicePackDefaults(unit: string, item?: IngredientMeasure | null, learned?: InvoicePack | null) {
  const measured = unit.trim().match(/^(\d+(?:\.\d+)?)\s*(oz|lb|kg|g|gal|qt|ml|l|each|ea)\b/i);
  if (measured) return { unit, packQty: Number(measured[1]), packUnit: measured[2].toLowerCase() };
  if (learned?.packQty && learned.packUnit) return { unit: unit || learned.unit || "case", packQty: learned.packQty, packUnit: learned.packUnit };
  if (item?.packQty && item.packUnit) return { unit: unit || "case", packQty: item.packQty, packUnit: item.packUnit };
  const billed = unit;
  const measuredUnit=/^(?:oz|lb|lbs|kg|g|gal|qt|ml|l|each|ea|pc)$/i.test(billed);
  return { unit: billed, packQty: measuredUnit ? 1 : null, packUnit: /^(?:ea|pc)$/i.test(billed) ? "each" : measuredUnit ? billed : item?.unit || "" };
}

export function invoiceDetailsFromText(pages: { text: string }[], venues: { id: string; name: string }[]) {
  const text = pages.map(page => page.text).join("\n"), dates = new Set<string>();
  const datePatterns=[/\b(?:INV(?:OICE)?\s*DATE|DATE\s+OF\s+INVOICE)\s*[:|]?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/gi,/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*\n[^\n]{0,120}\bINV(?:OICE)?\s*DATE\b/gi];
  for (const pattern of datePatterns) for(const match of text.matchAll(pattern)) {
    const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0), month = Number(match[1]), day = Number(match[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 2000 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) dates.add(date.toISOString().slice(0, 10));
  }
  const lines = pages.flatMap(page=>page.text.split(/\b(?:ORDERED|SHIPPED|DESCRIPTION INFO|QTY\s+UOM)\b/i)[0].split(/\r?\n/)).map(normalizedVenueName);
  const matches = venues.filter(venue => {
    const directory = VENUE_DIRECTORY.find(entry => normalizedVenueName(entry.name) === normalizedVenueName(venue.name));
    const names = [venue.name, ...(directory?.aliases ?? [])].map(normalizedVenueName).filter(name => name.length >= 6);
    return names.some(name => lines.some(line => line.includes(name)));
  });
  return { date: dates.size === 1 ? [...dates][0] : "", venueId: matches.length === 1 ? matches[0].id : "",
    currency: "USD" as const };
}
