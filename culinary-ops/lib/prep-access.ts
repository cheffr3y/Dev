import type { AppUser } from "./session";

export function canOrderForVenue(
  user: Pick<AppUser, "role" | "homeVenueId">,
  venueId: string | null,
) {
  return user.role === "ADMIN" || (!!venueId && user.homeVenueId === venueId);
}

export function assertOrderVenue(
  user: Pick<AppUser, "role" | "homeVenueId">,
  venueId: string | null,
) {
  if (!canOrderForVenue(user, venueId))
    throw new Error(
      user.homeVenueId
        ? "You can change prep orders only for your assigned venue."
        : "Ask an admin to assign your home venue before placing an order.",
    );
}
