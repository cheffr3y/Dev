export const TO_GO_STATUSES = ["DRAFT", "REVIEW", "ACTIVE", "COMPLETE", "ARCHIVED"] as const;
export const TO_GO_CONFIDENCE = [
  { value: "NEW", label: "New / untested" },
  { value: "LOW", label: "Rough guess" },
  { value: "MEDIUM", label: "Working estimate" },
  { value: "HIGH", label: "Confident estimate" },
] as const;
export const SELLING_UNITS = [
  { value: "lb", label: "lb", group: "Weight" },
  { value: "oz", label: "oz", group: "Weight" },
  { value: "kg", label: "kg", group: "Weight" },
  { value: "pint", label: "pint", group: "Liquid volume" },
  { value: "quart", label: "quart", group: "Liquid volume" },
  { value: "gallon", label: "gallon", group: "Liquid volume" },
  { value: "fl oz", label: "fl oz", group: "Liquid volume" },
  { value: "each", label: "each", group: "Small bites / packages" },
  { value: "dozen", label: "dozen", group: "Small bites / packages" },
  { value: "kit", label: "kit", group: "Small bites / packages" },
  { value: "board", label: "board", group: "Small bites / packages" },
  { value: "tray", label: "tray", group: "Small bites / packages" },
] as const;
export const TO_GO_PACKETS = [
  { value: "all", label: "Complete holiday book" },
  { value: "forecast", label: "Sales forecast & production" },
  { value: "costing", label: "Costing & pricing" },
  { value: "packing", label: "Packing & customer instructions" },
  { value: "allergens", label: "Allergen guide" },
  { value: "recipes", label: "Recipe & sub-recipe book" },
  { value: "order-guide", label: "Vendor checklist" },
] as const;
export type ToGoPacketMode = typeof TO_GO_PACKETS[number]["value"];
export function toGoPacketMode(value: string | string[] | undefined): ToGoPacketMode {
  return TO_GO_PACKETS.find(packet => packet.value === value)?.value ?? "all";
}
