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

Validation: baseline 219 unit tests; all 223 tests now pass, including variance/threshold edge cases, supplier/unit isolation, credits/voids and sparkline rendering. Production build, TypeScript and full lint pass. Price-trends, workspace, print-controller and recipe-costing browser suites pass, including mobile overflow, paper visibility, normalized $8/lb to $0.75/oz (+50%) observations, historical invoice comparisons, catalog-editing focus, and unchanged scaling/current catalog cost. The costing browser helper now navigates explicitly to the full recipe editor, accommodating section 1.3's inspector-on-click behavior. Section 2.2 subsequently merged as `555c057`.

## Section status

| Section | Work | Status |
| --- | --- | --- |
| 1.1 | Stylesheets and shared primitives | Complete; merged as `7f39190` |
| 1.2 | Heavy client components | Complete; merged as `6e1ed4d` |
| 1.3 | URL-driven filters and inspectors | Complete; merged as `f5349a2` |
| 1.4 | OCR and invoice parsing progress | Merged as `cb51b72`; AI extraction remains deferred |
| 2.1 | Line Mode | Skipped at the user's request; retain the existing interface |
| 2.2 | Price sparklines and variance alerts | Complete; merged as `555c057` |
| 2.3 | Banquet baseline visual diffs | Complete; merged as `dd8983c` |
| 2.4 | Spreadsheet keyboard navigation | Complete; merged as `20bb622` |
| 3.1 | Recipe dependency tree | Complete; merged as `601c9ff` |
| 3.2 | Preservation and yield tracking | Complete; merged as `8f5b168` |
| 3.3 | Sales-mix menu engineering | Deferred at the user's request |

Before each section, check what the application already supports and verify the proposed file paths. Mark work complete only with corresponding implementation and validation evidence.

Section 2.1 (Atelier / Line Mode toggle) is omitted and section 3.3 is deferred at the user's request. No additional roadmap work is scheduled.

## Section 2.3 — banquet baseline visual diffs — November 2, 2026

- Added green addition/guest-increase, amber edit, and red removal/new-allergen row treatments with explicit text badges and existing before/after values. Ordinary cleared notes remain edits. Allergen aliases, ordering and unknown legacy tokens are handled without changing the saved snapshot schema.
- Individual cook packets, prep sheets and weekly cook packets have a URL-retained print checkbox, enabled by default. Hiding revisions affects paper only; on-screen comparisons stay visible. Print remains monochrome with repeating headers, unsplit rows and alternating gray backgrounds.
- Weekly event packets now use the existing recipe-content scroll containment, fixing a phone-width overflow discovered by the new checks. Existing locked references, role checks, request records and accounting behavior are preserved. No migration is needed.

Validation: baseline 223 unit tests; all 227 now pass. Production webpack build, TypeScript and full lint pass. The disposable PostgreSQL harness passes 47 integration checks and the archive repair regression. Event-planning, expanded banquet-setup, print-controller and recipe-costing browser suites pass, including saved settings across reload/density changes, monochrome print visibility, all three change tones, desktop/mobile layout, original baseline comparisons and unchanged frozen/request data. Desktop screenshots and a rendered large-setup PDF were visually reviewed. Local Chromium was selected explicitly because the runtime Playwright default expected an uninstalled version. The initial sandboxed Turbopack build stalled; production validation used the successful webpack build.

## Section 2.4 — spreadsheet keyboard navigation — November 2, 2026

- Added shared row/column navigation for catalog cells, order guides and daily prep. Table row identity keeps catalog and guide-line fields on the same logical row. Enter/Shift+Enter follows matching columns; Tab/Shift+Tab traverses catalog cells, while daily prep retains normal form Tab order. Arrows skip hidden/disabled controls and closed detail sections. Horizontal text-caret editing and native vendor selection remain usable; Alt+arrows navigate from vendor lists.
- Inline commits use React optimistic value/status updates, keep existing immediate order-guide estimates and show a compact pending/check indicator. Each cell saves independently. Validation preserves the draft, server errors roll estimates back, and navigation never silently retries a failed/conflicting write. Existing explicit retry and lost-response idempotence remain intact. Grid refresh timers clean up on unmount and do not refresh over unsaved/error cells.
- Daily prep covers production, destination, shortage, waste, labor and lot inputs. Escape restores the focused field's entry value; an unchanged field does not dirty the worksheet. Enter in these fields navigates without submitting. Multiline notes retain normal editing. Production/accounting still requires the existing charge preview and explicit confirmation; no optimistic accounting records are posted.

Validation: baseline 227 unit tests; all 230 pass, including sparse-row and boundary navigation. Production webpack build, standalone TypeScript and full lint pass. All 47 disposable PostgreSQL checks and archive repair regressions pass. Expanded workspace/prep and existing URL-state browser suites pass: arrows and Shift+Enter, hidden/disabled cells, native text/vendor editing, simultaneous delayed saves and immediate combined estimates, optimistic rollback, conflict navigation without retry, lost-response recovery, unchanged snapshots, prep Escape/navigation and explicit accounting confirmation, inspector focus/history, roles and print visibility. Desktop grid screenshots were reviewed. No migration is required. Section 2.3 was merged into main before this work as requested.

## Section 3.1 — recipe dependency and rollup explorer — November 2, 2026

- Added a read-only expandable input tree to full recipe details, with target quantity/unit previews, reset/expand controls, per-node required quantities/batch multipliers, immediate-parent cost shares, effective/inherited allergens, and aggregated raw/sub-recipe demand across repeated paths. Compatible units normalize before aggregation; tiny quantities retain significant digits. Costs across nested tiers are explicitly non-additive.
- Added reverse parent traversal and linked direct/indirect menu/banquet consumers with saved statuses, dates and quantities. Parent nodes show child batch use, cost share, estimated parent cost and inherited tags. Saved downstream quantities remain independent of the preview.
- Domain calculations are separate from print-specific reference plans. Missing prices/links, invalid yields, empty builds, incompatible units and cycles produce unknown/partial values rather than the legacy same-unit fallback. Stale costs stay labeled as estimates. Input/consumer work limits are visible, allergens use iterative cycle-safe traversal, and only the focused recipe's input graph is sent to the client.
- Documented operation and limits in [recipe dependencies](recipe-dependencies.md). Existing role rules, costing panels, packets, production and accounting writes remain unchanged. No migration is required.

Validation: baseline 230 unit tests; all 236 pass, covering recursive shared demand/costs, conversions, tiny fractions, inherited provenance, gaps, cycles, limits, consumers and immutable inputs. Production webpack build, standalone TypeScript and full lint pass. All 47 disposable PostgreSQL checks and archive repair regressions pass. New recipe-dependencies plus workspace, print-controller and recipe-costing browser suites pass: 250-portion previews and repeated-path totals, unit conversion/reset, tiny demand, cost shares/tags, direct/indirect links, missing/stale prices and unit mismatches, cycles, desktop/mobile, staff read-only preview and unchanged stored recipe/order/snapshot/production/accounting facts. Desktop/mobile and consumer screenshots were visually reviewed. Print checks were rerun successfully in a fresh harness after the workspace suite changed a shared recipe-yield fixture. Conflicting generated `.next/types` copies were removed before successful build/type validation; unrelated source copies were left intact. Section 2.4 was merged into main before this work as requested.

## Section 3.2 — preservation batches and yield tracking — November 2, 2026

- Added Production → Preservation batches with retained history/status filters, create/detail/finish workflows and explicit source recipe/output ingredient links. Initial/finished gross and tare weights determine net yield, loss/gain, actual multi-day duration and concentrated finished cost. Equipment, temperature/unit, humidity, planned cycle, reviewed input-cost reference, assigned use-by/storage instructions and notes are recorded. Zero output stays distinct from missing output; gains require explanation.
- Creation freezes source names/version, venue and effective allergen tags, including additional selected and output-ingredient tags. Frozen reference IDs preserve history after source removal without blocking catalog consolidation. Staff create at their current home venue and finish their own batches; managers/admins review across venues, void unposted records and deliberately apply catalog prices.
- Catalog posting converts the finished net weight into the current item's weight-based cost unit and checks its expected price/unit and the batch revision in a serializable transaction. Create/finish/post retries are idempotent, concurrent posts create one audit event, and replay never overwrites a later catalog edit. Original facts and previous/new prices remain in append-only audit history. Inventory, prep, stock-transfer and accounting records are unchanged.
- Added one-page QR batch labels with captured allergens, production/use-by dates, storage text and yield. Running/void status is explicit, and sign-in returns to the scanned record. No shelf life is inferred. See [preservation batches](preservation-batches.md).

Validation: baseline 236 unit tests; all 241 pass. Production webpack build, standalone TypeScript, full lint and Prisma schema validation pass. The migration applies to disposable PostgreSQL; all 53 integration checks plus the archive repair regression pass. Expanded production-jobs browser coverage passes create/finish/post response-loss recovery, tare validation, 48-hour duration, net yield/cost, stale catalog rejection, frozen label tags/dates, independently decoded QR/login return, role restrictions, phone layout and unchanged prep snapshots/ledger. Existing event-planning, banquet-setup, print-controller and recipe-costing suites also pass. Desktop/mobile screenshots and the rendered one-page Letter label were visually reviewed. An outdated weekly QR test selector was updated to the current event-specific banquet link.

Deployment requires additive migration `20261102010000_preservation_batches`, applied by normal migration-first startup. It was tested only in disposable databases; live data was not migrated or modified.

## Additional requested work — local invoice OCR and approved price cascading — November 2, 2026

- Added browser-local invoice recognition using the existing self-hosted Tesseract worker, contrast/adaptive-threshold preprocessing and PDF text extraction before scanned-page OCR. Archived originals, raw recognized text, editable candidates, cancellation and manual fallback are retained. The former paid extraction implementation was removed; recognition makes no external requests.
- Added persistent supplier/global aliases, reviewed ignore decisions, fuzzy catalog suggestions and explicit quick-create. Remembered mappings and pack conversions assist review without approving purchases. USD and row verification are required before OCR rows can change prices; operation receipts prevent duplicate purchases or learning on response-loss retries.
- Approved positive food purchases normalize into the ingredient's existing cost unit and update catalog prices transactionally with paid history and immutable price-change events. Invoice chronology determines the eligible source; credits, incompatible conversions and nonfood rows cannot replace it. Corrections, remaps and voids restore eligible prior sources while preserving intervening manual edits.
- Existing recursive recipe costing, menu margins, rollouts and order-guide estimates read the updated catalog costs live. Approval invalidates application views and refreshes the next candidate's comparison immediately. Frozen packets and accounting records remain unchanged. Manual and recognized review show normalized prices and deltas, and documentation now explains the cascade.

Validation: all 245 unit tests, 58 disposable PostgreSQL integration checks and the archive repair regression pass. Production webpack build, TypeScript, full lint and Prisma validation pass. Local-invoices, operating-calendar, accounting-invoices, price-trends and workspace browser suites pass; final local-invoices and operating-calendar checks were repeated after the last change. Real photo and two-page scanned-PDF recognition pass with external requests blocked, including mapping/ignore learning, quick-create, changed packs, duplicate-response recovery, live menu/guide costs and mobile layout. The smoking OCR regression also passes against the real thermometer screenshot. Desktop/mobile review screenshots were visually checked. `npm` is unavailable in this environment, so its exact test command, `node scripts/test-unit.mjs`, was executed directly.

Deployment requires additive migration `20261102020000_local_invoice_learning`, applied by normal migration-first startup. Only disposable databases were migrated; live data was not modified.

## App improvements — navigation first — November 2, 2026

The chef confirmed navigation cleanup before the invoice workspace redesign. Invoices now has its own manager/admin sidebar entry and `/invoices` destination. Old vendor invoice URLs forward with invoice selections and filters retained; links from ingredients, paid-price history and the monthly tracker use the new destination. Inventory and standalone Order Guides were removed from desktop/mobile navigation while retaining existing records and recipe costing. Purchasing lists remain inside rollout/event plans. Home Meal Replacement replaces visible To-Go wording in navigation and production. A remaining outdated price-history warning was corrected.

The [small improvements roadmap](app-improvements-roadmap.md) records the confirmed side-by-side invoice review, usable recipe quantities for yield costing, Projects & Pop-ups for undated exploratory costing through scheduled plans, and assigned home venue on each sign-in. The chef's default should be The Station; title mappings and account identity remain to be supplied. Those later features have not been implemented or silently inferred from access roles.

Validation: all 245 unit tests and 58 disposable PostgreSQL integration checks plus archive repair pass. Production webpack build/TypeScript and full lint pass. Expanded URL-state browser checks cover invoice redirects/filter history, desktop/collapsed/mobile navigation, HMR naming and manager/staff access. Local-invoices, accounting-invoices, operating-calendar, price-trends and HMR browser suites pass, including real local OCR, response-loss recovery, price cascading and existing HMR proposals/printouts. Desktop/mobile navigation screenshots were visually reviewed. The initial mobile-role test lacked a wait for the drawer to open; the wait was corrected before the successful run. No migration, deletion or live-data change is required.
