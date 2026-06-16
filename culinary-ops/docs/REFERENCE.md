# Mise — Reference Guide

A single operational hub for multi-venue culinary teams. This document is the
"everything in one place" reference: what the app is, the stack, the data
model, every module, the core business logic, auth/roles, and how to run and
deploy it.

---

## 1. What this app is

**Mise** (internal package name `culinary-ops`) is a web platform that
standardizes back-of-house operations across multiple restaurant/venue
locations. It replaces a legacy app called **foxtownhq**.

It answers four operational questions for a culinary group:

1. **What do we make, and what does it cost?** — Standardized recipes/builds
   with live plate costing and food-cost %.
2. **What do we have, and what do we need to buy?** — Per-venue inventory vs.
   par levels and vendor order guides that compute order quantities.
3. **What are we cooking for upcoming events?** — Event planning that scales
   recipes to guest counts and rolls up an aggregated prep & shopping list.
4. **What did the commissary actually produce, and who gets billed?** — A prep
   order / production ledger from request → lot-stamped cook packet →
   back-entry of actuals → a cost-transfer report for accounting.

### Scope boundary (important design decision)
Mise owns **production truth and transfer quantities**. It deliberately does
**not** own raw-ingredient inventory depletion or authoritative costing —
**Acumatica** does. Mise's cost columns are clearly labeled non-authoritative;
quantity is the contract, and accounting applies Acumatica pricing.

---

## 2. Tech stack

| Layer | Technology |
| --- | --- |
| Framework | **Next.js 16** (App Router, Server Actions, Server Components) |
| UI runtime | **React 19** |
| Language | **TypeScript** end to end |
| ORM | **Prisma 6** (`@prisma/client`) |
| Database | **PostgreSQL** (`pg` driver) |
| Auth | **Auth.js / NextAuth v5 (beta)** — credentials provider, JWT sessions |
| Password hashing | **bcryptjs** |
| Validation | **Zod 4** |
| Styling | **Tailwind CSS v4** (via `@tailwindcss/postcss`) |
| Fonts | Playfair Display (serif/display) + Inter (sans) via `next/font` |
| Tooling | ESLint 9 (`eslint-config-next`), `tsx` for scripts |
| Deploy targets | Vercel **or** DigitalOcean App Platform (`.do/app.yaml`) |

> ⚠️ **Next.js 16 caveat** (`AGENTS.md`): this version has breaking changes vs.
> older Next. Consult `node_modules/next/dist/docs/` before writing routing,
> data-fetching, or config code — don't assume older conventions.

### npm scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server (`localhost:3000`). |
| `npm run build` / `npm start` | Production build / serve. |
| `npm run lint` | ESLint. |
| `npm run db:push` | Sync Prisma schema to the database. |
| `npm run db:seed` | Load demo venues, catalog, recipes, inventory, guides, events. |
| `npm run db:migrate-legacy` | One-time read-only import from the legacy foxtownhq DB. |
| `npm run db:studio` | Open Prisma Studio. |
| `postinstall` | Runs `prisma generate` automatically. |

---

## 3. Project structure

```
culinary-ops/
  app/
    layout.tsx                Root layout (fonts, metadata)
    globals.css               Tailwind v4 theme + "French Laundry" design tokens
    login/                    Auth screen + sign-in server action
    api/auth/[...nextauth]/   NextAuth route handler
    (app)/                    Authenticated shell (sidebar, command search, sign-out)
      layout.tsx              Requires a user; loads recipe/item search index
      page.tsx                Dashboard
      error.tsx               Route-segment error boundary
      recipes/                List, detail, costing, print card, actions
      items/                  Catalog
      inventory/              Per-venue stock counts
      order-guides/           Order sheets (list + detail + print)
      events/                 Event planning (list + detail + prep list)
      prep-orders/            Production ledger (entry, packet, back-entry, report + CSV)
      vendors/  venues/       Supplier & location management
      admin/users/            User & role management (admin)
  lib/                        prisma client, session/RBAC, costing, units, prep, venue ctx
  components/                 Sidebar, CommandSearch, editors, UI primitives
  prisma/                     schema.prisma + seed.ts
  scripts/                    dev-setup.sh, migrate-from-foxtownhq.ts, backfill-prep-prodcodes.ts
  types/                      next-auth.d.ts (session type augmentation)
  auth.ts / auth.config.ts    NextAuth setup (Node + edge-safe split)
  proxy.ts                    NextAuth middleware (route protection)
  .do/app.yaml                DigitalOcean App Platform spec
```

### Routing conventions
- `app/(app)/` is a **route group** — the parentheses mean it adds a shared
  authenticated layout without adding a URL segment. Everything inside requires
  a logged-in user (`requireUser()` in its `layout.tsx`).
- Each module folder pairs `page.tsx` (Server Component) with `actions.ts`
  (Server Actions for mutations). Dynamic routes use `[id]`.
- `proxy.ts` is the NextAuth middleware that gates all routes except the auth
  API and static assets.

---

## 4. Data model (Prisma / PostgreSQL)

One **catalog of Items + Recipes shared company-wide**, with **Inventory,
Order Guides, and Events scoped per Venue**, plus a **prep-order production
ledger**.

### Enums
- `Role` — `ADMIN | MANAGER | STAFF`
- `EventStatus` — `PLANNED | CONFIRMED | COMPLETED | CANCELLED`
- `PrepLineStatus` — `REQUESTED | PRINTED | IN_PROGRESS | MADE | SHORT | NOT_MADE`

### Core entities
| Model | Purpose / key fields |
| --- | --- |
| **User** | Login identity. `email`, `passwordHash`, `role`, optional `homeVenueId`. Relates to prep orders, plus made-by / entered-by prep lines. |
| **Venue** | A location. `name`, unique `code` (e.g. "DT", "WH"). Owns inventory, order guides, events, and prep-line destinations. |
| **Vendor** | A supplier. Owns catalog items and order guides. |
| **Item** | Master catalog / purchasable product. `unit` (purchase/count unit), `unitCost` (per unit), `packSize`, `category`, `sku`, optional vendor. **All costing flows from here.** |
| **Recipe** | A recipe/build, shared across venues. `yieldQty`/`yieldUnit`, optional `menuPrice`, `instructions`, plus production identity (`prodCode`, `holdLifeDays`) and recipe-card/food-safety fields (`prepMinutes`, `cookMinutes`, `shelfLife`, `storage`, `allergens`, `criticalNotes`). |
| **RecipeItem** | Join: an ingredient line on a recipe. `quantity` + `unit` (in the recipe's unit), unique per (recipe, item). |
| **RecipeComponent** | Sub-recipe link: a recipe built from other recipes. `quantity`/`unit` in the child's yield unit. Child delete is `Restrict`; cycles guarded in costing. |
| **RecipeChange** | Auto-recorded changelog entry per recipe edit (summary, field-level detail, editor name snapshot). |
| **InventoryItem** | Per-venue stock: `quantity`, `par`, `unit`. Unique per (venue, item). |
| **OrderGuide** / **OrderGuideLine** | A vendor order sheet for a venue; lines carry `par`, `unit`, `sortOrder`. |
| **Event** / **EventMenuItem** | An event at a venue with `date`, `guestCount`, `status`; menu items are recipes with `plannedServings`. |
| **PrepOrder** | Header: one chef's submission for one production `forDate`. |
| **PrepOrderLine** | The spine of the ledger — one requested recipe → one destination venue. Carries requested vs. actual qty/unit, `status`, frozen `lot`, made-by/entered-by + timestamps, and **frozen cost snapshots** (`unitCostSnapshot`, `allocatedCost`). |

### Key relational rules
- Deleting an Item is `Restrict` where it's referenced by recipes/order
  guides (can't orphan costing) but `Cascade` for inventory.
- Recipe → RecipeItem/Component/Change cascade on recipe delete.
- Prep cost snapshots are **frozen at production time and never recomputed**
  against the live catalog.

---

## 5. Core business logic (`lib/`)

### Costing (`lib/costing.ts`)
- **Line cost** = converted quantity × `item.unitCost`. Quantities are
  converted from the recipe's unit into the item's purchase unit.
- **Sub-recipes**: `buildCostMap()` computes a fully-loaded cost per recipe
  (ingredients + nested sub-recipes), memoized, with **cycle guarding** (a
  recipe in its own dependency chain contributes 0).
- **Cost/serving** = total cost ÷ yieldQty.
- **Food cost %** = cost-per-serving ÷ menuPrice × 100 (null when no price).
- Formatting helpers: `money()`, `pct()`, `num()`.

### Units (`lib/units.ts`)
- Three families: **volume**, **weight**, **count**. Conversions happen within
  a family using base units (volume = fl oz, weight = oz, count = each).
- Rich alias table (`tbs`/`tbl`→tbsp, `#`/`lbs`→lb, `c`→cup, etc.) plus naive
  singularization ("cups"→"cup").
- `convertQty()` returns `null` across families (e.g. *cups of something
  bought by the lb*). Costing then falls back to a same-unit multiply and the
  UI flags a **unit mismatch** badge. Identical unit strings are a no-op pass
  (so free-text units like "case" round-trip).
- `UNIT_OPTIONS` drives grouped unit dropdowns.

### Prep / production ledger (`lib/prep.ts`)
- **Status metadata** — labels, badge colors, `isOpenStatus()`,
  `BACK_ENTRY_STATUSES`.
- **Production code** (`Recipe.prodCode`) — a 3-char auto-generated code
  derived from the recipe name. **Bans O/I/L** (ambiguous when hand-copied vs.
  0/1). On collision it walks the allowed alphabet deterministically
  (number-free).
- **Lot numbers** — format `MMDD-XXX-N` (month/day + prodCode + sequence).
  Date parts read in **UTC** (date-only inputs store at UTC midnight).
  `nextLotSeq()` increments only when the same recipe is produced twice in a
  day.
- **Cost snapshot** (`lineCostSnapshot`) — freezes `unitCostSnapshot` (recipe
  cost ÷ yield) and `allocatedCost` (× produced qty, unit-converted), flagging
  non-convertible fallbacks.
- **`batchScaleFlag()`** — flags requested batches that aren't a clean whole/
  half multiple of base yield (v1 scaling is linear only).

### Session & RBAC (`lib/session.ts`)
- `getCurrentUser()` / `requireUser()` (redirects to `/login`).
- Role rank: `STAFF=1 < MANAGER=2 < ADMIN=3`. `hasRole()` /
  `requireRole(min)` enforce minimums (redirect to `/` if insufficient).

### Venue context (`lib/venue.ts`)
- Active venue resolved from the `activeVenue` cookie → user's home venue →
  first venue. Scopes inventory and order-guide views; recipes/catalog are
  company-wide.

### Other libs
- `lib/prisma.ts` — singleton PrismaClient (HMR-safe global in dev).
- `lib/event-status.ts` — event status labels + badge colors.
- `lib/auth-actions.ts` — sign-out server action.

---

## 6. Authentication & authorization

- **NextAuth v5** with a **Credentials** provider. `authorize()` looks up the
  user by lowercased email and `bcrypt.compare`s the password.
- **JWT session strategy** — `role` and `homeVenueId` are stored in the token
  (`jwt` callback) and surfaced on `session.user` (`session` callback).
- **Split config**: `auth.config.ts` is **edge-safe** (no DB/bcrypt) and shared
  by the middleware (`proxy.ts`); `auth.ts` adds the Node-runtime credentials
  provider. The `authorized` callback redirects logged-in users away from
  `/login` and gates everything else.
- Session types are augmented in `types/next-auth.d.ts`.

### Roles
| Role | Capabilities |
| --- | --- |
| **Staff** | View everything; take inventory counts. |
| **Manager** | All Staff + manage recipes, catalog, vendors, order guides, events, venues. |
| **Admin** | All Manager + user management. |

Sidebar reflects this: the **Admin** section (Venues, Users) shows for
Manager (Venues only) and Admin (both).

---

## 7. Modules / navigation

Sidebar is grouped into **Operations**, **Supply**, and **Admin**:

**Operations**
- **Dashboard** (`/`) — counts, low-stock alerts for the active venue, upcoming events.
- **Recipes & Builds** (`/recipes`) — costing, sub-recipes, changelog, printable card.
- **Events** (`/events`) — scale recipes to servings, aggregated prep/shopping list.
- **Prep Orders** (`/prep-orders`) — production ledger (see §8).

**Supply**
- **Inventory** (`/inventory`) — per-venue on-hand vs. par.
- **Order Guides** (`/order-guides`) — order qty = par − on-hand, est. total, print.
- **Catalog** (`/items`) — master purchasable items + unit costs.
- **Vendors** (`/vendors`) — suppliers.

**Admin**
- **Venues** (`/venues`) — locations (Manager+).
- **Users** (`/admin/users`) — accounts & roles (Admin only).

### Printable recipe cards
Every recipe has a kitchen card at `/recipes/[id]/print`: ingredient table,
numbered method, allergen banner, HACCP critical box, storage/shelf-life, and a
prepared/verified sign-off footer. Batch scaling via `?x=N` (×1–×4). Costs are
intentionally omitted from the card.

---

## 8. Prep orders & production ledger (the flagship workflow)

Tracked from request to transfer at `/prep-orders`:

1. **Order entry** — a manager submits recipes for a **target date**, each with
   a **destination venue** and requested qty/unit. The same recipe for a second
   venue becomes a split (combined batch, separate accounting → two
   `PrepOrderLine`s on the same recipe).
2. **Cook packet** (`/prep-orders/[id]/packet`) — printing freezes a **lot**
   (`MMDD-XXX-N`) per batch and moves lines `REQUESTED → PRINTED`. Each entry is
   the recipe **scaled** to combined qty, lot-stamped, with made-date/use-by for
   hand-written labels and a `⚠` flag on non-clean batch multiples. The system
   prints **no label** — cooks hand-copy the lot (hence the O/I/L ban).
3. **Back-entry** (`/prep-orders/[id]/back-entry`) — each printed line is
   pre-loaded with requested qty as the default actual; a person confirms/
   corrects qty, made-by, status (`MADE`/`SHORT`/`NOT_MADE`) and notes in one
   save. `entered-by` is recorded automatically and kept distinct from made-by.
   Mise cost is **frozen** here (`unitCostSnapshot`, `allocatedCost`).
4. **Cost-transfer report** (`/prep-orders/report`) — groups produced quantity
   by destination venue → item over a date range, with a clearly-labeled
   **non-authoritative** Mise cost column and CSV/print export
   (`report/export/route.ts`). A yield-insight panel surfaces requested-vs-
   actual deltas to flag recipes whose stated yield is off.

**Out of scope (by design):** raw-ingredient inventory depletion, non-linear
scaling, and programmatic Acumatica push. Acumatica owns raw inventory and
authoritative costing.

---

## 9. Design system

"The French Laundry" aesthetic — minimalist, gallery-like (`app/globals.css`,
Tailwind v4 `@theme`):
- **Type pairing**: Playfair Display (serif) for titles & summary numbers;
  Inter (sans) for tables, labels, nav. `--font-mono` is repurposed to Inter.
- **Palette**: cream workspace (`#f9f9f8`), charcoal sidebar (`#1a1a1a`), white
  cards, warm **gold** (`#9c7c50`) and **sage** accents, hairline borders. The
  stock Tailwind zinc/blue/red/amber/emerald ramps are remapped to warm,
  gallery greys so existing utility classes inherit the palette.
- Print styles (`no-print`, `print-full`) hide chrome for kitchen printouts.

UI building blocks live in `components/`: `Sidebar`, `CommandSearch`
(command-palette search over recipes/items), `MethodEditor`, `RecipePicker`,
`PrintButton`, and `ui.tsx` primitives.

---

## 10. Running locally

**Option A — one command (local Postgres).** Requires Node 18+ and Postgres
server binaries:
```bash
npm install
./scripts/dev-setup.sh   # boots Postgres, writes .env, applies schema, seeds demo data
npm run dev
```

**Option B — bring your own database (Neon/Supabase/RDS):**
```bash
npm install
cp .env.example .env     # set DATABASE_URL and AUTH_SECRET
npm run db:push          # create tables
npm run db:seed          # optional demo data
npm run dev
```

Generate a secret with `openssl rand -hex 32`.

### Environment variables
| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `AUTH_SECRET` | Signs auth sessions (`openssl rand -hex 32`). |

### Demo logins (after seeding)
| Email | Role | Password |
| --- | --- | --- |
| admin@culinaryops.test | Admin | password123 |
| manager@culinaryops.test | Manager | password123 |
| cook@culinaryops.test | Staff | password123 |

---

## 11. Deployment

- **Vercel** — import the repo, set `DATABASE_URL` + `AUTH_SECRET`, `prisma
  generate` runs via `postinstall`; run `npm run db:push` once to create tables.
- **DigitalOcean App Platform** — `.do/app.yaml` defines a `web` service from
  the `culinary-ops/` subfolder of repo `cheffr3y/Dev`, branch `main`,
  `deploy_on_push`, build `npm run build`, run `npm start`. Set `DATABASE_URL`
  and `AUTH_SECRET` secrets.

### Migrating from legacy foxtownhq
See `MIGRATION.md`. The migration (`npm run db:migrate-legacy`,
`scripts/migrate-from-foxtownhq.ts`) reads the old DB **read-only**, imports
recipes/items/venues/users into a new `culinary_ops` database, and leaves the
old app and data intact as a backup.

---

## 12. Roadmap ideas
- Density-based volume↔weight conversion per item (e.g. cups of flour from an
  item costed per lb).
- Inventory count sessions with history and variance reporting.
- Convert an order guide into a placed order + receiving workflow.
- Per-venue recipe availability and pricing.
- CSV import/export and vendor catalog sync.
- Photo uploads for recipes.
- Sub-recipes (shipped) — deepening density/scaling support.
