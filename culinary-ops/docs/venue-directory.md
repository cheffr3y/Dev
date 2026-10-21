# Shared venue and room directory

The company directory is used by Menu Rollouts, Holiday & To-Go, Events,
Banquets, Festivals, prep requests and deliveries, ingredient-supply selectors,
accounting filters, user assignments, inventory and scheduling.

## Standard names and grouping

- Foxtown Brewpub
- The Annex
  - Renard's
  - 11's Lounge
- The Station
  - Zimmerman
  - Foxyard
  - Opitz
  - Ice House
  - Ice House Mezzanine
- Foxtown Heritage Meats
- Interurban Coffee Shop

Selectors group rooms under their parent. The parent is also selectable for
plans covering the entire property. Room IDs remain separate operational
destinations; grouping does not combine stock, change venue permissions or
move accounting charges to the parent automatically.

`lib/venue-directory.ts` defines the names, known aliases and grouping.
`components/VenueOptions.tsx` renders the same options in every workflow.
`getVenues()` returns the standard directory; current legacy selections remain
available when editing, and reports retain legacy locations for historical
filtering. A legacy home venue or active-venue cookie still resolves its own
stock and schedule rather than silently switching to another property.

Venue administration edits addresses and notes. Standard names and groupings
are maintained centrally, preventing separate features from creating competing
location lists. Event location/room fields and schedule notes offer shared
suggestions, standardize exact known aliases when saving, and preserve offsite
addresses and other authored details.

## Existing data

The additive `20261020200000_venue_directory` migration runs through the existing
production startup migration command. It adds a unique directory key, parent
reference and display order, renames known aliases in place and creates missing
venues and rooms. Existing IDs, short codes, addresses, notes, assignments,
inventory and operational foreign keys are retained.

An existing exact canonical name wins over an older alias. If multiple records
represent a location, only one becomes the standard choice; others keep their
separate IDs and data, with normalized names, as legacy records. No stock,
users or accounting history is merged. Short-code collisions on newly added
locations use a suffix without changing an existing code.

Ambiguous labels such as Banquets and Foxtown Landing remain intact as legacy
records, outside new selections. They can still be inspected and filtered in
history. Individual assignments need explicit review before moving them.
Frozen packets and accounting snapshots are not rewritten.

## Validation

Run `npm test`, `npx tsc --noEmit`, `npm run build`, and lint changed files.
`npm run test:venues` creates a disposable PostgreSQL database, applies the
previous release, inserts legacy and duplicate fixtures, then deploys the new
migration. It verifies directory names/grouping, unchanged IDs and codes,
separate inventory, preserved user/event/prep assignments and frozen JSON.
Browser checks cover grouped selectors across eight workflows, historical
filters, legacy edit preservation, creating a plan for an Annex room, staff
access and mobile layout. Set `PREP_PLAYWRIGHT_MODULE` and
`PREP_BROWSER_EXECUTABLE` if Playwright/Chromium are outside default paths.
`VENUE_REVIEW_DIR` controls screenshots (default `/tmp/venue-directory-review`).
