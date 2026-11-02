# Repository structure and checks

Application URLs stay the same. This organization changes source locations, not stored operational data, costing rules, accounting history, or the migration-first production start command.

## Domains

`lib/` contains domain folders with explicit imports; there is no catch-all barrel that pulls server/database code into browser or Edge bundles.

| Folder | Responsibility |
| --- | --- |
| `recipes/`, `ingredients/` | Recipe costing, methods, units, allergens, ingredient editing and consolidation |
| `prep/`, `production/` | Prep requests, frozen packets, workflow, accounting, project logs and event purchasing demand |
| `banquets/`, `menus/` | BEO setup/baselines, menus, festivals and To-Go plans |
| `invoices/`, `accounting/` | Compact documents, invoice reviews/ingredient prices, monthly calendar and workbook exports |
| `db/`, `auth/` | Shared Prisma client and pool limits; authentication, current-user checks and return paths |
| `dashboard/`, `navigation/`, `workspace/`, `printing/` | Morning Pulse, action palette, workspace editing and print controls |
| `venues/`, `schedule/`, `purchasing/` | Venue directory, shifts and shopping helpers |
| `smoking/` | Smoker runs/lots, local OCR parsing, authenticated sources, yields and audited review |
| `games/` | Homestead saves/rules and trivia engine/content |

Tests live beside the domain they verify. `npm test` discovers unit tests in `lib/`, `app/` and `scripts/archive/`; it excludes `*.integration.test.ts`, which require their disposable database harnesses.

## Game layouts

`app/(app)/layout.tsx` is the culinary operations shell. Authenticated `/homestead` and `/trivia` live under `app/(games)/` with their own layout, account check, small navigation and sign-out form. Games do not load the operations sidebar, command search or its recipe/ingredient catalog queries. Account-save ownership and mutation checks remain in place.

The public trivia player surface remains under `app/play/`, and its room/token API remains under `app/api/trivia/`. Moving the host page must not make joining a room require an account.

## Browser checks

All browser cases live under `scripts/browser/cases/`. The shared harness supplies Chromium configuration, the local application origin, server readiness and disposable-database validation. The runner executes selected cases sequentially in separate processes and stops on the first failure. It supports the existing `PREP_PLAYWRIGHT_MODULE` and `PREP_BROWSER_EXECUTABLE` overrides.

List suites without starting a browser:

```bash
npm run test:browser -- --list
```

Build once, then run checks through a fresh database harness:

```bash
npm run build
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="games-shell workspace" npm run test:transactions
PREP_BROWSER_SMOKE=1 BROWSER_SUITES="operating-calendar accounting-invoices" npm run test:transactions
PREP_BROWSER_SMOKE=1 EVENT_PLANNING_BROWSER_SMOKE=1 PRINT_CONTROLLER_BROWSER_SMOKE=1 npm run test:transactions
HOMESTEAD_BROWSER_SMOKE=1 npm run test:homestead
npm run test:to-go
npm run test:venues
```

The prep harness selects supporting fixtures from the requested suite names. Existing feature smoke flags still work and can be combined; every requested suite runs instead of the first feature flag exiting early. `PREP_BROWSER_SMOKE=1` without suite names or feature flags retains the manual fixture-server workflow. While that server is running, use `node scripts/browser/run.mjs <suite>` with its exported disposable database settings and local `AUTH_URL`.

Suites that edit shared fixtures should use a fresh harness per documented group. Morning Pulse uses its dedicated fixture set and should run separately from print/workspace fixture groups. Homestead, To-Go and venue-directory suites have their own database harnesses. The runner rejects unknown names, remote database URLs, mismatched fixture databases and non-local web origins before executing cases. These checks are for disposable fixtures, never production.

## Archived operations scripts

Completed backfills and the Annex launch repair, its helper and regression checks live under `scripts/archive/`. Existing named package commands still point to the archived versions for deliberate operator use. Archiving does not run them or remove their preview, snapshot or apply protections.

See [the archive notes](../scripts/archive/README.md) before using them. Current releases use committed Prisma migrations through `npm start`; historical `db push` instructions in old scripts are not the current rollout procedure.

The root `.gitignore` excludes Finder `.DS_Store` files at every depth. The previously tracked root copy is no longer versioned.
