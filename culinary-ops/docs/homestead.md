# Willowbrook Acre

Open **Break Room → Homestead** (`/homestead`) in Culinary Ops. All signed-in roles can play. Each account has its own garden, independent of the active venue and operational data.

## Tending the meadow

- **Gather** clears branches, stones and weeds, and harvests ripe crops. **Plant** sows free seeds on empty grass or soil; tapping a ripe crop with Plant harvests it without changing the selected tool.
- **Water** gives double growth at the next time step. Watering the same patch repeatedly adds no extra growth. Sunberries, clover and hibiscus take two growth steps; pumpkins take three.
- **Let time pass** advances growth and the time of day. Automatic growth does the same every 25 seconds while the page is visible. Pause it whenever you like. There is no offline catch-up or decay.
- Restore the pond, barn and arch to expand the sanctuary. Pond construction moves plants to available tiles instead of deleting them; if there is no room, it asks you to clear space before spending supplies.
- The field guide explains how to invite six companions. Requirements refer to ripe crops still on the meadow. Friends stay unlocked after harvesting. Each friend gives the listed gift once per garden day.
- Explore the woods once a day for renewable wood and stone, even if every tile is planted. The welcome parcel can be collected once per garden.

The board supports keyboard buttons and arrow-key movement. Expanded meadows scroll horizontally within the board on narrow phones so tiles remain usable. Reduced-motion preferences are respected. Sound starts off and can be enabled in settings.

## Saves and recovery

Changes save to the existing PostgreSQL database through authenticated Server Actions. The session determines the owner; no client-provided user ID is accepted. The save format is validated before writing. A revision compare-and-swap ensures only one of two concurrent saves succeeds.

Unsynced changes are backed up in browser storage under a per-user key. Failed requests show a retry button and retry on reconnection. The status distinguishes account saves, device-only backups, and storage failures. Download a JSON backup before clearing browser storage or switching devices with unsynced changes.

If another tab/device has saved newer progress, gameplay pauses and offers **Download this garden** and **Use account save**. Download first to preserve the local version; importing that backup after loading the account save is an explicit replacement. Conflicts never silently overwrite the account save.

**Save & settings** offers JSON downloads, reviewed imports and a confirmation before resetting. Imports accept the original `cozy_homestead_sanctuary.html` version-1 JSON exports and current version-2 saves. Legacy crop progress, resources, restorations and unlocked friends are retained. Companions hidden underneath plants are relocated. Invalid imports leave the current garden untouched. The original HTML file and its local browser storage are not modified or automatically claimed by an account.

## Release and verification

The additive migration `20261019000000_homestead_saves` creates `HomesteadSave` with a user foreign key, JSON state and revision. The deployment's existing `npm start` applies migrations before serving the app. No operational tables or historical records are altered.

- `npm test` includes pure gameplay, import-validation and long-running state-invariant checks.
- `npm run test:homestead` applies all migrations to a disposable local PostgreSQL cluster and verifies ownership isolation, malformed-save rejection, and competing/stale writes. It never reads the application database URL.
- After `npm run build`, run `HOMESTEAD_BROWSER_SMOKE=1 npm run test:homestead` for browser checks. Configure `PREP_PLAYWRIGHT_MODULE`, `PREP_BROWSER_EXECUTABLE` and `PREP_PG_BIN` if the tools are not on their default paths. The harness serves synthetic users on port 3108, checks gameplay/account persistence/conflicts/offline retry/mobile layout/import/reset, and removes its database on exit. Screenshots go to `/tmp/homestead-review` unless `HOMESTEAD_REVIEW_DIR` is set.

`HOMESTEAD_PREVIEW_ONLY=1 HOMESTEAD_BROWSER_SMOKE=1 npm run test:homestead` keeps that disposable preview running until stopped. Its synthetic logins are `staff@homestead.test` and `admin@homestead.test`, with password `local-homestead-only`.
