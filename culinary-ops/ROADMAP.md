# angryshallot roadmap

**This is the only roadmap.** All earlier roadmaps and plans were retired on 2026-11-28 (they remain in git history).
Built from three independent audits (Nov 27–28, 2026) and checked against `main` @ `2ae4ce0`.

How to use it:
- Work top to bottom. Each item has an ID, a status, the files to start from, and a "done when" check.
- Status: ⬜ not started · 🔧 in progress · ✅ done (add commit) · ⏸ waiting on a decision · ❌ dropped
- Anything marked **❓ Jeff** is a decision for the chef. Don't build past it without an answer.
- Before starting an item, re-check the claim against current code. The audits were read-only and some findings are source-only.
- Don't bulk merge, close or delete live data based on this document alone.

---

## Standing decisions (carry forward)

- **Personal use first.** The chef is the main user. A dedicated Cook view and team rollout were deferred on Nov 4. ❓ Jeff: is that still true? (It decides when Phase 4 happens.)
- **Biggest weekly time sink is ordering: knowing what to order.** On-hand counts shipped on Nov 26 (`8b226ac`).
- **Paper is the line cook's interface.** Kitchen sheets print black and white; client documents print in color.
- **Local OCR only.** Paid AI extraction stays off.
- **Wheat always implies Gluten.** Gluten can be tagged on its own (barley, rye, malt, beer).
- **An ingredient is out of review** if it has never been reviewed or was last reviewed more than 6 months ago.
- **Never claim allergen-free or vegan without data.** Unknown prints "not recorded", never blank.
- **Home venue for the chef: The Station.**
- **Keep the brand.** Aubergine, porcelain, paprika, Fraunces / Inter / IBM Plex Mono, and the shallot divider as the house print accent.

---

## Phase 1 — Safety rails (about 1 week, mostly invisible)

Goal: nobody can accidentally break production, lose data, or keep access they shouldn't have.

| ID | Status | Item | Start from | Done when |
|---|---|---|---|---|
| 1.1 | 🔧 | **CI gate before deploy.** GitHub Action: `tsc`, lint, unit tests, Postgres integration tests, `next build`, and the browser suites that currently pass. Deploy only after it passes. | `.github/workflows/ci.yml`, `.do/app.yaml` (`deploy_on_push: true`) | Workflow added (2026-11-28): runs on every PR and push to `main`. Fixed the 3 known-broken browser tests plus `morning-pulse`, and four app bugs they exposed: invoice review crashed on a saved line whose id isn't a UUID; Monthly Tracker sales showed "$1.0K" vs "$1K" between server and browser; **invoice reading and PDF preview failed on older browsers** (switched to pdf.js's compatible build); Escape didn't close the sidebar's hover menu. **Still open:** make the deploy wait for CI. ❓ Jeff: require pull requests into `main` (branch protection), or have GitHub run the deploy. |
| 1.2 | ⬜ | **Role checks read the database, not just the login token.** Make `requireRole` / `requireUser` confirm the current role in the database (as `requireActiveUser` already does). Add an "account disabled" flag. | `lib/auth/session.ts:25-66`; 58 files in `app/` call these | A demoted or removed user loses access on their next click. There are tests for both cases. |
| 1.3 | ⬜ | **Lock down hidden Inventory.** Any logged-in user can currently edit pars and delete rows at any venue. | `app/(app)/inventory/actions.ts` (`requireUser` only) | Staff can't change inventory. The longer-term decision is item 3.6. |
| 1.4 | ⬜ | **Confirm before delete.** Add a confirmation step for users, vendors, order guides, prep orders, ingredients, inventory rows, cooks, banquets, festivals and events. Remove cooks by deactivating them, not hard-deleting. | `admin/users/page.tsx:112`, `vendors/page.tsx`, `schedule/cooks/page.tsx`, `prep-orders/[id]`, `items/`, `banquets/[id]`, `festivals/[id]`, `events/` | No destructive action runs on one click. Cook shift history survives removal. |
| 1.5 | ⬜ | **Date bugs.** Today's events show as past after midnight UTC, and event dates display a day early in Central time. | `events/page.tsx:24-26`, `banquets/page.tsx`, `banquets/[id]/page.tsx`, `festivals/**`; use the existing business-date helper | Card, detail and print all show the same date for a Saturday event, viewed Friday night and Saturday morning. |
| 1.6 | ⬜ | **Bring back Quick-Create Ingredient in invoice review.** It was lost when review moved to the new screen. Then delete the dead old component. | `components/InvoicePurchaseReview.tsx`; dead `components/InvoiceLocalReview.tsx:192` | A new item can be created and matched on an invoice without leaving the page. |
| 1.7 | ⬜ | **Server headroom.** Move from `basic-xs` (512 MB) to `basic-s`, and allow only 1–2 PDF/image processing jobs at a time. | `.do/app.yaml:38`, `app/api/invoices/route.ts`, `app/api/smoking/route.ts` | A multi-page PDF upload and a photo upload at the same time both succeed. ❓ Jeff: OK with roughly double the monthly cost for that one server? |
| 1.8 | ⬜ | **Repair stale browser suites** so CI covers them. They test screens that have since changed, or need sample files. Stale UI: `inbox-conversions`, `local-invoices` (both test the removed old invoice review; may be deleted with 1.6), `price-trends`, `menu-rollout`, `print-controller` (scaled-print behavior changed), `prep`, `to-go`, `style-cascade` (pre-rebrand color). Need sample files: `smoking` (real thermometer screenshot), `accounting-invoices` (invoice PDF). Interference when run together: `event-planning`. | `scripts/browser/cases/*.mjs`; run locally with `BROWSER_CONTINUE=1` to see every failure | Each suite passes and is added to the CI list in `.github/workflows/ci.yml`. |

**Phase gate:** CI is green, there are no one-click deletes, and the role-revocation test passes.

---

## Phase 2 — Quick wins you'll see (1–2 weeks)

| ID | Status | Item | Start from | Done when |
|---|---|---|---|---|
| 2.1 | ⬜ | **Venue switcher.** A pill at the top of the sidebar (and `⌘K → Switch venue`) that sets the existing `activeVenue` cookie. Nothing sets it today. Admins get an "All venues" option. Pages that ignore venue say so. | `lib/venues/venue.ts`, `app/(app)/layout.tsx`, `components/DesktopSidebar.tsx`, `MobileNav.tsx` | Today, Schedule, Inventory and Monthly Tracker all follow the pill, and the current venue is visible on every page. |
| 2.2 | ⬜ | **Separate old closeouts from Today.** 54 open days going back to June bury today's work. Show them as a separate "Needs reconciling" queue. Don't auto-close them. | `app/(app)/page.tsx`, `lib/dashboard/morning-pulse-data.ts`, prep closeout | Today shows only today and overdue work. The history queue is one click away. |
| 2.3 | ⬜ | **Remove duplicate tabs.** Drop `<EventsTabs>` (it also leaves out Custom Menus) and the second nav bar in Daily Prep. Delete dead `PrepOrdersTabs.tsx`. | `events/page.tsx`, `banquets/page.tsx`, `festivals/page.tsx`, `prep-orders/layout.tsx` | Each section has one tab row. |
| 2.4 | ⬜ | **Make empty look different from zero.** An empty inventory shouldn't read "all stocked", a banquet with no guest count shouldn't show "0 guests", and no active menus shouldn't show a green "0 warnings". | Today, inventory, banquets, closeout empty states | No empty dataset looks successful. |
| 2.5 | ⬜ | **Quieter ingredient rows.** Hide "Price trend needs 2 comparable purchases" when there's nothing to plot, show money to 2 decimals in overview rows, and stop "Review duplicates (0)" from being the main button. | `components/PriceTrend.tsx`, `items/page.tsx`, recipe list | Ingredient row height roughly halves. |
| 2.6 | ⬜ | **Inputs and buttons that work on phones.** Use 16px input text so iOS doesn't zoom in, 44px buttons on touch screens, and let wide tables scroll sideways. | `components/ui.tsx` (`fieldBase`, `Button`) | No iOS zoom on any form. No page scrolls sideways at 390px. |
| 2.7 | ⬜ | **Recipe filters on phone.** Currently the first result sits about 1,670px down. Show search, station and one Filters button above the results. | recipes catalog page | The first recipe is visible without scrolling at 390px. |
| 2.8 | ⬜ | **Small fixes from the audits.** Smoking shouldn't ask for a "correction reason" on a brand-new reading. Use `router.refresh()` instead of a full reload after manual OCR. Let the supplier be changed on an invoice until a line is approved. | `smoking-client.tsx:689`, `InvoicePurchaseReview.tsx` | Each fix is checked by hand. |

**Phase gate:** the chef can do Today → invoice (with a new ingredient) → recipe → closeout → count with no dead ends.

---

## Phase 3 — Trust the numbers (3–6 weeks)

Goal: the same recipe, ingredient and event tell the same story on every screen.

| ID | Status | Item | Start from | Done when |
|---|---|---|---|---|
| 3.1 | ⬜ | **One cost-completeness rule.** A single shared result: known estimate, complete or partial, what's blocking it, and price freshness. Reuse the recipe editor's stricter logic. An empty formula, missing price, failed unit conversion or missing sub-recipe shows as "incomplete", never `$0.00`. | `lib/recipes/costing.ts`, recipe list and inspector, menus list and detail, custom menus, banquets, packets | Cheese Curds (no ingredients) shows incomplete everywhere. Annex Small Plates shows the same food cost % on the list and the detail page, with its denominator shown (e.g. "4 of 6 dishes"). |
| 3.2 | ⬜ | **One rounding rule for pull lists.** Today the Event list rounds Butter to 4 lb while the Banquet list shows 1.45 lb, from the same planner. | `buildBanquetPlan` and its callers | Events and Banquets print the same quantity for the same food. |
| 3.3 | ⬜ | **Show allergen confidence on cook-facing pages.** Separate "allergens recorded" from "review complete" on recipe summaries and packets. Finish dietary item D6: "Vegan"/"Vegetarian" line and a pre-print warning on the client menu, plus an allergen grid column. | recipe summary, print packets, client menu | No summary says "none recorded" without also showing the review status. |
| 3.4 | ⬜ | **One clear set of "needs attention" counts.** Today, the sidebar badge, Cleanup tabs and catalogs each name what they count (e.g. "used this week" vs "all") and link to the same rules. | `cleanupBadgeWhere()`, Today integrity card, `/cleanup` | Each number on screen says what it counts and links to that list. |
| 3.5 | ⬜ | **Price "verified" vs price "changed."** An invoice at the same price should refresh price age. Track the last verified source and date separately from the last change. | invoice price cascade, `priceUpdatedAt` | Approving a same-price invoice clears the stale flag without altering past exports. |
| 3.6 | ⏸ | **Inventory and Order Guides: retire or revive.** ❓ Jeff. If retired, migrate the references so old rows stop blocking ingredient merges. | `app/(app)/inventory/**`, `order-guides/**`, `/items/merge` | The routes are gone (or back in the nav with proper permissions). |
| 3.7 | ⬜ | **Count every ingredient reference.** The "unused ingredient" and delete checks miss Custom Menu and Purchase Count lines. | ingredient usage selector, `/items/merge` | An ingredient used only on a custom menu is never shown as unused. |
| 3.8 | ⬜ | **Server-side search.** Stop loading every recipe and ingredient on every page for `⌘K`. Add a debounced search endpoint, and include all nav pages, invoices, vendors and events. | `app/(app)/layout.tsx:20-28`, `components/CommandSearch.tsx` | The layout no longer queries the full catalog. `⌘K` can jump to any page. |
| 3.9 | ⬜ | **Basic speed work.** Fix the N+1 snapshot loop in production planning, add missing database indexes, use narrower `revalidatePath` calls, and stop sending the full item catalog on every row of the recipe page. | `lib/production/production-planning-data.ts:37-46`, `prisma/schema.prisma`, `recipes/[id]/page.tsx` | Measure before and after on realistic data, with no regressions. |
| 3.10 | ⬜ | **One Cleanup page.** Fold `/items/cleanup` (merge picker, vendor/SKU duplicates, missing vendor, unused items) into `/cleanup`. Add bulk "Label checked" and inline price edits. Order work by "used in the next service" first. | `cleanup/page.tsx`, `items/cleanup/page.tsx` | One Cleanup page, and label review can be done in batches. |
| 3.11 | ⬜ | **Data fixes found while printing.** Two pepper items, Spices vs Spices & Seasonings, Water filed under Frozen, Ketchup and canola needing a density, the `eac` unit, steps missing their first letter (Brisket 6–7, Pork 6/11/13, Maitake 3), Coleslaw and Field Greens with no method, storage notes stored as steps, and the "Mustard Powder[…]" name. Run `scripts/report-gluten-tags.ts`. | Cleanup page; edit the records | All are fixed in the live data by the chef or with the chef's OK. |

**Phase gate:** every cost, count and allergen summary shows its value, scope, completeness and date.

---

## Phase 4 — Connect the planning modules (next release, 1–3 months)

Goal: plan once, prep once, buy once.

| ID | Status | Item | Done when |
|---|---|---|---|
| 4.1 | ⏸ | **Demand ledger and Production board.** Every plan type (banquet, festival, custom menu, event, HMR, daily prep) writes demand lines: recipe, quantity, needed-by date, venue, source. Prep lines record which demand they cover, so Production stops asking you to dedupe by hand. ❓ Jeff: first time a real "banquet that also goes to Daily Prep" end to end. If it isn't painful, move this down. | A banquet plus its linked prep request counts once. An extra pickup still adds. A cancelled event drops out. Every number traces back to its source. |
| 4.2 | ⬜ | **"Send to prep" from a plan.** Choose the production date per dish (default: the day before). Lines appear in Daily Prep, linked to the plan. | No re-typing a banquet into Daily Prep. |
| 4.3 | ⬜ | **Custom Menus and Events feed Production.** Today they're left out. | Both show up in the planner. |
| 4.4 | ⏸ | **Events: merge or keep as a light type.** Audits A and C say merge into Custom Menus; B says link first and merge later. ❓ Jeff. | Decision recorded, and existing records are kept either way. |
| 4.5 | ⬜ | **Specials can become recipes.** Add a reviewed "Promote to recipe" action. Never overwrite a live recipe silently. | A special that sells doesn't have to be rebuilt by hand. |
| 4.6 | ⬜ | **"Start from…" for daily prep.** Start from yesterday's order, a standing par for the venue, or linked plans. Enter several lines in a grid. | A morning order takes minutes. |
| 4.7 | ⬜ | **Plan pages: autosave and phone layout.** Remove the per-row ✓ buttons, and make Banquet, Event and Festival detail pages fit at 390px. | Counts can be edited from a phone. |
| 4.8 | ⬜ | **Festivals: 9 tabs down to about 4** (Overview, Menu and forecast, Accounting and proposal, Print). Lead with unfinished assumptions, not $0 headline figures. | Fewer tabs, and missing inputs are obvious. |
| 4.9 | ⬜ | **Today as a work list.** Ranked "needs you now" (menu changed after printing, invoices to review, unfinished closeout, stale prices on this week's recipes), plus the next 72 hours. | The chef can name the next urgent task within 10 seconds. |
| 4.10 | ⏸ | **Recipe Cook view.** Read-only, large quantities, scale to a target yield ("make 18 lb"), allergens and critical control points up top. ❓ Jeff: deferred since Nov 4. Revive it? | — |

---

## Phase 5 — Design system and print (runs alongside phases 3–4)

| ID | Status | Item |
|---|---|---|
| 5.1 | ⬜ | Role-based color tokens (`--color-action`, `--color-status-watch`, `--color-safety`…). Remove the remapped Tailwind palettes, where `blue` actually renders mauve. Migrate one module at a time. |
| 5.2 | ⬜ | Three font families. Drop Cormorant Garamond and JetBrains Mono from the root layout, which saves about 108 KB. |
| 5.3 | ⬜ | One page template: title, context line (venue · date · status), one primary action, overflow menu. Smoking, Specials and Events move onto it. Fix the nested `<main>` in Smoking. |
| 5.4 | ⬜ | Type floor: no text under 12px (156 current uses). Monospace only for numbers and codes. No emoji in the UI. |
| 5.5 | ⬜ | `loading.tsx` skeletons per section (there are none today) and shared Empty / Saving / Saved / Retry states. |
| 5.6 | 🔧 | **Print redesign.** The branded client menu was paused partway. Then station cards in the approved v3 look and the chef's copy (costing, allergen grid, make-ahead list, order list by vendor). Then carry these to banquet, festival, menu, prep and to-go packets. Open question: does a sub-recipe from a different station print with its parent dish or with its own station? |
| 5.7 | ⬜ | Move all printouts onto `PrintController`, and remove the doubled print headers. |

---

## Phase 6 — Later (only after the core is connected)

- Yield library: suggest recipe yields from actual smoking, preservation and prep runs.
- Price-change digest on Today: "Butter +12% moved 6 dishes; 2 are now over target."
- Guest dietary counts on plans, checked against each dish's allergens.
- Link Cook ↔ User and add a wage band, so scheduled labor can appear in Monthly Tracker.
- Show banquet and festival load in the Schedule header.
- POS sales import. ❓ Jeff: which POS does Foxtown use?
- Move invoice and smoking files out of the database into object storage.
- Store money as integer cents in new columns. Migrate old columns only with reconciliation tests.

**Not planned:** chat assistant, auto-ordering to vendors, recipe marketplace, multi-tenant SaaS.

---

## Open decisions for Jeff

1. Is the Cook view and team rollout still deferred? (Affects 2.6, 2.7, 4.7 and 4.10.)
2. Inventory and Order Guides: retire or revive? (3.6)
3. Events: merge into Custom Menus, or keep as a light type? (4.4)
4. Do the Break Room games stay in this app?
5. Does Cleanup stay in the top-level sidebar?
6. Upgrade the server size? (1.7)
7. Which POS system, if any?

## Change log

- **2026-11-28** — CI found two more app bugs (older-browser invoice reading, sidebar Escape); both fixed.
- **2026-11-28** — 1.1 started: CI workflow, 4 browser tests repaired, 2 app bugs fixed; 1.8 added for the remaining stale suites.
- **2026-11-28** — Created from three audits. Retired: old `ROADMAP.md`, `docs/agent-execution-roadmap.md`, `docs/agent-execution-progress.md`, `docs/soigne-roadmap.md`, `docs/app-improvements-roadmap.md`, `docs/enterprise-experience-review.md`, `docs/print-redesign-plan.md`.
