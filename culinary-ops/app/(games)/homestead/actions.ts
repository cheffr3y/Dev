"use server";

import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { homesteadSchema } from "@/lib/games/homestead";
import { readHomestead, writeHomestead } from "@/lib/games/homestead-storage";

const saveSchema = z.object({ state: homesteadSchema, revision: z.number().int().min(0).max(2_147_483_646) });

export async function saveHomestead(input: unknown) {
  const user = await requireActiveUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  return writeHomestead(user.id, parsed.data.state, parsed.data.revision);
}

export async function loadHomestead() {
  const user = await requireActiveUser();
  return readHomestead(user.id);
}
