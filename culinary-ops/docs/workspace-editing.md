# Faster catalog and recipe editing

Managers and admins can edit catalog cells in **Ingredients** and **Order Guides**. Staff retain read-only access.

- Click a price, cost unit, vendor, item number, GCODE, or pack size to edit it. Tab and Shift+Tab move between cells; Enter moves down the same column. Leaving a changed cell saves it. Escape restores the last saved value.
- A green **Saved** flash confirms persistence. Failed edits keep your entry and show a retry control. If another person changed the same field, choose **Use latest** or explicitly retry your edit. Changes to other fields are preserved.
- Price is per cost unit. Pack size is descriptive; structured pack quantities and yield factors remain in the full ingredient editor. Catalog changes apply wherever that ingredient is used.
- Order Guide par and order unit apply only to that guide. Stock and price quantities are converted between compatible units. Incompatible units or missing prices produce a partial total with a visible warning.

## Keyboard recipe entry

On a recipe, type an ingredient and press Tab to choose the highlighted match. Enter quantity, Tab to unit, then press Enter to add it. The next ingredient search receives focus after the save. Arrow keys select other matches. Optional notes, groups, and sort order remain available. Invalid or failed submissions retain your entry.

## Inspect without leaving the workspace

Select a recipe or ingredient in a menu, banquet, or prep order to open the side panel. Select ingredients or sub-recipes inside the recipe card to inspect those records, and use **Back** to return. Managers and admins can edit ingredient purchasing fields and the recipe's standard yield. Saved changes refresh the parent workspace's current costing; recipe yield changes also enter its changelog.

**Close inspector** and Escape return to the original page and focus. Unsaved or failed edits must be resolved or explicitly discarded before closing. Full details remain available in a separate tab. The panel adapts to phones, and staff can inspect without editing.

Frozen prep packets and existing accounting records retain their captured facts. No migration or new service configuration is required.

## Verification

Run `npm test` and `npm run test:transactions`. After a production build, use `PREP_BROWSER_SMOKE=1 WORKSPACE_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` with the repository's Playwright module and executable overrides. The harness creates a disposable database, tests keyboard entry and concurrent/error recovery flows, and saves desktop/mobile screenshots in `/tmp/workspace-editing-review`.
