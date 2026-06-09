import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const ACTIVE_VENUE_COOKIE = "activeVenue";

export async function getVenues() {
  return prisma.venue.findMany({ orderBy: { name: "asc" } });
}

export type VenueLite = Awaited<ReturnType<typeof getVenues>>[number];

// Resolve the venue the user is currently working in: cookie first,
// then their home venue, then the first venue that exists.
export async function getActiveVenue(fallbackVenueId?: string | null) {
  const venues = await getVenues();
  if (venues.length === 0) return { venues, active: null as VenueLite | null };
  const store = await cookies();
  const cookieId = store.get(ACTIVE_VENUE_COOKIE)?.value;
  const active =
    venues.find((v) => v.id === cookieId) ??
    venues.find((v) => v.id === fallbackVenueId) ??
    venues[0];
  return { venues, active };
}
