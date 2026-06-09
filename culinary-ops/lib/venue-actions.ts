"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_VENUE_COOKIE } from "./venue";

export async function selectVenue(formData: FormData) {
  const venueId = String(formData.get("venueId") ?? "");
  if (!venueId) return;
  const store = await cookies();
  store.set(ACTIVE_VENUE_COOKIE, venueId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
