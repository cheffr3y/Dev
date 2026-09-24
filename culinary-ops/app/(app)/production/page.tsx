import { redirect } from "next/navigation";
import { requirePrepUser } from "@/lib/prep-session";
export default async function ProductionPage() {
  await requirePrepUser("ADMIN");
  redirect("/prep-orders/closeout");
}
