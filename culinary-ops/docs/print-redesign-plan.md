# Print redesign — game plan

Living document. Updated as decisions are made and work lands.

## Priorities (reset 2026-11-26)

Jeff stepped back to rank by payoff. Biggest weekly time sink: **ordering & invoices**, specifically **knowing what to order**. He uses Production planning → Combined purchasing list regularly; the step still done by hand is **subtracting what's on hand**.

| Rank | Work | Why | Status |
|---|---|---|---|
| 1 | **On-hand counts on the purchasing list** (see "Ordering: on-hand counts" below) | Removes the manual step in the weekly order | ✅ Live on main (8b226ac, 2026-11-26) |
| 2 | Dietary tagging screens + "Needs attention" list (D3–D5) | DB fields are live but can't be filled in; allergen review | ✅ Live on main (90217fc, 2026-11-27) |
| 2a | **Cleanup page + simpler sidebar** (see "Cleanup & navigation" below) | Jeff: cleanup work needs its own page; sidebar too cluttered | ✅ Live on main (05dceb2, 2026-11-27) |
| 3 | Branded client menu | Half built; what clients see | 🔧 Paused |
| 4 | Station cards in v3 look; chef's copy | Approved look, mostly build | ⬜ |
| — | Custom Menus as a purchasing-list source | Small; not a pain point Jeff named | ⬜ Optional |

## Ordering: on-hand counts (approved and built 2026-11-26)

Decisions: count on **phone and on paper**; counts are **fresh every order** (no pre-fill from last time).

- **Start a count** from the Combined purchasing list. Saves a count for that list (date range + selected events) so the phone and the desk see the same numbers. A new order starts blank.
- **Phone:** one row per ingredient, grouped by category, big number box in the purchase unit. Saves as you type. *To order* updates live.
- **Paper:** a count sheet of only the ingredients on this order, grouped by category, blank on-hand column, QR code to open the same count on a phone.
- **To order** = need − on hand (never below zero), then rounded up to cases where a case size is on file.
- **Order sheet:** by vendor, only items to order, with cases, units and SKU.
- **Database:** additive tables for a count and its lines. Goes live on push to main.
- Out of scope for now: pars / non-recipe staples, vendor ordering, remembering counts.

**Built:**
- *Start a count* button on Production planning → Combined purchasing list (managers/admins).
- `/production/counts/[id]`: phone-first count screen; each amount saves ~0.7 s after typing or on leaving the field; *To order* and cases update live; invalid amounts (negative, text) are refused and not saved.
- `?sheet=count`: printable count sheet (only this order's ingredients, by category, blank on-hand column, QR to the count).
- `?sheet=order`: printable order sheet by vendor; covered items drop off; uncounted items order the full need and are marked "not counted".
- Needs are recalculated live from the selected events each time the count opens; a warning shows if a selected job has dropped out of range.
- Migration `20261128000000_purchase_counts` (two new tables, additive).
- Tests: order math unit tests; browser test `purchase-counts` (phone + desk, saves, reload, invalid input, sheets, QR, fresh count, staff blocked).


**Started:** 2026-11-26
**Reference packet:** Fromm Holiday Lunch Party (Custom Menu, 65 guests, 23 pages, printed before the angryshallot rebrand)

---

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 0 | Discovery questions | ✅ Done |
| 1 | Fix print bugs | 🟡 Code fixes done; #3 and #5 need recipe/ingredient data fixes |
| 2 | Split the packet into three prints + new branded look | 🎨 Mockups out for review |
| 3 | Carry the new layouts to other packets | ⬜ Not started |

---

## Phase 0 — Decisions (from Jeff, 2026-11-26)

| # | Question | Answer | What it means for the design |
|---|---|---|---|
| 1 | Who holds the packet? | **I pull it apart** and hand recipes to stations | Every recipe starts on a fresh page and stands alone (event, date, station on each page) |
| 2 | What goes on a cook's card? | **Full method every time** | Keep all steps; just clean out junk lines |
| 3 | How should batch size read? | **Final amounts only** | Drop the "× batch" multiplier from cook cards; show "Makes 16.25 lb" |
| 4 | What is the pull list for? | **Building an order** | Turn it into an order list: by vendor, rounded to case/pack, one unit per line |
| 5 | Does the menu page leave the kitchen? | **Yes, to the client** | Separate branded client menu, no costs, complete allergen lines |
| 6 | What's missing? | "Looking for ideas with high ROI" | Recommended: station name on every page + make-ahead list (see below) |

### High-ROI additions (recommended)
- **Station name on every split-out page.** Data already exists on recipes. Near-zero cost.
- **Make-ahead list on the chef's copy.** Dishes sorted longest total time first. Many recipes have no prep/cook times recorded yet, so missing times are flagged, not guessed.
- **Deferred:** pan/equipment counts and service/holding plan. No data in the app for these yet; low ROI until there is.

---

## Phase 1 — Bugs (fix first)

| # | Bug | Seen in reference packet | Status |
|---|---|---|---|
| 1 | Batch banner prints full float, e.g. `2.4299065420560746x` | Every recipe card | ✅ 2026-11-26 — multiplier removed from banner and badge; badge now reads "Makes 16.25 lb" ("Standard batch" at 1×). Costing table on the chef's copy keeps its batch math. |
| 2 | Count units truncated (`eac`) and fractional (10.83 eggs, 81.25 buns) — should round up to whole units | Cornbread card, pull list, costing | ✅ 2026-11-26 — `eac` was stored that way in the data; app now reads it as "each". Counts round up on scaled cards and on the pull/shopping lists (10.83 → 11 eggs, 81.25 → 82 buns). Master recipes keep exact counts (½ lemon stays 0.5). Costing table keeps exact math. |
| 3 | Pull list: mixed units on one line (`1.28 qt + 1.14 lb`), duplicate categories (Spices / Spices & Seasonings), duplicate items (Black Pepper vs Black Pepper, Coarse Grind), Water filed under Frozen | Pages 21–23 | 🟡 2026-11-26 — **Code:** weight and volume of the same ingredient now merge into one amount when the ingredient has a density or each-weight recorded (custom menu, banquet, banquet week lists). Without one, amounts stay separate instead of being guessed. **Data (open):** duplicate categories, duplicate pepper items and Water→Frozen are ingredient-record fixes — see list below. Prep-order lists use frozen snapshots and still keep amounts separate. |
| 4 | Menu page shows no "Contains" line when a dish has no allergen data — reads as allergen-free | Brisket, Green Beans on page 1–2 | ✅ 2026-11-26 — Custom menu: every dish now prints an allergen line; untagged dishes print "Allergens not recorded — ask the kitchen". A screen-only warning above the packet names the untagged dishes before you print. Other packets' menu pages to be checked in Phase 3. |
| 5 | Steps missing first letter ("lace brisket", "llow smoker", "ransfer", "heck") — print code or imported data? | Brisket, Pork, Maitake cards | 🟡 2026-11-26 — Investigated: print code, step parser and method editor print step text exactly as stored; nothing trims letters. Almost certainly in the recipe records, but **not confirmed** (no database access from this session). Check: open Smoked Trimmed Brisket on screen — if step 6 reads "lace brisket", it's data. Fix by editing those steps. |
| 6 | Junk printing on cards: "— Migrated notes —", "Recipe type: batch" as steps; empty "Prep/Cook — / —" and "Shelf life —" fields | Most cards | ✅ 2026-11-26 — Everything after "— Migrated notes —" moves into a **Kitchen Notes** box instead of numbered steps; "Recipe type", "Source venue", "Menu descriptor" and "Prep time" lines are dropped. Empty Prep/Cook, Total Time and Shelf Life boxes are left off. Steps with no title no longer print a "Step 4" heading. Allergen box always shows ("None recorded" stays — safety). |

Data issues noticed (fix in the recipe/ingredient records, not the print code):
- Run `npx tsx scripts/report-gluten-tags.ts` against production and tag Gluten on any beer, malt, barley or rye ingredients it lists (check each label).
- **Pull list categories:** "Spices" and "Spices & Seasonings" are two categories — pick one and recategorize.
- **Water** is categorized as Frozen.
- **Black Pepper** and **Black Pepper, Coarse Grind** are separate ingredients — merge if they're the same product.
- **Ketchup** (oz + fl oz) and **Oil, Canola Blend** (qt + lb) need a density recorded on the ingredient so their amounts combine.
- Unit stored as `eac` instead of `each` (Eggs, Large on the cornbread). Now read correctly, but worth cleaning in the record. Side effect: lines using `eac` may now cost where they were previously unpriced, so food cost on affected recipes can rise slightly.
- "Mustard Powder[please add as cross-reference]" ingredient name
- "Mlse en Place" step title (New Carolina Gold), "Lable" (typo)
- Coleslaw and Field Greens Salad have no method recorded
- Steps missing their first letter (bug 5): Brisket steps 6–7, Pork steps 6, 11, 13, Maitake step 3
- Texas BBQ Sauce / Coleslaw Dressing: storage notes stored as steps 8–22
- Cost review flagged: no price for Mustard, Yellow; stale prices for Provolone, Lemon Juice, Tomato Paste

---

## Phase 2 — Split the packet into three prints

### A. Client menu
- Branded angryshallot sheet (aubergine / porcelain / Fraunces).
- Dish name, description, "Contains" line on every dish.
- Warn before printing if any dish has no allergen data.
- No costs, no internal notes.

### B. Chef's copy
- Costing summary.
- Allergen grid.
- Make-ahead list (longest first; flag missing times).
- Station index (which pages go to which station).
- **Order list:** sorted by vendor, rounded up to case/pack where known, one unit per line, duplicates merged. Items with no vendor/pack data grouped under "No vendor set."
  - ⚠️ Unverified: how many ingredients have vendor and pack size filled in. Check before building.

### C. Station cards
- One recipe per fresh page.
- Header: event · date · station · "Makes 16.25 lb".
- Ingredients at final scaled amounts. No multiplier.
- Full method. Junk lines and empty fields hidden.
- Sub-recipes print directly behind their parent dish.
  - Open question: if a sub-recipe belongs to a different station than its parent, does it go with the parent or its own station?
- Readable at a station; works in black-and-white.

---

## Phase 3 — Roll out to other packets

- Apply the bug 4 allergen rule (no blank allergen lines on guest-facing menus) to banquet, festival and menu packets.

Packets that share the same building blocks and should pick up B and C:
- Menu packet · Banquet packet · Banquet week packet · Festival packet · Prep order packet · To-go packet
- Single recipe print

Still to discuss separately: prep sheets, festival builds/recipe guide, smoking and preservation logs, shopping lists, order guides, festival proposal, weekly schedule.

### Look & feel (decided 2026-11-26)
- Brief from Jeff: new branding and colors; **professional, a touch of humor, a little panache / soigné**.
- **Printers:** kitchen sheets print **black & white**; client documents print in **color**.
- **Humor:** **minimal** — at most one quiet line per document; panache comes from typography and layout. Safety information is never joked about. Client copy gets a sincere line, no jokes.
- **Mockups:** station card (B&W) + client menu (color) — https://claude.ai/artifact/7KgZcsrKwyteV8eGTDRRJd
  - v1 feedback (Jeff): station card "missing character, a lot of boxes".
  - v2: cookbook-page treatment — type and rules instead of boxes; large "Makes 16¼ lb"; timing as a sentence; hanging italic step numbers with run-in step names; "long haul" cook timeline (hatched for B&W, only when step times exist); one loud "Pull at 200–203°F" moment; optional per-recipe margin line and footer quip.
  - v2 feedback (Jeff): liked v1 more — keep v1's layout, add angryshallot styling.
  - **v3 (current direction):** v1 layout + shallot mark in the station band, paprika period ending the title and section names, soft/wonky Fraunces on title, section names and step numbers, aubergine in place of black for band/rules/cues (prints near-black on B&W), softened corners and pill cues, wordmark in the footer. Safety text and pull temp unchanged.
  - v3.1: Jeff liked the client menu's shallot divider (hairline · shallot · hairline). Added it to the station card under the header and as a "fin" end mark after the last step (tells a cook the pulled page is the end of the recipe). Paprika on screen, mid-gray on B&W. Use this divider as the house accent across all prints.

### General questions still open
- Where the paper lives: clipboard, sleeve, binder, wall? Gets wet/greasy? Kept or tossed?
- Letter size only, or any half-sheets / cards?

---

## Dietary tags & allergen review (raised 2026-11-26)

Jeff's idea: add **vegan / vegetarian** to recipes and ingredients, and flag ingredients whose allergen/dietary info is **out of review** wherever the stale-price warning shows today.

### Decisions (2026-11-26)
| # | Question | Answer |
|---|---|---|
| 1 | How do tags get onto a dish? | **Both:** tag ingredients and roll up through recipes and sub-recipes (like allergens), plus a manual override on a recipe with a note why |
| 2 | Other avoidances (pork, alcohol, nightshades…)? | No preference — **start with vegan + vegetarian only**; built so more tags can be added later |
| 3 | When is an ingredient "out of review"? | **Never reviewed**, or **last reviewed more than 6 months ago** |
| 4 | Where does the warning show? | **Everywhere the stale-price warning shows** (costing rollups/audits on custom menus, menus, festivals, banquets, to-go, events, Ingredients page). On client-facing proposals it stays screen-only. |
| 5 | Client menu markers? | **Yes, spelled out** — a "Vegan" or "Vegetarian" line under the dish, matching the "Contains:" line |

### Design
- **Ingredient:** one dietary field — *Vegan* (also vegetarian) · *Vegetarian, not vegan* (e.g. butter, eggs) · *Neither* (meat, fish, gelatin) · blank = not yet tagged.
- **Ingredient:** "Allergens & dietary reviewed on" date, set by a **Mark reviewed** action on the ingredient. Out of review = blank or older than 6 months.
- **Recipe roll-up:** vegan only if every ingredient and sub-recipe is vegan; vegetarian if every one is vegan or vegetarian; any *Neither* → not vegetarian; any untagged ingredient → unknown (no claim made).
- **Recipe override:** set Vegan / Vegetarian / Neither by hand with a required note; shown as "set by hand" wherever the tag appears.
- **Client menu:** prints "Vegan" / "Vegetarian" only when the roll-up (or override) says so. Unknown prints nothing — no claim. Pre-print warning lists dishes with untagged or out-of-review ingredients.
- **Warning text** sits next to "Cost review needed", e.g. *"Allergen review needed: never reviewed — Ketchup, Molasses; over 6 months — Mayonnaise."*

### Status
| Step | What | Status |
|---|---|---|
| D1 | Database fields (ingredient dietary + reviewed date; recipe override + note) — additive migration | ✅ 2026-11-26 — migration `20261127000000_dietary_tags`: `Item.diet`, `Item.allergenReviewedAt`, `Recipe.dietOverride`, `Recipe.dietOverrideNote`. Database rejects unknown diet values and an override without a note. Tested on a throwaway Postgres. **Not yet applied to production** — runs on next deploy. |
| D2 | Roll-up + review-gap logic, with tests | ✅ 2026-11-26 — `lib/recipes/diet.ts` (roll-up, override, untagged list, menu text); review gaps added to the shared price-gap logic (6-month window) with a ready-made warning sentence. Screens don't pass the review date yet, so nothing new shows until D5. |
| D3 | Ingredient editing: dietary field, Mark reviewed, review filter on Ingredients page | ✅ 2026-11-27 — Diet dropdown + "I checked the allergens and diet against the current product label" checkbox on the ingredient form (stamps the review date; shows last reviewed / over 6 months). **Needs attention** page (`/items/attention`, linked from Ingredients): review backlog most-used first with one-click "set diet + Label checked", plus missing/stale price counts, recipes with no method, possible-gluten names. |
| D4 | Recipe override field | ✅ 2026-11-27 — Diet section on the recipe HACCP & Compliance tab: rolled-up diet, untagged ingredients, review due, and "Set diet by hand" with a required reason (logged in the recipe changelog). |
| D5 | Warning everywhere stale price shows | ✅ 2026-11-27 — Allergen review line added beside price warnings on custom menus (screen + costing page), menus, banquet prep sheets, festival builds/prep/accounting, recipe page. Long lists capped at 8 names + "and N more". Not added to client-facing proposals or the home dashboard. |
| D6 | Client menu "Vegan"/"Vegetarian" line + pre-print warning; allergen grid column | ⬜ |

---

## Cleanup & navigation (raised 2026-11-27)

Jeff: data cleanup (allergens, stale costs, the #2 data list) should have its own page; the sidebar is cluttered and hard to find things in.

### Decisions (2026-11-27)
| # | Question | Answer |
|---|---|---|
| 1 | Sidebar layout | **Short list by job** — each job opens its first page; its pages show as tabs across the top |
| 2 | Pages used most weeks | Recipes/Specials/Menus, Custom Menus/Banquets/Events/Festivals, Invoices/Ingredients/Vendors/Monthly Tracker |

### What was built
- **Sidebar:** Today · Kitchen (Daily prep, Production, Smoking, Schedule, Prep reports) · Recipes & Menus (Recipes, Specials, Menus, HMR) · Events (Custom Menus, Banquets, Events, Festivals) · Ordering (Invoices, Ingredients, Vendors, Monthly Tracker) · Cleanup · Admin. Each job has its own icon; role rules unchanged (staff don't see Invoices, Monthly Tracker, Prep reports or Admin). Menu lives in `lib/navigation/nav.ts`; tabs in `components/SectionTabs.tsx`.
- **Hover menu (desktop):** hovering or tabbing to a job opens its pages in a panel beside the sidebar (works collapsed too); Escape closes it. Not on phones.
- **Cleanup badge:** count of ingredients used in a recipe that need a label check or have no price.
- **Cleanup page (`/cleanup`)** — replaces Needs attention (old link redirects). Sections:
  - Allergens & diet: label review with one-click diet + Label checked; possible gluten.
  - Prices: no price / over 90 days, used ingredients only, most-used first.
  - Duplicates: look-alike categories with a one-click **Move all from A into B** (e.g. Spices → Spices & Seasonings); look-alike ingredient names with Compare (merge tool unchanged at `/items/cleanup`).
  - Units: recipe lines whose unit can't convert to the purchase unit — no cost, split pull-list amounts (Ketchup / canola type). Fix by adding a weight per cup/each on the ingredient.
  - Recipes & names: steps starting lowercase (possible missing first letter, bug 5), recipes with no method, ingredient names with brackets/notes.
- Not automated (no reliable rule): wrong category on a single item (Water under Frozen), storage notes stored as steps, typos like "Lable".

### Tests (2026-11-27, disposable Postgres)
- 306 unit tests pass (new: cleanup checks, nav roles/active page). All 70 integration tests pass.
- Browser: `url-state` (rewritten for new nav), `dietary-review` (now on /cleanup + redirect), `purchase-counts` pass.
- Already failing before this change, not touched: `ingredient-cleanup` (looks for an "Edit ingredient" button that no longer exists), `ingredient-allergens` (expects wheat without gluten — predates wheat→gluten rule), `operating-calendar` (clicks a "Saved lines & food spending" header that no longer exists).

---

## Change log

- **2026-11-26** — Plan created from discovery questions on the Fromm Holiday Lunch packet.
- **2026-11-26** — Bug 1 fixed: scaled cards no longer print a multiplier. Banner reads "SCALED PRODUCTION COPY — AMOUNTS ALREADY SCALED · DO NOT FILE IN MASTER BINDER". Applies to every scaled recipe print (custom menu, banquet, festival, menu, prep order, single recipe at a custom scale).
- **2026-11-26** — Bug 2 fixed: `eac` recognized as each; count units round up to whole numbers on scaled cards and pull/shopping lists (custom menu, prep order, banquet week).
- **2026-11-26** — Bug 3 (code part): pull lists combine weight and volume for an ingredient when its density/each-weight is recorded. Remaining pull-list problems are ingredient data, listed under Data issues.
- **2026-11-26** — Bug 4 fixed on the custom menu: no blank allergen lines; pre-print warning lists untagged dishes.
- **2026-11-26** — Bug 5 investigated (data, not print code — unconfirmed). Bug 6 fixed: migrated notes become a Kitchen Notes box; empty spec boxes and "Step N" placeholder headings removed.
- **2026-11-26** — Added backlog: vegan/vegetarian tags and allergen/aversion review warnings.
- **2026-11-26** — Dietary tags question round done; design and build steps D1–D6 added. Building before resuming Phase 2.
- **2026-11-26** — Dietary D1 (database fields + migration) and D2 (roll-up and review logic, tests) done.
- **2026-11-26** — Everything through dietary D2 merged and pushed to `main` (auto-deploys; dietary migration runs on startup).
- **2026-11-26** — Phase 2 kicked off: look-and-feel decisions recorded; v1 mockups published for review.
- **2026-11-26** — Station card mockup v2 (less boxy, more character) published.
- **2026-11-26** — Station card mockup v3: back to v1 layout with angryshallot brand touches.
- **2026-11-26** — Mockup v3.1: shallot divider adopted as the house print accent.
- **2026-11-26** — Scope narrowed (Jeff): build the client-facing redesign first; kitchen cards wait. Started: diet data now flows through the recipe tree and custom menu lines (`rowDiet`) for the client menu.
- **2026-11-26** — Jeff asked to merge Wheat into Gluten. Flagged: they're not interchangeable (wheat is a Big 9 label allergen; gluten also comes from barley/rye — beer). Jeff chose option A.
- **2026-11-26** — Wheat/gluten (option A) done: a Wheat tag now always implies Gluten everywhere (stored, rolled up, grids, menus). Gluten can still be tagged alone for barley/rye/malt/beer. Guest menus read "Gluten (wheat)". The allergen checkboxes explain the rule. Review list: `npx tsx scripts/report-gluten-tags.ts` (read-only) lists items tagged Wheat-only and items named like barley/rye/malt/beer with no Gluten tag.
- **2026-11-26** — Priorities reset around ordering; on-hand count plan written, awaiting Jeff's OK.
- **2026-11-26** — On-hand counts built (count screen, count sheet, order sheet, migration, tests).
- **2026-11-26** — On-hand counts verified on a disposable database: all integration tests, new `purchase-counts` browser test (phone + desk), and existing `event-planning` / `banquet-setup` browser tests pass. Waiting on Jeff's OK to push to main (adds migration).
- **2026-11-26** — On-hand counts pushed to main (`8b226ac`); migration `20261128000000_purchase_counts` runs on deploy.
- **2026-11-27** — Dietary D3–D5 + Needs attention page built. New browser test `dietary-review`; all browser suites run (dietary-review, purchase-counts, event-planning, banquet-setup) pass, 299 unit tests pass. No new migration. On branch, not yet on main.
- **2026-11-27** — Correction: D3–D5 had already reached main (90217fc); the line above saying "not yet on main" was out of date.
- **2026-11-27** — Cleanup page + short sidebar by job built and tested. On branch, not yet on main. No migration.
- **2026-11-27** — Cleanup page + new sidebar pushed to main (`05dceb2`). No migration.
- **2026-11-27** — Sidebar hover menu added (Jeff's request); `url-state` browser test covers mouse and keyboard. First live Cleanup count on real data: 470.
