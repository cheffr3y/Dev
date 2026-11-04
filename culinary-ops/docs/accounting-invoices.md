# Accounting codes and stored invoice documents

Invoices have their own navigation entry at `/invoices` for managers and admins. Previous `/vendors/invoices` links forward there with the selected invoice and filters preserved. Vendors remain the supplier directory.

## Focused invoice workspace

Use **Add invoices · PDF or photo**, select the document and any supplier/reference, then choose **Scan & review**. The capture form collapses while an invoice is selected; queued uploads, progress and recovery actions remain visible.

On desktop, the source stays beside review. Use page controls and zoom to inspect the stored document; choosing a candidate line selects its source page. On a phone, the sticky **Review lines / View invoice** controls switch surfaces while retaining the current row and entered values.

The review pane uses one editable spreadsheet for recognized, manually added and already saved purchases. Supplier, venue, invoice date and an optional invoice total live in the sticky header. The food-line total updates while editing; its difference from the invoice total remains visible. All invoices use USD automatically.

Each included row has its OCR description and editable SKU, ingredient picker, billed quantity, shorthand pack, paid line total and normalized unit-cost preview. Examples of supported packs are `16 oz x 16`, `105/1.3OZ PK`, `30 LB CS` and `1 cs (5 lb)`. Selecting an ingredient fills its learned supplier pack, latest purchase pack or catalog defaults. An explicit pack recognized from a new invoice is retained until edited or a different ingredient is selected. Negative paid totals represent credits. Saved measurement snapshots and invoice-specific each weights remain part of normalization.

Use Tab across cells, Enter or vertical arrows down a numeric/pack column, and Alt+Up/Down between ingredient pickers. The open ingredient list keeps its arrow-key selection behavior. **+ Add Line** appends a row in this same table. Uncheck Include or choose **×** to hide garbage; **Show ignored rows** makes it available for restoration. Delete or Backspace on the focused row also ignores it. Ignoring is recovered in the working draft and becomes a durable invoice decision during batch approval; it does not train a supplier-wide non-food rule. Excluding an already saved purchase preserves its audit history and removes it from food spending.

**Approve All Matched Lines (X)** saves the valid included rows and remembered ingredient/pack mappings in one transaction. If every included row is valid, the same transaction confirms the food amount in the operating calendar and marks invoice review complete. If unmatched or incomplete rows remain, ready rows may be saved while accounting confirmation waits. A failed transaction rolls back purchases, prices, learning and accounting together. A durable batch receipt makes lost-response retries idempotent. Saved rows remain editable in the grid; approval records corrections and reconfirms the food amount.

The local recognizer rebuilds full-width physical rows from positioned PDF text or OCR words, uses shipped quantities, merges pack sub-lines, filters addresses/table headers/totals/legal notices, and marks fuel charges ignored. It retains raw text and normalized bounding boxes when available. Focusing a row selects its source page and highlights that region. Older recognition without coordinates still selects the page. On phones, **Review lines / View invoice** switches surfaces without losing edits.

Working drafts save to the signed-in manager/admin account independently for each invoice, including unfinished packs, rows, include/mapping choices, invoice metadata and document page/zoom. Drafts never approve prices. Save status and retry errors remain visible. Another tab editing the same account draft produces a conflict instead of overwriting it. Server purchase revisions also reject stale corrections. Pending drafts flush before approval; only a server-confirmed draft is durable after leaving the browser.

**Discard invoice & start over** remains above the workspace. Its confirmation lists saved purchases and food spending that will be voided, clears working recognition/drafts, and permits uploading the same document again. Original accounting history and supplier mappings are retained. This UI requires no new database migration beyond the existing invoice learning and review-draft migrations.

## Accounting codes and exports

GL means general ledger: expense accounts supplied by accounting. Venue codes identify cost centers. **Accounting → Configure accounting codes** lets admins assign category/labor accounts and venue codes. Unknown codes start blank and remain visibly unmapped in exports.

The workbook includes **Executive Summary**, **Inter-Venue Transfers**, **Line-Item Detail** and the existing supporting tables. Captured charges, exclusions, credits and closeout rules retain their meaning. New report snapshots capture current category/code metadata alongside historical costs. Re-downloading an existing snapshot returns its original mappings and totals. Historical ingredient records without category provenance are explicitly unmapped. Labor support includes labor account codes.

The usual CSV retains its sectioned report format. **Transfer CSV (single table)** has one header and transfer rows for accounting import preparation. Review codes and column mappings in the receiving system; downloads never post charges.

## Invoice storage

Managers/admins open **Invoices** or follow an invoice link from an ingredient. Drop/upload a PDF/JPEG/PNG/WebP under 8 MB, or take a phone photo. Add an optional vendor, invoice number and notes before storing. PDFs may contain 1–20 pages. Encrypted or malformed documents are rejected.

Photos are automatically oriented, limited to a 2600-pixel longest edge without upscaling, and compressed at JPEG quality 82. PNG sources use a smaller PNG result when that better preserves sharp text. Unnecessary photo metadata is stripped. PDF copies target 150 dpi with a 2600-pixel page limit, retain each page's dimensions/order, and use JPEG compression. If the raster copy would be larger, the original PDF is retained, preserving the sharp text of compact digital documents. Savings depend on the source; compression cannot repair an already blurry photo.

The archive stores the resulting document and a first-page preview directly in PostgreSQL. It is independent of temporary server files, external storage credentials and AI services. Identical file bytes return the existing archive record. Staff and unauthenticated users cannot retrieve documents. Download responses are private and not shared-cacheable.

Open the full invoice to inspect all pages and small print. The on-page preview is deliberately smaller. Download retrieves the stored copy. Large originals are not also retained: the compact document is the archive record, while already smaller digital PDFs are preserved as-is. This is a reference archive, not a certified original-document retention system.

Uploading, viewing and downloading make **no OpenAI calls** and never change catalog prices, stock or accounting ledger entries.

## Reviewed line matching and monthly tracking

Stored invoices support locally recognized or manually entered, reviewed line items matched to the ingredient database, normalized paid-unit prices, supplier history, and explicit food-total confirmation into the monthly gross-sales/labor/food calendar. See [operating-calendar.md](operating-calendar.md). Uploading a document alone still makes no purchase entry and changes no catalog prices.

## Upload queues and progress

Choose multiple files or drop a batch into the archive to queue them one at a time. Each file shows its own status; PDFs report actual completed pages while preparing the compact copy. Vendor, invoice number, and notes are captured when files are queued and apply to every selected file. Later form edits do not change queued files or retries. Successful rows link to their document review.

A failed file does not block later files. Retry uses the original file and metadata; identical bytes resolve to the existing stored document, including when a response was lost after storage. Queues live in the browser page, not a durable background job service. Keep the page open until they finish. Leaving the page stops pending files; an in-flight server operation may still finish. Reloading loses the in-memory queue; reselecting a file safely checks for its existing stored copy.

Upload APIs support optional `Accept: application/x-ndjson` progress events and a terminal `ready` or `error` event. Ordinary callers retain JSON responses and HTTP status codes. Streaming errors carry their status inside the terminal event because stream headers have already been sent. Upload progress is indeterminate while sending bytes or doing work with no measurable total; page counts use actual completed pages.

After storage, the browser queue runs local recognition on the original selected file before opening review. OCR failure leaves the stored document available for retry or manual entry. No paid extraction service is called.

## Paid-price trends and variance alerts

The ingredient catalog and recipe costing show compact SVG price trends from up to eight compatible positive reviewed invoice observations from the same supplier. The current catalog supplier is used when assigned; otherwise the most recent supplier with compatible paid data is chosen. The chart label identifies the supplier, basis, and paid values. Samples come from the latest 100 eligible observations per ingredient, ordered by invoice date, entry time, and ID. One observation has no implied trend.

Prices are converted to the displayed ingredient cost unit before comparison. Credits, voided lines, zero/nonfinite prices, and incompatible units are excluded. Invoice review compares a saved matched line to an earlier compatible positive line from the same supplier on another invoice; it never uses a future invoice as a prior price. A missing baseline produces no percentage or warning. Historical review searches the latest 100 eligible observations per ingredient through the invoice's latest line date.

An amber badge flags increases strictly greater than `PRICE_VARIANCE_THRESHOLD_PERCENT` (default 10). Set that server environment variable and restart/redeploy to change it; invalid or negative values fall back to 10. Comparisons use full precision, with a small floating-point tolerance at the threshold. Visible percentages are rounded for readability.

Approving a positive, matched food purchase updates the ingredient master cost in the same serializable transaction as the purchase/history record. Billed quantity × explicitly reviewed pack contents is converted into the ingredient's existing cost unit; catalog units, vendor assignments, pack definitions and usable-yield factors are preserved. No weight/volume density or case contents are invented. Recipe and nested recipe costs, portion costs, menu margins/cost bars, current spec sheets and order-guide estimates derive from these live master costs. App layout/page caches are invalidated on approval. Frozen prep packets, captured accounting charges, stock and previously generated report snapshots retain their original facts.

The most recent eligible purchase by invoice date, original line entry time and ID controls master pricing across suppliers. Older uploads still establish paid-price history but do not override a newer eligible price. Credits, voids, excluded/non-food lines and incompatible historical bases do not establish a catalog cost. Correcting/remapping/voiding a source recomputes its affected ingredients from the next eligible purchase, or restores the captured pre-invoice cost when none remains. A different later manual catalog price/unit is preserved during reversals; an explicitly approved new purchase can establish a new source. Retried identical approvals never reapply costs or duplicate learned hits. `InvoicePriceChange` retains append-only before/after cost, unit, actor, invoice/source-line IDs and timestamps; `InvoicePurchaseLine` remains the supplier-paid price history used by trends. Mini trends remain hidden on paper.

## 100% local OCR and learning

Photos use local canvas upscaling (target width 1600px, bounded 3200px longest edge), grayscale/contrast stretching and adaptive thresholding before self-hosted Tesseract PSM 6 with preserved inter-word spaces. PDFs use embedded text first; scanned pages render locally for Tesseract. Up to 20 pages and 200 candidate rows are supported. Self-hosted worker, English language data, PDF worker/fonts/WASM are prepared at build time. No API key, external vision service, LLM call or CDN is used. Smoking OCR shares the worker lifecycle while retaining its existing sparse-text mode and preprocessing.

The normalized raw-text draft is saved on the invoice and reused on later visits. Repeated uploads reuse the document and draft. Recognition never approves a price. Rows retain page/line/raw text, editable SKU/description/quantity/unit/unit price/extended price, proposed pack conversion, math/correction warnings and top candidate ingredients. Batch approval confirms the reviewed rows in USD. Missing/unreadable numbers remain missing; math ambiguity is flagged. Fees can be saved as ignored without inventing a food price or quantity. The original full invoice remains available for visual checking.

Matching tiers are supplier-specific learned code/text, global learned fallback, fuzzy learned aliases above 0.82 (Levenshtein plus token Jaccard), catalog suggestions using culinary abbreviations, and unmatched. Hit count breaks learned-match ties; it never upgrades a weak match. Exact ignored aliases auto-mark a draft ignored; fuzzy ignored similarities do not silently suppress a food row. All proposed actions remain reviewable.

Override with the ingredient picker or exclude non-food rows. Remember is checked by default and can be disabled per row. Matching and pack edits train the supplier alias only during approval, so an exploratory selection does not change future matches. The confirmed pack is retained for later invoices; explicit pack text on a new invoice takes priority over suggestions. Batch receipts and recognized-line uniqueness prevent duplicate purchases or learning after response loss. Ignored rows remain available through **Show ignored rows**. Food-total posting is included when the batch resolves all included rows.

Paid extraction is disabled, including the former unused parser. Uploaded documents and local OCR text are treated as data, never instructions.

### “Invalid request origin” behind a deployment proxy

OCR saves, personal draft saves, review completion and ingredient measurement updates validate the browser's Origin against the direct request URL or the proxy's public host/protocol. An HTTPS browser request can legitimately reach Next.js through an internal HTTP address. Comparing only `request.url` rejected that setup before recognition could be saved; the shared `lib/auth/request-origin.ts` check handles the forwarded public address while rejecting unrelated origins, malformed values and protocol/port mismatches.

The hosting proxy must overwrite incoming `X-Forwarded-Host` and `X-Forwarded-Proto` with its trusted public address and scheme (or preserve the public Host when no forwarded host is supplied). Do not remove the origin check or enable arbitrary origins. This fix requires an application deployment, with no database migration or changes to stored invoices. After deployment, reopen the invoice and retry local OCR. Regression checks save a real recognition draft using public HTTPS forwarding headers and verify cross-site writes remain blocked on all four endpoints.

## Deployment and verification

Use Node 22.13+ (24 recommended). Apply `20261101000000_accounting_invoice_review` and `20261101010000_invoice_document_archive` through normal `npm start` / `prisma migrate deploy`. Also deploy `20261102020000_local_invoice_learning` and regenerate Prisma Client. It adds alias/correction memory, reusable local drafts, unique recognized rows, learning receipts and catalog-price provenance without repricing existing historical lines in a backfill. Database backups include document bytes, previews, drafts and learning records. The PDF.js worker/fonts/WASM assets are included in Next's deployment tracing.

Run `npm test` and `npm run test:transactions`. Compression QA uses fictional fixtures under `/tmp/invoice-archive-review`; `scripts/review-invoice-compression.ts` reads the digital PDF and its high-resolution page PNGs there and writes the compact comparisons. The browser harness uses those fixtures with `PREP_BROWSER_SMOKE=1 ACCOUNTING_INVOICES_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` and the local Playwright overrides. Browser checks include uploads/downloads, duplicate files, role restrictions, no-AI endpoints, unchanged prices on upload alone, reviewed price cascading, unchanged frozen/ledger facts, mobile layout and accounting exports. Run the `local-invoices` suite for real digital-PDF text extraction, photo/scanned-PDF Tesseract, aliases/ignore/quick-create, changed pack sizes, approval retries and menu/order-guide propagation with external requests blocked.
