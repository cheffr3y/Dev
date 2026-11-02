# Preservation batches and yield costing

Open **Production → Preservation batches** to track dehydration, freeze-drying, curing, fermentation and other preservation runs. The history shows the latest 100 visible batches; filter by Running, Finished or Void to find older work in that state. **New preservation batch** records the initial measurements and starts a multi-day batch.

## Recorded facts

Choose a venue, name and method, with optional source recipe and finished catalog ingredient. Record gross and tare weights in kg, lb, grams or ounces; all measurements in a batch share the chosen weight unit. Enter a reviewed total input cost and its source/reference. This numerator is supplied by the user; the tracker does not infer it from recipe quantities, invoices, stock or elapsed labor. Equipment, temperature/unit, humidity, planned cycle minutes and notes describe the run.

Production and use-by dates are explicit calendar labels. Start/finish times use the entering device's local timezone and are stored as instants; leaving a time blank captures the current time on the first submission, retained for retries. Enter a historical start/finish time when logging a multi-day run afterward. Finish must be after or at start; future timestamps beyond a five-minute clock tolerance are rejected.

Source recipe name/version, finished ingredient name/unit, venue name and effective allergen tags are captured at creation. Tags combine the source recipe/ingredients/sub-recipes, the linked output ingredient and any additional selected tags. Later source edits or removal do not rewrite saved labels. “No recorded tags” does not mean allergen-free.

Shelf-life/storage text and use-by dates are assigned by the operator. The tracker does not infer them from the method or temperature. Unassigned dates/instructions print explicitly as not assigned. A use-by date cannot precede the recorded production date.

## Finishing and calculations

Enter finished gross and tare weights and optional finish notes. Saved results are retained; corrections require a manager to void an unposted batch and create a replacement.

- Initial net weight = initial gross − initial tare; it must be positive.
- Finished net weight = finished gross − finished tare; zero is a valid failed yield.
- Yield % = finished net ÷ initial net × 100.
- Weight loss / moisture-loss estimate = 100 − yield %. Weight change is not a direct moisture measurement. Gains show as weight gain and require explanatory finish notes.
- Finished unit cost = reviewed total input cost ÷ positive finished net weight. Zero finished yield has no unit-cost proposal.
- Actual elapsed time comes from saved start/finish instants, separately from planned cycle time and accounting labor.

## Catalog posting

A manager/admin can explicitly **Apply finished cost to catalog** after finishing. The page shows the current price, proposed price and catalog cost unit. Finished net weight is converted into that cost unit before dividing, so a batch measured in pounds can correctly update an ingredient priced per ounce. Count/case/volume units and zero output cannot be posted. The action is scoped to the linked catalog ingredient; no inventory, prep, transfer or accounting entries are created.

Posting checks the batch revision and the ingredient's current price/unit in a serializable transaction. A stale proposal requires reload/review. Create, finish and price-post retries preserve the original result and create no duplicate audit entries. A retry after a successful price post never overwrites a newer catalog change. Existing purchasing fields are preserved; only unit cost and price freshness update.

Each create, finish, void and price post captures the actor, timestamp and resulting facts in append-only audit history. Posting preserves previous/new prices and unit. A posted batch remains a cost reference and cannot be voided; later catalog corrections use the existing ingredient editor. No automatic reversal is performed.

## Access and labels

Staff create batches for their currently assigned venue and finish batches they created. They can view their own batches and their assigned venue's batches. Managers/admins can view and finish across venues, void unposted records and apply catalog prices. Permissions use current database assignments, including on retried mutations.

**Print batch label** uses the shared print controller/header and QR renderer. It includes batch ID, method, production/use-by dates, finished yield, captured allergens, storage text and an initials field. Running and void batches have conspicuous status labels. The QR opens the authenticated batch record and preserves its destination through sign-in. Normal layout uses one Letter page for the standard label; print controls are hidden on paper.

## Deployment and verification

Deploy migration `20261102010000_preservation_batches` through the normal migration-first startup (`npm start`) and regenerate Prisma Client during installation. It adds separate batch/audit tables without changing existing production or accounting records. Recipe and ingredient reference IDs are frozen facts rather than foreign keys, so retaining history does not block catalog consolidation/deletion. The removed target is read-only history and cannot receive a price post.

`npm test` covers net-weight/yield/cost math, conversions, zero output, gains, floating-point tolerance, invalid dates/measurements and immutable inputs. The disposable PostgreSQL harness includes preservation authorization, snapshots, concurrency, stale price/unit checks, retry behavior, append-only audit protection and unchanged ledger assertions. After building:

```bash
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="production-jobs" npm run test:transactions
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="event-planning print-controller" npm run test:transactions
```

Use the local Playwright overrides described in repository structure. The expanded production-jobs suite tests UI create/finish/price-post response loss, validation, multi-day duration, price conflicts, frozen label tags/dates, independently decoded QR/sign-in return, mobile access and unchanged prep snapshots/ledger facts. Review artifacts are under `/tmp/production-job-review`, including `preservation-label.pdf`.
