import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { readHomestead } from "@/lib/games/homestead-storage";
import { Homestead } from "./Homestead";

export const metadata: Metadata = { title: "Willowbrook Acre · Mise Break Room" };

export default async function HomesteadPage() {
  const user = await requireUser();
  const save = await readHomestead(user.id);
  return <Homestead key={user.id} userId={user.id} initialSave={save} />;
}
