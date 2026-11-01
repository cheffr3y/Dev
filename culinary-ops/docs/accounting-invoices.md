# Accounting codes and stored invoice documents

## Accounting codes and exports

GL means general ledger: expense accounts supplied by accounting. Venue codes identify cost centers. **Accounting → Configure accounting codes** lets admins assign category/labor accounts and venue codes. Unknown codes start blank and remain visibly unmapped in exports.

The workbook includes **Executive Summary**, **Inter-Venue Transfers**, **Line-Item Detail** and the existing supporting tables. Captured charges, exclusions, credits and closeout rules retain their meaning. New report snapshots capture current category/code metadata alongside historical costs. Re-downloading an existing snapshot returns its original mappings and totals. Historical ingredient records without category provenance are explicitly unmapped. Labor support includes labor account codes.

The usual CSV retains its sectioned report format. **Transfer CSV (single table)** has one header and transfer rows for accounting import preparation. Review codes and column mappings in the receiving system; downloads never post charges.

## Invoice storage

Managers/admins open **Vendors → Store invoice photos / PDFs** or **Ingredients → Invoice documents**. Drop/upload a PDF/JPEG/PNG/WebP under 8 MB, or take a phone photo. Add an optional vendor, invoice number and notes before storing. PDFs may contain 1–20 pages. Encrypted or malformed documents are rejected.

Photos are automatically oriented, limited to a 2600-pixel longest edge without upscaling, and compressed at JPEG quality 82. PNG sources use a smaller PNG result when that better preserves sharp text. Unnecessary photo metadata is stripped. PDF copies target 150 dpi with a 2600-pixel page limit, retain each page's dimensions/order, and use JPEG compression. If the raster copy would be larger, the original PDF is retained, preserving the sharp text of compact digital documents. Savings depend on the source; compression cannot repair an already blurry photo.

The archive stores the resulting document and a first-page preview directly in PostgreSQL. It is independent of temporary server files, external storage credentials and AI services. Identical file bytes return the existing archive record. Staff and unauthenticated users cannot retrieve documents. Download responses are private and not shared-cacheable.

Open the full invoice to inspect all pages and small print. The on-page preview is deliberately smaller. Download retrieves the stored copy. Large originals are not also retained: the compact document is the archive record, while already smaller digital PDFs are preserved as-is. This is a reference archive, not a certified original-document retention system.

Uploading, viewing and downloading make **no OpenAI calls** and never change catalog prices, stock or accounting ledger entries.

## Manual line matching and monthly tracking

Stored invoices now support manually reviewed line items matched to the ingredient database, normalized paid-unit prices, supplier history, and explicit food-total confirmation into the monthly gross-sales/labor/food calendar. See [operating-calendar.md](operating-calendar.md). Uploading a document alone still makes no purchase entry and changes no catalog prices.

## Future AI work

AI extraction, matching, automated price proposals and margin approval are deferred in the roadmap. Before activation, benchmark a cheaper model, measure actual cost, add explicit opt-in extraction, record usage and enforce an application spending cap. Keep archive access available even when AI budgets are exhausted. Existing extraction/review helper code and historical review tables are internal groundwork; active routes do not invoke them. No API key is needed for this version.

## Deployment and verification

Use Node 22.13+ (24 recommended). Apply `20261101000000_accounting_invoice_review` and `20261101010000_invoice_document_archive` through normal `npm start` / `prisma migrate deploy`. Database backups now include document bytes and previews. The PDF.js worker/fonts/WASM assets are included in Next's deployment tracing.

Run `npm test` and `npm run test:transactions`. Compression QA uses fictional fixtures under `/tmp/invoice-archive-review`; `scripts/review-invoice-compression.ts` reads the digital PDF and its high-resolution page PNGs there and writes the compact comparisons. The browser harness uses those fixtures with `PREP_BROWSER_SMOKE=1 ACCOUNTING_INVOICES_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` and the local Playwright overrides. Browser checks include uploads/downloads, duplicate files, role restrictions, no-AI endpoints, unchanged prices/ledger, mobile layout and accounting exports.
