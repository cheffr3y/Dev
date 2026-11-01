# Event work and combined purchasing

Chunk 7 keeps cooks' work organized by event. Open **Production** for dated work summaries; select a range of up to 31 days. Each event/request retains its name, date, destination, quantities, instructions and links to its own cook or packing sheet. Prep deadlines and assigned cooks have paper write-in fields. No work is automatically combined into shared production batches.

Weekly banquet prep and cook packets now print separate event sections. Supporting recipes also carry the event identity, and deeper recipe references link within that event's section. Existing day-prep bookmarks open the event-based daily work view. Completed/cancelled banquets and festivals are excluded from upcoming work.

## Purchasing

Managers/admins select the events or prep requests they want and choose **Combine selected shopping lists**. The resulting printable list groups raw ingredient needs by vendor/category and shows each event's contribution in the total's unit. Check stock and enter the actual order amount on paper. No order is placed automatically.

- Banquets use their ordered quantities and units.
- Festivals use the same buffered forecast and chef overrides as their existing planning screens. Unlinked forecast-only lines require review.
- To-Go uses production targets (or forecasts when no target exists) and the explicit package-to-recipe mapping. Order cutoff is labeled as a cutoff, not a service date. Undated plans require the include-undated option.
- Daily Prep includes unfinished requested/printed/in-progress lines. Printed work uses its saved order or daily packet contents. If a frozen packet is unavailable, purchasing excludes that work and explains why; current recipes never silently replace historical contents.

Compatible units combine. Raw-purchase quantities account for the catalog's current usable-yield factor; pack suggestions round up only when a compatible structured pack is known. Current vendor, yield and pack settings remain purchasing estimates, even when recipe demand comes from a frozen packet. Incompatible units stay on separate lines, labeled for review. Invalid/missing yields, links, conversions or circular recipe dependencies produce warnings rather than invented batch amounts. A partially calculable recipe is excluded as a whole.

Selection is explicit. If a banquet's work has also been entered as a Daily Prep request, select the appropriate source once; the app cannot infer that two independent records represent the same physical demand. Every contribution is visible for review. A repeated source selection is counted once. Changing the range or completing/cancelling a source removes it from eligible demand and shows a stale-selection warning.

The purchasing view is manager/admin-only. Signed-in staff can view event work and their existing event packets. Accounting closeout retains its admin-only route and is linked for admins from Production. Planning views do not write requests, recipes, inventory, production batches, transfers, timers, or frozen packets.

## Locked BEO baseline

On a banquet's **Setup & vessel pull** page, save the setup and choose **Lock BEO baseline**. A manager/admin locks the saved header, food quantities/instructions, recipe allergen/critical notes, and setup details as one permanent reference. Changes since that baseline show an amber before/after table and a `REVISED` badge, including guest-count differences. The change summary appears on the banquet detail/setup pages, individual prep/cook sheets, and weekly event cook packets. Changes are shown regardless of lead time, including inside 48 hours.

The baseline is immutable and cannot be replaced by another click. A stale preview requires reload before locking. Packing checkbox changes do not generate BEO changes. The badge's date is the banquet's most recent saved update date in Chicago time; it is not a full edit-by-edit BEO revision history. The field comparison always uses the original locked reference.

## Menu margins

Menu workspaces show averages by menu category, average contribution margin, costed/total dish counts and counts above target. Dish bars show actual food cost with a target marker. Positive menu prices and complete, convertible nested recipe costs are required for verified averages. Missing costs, bad yields, empty builds, conversion fallbacks and cycles require review and are excluded. Stale prices remain explicitly labeled estimates. Averages are unweighted and do not forecast sales mix.

## Deployment and checks

Apply `20261101020000_event_production_planning` before release; normal `npm start` applies migrations. It adds only `BanquetBaseline` and an update-protection trigger. No existing historical packet or accounting values are rewritten.

`npm test` includes purchasing traversal/conversion/yield checks, category margins, and BEO comparison/rendering. `npm run test:transactions` adds disposable PostgreSQL checks for current-role authorization, stale/concurrent baseline locks, immutable snapshots, source scope/forecast/package mappings, frozen daily recipes, and unchanged accounting/request facts.

After a production build, run `PREP_BROWSER_SMOKE=1 EVENT_PLANNING_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` for desktop/mobile flows and the existing banquet-setup regressions. Add `PRINT_CONTROLLER_BROWSER_SMOKE=1` to also run the shared print-controller and recipe-costing browser regressions. Set `PREP_PLAYWRIGHT_MODULE` and `PREP_BROWSER_EXECUTABLE` if using bundled Playwright/Chromium. All checks use a disposable database, never the application database. Screenshots and sample PDFs are saved under `/tmp/event-planning-review` for visual review.
