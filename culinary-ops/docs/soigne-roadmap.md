# Mise — The Soigné Roadmap

November 3, 2026 · Product direction and implementation progress

Mise should feel like a kitchen that is ready for service: considered, organized, responsive, and easy to work in. The software should carry the administrative work forward while the chef makes the decisions that matter.

The next investment is a polished daily experience backed by consistent culinary math. Start with invoices and ingredient conversions, establish a repeatable interface standard, then carry that standard through production, recipes, and planning.

This roadmap consolidates the next steps in [app improvements](app-improvements-roadmap.md). Earlier work and validation remain recorded in [execution progress](agent-execution-progress.md). Creating this plan does not mark its features implemented or authorize changes to live records. Dates and effort estimates should follow the first implementation slice and measurement of the existing workflow.

## The experience we are aiming for

“Scan the invoice, stay beside the document, resolve what needs attention, and move on.”

“We buy celery by the head and use it by the ounce. Mise understands that relationship and shows the math.”

“Every screen makes the current job, its progress, and the next action clear.”

Soigné means clear hierarchy, useful defaults, restrained motion, good typography, and satisfying feedback. Forms should reveal detail when it is needed. Actions should preserve the user's place. Financial approvals should explain their effect before they commit it.

## What already exists

| Existing capability | Build on it |
| --- | --- |
| Automatic browser-local recognition after invoice upload, supplier aliases, matching suggestions, manual corrections and reviewed price updates | Bring the steps into one coherent review workspace. Recognition already starts automatically; the main gap is the experience around it. |
| Invoice price history, sparklines and variance indicators | Make price changes and their recipe impact easier to understand. |
| Shared UI primitives, layered stylesheets, keyboard editing and URL-driven inspectors | Extend the design system and interaction patterns rather than repeat the completed extraction work. |
| Nested recipes, dependency explorer, event purchasing and usable-yield fields | Resolve inconsistent conversion and yield handling across those paths. |
| Frozen packets, audited corrections, idempotent operations and accounting exports | Preserve those protections as the interface becomes faster. |
| Morning Pulse, daily prep, production logs, smoking and preservation | Connect their next actions and status into a stronger daily workspace. |

The review covered source code, existing roadmap/progress documents, and saved desktop/mobile review screenshots. It was not a fresh audit of the deployed application.

## Delivery order

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 1 | Soigné interface standard and invoice workspace | A representative invoice can be reviewed on desktop and phone without hunting through stacked sections or losing work. |
| 2 | Ingredient conversions and consistent yield costing | The celery example reconciles from invoice to recipe to nested recipe to purchasing, with historical records preserved. |
| 3 | The same quality across daily screens | Recipes, ingredients, prep and closeout follow the same editing, progress, recovery and navigation patterns. |
| 4 | Projects & Pop-ups and clearer production planning | An undated costing idea can become an executable plan with linked recipes, quantities and purchasing. |
| 5 | Operational depth and commercial readiness | Add selected workflow extensions and prove reliability at the intended scale. |

Phase 1 starts first. Phase 2's data and migration design can be investigated alongside it. New conversion math must pass Phase 2's checks before it changes approved prices or live recipe totals. Later phases are proposed scope, to be prioritized after the first two are working well.

## Phase 1 — Make invoices the standard

### First interface slice — November 3, 2026

Implemented on `codex/soigne-invoice-workspace`: source/review columns with PDF page rendering and zoom; a phone source/review switch; compact candidate navigation; one expanded row; progress and automatic next-row selection after approval; collapsed capture with visible upload queues; progressive source-field editing; and a separate saved-lines/accounting section with always-visible stale-total warnings.

At this first checkpoint, Phase 1 was partially delivered and drafts remained in memory during the mounted review. Durable recovery is implemented in the next slice below; richer inbox states, completion impact links, workflow timing and Phase 2 conversions remain pending. The implementation uses the existing approval and calculation services.

Validation: the production webpack build (including TypeScript), full lint and all 245 unit tests pass with an official Node 24 runtime. Disposable database integration checks and the local-invoices, accounting-invoices, operating-calendar and URL-state browser suites pass. Browser coverage includes real local photo/scanned-PDF recognition, source-page selection and zoom, focused review/next-row progression, lost-response approval recovery, phone source/review switching with retained field values, empty-recognition manual fallback, upload queue recovery, unchanged production history, calendar confirmation, role restrictions and navigation history. Desktop/mobile screenshots were reviewed. Phase 1 workflow-timing targets have not yet been measured.


### Account-backed draft recovery — November 3, 2026

Implemented on `codex/soigne-invoice-drafts`:

- Personal invoice working copies restore recognized-row edits, shared metadata, selected line, source page/zoom, phone view, and manual line entry/correction fields after reload or another visit/device.
- Debounced, serialized saves expose unsaved/saving/saved/error states. Lost save responses retry the original snapshot before newer edits. Concurrent writers receive a conflict with their local entries retained.
- Draft saving has no purchase, price or accounting effect. Recovery uses current server facts and clears currency/line verification. Purchase IDs and matching-operation receipts survive recovery.
- Manual drafts retain their original saved-line revision. A late/lost commit cannot silently erase subsequent edits or authorize an overwrite of a changed record; the user can explicitly load the latest saved line.
- Additive migration `20261103000000_invoice_review_drafts` creates one draft per user/invoice. Normal migration-first startup applies it. Only disposable databases were migrated during implementation.

Validation: production webpack build and TypeScript, full lint, 249 unit tests, 60 disposable-database tests and local-invoices/operating-calendar/accounting-invoices/URL-state browser suites pass. Coverage includes cross-device conflicts, reload with both recognized and manual edits, cleared verification, save-response loss followed by newer edits, retry-safe ingredient creation, lost manual commits with later edits preserved, ownership/role checks, cross-origin rejection, source view recovery and unchanged financial/production facts. Desktop/mobile review screenshots were inspected.

At this checkpoint, inbox states, richer completion links and workflow timing remained pending. The next slice delivers inbox and completion. Food-total confirmation drafts, exact scroll/caret restoration and unfinished upload/OCR processing remain outside durable draft recovery; only server-confirmed draft saves are durable.

### Invoice inbox and reviewed ingredient measurements — November 3, 2026

Implemented on `codex/soigne-inbox-conversions`:

- A paginated invoice inbox exposes Needs review, In progress, Needs attention, Ready to finish and Complete, with filters and review counts. Opening an upload moves directly to its review workspace. Completion is explicit and records the reviewed revisions; subsequent changes reopen review.
- Completion shows reviewed food spending, actual catalog price changes, affected recipes and the next unfinished invoice. Finishing review does not confirm spending or post accounting entries.
- Ingredient measurement settings support a named each (for example, head), average purchased ounces per each, optional density, supplier pack and usable yield. A live explanation and before/after recipe-cost preview precede an explicit basis confirmation. Changes require a current preview and are retained in append-only history.
- Existing recipe interpretation stays unchanged until that ingredient's measurement settings are reviewed. Review applies to every recipe using the ingredient, including nested parents. No recipe quantities are rewritten. A missing reviewed conversion produces an unknown cost rather than an invented numeric total.
- Shared math carries reviewed measurements through recipes and print, nested recipes, menu costing, dependency planning and purchasing. Counts describe whole purchased items; trim affects usable weight/volume. At $4/head, 20 purchased oz/head and 90% yield, 9 usable oz consumes 10 purchased oz, costs $2 and requires half a head. Three heads remain three heads and supply 54 usable oz.
- Invoice normalization uses purchased quantities without trim. A received-weight override applies only to that invoice. Saved observations retain their captured conversion; changing an average never retroactively renormalizes them. Compatible historical price comparisons use their captured basis. New prep snapshots retain measurements; existing frozen records remain unchanged.
- Additive migration `20261103010000_inbox_ingredient_measurements` creates measurement fields/history, captured invoice measurements and cached inbox metadata. Its backfill changes review metadata only and never marks an old invoice explicitly complete. Only disposable databases were migrated during implementation.

Validation includes a ten-line invoice browser scenario covering stale conversion rejection, line approval, impact links, completion without accounting, next invoice, mobile layout and permissions. Automated click/scroll/time observations are recorded by the test. A human before/after timing baseline and the proposed 30% improvement target remain unverified. See [ingredient measurements](ingredient-measurements.md) for operation and rollout details.

Release checks: production webpack build with TypeScript, full lint, 255 unit tests and 63 disposable-database tests pass. Browser checks cover the new workflow plus existing invoice recovery, accounting, calendar, navigation, recipe costing/print, nested dependencies, event purchasing and banquet setup. Desktop and phone screenshots were inspected. These delivered slices do not imply completion of every broader Phase 1/2 roadmap item below.

### One workspace, from capture to completion

- [ ] Make the invoice list an inbox with clear states: processing, needs review, partly reviewed, complete, and needs recovery. Keep failed recognition separate from a failed upload; a stored document can still be reviewed manually.
- [ ] Use a compact capture area for a photo, PDF, or batch. After capture, open the active invoice workspace and keep other queued documents reachable without taking over the screen.
- [ ] On desktop, keep the source document beside compact editable rows. Provide page navigation and zoom. Selecting a row should open the correct source page; add precise source highlighting only when reliable coordinates are available.
- [ ] Keep supplier, invoice date, invoice reference, currency and venue in a shared header. Enter shared metadata once and retain it throughout review.
- [ ] Show overall progress and distinguish suggested matches from human-reviewed rows. “Matched” must never imply “approved.”
- [ ] Expand the selected row's exceptions and advanced fields in place. Keep ordinary rows compact. Use plain labels such as “Confirm pack size,” “Choose ingredient,” and “Price increased.”
- [ ] Use a clear per-row action such as **Confirm line & next**. After a successful approval, update the status and move focus to the next unresolved row. Keep reviewed rows accessible for inspection and correction.
- [ ] Show normalized cost and the proposed catalog change before confirmation. Keep remembered matches, unit verification, explicit price approval and historical corrections distinct.
- [ ] Make completion useful: show what was reviewed, which current prices changed, what remains unresolved, and links to affected recipes or the next invoice. Any spending/closeout action remains explicit.

The first release retains per-row verification and approval. A batch action for individually reviewed rows is a later product decision. Automatically approving a high-confidence match is outside this plan.

### Make the interaction feel considered

- [ ] Use one primary action for the current step, consistent field sizes, clear type hierarchy, purposeful spacing, and a quieter treatment for secondary controls.
- [ ] Keep the existing dark operational workspace and readable paper previews as the starting point. Refine contrast, selection, status and hierarchy before considering a broader palette change.
- [ ] Move technical explanations such as OCR engine names into help/details. Keep operational information visible: progress, saved state, errors, and what will change.
- [ ] Use brief transitions for row completion and expansion, real progress where measurable, and immediate save feedback. Respect reduced motion and keyboard focus.
- [ ] Persist unfinished review edits, the active row and document page. A draft save does not approve a purchase or change catalog prices. Show saving, saved and recovery states honestly.
- [ ] Handle refreshes, navigation, network failures and concurrent edits without silently discarding or overwriting entered values.
- [ ] On phones, use the same workflow with a source/review switch and an accessible primary action. Returning to the source must preserve the active row and draft. Avoid a miniature desktop table.

Recognition currently runs on the device and upload queues are browser-memory queues. Do not imply that they continue after the tab closes. Persist completed work and support explicit resumption; a durable processing service would be separate scope.

### Acceptance

- [ ] Review a representative ten-line invoice and a multi-page scan with an unknown ingredient, changed pack, price increase, ignored nonfood line and manual correction.
- [ ] Confirm rows without scrolling between distant upload, preview, recognition and saved-line sections.
- [ ] Verify refresh recovery, supplier changes, retry after a lost response, and a conflicting edit. No duplicate purchases or unexpected price changes.
- [ ] Visually review desktop and phone layouts; complete the workflow by keyboard; preserve existing role restrictions and accounting history.
- [ ] Measure review time, scroll travel, repeated metadata entry and actions per ordinary row against the current interface. Aim for at least 30% less review time on the same sample set; this is a target, not a measured result.

Primary touchpoints: `app/(app)/invoices/`, `components/InvoiceLocalReview.tsx`, `components/InvoicePurchaseReview.tsx`, `components/useDocumentQueue.ts`, and `lib/invoices/`.

## Phase 2 — Buy one way, cook another

### Ingredient-specific measurements

An ingredient needs explicit relationships between purchasing, measurement and usable yield. A “head” of celery cannot share a universal weight with a head of lettuce. Supplier packs can also differ for the same ingredient.

- [ ] Store an ingredient's average purchased weight per each, its weight unit, and whether the value is an estimate or measured reference. Record who changed it and when.
- [ ] Keep supplier pack contents separate: for example, one case contains 24 heads, and one head averages 20 oz purchased. A pack change must not silently rewrite a historical conversion.
- [ ] Keep usable yield separate from average purchased weight. Label the basis explicitly in the editor and invoice review.
- [ ] Preserve the supplier's billed quantity, unit and amount. Normalize for costing through the explicit conversion rather than replacing the original invoice facts.
- [ ] Allow ingredient-specific volume/weight relationships where the chef supplies a reliable density. Never infer density or average weights from ingredient names.
- [ ] Show a live, readable conversion preview while entering values. Keep missing conversions visible and actionable; do not substitute an invented equivalent or a misleading zero cost.
- [ ] Support an explicitly reviewed invoice-specific measurement when the received product differs from the default. Updating the reusable default is a separate deliberate action.

The planning default for the celery example is **20 oz purchased weight per head**. It is an average, not a guarantee about each delivery. Existing ingredient data must be reviewed before assigning this meaning to stored values.

### Acceptance example: celery

Illustrative price: $4 per head. Illustrative usable yield: 90%.

| Step | Result |
| --- | --- |
| Purchase 3 heads at $4 | $12 invoice cost |
| Average purchased weight: 20 oz per head | 60 oz purchased |
| Usable yield: 90% | 54 oz usable |
| Purchased cost | $0.20 per purchased oz |
| Usable cost | $12 ÷ 54 = approximately $0.2222 per usable oz |
| Recipe requires 9 oz usable | Requires 10 oz purchased, equivalent to 0.5 head; ingredient cost is $2.00 |

The interface should present this as a short explanation: **3 heads → 60 oz purchased → 54 oz usable**. Editing head weight or yield updates the preview immediately. The chef can see why the cost changes.

### One consistent calculation path

The current standard recipe costing path does not apply `yieldFactor`, while event purchasing and festival ordering do. Generic unit conversion also has no ingredient-specific each-to-weight bridge. These are known inconsistencies to reconcile, not simply new fields to add.

- [ ] Keep standard weight/volume/count conversions in the generic unit utility. Add ingredient-aware conversion and yield calculation in a shared domain service used by recipes, nested builds, menus, invoice normalization, dependency previews and purchasing.
- [ ] Treat new or reviewed recipe ingredient quantities as usable/prepped amounts. Translate to purchased demand using the ingredient's reviewed yield exactly once.
- [ ] Keep raw-ingredient trim loss distinct from a sub-recipe's output yield and from smoking/preservation production yields. Avoid applying the same loss at two levels.
- [ ] Aggregate ingredient demand across recipes before rounding purchasing quantities to whole heads or supplier packs. Cost consumption at its actual quantity; show the rounded buying commitment separately.
- [ ] Return quantity, unit, basis, conversion source and any unresolved condition together. All screens must distinguish a complete cost from a partial estimate.
- [ ] Preserve sufficient precision for unit rates and intermediate calculations, with consistent rounding at defined display and accounting boundaries.

### Migration and verification

- [ ] Audit existing recipe quantities and yield conventions before enabling the change. Produce an impact preview showing old/new costs and records requiring review.
- [ ] Decide how legacy recipes are classified or marked reviewed; do not silently reinterpret every existing quantity as usable weight.
- [ ] Use additive schema changes and reviewed rollout steps. Freeze the relevant conversion/yield basis in new historical records, and preserve existing packets, purchases, ledger entries and exports.
- [ ] Verify each-to-weight conversions, different supplier packs, 100% and partial yields, nested recipes, shared ingredient aggregation, missing conversions, stale edits and invalid inputs.
- [ ] Reconcile the celery example across invoice review, ingredient details, recipe costing, nested recipe scaling, menu margin and purchasing. Preserve legitimate zero actual production output in the existing production workflows.

Primary touchpoints: `prisma/schema.prisma`, `lib/recipes/costing.ts`, `lib/recipes/units.ts`, `lib/recipes/recipe-dependencies.ts`, `lib/production/production-planning.ts`, `lib/menus/festival.ts`, `lib/invoices/`, and the ingredient editors. Inspect every additional costing caller before rollout.

## Phase 3 — Carry Soigné through the product

Use the invoice workspace as the reference for editing, progress, exceptions and recovery. Extend the existing primitives with reusable workspace headers, source/review layouts, compact rows, save-state feedback and consistent empty/error/loading states.

| Area | Upgrade | Evidence of completion |
| --- | --- | --- |
| Ingredients | A concise overview of purchase unit, recipe unit, pack, yield, current cost and price source; advanced details expand in place. Use “Ingredients” consistently in navigation and page titles. | A chef can explain and adjust the celery conversion without searching separate pages. |
| Recipes | Keep yield, scaled quantities and cost impact visible during editing. Make missing conversions and stale prices actionable beside the affected line. | Editing a quantity preserves focus and shows a consistent impact across the build. |
| Prep and closeout | Clear requested, made, sent, retained and unresolved states; progressive entry; visible save status and charge preview. | The operator can resume an unfinished day and see exactly what prevents completion. |
| Smoking and preservation | A clear run timeline, compact checkpoint entry, photo review and an obvious next action. | A phone user can record work and recover from interruption without repeating it. |
| Morning Pulse | An action queue with relevant venue/date scope, owners and links to the exact unresolved work. | Each alert leads to a meaningful action; resolved issues leave the queue. |
| Shared navigation | Clear working venue, consistent naming, fewer competing destinations, role-appropriate actions and recent work. | Switching context is understandable on desktop and phone; links and browser history still work. |

- [ ] Use semantic design tokens for surfaces, text, selection, status and focus. Preserve print styles and the existing stylesheet layers.
- [ ] Keep dense professional editing where it helps, while reducing permanently visible instructions and fields. Include comfortable touch targets and clear contrast.
- [ ] Reuse the URL-driven inspector and filter work already completed. Do not lose deep links, unsaved-change protection or keyboard navigation.
- [ ] Restore each user's assigned home venue at sign-in while keeping session switching available. The chef's requested home is The Station; account identity and title mappings still need to be supplied before changing user data. Access roles and job titles stay distinct.

## Phase 4 — Projects & Pop-ups

Create one useful home for requests such as Milwaukee Night Market, Gangster Party, a Renard's special, or a small pop-up menu. A project can begin with a name and an idea, before a date, client or venue is known.

- [ ] Define a proposed lifecycle: idea → costing → ready to schedule → scheduled → in production → completed. Confirm which transitions matter before implementing the model.
- [ ] Keep recipes, quantities, assumptions, target price/margin, notes and attachments together. Save scenario revisions so estimates remain explainable.
- [ ] Show how quantity, ingredient cost and yield changes affect the proposal immediately, using Phase 2's calculation service.
- [ ] On scheduling, deliberately link or hand off to the appropriate event, banquet, festival or menu workflow. Define the authoritative record and avoid duplicate production or purchasing demand.
- [ ] Generate prep, purchasing and packing requirements from the agreed plan. Keep purchasing within the relevant project, event or rollout.
- [ ] Preserve banquet client/service requirements and festival forecasting. A common project entry point must not flatten their distinct operational needs.
- [ ] Define the next Home Meal Replacement expansion separately. Naming is already implemented; new ordering, packaging or fulfillment scope has not been selected.

Completion example: begin an undated pop-up costing request, compare portions and pricing, schedule it, generate its production requirements, and trace the resulting work back to the agreed estimate.

## Phase 5 — Depth that supports a premium hospitality platform

Choose these extensions based on the next operational bottleneck. They are recommended opportunities, not a commitment to build every module.

| Opportunity | Useful first release | Dependency / boundary |
| --- | --- | --- |
| Production coordination | Assign work, station, due time and dependencies; surface overlapping demand and equipment conflicts. | Build on existing jobs, schedule and batch records; define equipment capacity before claiming conflict detection. |
| Event purchasing through receiving | Turn a project's purchasing demand into tracked supplier orders, receipts, shortages, substitutions and invoice discrepancies. | Requires order/receipt models and permissions; retain the decision against a standalone weekly shopping workflow. |
| Accountability and handoff | Record-specific notes, assigned follow-ups, reviewed changes and a visible history. | In-app workflow first; notification channels require explicit configuration. |
| Lot and yield visibility | Trace an existing production lot to its recorded inputs, output and destinations; show observed yield variance. | Expose gaps honestly. Current logs do not establish a complete inventory/recall system. |
| Management visibility | Venue comparisons, unfinished work, reviewed purchasing changes and contribution to menu cost increases. | Report only from available, comparable facts; sales-mix/POS menu engineering remains deferred. |
| Onboarding | Guided venue, supplier and catalog setup; import previews; conversion and cost-completeness checks. | Surface review requirements before data enters operational calculations. |
| External systems | Evaluate a deliberate accounting handoff and integrations with the systems the business actually uses. | Acumatica remains authoritative. Credentials, mapping, ownership and reconciliation must be defined before any automatic posting. |

If Mise will be sold to unrelated hospitality companies, add an explicit commercial-platform track: organization-level data isolation, organization/venue permissions, invitations and account recovery, SSO/MFA requirements, support workflows, and billing if needed. The present multi-venue schema does not itself provide organization isolation. Decide between managed separate deployments and shared tenancy before onboarding a second independent business.

## Architecture and delivery standards

Keep the current Next.js/React/Prisma application and domain structure. Strengthen the seams that affect this roadmap:

- Separate invoice orchestration, review state and domain mutations so the screen renders an explicit processing/review/recovery state. Avoid expanding the current collection of independent flags into another large component.
- Standardize active-user and venue authorization checks across mutations. Preserve server validation, operation receipts, conflict detection and audit history.
- Replace full-catalog loading in the application shell with scoped search as catalog size warrants. Add pagination/search to catalog screens without truncating the dependency data required for correct recursive calculations.
- Define a money and precision policy. Evaluate decimal storage for financial values through a separate migration review; do not casually rewrite historical monetary snapshots.
- Establish reliable CI for type checks, lint, unit tests and relevant disposable-database/browser suites. Add screenshot comparison for the shared interface and paper output where it catches meaningful regressions.
- Add measurable request/error visibility, backup/restore rehearsal and a release rollback procedure appropriate to the deployment. Validate slow devices, representative catalogs and multi-page invoices before making performance claims.
- Reconcile duplicate source files and roadmap links after comparing contents. The working tree currently contains untracked ` 2` copies; preserve them until their provenance and differences are understood.

The existing progress log reports 245 passing unit tests in its prior environment. This review's available app-bundled Node runtime ran 242 passing tests but could not load `sharp` for the invoice-storage test file because of macOS signing compatibility. That is an environment-limited result, not a verified application regression or a current full pass. Establish a compatible runtime before recording the next release baseline.

## Decisions and boundaries

| Topic | Planning position |
| --- | --- |
| First implementation | Invoice workspace, using current arithmetic and explicit per-row approval. |
| Celery measurement | Illustrative average of 20 oz purchased per head; make the basis explicit and review existing records. |
| Recipe quantity basis | Usable/prepped quantity for new/reviewed recipes; legacy migration requires an impact review. |
| Batch invoice approval | Unresolved; retain the present per-row requirements. |
| Recognition | Keep self-hosted local OCR and manual fallback. Paid AI is not introduced by this roadmap. |
| Mobile | Improve the same workflow; the previously declined separate Line Mode remains out of scope. |
| Inventory / weekly ordering | Keep existing records; do not restore removed sidebar destinations or add the declined reusable weekly shopping workflow. |
| Sales-mix menu engineering | Remains deferred. |
| Branding | Refine the current identity and interactions first; a complete rebrand is not assumed. |
| Commercial scope | Strong internal multi-venue operation first; separate-business tenancy and enterprise integrations need an explicit product decision. |

## First implementation slice

1. Capture the current invoice workflow and timing using disposable fixtures; confirm the processing/review state model and persistence boundary.
2. Build the desktop source-and-rows workspace and phone source/review layout using existing invoice storage, recognition, matching and approval services.
3. Add active-row progression, draft recovery, clear normalized-price feedback and a useful completion state. Preserve approval semantics and historical behavior.
4. Verify the full representative invoice scenario, compare the interaction measurements, and visually review desktop, phone and keyboard operation.
5. Start the conversion data model and legacy impact preview, then implement the celery acceptance case through the shared calculation path.

Record evidence and status here as each slice ships. Revisit the later feature order after invoices and conversions are used in real kitchen work.

## Market references

Current vendor materials help define the commercial benchmark, not implementation promises: [Apicbase production planning](https://get.apicbase.com/production-planning/) connects scaled recipes, material requirements and purchasing; [MarketMan invoice management](https://www.marketman.com/page/restaurant-invoice-management-system) connects invoice capture with purchasing and accounting; [Tripleseat event documents](https://tripleseat.com/features/proposals-contracts-beo/) keeps proposals and BEOs connected to event details. Mise's opportunity is to connect its existing culinary depth with equally coherent daily workflows.
