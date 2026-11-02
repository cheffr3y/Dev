# Culinary-Ops (`foxtownhq`) — Agent Implementation Roadmap

This roadmap is structured for autonomous or assisted AI coding agents working inside the `culinary-ops` repository. It focuses on architectural maintainability, high-impact UI/UX polish, and targeted culinary ERP features.

---

## Agent Operating Guidelines & Repository Conventions

Before executing any phase below, adhere strictly to existing repository patterns:
1. **Domain-Driven `lib/` Architecture:** Keep pure business logic, calculations, and Prisma queries inside `lib/<domain>/` (e.g., `lib/recipes/`, `lib/invoices/`, `lib/banquets/`, `lib/production/`). Keep App Router `page.tsx` and `actions.ts` files thin.
2. **Typography & Aesthetic:** Preserve the "Atelier" editorial design system (`Cormorant Garamond`, `Playfair Display`, `Inter`, `IBM Plex Mono`, `JetBrains Mono`) and existing CSS custom properties.
3. **Zero-Regression Testing:**
   - Co-locate unit and integration tests alongside domain logic in `lib/**/*.test.ts(x)`.
   - Update or add Playwright browser suite cases in `scripts/browser/cases/` for new user-facing workflows.
4. **Print Integrity:** Any UI changes to packets, prep sheets, setup sheets, or dossiers must respect `@media print` rules and work seamlessly with `components/PrintController.tsx` and `components/PrintSpecHeader.tsx`.

---

## Phase 1: Codebase & Architectural Refactoring

### 1.1 Modularize Monolithic Stylesheets
- **Context:** `app/globals.css` and `app/(app)/smoking/smoking.css` currently carry heavy custom styling weight.
- **Target Files:**
  - `app/globals.css`
  - `app/(app)/smoking/smoking.css`
  - `components/ui.tsx`
- **Implementation Tasks:**
  - Refactor `app/globals.css` into structured `@layer` blocks (`@layer tokens`, `@layer base`, `@layer components`, `@layer print`, `@layer utilities`).
  - Extract repeated card surfaces, badge variants, table wrappers, and form controls into typed, reusable primitives inside `components/ui.tsx`.
  - Scope smoking-specific styles cleanly or migrate shared dashboard primitives to the global component layer.
- **Verification:** Run existing Playwright print and workspace suites (`scripts/browser/cases/print-controller.mjs`, `scripts/browser/cases/workspace.mjs`) to confirm zero visual or print layout regressions.

### 1.2 Decompose Heavy Client Components
- **Context:** High-traffic interactive views manage complex local state, form mutations, and layout simultaneously, causing unnecessary re-renders on tablets.
- **Target Files:**
  - `app/(app)/smoking/smoking-client.tsx`
  - `app/(app)/prep-orders/closeout/DailyWorksheet.tsx`
  - `app/(app)/prep-orders/EntryForms.tsx`
  - `app/(app)/schedule/ScheduleGrid.tsx`
- **Implementation Tasks:**
  - Break each monolithic file into focused sub-components (e.g., row editors, header toolbars, summary footers, modal/drawer triggers).
  - Extract complex state transitions and optimistic update logic into dedicated custom hooks (e.g., `useDailyWorksheetState`, `useScheduleGridNavigation`).
  - Memoize expensive row/cell renders where appropriate.
- **Verification:** Ensure `app/(app)/schedule/schedule-ui.test.tsx`, `lib/prep/prep-worksheet.test.ts`, and `scripts/browser/cases/smoking.mjs` pass.

### 1.3 URL-Driven Filter, Tab & Inspector State
- **Context:** Filters, active tabs, and inspector drawers should be bookmarkable and shareable across the team.
- **Target Files:**
  - `components/WorkspaceInspector.tsx`
  - `components/CommandSearch.tsx`
  - `app/(app)/items/page.tsx`
  - `app/(app)/recipes/RecipesTable.tsx`
  - `app/(app)/vendors/invoices/InvoiceArchive.tsx`
- **Implementation Tasks:**
  - Synchronize table search queries, category/venue filters, sort orders, and active `WorkspaceInspector` entity IDs with URL search parameters (`?q=`, `?category=`, `?inspect=`).
  - Ensure browser back/forward navigation cleanly restores filter and inspector states without full page reloads.
- **Verification:** Add unit/browser assertions verifying that deep-linking to a filtered table or open inspector drawer renders the exact expected state.

### 1.4 Streaming Progress & Async Queueing for OCR / Invoice Parsing
- **Context:** Multi-page vendor invoices and smoking log scans need responsive progress feedback during heavy parsing/OCR operations.
- **Target Files:**
  - `lib/invoices/invoice-parser.ts`
  - `lib/smoking/ocr-browser.ts`
  - `lib/smoking/ocr-parser.ts`
  - `app/api/invoices/route.ts`
  - `app/api/smoking/route.ts`
- **Implementation Tasks:**
  - Refactor synchronous upload/parse bottlenecks to provide step-by-step status updates (`Uploading` $\rightarrow$ `Extracting Text` $\rightarrow$ `Matching Catalog Items` $\rightarrow$ `Ready for Review`).
  - Support batch file queuing in the client UI with per-file progress bars, non-blocking error recovery, and retry actions.
- **Verification:** Test with `scripts/browser/cases/accounting-invoices.mjs` and `lib/invoices/invoice-storage.test.ts`.

---

## Phase 2: Visual & UI/UX Polish

### 2.1 "Line Mode" vs. "Atelier Mode" Theme Toggle
- **Context:** While "Atelier Mode" (warm editorial serifs, subtle contrast) excels for office planning and client packets, kitchen tablets in bright or steamy environments need instant high-contrast legibility and larger touch targets.
- **Target Files:**
  - `app/globals.css`
  - `components/DesktopSidebar.tsx`
  - `components/MobileNav.tsx`
  - `components/InlineCell.tsx`
  - `components/EditGrid.tsx`
- **Implementation Tasks:**
  - Add a persistent theme/ergonomics toggle (`Atelier` vs. `Line Mode`) stored in `localStorage` and reflected via a root `data-mode="line"` attribute on `<html>`.
  - In `Line Mode`:
    - Switch to high-contrast OLED dark surfaces with crisp luminance hierarchy.
    - Increase base typography scale by ~15–20% and enforce sans/mono legibility on dense data tables.
    - Expand touch target padding and hit areas on `InlineCell`, `EditGrid`, and action buttons.
    - Automatically disable `Line Mode` styles inside `@media print` so printed sheets always render in crisp black-on-white Atelier spec format.
- **Verification:** Verify toggle persistence and ensure `@media print` outputs remain unchanged.

### 2.2 Inline Price & Margin Sparklines + Variance Alerts
- **Context:** Surface historical price creep and margin erosion directly inside catalog and costing tables without requiring clicks into detail pages.
- **Target Files:**
  - `components/IngredientPriceHistory.tsx`
  - `components/CatalogCells.tsx`
  - `components/RecipeCosting.tsx`
  - `components/MenuCostBar.tsx`
  - `components/InvoicePurchaseReview.tsx`
  - `lib/invoices/invoice-purchases.ts`
- **Implementation Tasks:**
  - Build a zero-dependency, lightweight `<Sparkline />` SVG component accepting an array of historical price points.
  - Render inline sparklines next to ingredient unit costs in `CatalogCells.tsx` and `RecipeCosting.tsx` using the last $N$ approved invoice prices.
  - Calculate price variance percentage ($\frac{P_{\text{new}} - P_{\text{prev}}}{P_{\text{prev}}} \times 100$) during invoice review and recipe costing. Flag jumps exceeding a configurable threshold (e.g., $>10\%$) with a high-visibility warning badge.
- **Verification:** Add unit tests in `lib/prep/prep-costing.test.ts` and `lib/menus/menu-margin.test.ts` for variance calculations and render tests for the sparkline component.

### 2.3 Visual Diffing for Banquet Baselines (BEO Revisions)
- **Context:** When a banquet's baseline is locked (`LockBaseline.tsx`), subsequent edits to guest counts, menu items, or setup notes need crystal-clear visual differentiation.
- **Target Files:**
  - `lib/banquets/banquet-baseline.ts`
  - `components/BanquetRevision.tsx`
  - `components/BanquetSetupSheet.tsx`
  - `app/(app)/banquets/[id]/setup/SetupEditor.tsx`
- **Implementation Tasks:**
  - Enhance the baseline comparison view with GitHub-style visual diff badges and row highlights:
    - **Added items / increased guest counts:** Emerald green highlight (`+15 Guests`, `+ New Hors d'Oeuvre`).
    - **Reduced quantities / modified service times:** Amber highlight (`2:00 PM -> 2:30 PM`).
    - **Removed items or newly introduced allergens:** Crimson red alert badge.
  - Include an optional "Show Changes Since Baseline" toggle on printable banquet packets so the kitchen line can immediately spot last-minute BEO changes.
- **Verification:** Expand `lib/banquets/banquet-baseline.test.tsx` and `scripts/browser/cases/banquet-setup.mjs`.

### 2.4 Keyboard-First Spreadsheet Navigation & Optimistic Grids
- **Context:** Entering par counts, order guide quantities, and daily prep numbers should feel as fast as a native desktop spreadsheet.
- **Target Files:**
  - `components/InlineCell.tsx`
  - `components/EditGrid.tsx`
  - `components/OrderGuideGrid.tsx`
  - `app/(app)/prep-orders/closeout/DailyWorksheet.tsx`
- **Implementation Tasks:**
  - Implement 2D grid keyboard navigation across editable cells:
    - `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` to move between adjacent cells.
    - `Enter` to commit and move down; `Tab` / `Shift+Tab` to commit and move horizontally.
    - `Escape` to revert uncommitted edits.
  - Pair cell commits with instant `useOptimistic` state updates and subtle inline save indicators (e.g., a brief emerald border flash or status dot) instead of blocking spinners.
- **Verification:** Add keyboard navigation tests in unit/browser suites.

---

## Phase 3: New Culinary ERP Features

### 3.1 Interactive Sub-Recipe & Component Dependency Tree
- **Context:** Complex dishes and banquet menus rely on multi-tier sub-recipes (stocks $\rightarrow$ mother sauces $\rightarrow$ compound sauces $\rightarrow$ plated dish). Visualizing these dependencies clarifies both allergen propagation and cost rollups.
- **Target Files:**
  - `lib/recipes/recipe-references.ts`
  - `lib/recipes/costing.ts`
  - `components/RecipeReferences.tsx`
  - `components/RecipeBuild.tsx`
  - `app/(app)/recipes/[id]/page.tsx`
- **Implementation Tasks:**
  - Build an interactive **Dependency & Rollup Tree** view on the recipe detail page (`app/(app)/recipes/[id]/page.tsx`).
  - Visually map upstream sub-recipes (ingredients feeding into this recipe) and downstream consumers (menus, banquets, and parent recipes using this recipe).
  - Display proportional cost contribution ($\%$), yield scaling factors, and inherited allergens on each node.
  - Allow inline quantity scaling previews ("If I scale this banquet item to $250\text{ pax}$, how many liters of demi-glace and kilograms of mirepoix are required across all sub-tiers?").
- **Verification:** Add unit tests for multi-tier recursive scaling and cost rollup accuracy in `lib/recipes/`.

### 3.2 Preservation, Dehydration & Yield-Loss Batch Tracker
- **Context:** Extend the existing `smoking` and `production` architecture to track multi-day preservation runs (dehydration, freeze-drying, curing, fermentation) where moisture loss dramatically alters unit weight and ingredient cost.
- **Target Files:**
  - `prisma/schema.prisma` (extend `ProductionJob` or add preservation batch metadata)
  - `lib/production/production-jobs.ts`
  - `app/(app)/production/page.tsx`
  - `components/ProductionJobQr.tsx`
- **Implementation Tasks:**
  - Support batch yield tracking with **Initial Wet Weight ($W_{\text{wet}}$)**, **Final Dry/Finished Weight ($W_{\text{dry}}$)**, tare weights, and equipment/ambient parameters (temperature, humidity, cycle duration).
  - Automatically compute **Yield Percentage** ($\frac{W_{\text{dry}}}{W_{\text{wet}}} \times 100$) and **Moisture Loss Percentage** ($100 - \text{Yield}\%$).
  - Calculate the concentrated finished unit cost ($\text{Unit Cost}_{\text{dry}} = \frac{\text{Total Batch Input Cost}}{W_{\text{dry}}}$) and offer a one-click action to sync the updated unit cost to the linked catalog item.
  - Generate printable QR batch labels (`ProductionJobQr.tsx`) showing batch ID, production date, yield $\%$, allergens, and shelf-life/expiration date.
- **Verification:** Create unit tests in `lib/production/` for yield/cost math and add a Playwright case in `scripts/browser/cases/production-jobs.mjs`.

### 3.3 POS Sales-Mix (PMIX) Menu Engineering Matrix
- **Context:** Combine `culinary-ops` theoretical recipe costing with actual POS sales volume to classify menu items by profitability and popularity.
- **Target Files:**
  - `lib/menus/menu-margin.ts`
  - `app/(app)/menus/[id]/page.tsx`
  - `components/MenuCostBar.tsx`
- **Implementation Tasks:**
  - Create a CSV/XLSX import utility on the Menu detail page that accepts POS sales exports (mapping Item Name / PLU $\rightarrow$ Quantity Sold & Gross Revenue over a date range).
  - Compute per-item **Contribution Margin** ($\text{Sale Price} - \text{Recipe Plate Cost}$) and **Menu Mix Popularity ($\%$)** against the menu's average thresholds.
  - Render an interactive 2x2 **Menu Engineering Quadrant Matrix**:
    - **Stars** (High Margin, High Popularity)
    - **Plowhorses** (Low Margin, High Popularity)
    - **Puzzles** (High Margin, Low Popularity)
    - **Dogs** (Low Margin, Low Popularity)
  - Calculate **Theoretical Total Food Cost** based on PMIX quantities sold and display a summary table highlighting which items contribute most to gross profit.
- **Verification:** Add comprehensive unit tests in `lib/menus/menu-margin.test.ts` covering quadrant classification and PMIX math.

---

## Execution Checklist for Agents

- [ ] **Step 1:** Run `npm test` (or `node scripts/test-unit.mjs`) to establish a green baseline before making changes.
- [ ] **Step 2:** Execute tasks one sub-section at a time (e.g., `1.1`, then `1.2`), keeping commits atomic.
- [ ] **Step 3:** After each sub-section, run TypeScript typechecking (`npx tsc --noEmit`), linter (`npm run lint`), and relevant unit/browser tests.
- [ ] **Step 4:** Update documentation in `docs/` if new database fields or workflow states are introduced.