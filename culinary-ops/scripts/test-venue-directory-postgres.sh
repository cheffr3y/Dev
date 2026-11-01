#!/usr/bin/env bash
# Old-name fixtures and migrations in a brand-new cluster only.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PREP_PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
VENUE_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/venue-postgres.XXXXXXXX")"
VENUE_TEST_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
VENUE_SERVER_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
VENUE_SERVER_PID=""
cleanup() {
  if [ -n "$VENUE_SERVER_PID" ]; then kill "$VENUE_SERVER_PID" 2>/dev/null || true; fi
  "$PG_BIN/pg_ctl" -D "$VENUE_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$VENUE_TEST_DIR"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$VENUE_TEST_DIR/data" -A trust --no-locale -U venue_test >/dev/null
"$PG_BIN/pg_ctl" -D "$VENUE_TEST_DIR/data" -l "$VENUE_TEST_DIR/postgres.log" -o "-h 127.0.0.1 -p $VENUE_TEST_PORT -k $VENUE_TEST_DIR" -w start >/dev/null
"$PG_BIN/createdb" -h 127.0.0.1 -p "$VENUE_TEST_PORT" -U venue_test venue_test
export DATABASE_URL="postgresql://venue_test@127.0.0.1:$VENUE_TEST_PORT/venue_test?connection_limit=8"
export VENUE_DISPOSABLE_DB=1
# Apply the existing release, insert old-name records, then deploy the new migration.
mkdir "$VENUE_TEST_DIR/prisma"
cp prisma/schema.prisma "$VENUE_TEST_DIR/prisma/schema.prisma"
cp -R prisma/migrations "$VENUE_TEST_DIR/prisma/migrations"
rm -r "$VENUE_TEST_DIR/prisma/migrations/20261020200000_venue_directory"
node node_modules/prisma/build/index.js migrate deploy --schema "$VENUE_TEST_DIR/prisma/schema.prisma"
"$PG_BIN/psql" "postgresql://venue_test@127.0.0.1:$VENUE_TEST_PORT/venue_test" -v ON_ERROR_STOP=1 -q -f scripts/fixtures/venue-directory-legacy.sql
node node_modules/prisma/build/index.js migrate deploy
export AUTH_SECRET='disposable-venue-browser-secret-2026'
export AUTH_URL="http://localhost:$VENUE_SERVER_PORT"
export AUTH_TRUST_HOST=true
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$VENUE_SERVER_PORT" >"$VENUE_TEST_DIR/next.log" 2>&1 &
VENUE_SERVER_PID=$!
if ! node scripts/browser/run.mjs venue-directory; then cat "$VENUE_TEST_DIR/next.log"; exit 1; fi
