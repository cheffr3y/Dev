# Replacing `foxtownhq` with culinary-ops (preserving the data)

This runbook covers cutting over production from the legacy **foxtownhq** Flask
app to this **culinary-ops** Next.js app, carrying the overlapping data forward
into a fresh database. The legacy database is **never written to** and remains
your complete backup.

> Read this end to end before starting. The data migration is automated and
> safe to re-run; the hosting/DNS cutover is manual and is the only
> irreversible-ish step (mitigated by the rollback section below).

---

## What carries over vs. what doesn't

The two apps have very different data models. This is a **deliberately scoped**
migration — only the entities that exist in both are carried forward.

**Migrated** (`npm run db:migrate-legacy`):

| Legacy (foxtownhq) | New (culinary-ops) | Notes |
| --- | --- | --- |
| `ingredients` | `Item` | `vendor` free-text → synthesized `Vendor` rows; `vendor_code`/`g_code` → `sku` |
| `venues` | `Venue` | a unique `code` is derived from the name (e.g. "Foxtown Brewing" → `FB`) |
| `recipes` | `Recipe` | `equipment`, `critical_steps`, `storage`, `shelf_life`, etc. are folded into `instructions` so nothing is lost |
| `recipe_ingredients` (`type='ingredient'`) | `RecipeItem` | duplicate (recipe, item) lines are merged; quantities summed when units match |
| `users` | `User` | `username` → `email` (synthesized if not already an email); roles mapped; **passwords reset** (see below) |
| `events` / `event_menu_recipes` | `Event` / `EventMenuItem` | best-effort; only if those legacy tables exist and rows have a valid venue |

**NOT migrated** (no equivalent in the new schema — they stay in the old DB):
banquets, buffets, forecasting / Toast sales-mix imports, tap releases,
commissary & outlet orders, menu rollouts, recipe method steps, weighted
options, per-venue recipe availability.

**Passwords cannot be migrated.** The legacy app hashes with Werkzeug
(pbkdf2/scrypt); this app uses bcrypt — they are not interchangeable. Every
migrated user gets a random, unusable hash and must reset their password (or an
admin sets a new one). Usernames that weren't email addresses become
`<username>@foxtownhq.local`.

IDs are preserved (e.g. `rec_…`, `ing_…`, `ven_…`) so the migration is idempotent
and re-running it updates in place rather than duplicating.

---

## Cutover steps

### 0. Back up the legacy database first
From the **foxtownhq** repo, with the legacy `DATABASE_URL` exported:

```bash
./scripts/backup_db.sh    # writes foxtownhq_backup_<timestamp>.sql.gz
```

Keep this file somewhere safe regardless of how the cutover goes.

### 1. Provision a new Postgres database
Create a **brand-new, empty** database for culinary-ops (Neon, Supabase, RDS,
Vercel Postgres, …). Do **not** reuse the legacy database — the schemas are
incompatible. Note its connection string; this becomes `DATABASE_URL`.

### 2. Configure the new app
```bash
cp .env.example .env
# set DATABASE_URL to the new database
# set AUTH_SECRET to: openssl rand -hex 32
```

### 3. Create the schema
```bash
npm install
npm run db:push        # creates the Prisma tables in the new database
```

### 4. Migrate the data
Run the ETL with **both** connection strings. `SOURCE_DATABASE_URL` points at the
legacy prod DB (read-only); `DATABASE_URL` points at the new DB.

```bash
SOURCE_DATABASE_URL="postgres://…legacy-prod…" \
DATABASE_URL="postgres://…new-db…" \
npm run db:migrate-legacy
```

- If the legacy DB requires TLS and its URL doesn't already say `sslmode=require`,
  set `SOURCE_PGSSL=1` as well.
- The script prints a per-table summary plus what it skipped. Review it.
- It is safe to run multiple times (idempotent upserts on preserved IDs).
- **Do not** seed (`npm run db:seed`) on top of a migrated database — the seed
  wipes all tables. Seeding is for fresh demo environments only.

### 5. Create / promote an admin and verify locally
Because passwords didn't carry over, set a password for at least one admin before
go-live. Quickest path with the included tooling:

```bash
# generates a bcrypt hash you can drop into the User row
node -e "require('bcryptjs').hash(process.argv[1],10).then(h=>console.log(h))" 'a-strong-password'
npm run db:studio   # open Prisma Studio, paste the hash into the admin's passwordHash
```

Then `npm run dev`, sign in, and spot-check recipes, items, venues, and a recipe's
ingredient lines/costing against the old site.

### 6. Deploy to Vercel
1. Push this repo to GitHub and import it in Vercel.
2. Set the Vercel env vars `DATABASE_URL` (the new DB) and `AUTH_SECRET`.
3. Deploy. `prisma generate` runs automatically via the `postinstall` hook.
   The schema was already created in step 3; if you provisioned the DB only now,
   run `npm run db:push` against it once.

### 7. DNS / domain cutover
Once the Vercel deployment is verified on its preview URL, point the production
domain at Vercel (and remove it from the old host). Keep the legacy app running
but un-domained for a few days as a hot fallback.

### 8. Tell users to reset passwords
Everyone needs a new password. Communicate the new login URL and that logins are
now by **email**.

---

## Rollback

Nothing in steps 1–6 touches the legacy app or its database, so rollback before
DNS cutover is a no-op (just don't switch DNS). After cutover:

1. Point the production domain back at the legacy host.
2. The legacy database was never modified, so it's exactly as it was.
3. Any data entered into culinary-ops after go-live would need to be re-entered
   in the legacy app — so validate thoroughly in step 5 before switching DNS.

---

## Reference: running the migration locally against a copy

To rehearse safely, restore the step-0 backup into a scratch database and use it
as `SOURCE_DATABASE_URL`, with a scratch target as `DATABASE_URL`. The script
only issues `SELECT`s against the source (the connection is opened in
`default_transaction_read_only` mode), so pointing it at real prod is also safe —
but rehearsing first is recommended.
