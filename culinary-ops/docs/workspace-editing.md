# Faster catalog and recipe editing

Managers and admins can edit catalog cells in **Ingredients** and **Order Guides**. Staff retain read-only access.

- Click a price, cost unit, vendor, item number, GCODE, or pack size to edit it. Tab and Shift+Tab move between cells; Enter and Shift+Enter move down/up the same column. Arrow keys move between adjacent cells; horizontal arrows preserve caret editing until the text edge, or navigate immediately when the whole value is selected. Vendor lists retain native arrow selection; Alt+arrows navigate out of the list. Leaving a changed cell saves it. Escape restores the last saved value.
- A small pending indicator and a green check/border flash confirm save progress and persistence. Failed edits keep your entry and show a retry control. If another person changed the same field, choose **Use latest** or explicitly retry your edit. Changes to other fields are preserved.
- Price is per cost unit. Pack size is descriptive; structured pack quantities and yield factors remain in the full ingredient editor. Catalog changes apply wherever that ingredient is used.
- Order Guide totals update immediately when a valid cell is committed, while its save runs in the background. Errors roll the estimate back to the last known server value and retain the typed draft for retry. Par and order unit apply only to that guide. Stock and price quantities are converted between compatible units. Incompatible units or missing prices produce a partial total with a visible warning.

## Daily prep keyboard entry

Production, destination, shortage, waste, labor and lot fields support arrow navigation and Enter / Shift+Enter between matching visible fields across recipe groups. Closed detail sections and disabled fields are skipped. Tab keeps the normal form order, including optional controls and notes. Escape restores the current field to the value it had when focused. Multiline notes keep native text editing.

Typing immediately updates the existing local production totals. Keyboard navigation never posts production/accounting records: use **Preview charges**, review the result, and choose **Save item results**. Enter in a navigable field cannot implicitly submit the form. Existing unsaved-change warnings and retry protection still apply.

## Keyboard recipe entry

On a recipe, type an ingredient and press Tab to choose the highlighted match. Enter quantity, Tab to unit, then press Enter to add it. The next ingredient search receives focus after the save. Arrow keys select other matches. Optional notes, groups, and sort order remain available. Invalid or failed submissions retain your entry.

## Inspect without leaving the workspace

Select a recipe or ingredient in a menu, banquet, or prep order to open the side panel. Select ingredients or sub-recipes inside the recipe card to inspect those records, and use **Back** to return. Managers and admins can edit ingredient purchasing fields and the recipe's standard yield. Saved changes refresh the parent workspace's current costing; recipe yield changes also enter its changelog.

**Close inspector** and Escape return to the original page and focus. Unsaved or failed edits must be resolved or explicitly discarded before closing. Full details remain available in a separate tab. The panel adapts to phones, and staff can inspect without editing.

Frozen prep packets and existing accounting records retain their captured facts. No migration or new service configuration is required.

## Verification

Run `npm test` and `npm run test:transactions`. After a production build, use `PREP_BROWSER_SMOKE=1 WORKSPACE_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` with the repository's Playwright module and executable overrides. The harness creates a disposable database, tests keyboard entry and concurrent/error recovery flows, and saves desktop/mobile screenshots in `/tmp/workspace-editing-review`.
## Shareable workspace state

Recipe search, category, and ordering are stored as `q`, `category`, and `sort` URL parameters. Ingredient search, category, and price/usage flags also survive reloads and browser history. Recipe filters use the native History API; ingredient filters use Next.js client navigation.

An open inspector is encoded as `inspect=recipe:<id>` or `inspect=item:<id>`. Repeated `inspect` parameters preserve the nested recipe/ingredient trail. For example, `/recipes?q=sauce&inspect=recipe:recipe-id` opens that record over the filtered catalog. Copy the current address to share it. Browser back/forward restores the trail, and the inspector's Back and Close controls preserve other filters. Invalid or unsaved inline edits block browser history navigation until saved or discarded. A blocked history move restores the current address and clears the attempted forward branch.

Command search opens recipe and ingredient results through these inspector URLs. Full details remain available through the inspector's new-tab link.

Invoice documents use `q` (filename, invoice number, or vendor name), `vendor` (vendor ID), `sort` (`newest` or `oldest`), and `id` (selected document). Filtering, selecting an invoice, and uploading a new document retain the other archive filters. The list shows up to 50 matching documents.

Regression coverage: run the `url-state`, `workspace`, and `accounting-invoices` browser suites in separate disposable harnesses; see [repository structure](repository-structure.md).
