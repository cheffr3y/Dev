# `culinary-ops` Master Commercial Roadmap & Agent Execution Guide

## Product & Architecture North Star
1. **Desktop Executive Command Center:** The web application is a commercial-grade desktop/laptop executive platform used for recipe costing, menu engineering, vendor pricing, scheduling, and accounting integration. The UI should look and feel like an enterprise financial/ERP platform (e.g., Linear, Ramp, Stripe): high-density data tables, crisp `1px` borders, tabular monospace numbers (`font-variant-numeric: tabular-nums`), keyboard-first inline editing, and high-signal financial badges.
2. **Paper is the Line Cook UI:** Line and prep cooks interact with the system via printed physical clipboard packets (`/packet` and `/print` routes). Every printout must look like a commercial culinary spec sheet—Sharpie-friendly write-in cells (`min-height: 28px`), explicit `[  ]` checkboxes, zebra-striped rows, zero awkward page-break orphans (`break-inside: avoid`), and a non-printing floating toolbar for batch scaling and 1-page density squeezing.

---

## Chunk 1: Commercial UI Foundation & Navigation Architecture
**Goal:** Make the desktop application immediately look and feel like an enterprise financial/hospitality platform (high-density data, crisp borders, aligned numbers, zero clutter).

**Target Files:**
* `app/globals.css`
* `components/ui.tsx`
* `components/DesktopSidebar.tsx`
* `components/Sidebar.tsx`
* `components/AtelierHeader.tsx`
* `components/RecipeCosting.tsx`
* `components/CostAudit.tsx`
* `app/(app)/recipes/RecipesTable.tsx`
* `app/(app)/festivals/[id]/accounting/AccountingWorksheet.tsx`

### Checklist
- [x] **Enterprise Surface & Border Tokens:** Update `app/globals.css` and `components/ui.tsx` with a refined commercial dark/slate palette—deep background surfaces, elevated card surfaces, crisp `1px` subtle borders, and high-contrast semantic pills (Emerald = On Target, Amber = Missing Price/Warning, Crimson = Over Cost/Alert), while strictly preserving clean black-on-white styles inside `@media print`.
- [x] **Tabular Monospace Financials:** Create a global `.tabular-nums` utility (`font-variant-numeric: tabular-nums; font-family: var(--font-mono), monospace;`) and apply it to every dollar amount, unit cost, weight, yield, and Food Cost % across `RecipeCosting.tsx`, `CostAudit.tsx`, `RecipesTable.tsx`, and `AccountingWorksheet.tsx` so decimals align vertically.
- [x] **High-Density Table Layout:** Reduce vertical row padding across all data tables so 25–30 rows fit comfortably on a laptop screen, and add sticky headers (`position: sticky; top: 0`) to long tables.
- [x] **Commercial ERP Sidebar Grouping:** Reorganize `DesktopSidebar.tsx` and `Sidebar.tsx` into structured collapsible sections:
  * **Operations:** Dashboard, Prep Orders, Production, Schedule
  * **Culinary & Events:** Recipes, Menus, Banquets, Events, Festivals, To-Go
  * **Purchasing & Accounting:** Items, Vendors, Order Guides, Inventory, Prep Reports
- [x] **Hide Non-Ops Modules from Primary Nav:** Remove `/homestead` and `/trivia` from the main culinary sidebar (keep their routes accessible via direct URL or a discrete footer link) so the workspace presents 100% as a dedicated commercial hospitality suite.

### Implementation status — October 29, 2026

Implemented. The desktop and mobile navigation share collapsible groups; Prep Reports respects its existing admin-only access. Screen workspace colors and table density are scoped away from paper previews and print. Recipe price warnings have their own column so monetary amounts stay aligned.

Validation: TypeScript, targeted ESLint, the production build, 158 unit checks, and 24 disposable-PostgreSQL integration checks passed. Browser review covered group toggles, persisted sidebar collapse, active-link selection, role visibility, a 40-row sticky-header table, accounting figures, mobile navigation, and recipe print styling.

### Copy-Paste Agent Prompt for Chunk 1
> Read `AGENTS.md`, `app/globals.css`, `components/ui.tsx`, `components/DesktopSidebar.tsx`, and `components/Sidebar.tsx`. Execute **Chunk 1** of `ROADMAP.md`: upgrade the web UI to a high-density commercial enterprise design system, enforce `.tabular-nums` across all financial/weight columns in `RecipeCosting.tsx`, `CostAudit.tsx`, `RecipesTable.tsx`, and `AccountingWorksheet.tsx`, reorganize the sidebar into Operations / Culinary & Events / Purchasing & Accounting, and remove `/homestead` and `/trivia` from the primary navigation. Strictly preserve `@media print` black-on-white styling. Run `npx tsc --noEmit` to verify when complete.

---

## Chunk 2: Executive Dashboard & `Cmd+K` Action Center
**Goal:** Turn the home page into a high-signal morning command center and let you trigger any major workflow or print job from the keyboard.

**Target Files:**
* `app/(app)/page.tsx`
* `components/CommandSearch.tsx`
* `components/PriceIntegrityNotice.tsx`

### Checklist
- [x] **Executive "Morning Pulse" Dashboard (`app/(app)/page.tsx`):**
  * **Card 1 — Costing & Price Integrity:** Count of active ingredients with `$0.00` cost, missing units, or unlinked vendors (clicking opens `/items/cleanup`).
  * **Card 2 — This Week's Event & Banquet Load:** Summary of active banquets, guest counts (pax), and upcoming festival/event milestones for the next 7 days.
  * **Card 3 — Prep & Closeout Queue:** Open daily prep worksheets (`prep-orders/closeout`) and pending inter-venue transfers awaiting sign-off.
  * **Card 4 — Menu Margin Watchlist:** Quick list of active menu items whose food cost % has crept above target threshold.
- [x] **Upgrade `CommandSearch.tsx` (`Cmd+K`) to an Action Palette:**
  * Add instant action commands (not just page links): *"Print This Week's Banquet Packet"*, *"Export Prep Accounting XLSX"*, *"Open Daily Closeout"*, *"Merge Duplicate Items"*, and *"New Recipe"*.
  * Add keyboard shortcut hints (`↑` `↓` to navigate, `Enter` to execute, `Esc` to close).

### Implementation status — October 31, 2026

Implemented. Morning Pulse shows company-wide in-use ingredient integrity, the selected venue’s next seven days of active events/banquets plus shared festivals, the admin-only company-wide closeout queue, and above-target dishes on active venue/shared menus. In-use ingredients have recipe, inventory, order-guide, or festival-count references; unused catalog entries do not inflate alerts. Integrity links open the matching cleanup list (or the read-only ingredient filter for staff). Nested missing costs, invalid yields, unit mismatches, empty builds, and cycles require margin review; stale prices remain labeled. Historical ledger records do not become new unfinished closeout days.

The action palette prints the current Monday–Sunday banquet packet, downloads Sunday-to-today accounting XLSX, opens today’s closeout/prep, reviews duplicate consolidation, and opens the recipe creation form. Dates follow Chicago business time and refresh each time the palette opens. Actions and queue reads respect current database roles; accounting and closeout remain admin-only. Printing is requested once and does not repeat on reload. Keyboard navigation, focus containment/restoration, scrolling, empty results, and export failures are handled.

Validation: TypeScript, targeted ESLint, the production build, 167 unit checks, 24 disposable-PostgreSQL transaction checks, dedicated dashboard database assertions, and desktop/mobile browser checks. Browser coverage includes data scope, ingredient review links, role restrictions, keyboard recovery, repeated recipe-form opening, XLSX download/error feedback, print invocation/reload behavior, and print styling. Desktop/mobile screenshots were visually reviewed; a packet PDF and accounting workbook were captured from disposable fixtures.

### Copy-Paste Agent Prompt for Chunk 2
> Read `app/(app)/page.tsx`, `components/CommandSearch.tsx`, and `components/PriceIntegrityNotice.tsx`. Execute **Chunk 2** of `ROADMAP.md`: transform `app/(app)/page.tsx` into an Executive "Morning Pulse" Dashboard with the 4 high-signal operational/accounting cards, and upgrade `components/CommandSearch.tsx` into a full `Cmd+K` action palette with quick-action shortcuts and keyboard hints. Verify with `npx tsc --noEmit`.

---

## Chunk 3: The "Bulletproof Clipboard" Print Engine (Part 1: Global Controller & CSS)
**Goal:** Since paper is the UI for your cooks, make every printed sheet look like a commercial spec sheet that never splits awkwardly across pages.

**Target Files:**
* `components/PrintButton.tsx` (or new `components/PrintController.tsx`)
* `app/globals.css`
* `app/(app)/recipes/[id]/print/page.tsx`
* `app/(app)/prep-orders/[id]/packet/page.tsx`
* `app/(app)/banquets/[id]/packet/page.tsx`
* `app/(app)/banquets/week/[date]/packet/page.tsx`
* `app/(app)/menus/[id]/packet/page.tsx`
* `app/(app)/schedule/[week]/print/page.tsx`
* `app/(app)/to-go/[id]/packet/page.tsx`

### Checklist
- [x] **Build `<PrintController />` Floating Toolbar:** Replace the basic `PrintButton.tsx` on all `/packet` and `/print` routes with a sleek dark-mode floating control bar (hidden on print via `print:hidden`) containing:
  * **Density Toggle (`Standard` vs. `1-Page Squeeze`):** Toggles a `.print-compact` class on the print wrapper that tightens font size and cell padding by ~15% so a 24-line sheet fits on 1 page instead of spilling 3 orphan lines onto page 2.
  * **Batch Scale Multiplier (for Recipe & Prep prints):** Quick buttons (`0.5x`, `1x`, `2x`, `3x`, plus custom numeric input) that dynamically multiply ingredient weights on the printout.
  * **Scaled Production Banner:** Whenever a recipe is printed at anything other than `1x`, automatically render a bold top banner: `SCALED PRODUCTION BATCH ({scale}x) — DO NOT FILE IN MASTER BINDER`.
- [x] **Standardized Commercial Print Header:** Create a reusable `<PrintSpecHeader />` component for all printouts displaying: Venue Badge, Document Title, Target Date, Print Timestamp, and Page rules.
- [x] **Sharpie-Friendly `@media print` Rules:**
  * Force `min-height: 28px` on all handwritten write-in cells (par, pull, waste, temp check, initials).
  * Add alternating light-gray zebra striping (`#f4f4f5` with `-webkit-print-color-adjust: exact; print-color-adjust: exact;`) so cooks don't lose their row across wide tables.
  * Add `break-inside: avoid` on all recipe cards, prep station groups, and banquet setup sections.

### Implementation status — October 31, 2026

Implemented across all seven `/packet` and `/print` routes. The shared floating toolbar provides Standard / 1-Page Squeeze density, printing, and recipe/prep multipliers (0.5×, 1×, 2×, 3×, legacy 4×, and custom positive values up to 100×). Scale and density are retained through content changes and packet option forms. Quantities and costing are recomputed together; unit prices remain fixed. Prep scaling updates this copy’s frozen ingredient demand, sub-recipe references, shopping list, destination targets, and planned accountability/cooling quantities without changing saved requests, lots, or snapshots. Each nonstandard recipe batch carries the binder warning.

Print headers show venue, document title, target date/reference, Chicago timestamp, paper orientation, and page counters. Handwriting fields retain at least 28px in compact mode. Alternating gray rows, explicit checkboxes, repeating table headings, and section/card break rules keep paper usable. Longer recipes paginate naturally while individual rows and steps stay together. The menu cover no longer creates an empty page when the document header is present. Schedule prints remain landscape.

Validation: TypeScript, targeted ESLint, production build, 173 unit checks, 24 disposable-PostgreSQL transaction checks, and desktop/mobile browser checks for every print route. Existing recipe-costing browser regressions passed. Twelve PDFs (27 pages) were rendered and visually reviewed; page dimensions/counters, hidden controls, empty pages, and retained ingredient rows were checked. The 24-line fixture changes from two pages (three overflow rows) to one in Squeeze; all 80 rows of the long recipe remain present across three pages. Frozen packet snapshots and request rows were unchanged after the checks.

### Copy-Paste Agent Prompt for Chunk 3
> Read `components/PrintButton.tsx`, `app/globals.css`, and the `/packet` and `/print` route pages. Execute **Chunk 3** of `ROADMAP.md`: build the floating `<PrintController />` with 1-Page Squeeze density toggle and dynamic Batch Scale Multiplier (with the scaled production warning banner), add `<PrintSpecHeader />`, and enforce Sharpie-friendly `@media print` ergonomics (`min-height: 28px` write-in cells, zebra striping, `break-inside: avoid`). Verify with `npx tsc --noEmit`.

---

## Chunk 4: QR Project Start / Finish & Admin Review
**Goal:** Scan a prep or banquet project when work starts, finish after labeling/dating, and capture actual elapsed time, yield, and notes for review.

**Scope — October 31, 2026:** QR project logging is the only retained work from the original Chunk 4. The combined packet/compiler, station filters, and label generator remain removed. Chunk 5 follows this work; Chunks 5 and 6 are now implemented.

### Checklist
- [x] **Project-specific printed QR codes:** Prep lot recipe cards, banquet cook cards and prep-sheet food lines, weekly banquet project selection, and daily worksheet recipe groups open the matching project on a phone. Printed copy multipliers remain attached to prep targets. Sign-in returns to the scanned project.
- [x] **Start / finish work:** Cooks and managers start a persistent server timer, then submit actual yield with a compatible unit, shift/quality notes, and labeling/dating confirmation. Repeat scans and interrupted start/save responses reuse the existing project. Managers can finish another cook’s work; staff can finish their own.
- [x] **Admin review and actual-time history:** Review start/finish timestamps, elapsed time, cook, planned versus actual yield, and notes. Yield corrections require an explanation and preserve the original submission. Reviewed prep yields can populate the existing worksheet after an explicit click; deliveries and labor remain for admin confirmation. Pending prep logs block production confirmation and day finalization. Banquet logs create no prep charges.

### Implementation status — October 31, 2026

Implemented. Project logs are separate from the accounting ledger, with database protection for start facts, submitted results, and reviewed records. Elapsed time includes waiting/unattended cooking and never automatically replaces labor person-minutes. Each printed prep lot or banquet food line has one job; scans resume that job instead of starting duplicate timers. Daily/weekly QR selectors lead to the relevant printed lots or banquet event projects.

Apply `20261031000000_production_job_logs` before releasing this version; normal `npm start` applies migrations before serving. Set `APP_BASE_URL` to the public application origin for paper used on phones (the configured auth origin/request origin is the fallback).

Validation: production build, TypeScript, targeted ESLint, 178 unit checks, and 26 disposable-PostgreSQL transaction checks. Mobile/desktop browser checks cover QR decoding, sign-in return, an interrupted start response, reload recovery, labeling/yield validation, role restrictions, admin review and deliberate worksheet prefill, unchanged snapshots, and zero automatic ledger writes. Prep/banquet QR codes also decode from 300 dpi PDF renders; all seven sample PDF pages were visually reviewed.

---

## Chunk 5: Spreadsheet-Speed Inline Editing & Inspector Drawers
**Goal:** Eliminate slow form-by-form clicking when building menus, editing recipes, or updating vendor prices.

**Target Files:**
* `components/RecipeIngredientEditor.tsx`
* `app/(app)/items/page.tsx`
* `app/(app)/order-guides/[id]/page.tsx`
* `app/(app)/menus/[id]/page.tsx`
* `app/(app)/banquets/[id]/page.tsx`
* `app/(app)/prep-orders/[id]/page.tsx`
* `components/RecipeDossier.tsx`

### Checklist
- [x] **Keyboard-Driven Inline Grid for `Items` & `Order Guides`:** Allow clicking directly into Price, Unit, Pack Size, Vendor, and ProdCode cells in `items/page.tsx` and `order-guides/[id]/page.tsx`. Support `Tab`, `Shift+Tab`, and `Enter` to move down rows with optimistic auto-save and a subtle green "Saved" flash.
- [x] **Fast Keyboard Entry in `RecipeIngredientEditor.tsx`:** Let you add 10 ingredients in a row using only the keyboard (type ingredient $\rightarrow$ `Tab` $\rightarrow$ quantity $\rightarrow$ `Tab` $\rightarrow$ unit $\rightarrow$ `Enter` to commit and auto-focus the next new ingredient row).
- [x] **Slide-Over "Inspector Drawer" (`RecipeDossier` & `Item` quick-edit):** When working inside `menus/[id]/page.tsx`, `banquets/[id]/page.tsx`, or `prep-orders/[id]/page.tsx`, clicking an ingredient or sub-recipe opens a right-hand slide-over drawer instead of navigating away. You can fix a missing price or tweak a recipe yield inside the drawer and watch the parent menu/banquet cost recalculate live.

### Implementation status — November 1, 2026

Implemented. Ingredients and Order Guides support field-by-field autosave, Tab / Shift+Tab navigation, Enter down a column, Escape cancellation, visible save feedback, retained failed drafts, and explicit conflict resolution. Ingredient names stay visible while scrolling. Order Guide estimates normalize compatible stock and cost units and flag partial totals when units or prices need attention.

Recipe ingredient entry supports ten consecutive additions using only the keyboard, resets after a successful save, and restores search focus. Menu, banquet, and prep workspaces open recipe/ingredient inspectors with nested navigation, yield and catalog editing, live parent costing refresh, focus/scroll restoration, and mobile layouts. Current database roles protect writes; recipe yield changes are audited. Existing packet snapshots and accounting records remain intact. No database migration is required.

Validation: production build and TypeScript, targeted ESLint, 180 unit checks, and 29 disposable-PostgreSQL transaction checks passed. Browser coverage includes keyboard cell navigation, invalid/conflicting edits, lost-response recovery, ten consecutive keyboard ingredient additions, nested inspector edits and live parent refresh, focus/scroll restoration, mobile read-only access, print visibility, and preserved snapshots/accounting records. Desktop and mobile screenshots were visually reviewed.

See [workspace-editing.md](docs/workspace-editing.md) for operation and verification details.

### Copy-Paste Agent Prompt for Chunk 5
> Read `components/RecipeIngredientEditor.tsx`, `app/(app)/items/page.tsx`, `app/(app)/order-guides/[id]/page.tsx`, and `app/(app)/menus/[id]/page.tsx`. Execute **Chunk 5** of `ROADMAP.md`: implement spreadsheet-style inline keyboard editing (`Tab`/`Enter` with optimistic saves) for Items, Order Guides, and Recipe Ingredient entry, and add a right-hand Slide-Over Inspector Drawer for viewing/editing recipes and items in-place without losing scroll position. Verify with `npx tsc --noEmit`.

---

## Chunk 6: Accounting Pipeline & Compact Invoice Documents
**Goal:** Improve accounting exports and keep readable invoice photos/PDFs for reference without AI usage.

### Checklist
- [x] **Optional accounting mappings:** Admin-configured category/labor GL accounts and venue cost centers. Leave unknown codes blank and flag unmapped exports.
- [x] **Expanded exports:** Executive Summary, Inter-Venue Transfers, Line-Item Detail with cost/mapping flags, and a single-table transfer CSV. Preserve existing ledger values and immutable export snapshots.
- [x] **Invoice document archive:** Upload/drop a PDF or photo, or take a phone photo. Optional vendor, invoice number and notes. Store a compact, readable document in PostgreSQL with authenticated first-page preview, full-size view, download, and duplicate detection.
- [x] **Legibility-aware compression:** Rotate photos, reduce their longest edge to 2600 pixels and compress to JPEG (or a smaller PNG for crisp text). Raster PDF copies target 150 dpi, retain every page and its dimensions, and are stored only when smaller than the source. Already compact digital PDFs keep their original sharp text. Input limit 8 MB / 20 PDF pages.

### Scope decision — November 1, 2026

AI extraction, cross-vendor matching, automated price proposals and API spending controls are **future work**, listed below. The active invoice upload/view/download flow makes no AI calls and requires no API key. Previous AI extraction/review helpers remain internal groundwork, with no active UI or API route to invoke them. Legacy invoice review records are preserved.

Deployment requires `20261101000000_accounting_invoice_review` and `20261101010000_invoice_document_archive`, applied by normal `npm start`. Runtime: Node 22.13+ (24 recommended). Compact document bytes and previews are database-backed, so there is no dependence on ephemeral server disk or a new cloud-storage account. Include these tables in normal database backups.

Validation: production build/TypeScript, targeted ESLint, 187 unit checks and 31 disposable-PostgreSQL transaction checks. Browser checks cover photo/PDF uploads, stored preview/download, duplicate detection, malformed inputs, disabled AI routes, unchanged prices/ledger, permissions, mobile layout and accounting exports. A two-page scan shrank from 1,243,706 to 368,723 bytes; a sample photo from 1,093,354 to 321,703 bytes. Sample digital PDFs remained unchanged when already smaller. Both stored scan pages and seven-point footers were visually reviewed at 150 dpi. Savings vary with source quality/content.

See [accounting-invoices.md](docs/accounting-invoices.md).

---

## Chunk 7: Menu Engineering, Banquets & Event Diffing
**Goal:** Give you commercial menu-engineering analytics, protect the kitchen from last-minute banquet BEO changes, and plan production while keeping each event's quantities, deadlines, and destinations clear to cooks.

**Target Files:**
* `app/(app)/menus/[id]/page.tsx`
* `app/(app)/banquets/[id]/setup/SetupEditor.tsx`
* `components/BanquetSetupSheet.tsx`
* `lib/banquet-setup.ts`
* `app/(app)/production/page.tsx`
* `lib/production.ts`

### Checklist
- [x] **Menu Rollout Margin Matrix (`menus/[id]/page.tsx`):** Add a commercial summary bar at the top of every menu showing Category Average Food Cost %, Average Contribution Margin (`$`), and visual progress bars on each dish comparing actual cost % to your target threshold.
- [x] **Banquet BEO Snapshot & Change Diffing (`banquets/[id]/setup`):** Add a "Lock Baseline / Snapshot" action to Banquet Setups. When event details change 48 hours out (e.g., Guest Count changes from 80 to 115, or a timeline/allergen note changes), highlight the modified fields in high-contrast amber on screen and print a bold **`REVISED: [Date] — Pax +35`** badge on `BanquetSetupSheet.tsx`.
- [x] **Event-based production planning (`/production`):** Select a date range across Banquets, Festivals, To-Go rollups, and Daily Prep Orders, keeping each source job/event separate by default. Cook-facing work and printouts retain event name/reference, venue/destination, service date/time, prep deadline, recipe/variant, quantity/unit, and event-specific instructions. A date-range overview must not replace individual event packets with an undifferentiated weekly total.
- [x] **Combined shopping list for purchasing:** Let the purchaser select source events/jobs and combine their raw ingredient needs into one vendor/category shopping list. Show total quantities with explicit units and each event's contribution; flag missing recipe links, incomplete package mappings, and incompatible units instead of assuming quantities. Keep this purchasing overview separate from cook-facing work. Do not combine production batches or replace event-specific prep sheets, cook packets, project timers, or accounting records.

### Production scope decision — November 1, 2026

The user clarified that only the shopping list should be combined, for their purchasing. Cooks continue to receive separate event prep sheets and cook packets with event identities, quantities, timing, destinations, and special instructions. The weekly packet must also default to separate event sections. There is no shared production-batch or allocation workflow in this chunk. Combined purchasing shows the source event breakdown and remains an estimate until the purchaser reviews it.

### Implementation status — November 1, 2026

Implemented. Production opens date-scoped event work summaries with separate quantities, instructions, destinations and packet links. Managers/admins can explicitly select Banquets, Festivals, To-Go plans and unfinished Daily Prep requests for one vendor/category purchasing list with source contributions, raw usable-yield adjustments, compatible pack suggestions and review warnings. Printed prep demand uses frozen order/daily recipes; unknown mappings and invalid recipe paths are excluded rather than silently approximated. To-Go order cutoffs and undated plans are labeled explicitly. Purchasing creates no production batches or accounting writes.

Weekly banquet prep and cook packets remain event-specific, including supporting recipes, QR projects and event-local reference links. Existing day-prep bookmarks open the daily event view. Locked BEO baselines preserve the original saved reference, reject stale previews and concurrent duplicate locks, and show before/after changes on screen and print. Packing checks do not create BEO changes. Menu category averages exclude incomplete or invalid costing; dish bars show the target and stale-price estimates.

Apply `20261101020000_event_production_planning` before release; normal `npm start` applies migrations. Existing frozen packets and accounting facts are unchanged. See [event-production-planning.md](docs/event-production-planning.md) for operation, scope and verification.

Validation: production build (webpack), TypeScript, targeted ESLint, 200 unit checks and 34 disposable-PostgreSQL checks passed. Desktop/mobile browser coverage verifies source selection/totals/warnings, event separation, live menu margin refresh, BEO locks/revisions, date validation, role restrictions and unchanged frozen/ledger data. Existing banquet-setup, print-controller and recipe-costing browser regressions passed. The purchasing PDF and all four sample weekly-event pages were rendered and visually reviewed; event names remain attached to supporting recipes.

### Copy-Paste Agent Prompt for Chunk 7
> Read `app/(app)/menus/[id]/page.tsx`, `app/(app)/banquets/[id]/setup/SetupEditor.tsx`, `components/BanquetSetupSheet.tsx`, `lib/banquet-setup.ts`, and `app/(app)/production/page.tsx`. Execute **Chunk 7** of `ROADMAP.md`: add category menu margin summaries and dish cost bars, implement locked Banquet BEO baselines with change details on screen and print, and build event-based production planning in `/production`. Preserve separate cook work/packets for every event, including the weekly banquet packet. Add a purchaser-facing combined shopping list for explicitly selected source events/jobs; preserve source contributions, units, conversion warnings and missing mapping warnings. Do not combine production batches. Verify date/selection/source demand, nested recipe math, incompatible units, permissions, event instruction visibility, baseline diffs, print usability, and unchanged historical snapshots/accounting. Run TypeScript and relevant tests/build/browser/print checks.

---

## Chunk 8: The "Un-Fun" Repo & Architecture Cleanup
**Goal:** Pay down technical debt, organize the 70+ flat files in `lib/`, and isolate non-ops code so the repo stays fast and clean for years.

**Target Files:**
* `lib/*`
* `scripts/*`
* `app/(app)/homestead/*`
* `app/(app)/trivia/*`
* `.gitignore`

### Checklist
- [ ] **Organize `lib/` into Domain Folders (with barrel re-exports or clean import updates):**
  * `lib/recipes/` (`costing.ts`, `recipe-cost-sheet.ts`, `recipe-groups.ts`, `recipe-references.ts`, `method.ts`, `method-cues.ts`, `allergens.ts`, `units.ts`)
  * `lib/prep/` (`prep.ts`, `prep-workflow.ts`, `prep-costing.ts`, `prep-accounting-report.ts`, `prep-packets.ts`, `prep-worksheet.ts`, `prep-dates.ts`)
  * `lib/banquets/` (`banquet.ts`, `banquet-setup.ts`, `banquet-week.ts`, `event-status.ts`)
  * `lib/menus/` (`menu-rollout.ts`, `menu-rollout-data.ts`, `to-go-rollup.ts`, `festival.ts`, `festival-accounting.ts`)
  * `lib/games/` (`homestead.ts`, `homestead-storage.ts`, `trivia.ts`, `trivia-engine.ts`, `trivia-custom.ts`, `trivia-fallback.ts`)
- [ ] **Route Group Isolation for Games:** Move `app/(app)/homestead` and `app/(app)/trivia` into `app/(games)/homestead` and `app/(games)/trivia` with their own dedicated layout so they are completely decoupled from the culinary operations shell.
- [ ] **Archive One-Off Launch & Backfill Scripts:** Move `lib/annex-launch-repairs.ts`, `scripts/repair-annex-launch.ts`, and completed `scripts/backfill-*.ts` files into `scripts/archive/` so they don't clutter active application logic.
- [ ] **Consolidate Browser Test Scripts:** Unify the standalone `scripts/test-*-browser.mjs` files into a clean test runner setup.
- [ ] **Git Hygiene:** Remove `.DS_Store` from git tracking (`git rm --cached .DS_Store`) and ensure `.DS_Store` is in the root `.gitignore`.

### Copy-Paste Agent Prompt for Chunk 8
> Execute **Chunk 8** of `ROADMAP.md`: move `homestead` and `trivia` into an `app/(games)` route group, archive completed one-off backfill/repair scripts into `scripts/archive/`, organize `lib/` into domain folders (updating imports cleanly across the repo), and clean up `.DS_Store` in `.gitignore`. Run `npx tsc --noEmit` and the test suite to verify zero broken imports.

---

## Chunk 9: Smoking Program — Batch Logs & Thermometer Photos
**Goal:** Build a repeatable smoking-program history from the thermometer screenshots/photos the kitchen already receives, without requiring a device export or live integration.

**Status — November 1, 2026:** Planned; not implemented. Added from the supplied thermometer screenshot and the kitchen's current product list. Existing Chunks 7–8 retain their order.

### Checklist
- [ ] **Smoking runs with multiple product lots:** Add an Operations workspace for a dated smoker run, venue, smoker/equipment, responsible cook, and notes. A run can contain multiple products with separate load/pull times, quantities, recipe links, and probe assignments. Support brisket, pork shoulder, ribs, whole chicken, cheddar cheese, jalapeño cheddar sausage, and custom products as needed. Keep hot-smoking and cold-smoking procedures/targets separate and configurable by product.
- [ ] **Photo-first cook records:** Upload thermometer screenshots, phone photos, and supporting handwritten sheets to a run or individual lot; allow multiple images per cook. Reuse the compact, authenticated document-storage pattern from Chunk 6 with smoking-specific records. Preserve legible chart labels, viewing/download access, upload attribution, and duplicate detection; do not require a CSV export, device account, or API key. Offer local OCR plus quick manual summary entry beside the image so the first release works without paid AI services.
- [ ] **Local OCR and field parsing:** Run an open-source OCR engine such as Tesseract.js in the user's browser, with self-hosted engine/language assets and no third-party image processing. Normalize light/dark screenshots, locate labels and nearby values, and parse known formats for date, target/peak temperature, units, and duration into a draft. Support the supplied thermometer layout first, using label positions rather than fixed screen coordinates alone. Show the source beside editable results and require confirmation; leave unclear values blank and retain manual entry if recognition fails. Benchmark recognition accuracy and phone performance on real screenshots before release. Handwritten logs remain attachments/manual entry until separately validated.
- [ ] **Structured cook summaries and checkpoints:** Record the source label/date, cooking duration, displayed target and peak temperatures with units, and food-versus-ambient probe identity when known. Keep the device's preset/title separate from the actual product and lot. Allow timestamped manual readings and notes for load, wrap, pull, rest, hold, and cooling where applicable. Distinguish device-reported duration, manually recorded start/finish times, and hands-on labor; leave unknown values blank.
- [ ] **Actual yield and process notes:** Capture raw weight/count, optional trimmed weight, finished usable weight/count and units, trim/waste, seasoning/brine, wood/fuel, smoker settings, and quality notes. Calculate yield/shrink only from compatible measurements and compare planned versus actual output. Link recipes and existing prep/banquet projects where relevant, reusing project identity and review rather than creating duplicate timers. Cook history must not automatically alter recipe yield standards, inventory, or accounting; applying a reviewed prep result follows the existing explicit review/prefill workflow.
- [ ] **Searchable history and repeat cooks:** Filter by product, date, venue, smoker, and cook; compare duration, finished yield, and quality across batches. Start a new run from a prior setup, copying only the procedure/planned settings and never prior readings, actual yields, photos, or review sign-off.
- [ ] **Clipboard smoke sheet:** Print a run/lot sheet with product, raw quantity, probe assignments, planned settings, load/wrap/pull/rest checkpoints, temperature/time write-in rows, yield, notes, and initials. Link its QR code to the corresponding run/lot. Follow the shared print controller/header conventions and retain at least 28px handwritten cells. Allow paper results and photos to be entered afterward.
- [ ] **Review and traceability:** Preserve source photos and original entered readings; record who corrected a value, when, and why. Clearly distinguish unreviewed transcription, confirmed readings, missing checkpoints, and manager/admin review. A device title such as “Well Done,” a setpoint, or a cook timer must not automatically mark a lot complete, approved, or compliant with its configured procedure.

### Optional later phase — expanded photo interpretation

- [ ] Extend local OCR parsing to additional thermometer layouts after validating representative images. Preserve confirmed results and avoid reprocessing on every view. Product/lot and probe assignments still require confirmation when the image does not establish them.
- [ ] Consider paid AI only as an explicit opt-in fallback for layouts local OCR cannot handle, gated on the spending controls described in the deferred AI section below. Local OCR, photo storage, and manual entry remain independently usable without paid AI calls.
- [ ] Retain the chart image for visual comparison. A separate local image-processing experiment could calibrate the axes and trace colored curves, but any reconstructed points must be labeled approximate, preserve gaps/overlap ambiguity, and never be presented as original device samples or proof of threshold timing. Exact time-series ingestion and live alerts require a suitable device export/integration and remain separate future scope.

Implementation references: [Tesseract.js browser/Node OCR](https://github.com/naptha/tesseract.js) and [Tesseract image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html). Local OCR reads text; application rules map that text to cook fields. No paid vision service is required for this approach.

### Acceptance example from the supplied screenshot

A user can attach the October 31, 2026 screenshot to a smoking lot and use local OCR to draft its visible source title **“Breast: Well Done”**, date, target **165°F**, cooking time **6 hr 22 min**, and reported peak **144.8°F**, then confirm/correct those fields before saving. Test the actual OCR output against these expected values rather than assuming recognition succeeds. Actual product, probe-to-lot assignments, start/finish timestamps, and finished yield require user entry or confirmation. The displayed target and reported peak remain separate facts; the title is not evidence of completion. The original chart stays viewable, with no fabricated sample readings. A mixed run can also contain brisket or cheese with independent lot records and procedures.

### Copy-Paste Agent Prompt for Chunk 9
> Read `AGENTS.md`, Chunk 9 of `ROADMAP.md`, `prisma/schema.prisma`, `docs/production-project-logs.md`, and `docs/accounting-invoices.md`. Implement the first-release smoking program: multi-product runs/lots, authenticated photo storage, browser-local OCR with reviewed field parsing and manual fallback, cook summaries/checkpoints, actual yields, searchable history, repeat-run setup, printable QR smoke sheets, and audited review. Support the listed products plus custom additions. Reuse existing production-project and document-storage patterns without changing historical packets or automatically posting inventory/accounting. Keep paid AI extraction, graph reconstruction, and device integrations deferred. Verify role/venue access, readable image round trips, local-only OCR processing, recognition accuracy and failure recovery, duplicate/retry behavior, mixed-product/probe assignments, yield units, correction history, repeat-run resets, print/QR usability, and the screenshot acceptance example; run TypeScript and the relevant build, unit, transaction, and browser checks.

---

## Future: AI Invoice Assistance & Spending Controls (Deferred)
**Status:** Not scheduled or enabled. Compact document storage works independently.

- [ ] Benchmark a lower-cost vision model on real invoices, pack sizes, decimals and credits before choosing a default; measure accuracy and actual billed cost.
- [ ] Add explicit opt-in extraction from an already stored invoice, with saved results reused on later views.
- [ ] Track actual billed input/output/reasoning tokens, model and per-invoice cost, including failed attempts and retries where reported.
- [ ] Add an app-enforced monthly spending cap, conservative per-request reservations, document/page limits, rate/concurrency controls and budget alerts. Stop AI work when the cap is reached while keeping document storage available. Provider dashboard budgets alone are not a hard app cap.
- [ ] Explain estimated cost before extraction and show actual usage afterward.
- [ ] Restore reviewed extraction, vendor-specific SKU/GCODE and cross-vendor matching, explicit pack-unit/USD checks, recent vendor comparison, >5% price warnings and recipe/menu margin previews before an admin/manager applies any catalog changes.
- [ ] Revalidate proposals before saving, preserve original facts and review history, and prevent duplicate extraction charges during concurrent uploads/retries.
