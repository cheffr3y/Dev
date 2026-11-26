# Print redesign — game plan

Living document. Updated as decisions are made and work lands.

**Started:** 2026-11-26
**Reference packet:** Fromm Holiday Lunch Party (Custom Menu, 65 guests, 23 pages, printed before the angryshallot rebrand)

---

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 0 | Discovery questions | ✅ Done |
| 1 | Fix print bugs | 🔧 In progress (3 of 6 — #3 code part done, data part open) |
| 2 | Split the packet into three prints | ⬜ Not started |
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
| 4 | Menu page shows no "Contains" line when a dish has no allergen data — reads as allergen-free | Brisket, Green Beans on page 1–2 | ⬜ |
| 5 | Steps missing first letter ("lace brisket", "llow smoker", "ransfer", "heck") — print code or imported data? **Needs investigation** | Brisket, Pork cards | ⬜ |
| 6 | Junk printing on cards: "— Migrated notes —", "Recipe type: batch" as steps; empty "Prep/Cook — / —" and "Shelf life —" fields | Most cards | ⬜ |

Data issues noticed (fix in the recipe/ingredient records, not the print code):
- **Pull list categories:** "Spices" and "Spices & Seasonings" are two categories — pick one and recategorize.
- **Water** is categorized as Frozen.
- **Black Pepper** and **Black Pepper, Coarse Grind** are separate ingredients — merge if they're the same product.
- **Ketchup** (oz + fl oz) and **Oil, Canola Blend** (qt + lb) need a density recorded on the ingredient so their amounts combine.
- Unit stored as `eac` instead of `each` (Eggs, Large on the cornbread). Now read correctly, but worth cleaning in the record. Side effect: lines using `eac` may now cost where they were previously unpriced, so food cost on affected recipes can rise slightly.
- "Mustard Powder[please add as cross-reference]" ingredient name
- "Mlse en Place" step title (New Carolina Gold), "Lable" (typo)
- Coleslaw and Field Greens Salad have no method recorded
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

Packets that share the same building blocks and should pick up B and C:
- Menu packet · Banquet packet · Banquet week packet · Festival packet · Prep order packet · To-go packet
- Single recipe print

Still to discuss separately: prep sheets, festival builds/recipe guide, smoking and preservation logs, shopping lists, order guides, festival proposal, weekly schedule.

### General questions still open
- Printer: black-and-white only, or color? Letter size? Any half-sheets?
- Where the paper lives: clipboard, sleeve, binder, wall? Gets wet/greasy? Kept or tossed?
- Branding: full angryshallot on everything, or plain working sheets with branding only on client documents?

---

## Change log

- **2026-11-26** — Plan created from discovery questions on the Fromm Holiday Lunch packet.
- **2026-11-26** — Bug 1 fixed: scaled cards no longer print a multiplier. Banner reads "SCALED PRODUCTION COPY — AMOUNTS ALREADY SCALED · DO NOT FILE IN MASTER BINDER". Applies to every scaled recipe print (custom menu, banquet, festival, menu, prep order, single recipe at a custom scale).
- **2026-11-26** — Bug 2 fixed: `eac` recognized as each; count units round up to whole numbers on scaled cards and pull/shopping lists (custom menu, prep order, banquet week).
- **2026-11-26** — Bug 3 (code part): pull lists combine weight and volume for an ingredient when its density/each-weight is recorded. Remaining pull-list problems are ingredient data, listed under Data issues.
