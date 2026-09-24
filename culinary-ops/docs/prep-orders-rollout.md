# Prep Orders rollout checklist

Implementation preparation only: no live migration or deployment is part of this change.

## Review and rehearse

- Back up the database and prove the restore on a disposable copy.
- Compare the actual existing schema to `20260923000000_existing_schema/migration.sql`. This is a baseline of the previously un-migrated Prisma schema, not a migration to run over existing tables. Reconcile any schema drift before marking it applied. Review the existing migration history if the target already has one.
- Review `20260924000000_prep_daily_workflow/migration.sql`: it adds tables/columns, relaxes nullability for manual pickups and unknown amounts, adds a unique request-delivery link, and enforces append-only audit records and closed history using PostgreSQL triggers. It does not drop tables, rewrite historical amounts, mutate inventory, or backfill legacy Prep Orders into transfers.
- Run `npm run lint`, `npm test`, `npm run test:transactions`, `npx prisma validate`, and `npm run build`. Transaction tests create and destroy a separate loopback PostgreSQL cluster and ignore the application's DATABASE_URL. Set `PREP_PG_BIN` to the installed PostgreSQL `bin` directory if needed.
- Rehearse on a restored copy: verify counts and exact stored amounts in PrepOrderLine, ProductionBatch, StockTransfer, TransferExclusion, FinishedStockAdjustment and InventoryItem before/after. Existing data gets accounting state LEGACY, never synthetic costs or deliveries.
- Verify the kitchen's 22 qt / 10+12 split, retained production, shortages, missing labor, and later pickups. Check venue totals against ingredient and labor detail. Check cost-completion and return reports spanning multiple periods.
- Historical packets without frozen contents intentionally show unavailable instead of today's recipe. Retain existing paper/PDF copies separately. The old Back-entry and Production routes redirect to Today; old stock mutation actions are retired.
- Ensure the catalog's production standard covers the whole preparation, including nested recipes. A null standard is pending; a zero standard is explicit. Existing zero ingredient prices are treated as missing until explicitly completed.
- Record shared venue supplies as facts and leave affected charges held for review. Do not invent a cross-venue allocation policy.

## Approved deployment window (operator-run, not executed by this task)

1. Stop old application instances/workers from accepting mutations, including stale stock-entry forms. Deploying old and new writers concurrently is not supported.
2. Back up again; record database identity and baseline counts. On an existing database verified to match the baseline, mark **only the baseline** applied:
   ```sh
   npx prisma migrate resolve --applied 20260923000000_existing_schema
   ```
   Skip this command if already baselined. On an empty database, `migrate deploy` applies both migrations normally.
3. Apply reviewed migrations with `npx prisma migrate deploy`, then `npx prisma generate`. Do not substitute `db push`: it omits the audit-protection triggers.
4. Deploy the new application, invalidate old clients, and sign in as manager and staff. Verify manager-only operational writes and accounting access, Today default, request history, frozen packet reprints, and downloads.
5. Reconcile preserved row counts/values and take a first export snapshot. Retain its ID with the accounting review. Record a test in staging, not fabricated production activity.

## Recovery

The schema is additive and historical tables remain present, but old application code assumes every transfer has a batch and complete numbers. **Do not roll old code over new nullable transfers.** If recovery is necessary, stop writes and roll forward with a compatible fix, or restore the backed-up database and matching application together after reconciling new operational records. Do not delete or mutate audit snapshots or amendments to force a rollback.

## Implementation notes

- Central service: `lib/prep-workflow.ts`; server actions validate data and check the current database role. Serializable transactions, day-guard writes, operation keys plus canonical payload hashes, unique constraints and five bounded retries protect concurrent writes. Every command saves its result atomically with its operation receipt.
- Cost snapshots contain only the reachable recipe graph (maximum 500 recipes), captured catalog information, quantities, split weights, rates and supply facts. Missing amounts stay nullable. Production labor is calculated once from the root standard. Currency allocation is integer cents with stable request ordering.
- Food, production labor and dishwasher cost are allocated over delivered, kept and production-waste quantities. Only delivery rows create venue charges. No inventory, FIFO, opening count or running balance is maintained.
- Operations and amendments retain author IDs. Credits and waste link back to the transfer; reversal snapshots link to replacement IDs. Immutable export snapshots preserve the shared report output and membership.
- Dates are validated Chicago business-day labels stored at UTC midnight. Reports use a maximum one-year period and reject more than 5,000 records rather than silently truncating totals. Daily screens, selection lists, packet graphs and history queries are bounded.
