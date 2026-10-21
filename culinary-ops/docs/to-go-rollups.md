# Holiday and To Go Rollups

Open **Holiday & To-Go** beside Menu Rollouts. This is a separate planning book
that shares the recipe and ingredient library. Managers edit; staff read and print.

Create a blank rollup or start with the 11 items in the chef's Thanksgiving menu.
The starter copies names and descriptions, sets solid sides to lb, and leaves
liquid sizes, small-bite formats, recipe links, quantities and prices undecided.
It does not create duplicate recipes or assert customer dietary claims.

## Sales and production

Enter estimated sales in each item's selling unit: lb/oz/kg, liquid volume, or
each/dozen/kit/board/tray. Blank means unknown; zero is explicitly none. New items
default to **New / untested** confidence. Add development notes as trials progress.
Changing the selling unit clears quantity and pricing inputs in the editor so
old numbers cannot silently become a different measure.

The optional production target replaces estimated sales for recipe demand only.
It does not change forecast revenue. Actual sold is a later comparison against
the original estimate, and does not affect production demand. Totals by unit do
not combine pounds, quarts and packages into a misleading unit count.

Link existing recipes whenever ready. The selling unit converts to the saved
recipe yield within its measurement family. For a kit or incompatible yield,
enter an explicit recipe amount per selling unit, in the recipe's yield unit.
For example, a kit containing 0.5 lb of a linked build needs 0.5 lb per kit.
Never infer a serving weight or convert volume to weight without a chef's mapping.
Changing the recipe clears the explicit mapping in the editor.
Custom amounts also retain their measurement unit: a saved 0.5 lb per kit remains
0.5 lb if the recipe later changes its yield to ounces. A change to an incompatible
measurement family requires review. The editor can clear the amount and switch
to the recipe's current yield unit when a new specification is needed.

Recipe demand includes nested sub-recipes and combines shared demand. Missing
links, invalid yields, incompatible ingredients/components and cycles are flagged;
affected positive-demand items are explicitly excluded rather than using the
legacy same-unit fallback. Fractional batches stay fractional. These are planning
quantities, not an inventory ledger or a customer order-entry system.

## Costing and print books

Price and packaging cost are per selling unit, independent of a recipe's menu
price. A blank packaging cost is unknown; enter 0 if none. Food cost is unavailable
when conversion or ingredient pricing is incomplete. Stale prices retain their
estimate and show a warning. Margin is after food and packaging, before labor,
overhead and sales fees. Each summary reports the count of included items.

Print the complete holiday book or individual forecast/production, costing,
packing/customer instructions, allergen, recipe or vendor sections. Recipes use
their saved standard batch yields, including all nested dependencies, without
plated-serving conversion. Allergen guides require review of accompaniments.
The vendor checklist is manual and covers linked food recipes only; packaging
supplies and unlinked menu items are explicitly outside that checklist.

## Delivery and checks

The additive `20261020180000_to_go_rollups` migration creates two new tables.
The existing production start command applies migrations before accepting traffic.
No recipe data or existing menu rollout is modified by the migration.

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
Run `npm run test:to-go` for the isolated browser and migration check. Set
`PREP_PLAYWRIGHT_MODULE` and `PREP_BROWSER_EXECUTABLE` if Playwright or Chromium
are outside the default paths. `TO_GO_REVIEW_DIR` controls review screenshots/PDFs.

The rollup unit tests cover weight/volume/package conversions, unknown versus zero,
forecast versus production overrides, actual sales comparisons, incomplete costs,
shared sub-recipes, cycles and mismatched nested units. The disposable browser
harness exercises real creation, edits, permissions and packet output without
reading or writing the application's database.
