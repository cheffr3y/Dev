# Custom Menus

**Custom Menus** (Culinary & Events → Custom Menus, `/custom-menus`) hold one-off
menus built for a single occasion: an internal BBQ, a pop-up, a tasting. Each
menu lives on its own page and prints one packet to send.

## Build a menu

1. **New custom menu**: name, optional subtitle, date, service time and venue,
   guest count, optional price per guest, target food cost %, and notes.
   - *Service notes* print on every copy.
   - *Internal notes* print on the full (costed) copy only.
2. **Add a dish**: pick any saved recipe or sub-recipe (a sauce or rub can be
   served on its own). For each dish set either:
   - **Portion per guest**: e.g. 8 oz brisket × 120 guests; or
   - **Fixed total**: e.g. 2 gal BBQ sauce. A fixed total replaces the
     per-guest amount.
   Units are limited to the recipe's own family (weight, volume or count) so
   an amount always converts to the recipe yield.
3. Optional **menu title** and **menu description** print on the menu page.
   Sections (Mains, Sides, Sauces & Condiments, …) order the menu.

Need a dish that doesn't exist yet? Create it as a normal recipe first, then add
it. Custom Menus do not hold temporary recipes.

A dish that can't be costed (no portion, no guests, a unit that doesn't
convert, or a recipe without a usable yield) is flagged and left out of the
totals, the scaled recipes and the pull list. The app never guesses.

**Duplicate this menu** copies the dishes to a new draft without a date, for
recurring one-offs.

## The packet

Two copies of the same packet. Use the browser's **Print / Save as PDF** to
make the file to send.

| Section | Full packet | Kitchen / client copy |
| --- | --- | --- |
| Cover and menu with descriptions and allergens | ✓ | ✓ |
| Costing rollup: total, per guest, food cost %, share by dish | ✓ | — |
| Allergen grid (dish × major allergens, plus other tags) | ✓ | ✓ |
| Scaled recipes; shared sub-recipes printed once, up front | ✓ | ✓ |
| Ingredient pull list | ✓ | ✓ |
| Internal notes | ✓ | — |

The kitchen / client copy contains no dollar amounts.

## Calculations

- Dish amount = guests × portion, or the fixed total; converted to the recipe's
  yield unit to give batches.
- Cost = batches × the recipe's fully loaded batch cost, including nested
  sub-recipes, from **current** ingredient prices. Reprint after price changes.
- Food cost % = total food cost ÷ (price per guest × guests), shown only when a
  price per guest is entered.
- Allergens are inherited from recipe tags, ingredient tags and sub-recipes.
  Verify labels and cross-contact before sharing with guests.

## Access and deployment

Everyone signed in can view and print. Managers and admins create, edit,
duplicate and delete; these writes check the account's current role in the
database.

Apply migration `20261125000000_custom_menus` (two new tables; additive). The
standard `npm start` runs `prisma migrate deploy` before serving.
