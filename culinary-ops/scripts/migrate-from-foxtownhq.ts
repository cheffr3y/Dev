/**
 * One-time ETL: foxtownhq (legacy Flask/Postgres) -> culinary-ops (Prisma/Postgres).
 *
 * Reads the OLD production database READ-ONLY via SOURCE_DATABASE_URL and writes
 * the overlapping entities into the NEW database (Prisma's DATABASE_URL).
 *
 * What carries over:
 *   ingredients          -> Item            (vendor string -> synthesized Vendor)
 *   venues               -> Venue           (a unique `code` is derived from the name)
 *   recipes              -> Recipe          (equipment/critical steps/storage/etc.
 *                                            folded into `instructions` so nothing is lost)
 *   recipe_ingredients   -> RecipeItem      (only rows with type='ingredient';
 *                                            sub-recipe rows have no equivalent and are skipped)
 *   users                -> User            (username -> email; passwords CANNOT carry over,
 *                                            see note below)
 *   events/event_menu_recipes -> Event/EventMenuItem (best-effort, only if the legacy
 *                                            tables/columns exist)
 *
 * What does NOT carry over (no equivalent in the new schema): banquets, buffets,
 * forecasting / sales-mix imports, tap releases, commissary / outlet orders,
 * menu rollouts, recipe method steps, weighted options. The old database is left
 * untouched and remains your backup of all of it.
 *
 * Passwords: the legacy app hashes with Werkzeug (pbkdf2/scrypt); this app uses
 * bcrypt. The two are not interchangeable, so every migrated user gets a random,
 * unusable hash and MUST reset their password (or an admin must set a new one).
 *
 * Safety: the script only issues SELECTs against the source. All target writes are
 * upserts keyed on the preserved primary keys, so it is safe to re-run.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgres://...old-prod..." \
 *   DATABASE_URL="postgres://...new-db..." \
 *   npm run db:migrate-legacy
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { randomBytes } from "crypto";

type RoleName = "ADMIN" | "MANAGER" | "STAFF";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: ${name} is not set.`);
    process.exit(1);
  }
  return v;
}

function sourceSslOption(connStr: string) {
  // Most hosted Postgres providers require TLS. Enable it when the connection
  // string asks for it or when SOURCE_PGSSL is set, without verifying the chain
  // (managed providers terminate TLS with their own CA).
  const wantsSsl =
    /sslmode=require|sslmode=verify/i.test(connStr) ||
    process.env.SOURCE_PGSSL === "1";
  return wantsSsl ? { rejectUnauthorized: false } : undefined;
}

function toFloat(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "x"
  );
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function mapRole(legacy: unknown): RoleName {
  const r = String(legacy ?? "").toLowerCase();
  if (r === "admin") return "ADMIN";
  if (r === "manager") return "MANAGER";
  return "STAFF"; // cook, line, prep, etc. -> STAFF
}

/** Derive a short, unique venue code from its name (e.g. "Foxtown Brewing" -> "FB"). */
function deriveVenueCode(name: string, used: Set<string>): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let base =
    words.length >= 2
      ? words.map((w) => w[0]).join("").slice(0, 4)
      : (words[0] || "VEN").slice(0, 4);
  base = base.toUpperCase() || "VEN";
  let code = base;
  let n = 2;
  while (used.has(code)) {
    code = `${base}${n++}`;
  }
  used.add(code);
  return code;
}

async function columnExists(
  src: Client,
  table: string,
  column: string
): Promise<boolean> {
  const { rows } = await src.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(src: Client, table: string): Promise<boolean> {
  const { rows } = await src.query(`SELECT to_regclass($1) AS reg`, [
    `public.${table}`,
  ]);
  return rows[0]?.reg != null;
}

async function main() {
  const sourceUrl = requireEnv("SOURCE_DATABASE_URL");
  requireEnv("DATABASE_URL");

  const src = new Client({
    connectionString: sourceUrl,
    ssl: sourceSslOption(sourceUrl),
    // Belt-and-suspenders: never let this connection write.
    options: "-c default_transaction_read_only=on",
  });
  await src.connect();
  console.log("Connected to source (read-only). Starting migration...\n");

  const summary: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  // --- 1. Vendors (synthesized from ingredients.vendor free-text) ---
  const vendorIdByName = new Map<string, string>(); // lower(name) -> vendor id
  {
    const { rows } = await src.query(
      `SELECT DISTINCT TRIM(vendor) AS vendor
         FROM ingredients
        WHERE vendor IS NOT NULL AND TRIM(vendor) <> ''`
    );
    for (const row of rows) {
      const name = clean(row.vendor);
      if (!name) continue;
      const key = name.toLowerCase();
      if (vendorIdByName.has(key)) continue;
      const id = `vnd_${slugify(name)}`;
      vendorIdByName.set(key, id);
      await prisma.vendor.upsert({
        where: { id },
        update: { name },
        create: { id, name },
      });
    }
    summary.vendors = vendorIdByName.size;
  }

  // --- 2. Venues ---
  const usedCodes = new Set<string>();
  {
    const { rows } = await src.query(
      `SELECT id, name FROM venues ORDER BY sort_order NULLS LAST, name`
    );
    for (const row of rows) {
      const id = String(row.id);
      const name = clean(row.name) || id;
      const code = deriveVenueCode(name, usedCodes);
      await prisma.venue.upsert({
        where: { id },
        update: { name },
        create: { id, name, code },
      });
    }
    summary.venues = rows.length;
  }

  // --- 3. Items (from ingredients) ---
  const knownItemIds = new Set<string>();
  {
    const hasSku = await columnExists(src, "ingredients", "vendor_code");
    const hasGCode = await columnExists(src, "ingredients", "g_code");
    const { rows } = await src.query(
      `SELECT id, name, category, unit, vendor, cost_per_unit
              ${hasSku ? ", vendor_code" : ""}
              ${hasGCode ? ", g_code" : ""}
         FROM ingredients`
    );
    for (const row of rows) {
      const id = String(row.id);
      const name = clean(row.name);
      if (!name) {
        skipped.items = (skipped.items ?? 0) + 1;
        continue;
      }
      const vendorName = clean(row.vendor);
      const vendorId = vendorName
        ? vendorIdByName.get(vendorName.toLowerCase()) ?? null
        : null;
      const sku =
        (hasSku ? clean(row.vendor_code) : null) ??
        (hasGCode ? clean(row.g_code) : null);
      const data = {
        name,
        category: clean(row.category) ?? "Other",
        unit: clean(row.unit) ?? "each",
        unitCost: toFloat(row.cost_per_unit, 0),
        sku,
        vendorId,
      };
      await prisma.item.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      });
      knownItemIds.add(id);
    }
    summary.items = knownItemIds.size;
  }

  // --- 4. Recipes ---
  const knownRecipeIds = new Set<string>();
  {
    // Pull the rich set of columns; fold the ones with no column in the new
    // schema into the instructions text so the information is preserved.
    const optional = [
      "source_venue",
      "equipment",
      "critical_steps",
      "storage_instructions",
      "shelf_life_days",
      "prep_time_minutes",
      "recipe_type",
      "menu_descriptor",
      "station",
    ];
    const present: string[] = [];
    for (const c of optional) {
      if (await columnExists(src, "recipes", c)) present.push(c);
    }
    const { rows } = await src.query(
      `SELECT id, name, category, yield_qty, yield_unit, instructions
              ${present.length ? "," + present.join(",") : ""}
         FROM recipes`
    );

    const labels: Record<string, string> = {
      menu_descriptor: "Menu descriptor",
      equipment: "Equipment",
      critical_steps: "Critical steps",
      storage_instructions: "Storage",
      shelf_life_days: "Shelf life (days)",
      prep_time_minutes: "Prep time (min)",
      recipe_type: "Recipe type",
      source_venue: "Source venue",
    };

    for (const row of rows) {
      const id = String(row.id);
      const name = clean(row.name);
      if (!name) {
        skipped.recipes = (skipped.recipes ?? 0) + 1;
        continue;
      }
      const extras: string[] = [];
      for (const key of Object.keys(labels)) {
        if (!present.includes(key)) continue;
        const val = clean((row as Record<string, unknown>)[key]);
        if (val) extras.push(`${labels[key]}: ${val}`);
      }
      let instructions = clean(row.instructions) ?? "";
      if (extras.length) {
        instructions =
          (instructions ? instructions + "\n\n" : "") +
          "— Migrated notes —\n" +
          extras.join("\n");
      }
      const data = {
        name,
        category: clean(row.category) ?? "Other",
        station: present.includes("station") ? clean(row.station) : null,
        yieldQty: toFloat(row.yield_qty, 1),
        yieldUnit: clean(row.yield_unit) ?? "servings",
        instructions: instructions || null,
      };
      await prisma.recipe.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      });
      knownRecipeIds.add(id);
    }
    summary.recipes = knownRecipeIds.size;
  }

  // --- 5. RecipeItems (recipe_ingredients, type='ingredient' only) ---
  {
    const { rows } = await src.query(
      `SELECT recipe_id, item_id, quantity, unit, prep_note
         FROM recipe_ingredients
        WHERE type = 'ingredient'`
    );
    // Collapse duplicate (recipe, item) pairs — the unique constraint allows one.
    type Line = { quantity: number; unit: string; note: string | null };
    const merged = new Map<string, Line>();
    let skippedOrphans = 0;
    let skippedSubrecipe = 0;
    for (const row of rows) {
      const recipeId = String(row.recipe_id);
      const itemId = String(row.item_id);
      if (!knownRecipeIds.has(recipeId)) {
        skippedOrphans++;
        continue;
      }
      if (!knownItemIds.has(itemId)) {
        // item_id points at something that isn't an ingredient (e.g. a sub-recipe)
        skippedSubrecipe++;
        continue;
      }
      const key = `${recipeId}::${itemId}`;
      const qty = toFloat(row.quantity, 0);
      const unit = clean(row.unit) ?? "each";
      const note = clean(row.prep_note);
      const existing = merged.get(key);
      if (existing) {
        if (existing.unit === unit) existing.quantity += qty;
        existing.note = existing.note ?? note;
      } else {
        merged.set(key, { quantity: qty, unit, note });
      }
    }
    let written = 0;
    for (const [key, line] of merged) {
      const [recipeId, itemId] = key.split("::");
      await prisma.recipeItem.upsert({
        where: { recipeId_itemId: { recipeId, itemId } },
        update: { quantity: line.quantity, unit: line.unit, note: line.note },
        create: {
          recipeId,
          itemId,
          quantity: line.quantity,
          unit: line.unit,
          note: line.note,
        },
      });
      written++;
    }
    summary.recipeItems = written;
    skipped.recipeItems_orphanRecipe = skippedOrphans;
    skipped.recipeItems_subRecipeOrMissingItem = skippedSubrecipe;
  }

  // --- 6. Users ---
  {
    const { rows } = await src.query(
      `SELECT id, username, role FROM users`
    );
    const usedEmails = new Set<string>();
    for (const row of rows) {
      const id = String(row.id);
      const username = clean(row.username) || id;
      let email = EMAIL_RE.test(username)
        ? username.toLowerCase()
        : `${slugify(username)}@foxtownhq.local`;
      // Guarantee uniqueness if two usernames collapse to the same email.
      let candidate = email;
      let n = 2;
      while (usedEmails.has(candidate)) {
        const [local, domain] = email.split("@");
        candidate = `${local}+${n++}@${domain}`;
      }
      email = candidate;
      usedEmails.add(email);

      // Passwords cannot be migrated (Werkzeug -> bcrypt). Set an unusable hash.
      const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);

      const data = {
        email,
        name: username,
        role: mapRole(row.role),
      };
      await prisma.user.upsert({
        where: { id },
        update: data, // note: deliberately does NOT overwrite passwordHash on re-run
        create: { id, ...data, passwordHash },
      });
    }
    summary.users = rows.length;
  }

  // --- 7. Events (best-effort; legacy table may be absent or unused) ---
  if (
    (await tableExists(src, "events")) &&
    (await columnExists(src, "events", "event_date")) &&
    (await columnExists(src, "events", "venue_id"))
  ) {
    const hasGuests = await columnExists(src, "events", "guest_count");
    const hasNotes = await columnExists(src, "events", "notes");
    const hasName = await columnExists(src, "events", "name");
    const { rows } = await src.query(
      `SELECT id, venue_id, event_date
              ${hasName ? ", name" : ""}
              ${hasGuests ? ", guest_count" : ""}
              ${hasNotes ? ", notes" : ""}
         FROM events`
    );
    const validVenueIds = new Set(
      (await prisma.venue.findMany({ select: { id: true } })).map((v) => v.id)
    );
    const knownEventIds = new Set<string>();
    let skippedNoVenue = 0;
    for (const row of rows) {
      const venueId = row.venue_id ? String(row.venue_id) : null;
      if (!venueId || !validVenueIds.has(venueId) || !row.event_date) {
        skippedNoVenue++;
        continue;
      }
      const id = String(row.id);
      const data = {
        name: (hasName ? clean(row.name) : null) ?? "Event",
        venueId,
        date: new Date(row.event_date),
        guestCount: hasGuests ? Math.round(toFloat(row.guest_count, 0)) : 0,
        notes: hasNotes ? clean(row.notes) : null,
      };
      await prisma.event.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      });
      knownEventIds.add(id);
    }
    summary.events = knownEventIds.size;
    skipped.events_noVenue = skippedNoVenue;

    if (
      (await tableExists(src, "event_menu_recipes")) &&
      (await columnExists(src, "event_menu_recipes", "recipe_id"))
    ) {
      const hasQty = await columnExists(
        src,
        "event_menu_recipes",
        "quantity"
      );
      const hasNote = await columnExists(src, "event_menu_recipes", "notes");
      const { rows: emr } = await src.query(
        `SELECT event_id, recipe_id
                ${hasQty ? ", quantity" : ""}
                ${hasNote ? ", notes" : ""}
           FROM event_menu_recipes`
      );
      const seen = new Set<string>();
      let written = 0;
      let droppedDupes = 0;
      for (const row of emr) {
        const eventId = String(row.event_id);
        const recipeId = String(row.recipe_id);
        if (!knownEventIds.has(eventId) || !knownRecipeIds.has(recipeId)) {
          continue;
        }
        const key = `${eventId}::${recipeId}`;
        if (seen.has(key)) {
          droppedDupes++;
          continue; // unique(eventId, recipeId)
        }
        seen.add(key);
        const data = {
          eventId,
          recipeId,
          plannedServings: hasQty ? toFloat(row.quantity, 0) : 0,
          note: hasNote ? clean(row.notes) : null,
        };
        await prisma.eventMenuItem.upsert({
          where: { eventId_recipeId: { eventId, recipeId } },
          update: { plannedServings: data.plannedServings, note: data.note },
          create: data,
        });
        written++;
      }
      summary.eventMenuItems = written;
      skipped.eventMenuItems_dupes = droppedDupes;
    }
  } else {
    console.log("No usable legacy `events` table found — skipping events.\n");
  }

  await src.end();
  await prisma.$disconnect();

  console.log("Migration complete.\n");
  console.log("Migrated:");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  const skippedEntries = Object.entries(skipped).filter(([, v]) => v > 0);
  if (skippedEntries.length) {
    console.log("\nSkipped (no equivalent / invalid):");
    for (const [k, v] of skippedEntries) console.log(`  ${k}: ${v}`);
  }
  console.log(
    "\nIMPORTANT: passwords were NOT migrated. Every user has an unusable hash and\n" +
      "must reset their password (or an admin must set one). Usernames that were not\n" +
      "email addresses became <username>@foxtownhq.local — update these as needed."
  );
}

main().catch(async (err) => {
  console.error("\nMigration failed:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
