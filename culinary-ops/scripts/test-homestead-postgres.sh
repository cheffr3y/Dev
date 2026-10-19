#!/usr/bin/env bash
# Isolated cluster and synthetic accounts only. Never reads the application's DB URL.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PREP_PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
if [ ! -x "$PG_BIN/initdb" ]; then PG_BIN="$(dirname "$(command -v initdb)")"; fi
HOMESTEAD_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/homestead-postgres.XXXXXXXX")"
HOMESTEAD_TEST_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
HOMESTEAD_SERVER_PID=""
cleanup() {
  if [ -n "$HOMESTEAD_SERVER_PID" ]; then kill "$HOMESTEAD_SERVER_PID" 2>/dev/null || true; fi
  "$PG_BIN/pg_ctl" -D "$HOMESTEAD_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$HOMESTEAD_TEST_DIR"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$HOMESTEAD_TEST_DIR/data" -A trust --no-locale -U homestead_test >/dev/null
"$PG_BIN/pg_ctl" -D "$HOMESTEAD_TEST_DIR/data" -l "$HOMESTEAD_TEST_DIR/postgres.log" -o "-h 127.0.0.1 -p $HOMESTEAD_TEST_PORT -k $HOMESTEAD_TEST_DIR" -w start >/dev/null
"$PG_BIN/createdb" -h 127.0.0.1 -p "$HOMESTEAD_TEST_PORT" -U homestead_test homestead_test
export DATABASE_URL="postgresql://homestead_test@127.0.0.1:$HOMESTEAD_TEST_PORT/homestead_test?connection_limit=8"
export HOMESTEAD_DISPOSABLE_DB=1
node node_modules/prisma/build/index.js migrate deploy
node --import tsx --test lib/homestead-storage.integration.test.ts
if [ "${HOMESTEAD_BROWSER_SMOKE:-0}" = "1" ]; then
  export AUTH_SECRET='disposable-homestead-browser-secret-2026'
  export AUTH_URL='http://localhost:3108'
  export AUTH_TRUST_HOST=true
  node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3108 &
  HOMESTEAD_SERVER_PID=$!
  node -e 'const url="http://localhost:3108/login"; (async()=>{for(let attempt=0;attempt<100;attempt++){try{if((await fetch(url)).ok) return;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}process.exit(1);})()'
  if [ "${HOMESTEAD_PREVIEW_ONLY:-0}" = "1" ]; then wait "$HOMESTEAD_SERVER_PID"; else node scripts/test-homestead-browser.mjs; fi
fi
