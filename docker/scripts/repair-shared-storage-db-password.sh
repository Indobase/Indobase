#!/usr/bin/env bash
# Sync Supabase service-role DB passwords with POSTGRES_PASSWORD on the shared stack.
# Fixes storage-api (supabase_storage_admin) and Supavisor (supabase_admin) SCRAM auth.
#
# Symptom: GET https://api.<domain>/storage/v1/bucket → 500, logs show
#   password authentication failed for user "supabase_storage_admin" (28P01)
#
# Cause: pg_hba trusts 127.0.0.1, so `psql -h 127.0.0.1` can succeed even when the
# role password does not match POSTGRES_PASSWORD. Storage connects over the Docker
# network (scram-sha-256) and fails until the role password is updated.
#
# Usage (on the VPS, from the compose project directory):
#   export POSTGRES_PASSWORD='your-postgres-password'
#   bash docker/scripts/repair-shared-storage-db-password.sh

set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-indobase-db}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-indobase-storage}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD is required" >&2
  exit 1
fi

escape_sql() {
  printf "%s" "$1" | sed "s/'/''/g"
}

pass_escaped="$(escape_sql "$POSTGRES_PASSWORD")"

echo "Updating Supabase role passwords on ${DB_CONTAINER} (SCRAM/TCP)..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<EOF
ALTER USER supabase_storage_admin WITH PASSWORD '${pass_escaped}';
ALTER USER supabase_auth_admin WITH PASSWORD '${pass_escaped}';
ALTER USER supabase_functions_admin WITH PASSWORD '${pass_escaped}';
ALTER USER authenticator WITH PASSWORD '${pass_escaped}';
ALTER USER pgbouncer WITH PASSWORD '${pass_escaped}';
EOF

echo "Verifying from ${STORAGE_CONTAINER} (TCP/scram, same as storage-api)..."
docker exec "$STORAGE_CONTAINER" node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query('SELECT 1 AS ok'))
  .then((r) => { console.log('storage DATABASE_URL OK', r.rows[0]); return c.end(); })
  .catch((e) => { console.error('storage DATABASE_URL failed:', e.message); process.exit(1); });
"

POOLER_CONTAINER="${POOLER_CONTAINER:-indobase-pooler}"
if docker ps --format '{{.Names}}' | grep -qx "$POOLER_CONTAINER"; then
  echo "Restarting ${POOLER_CONTAINER}..."
  docker restart "$POOLER_CONTAINER" >/dev/null
  sleep 12
  if docker exec "$POOLER_CONTAINER" curl -sSfL --head -o /dev/null http://127.0.0.1:4000/api/health; then
    echo "Supavisor health OK"
  else
    echo "WARN: Supavisor health still failing — check docker logs ${POOLER_CONTAINER}" >&2
  fi
fi

echo "Done. Retry: curl -sS https://api.indobase.in/storage/v1/status"
