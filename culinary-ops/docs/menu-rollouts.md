# Menu rollouts and Atelier packets

Open **Menu Rollouts** beside Recipes & Builds in the desktop or mobile navigation.
Managers can create a rollout, assign a venue and target food cost, and add recipes
to menu sections. Staff can read the workspace and print packets. Inline price
and par fields are persisted with **Save row**; the order guide and summary update
after saving. A blank price override uses the recipe's menu price.

The packet switcher offers the master launch book, costing dossier, vendor order
guide and category pull sheet, allergen study guide, or kitchen recipe book. The
recipe book includes a cover and table of contents, every plated build, and one
card for each required sub-recipe, including nested dependencies and parent-dish
references. Kitchen copies omit financial audit stamps.

## Calculation conventions

- Prices, margins, and portion costs use the recipe's saved yield unit. A recipe
  yielding pounds is costed per pound; a serving conversion is never invented.
- Opening demand is `parBatches × recipe.yieldQty`. Baseline covers are reference
  metadata, not an additional demand multiplier.
- Average food cost is the unweighted average of dishes with positive menu prices.
  Par-weighted food cost divides opening cost by potential opening revenue for
  those priced dishes. The workspace reports how many dishes are excluded.
- Vendor quantities are exact raw requirements, before purchasing-pack rounding.
  Unit mismatches are visible and have no invented extended price. Missing prices
  and stale prices propagate from every nested recipe and are deduplicated by item.
- A manually named ingredient group switches that recipe from automatic culinary
  stages to custom groups. Groups follow their first row's sort order, and rows
  within each group follow sort order. Unnamed rows appear in **Ungrouped**.
- Standard 10–15 ingredient cards fit one US Letter portrait sheet with 0.4-inch
  margins. Exceptionally long instructions can continue onto another page without
  clipping content. Recipe cards begin on separate pages in launch books.

## Database and checks

Production `npm start` runs `prisma migrate deploy` before Next.js accepts traffic;
a migration failure stops startup. To repair an already-running release, run
`npm run db:deploy` in that deployed component's console, then reload the affected
pages. Prisma Client is regenerated during installation. The additive
`20261017000000_menu_rollouts` migration creates the two
rollout tables and ingredient grouping fields. Recipes referenced by rollouts
cannot be deleted until removed from those rollouts.

Run `npm test`, `npx tsc --noEmit`, and `npm run build` for the unit, type, and build
checks. `lib/menu-rollout.test.ts` covers nested costs, converted vendor quantities,
deduplicated dependencies, inherited allergens, price gaps, and empty rollouts.

The browser harness uses its own disposable PostgreSQL cluster and demo accounts:

```sh
PREP_BROWSER_SMOKE=1 MENU_ROLLOUT_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh
```

Install Playwright or set `PREP_PLAYWRIGHT_MODULE` to its module path, and optionally
set `PREP_BROWSER_EXECUTABLE` to a Chrome/Chromium executable. `MENU_REVIEW_DIR`
controls the screenshot/PDF review output (default `/tmp/menu-rollout-review`).
The harness checks creation, inline edits, grouping, nested warnings, all packet
modes, staff access, and print output, then removes the disposable database.
