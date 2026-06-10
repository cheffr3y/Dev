export type BadgeColor = "gray" | "blue" | "green" | "amber" | "red";

export const STATUS_COLOR: Record<string, BadgeColor> = {
  PLANNED: "amber",
  CONFIRMED: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export const EVENT_STATUSES = ["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

export function statusLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
