# Archived one-off operations

These scripts are retained for historical recovery and review. They are not part of application startup and must not be run routinely against an existing installation.

- `backfill-prep-prodcodes.ts`: legacy prep-module adoption before the migration baseline.
- `backfill-recipe-versions.ts`: historical recipe-version backfill.
- `backfill-day-events.ts`: historical event/calendar backfill.
- `repair-annex-launch.ts` and `annex-launch-repairs.ts`: the reviewed Annex launch correction, with preview-first behavior and required apply snapshot.
- `annex-launch-repairs.test.ts` and `test-annex-repairs.mjs`: pure/helper and disposable-database regression checks for that repair.

Existing `db:backfill-versions`, `db:backfill-day-events`, and `db:repair-annex-launch` package commands still resolve here. Read each script and its original rollout documentation before using it. Moving a script here does not authorize production writes.

For current deployments, use committed migrations through `npm start` / `npm run db:deploy`, not historical `db push` instructions. The repair regression is invoked by `scripts/test-prep-postgres.sh` only on its disposable loopback database.
