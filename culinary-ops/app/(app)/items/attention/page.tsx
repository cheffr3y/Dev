import { redirect } from "next/navigation";

// Needs attention moved to the top-level Cleanup page.
export default function NeedsAttentionMoved() {
  redirect("/cleanup");
}
