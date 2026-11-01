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
- [ ] **Build `<PrintController />` Floating Toolbar:** Replace the basic `PrintButton.tsx` on all `/packet` and `/print` routes with a sleek dark-mode floating control bar (hidden on print via `print:hidden`) containing:
  * **Density Toggle (`Standard` vs. `1-Page Squeeze`):** Toggles a `.print-compact` class on the print wrapper that tightens font size and cell padding by ~15% so a 24-line sheet fits on 1 page instead of spilling 3 orphan lines onto page 2.
  * **Batch Scale Multiplier (for Recipe & Prep prints):** Quick buttons (`0.5x`, `1x`, `2x`, `3x`, plus custom numeric input) that dynamically multiply ingredient weights on the printout.
  * **Scaled Production Banner:** Whenever a recipe is printed at anything other than `1x`, automatically render a bold top banner: `SCALED PRODUCTION BATCH ({scale}x) — DO NOT FILE IN MASTER BINDER`.
- [ ] **Standardized Commercial Print Header:** Create a reusable `<PrintSpecHeader />` component for all printouts displaying: Venue Badge, Document Title, Target Date, Print Timestamp, and Page rules.
- [ ] **Sharpie-Friendly `@media print` Rules:**
  * Force `min-height: 28px` on all handwritten write-in cells (par, pull, waste, temp check, initials).
  * Add alternating light-gray zebra striping (`#f4f4f5` with `-webkit-print-color-adjust: exact; print-color-adjust: exact;`) so cooks don't lose their row across wide tables.
  * Add `break-inside: avoid` on all recipe cards, prep station groups, and banquet setup sections.

### Copy-Paste Agent Prompt for Chunk 3
> Read `components/PrintButton.tsx`, `app/globals.css`, and the `/packet` and `/print` route pages. Execute **Chunk 3** of `ROADMAP.md`: build the floating `<PrintController />` with 1-Page Squeeze density toggle and dynamic Batch Scale Multiplier (with the scaled production warning banner), add `<PrintSpecHeader />`, and enforce Sharpie-friendly `@media print` ergonomics (`min-height: 28px` write-in cells, zebra striping, `break-inside: avoid`). Verify with `npx tsc --noEmit`.

---

## Chunk 4: Advanced Kitchen Paperwork (Master Compiler, Labels & QR Closeout Bridges)
**Goal:** Eliminate repetitive printing before busy weekends and bridge physical clipboard sheets back to your digital closeout screens with full accountability.

**Target Files:**
* `app/(app)/banquets/week/[date]/packet/page.tsx`
* `app/(app)/prep-orders/[id]/packet/page.tsx`
* `app/(app)/prep-orders/closeout/DailyWorksheet.tsx`
* `components/PrepCoolingLog.tsx`
* `components/BanquetSetupSheet.tsx`
* `components/AllergenBadges.tsx`
* `lib/prep-dates.ts`

### Checklist
- [ ] **"Master Clipboard Compiler" Modal:** Add a button on the Dashboard and Banquet Week view that lets you check boxes for the documents you need (`[x] Weekly Schedule`, `[x] Banquet Week Packet`, `[x] Shopping List`, `[x] Daily Prep Sheet`, `[x] Cooling Logs`) and renders them into a single unified print view separated by `page-break-after: always`—one `Cmd+P` prints the whole kitchen's paperwork.
- [ ] **Station Filter on Packet Printouts:** Allow filtering `prep-orders/[id]/packet` and `banquets/[id]/prep-sheet` by station/category before printing so you can print separate clipboards for Garde Manger, Hot Line, and Prep Kitchen.
- [ ] **QR Code "Paper-to-Digital" Accountability Bridge:** Render a dynamic SVG QR code in the top-right corner of printed `DailyWorksheet` and `PrepOrder` packets encoding a mobile scan URL (`/prep-orders/closeout/scan`).
- [ ] **Mobile Closeout & Accountability Web View:** Build a fast mobile screen tied to the QR scan where cooks or leads can select **Who made it** (staff/initials), enter **Actual Yield Produced**, and log **Shift/Quality Notes** directly into Postgres.
- [ ] **Prep & Allergen Label Sheet Generator:** Add a "Print Prep Labels" view to `prep-orders/[id]` and `recipes/[id]` formatted for standard multi-up label sheets (Item Name, Prep Date, Use-By Date from `lib/prep-dates.ts`, Batch Size, and bold Allergen Badges from `AllergenBadges.tsx`).

### Copy-Paste Agent Prompt for Chunk 4
> Inspect the banquet packet, prep order packet, cooling log, and allergen/prep-date utilities. Execute **Chunk 4** of `ROADMAP.md`: add station filtering to packet printouts, add SVG QR code closeout bridges and the mobile accountability web view (Who made it, yield, shift notes), create the Prep & Allergen Label Sheet print view, and build the Master Clipboard Compiler. Verify with `npx tsc --noEmit`.

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
- [ ] **Keyboard-Driven Inline Grid for `Items` & `Order Guides`:** Allow clicking directly into Price, Unit, Pack Size, Vendor, and ProdCode cells in `items/page.tsx` and `order-guides/[id]/page.tsx`. Support `Tab`, `Shift+Tab`, and `Enter` to move down rows with optimistic auto-save and a subtle green "Saved" flash.
- [ ] **Fast Keyboard Entry in `RecipeIngredientEditor.tsx`:** Let you add 10 ingredients in a row using only the keyboard (type ingredient $\rightarrow$ `Tab` $\rightarrow$ quantity $\rightarrow$ `Tab` $\rightarrow$ unit $\rightarrow$ `Enter` to commit and auto-focus the next new ingredient row).
- [ ] **Slide-Over "Inspector Drawer" (`RecipeDossier` & `Item` quick-edit):** When working inside `menus/[id]/page.tsx`, `banquets/[id]/page.tsx`, or `prep-orders/[id]/page.tsx`, clicking an ingredient or sub-recipe opens a right-hand slide-over drawer instead of navigating away. You can fix a missing price or tweak a recipe yield inside the drawer and watch the parent menu/banquet cost recalculate live.

### Copy-Paste Agent Prompt for Chunk 5
> Read `components/RecipeIngredientEditor.tsx`, `app/(app)/items/page.tsx`, `app/(app)/order-guides/[id]/page.tsx`, and `app/(app)/menus/[id]/page.tsx`. Execute **Chunk 5** of `ROADMAP.md`: implement spreadsheet-style inline keyboard editing (`Tab`/`Enter` with optimistic saves) for Items, Order Guides, and Recipe Ingredient entry, and add a right-hand Slide-Over Inspector Drawer for viewing/editing recipes and items in-place without losing scroll position. Verify with `npx tsc --noEmit`.

---

## Chunk 6: Accounting Pipeline, GL Mapping & AI Invoice Photo Parser
**Goal:** Make accounting reconciliation effortless, automate multi-vendor price matching via photo/PDF uploads, and track inter-venue transfers.

**Target Files:**
* `lib/categories.ts`
* `lib/venue.ts`
* `lib/costing.ts`
* `lib/prep-accounting-report.ts`
* `app/(app)/prep-orders/report/page.tsx`
* `app/(app)/prep-orders/report/export-xlsx/route.ts`
* `app/(app)/prep-orders/report/export/route.ts`
* `app/(app)/festivals/[id]/accounting/AccountingWorksheet.tsx`
* `app/(app)/vendors/page.tsx`
* `app/(app)/items/page.tsx`

### Checklist
- [ ] **GL Account Code Mapping:** Add General Ledger (GL) code mapping to ingredient categories (`lib/categories.ts`) and venues (`lib/venue.ts`) so every item and transfer automatically carries its accounting category (e.g., Meat/Seafood, Produce, Dairy, Dry Goods, Paper/Disposables).
- [ ] **ERP-Ready XLSX/CSV Exports:** Upgrade `export-xlsx/route.ts` and `export/route.ts` (using `lib/xlsx.ts`) to generate multi-tab workbooks (Executive Summary, Inter-Venue Transfers, Line-Item Detail with missing-cost flags).
- [ ] **AI Invoice Photo/PDF Ingestion Dropzone:** Build an upload route under `/vendors` or `/items` allowing you to drag-and-drop a PDF invoice or snap a photo of a paper invoice.
- [ ] **Vision LLM Parsing & Cross-Vendor Matching Engine:** Automatically extract vendor names, line items, pack sizes, SKUs, and pricing from invoice photos, matching them against your master inventory items even when switching between vendors (e.g., Sysco vs. US Foods).
- [ ] **Price Intelligence & Margin Impact Preview:** Present an audit modal before updating database prices: showing price deltas (>5% warning), identifying the cheapest active vendor option, and calculating the exact ripple effect on recipe and menu food cost percentages.

### Copy-Paste Agent Prompt for Chunk 6
> Read `lib/prep-accounting-report.ts`, `lib/xlsx.ts`, `app/(app)/prep-orders/report/page.tsx`, `app/(app)/prep-orders/report/export-xlsx/route.ts`, and `lib/costing.ts`. Execute **Chunk 6** of `ROADMAP.md`: add GL category/venue code mappings, upgrade the accounting XLSX export into a multi-sheet executive workbook, and build the AI Invoice Photo/PDF Dropzone with Vision LLM parsing, cross-vendor item matching, and pre-commit ripple effect margin preview. Verify with `npx tsc --noEmit`.

---

## Chunk 7: Menu Engineering, Banquets & Event Diffing
**Goal:** Give you commercial menu-engineering analytics and protect the kitchen from last-minute banquet BEO changes.

**Target Files:**
* `app/(app)/menus/[id]/page.tsx`
* `app/(app)/banquets/[id]/setup/SetupEditor.tsx`
* `components/BanquetSetupSheet.tsx`
* `lib/banquet-setup.ts`
* `app/(app)/production/page.tsx`
* `lib/production.ts`

### Checklist
- [ ] **Menu Rollout Margin Matrix (`menus/[id]/page.tsx`):** Add a commercial summary bar at the top of every menu showing Category Average Food Cost %, Average Contribution Margin (`$`), and visual progress bars on each dish comparing actual cost % to your target threshold.
- [ ] **Banquet BEO Snapshot & Change Diffing (`banquets/[id]/setup`):** Add a "Lock Baseline / Snapshot" action to Banquet Setups. When event details change 48 hours out (e.g., Guest Count changes from 80 to 115, or a timeline/allergen note changes), highlight the modified fields in high-contrast amber on screen and print a bold **`REVISED: [Date] — Pax +35`** badge on `BanquetSetupSheet.tsx`.
- [ ] **Cross-Event Master Production Aggregator (`/production`):** Upgrade `/production` so you can select a date range and aggregate shared sub-recipes (stocks, demi, sauces, portioned proteins) across *all* Banquets, Festivals, To-Go rollups, and Daily Prep Orders—letting the prep team batch-produce once for the whole week.

### Copy-Paste Agent Prompt for Chunk 7
> Read `app/(app)/menus/[id]/page.tsx`, `app/(app)/banquets/[id]/setup/SetupEditor.tsx`, `components/BanquetSetupSheet.tsx`, `lib/banquet-setup.ts`, and `app/(app)/production/page.tsx`. Execute **Chunk 7** of `ROADMAP.md`: add the Menu Rollout Margin Matrix header and visual cost bars, implement Banquet BEO baseline snapshots with visual diff badges on screen and printouts, and build the Cross-Event Master Production Aggregator in `/production`. Verify with `npx tsc --noEmit`.

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
