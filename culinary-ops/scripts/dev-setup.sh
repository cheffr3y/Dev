#!/usr/bin/env bash
# Boots a local Postgres, applies the schema, and seeds demo data.
# Safe to re-run. Intended for local dev and ephemeral cloud sessions
# where no external database is configured.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$APP_DIR/.pgdata"
PGSOCK="/tmp"
PGPORT="${PGPORT:-5432}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1 || true)"

if [ -z "$PGBIN" ]; then
  echo "Postgres server binaries not found. Install postgresql or point DATABASE_URL at a remote DB and run: npm run db:push && npm run db:seed"
  exit 1
fi

# initdb refuses to run as root, so run the server as the 'postgres' user when we are root.
RUNNER=""
if [ "$(id -u)" = "0" ]; then
  RUNNER="runuser -u postgres --"
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "Initializing Postgres cluster in $PGDATA ..."
  $RUNNER "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
fi

if ! $RUNNER "$PGBIN/pg_isready" -h "$PGSOCK" -p "$PGPORT" >/dev/null 2>&1; then
  echo "Starting Postgres ..."
  $RUNNER "$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/pg.log -o "-p $PGPORT -k $PGSOCK" start >/dev/null
  sleep 2
fi

$RUNNER "$PGBIN/createdb" -h "$PGSOCK" -p "$PGPORT" culinary_ops 2>/dev/null || true

if [ ! -f "$APP_DIR/.env" ]; then
  echo "Creating .env ..."
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat > "$APP_DIR/.env" <<EOF
DATABASE_URL="postgresql://postgres@localhost:$PGPORT/culinary_ops?schema=public"
AUTH_SECRET="$SECRET"
EOF
fi

cd "$APP_DIR"
echo "Applying schema ..."
npm run db:push --silent
echo "Seeding demo data ..."
npm run db:seed --silent
echo ""
echo "Ready. Start the app with:  npm run dev"
echo "Login: admin@culinaryops.test / password123"
