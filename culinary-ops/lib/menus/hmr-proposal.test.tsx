import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HmrPricing, HmrProposal } from "../../components/HmrProposal";
import { buildToGoRollup, type ToGoLine } from "./to-go-rollup";
import type { RolloutRecipe } from "./menu-rollout";
import { toGoPacketMode, TO_GO_PACKETS } from "./to-go-options";

test("proposal pricing uses food cost even when legacy packaging facts exist", () => {
  const now = new Date();
  const recipe: RolloutRecipe = { id: "potatoes", name: "Potatoes", yieldQty: 10, yieldUnit: "lb", station: null, menuPrice: null, allergens: null,
    components: [], items: [{ quantity: 5, unit: "lb", item: { id: "butter", name: "Butter", category: "Dairy", unit: "lb", unitCost: 4, priceUpdatedAt: now } }],
  };
  const item: ToGoLine = { id: "item", name: "Mashed Potatoes", recipeId: recipe.id, section: "Sides", description: "Yukon gold potatoes and butter",
    sellingUnit: "lb", recipeQtyPerUnit: null, recipeAmountUnit: null, price: 9, packagingCost: 999,
    forecastQty: 100, productionQty: 120, actualSoldQty: 90, confidence: "HIGH", packingNotes: "Legacy box",
    customerInstructions: "Warm gently; stir before serving.", notes: null, sortOrder: 0,
  };
  const plan = buildToGoRollup({ items: [item] }, [recipe], now);
  const pricing = renderToStaticMarkup(<HmrPricing plan={plan} />);
  assert.match(pricing, /\$2\.00/);
  assert.match(pricing, /\$7\.00/);
  assert.match(pricing, /22\.2%/);
  assert.doesNotMatch(pricing, /999|Packaging|Actual sold|Production target/);
  const proposal = renderToStaticMarkup(<HmrProposal plan={plan} />);
  assert.match(proposal, /Yukon gold potatoes and butter/);
  assert.match(proposal, /Warm gently; stir before serving/);
  assert.match(proposal, /\$9\.00 \/ lb/);
  assert.doesNotMatch(proposal, /Legacy box|120|90|Packaging|Actual sold/);
});

test("proposal printouts are the default and old operational bookmarks remain valid", () => {
  assert.equal(toGoPacketMode(undefined), "proposal");
  assert.equal(toGoPacketMode("unknown"), "proposal");
  assert.equal(toGoPacketMode("forecast"), "forecast");
  assert.equal(toGoPacketMode("packing"), "packing");
  assert.ok(TO_GO_PACKETS.every(packet => packet.value !== ("forecast" as string) && packet.value !== ("packing" as string)));
});
