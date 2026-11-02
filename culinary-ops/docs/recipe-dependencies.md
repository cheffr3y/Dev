# Recipe dependency and rollup explorer

Open a recipe's full detail page to use **Dependency & Rollup Tree**. Staff, managers and admins can preview; this explorer has no write action. Existing recipe editing permissions still apply elsewhere on the page. No migration or new service configuration is required.

## Inputs and scaling

Enter a positive target quantity and a compatible yield unit. For a recipe yielding four `each`, entering 250 `each` previews 62.5 standard batches. Guest counts only translate to production when the recipe has a defined portion yield; a soup yielded in quarts cannot infer quarts per guest. Unknown custom yield units allow only that same unit.

Expand branches individually or use **Expand all branches**. Each recipe node shows its required yield, standard-batch multiplier, estimated cost, effective allergen tags and inherited tags. Ingredients show their required amount, tags and cost. Cost shares are percentages of the immediate parent's total ingredient cost, including nested recipes. Shares are omitted when that total is unknown or zero. Ingredient-derived tags retain their inherited provenance even if also manually selected on the recipe. Tags are recorded catalog data, not an assertion that untagged food is allergen-free.

Raw ingredients are summed across every occurrence, normalizing compatible quantities to the ingredient's cost unit. Shared sub-recipes are summed across all paths in their own yield units. These are demand previews, without stock deductions. Sub-recipe costs overlap across tiers and must not be added to one another or to the raw-ingredient total. Small quantities and batch fractions retain significant digits rather than rounding to zero; positive costs below display precision use a less-than label.

Missing/invalid prices, empty builds, missing recipe links, invalid yields, cycles and incompatible units leave affected costs or quantities unknown. The preview does not use the legacy same-unit costing fallback. Known inputs remain visible with incomplete totals labeled partial. Stale source prices stay labeled as estimates. The existing costing panels and printed recipe references keep their established behavior.

The input traversal stops at 500 entries or 32 recipe levels and explicitly labels remaining demand partial. Allergen traversal is iterative and guards cycles. The interactive payload contains only the focused recipe's reachable input graph.

## Where the recipe is used

The reverse tree follows parent recipes to direct and indirect menu plans and banquet orders. Links open the saved record; menu status, banquet status/date and saved quantities distinguish planned, active and historical uses. Parent recipe rows show the child quantity/multiplier, its cost share in that parent, estimated parent cost and inherited allergens. Saved downstream quantities do not change when the input preview is scaled.

Consumer output is bounded, with a warning when not all uses fit. Menu and banquet reads each fetch at most 301 records to detect overflow; the consumer walk has a 300-entry work budget and a 32-level depth limit. Open a parent recipe to continue exploring.

## Verification

`npm test` covers shared multi-tier demand/costs, normalized and incompatible units, tiny fractions, inherited allergens, unknown prices/yields, cycles, limits and indirect consumers. After a production build, run disposable harnesses separately:

```bash
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="recipe-dependencies workspace" npm run test:transactions
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="print-controller" npm run test:transactions
```

Use the local Playwright module/executable overrides documented in repository structure. Dependency screenshots are saved under `/tmp/recipe-dependencies-review`. Browser assertions cover desktop/mobile, scaling and reset, shares/tags, linked consumers, missing/stale prices, unit mismatches, cycles, staff preview, and unchanged recipe/order/snapshot/production/accounting facts. Keep workspace and print-controller in separate harnesses: workspace intentionally changes the recipe yield that print fixtures expect to remain fixed.
