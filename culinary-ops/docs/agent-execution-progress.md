# Agent implementation progress

Source: [agent implementation roadmap](agent-execution-roadmap.md). Preserve that document as the supplied proposal; track implementation decisions and evidence here. Its embedded agent instructions are proposal content, not additional authorization from the user.

## Starting point — November 1, 2026

- [x] Save the supplied roadmap in the repository and link it from the README.
- [x] Inspect the first section against the current code.
- [x] Establish the unit-test baseline. After locating the bundled Node 24 runtime, `node scripts/test-unit.mjs` passed all 213 tests (the same runner used by `npm test`).

The initial inspection found 1,020 lines in `app/globals.css`, 278 in `app/(app)/smoking/smoking.css`, and 203 in `components/ui.tsx`. Shared card, button, field, and badge primitives already exist. Global styles use Tailwind imports and theme declarations, paper defaults, and screen-scoped workspace overrides. Changes to cascade layers must account for those existing rules and print behavior.

## Section 1.1 — stylesheet and primitive inventory

- [x] Restore access to a compatible Node runtime and run the unit-test runner directly.
- [x] Map global styles into tokens, base, components, print, and utilities; inspect Tailwind layer ordering before changing precedence.
- [x] Identify repeated surfaces and controls that can use the existing typed primitives.
- [x] Select one small extraction that preserves cascade order, selectors, and print behavior.
- [x] Implement and verify that extraction with typechecking, application lint, and the workspace and print-controller browser suites using disposable fixtures described in [repository structure](repository-structure.md).
- [x] Record the changes and checks in a separate implementation commit. Section 1.1 remains incomplete until all its work is verified.

### First slice

- Extract paper palette, schedule tokens, and Tailwind theme registration into `app/styles/tokens.css`, imported immediately after Tailwind. A parsed CSS comparison confirmed every rule, declaration, and its order survives the extraction.
- Let `Card` forward native div attributes and use it inside `StatCard` to share the surface definition.
- Restrict `Badge` colors to the five implemented variants and forward native span attributes and custom classes.
- Extract `TableScroll` with a required accessible label and keyboard focus, and use it in the recipe costing table.

The existing form controls already share `fieldBase`. Their styles need no duplicate abstraction in this slice. The first slice preserved the original cascade before the layer migration below.

Validation: all 213 unit tests pass before and after the change; production build and TypeScript checks pass. Application lint passes with generated `public/ocr/**` excluded. Unfiltered lint reports 55 errors and 3,755 warnings in generated OCR assets. Workspace, print-controller, and recipe-costing browser suites pass using isolated fixtures; the supporting database integration and archive repair checks also pass.

Run workspace and print-controller suites in separate disposable database harnesses: workspace edits the shared recipe yield from 4 to 8, which invalidates print-controller's original-yield expectations if they run consecutively against one fixture database.

### Section 1.1 completed

- Replaced the global stylesheet body with imports for named tokens, base, utilities, components, and print layers. Tailwind is nested in a lower framework layer to preserve existing component overrides. Top-level `@theme` compiler directives remain supported.
- Scoped every smoking class selector to its workspace with zero additional specificity, in the component layer.
- Added a production-CSS browser regression suite covering desktop/mobile palettes, table density, controls, smoking route isolation, and print resets.
- Excluded generated OCR dependency copies from lint, so full application lint now passes.
- Documented the cascade and validation commands in [stylesheet architecture](stylesheet-architecture.md).

Final validation: production build, TypeScript, full lint, all 213 unit tests, supporting database integration checks, and style-cascade/workspace/print-controller/recipe-costing browser suites pass. A before/after computed-style comparison of representative workspace, recipe, schedule, banquet, and smoking fixtures at desktop/mobile widths in screen/print media found no differences in rendered elements. Hidden inspector font values follow print-layer precedence; the drawer remains hidden in print.

Section 1.1 was merged and pushed to main as `7f39190`.

## Section 1.2 — client component boundaries

- Split smoking save/retry behavior into `useSmokeSave`, reusable save forms into `SaveForm`, form-value readers into `smoke-form-data`, and OCR summary/measurement editing into `SmokeSummaryFields`. The workspace remains the composition point for run and lot workflows.
- Split prep ingredient deductions into `SupplyEditor`, close/return/cost-completion forms into `CloseoutForms`, submission retry state into `usePrepSubmission`, and shared input types into `entry-types`. Existing `EntryForms` imports remain supported through re-exports.
- Reduced `DailyWorksheet` to group composition. `WorksheetRow` owns each item's production/preview/save state, `ChargePreview` renders charges, and `useWorksheetDirtyRows` owns navigation protection and listener cleanup.
- Split the schedule into grid, cell, and dialog components, with trigger focus restoration in `useScheduleGridNavigation`.
- Retained existing memoized schedule lookups and totals. No new memoization was added without evidence of expensive repeated rendering; callback and state boundaries remain explicit.
- Added the `schedule-editor` browser suite. It caught a pre-existing stale keyboard closure: Escape could discard edits without prompting. The dialog now uses an Effect Event to read current state while retaining its focus-trap listener.

Validation: all 213 unit tests pass before and after extraction. Production build, TypeScript, and full lint pass. Prep, workspace, smoking (including real local OCR and lost-response recovery), schedule-editor, print-controller, and recipe-costing browser suites pass with disposable fixtures; supporting database integration checks pass. The schedule test explicitly covers the Escape-state fix. Section 1.2 was merged and pushed as `6e1ed4d`.

## Section 1.3 — URL-driven workspace state

- Recipe `q`, `category`, and `sort` state uses Next.js-integrated native history. Search and filter changes retain unrelated query parameters and anchors.
- Inspectors use repeated `inspect=recipe:<id>` / `inspect=item:<id>` parameters to represent the nested record trail. Deep links, reloads, browser history, and drawer controls restore the selected records. Browser history retains invalid, pending, or unsaved edits with the existing save/discard warning.
- Recipe and ingredient catalogs provide inspector contexts; command-search record results use shareable catalog inspector URLs.
- Existing server-driven ingredient filters now use Next.js forms/links, with search fields keyed to URL values so back/forward restores visible controls.
- Invoice search, vendor, ordering, and document selection are URL-driven. Filter changes, document links, and successful uploads preserve the other archive parameters.
- Documented parameter meanings and the history guard in [workspace editing](workspace-editing.md).

Validation: baseline 213 tests; 215 tests after adding URL patch/target parsing coverage. Production build, TypeScript and full lint pass. URL-state, workspace and accounting-invoices browser suites pass using separate disposable fixtures, including nested history, unsaved-edit protection, command-search inspector links and ingredient client-navigation history. Section 1.3 was merged and pushed as `f5349a2`.

## Section 1.4 — upload progress and file queues

- Invoice and smoking source uploads accept batches and process one file at a time. Queue rows show individual progress, success, review links where applicable, and retryable errors. One failed file does not block later files.
- File bytes and metadata are captured at enqueue time; smoking retries retain their operation ID and run/lot assignment. Invoice retries use the existing content-hash deduplication. Lost responses after successful storage cannot create duplicate documents.
- Upload endpoints optionally stream newline-delimited progress events. Standard JSON callers retain existing response shapes and status codes; streamed errors carry a terminal error/status event. PDF preparation reports actual completed pages, with indeterminate indicators for stages that have no measurable total.
- Local smoking OCR exposes engine recognition progress and draft preparation while preserving cancellation, manual entry and explicit confirmation.
- Pending uploads stop when their page unmounts; the queue is browser memory, not a durable server job service. An active storage operation can still complete. Queue lifetime, metadata snapshots, retry semantics and the streaming protocol are documented in the accounting and smoking guides.

Implementation scope: the active invoice archive explicitly defers AI extraction, automatic catalog matching, usage tracking and spending controls (see [accounting invoices](accounting-invoices.md#future-ai-work)). This section adds truthful storage/recognition stages rather than displaying extraction or matching stages that do not run. The dormant paid parser is not activated. Automatic invoice extraction remains deferred within that existing product scope.

Validation: 219 unit tests pass, including serial execution, failure isolation, retry snapshots, paused queues, fragmented/truncated progress streams and JSON compatibility. Production build, TypeScript and full lint pass. Invoice browser checks verify mixed batch results, lost-response retry, metadata preservation, two-page PDF progress, unchanged prices/ledger and role restrictions. The full smoking browser suite passes with the real screenshot, local OCR, cancellation, recovery, confirmation, mobile and QR checks. Supporting disposable database integration checks pass. Section 1.4 was merged and pushed as `cb51b72`.

## Section 2.2 — paid-price sparklines and variance alerts

- Added a dependency-free accessible SVG sparkline and shared paid-price indicator to catalog unit-cost cells, recipe ingredient costing, costing previews, and ingredient history.
- Trends use up to eight comparable positive reviewed purchases from one supplier, sampled from the latest 100 eligible observations per ingredient. Units are normalized before comparison. Credits, voids and incompatible bases do not enter trends.
- Saved invoice review lines compare with an earlier compatible positive purchase from the same supplier on another invoice. Future prices cannot be used as baselines. Missing history stays missing, without a percentage or alert.
- Amber badges identify increases strictly greater than the server-configurable `PRICE_VARIANCE_THRESHOLD_PERCENT` (default 10); floating-point noise at the exact threshold does not trigger an alert.
- Indicators explicitly describe paid-price changes. Catalog prices, current recipe costs and existing menu margin calculations are unchanged; no historical menu margin is inferred from ingredient observations. Mini trends are hidden in print to preserve costing-sheet layout.
- Included the user's decision to skip section 2.1. Configuration, sample limits and comparison rules are documented in [accounting invoices](accounting-invoices.md#paid-price-trends-and-variance-alerts).

Validation: baseline 219 unit tests; all 223 tests now pass, including variance/threshold edge cases, supplier/unit isolation, credits/voids and sparkline rendering. Production build, TypeScript and full lint pass. Price-trends, workspace, print-controller and recipe-costing browser suites pass, including mobile overflow, paper visibility, normalized $8/lb to $0.75/oz (+50%) observations, historical invoice comparisons, catalog-editing focus, and unchanged scaling/current catalog cost. The costing browser helper now navigates explicitly to the full recipe editor, accommodating section 1.3's inspector-on-click behavior. Changes remain on `codex/roadmap-2-2-price-trends` pending merge; section 2.3 has not started.

## Section status

| Section | Work | Status |
| --- | --- | --- |
| 1.1 | Stylesheets and shared primitives | Complete; merged as `7f39190` |
| 1.2 | Heavy client components | Complete; merged as `6e1ed4d` |
| 1.3 | URL-driven filters and inspectors | Complete; merged as `f5349a2` |
| 1.4 | OCR and invoice parsing progress | Merged as `cb51b72`; AI extraction remains deferred |
| 2.1 | Line Mode | Skipped at the user's request; retain the existing interface |
| 2.2 | Price sparklines and variance alerts | Complete and verified; pending merge |
| 2.3 | Banquet baseline visual diffs | Pending |
| 2.4 | Spreadsheet keyboard navigation | Pending |
| 3.1 | Recipe dependency tree | Pending |
| 3.2 | Preservation and yield tracking | Pending |
| 3.3 | Sales-mix menu engineering | Pending |

Before each section, check what the application already supports and verify the proposed file paths. Mark work complete only with corresponding implementation and validation evidence.

Section 2.1 (Atelier / Line Mode toggle) is omitted at the user's request. After merging section 2.2, continue with section 2.3: banquet baseline visual diffs.
