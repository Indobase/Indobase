#!/usr/bin/env bash
# Repair all SaaS tenant stacks on the VPS: network name, aux passwords, compose up, auth grants.
# Run on the host: bash docker/scripts/repair-tenant-stacks-on-vps.sh
set -euo pipefail

TENANTS_ROOT="${TENANTS_ROOT:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data}"
DB_CONTAINER="${DB_CONTAINER:-indobase-db}"
NET_NAME="${SAAS_DOCKER_NETWORK_NAME:-indobase-backend-bmqhan_default}"
PG_ADMIN_USER="${PG_ADMIN_USER:-supabase_admin}"
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-${POSTGRES_PASSWORD:-}}"
AUX_PASS="${SAAS_DATA_PLANE_AUX_ROLE_PASSWORD:-}"

if [[ -z "$PG_ADMIN_PASSWORD" ]]; then
  echo "Set PG_ADMIN_PASSWORD or POSTGRES_PASSWORD (supabase_admin login)" >&2
  exit 1
fi
if [[ -z "$AUX_PASS" ]]; then
  echo "Set SAAS_DATA_PLANE_AUX_ROLE_PASSWORD" >&2
  exit 1
fi

PW_LIT="'${AUX_PASS//\'/\'\'}'"

psql_admin() {
  docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$1" -v ON_ERROR_STOP=1 -c "$2"
}

repair_ref() {
  local ref="$1"
  local dir="$TENANTS_ROOT/$ref"
  local dbname="tenantdb_${ref//-/_}"
  local tenant_role="tenant_${ref//-/_}"

  [[ -f "$dir/docker-compose.yml" ]] || return 0

  echo ""
  echo ">>> $ref"

  if grep -q 'name: indobase_default' "$dir/docker-compose.yml" 2>/dev/null; then
    sed -i "s/name: indobase_default/name: ${NET_NAME}/g" "$dir/docker-compose.yml"
    echo "  patched external network -> $NET_NAME"
  fi

  for role in authenticator supabase_admin supabase_auth_admin supabase_storage_admin; do
    psql_admin "$dbname" "alter role \"$role\" password $PW_LIT" || true
  done
  psql_admin "$dbname" "alter schema auth owner to supabase_auth_admin" 2>/dev/null || true

  psql_admin "$dbname" "grant connect, create on database \"$dbname\" to authenticator, supabase_admin, supabase_auth_admin, supabase_storage_admin" || true
  psql_admin "$dbname" "grant all on schema storage to supabase_storage_admin, supabase_admin, authenticator" || true
  psql_admin "$dbname" "grant all on schema _realtime to supabase_admin, authenticator" || true

  # Realtime AES-128 requires a 16-character DB_ENC_KEY (older stacks used 24).
  if grep -q "DB_ENC_KEY:" "$dir/docker-compose.yml"; then
    key=$(grep "DB_ENC_KEY:" "$dir/docker-compose.yml" | head -1 | sed -n "s/.*DB_ENC_KEY: '\\([^']*\\)'.*/\\1/p")
    if [[ -n "$key" && ${#key} -gt 16 ]]; then
      newkey="${key:0:16}"
      sed -i "s/DB_ENC_KEY: '${key}'/DB_ENC_KEY: '${newkey}'/" "$dir/docker-compose.yml"
      echo "  patched DB_ENC_KEY length (${#key} -> 16)"
    fi
  fi

  # Edge runtime needs an explicit start command and a main router file.
  if ! grep -q 'main-service' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" <<'PY'
import sys
path = sys.argv[1]
text = open(path).read()
needle = "    ports:\n      - \"127.0.0.1:"
idx = text.find("  tenant-functions:")
if idx == -1:
    sys.exit(0)
port_idx = text.find(needle, idx)
if port_idx == -1 or "command:" in text[idx:port_idx]:
    sys.exit(0)
insert = """    command:
      - start
      - --main-service
      - /home/deno/functions/main
"""
open(path, "w").write(text[:port_idx] + insert + text[port_idx:])
PY
    echo "  added tenant-functions start command"
  fi

  vol="indobase-tenant-${ref}_tenant-functions-${ref}"
  if docker volume inspect "$vol" >/dev/null 2>&1; then
    stub="$(mktemp)"
    cat >"$stub" <<'TS'
Deno.serve(async (req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean)
  const name = parts[0]
  if (!name) {
    return new Response(JSON.stringify({ msg: "missing function name" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (e) {
    return new Response(JSON.stringify({ msg: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
TS
    docker run --rm -v "$vol:/f" -v "$stub:/seed/index.ts:ro" alpine sh -c 'mkdir -p /f/main && cp /seed/index.ts /f/main/index.ts' >/dev/null
    rm -f "$stub"
    echo "  seeded functions main"
  fi

  (cd "$dir" && docker compose up -d) >/dev/null

  local ready="f" i=0
  while [[ $i -lt 30 ]]; do
    ready=$(docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
      psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$dbname" -tAc \
      "select to_regclass('auth.users') is not null" 2>/dev/null || echo "f")
    [[ "$ready" == "t" ]] && break
    i=$((i + 1))
    sleep 3
  done

  if [[ "$ready" != "t" ]]; then
    echo "  WARN: auth.users not ready for $ref"
    return 1
  fi

  psql_admin "$dbname" "grant usage on schema auth to \"$tenant_role\""
  psql_admin "$dbname" "grant select on all tables in schema auth to \"$tenant_role\""
  psql_admin "$dbname" "alter default privileges in schema auth grant select on tables to \"$tenant_role\""
  echo "  ok: auth.users + grants for $tenant_role"
}

for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  repair_ref "$ref" || true
done

echo ""
echo "=== Summary ==="
for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  dbname="tenantdb_${ref//-/_}"
  tenant_role="tenant_${ref//-/_}"
  auth=$(docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$dbname" -tAc \
    "select to_regclass('auth.users') is not null" 2>/dev/null || echo "?")
  priv=$(docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$dbname" -tAc \
    "select has_table_privilege('$tenant_role', 'auth.users', 'SELECT')" 2>/dev/null || echo "?")
  echo "$ref | auth.users=$auth | select=$priv"
done

echo ""
echo "=== Service health ==="
for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  (cd "$TENANTS_ROOT/$ref" && docker compose ps --format '{{.Service}}:{{.Status}}' 2>/dev/null) | tr '\n' ' '
  echo " ($ref)"
done
