// On-hand counts for the Combined purchasing list. Pure math, shared by the
// phone screen (live) and the printed order sheet (server).

export const countKey = (itemId: string, unit: string) => `${itemId}|${unit}`;

export type OrderLine = {
  // Amount still to buy in the list unit, never below zero.
  toOrder: number;
  // Whole packs to buy when a pack size in the same unit is known.
  packs: number | null;
  counted: boolean;
};

// need − on hand, floored at zero, then rounded up to whole packs. An item not
// yet counted orders its full need and is marked uncounted.
export function orderLine(need: number, onHand: number | null | undefined, packQty: number | null | undefined): OrderLine {
  const counted = onHand != null && Number.isFinite(onHand);
  const have = counted ? Math.max(0, onHand) : 0;
  const raw = Math.max(0, need - have);
  // Trim float noise so 2.0000000001 packs doesn't become 3.
  const toOrder = Math.round(raw * 1e9) / 1e9;
  const packs = packQty && packQty > 0 ? Math.ceil(Math.round((toOrder / packQty) * 1e9) / 1e9) : null;
  return { toOrder, packs, counted };
}

// Parse what a cook typed: blank clears the count; anything else must be a
// non-negative number. Commas are accepted as decimal points.
export function parseOnHand(input: string): number | null | "invalid" {
  const text = input.trim().replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : "invalid";
}
