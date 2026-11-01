# Mise — Culinary Operations Platform

A single operational hub for multi-venue culinary teams: standardized **recipes & builds** with live costing, per-venue **inventory** with par levels, vendor **order guides** that compute what to buy, and **event planning** with auto-generated prep and shopping lists.

Built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL. Role-based login (Admin / Manager / Staff) is included.

---

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | Morning Pulse: in-use ingredient integrity, seven-day event/banquet load, admin closeout queue, and active-menu margin exceptions for your venue. |
| **Recipes & Builds** | Standardized recipes with ingredients, method, yield, menu price → automatic **batch cost, cost per yield unit, and food-cost %** (color-coded against targets). |
| **Ingredients** | Shared ingredient list with allergen tags, unit cost, pack size, category, and vendor. Recipes inherit allergens and costing from here. |
| **Inventory** | Per-venue on-hand counts vs. par levels, low-stock highlighting, and inventory value. |
| **Order Guides** | Per-venue / per-vendor order sheets. Computes **order quantity = par − on-hand** and an estimated order total. Print-friendly. |
| **Events** | Plan events with a menu of recipes scaled to servings. Rolls up estimated food cost and a single **aggregated prep & shopping list** across all dishes. Print-friendly. |
| **Festivals** | Forecast sales from attendance and menu mix, scale recipes and nested sub-recipes, build prep/order guides, and produce a live **proposal P&L** with labor, fees, event expenses, break-even revenue, and target-margin pricing. |
| **Banquets** | Transcribe a **Banquet Event Order (BEO)**: the header (contact, service window, room, special instructions, setup) plus food lines that link each recipe to its **ordered count**. Every dish scales by the ordered amount into one **aggregated prep / pull sheet** (sub-recipes exploded to raw items, summed by category), with a printable kitchen prep sheet. Customer pricing & beverage/additional charges are out of scope — this is the kitchen side of the BEO. |
| **Prep Orders** | Shared Daily Prep for chef ordering and printing; an admin-only daily worksheet for actuals, ingredient deductions, closeout, and CSV/Excel accounting exports. |
| **Vendors / Venues / Users** | Manage suppliers, locations, and team access. |
| **Break Room · Homestead** | A personal Willowbrook Acre garden with crops, landmark restorations and six animal friends. Available to every signed-in role, with account autosaves and JSON backup/import. |

See the [kitchen and accounting guide](docs/prep-orders-guide.md) and [migration / rollout checklist](docs/prep-orders-rollout.md).

See [ROADMAP.md](ROADMAP.md) for the commercial product direction and implementation checklist. Chunks 1–4 are implemented. Chunk 4 is limited to QR project start/finish logging and admin review; Chunk 5 (inline editing and inspector drawers) is next.

Use **⌘K / Ctrl+K** to search recipes/ingredients or run actions: print this week’s banquet packet, download week-to-date prep accounting (Sunday through today), open daily closeout/prep, review duplicate ingredients, or create a recipe. Actions follow existing role permissions; closeout and accounting are admin-only.

### Roles
- **Staff** — view everything, take inventory counts.
- **Manager** — all of the above plus manage recipes, ingredients, vendors, order guides, events, and venues.
- **Admin** — full access including user management.

The **active venue** selector in the header scopes the Inventory and Order Guide views; recipes and ingredients are shared company-wide.

---

## Quick start

### Option A — one command (local Postgres)
Requires Node 18+ and the PostgreSQL server binaries installed.

```bash
npm install
./scripts/dev-setup.sh   # boots Postgres, writes .env, applies schema, seeds demo data
npm run dev
```

Open http://localhost:3000 and sign in:

| Email | Role | Password |
| --- | --- | --- |
| admin@culinaryops.test | Admin | password123 |
| manager@culinaryops.test | Manager | password123 |
| cook@culinaryops.test | Staff | password123 |

### Option B — bring your own database (e.g. Neon, Supabase, RDS)
```bash
npm install
cp .env.example .env        # paste your DATABASE_URL and set AUTH_SECRET
npx prisma migrate deploy  # create tables and audit-protection triggers (empty DB only)
npm run db:seed             # optional demo data
npm run dev
```

Generate an auth secret with `openssl rand -hex 32`.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` / `npm start` | Production build / serve. |
| `npm run db:push` | Sync the Prisma schema to the database. |
| `npm run db:seed` | Load demo venues, catalog, recipes, inventory, guides, and events. |
| `npm run db:studio` | Open Prisma Studio to browse data. |

---

## Tech stack
- **Next.js 16** (App Router, Server Actions) + **React 19**
- **TypeScript** end to end
- **Prisma 6** ORM on **PostgreSQL**
- **Auth.js (NextAuth v5)** credentials login with JWT sessions and roles
- **Tailwind CSS v4**

## Project structure
```
app/
  login/                 Auth screen + sign-in action
  (app)/                 Authenticated shell (sidebar, venue switcher)
    page.tsx             Dashboard
    recipes/             List, detail, costing, actions
    items/               Ingredients
    inventory/           Per-venue stock
    order-guides/        Order sheets (list + detail + print)
    events/              Event planning (list + detail + prep list)
    banquets/            Banquets — BEO entry (list + detail + printable prep sheet)
    prep-orders/         Prep orders (entry, cook packet, back-entry, report + CSV)
    vendors/ venues/     Supplier & location management
    admin/users/         User & role management (admin)
lib/                     prisma client, session/RBAC, costing, venue context
components/              UI primitives, sidebar, venue switcher
prisma/                  schema.prisma + seed.ts
scripts/dev-setup.sh     Local Postgres bootstrap
```

## Costing model
`line cost = converted quantity × item.unitCost`, summed per recipe. Recipe quantities convert automatically between units in the same family (`lib/units.ts`) — volume (tsp, tbsp, fl oz, cup, pt, qt, gal, mL, L) and weight (g, kg, oz, lb) — so an item costed per `gal` can be used by the `tbsp` in a recipe. When units aren't convertible (e.g. `cup` of an item costed per `lb`), costing falls back to the legacy same-unit assumption and the recipe page flags the line with a *unit mismatch* badge.

## Printable recipe cards

Managers tag allergens when adding or editing an ingredient in **Ingredients** (`/items`, the existing address). Tags automatically flow through all recipes and nested sub-recipes into recipe details and printed allergen profiles. Existing manual recipe tags remain additive. New frozen prep packets capture ingredient tags; historical reprints retain their original captured values. Untagged ingredients display “None recorded”; tags are not inferred from ingredient names.

Ingredients have full editors at `/items/[id]`, including vendor codes, structured packs, usable yield, allergen tags, and recipe/stock/order-guide usage. The list searches across ingredient names, vendors, SKU and GCODE, with duplicate and unused filters. **Review duplicates** opens `/items/cleanup`; suggestions match reordered names, punctuation, and common plurals without deciding product equivalence. The comparison previews affected recipes and unit conversions. Recipe-only replacement preserves the old record and other usage; confirmed duplicate consolidation combines compatible recipe quantities/prep notes, unions allergen tags, and removes the old record only when no stock/order-guide/festival references remain. Stale reviews and ambiguous measurements are rejected atomically. Historical packets/accounting snapshots remain unchanged.

Recipe ingredient rows support editing quantity, unit, prep note, or ingredient directly. Ingredient searches include vendor and product codes, show the selected product’s metadata and allergens, and link to its full editor. Already-used ingredients are omitted from the add picker to prevent accidental overwrites.

Every recipe has a kitchen-facing print view at `/recipes/[id]/print`: ingredients grouped by their saved catalog categories, numbered method steps, allergen banner, critical food-safety (HACCP) box, and storage & shelf-life instructions. Choose **Print with Costing** on the recipe or **With costing** in the print toolbar (`?costs=1`) to include ingredient and sub-recipe unit costs, line costs, subtotals, total batch cost, cost per yield unit, and menu price/food cost % when available. The regular **Kitchen copy** omits costs. Quantities, yield, and batch costs scale together through the floating print toolbar (0.5×, 1×, 2×, 3×, 4×, or a custom positive multiplier up to 100×); unit costs remain fixed. Recipe details, the catalog, and costing prints label rates using the saved yield unit (for example, $4.69 for 5 lb is $0.938/lb). A standard print header identifies the venue, document, target/reference, Chicago timestamp, paper orientation, and page numbering. Nonstandard batches carry a bold scaled-production warning. Toolbar controls are hidden on paper.

All seven recipe/prep/banquet/menu/schedule/to-go print routes share **Standard / 1-Page Squeeze** controls. Squeeze tightens typeset spacing while handwritten fields remain at least 28px tall; long documents can still span multiple pages. Gray zebra rows, explicit checkboxes, repeated table headings, and protected rows/steps improve clipboard use. The schedule keeps US Letter landscape; other packets use portrait.

Prep packet multipliers affect only the print copy: ingredient demand, nested recipes/references, shopping quantities, destination targets, and planned accountability/cooling quantities scale together. Saved orders, frozen contents, lot identities, and historical accounting remain unchanged. A packet’s 1× setting means its original requested production; each recipe card still shows its own batch factor.

Method cues highlight stated techniques, durations, temperatures, and endpoints with small icons and muted colors. Each step shows up to four cues, prioritizing numeric instructions and preserving qualifiers such as “at least” or “within.” Cues are extracted from saved method text and do not add cooking targets or change the recipe.

Banquet and commissary cook packets keep immediate sub-recipes beside the main recipe, labeled with their parent and quantity needed. Deeper recipes print once in a numbered reference section at the back, with total demand across the packet and links from the component lines. Ingredients, methods, allergens, and critical notes remain available; prepared components can be pulled from stock. Commissary references use the frozen packet recipes and preserve links to separately printed lots.

Banquets also have a saved **Setup & vessel pull** sheet: arrange BEO food lines
and manual garnishes into stations, enter vessels and utensils by piece, and
list shared equipment once per station. Staff can verify the consolidated pull
checklist; quantity or allocation changes clear affected checks. Saved sheets
print alone or at the front of individual and weekly cook packets. Apply
`20261020000000_banquet_setup` before release. See the
[setup and packing guide](docs/banquet-setup.md).

## Prep Orders

`/prep-orders` opens **Daily Prep**: chefs order for their assigned venue and view the shared recipe totals and destination quantities. Managers/admins generate frozen prep sheets; all signed-in chefs can view and reprint them.

Admins use **Closeout** for one daily worksheet populated from the orders: enter made/sent quantities, cook and notes; add venue-supplied ingredient deductions; preview charges; save each item; then finish the day and export accounting. Recipe labor standards apply automatically, and missing costs remain explicitly pending. Ingredient deductions reduce only the supplying venue’s food charge, with labor unchanged.

Printed prep and banquet projects now have **Scan to start / finish** codes. Cooks/managers sign in on a phone, start the project timer, then finish with actual yield, shift/quality notes, and labeling/dating confirmation. The timer persists across reloads. Admins review the recorded start/finish times and yields in **Review project logs**; pending prep jobs must be reviewed before production is confirmed or the day is finished. Admin yield corrections preserve the cook’s original entry. An explicit **Use reviewed cook result** action can copy a matching prep result into the worksheet; destination quantities and labor still require confirmation. Elapsed time includes unattended cooking/waiting and is separate from accounting person-minutes. Banquet job logs create no prep transfer charges.

See the [project logging guide](docs/production-project-logs.md) for the workflow, deployment migration, and public QR address setting.

Accounting starts with venue totals and separates ready charges from pending costs. Excel and CSV include supporting ingredient, labor, supply and production notes. Saved results use linked corrections and returns; historical records and immutable exports remain unchanged. Acumatica remains authoritative, with no automatic posting or email. No finished-stock balance is maintained.

See the [daily prep and closeout guide](docs/prep-orders-guide.md) for the workflow and bacon-credit example.

## Deployment

Fonts are bundled in [`app/fonts`](app/fonts/README.md) and loaded with `next/font/local`. Production builds do not fetch Google Fonts, avoiding intermittent upstream font URL parsing failures.

Homestead adds the independent `HomesteadSave` table in `20261019000000_homestead_saves`. The existing `npm start` migration step applies it before serving `/homestead`. Saves are scoped to the authenticated user; optimistic revisions reject stale writes from other sessions. Garden resources never affect operational inventory, recipes, or accounting. See [the Homestead guide](docs/homestead.md) for gameplay, recovery and verification.

Ingredient allergen tagging adds the nullable `Item.allergens` column in `20261016000000_ingredient_allergens`. Apply the migration with `prisma migrate deploy` before releasing this application version. Existing ingredients remain untagged until reviewed; existing recipe allergen selections are preserved.

Production startup (`npm start`) applies committed migrations with `prisma migrate deploy` before starting Next.js. If a migration fails, the web server does not start. The build generates Prisma Client but does not change the database. Keep the hosting service's run command set to `npm start`; launching `next start` directly bypasses the migration step. Operators can also apply migrations with `npm run db:deploy` from the deployed component's console.

Follow the [migration and rollout checklist](docs/prep-orders-rollout.md): back up and rehearse on a restored database, verify the existing schema before marking its baseline applied, pause old application writes, apply the reviewed migrations with `prisma migrate deploy`, and release the new application. **Do not use `db push` for this release**; it omits the PostgreSQL audit-protection triggers.

Existing databases must have a verified migration baseline before automated startup migrations can run. Existing tables and historical values are preserved. Old application code cannot safely run over new manual transfers with nullable batch links, so coordinate that initial cutover rather than running both writers concurrently. Configure `DATABASE_URL` and `AUTH_SECRET` in the hosting environment.

### Migrating from the legacy foxtownhq app
Replacing an existing foxtownhq deployment and want to keep its recipes, items,
venues, and users? See **[MIGRATION.md](./MIGRATION.md)** for the full cutover
runbook. The data migration is automated (`npm run db:migrate-legacy`), reads the
old database read-only, and leaves it intact as your backup.

## Roadmap ideas
- Sub-recipes (a build used as an ingredient in another build).
- Density-based volume↔weight conversion per item (e.g. cups of flour from an item costed per lb).
- Inventory count sessions with history and variance reporting.
- Convert an order guide into a placed order + receiving workflow.
- Per-venue recipe availability and pricing.
- CSV import/export and vendor catalog sync.
- Photo uploads for recipes.

### Prep workflow verification

`npm test` runs the unit checks; `npm run test:transactions` starts a disposable PostgreSQL database and exercises production, deductions, closeout, and immutable exports. It does not use the application database.

For the functional browser check, build first, then run `PREP_BROWSER_SMOKE=1 npm run test:transactions` and, in another terminal, `node scripts/test-prep-browser.mjs`. The harness serves disposable fixtures on `http://localhost:3107` and removes its database on exit. The browser check requires Playwright; `PREP_PLAYWRIGHT_MODULE` can point to a bundled module and `PREP_BROWSER_EXECUTABLE` to an existing Chromium executable. Stop the harness after testing. This check verifies ordering, access controls, credits, unsaved entries, closeout, and downloads without a visual-review loop.

Against the same disposable harness, `node scripts/test-ingredient-allergens-browser.mjs` checks ingredient tag creation/clearing, nested recipe inheritance, manual recipe selections, printed profiles, and staff read-only access. Set `INGREDIENT_REVIEW_DIR` to save UI screenshots.

`node scripts/test-ingredient-cleanup-browser.mjs` uses the same harness to verify full ingredient edits, recipe-line edits, reviewed duplicate consolidation, compatible quantity conversion, retained notes and manager-only access.

`node scripts/test-recipe-costing-browser.mjs` uses the disposable harness to check costing prints, kitchen-copy toggles, nested sub-recipe costs, 2×/4× batches, and yield-unit labels with gram precision. It changes only disposable fixture yields and writes review screenshots/PDFs to `/tmp/recipe-costing-review` (override with `RECIPE_REVIEW_DIR`).

`MORNING_PULSE_BROWSER_SMOKE=1 PREP_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` adds disposable dashboard fixtures and verifies venue/date/status filtering, ingredient integrity, nested menu margins, closeout boundaries, role-based actions, keyboard navigation, recipe creation, XLSX downloads/errors, one-time printing, and mobile layout. Use the same Playwright module/executable overrides described above. Review screenshots and the weekly packet PDF are saved to `/tmp/morning-pulse-review` (override with `PULSE_REVIEW_DIR`).

`PRINT_CONTROLLER_BROWSER_SMOKE=1 PREP_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` adds disposable print fixtures and checks all seven routes, fractional/custom scaling, fixed costing rates, frozen-data preservation, density/options retention, handwritten-cell heights, repeated auto-print, mobile controls, and the existing recipe-costing regressions. Use the same Playwright overrides described above. PDFs/screenshots are saved to `/tmp/clipboard-print-review` (override with `PRINT_REVIEW_DIR`); costing regression artifacts retain their separate review folder.

`PRODUCTION_JOBS_BROWSER_SMOKE=1 PREP_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` checks project QR decoding, mobile sign-in return, interrupted start recovery, timer persistence, completion validation, role-based review, worksheet prefill, and unchanged frozen/ledger data. It uses disposable fixtures and the same Playwright overrides described above. Screenshots and two QR print samples are saved to `/tmp/production-job-review` (override with `JOB_REVIEW_DIR`).
