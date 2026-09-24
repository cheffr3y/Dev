import { redirect } from "next/navigation";

export default function LegacyProductionPage() {
  redirect("/prep-orders/daily");
}
