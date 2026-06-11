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

---

## Deployment
Designed to deploy cleanly to **Vercel** with a hosted Postgres (Neon, Supabase, or RDS):

1. Push this repo to GitHub and import it in Vercel.
2. Set env vars `DATABASE_URL` and `AUTH_SECRET`.
3. Vercel runs `prisma generate` via the `postinstall` hook; run `npm run db:push` once against your database to create tables.

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
