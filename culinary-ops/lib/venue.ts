import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const ACTIVE_VENUE_COOKIE = "activeVenue";

export async function getVenues(options: { includeLegacy?: boolean; includeIds?: Array<string | null | undefined> } = {}) {
  const ids = options.includeIds?.filter((id): id is string => !!id) ?? [];
  return prisma.venue.findMany({
    where: options.includeLegacy ? {} : { OR: [{ standardKey: { not: null } }, { id: { in: ids } }] },
    include: { parent: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export type VenueLite = Awaited<ReturnType<typeof getVenues>>[number];

// Resolve the venue the user is currently working in: cookie first,
// then their home venue, then the first venue that exists.
export async function getActiveVenue(fallbackVenueId?: string | null) {
  const store = await cookies();
  const cookieId = store.get(ACTIVE_VENUE_COOKIE)?.value;
  const venues = await getVenues({ includeIds: [cookieId, fallbackVenueId] });
  if (venues.length === 0) return { venues, active: null as VenueLite | null };
  const active =
    venues.find((v) => v.id === cookieId) ??
    venues.find((v) => v.id === fallbackVenueId) ??
    venues.find(venue => venue.standardKey != null) ?? venues[0];
  return { venues, active };
}
