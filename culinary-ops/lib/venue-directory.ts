// Company names and grouping confirmed by the chef. Keys are durable identities;
// display names, codes and parent rooms must not be invented per feature.
export const VENUE_DIRECTORY = [
  { key: "foxtown-brewpub", name: "Foxtown Brewpub", code: "FBP", parentKey: null, aliases: ["Foxtown Brewing", "Brewpub"] },
  { key: "annex", name: "The Annex", code: "ANX", parentKey: null, aliases: ["Annex"] },
  { key: "renards", name: "Renard's", code: "REN", parentKey: "annex", aliases: ["Renards"] },
  { key: "11s-lounge", name: "11's Lounge", code: "11S", parentKey: "annex", aliases: ["11s Lounge", "11 Lounge"] },
  { key: "station", name: "The Station", code: "STA", parentKey: null, aliases: ["Station", "Foxtown Station"] },
  { key: "zimmerman", name: "Zimmerman", code: "ZIM", parentKey: "station", aliases: ["Zimmerman Room"] },
  { key: "foxyard", name: "Foxyard", code: "FOX", parentKey: "station", aliases: [] },
  { key: "opitz", name: "Opitz", code: "OPI", parentKey: "station", aliases: ["Opitz Hall", "Opitz Room"] },
  { key: "ice-house", name: "Ice House", code: "ICE", parentKey: "station", aliases: [] },
  { key: "ice-house-mezzanine", name: "Ice House Mezzanine", code: "ICEM", parentKey: "station", aliases: ["Ice House Mezz", "Mezzanine"] },
  { key: "foxtown-heritage-meats", name: "Foxtown Heritage Meats", code: "FHM", parentKey: null, aliases: ["Heritage Meats"] },
  { key: "interurban-coffee-shop", name: "Interurban Coffee Shop", code: "ICS", parentKey: null, aliases: ["Interurban", "Interurban Coffeeshop", "Interurban Coffee"] },
] as const;

export function normalizedVenueName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function directoryEntry(value: string) {
  const normalized = normalizedVenueName(value);
  return VENUE_DIRECTORY.find(entry => [entry.name, ...entry.aliases].some(name => normalizedVenueName(name) === normalized));
}
// Only exact recognized names are standardized. Offsite addresses, instructions,
// and multi-room descriptions retain their authored text and punctuation.
export function standardLocationText(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.split(/([,;+\n])/).map(part => {
    const entry = directoryEntry(part.trim());
    return entry ? part.replace(part.trim(), entry.name) : part;
  }).join("").trim();
}

export type VenueChoice = {
  id: string; name: string; standardKey?: string | null; parentId?: string | null;
  sortOrder?: number; parent?: { name: string } | null;
};
export type VenueOptionGroup = { label: string | null; options: VenueChoice[] };
export function groupedVenueChoices(venues: VenueChoice[], current?: VenueChoice | null, includeLegacy = false): VenueOptionGroup[] {
  const byId = new Map(venues.map(venue => [venue.id, venue]));
  if (current && !byId.has(current.id)) byId.set(current.id, current);
  const compare = (a: VenueChoice, b: VenueChoice) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  const standard = [...byId.values()].filter(venue => venue.standardKey !== null).sort(compare);
  const roots = standard.filter(venue => !venue.parentId);
  const groups: VenueOptionGroup[] = [];
  const included = new Set<string>();
  for (const root of roots) {
    const children = standard.filter(venue => venue.parentId === root.id);
    groups.push({ label: children.length ? root.name : null, options: [root, ...children] });
    for (const venue of [root, ...children]) included.add(venue.id);
  }
  // A restricted request picker can contain a room without the parent option.
  for (const venue of standard.filter(venue => !included.has(venue.id))) {
    const label = byId.get(venue.parentId ?? "")?.name ?? venue.parent?.name ?? null;
    const group = label ? groups.find(group => group.label === label) : undefined;
    if (group) group.options.push(venue); else groups.push({ label, options: [venue] });
  }
  const legacy = [...byId.values()].filter(venue => venue.standardKey === null && (includeLegacy || venue.id === current?.id)).sort(compare);
  if (legacy.length) groups.push({ label: "Legacy locations — existing records", options: legacy });
  return groups;
}
