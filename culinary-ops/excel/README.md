# Foxtown Recipe Cards — Excel prototype

A macro-free Excel workbook that stores a recipe library and auto-formats any
recipe into the **Foxtown Brewing · Kitchen Build Card** house style, with
**yield scaling** and two card versions (cook-facing + costing).

Built by `build_workbook.py` → **`Foxtown-Recipes.xlsx`**. Open it in Excel
(Microsoft 365 desktop or web). No macros, so it works untouched in Excel on the
web and won't trip IT macro policies.

## Sheets

| Sheet | What it's for |
|---|---|
| **Build Card** | The formatted, print-ready card — cook-facing (no prices). Pick a recipe + scale. |
| **Build Card $** | Same card plus a costing box (plate cost, food-cost %, batch cost). |
| **Recipes** | One row per recipe — the header fields (name, descriptor, station, category, yield, prep, shelf life, equipment, storage, menu price). |
| **Ingredients** | One row per ingredient line (recipe, qty, qty-text like `TT`, unit, ingredient, prep note, unit cost, cost unit). |
| **Method** | One row per method step (recipe, title, time, description). |
| **Critical** | One row per critical step (recipe, text). |
| **Units** | (hidden) unit-conversion factors ported from the app's `lib/units.ts`. |

## Using it

1. **View / print a card** — on **Build Card**, use the dropdown in the yellow
   `RECIPE` cell (top-left) to choose a recipe, and type a number in `SCALE ×`
   (1 = as written, 2 = double, …). `File → Print` gives a clean one-page card.
   Yield and all numeric quantities scale; to-taste lines (`TT`) and `—` pass
   through unchanged.
2. **Add a recipe** — add a row on **Recipes**, then its lines on **Ingredients**,
   **Method**, and **Critical** (use the same exact recipe name in the `Recipe`
   column on each — pick it from the dropdown). It appears in the card dropdown
   automatically; no formatting needed.
3. **Costing** — fill `UnitCost` + `CostUnit` on Ingredients (already seeded from
   the app's catalog). The **Build Card $** sheet shows plate cost, food-cost %,
   and scaled batch cost. Units are converted within a family (e.g. `oz`→`lb`,
   `fl oz`→`L`) using the Units sheet, matching the app's `lib/costing.ts`.

## Regenerate

```bash
pip install openpyxl
python3 build_workbook.py
```

The script seeds the workbook from `prisma/seed.ts` recipes plus the House Potato
Chips card. To load **real** data later, replace the `RECIPES` / `ING` / `STEPS`
/ `CRIT` lists at the top of the script (or export from the live database).

## Known limits (prototype)

- Visual replica of the web card is close, not pixel-identical (Excel vs web).
- Card reserves **20 ingredient rows** and **16 method steps**; longer recipes
  need those reserved blocks extended in `build_workbook.py` (`N_ING`, `N_STEP`).
- Needs Microsoft 365 Excel; the styled fonts assume Arial.
- Data reserved for **200 rows** per sheet — raise `NROWS` for a bigger library.
