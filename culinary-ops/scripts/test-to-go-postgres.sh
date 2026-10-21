#!/usr/bin/env bash
# New isolated database only; never loads the application's DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PREP_PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
TO_GO_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/to-go-postgres.XXXXXXXX")"
TO_GO_TEST_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
TO_GO_SERVER_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
TO_GO_SERVER_PID=""
cleanup() {
  if [ -n "$TO_GO_SERVER_PID" ]; then kill "$TO_GO_SERVER_PID" 2>/dev/null || true; fi
  "$PG_BIN/pg_ctl" -D "$TO_GO_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TO_GO_TEST_DIR"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$TO_GO_TEST_DIR/data" -A trust --no-locale -U to_go_test >/dev/null
"$PG_BIN/pg_ctl" -D "$TO_GO_TEST_DIR/data" -l "$TO_GO_TEST_DIR/postgres.log" -o "-h 127.0.0.1 -p $TO_GO_TEST_PORT -k $TO_GO_TEST_DIR" -w start >/dev/null
"$PG_BIN/createdb" -h 127.0.0.1 -p "$TO_GO_TEST_PORT" -U to_go_test to_go_test
export DATABASE_URL="postgresql://to_go_test@127.0.0.1:$TO_GO_TEST_PORT/to_go_test?connection_limit=8"
export TO_GO_DISPOSABLE_DB=1
export AUTH_SECRET='disposable-to-go-browser-secret-2026'
export AUTH_URL="http://localhost:$TO_GO_SERVER_PORT"
export AUTH_TRUST_HOST=true
node node_modules/prisma/build/index.js migrate deploy
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$TO_GO_SERVER_PORT" >"$TO_GO_TEST_DIR/next.log" 2>&1 &
TO_GO_SERVER_PID=$!
node -e 'const url=process.env.AUTH_URL+"/login"; (async()=>{for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{} await new Promise(resolve=>setTimeout(resolve,200));}process.exit(1);})()'
if ! node scripts/test-to-go-browser.mjs; then cat "$TO_GO_TEST_DIR/next.log"; exit 1; fi
