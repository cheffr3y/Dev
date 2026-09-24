# Daily Prep and Closeout

## Chefs: order and cook

Open **Prep Orders → Daily Prep** and choose the day.

1. **Place order:** choose the needed date and your venue, then add recipes, quantities, units, and any instructions. Chefs can change unprinted orders for their assigned home venue. Admins can manage every venue. If no venue is assigned, ask an admin to assign one.
2. **Use the daily list:** recipes are grouped together, with a total and each venue’s portion. Everyone signed in can see the shared list.
3. **Print prep sheet:** a manager or admin generates the cook packet. Chefs can view and reprint it. Printed recipes, lots, destination quantities, and cooling logs remain frozen even if recipes later change. Printed orders cannot be edited; add another order for additional needs.

Daily Prep contains no cost-entry or accounting work.

## Admins: fill in the daily worksheet

Open **Closeout & Accounting**, choose the day, and fill in the recipes already listed.

1. Enter **Made**, **Sent to each venue**, **Cook**, and optional **Notes**. Actual quantities start blank. Use **Use ordered quantities** only when they match what happened.
2. If less was sent, explain the shortage. If there was waste, open **Waste, if any** and enter its quantity and reason. **Kept** is calculated as made minus sent minus waste; it does not establish an inventory balance.
3. Recipe production time is applied automatically. Open **Labor** to enter dishwasher time or override production time/rates. Missing time stays pending; **0 means explicitly none**. Default rates are $62/3 per production hour (about $20.67) and $18 per dishwasher hour.
4. Enter an actual lot when combining requests with different printed lots. Otherwise, the printed lot is reused or a lot is assigned automatically.
5. **Preview charges**, then **Save item results**. Other unfinished items stay on the worksheet with their entries intact. The app warns before leaving unsaved entries. If a save’s connection is interrupted, retry it before changing that item; the same operation key retrieves the original result without creating another charge.

### Example: Brewpub supplied the bacon

Under Brewpub’s Borracho Beans delivery, open **Ingredient supplied by a venue**. Choose bacon, enter the supplied amount and unit, and add a note such as “Brewpub supplied the bacon.” The source venue is filled in for that delivery.

The preview shows food before deduction, the ingredient deduction, both labor charges, and the net charge. The deduction reduces Brewpub’s food charge only. Other venues and labor stay unchanged. A note by itself does not change costs.

The deduction cannot exceed the amount of bacon included in that delivery. Excess amounts show an error rather than being allocated to another venue. Missing prices or incompatible units show **Needs cost review**; the affected charge stays out of ready totals until resolved. Shared supplies from older records retain their existing review status.

Use **Extra pickup without an order** only for additional pickups. Pickups use a captured recipe estimate and require no batch or stock count. Open a saved delivery for a linked return or correction; saved original results are preserved.

## Admins: finish and export

1. **Finish day** after all requests have results or shortage notes. Missing costs do not prevent finishing the operational day.
2. Open **Review & export accounting**. The date range starts with that day; change it for a larger period if needed.
3. Review **Venue Summary**, **Ready Charges**, and **Pending Issues**. Incomplete charges are excluded from ready totals. Expand the supporting tables for ingredient detail, supplied-ingredient notes, production notes, labor, waste, and corrections.
4. Download **Excel** or **CSV**. Both use the same calculation. Each download creates an immutable report snapshot; **Previous exports** lets you download that exact snapshot again. Exporting never creates another charge and does not post or email anything to Acumatica.

Use **Complete missing costs** on a delivery to fill only missing values, citing their source. This preserves frozen quantities and known prices, and remains available after closeout. Late completions are identified for review of the original accounting period.

Returns refund original net food and both labor charges, with a linked waste record. Corrections reverse the remaining original charge and create a replacement on an open adjustment date. Original records and historical exports remain unchanged. Transfer dates determine delivery charges; adjustments have their own dates.

All closeout, cost preview, correction, accounting, and export access requires a current admin account. Managers retain packet-generation access, while chef ordering follows the account’s assigned home venue. Business dates use America/Chicago.
