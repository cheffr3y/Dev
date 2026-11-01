#!/usr/bin/env bash
# Starts a NEW disposable cluster. Never reads the application's database URL.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PREP_PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
if [ ! -x "$PG_BIN/initdb" ]; then
  PG_BIN="$(dirname "$(command -v initdb)")"
fi
PREP_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/prep-postgres.XXXXXXXX")"
PREP_TEST_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
cleanup() { "$PG_BIN/pg_ctl" -D "$PREP_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PREP_TEST_DIR"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$PREP_TEST_DIR/data" -A trust --no-locale -U prep_test >/dev/null
"$PG_BIN/pg_ctl" -D "$PREP_TEST_DIR/data" -l "$PREP_TEST_DIR/postgres.log" -o "-h 127.0.0.1 -p $PREP_TEST_PORT -k $PREP_TEST_DIR" -w start >/dev/null
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PREP_TEST_PORT" -U prep_test prep_workflow_test
export DATABASE_URL="postgresql://prep_test@127.0.0.1:$PREP_TEST_PORT/prep_workflow_test?connection_limit=8"
export PREP_DISPOSABLE_DB=1
"$PG_BIN/psql" "postgresql://prep_test@127.0.0.1:$PREP_TEST_PORT/prep_workflow_test" -v ON_ERROR_STOP=1 -q -f prisma/migrations/20260923000000_existing_schema/migration.sql
node node_modules/prisma/build/index.js migrate resolve --applied 20260923000000_existing_schema
"$PG_BIN/psql" "postgresql://prep_test@127.0.0.1:$PREP_TEST_PORT/prep_workflow_test" -v ON_ERROR_STOP=1 -q -f scripts/fixtures/prep-legacy.sql
node node_modules/prisma/build/index.js migrate deploy
node --import tsx --test lib/db/database-pool.integration.test.ts
node --import tsx --test lib/prep/prep-workflow.integration.test.ts
node --import tsx --test lib/production/event-planning.integration.test.ts
node --import tsx --test lib/accounting/operating-calendar.integration.test.ts
node scripts/archive/test-annex-repairs.mjs
if [ "${PREP_BROWSER_SMOKE:-0}" = "1" ]; then
  BROWSER_SELECTED=()
  if [ -n "${BROWSER_SUITES:-}" ]; then read -r -a BROWSER_SELECTED <<< "$BROWSER_SUITES"; fi
  # Keep existing flags working; multiple flags now run every requested suite.
  for pair in \
    "MORNING_PULSE_BROWSER_SMOKE:morning-pulse" "MENU_ROLLOUT_BROWSER_SMOKE:menu-rollout" \
    "PRINT_CONTROLLER_BROWSER_SMOKE:print-controller" "PRODUCTION_JOBS_BROWSER_SMOKE:production-jobs" \
    "WORKSPACE_BROWSER_SMOKE:workspace" "ACCOUNTING_INVOICES_BROWSER_SMOKE:accounting-invoices" \
    "OPERATING_CALENDAR_BROWSER_SMOKE:operating-calendar" "EVENT_PLANNING_BROWSER_SMOKE:event-planning"; do
    flag="${pair%%:*}"
    if [ "${!flag:-0}" = "1" ]; then BROWSER_SELECTED+=("${pair#*:}"); fi
  done
  case " ${BROWSER_SELECTED[*]} " in *" event-planning "*) BROWSER_SELECTED+=("banquet-setup");; esac
  case " ${BROWSER_SELECTED[*]} " in *" print-controller "*) BROWSER_SELECTED+=("recipe-costing");; esac
  node --import tsx scripts/seed-prep-browser.ts
  case " ${BROWSER_SELECTED[*]} " in *" morning-pulse "*) node --import tsx scripts/seed-morning-pulse-browser.ts;; esac
  for suite in "${BROWSER_SELECTED[@]}"; do
    case "$suite" in workspace|event-planning|banquet-setup|print-controller|recipe-costing|production-jobs|accounting-invoices)
      node --import tsx scripts/seed-print-controller-browser.ts; break;;
    esac
  done
  export AUTH_SECRET='disposable-prep-browser-smoke-secret-2026'
  export AUTH_URL='http://localhost:3107'
  export AUTH_TRUST_HOST=true
  if [ "${PREP_BROWSER_DEV:-0}" = "1" ]; then
    node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3107 &
  else
    node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107 &
  fi
  PREP_SERVER_PID=$!
  trap 'kill "$PREP_SERVER_PID" 2>/dev/null || true; cleanup' EXIT
  if [ "${#BROWSER_SELECTED[@]}" -gt 0 ]; then
    node scripts/browser/run.mjs "${BROWSER_SELECTED[@]}"
  else
    # Preserve the manual fixture-server workflow when no suites are selected.
    wait "$PREP_SERVER_PID"
  fi
fi
