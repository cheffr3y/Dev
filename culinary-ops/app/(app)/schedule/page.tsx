import { redirect } from "next/navigation";
import { isoDate, thisWeekStart } from "@/lib/schedule";

// /schedule always lands on the current week's grid.
export default function SchedulePage() {
  redirect(`/schedule/${isoDate(thisWeekStart())}`);
}
