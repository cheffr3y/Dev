# Mise — Culinary Operations Platform

A single operational hub for multi-venue culinary teams: standardized **recipes & builds** with live costing, per-venue **inventory** with par levels, vendor **order guides** that compute what to buy, and **event planning** with auto-generated prep and shopping lists.

Built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL. Role-based login (Admin / Manager / Staff) is included.

---

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | At-a-glance counts, low-stock alerts for your active venue, and upcoming events. |
| **Recipes & Builds** | Standardized recipes with ingredients, method, yield, menu price → automatic **plate cost, cost/serving, and food-cost %** (color-coded against targets). |
| **Catalog** | Master list of purchasable items with unit cost, pack size, category, and vendor. Costing everywhere flows from here. |
| **Inventory** | Per-venue on-hand counts vs. par levels, low-stock highlighting, and inventory value. |
| **Order Guides** | Per-venue / per-vendor order sheets. Computes **order quantity = par − on-hand** and an estimated order total. Print-friendly. |
| **Events** | Plan events with a menu of recipes scaled to servings. Rolls up estimated food cost and a single **aggregated prep & shopping list** across all dishes. Print-friendly. |
| **Festivals** | Forecast sales from attendance and menu mix, scale recipes and nested sub-recipes, build prep/order guides, and produce a live **proposal P&L** with labor, fees, event expenses, break-even revenue, and target-margin pricing. |
| **Banquets** | Transcribe a **Banquet Event Order (BEO)**: the header (contact, service window, room, special instructions, setup) plus food lines that link each recipe to its **ordered count**. Every dish scales by the ordered amount into one **aggregated prep / pull sheet** (sub-recipes exploded to raw items, summed by category), with a printable kitchen prep sheet. Customer pricing & beverage/additional charges are out of scope — this is the kitchen side of the BEO. |
| **Prep Orders** | Commissary production ledger: a chef requests recipes per destination venue for a date → printable **lot-stamped cook packet** → **back-entry** of actuals (made-by / entered-by / status) → a **cost-transfer report** with accounting-ready Excel export. |
| **Daily Prep** | An extension of Prep Orders for confirming completed prep, adding items made for stock, recording quick venue pickups, and closing daily labor. |
| **Vendors / Venues / Users** | Manage suppliers, locations, and team access. |

### Roles
- **Staff** — view everything, take inventory counts.
- **Manager** — all of the above plus manage recipes, catalog, vendors, order guides, events, and venues.
- **Admin** — full access including user management.

The **active venue** selector in the header scopes the Inventory and Order Guide views; recipes and the catalog are shared company-wide.

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
npm run db:push             # create tables
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
    items/               Catalog
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
Every recipe has a kitchen-facing print view at `/recipes/[id]/print`: ingredient table, numbered method steps, allergen banner, critical food-safety (HACCP) box, storage & shelf-life instructions, and a prepared/verified sign-off footer. Quantities and yield scale for batches via `?x=N` (×1–×4 in the toolbar). Costs and margins are intentionally omitted from the card.

## Prep orders & production ledger
Commissary production is tracked from request to transfer at `/prep-orders`:

1. **Order entry** — a manager submits recipes for a **target date**, each with a **destination venue** and requested qty/unit. The same recipe added for a second venue becomes a split (combined batch, separate accounting).
2. **Cook packet** (`/prep-orders/[id]/packet`) — printing assigns each batch a frozen **lot** (`MMDD-XXX-N`, where `XXX` is the recipe's auto-generated 3-char production code) and moves lines `REQUESTED → PRINTED`. Each entry is the recipe **scaled** to the combined qty, lot-stamped, with made-date/use-by for hand-written labels and a `⚠` flag on non-clean batch multiples. The system prints **no label** — cooks hand-copy the lot, so the production code bans the ambiguous characters **O/I/L**.
3. **Back-entry** (`/prep-orders/[id]/back-entry`) — every printed line is pre-loaded with the requested qty as the default actual; a person confirms or corrects qty, made-by, status (`MADE` / `SHORT` / `NOT_MADE`) and notes in one save. `entered-by` is recorded automatically and kept distinct from made-by. Mise cost is **frozen** at this moment (`unitCostSnapshot`, `allocatedCost`) and never recomputed against the live catalog.
4. **Daily prep extension** (`/prep-orders/daily`) — completed prep lots appear as confirmable defaults. Two compact actions cover items made for commissary stock and unplanned venue pickups without requiring a prep request. Labor closeout, waste/returns, and venue-supplied exceptions stay collapsed until needed.
5. **Cost-transfer report** (`/prep-orders/report`) — uses finalized or open transfer records by **transfer date**, not request/production date. Excel includes venue summary, stable-ID transfer detail, frozen GCODE ingredient support, separate production/dishwasher labor, issues/corrections, and a compatibility sheet for historical completed prep that was deliberately not fabricated into the new ledger. Export inclusion is audited; export does not mean posted. Acumatica remains authoritative and Mise never posts or emails entries automatically.

Raw-ingredient inventory depletion, non-linear scaling, and programmatic Acumatica push are intentionally out of scope — Acumatica owns raw inventory and authoritative costing.

### Production ledger rollout

The schema changes are additive: nullable links are added to historical prep rows and new finished-stock/transfer tables are created. Existing completed prep is not backfilled, so historical labor is not invented and historical production is not charged again. Before rollout, take the normal database backup, then run `npm run db:push`; Prisma will stop rather than accept a destructive data-loss warning. No live database is changed by this repository update.

Configure each recipe's **Production person-minutes** as the standard hands-on estimate for one recipe yield. The production wage default preserves the exact average of $22, $20, and $20 ($20.666666…/hr, displayed as $20.67); dishwasher labor defaults to $18/hr. Both can be overridden for a batch/day and are frozen on finalization. The app's existing UTC-midnight calendar-date convention is used consistently for production and transfer business dates.

---

## Deployment
Designed to deploy cleanly to **Vercel** with a hosted Postgres (Neon, Supabase, or RDS):

1. Push this repo to GitHub and import it in Vercel.
2. Set env vars `DATABASE_URL` and `AUTH_SECRET`.
3. The `postinstall` hook generates Prisma Client. Apply schema changes explicitly with `npm run db:push` before deploying a release that changes `prisma/schema.prisma`. Database synchronization is intentionally not part of `npm start`, so a temporary database connection shortage cannot prevent the web process from starting.

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
