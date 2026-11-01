# Monthly labor, gross sales and food purchases

Managers/admins open **Purchasing & Accounting → Monthly Tracker**. Select a venue and month, then click a day to enter gross sales as reported by the POS, actual labor dollars, and notes. Record food purchases/credits in the day's Food spending view or from a stored invoice. All monetary totals use integer cents. Blank fields mean unknown; explicit zero means a recorded zero.

The month shows daily sales/labor/food figures, labor and purchase percentages, completion status and monthly totals. On phones the calendar shows compact sales figures; selecting a date exposes all three metrics. Monthly percentages divide recorded total costs by recorded gross sales, rather than averaging daily percentages. Missing elapsed-day entries make totals provisional. Zero/unknown sales have no percentage denominator. This version tracks food **purchases**, not inventory-adjusted cost of goods sold or net profit.

Check **Food entries reviewed for this day** after entering its invoices and credits. With no active purchases, this explicitly records $0 food spend. Late invoices, corrections, voids, or reconfirmed invoice totals reopen food review on affected dates without changing sales/labor. Completed records remain correctable with a reason and append-only history. Sales/labor are entered as daily dollar totals; payroll hours, POS integrations, budgets, and inventory adjustments are not inferred.

## Invoice line matching and prices

Store a photo/PDF in **Vendors → Invoice documents**, then open it. Under **Invoice lines & ingredient price history**, enter the invoice date, venue, supplier, description, billed quantity/unit, pack contents and paid line amount. Search the existing ingredient database by name, vendor code or GCODE and choose the matching product. This is reviewed manual matching; it does not invoke paid AI or automatically transcribe an image.

For example, two cases with 10 lb each and a paid line total of $60 records $3/lb against the matched ingredient. Unit conversion must be compatible with the ingredient's cost unit; incompatible weight/volume or unknown pack conversions are rejected. Pack measurements must be supplied explicitly, including when quantities are billed by weight. Actual discounts belong in the paid line amount. Negative line totals represent credits.

Unmatched lines can remain in the invoice and contribute to food spending, but have no ingredient price observation until matched. Clear **Include this line in food spending** for non-food purchases. Corrections/voids require an explanation, retain the original facts, and increment the invoice's line revision. One document's active lines use one supplier; confirm they use one invoice date and venue before posting the total.

Each matched ingredient's detail page shows invoice price observations, supplier trends, consecutive same-supplier changes, pack details and invoice links (latest 100 lines). Compatible historical price bases are converted to the ingredient's current unit for comparison; incompatible bases remain labeled separately. Credits are visible but excluded from positive-purchase trends. Matching does not automatically change catalog prices, recipe costs, stock, or the prep accounting ledger. Ingredients with invoice history cannot be deleted by duplicate consolidation; recipe-only replacement remains available.

## Confirming food spend

Choose **Use reviewed food-line total** after entering all invoice lines. The server checks the exact food-line sum, invoice revision, date and venue before recording it in the calendar. An existing record for that document is corrected rather than added again. The same document, or the same assigned supplier/invoice reference, cannot be counted through a second food record. A single invoice currently belongs to one venue/date; invoice splits across venues are not supported.

Later line edits preserve the last confirmed calendar amount and mark it for reconfirmation. The affected day cannot complete its food review until the invoice total is reconfirmed. This keeps partially entered invoices from silently replacing a previously reviewed total.

The calendar also supports manually entered purchases/credits, optionally linked to an invoice document. If a manual receipt later gets a document, edit that same entry to attach it. Unlinked manual entries cannot be automatically recognized as the same invoice and must be reviewed for duplicates. Voided records remain visible in history and are excluded from totals.

Food spending follows the date shown on the invoice/credit, not its upload date. Existing archived invoices start without fabricated spending or line items. Saving an upload alone does not create a purchase, modify prices or add a calendar amount. The original document storage, previews, downloads and no-AI boundary remain available.

## Access, exports and deployment

Only current database managers/admins can read the tracker, export monthly CSV, record spending or view invoice price history. Staff have no tracker/price-history navigation or write/API access. Existing invoice document permissions remain intact. CSV contains a row for every date in the selected month, preserving blank/zero distinctions, percentages, review status and daily notes. Spreadsheet formula prefixes in text are neutralized.

Apply `20261101030000_operating_calendar` before release; normal `npm start` applies migrations. It adds daily operating records, food spending, reviewed invoice lines, invoice revision metadata, and audit-protection triggers. Existing invoices, prices, requests, frozen packets and accounting facts are not backfilled or rewritten. Include the new tables in normal database backups.

Verification: `npm test` includes exact-cents parsing, month boundaries, weighted rates, missing/zero/credit/void behavior, CSV and normalized invoice prices. `npm run test:transactions` checks current roles, stale/concurrent saves, idempotent retries, duplicate invoices, immutable history, ingredient-reference protection, invoice posting/reconfirmation, and unchanged catalog/ledger data.

After building, run `PREP_BROWSER_SMOKE=1 OPERATING_CALENDAR_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` for desktop/mobile entry, manual spending, invoice matching, price history, confirmed food totals, CSV, lost-response recovery, role restrictions and data preservation. The harness uses a disposable database and fictional invoices; it never reads the application database. Playwright/Chromium paths can be supplied with `PREP_PLAYWRIGHT_MODULE` and `PREP_BROWSER_EXECUTABLE`. Review screenshots are saved under `/tmp/operating-calendar-review`.

Release verification: the production build (webpack), TypeScript, targeted ESLint, 206 unit checks, 39 database checks, desktop/mobile operating-calendar browser checks and the existing invoice/archive/export regressions passed. Screenshots were visually reviewed. PDF.js asset paths now use the explicitly traced package directory, preserving PDF upload processing in the production webpack bundle.
