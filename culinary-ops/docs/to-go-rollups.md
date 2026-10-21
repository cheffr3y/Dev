# HMR Rollouts

HMR Rollouts are menu proposals for recurring Home Meal Replacement programs,
monthly specials and seasonal offerings. The workflow focuses on proposed dishes,
menu descriptions, recipe food costs, proposed prices, and storage/reheating notes.
Existing Holiday & To-Go records and `/to-go` links continue to work.

## Propose the menu

Create a blank menu by default, or explicitly select the Thanksgiving starter.
Name and venue are the main setup fields. Dates, pickup details, status and
planning notes are optional and collapsed.

Add an item by name or select a recipe. Choosing a recipe fills an empty item
name and selects a compatible default selling unit (lb, quart or each). Existing
item names and selected units are not overwritten. Only the item name is required.
A menu description, proposed price, and storage/reheating notes can be developed
as the proposal takes shape. Section and planning notes are optional disclosures;
sort order is assigned automatically. Estimated demand remains optional and is
collapsed, so proposing a menu does not require sales or production figures.

Packaging, production targets, confidence scores and actual sales are not
requested in the proposal editor. Their existing values remain stored and are
preserved during an unrelated edit. Changing selling units resets unit-dependent
numbers instead of silently interpreting old amounts in a different measure.

## Recipe costs and printouts

The proposed price and recipe food cost share the same selling unit. Weights
and liquid volumes convert within their families. A kit or incompatible yield
requires an explicit amount of the recipe per selling unit to estimate food cost.
Custom amounts retain their measurement unit if the recipe's yield changes later.
Missing links, invalid yields, incompatible ingredient/component units, cycles,
and missing prices leave food cost unavailable instead of guessing.

The costing view uses food cost only. Legacy packaging costs do not affect its
food cost percentage or price-less-food-cost calculation. Stale ingredient prices
stay visibly flagged. Price less food cost is before labor, overhead and other
expenses; it is not net profit.

**Print menu proposal** is the main output: item names, descriptions, proposed
prices and storage/reheating notes. The complete proposal book also includes
recipe costing, allergens, recipe/sub-recipe cards and the vendor checklist.
Production quantities, packing sheets and actual-sales comparisons are excluded
from the proposal book. Older direct forecast/packing packet URLs remain valid
for existing bookmarks but are not offered in the proposal workflow.

## Reuse next month

Open **Copy for next month / another rollout**, enter the new name, and create
an independent draft. The copy retains the venue, menu items, recipe links,
selling specifications, proposed prices, descriptions and reheating notes.
Legacy packing setup is also retained without being requested in the editor.
Sales estimates, production targets, actual sold, confidence, period-specific
notes, order cutoff and pickup dates reset. New IDs are generated for the rollout
and items. The original proposal and shared recipes remain unchanged.

## Validation and delivery

No database migration is needed for this refinement. Existing data models and
URLs stay in place. Managers edit and copy; staff read and print.

Run `npm test`, `npx tsc --noEmit`, `npm run build`, and lint changed files.
`npm run test:to-go` runs the real forms and print modes in a disposable PostgreSQL
cluster. It verifies name-only entry, recipe autofill, visible reheating notes,
food-only pricing, retention of old operational facts, independent monthly copies,
role enforcement, proposal print modes, old bookmarks and mobile layout.
Set `PREP_PLAYWRIGHT_MODULE` and `PREP_BROWSER_EXECUTABLE` when needed;
`TO_GO_REVIEW_DIR` controls review screenshots and PDFs.
