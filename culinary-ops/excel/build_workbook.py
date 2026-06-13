#!/usr/bin/env python3
"""
Build "Foxtown-Recipes.xlsx" — a macro-free Excel recipe database that renders
each recipe into the Foxtown Brewing "Kitchen Build Card" house format, with
yield scaling and a cook-facing + costing version of the card.

Data entry lives on four plain sheets (Recipes / Ingredients / Method / Critical).
The two "Build Card" sheets are pure INDEX/MATCH formulas over that data, so
entering a recipe auto-formats it. No VBA/macros (works in Excel desktop & web).

Run:  pip install openpyxl && python3 build_workbook.py
"""
from openpyxl import Workbook
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter

OUT = "Foxtown-Recipes.xlsx"
NROWS = 200  # data rows reserved per sheet (2 .. NROWS+1)

# ---- palette (sampled from the Kitchen Build Card screenshot) ----
RED   = "C0392B"
BLACK = "111418"
INK   = "2B2B2B"
GREY  = "7A7A7A"
GREY2 = "555555"
PINK  = "FBEAE8"
ZEBRA = "F4F4F2"
HAIR  = "D9D9D9"
WHITE = "FFFFFF"
FONT  = "Arial"

def F(size=10, bold=False, italic=False, color=INK):
    return Font(name=FONT, size=size, bold=bold, italic=italic, color=color)

def side(color=HAIR, style="thin"):
    return Side(style=style, color=color)

def numtxt(expr):
    # number -> clean text: integers show "10", decimals show "1.5" / "0.33"
    return f'IF({expr}=INT({expr}),TEXT({expr},"0"),TEXT({expr},"0.###"))'

# ============================================================ DATA ==========
# Item cost reference (name -> (unit, unitCost)) from prisma/seed.ts plus a few
# extras the screenshot recipe needs.
COST = {
    "Yukon Gold Potatoes": ("lb", 0.85), "Idaho Potato, 60ct": ("lb", 0.78),
    "Yellow Onions": ("lb", 0.60), "Garlic, peeled": ("lb", 3.20),
    "Roma Tomatoes": ("lb", 1.40), "Romaine Hearts": ("case", 24.0),
    "Lemons": ("each", 0.45), "Fresh Basil": ("lb", 9.0),
    "Chicken Breast, boneless": ("lb", 3.75), "Ground Beef 80/20": ("lb", 4.25),
    "Salmon Fillet": ("lb", 11.5), "Shrimp 16/20": ("lb", 12.0),
    "Butter, unsalted": ("lb", 3.60), "Heavy Cream": ("qt", 4.20),
    "Parmesan, grated": ("lb", 8.50), "Eggs, large": ("dozen", 3.10),
    "All-Purpose Flour": ("lb", 0.55), "Olive Oil, EV": ("L", 9.50),
    "Kosher Salt": ("lb", 0.80), "Black Pepper, ground": ("lb", 7.0),
    "Pasta, spaghetti": ("lb", 1.10), "Burger Buns": ("each", 0.35),
    "House Red Wine": ("bottle", 8.0), "Water": ("gallon", 0.0),
    "White Wine Vinegar": ("L", 4.50),
}

def ci(name):  # cost info
    return COST.get(name, ("each", 0.0))

# recipe header: name, descriptor, station, category, yieldQty, yieldUnit,
#                prep, shelfLife, equipment, storage, menuPrice
RECIPES = [
    ("House Potato Chips", "Crisp kettle-style chips, brined & fried to order",
     "Fry", "Sides", 4, "lb", "~75 min", "Serve fresh", "Mandoline, Fryer",
     "Best served immediately. Hold fully cooled chips in an airtight container "
     "at room temp, lined with towel. Do not refrigerate. Re-crisp in fryer if "
     "needed.", 7.0),
    ("Spaghetti Carbonara", "Roman pasta — egg & pecorino emulsion, black pepper",
     "Pasta", "Entree", 4, "servings", "~20 min", "Serve immediately",
     "Pasta pot, saute pan",
     "Serve immediately; carbonara does not hold. Hold mise (cheese/egg mix) "
     "covered, refrigerated, up to 2 days.", 19.0),
    ("Classic Smash Burger", "Smashed 4oz patty, American, griddle onions, soft bun",
     "Grill", "Entree", 1, "servings", "~12 min", "Serve immediately",
     "Flat-top, press",
     "Build to order. Pre-portion 4oz beef balls, refrigerated, use within 1 day.",
     14.0),
    ("Pan-Seared Salmon", "Crisp-skin salmon, butter-basted, finished with lemon",
     "Saute", "Entree", 1, "servings", "~15 min", "Serve immediately",
     "Saute pan, fish spatula",
     "Cook to order. Hold portioned fillets on ice, use within 1 day.", 28.0),
    ("Caesar Salad", "Chopped romaine, parmesan, house dressing, croutons",
     "Garde Manger", "Starter", 1, "servings", "~8 min", "Serve immediately",
     "Mixing bowl, tongs",
     "Hold dressing refrigerated up to 5 days. Dress to order so leaves stay "
     "crisp.", 11.0),
]

# ingredients: recipe, qty (number or None), qtyText, unit, ingredient, prep
ING = [
    # --- House Potato Chips (matches the screenshot) ---
    ("House Potato Chips", 10, "", "lb", "Idaho Potato, 60ct", "skin on"),
    ("House Potato Chips", 1, "", "gallon", "Water", "cold"),
    ("House Potato Chips", 2, "", "oz", "Kosher Salt", "for brine"),
    ("House Potato Chips", 2, "", "fl oz", "White Wine Vinegar", "—"),
    ("House Potato Chips", None, "TT", "", "Kosher Salt", "to season, hot"),
    # --- Carbonara ---
    ("Spaghetti Carbonara", 1, "", "lb", "Pasta, spaghetti", "dry"),
    ("Spaghetti Carbonara", 0.33, "", "dozen", "Eggs, large", "yolks + 2 whole"),
    ("Spaghetti Carbonara", 0.25, "", "lb", "Parmesan, grated", "fine"),
    ("Spaghetti Carbonara", 0.02, "", "lb", "Black Pepper, ground", "fresh cracked"),
    ("Spaghetti Carbonara", None, "TT", "", "Kosher Salt", "for pasta water"),
    # --- Smash Burger ---
    ("Classic Smash Burger", 0.25, "", "lb", "Ground Beef 80/20", "loose ball"),
    ("Classic Smash Burger", 1, "", "each", "Burger Buns", "toasted"),
    ("Classic Smash Burger", 0.1, "", "lb", "Yellow Onions", "thin sliced"),
    ("Classic Smash Burger", None, "TT", "", "Kosher Salt", "season on smash"),
    # --- Salmon ---
    ("Pan-Seared Salmon", 0.4, "", "lb", "Salmon Fillet", "skin on, scaled"),
    ("Pan-Seared Salmon", 0.03, "", "L", "Olive Oil, EV", "for the sear"),
    ("Pan-Seared Salmon", 0.05, "", "lb", "Butter, unsalted", "to baste"),
    ("Pan-Seared Salmon", 0.5, "", "each", "Lemons", "wedge"),
    ("Pan-Seared Salmon", None, "TT", "", "Kosher Salt", "both sides"),
    # --- Caesar ---
    ("Caesar Salad", 0.08, "", "case", "Romaine Hearts", "chopped"),
    ("Caesar Salad", 0.05, "", "lb", "Parmesan, grated", "shaved + grated"),
    ("Caesar Salad", 0.02, "", "L", "Olive Oil, EV", "for dressing"),
    ("Caesar Salad", 0.25, "", "each", "Lemons", "juiced"),
]

# method: recipe, title, time, description
STEPS = [
    ("House Potato Chips", "Wash potatoes", "3 min", "Scrub thoroughly under cold running water. Keep skins intact."),
    ("House Potato Chips", "Slice", "10 min", "Slice 1.5–2 mm thick on mandoline. Keep thickness consistent."),
    ("House Potato Chips", "Build brine", "2 min", "Combine water, salt, and vinegar in a large container."),
    ("House Potato Chips", "Soak", "30 min", "Submerge slices in brine to pull starch."),
    ("House Potato Chips", "Drain & rinse", "1 min", "Drain, then rinse briefly under cold water."),
    ("House Potato Chips", "Dry", "10 min", "Spread on sheet trays; dry fully with towels or spinner."),
    ("House Potato Chips", "Heat oil", "10 min", "Bring fryer oil to 350°F."),
    ("House Potato Chips", "Fry", "2–3 min", "Fry in small batches until lightly golden and crisp."),
    ("House Potato Chips", "Drain", "30 sec", "Remove and drain briefly on rack or paper."),
    ("House Potato Chips", "Season", "1 min", "Season immediately with kosher salt while hot."),
    ("House Potato Chips", "Cool & hold", "5 min", "Cool on trays until fully crisp, then transfer to service bowl or airtight container."),
    ("Spaghetti Carbonara", "Boil pasta", "9 min", "Cook spaghetti in well-salted water until just shy of al dente. Reserve pasta water."),
    ("Spaghetti Carbonara", "Mix base", "3 min", "Whisk eggs with grated parmesan and cracked black pepper into a paste."),
    ("Spaghetti Carbonara", "Combine", "2 min", "Off heat, toss hot pasta with the egg mix, loosening with pasta water to a glossy sauce."),
    ("Spaghetti Carbonara", "Finish", "1 min", "Adjust with more pasta water and pepper. Plate immediately; do not let it set."),
    ("Classic Smash Burger", "Smash", "2 min", "Smash beef ball on hot flat-top, season hard with salt."),
    ("Classic Smash Burger", "Flip & cheese", "2 min", "Flip once crusted, add cheese, melt with griddle onions alongside."),
    ("Classic Smash Burger", "Build", "1 min", "Toast bun, stack patty + onions, serve hot."),
    ("Pan-Seared Salmon", "Season", "1 min", "Pat salmon dry, season both sides."),
    ("Pan-Seared Salmon", "Sear", "5 min", "Sear skin-side down in olive oil until skin is crisp and releases."),
    ("Pan-Seared Salmon", "Baste", "3 min", "Flip, add butter, baste until just cooked. Finish with lemon."),
    ("Caesar Salad", "Dress", "2 min", "Toss romaine with dressing and olive oil until evenly coated."),
    ("Caesar Salad", "Finish", "2 min", "Add parmesan and lemon, toss, top with croutons. Serve cold."),
]

# critical steps: recipe, text
CRIT = [
    ("House Potato Chips", "Slice 1.5–2 mm even thickness or chips fry unevenly."),
    ("House Potato Chips", "Dry slices fully before frying — wet potatoes spit oil & steam."),
    ("House Potato Chips", "Oil at 350°F. Fry small batches; crowding drops temp & sogs the chip."),
    ("House Potato Chips", "Season the second they leave the oil so salt sticks."),
    ("Spaghetti Carbonara", "Combine off the heat — direct heat scrambles the eggs."),
    ("Spaghetti Carbonara", "Use reserved starchy pasta water to emulsify, not cream."),
    ("Classic Smash Burger", "Smash within 30s of hitting the griddle for max crust."),
    ("Pan-Seared Salmon", "Cook to 125°F internal for medium; carryover finishes it."),
    ("Caesar Salad", "Dress to order; dressed romaine wilts within minutes."),
]

# unit conversion table ported from lib/units.ts (base: fl oz / oz / each).
UNIT_ROWS = [
    ("tsp", "volume", 1/6), ("teaspoon", "volume", 1/6),
    ("tbsp", "volume", 1/2), ("tbs", "volume", 1/2), ("tbl", "volume", 1/2),
    ("tablespoon", "volume", 1/2),
    ("fl oz", "volume", 1), ("floz", "volume", 1), ("fluid oz", "volume", 1),
    ("cup", "volume", 8), ("c", "volume", 8),
    ("pint", "volume", 16), ("pt", "volume", 16),
    ("quart", "volume", 32), ("qt", "volume", 32),
    ("gallon", "volume", 128), ("gal", "volume", 128),
    ("ml", "volume", 0.033814), ("liter", "volume", 33.814), ("l", "volume", 33.814),
    ("oz", "weight", 1), ("ounce", "weight", 1),
    ("lb", "weight", 16), ("lbs", "weight", 16), ("pound", "weight", 16),
    ("gram", "weight", 0.035274), ("g", "weight", 0.035274),
    ("kg", "weight", 35.274), ("kilogram", "weight", 35.274),
    ("each", "count", 1), ("ea", "count", 1), ("ct", "count", 1),
    ("dozen", "count", 12), ("dz", "count", 12),
]

# ========================================================== WORKBOOK =========
wb = Workbook()
wb.calculation.fullCalcOnLoad = True  # force Excel/LibreOffice to recompute on open

def add_name(name, ref):
    wb.defined_names[name] = DefinedName(name, attr_text=ref)

# ---- data sheets ----
recs = wb.active; recs.title = "Recipes"
ings = wb.create_sheet("Ingredients")
meth = wb.create_sheet("Method")
crit = wb.create_sheet("Critical")
units = wb.create_sheet("Units")

def header_row(ws, headers, widths):
    for c, (h, w) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = F(9, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=BLACK)
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.row_dimensions[1].height = 20
    ws.freeze_panes = "A2"

# Recipes
header_row(recs,
    ["Name","Descriptor","Station","Category","YieldQty","YieldUnit","PrepTime",
     "ShelfLife","Equipment","Storage & Handling","MenuPrice"],
    [26,38,16,12,10,12,12,16,20,46,11])
for i, r in enumerate(RECIPES, start=2):
    for c, v in enumerate(r, start=1):
        recs.cell(row=i, column=c, value=v)

# Ingredients (+ helper cols I..P)
header_row(ings,
    ["Recipe","Qty","QtyText","Unit","Ingredient","Prep","UnitCost","CostUnit",
     "Seq","Key","FromF","ToF","FromFam","ToFam","ConvQty","LineCost"],
    [26,8,9,9,24,18,10,10,8,22,8,8,9,9,9,9])
for i, r in enumerate(ING, start=2):
    recipe, qty, qtext, unit, name, prep = r
    cu, uc = ci(name)
    ings.cell(row=i, column=1, value=recipe)
    if qty is not None: ings.cell(row=i, column=2, value=qty)
    ings.cell(row=i, column=3, value=qtext)
    ings.cell(row=i, column=4, value=unit)
    ings.cell(row=i, column=5, value=name)
    ings.cell(row=i, column=6, value=prep)
    ings.cell(row=i, column=7, value=uc)
    ings.cell(row=i, column=8, value=cu)

# Method (+ helper E,F)
header_row(meth, ["Recipe","Title","Time","Description","Seq","Key"],
           [26,22,10,60,8,22])
for i, r in enumerate(STEPS, start=2):
    for c, v in enumerate(r, start=1):
        meth.cell(row=i, column=c, value=v)

# Critical (+ helper C,D)
header_row(crit, ["Recipe","Critical step","Seq","Key"], [26,70,8,22])
for i, r in enumerate(CRIT, start=2):
    for c, v in enumerate(r, start=1):
        crit.cell(row=i, column=c, value=v)

# Units (hidden)
header_row(units, ["Unit","Family","Factor"], [14,12,12])
for i, r in enumerate(UNIT_ROWS, start=2):
    for c, v in enumerate(r, start=1):
        units.cell(row=i, column=c, value=v)

# ---- helper-column formulas for all reserved rows ----
last = NROWS + 1
for i in range(2, last + 1):
    # Ingredients helpers
    ings.cell(row=i, column=9,  value=f'=IF($A{i}="","",COUNTIF($A$2:$A{i},$A{i}))')
    ings.cell(row=i, column=10, value=f'=IF($A{i}="","",$A{i}&"|"&$I{i})')
    ings.cell(row=i, column=11, value=f'=IF($D{i}="","",IFERROR(VLOOKUP(LOWER($D{i}),UnitsTable,3,0),""))')
    ings.cell(row=i, column=12, value=f'=IF($H{i}="","",IFERROR(VLOOKUP(LOWER($H{i}),UnitsTable,3,0),""))')
    ings.cell(row=i, column=13, value=f'=IF($D{i}="","",IFERROR(VLOOKUP(LOWER($D{i}),UnitsTable,2,0),""))')
    ings.cell(row=i, column=14, value=f'=IF($H{i}="","",IFERROR(VLOOKUP(LOWER($H{i}),UnitsTable,2,0),""))')
    ings.cell(row=i, column=15, value=(
        f'=IF($B{i}="","",IF($D{i}=$H{i},$B{i},'
        f'IF(AND($K{i}<>"",$L{i}<>"",$M{i}=$N{i}),$B{i}*$K{i}/$L{i},$B{i})))'))
    ings.cell(row=i, column=16, value=f'=IF(OR($B{i}="",$G{i}=""),0,$O{i}*$G{i})')
    # Method helpers
    meth.cell(row=i, column=5, value=f'=IF($A{i}="","",COUNTIF($A$2:$A{i},$A{i}))')
    meth.cell(row=i, column=6, value=f'=IF($A{i}="","",$A{i}&"|"&$E{i})')
    # Critical helpers
    crit.cell(row=i, column=3, value=f'=IF($A{i}="","",COUNTIF($A$2:$A{i},$A{i}))')
    crit.cell(row=i, column=4, value=f'=IF($A{i}="","",$A{i}&"|"&$C{i})')

# hide helper columns
for col in "IJKLMNOP": ings.column_dimensions[col].hidden = True
for col in "EF":        meth.column_dimensions[col].hidden = True
for col in "CD":        crit.column_dimensions[col].hidden = True
units.sheet_state = "hidden"

# ---- defined names ----
def colref(sheet, col):
    return f"'{sheet}'!${col}$2:${col}${last}"
add_name("RecName",     colref("Recipes","A")); add_name("RecDesc", colref("Recipes","B"))
add_name("RecStation",  colref("Recipes","C")); add_name("RecCategory", colref("Recipes","D"))
add_name("RecYieldQty", colref("Recipes","E")); add_name("RecYieldUnit", colref("Recipes","F"))
add_name("RecPrep",     colref("Recipes","G")); add_name("RecShelf", colref("Recipes","H"))
add_name("RecEquip",    colref("Recipes","I")); add_name("RecStorage", colref("Recipes","J"))
add_name("RecMenu",     colref("Recipes","K"))
add_name("RecNameList", colref("Recipes","A"))
add_name("IngRecipe", colref("Ingredients","A")); add_name("IngQty", colref("Ingredients","B"))
add_name("IngQtyText", colref("Ingredients","C")); add_name("IngUnit", colref("Ingredients","D"))
add_name("IngName", colref("Ingredients","E")); add_name("IngPrep", colref("Ingredients","F"))
add_name("IngKey", colref("Ingredients","J")); add_name("IngLineCost", colref("Ingredients","P"))
add_name("StepTitle", colref("Method","B")); add_name("StepTime", colref("Method","C"))
add_name("StepDesc", colref("Method","D")); add_name("StepKey", colref("Method","F"))
add_name("CritText", colref("Critical","B")); add_name("CritKey", colref("Critical","D"))
add_name("UnitsTable", f"'Units'!$A$2:$C${len(UNIT_ROWS)+1}")

# ====================================================== BUILD CARD ===========
N_ING, N_STEP, N_CRIT = 20, 16, 6

def thin_bottom(ws, row, c1, c2, color=HAIR, style="thin"):
    for c in range(c1, c2 + 1):
        cell = ws.cell(row=row, column=c)
        b = cell.border
        cell.border = Border(left=b.left, right=b.right, top=b.top,
                             bottom=side(color, style))

def build_card(ws, cost=False):
    # column widths: A margin,B qty,C ingredient,D prep,E gap,F num,G method,H margin
    widths = {"A":2,"B":11,"C":26,"D":18,"E":3,"F":5,"G":58,"H":2}
    for col,w in widths.items(): ws.column_dimensions[col].width = w
    ws.sheet_view.showGridLines = False

    # ----- controls (row 1, excluded from print) -----
    ws["B1"] = "RECIPE";  ws["B1"].font = F(8, bold=True, color=GREY)
    ws["C1"] = "House Potato Chips"; ws["C1"].font = F(11, bold=True, color=RED)
    ws["C1"].fill = PatternFill("solid", fgColor="FFF6F5")
    ws["E1"] = "SCALE ×"; ws["E1"].font = F(8, bold=True, color=GREY)
    ws["F1"] = 1; ws["F1"].font = F(11, bold=True, color=RED)
    ws["F1"].fill = PatternFill("solid", fgColor="FFF6F5")
    dv = DataValidation(type="list", formula1="RecNameList", allow_blank=True)
    ws.add_data_validation(dv); dv.add(ws["C1"])
    SEL, FAC, M = "$C$1", "$F$1", "$J$1"
    ws["J1"] = f'=IFERROR(MATCH({SEL},RecName,0),"")'  # row-of-recipe helper

    # ----- header -----
    ws["B2"] = "FOXTOWN BREWING · KITCHEN BUILD CARD"
    ws["B2"].font = F(9, bold=True, color=RED)
    ws.merge_cells("F2:G2")
    ws["F2"] = f'=IF({M}="","",UPPER(INDEX(RecStation,{M}))&" STATION")'
    ws["F2"].font = F(10, bold=True, color=WHITE)
    ws["F2"].fill = PatternFill("solid", fgColor=BLACK)
    ws["F2"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 22

    ws.merge_cells("B3:D4")
    ws["B3"] = f'=UPPER({SEL})'
    ws["B3"].font = F(30, bold=True, color=BLACK)
    ws["B3"].alignment = Alignment(vertical="center")
    ws.merge_cells("B5:D5")
    ws["B5"] = f'=IFERROR(INDEX(RecDesc,{M}),"")'
    ws["B5"].font = F(11, italic=True, color=GREY2)
    thin_bottom(ws, 5, 2, 7, color=BLACK, style="medium")
    ws.row_dimensions[5].height = 22

    # ----- spec bar -----
    yexpr = f'ROUND(INDEX(RecYieldQty,{M})*{FAC},3)'
    specs = [("YIELD","B","B",
             f'=IFERROR({numtxt(yexpr)}&" "&INDEX(RecYieldUnit,{M}),"")'),
            ("PREP TIME","C","C", f'=IFERROR(INDEX(RecPrep,{M}),"")'),
            ("SHELF LIFE","D","E", f'=IFERROR(INDEX(RecShelf,{M}),"")'),
            ("EQUIPMENT","F","G", f'=IFERROR(INDEX(RecEquip,{M}),"")')]
    for label, c1, c2, formula in specs:
        if c1 != c2: ws.merge_cells(f"{c1}7:{c2}7"); ws.merge_cells(f"{c1}8:{c2}8")
        ws[f"{c1}7"] = label; ws[f"{c1}7"].font = F(8, bold=True, color=GREY)
        ws[f"{c1}8"] = formula; ws[f"{c1}8"].font = F(13, bold=True, color=BLACK)
    thin_bottom(ws, 8, 2, 7, color=HAIR)
    ws.row_dimensions[7].height = 14; ws.row_dimensions[8].height = 20

    # ----- section headers -----
    ws["B10"] = "INGREDIENTS"; ws["B10"].font = F(11, bold=True, color=BLACK)
    thin_bottom(ws, 10, 2, 4, color=BLACK, style="medium")
    ws["F10"] = "METHOD"; ws["F10"].font = F(11, bold=True, color=BLACK)
    thin_bottom(ws, 10, 6, 7, color=BLACK, style="medium")

    # ingredient column headers
    for col,txt in (("B","QTY"),("C","INGREDIENT"),("D","PREP")):
        ws[f"{col}11"] = txt; ws[f"{col}11"].font = F(8, bold=True, color=GREY)

    # ----- ingredient rows -----
    for k in range(1, N_ING + 1):
        r = 11 + k
        ws.cell(row=r, column=10,  # hidden match idx in J
            value=f'=IFERROR(MATCH({SEL}&"|"&{k},IngKey,0),"")')
        jr = f"$J${r}"
        qexpr = f'ROUND(INDEX(IngQty,{jr})*{FAC},3)'
        ws.cell(row=r, column=2, value=(
            f'=IF({jr}="","",IF(INDEX(IngQtyText,{jr})<>"",INDEX(IngQtyText,{jr}),'
            f'{numtxt(qexpr)}&" "&INDEX(IngUnit,{jr})))'))
        ws.cell(row=r, column=2).font = F(10, bold=True, color=BLACK)
        ws.cell(row=r, column=3, value=f'=IF({jr}="","",INDEX(IngName,{jr}))')
        ws.cell(row=r, column=3).font = F(10, color=INK)
        ws.cell(row=r, column=4, value=f'=IF({jr}="","",INDEX(IngPrep,{jr}))')
        ws.cell(row=r, column=4).font = F(9, italic=True, color=GREY)
        ws.row_dimensions[r].height = 17
        thin_bottom(ws, r, 2, 4, color="ECECEC")
    # zebra (filled even rows)
    zfill = PatternFill("solid", fgColor=ZEBRA)
    ws.conditional_formatting.add(
        f"B12:D{11+N_ING}",
        FormulaRule(formula=[f'AND($C12<>"",MOD(ROW(),2)=0)'], fill=zfill))

    # ----- method rows (2 rows each) -----
    for j in range(1, N_STEP + 1):
        top = 12 + (j - 1) * 2; desc = top + 1
        ws.cell(row=top, column=11,  # hidden match idx in K
            value=f'=IFERROR(MATCH({SEL}&"|"&{j},StepKey,0),"")')
        kr = f"$K${top}"
        num = ws.cell(row=top, column=6, value=f'=IF({kr}="","",TEXT({j},"00"))')
        num.font = F(12, bold=True, color=RED)
        num.alignment = Alignment(vertical="top")
        t = ws.cell(row=top, column=7, value=(
            f'=IF({kr}="","",INDEX(StepTitle,{kr})&'
            f'IF(INDEX(StepTime,{kr})<>""," ("&INDEX(StepTime,{kr})&")",""))'))
        t.font = F(10.5, bold=True, color=BLACK)
        d = ws.cell(row=desc, column=7, value=f'=IF({kr}="","",INDEX(StepDesc,{kr}))')
        d.font = F(10, color=GREY2); d.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[top].height = 16
        ws.row_dimensions[desc].height = 26
        thin_bottom(ws, desc, 6, 7, color="ECECEC")

    # ----- critical steps box -----
    cr0 = 12 + N_ING + 1          # one blank row after ingredients
    ws.cell(row=cr0, column=2, value="CRITICAL STEPS").font = F(10, bold=True, color=RED)
    pink = PatternFill("solid", fgColor=PINK)
    redbar = Border(left=side(RED, "thick"))
    for k in range(1, N_CRIT + 1):
        r = cr0 + k
        ws.merge_cells(f"B{r}:D{r}")
        ws.cell(row=r, column=12,  # hidden match idx in L
            value=f'=IFERROR(MATCH({SEL}&"|"&{k},CritKey,0),"")')
        lr = f"$L${r}"
        c = ws.cell(row=r, column=2,
            value=f'=IF({lr}="","","!   "&INDEX(CritText,{lr}))')
        c.font = F(10, color=INK); c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.row_dimensions[r].height = 22
    # pink fill + red left bar over the whole box
    for r in range(cr0, cr0 + N_CRIT + 1):
        for col in range(2, 5):
            ws.cell(row=r, column=col).fill = pink
        lb = ws.cell(row=r, column=2)
        b = lb.border
        lb.border = Border(left=side(RED,"thick"), top=b.top, bottom=b.bottom, right=b.right)

    # ----- storage -----
    sr = cr0 + N_CRIT + 2
    ws.cell(row=sr, column=2, value="STORAGE & HANDLING").font = F(10, bold=True, color=BLACK)
    thin_bottom(ws, sr, 2, 4, color=BLACK)
    ws.merge_cells(f"B{sr+1}:D{sr+3}")
    s = ws.cell(row=sr+1, column=2, value=f'=IFERROR(INDEX(RecStorage,{M}),"")')
    s.font = F(10, color=GREY2); s.alignment = Alignment(wrap_text=True, vertical="top")

    # ----- optional cost box (cost card only) -----
    if cost:
        br = sr + 5
        ws.cell(row=br, column=2, value="COSTING").font = F(10, bold=True, color=RED)
        thin_bottom(ws, br, 2, 4, color=RED)
        rows = [
            ("Plate cost / yield unit",
             f'=IFERROR(SUMIF(IngRecipe,{SEL},IngLineCost)/INDEX(RecYieldQty,{M}),"")', "$#,##0.00"),
            ("Food cost %",
             f'=IFERROR(SUMIF(IngRecipe,{SEL},IngLineCost)/INDEX(RecYieldQty,{M})/INDEX(RecMenu,{M}),"")', "0.0%"),
            ("Batch cost (× scale)",
             f'=IFERROR(SUMIF(IngRecipe,{SEL},IngLineCost)*{FAC},"")', "$#,##0.00"),
        ]
        for n,(label, formula, fmt) in enumerate(rows):
            rr = br + 1 + n
            ws.cell(row=rr, column=2, value=label).font = F(9, color=GREY2)
            ws.merge_cells(f"B{rr}:C{rr}")
            v = ws.cell(row=rr, column=4, value=formula)
            v.font = F(11, bold=True, color=BLACK); v.number_format = fmt
            v.alignment = Alignment(horizontal="right")
        foot = br + 5
    else:
        foot = sr + 5

    # ----- footer -----
    ws.cell(row=foot, column=2, value="FOXTOWN BREWING · KITCHEN BUILD CARD").font = F(8, color=GREY)
    cat = ws.cell(row=foot, column=7, value=f'=IF({M}="","",UPPER(INDEX(RecCategory,{M})))')
    cat.font = F(8, color=GREY); cat.alignment = Alignment(horizontal="right")
    thin_bottom(ws, foot - 1, 2, 7, color=HAIR)

    # hide helper cols & set print area / landscape
    for col in "JKL": ws.column_dimensions[col].hidden = True
    ws.print_area = f"A2:H{foot}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = ws.page_margins.bottom = 0.4

cook = wb.create_sheet("Build Card", 0)
build_card(cook, cost=False)
costcard = wb.create_sheet("Build Card $", 1)
build_card(costcard, cost=True)
wb.active = 0

wb.save(OUT)
print("wrote", OUT)
