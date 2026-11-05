# Mise: experience review and proposed roadmap

November 4, 2026 · Internal multi-venue kitchen operations first

## Recommendation

Invest in a coherent product redesign around the chef’s working day. Mise has substantial domain functionality and useful integrity protections, but the interface exposes too much of its implementation history. The next release should make the existing capabilities easier to understand and use before adding more modules.

The visual overhaul should be substantial: application shell, navigation, page composition, typography, forms, tables, interaction states, and mobile behavior. Keep the existing domain services and historical protections wherever they work. A framework rewrite is not justified by this review.

The user confirmed that this is primarily for their own multi-venue team. Subscription billing, customer onboarding, marketplace integrations, and multi-tenant SaaS architecture are outside the first roadmap.

## Scope and confidence

Reviewed the current working tree, existing roadmap decisions, data model, authentication helpers, representative mutations, shared UI, and core kitchen workflows. Inspected a locally running application backed by a disposable PostgreSQL database at 1440px desktop and 390px phone widths. The fixtures are test data, not representative production volumes or live kitchen records.

The review included dashboard, Daily Prep, recipes and their inspector, ingredients, production planning, invoice inbox/review, banquets, schedule, specials, and closeout. This is a product/code review, not a full accessibility, security, or production-performance certification. User task times have not been measured. Visual examples in the accompanying concept are illustrative proposals.

The checkout already contained application edits and many untracked files with names ending in ` 2`. They were left intact. The specials hydration finding below concerns this working tree, including its in-progress changes.

## What to preserve

- Recursive recipes, allergen inheritance, dependencies, and ingredient-specific reviewed measurements already exist. Do not plan them again as greenfield features.
- Invoice review already has a source/review workspace, inbox states, reviewed price changes, personal durable drafts, and conflict handling. Improve and extend these patterns.
- Prep snapshots, immutable exports, linked corrections, transaction boundaries, and review checks provide a valuable foundation. A faster interface must preserve them.
- QR start/finish logging, printed cook packets, banquet setup sheets, smoking, and preservation reflect actual kitchen work. Keep paper and phone workflows connected.
- Domain folders, shared primitives, CSS layers, and extensive tests already exist. The remaining problem is consistent application and product design, not a total absence of architecture.

## Why it feels assembled rather than designed

| Finding | Evidence in the current app | Change to make |
| --- | --- | --- |
| Too many equal navigation choices | The admin sidebar exposes 19 destinations. Prep Orders, Production, Smoking, Events, Banquets, Festivals, Menus and HMR require users to know the module structure. `components/Sidebar.tsx:26` | Organize around work: Today, Production, Culinary, Planning, Purchasing, Reports. Put team/settings in a secondary location. Use local navigation for specialist tools. |
| The home screen emphasizes maintenance | Morning Pulse begins with company-wide ingredient integrity, then events, closeout and menu margins. `app/(app)/page.tsx:38` | Put today’s due work, unresolved decisions, changed plans and handoffs first. Retain costing exceptions in a secondary manager view. |
| Action placement has no consistent hierarchy | Daily Prep has a header action, date form, print controls, worksheet link, project links and history before the work. At 390px the first prep card starts around 575px down the page. `app/(app)/prep-orders/page.tsx:65` | One compact date/context bar, one main action, grouped secondary actions, then the work list. |
| Some controls occupy space unrelated to their value | Closeout stretches a date input almost across the desktop. Two fixture items produce a roughly 2,865px desktop / 3,505px phone page. These are fixture-specific observations, not a benchmark. | Constrain field widths; compact item summaries; expand the active item; keep progress and finish action visible. |
| Cooking and administration compete | The full recipe page puts cost statistics and dependency exploration before ingredients and method. The inspector is a better focused starting point. `app/(app)/recipes/[id]/page.tsx:187` | Provide clear Cook, Cost and Edit views. Cook opens with batch yield, ingredients, method, allergens and critical notes. |
| Visual styling is implemented as broad remapping | Screen CSS turns “gold” tokens blue and reverses neutral ramps; many route-specific controls coexist with shared primitives. `app/styles/components.css:3`, `components/ui.tsx` | Introduce semantic surface, text, border, action and status tokens, then consistently apply a small set of page templates. Preserve the separate print palette. |
| Important context is not consistently in the shell | The authenticated header contains search and identity but no active venue selector, despite older README wording. Venue selection/fallback varies by workflow. `app/(app)/layout.tsx:32`, `lib/venues/venue.ts` | Persistent working venue, explicit company-wide labels, visible dates, and clear destination labels. Keep viewing context separate from write permission. |
| Dense data has insufficient progressive disclosure | The fixture ingredient catalog renders a page over 10,000px tall; numerous columns and category filters compete above it. `app/(app)/items/page.tsx:29` | Default to the columns needed for the current task; saved filters and column preferences; paginated server queries; inspector for detail. |
| Specialist tools do not share a common page structure | Specials, smoking, production and legacy event screens use different header, action, tab and form patterns. | Use one list, one record workspace, one review workflow and one execution pattern across modules. |

Density is useful when it supports repetitive work. The target is compact, readable, intentional density: a fast desktop grid for accounting, a large-target task view for cooks, and clean paper output. Uniformly making every screen more spacious would create more scrolling.

## Proposed experience standard

Use a calm operational identity: restrained neutral surfaces, a single primary action color, strong readable type, subtle separators, and status color reserved for meaning. Keep the Mise wordmark and culinary character; concentrate editorial typography in branding and printable documents. Offer light and dark appearances after testing both in the actual kitchens. The default should follow field use, not taste alone.

- Use a consistent spacing scale and control heights. Use 14–16px operational text; do not make essential instructions small metadata. Prefer 44–48px touch targets for kitchen execution. These are proposed product targets; WCAG 2.2 AA’s target-size criterion is 24px with exceptions, not a blanket 44px requirement. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/)
- Define one title/context/action header and predictable local navigation. Keep one main action per active workflow step.
- Separate view from edit. Show sensible defaults first and advanced fields on demand. Keep quantities and units together.
- Share saving, saved, retry, conflict, empty and permission states. A draft save must remain distinct from approval, production confirmation and accounting finalization.
- Preserve filter, selected record and working position on return. Use a drawer for quick inspection and a full workspace for sustained editing.
- Place errors beside the affected field, preserve the entry, and explain the recovery action. Use explicit confirmation for financially significant or destructive changes, not routine reversible edits.
- Use keyboard navigation for office work and large direct actions for kitchen work. Verify keyboard focus, zoom, labels, contrast, reduced motion and sticky-bar overlap against [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Navigation and workspaces

| Destination | Contains | Main question answered |
| --- | --- | --- |
| Today | Due work, blockers, changed plans, handoff notes, personal queue | What needs my attention now? |
| Production | Daily Prep, work assignments, smoking, preservation, execution logs | What are we making, for whom, by when? |
| Culinary | Recipes, ingredients, menus, specials costing | How do we make and cost it? |
| Planning | Banquets, events, festivals, HMR, future Projects & Pop-ups | What is coming and what does it require? |
| Purchasing | Invoice inbox, suppliers, demand lists from selected plans | What needs buying or reviewing? |
| Reports | Operating calendar, prep accounting, exceptions and exports | What happened and what needs closing? |

This is a navigation proposal, not a mandate to merge different data models. Banquet ordered counts, festival forecasts, HMR packages and ordinary event servings have distinct meanings. Bring them into a coherent planning surface while preserving those meanings and existing links.

The existing roadmap explicitly removes Inventory and Order Guides from navigation and rejects a new reusable weekly shopping workflow. Respect that decision. Purchasing improvements should start inside events, menus and selected production demand. Any later stock ledger needs a separate operational justification.

### Today and production

Build Today from existing records first, with role-aware entry points. An executive chef sees cross-venue exceptions and readiness; a venue chef sees local demand and handoffs; a cook sees assigned production. Introduce station/owner/due-time data only where it is truly missing, rather than inventing dashboard statuses from unrelated fields.

For each job show recipe, quantity/unit, destination, ready-by time, owner, status and next action. Provide list and station grouping; a board is useful only where it improves dispatch. Link the current recipe version and frozen production packet explicitly.

Add shortfall reporting, handoff notes, and “changed since packet issued” indicators. Preserve the distinction between elapsed timer duration and actual person-minutes used for labor costing. Extend start/finish logging rather than create a second timer system.

### Recipes and ingredients

Make Cook the obvious kitchen view, with scaling, readable steps, visible allergen/critical notes, and a link to the full print packet. Keep sub-recipes accessible without losing the parent position. Cost should show complete/partial/unknown clearly, supplier freshness, reviewed conversion basis and nested contribution. Edit should organize identity/yield, ingredients, method, storage and change history into manageable groups.

Add a reviewed plating/reference photo and a deliberate Draft → Approved → Retired lifecycle as later enhancements. Existing recipe version history is a starting point; publication approval is a separate workflow. Do not silently reinterpret legacy ingredient quantities or rewrite historical snapshots.

### Closeout

Use a concise list of items with requested, made, sent, difference and review status. Open deductions, notes and detailed charge preview for the active item. Show remaining blockers before the user reaches Finish day. Preserve per-item persistence, reviewed cook results, explicit allocation confirmation and immutable finalized records.

### Planning and purchasing

Connect an idea/special to a saved project, approved menu, production demand, packet and post-event review. Initially unify navigation and summary views. Only then design explicit source links between event demand and prep requests so the same work is not purchased twice.

Keep invoices beside their source with compact ordinary rows and expanded exceptions. Add useful supplier invoice identity/date/amount rather than relying on file names. Reuse the existing durable draft behavior. A durable background OCR/upload job service is future scope; the current device-local recognition cannot continue after its tab closes.

## Technical and reliability findings

| Priority | Finding | Recommendation and proof of completion |
| --- | --- | --- |
| P1 | Authorization helpers are inconsistent. `requireRole` reads the JWT role; recipe/item/vendor/admin actions still use it, while prep and several newer services query current database permissions. `lib/auth/session.ts:37`, `app/(app)/admin/users/actions.ts:62` | Centralize current-account authorization at the mutation/data boundary. Test demotion, disabled/deleted accounts, password reset and cross-venue writes using an existing session. A current-role layout check alone does not protect direct action calls. This is a code-level risk, not a claim of observed misuse. [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication) |
| P1 | Production planning loads banquets, festivals, prep and HMR but not ordinary Events. It also asks the user to detect overlap between event demand and prep. `lib/production/production-planning-data.ts:12`, `app/(app)/production/page.tsx:45` | Define the inclusion contract, include supported event types, and link source demand to prep requests. Fixture test: one event represented by a prep request contributes once, while independent demand remains additive. |
| P1 | Event lists compare a date-only event timestamp against the current instant, which can move today’s event into Past after its stored midnight. `app/(app)/events/page.tsx:24` | Use a consistent business-date boundary and explicit service time where applicable. Test today, midnight, cancellation and Chicago daylight-saving boundaries. |
| P1 | No repository-owned CI workflow was found in this checkout. There are good local tests but no inspected automatic merge gate. Hosted controls may exist elsewhere. | CI for lint, TypeScript, unit tests, disposable PostgreSQL migrations/integration, production build and selected desktop/mobile workflows. Capture browser errors and critical visual regressions. |
| P2 | The current checkout fails the normal TypeScript check on duplicated generated `.next/types/* 2.ts` / `* 3.ts` files; many untracked source duplicates also exist. A separate source-focused check passes. | Diagnose how copies arise, preserve and compare user changes, and use a clean controlled checkout for release validation. Do not blindly delete files or treat this as a proven committed-source build failure. |
| P2 | A hydration mismatch was observed in current Specials work: the displayed `asOf` timestamp differs between server and client. `app/(app)/specials/workspace.tsx:59` | Pass a stable initial timestamp from the server or intentionally populate it after mount. Gate on an error-free browser console. |
| P2 | Whole catalogs are loaded by the shell/search, recipe lists, ingredient lists and several calculation paths. | Measure first; move search/list filtering and paging server-side, load relevant dependency subgraphs, cache derived costs with explicit invalidation. Benchmark realistic data before choosing virtualized tables or new infrastructure. |
| P2 | Shared UI components exist, but route-specific forms still vary in save/recovery behavior and presentation. | A small tested component catalog covering page templates, controls, tables, status and error states. Adopt it one complete workflow at a time. |
| P2 | Monetary/unit costs and many accounting-related amounts use `Float`; newer spending entries use cents. | Document precision and rounding boundaries; evaluate Decimal or scaled integers for persisted financial amounts. Preserve fine unit-cost precision and historical exports. Migrate only with reconciliation tests; this review did not demonstrate a current rounding error. |
| P2 | Repository evidence does not establish production monitoring, restore rehearsal, login throttling or centralized session revocation. | Verify hosting controls, then fill gaps: structured errors, request IDs, health checks, tested recovery, auth throttling and account disable/revoke. Do not infer production absence solely from source absence. |
| P3 | Smoking retains a roughly 1,124-line client component, and some complex services/UI are compressed into very long lines. | Decompose along workflow/state ownership and apply consistent formatting while touching those areas. Preserve domain boundaries; avoid a separate cosmetic refactor project. |

The old hidden inventory route allows any authenticated user to change pars and remove rows (`app/(app)/inventory/actions.ts`). Decide whether it remains supported. If retained, explicitly separate counting from catalog/par administration and validate venue scope. Removing a navigation link is not removal of the capability.

## Delivery roadmap

Effort classes indicate relative scope, not calendar commitments: S = contained change; M = one substantial workflow; L = cross-workflow/data work. Establish estimates after the first design slice. Each phase has a release gate; do not ship a new sidebar over unchanged confusing pages and call the redesign complete.

| Phase | Deliverables | Scope | Exit gate |
| --- | --- | --- | --- |
| 0 · Stabilize and observe | Current authorization checks; event-date/planning correctness; clean repeatable validation; baseline five real chef tasks | M | Known correctness issues have regression coverage; existing checks repeat on a clean checkout; chef task observations recorded. |
| 1 · Define and prove the new experience | Navigation/context model; semantic design tokens; desktop, tablet and phone patterns; complete Today → Daily Prep → cook detail prototype | M | Chef and cook can identify venue, next job, quantity and next action without explanation; primary work is visible in the first phone viewport. |
| 2 · Ship daily execution | New shell, Today, Daily Prep, focused cook workspace, compact closeout, consistent recovery and saves | L | A complete prep day works across venues and devices; lost responses/reloads do not lose saved work; accounting and frozen packets remain unchanged. |
| 3 · Bring culinary and purchasing to the standard | Recipe Cook/Cost/Edit views; ingredient catalog; invoice refinement; shared filters/inspectors; targeted performance work | L | Find/scale a recipe, resolve a cost exception, and review a ten-line invoice with less navigation and no loss of context. |
| 4 · Connect planning and handoffs | Unified planning entry, linked source demand, Projects & Pop-ups, changed-plan acknowledgement, assignment/deadline model | L | One plan reaches production and purchasing without duplicate demand; destination/quantity changes remain visible and attributable. |
| 5 · Add selected operational depth | Receiving against plan, waste/yield trends, recipe approval/photos, mobile resilience, relevant integrations | L, selected modules only | Each feature demonstrates a measurable operational benefit in a pilot kitchen before broad rollout. |

Phases 0 and 1 can overlap. The UI implementation should proceed as complete workflow slices. Carry the new design through one end-to-end path before rolling it across the app.

### First implementation backlog

1. **Current authorization everywhere (M):** reuse the database-backed identity pattern and test old-session mutations.
2. **Business-date and production coverage fixes (S–M):** today remains today; supported plans appear in production; expose overlap clearly until explicit linking is shipped.
3. **New shell and context bar (M):** six main destinations, persistent working venue and local navigation; preserve old URLs and permissions.
4. **Today and Daily Prep (M):** task-first composition, concise actions, quantities/destinations visible, meaningful empty state.
5. **Cook view (M):** batch scale, ingredients/method, allergens, nested recipe access, QR handoff and readable touch controls.
6. **Closeout redesign (M):** compact summaries, one active editor, outstanding exceptions and final review.
7. **Shared interaction states (M):** draft/save/retry/conflict conventions applied to those workflows.
8. **Automated release and visual checks (M):** run alongside the slices; add stable demo fixtures and browser-error detection.

### Upgrades worth considering after the core redesign

| Upgrade | Kitchen benefit | Dependency / boundary |
| --- | --- | --- |
| Receiving and shortages against planned buying | Record what arrived, substitutions and credits where demand originated | Explicit purchasing state and receiving quantities; no automatic financial posting |
| Cross-venue dispatch and receipt | Distinguish requested, prepared, sent and received; record shortages and acceptance | Existing transfer ledger plus delivery/receipt state, with clear accounting ownership |
| Shift handoff and plan-change feed | Stops critical changes living only in conversations or printed margins | Owners, timestamps, scoped alerts; avoid a noisy general chat system |
| Planned-versus-actual yield and waste | Finds recurring production loss and improves recipe standards | Reliable actuals and captured recipe versions; never equate elapsed cook time with labor |
| Recipe publication and reference photos | Consistent execution and visible approved standard | Existing version history; migration rules for already-used recipes |
| Readable mobile execution / limited offline access | Keeps approved instructions usable when connectivity is poor | Cache/version/expiry labels, shared-device controls; start with read-only packets before offline writes |
| POS/sales and accounting imports | Reduces re-entry and supports theoretical-versus-actual analysis | Confirm source systems, mappings and reconciliation first; Acumatica remains authoritative |
| Supplier matching/price intelligence | Faster invoice exceptions and clearer impact on active menus | Build on current aliases, price history and reviewed conversions |
| Equipment/station capacity planning | Flags impossible prep plans and long-lead dependencies | Trustworthy durations, ready-by times and assignment data; validate need before optimization |

Keep speculative AI features behind these priorities. Assisted matching, document extraction and anomaly suggestions can help; the chef should confirm ingredient identity, measurement basis, cost posting and critical instructions. Do not add conversational AI merely to make the app look modern.

## How to measure improvement

Observe an executive chef, venue chef, cook and closeout user doing the same representative tasks before and after each slice. Include interruptions, a phone, keyboard-only use and a second editor changing the same record.

Measure time to find/scale a recipe, submit a multi-line prep request, resume an invoice review, identify a production shortfall, and finish a day. Count navigation transitions, repeated entry, uncorrected errors and help required. A suggested target is 25–30% less task time on the same scenarios; this is a proposal, not a result.

Record desktop/phone visual checks at 390, 768, 1024 and 1440px. Require the active venue and next useful action to be understandable, touch actions to fit, focus to remain visible, and printed output to retain its existing accuracy. Add performance targets only after measuring representative production-sized fixtures.

## Validation performed

- Unit suite: **277 passed**.
- Disposable PostgreSQL suites: **70 passed**, plus the archived Annex repair verification. Expected database errors appear in negative integrity tests.
- ESLint: passed.
- Normal TypeScript check: failed on duplicated generated route/cache type files in the local `.next` directory. A temporary source-focused configuration using tracked source and current imports passed. This does not replace a clean production build.
- Browser inspection: reviewed local desktop and phone screens; observed the Specials timestamp hydration issue described above. Did not run the full browser suite or certify the deployed app.
- The documented manual browser harness hit an empty-array expansion error under this Mac’s Bash (`scripts/test-prep-postgres.sh:46`). Used a temporary compatible copy for inspection. An added dashboard seed conflicted with a closed fixture day and was omitted; the application repository was not patched for either issue.
- No production database was read or migrated. No app implementation was changed by this review.

## Relationship to existing plans

Use this review as a current experience-focused proposal alongside `docs/soigne-roadmap.md`, `docs/app-improvements-roadmap.md` and the execution evidence. Before scheduling work, consolidate them into one active backlog with statuses **verified complete**, **in progress**, **proposed** and **deferred**. Several old checklists and README ideas now describe implemented work. Preserve the prior product decisions and history, but remove stale assumptions from the next implementation plan.

The recommended first design slice is **Today → Daily Prep → Cook view → Closeout**. It tests whether Mise can feel like one deliberately designed operational tool across the entire kitchen day.
