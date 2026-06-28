#!/usr/bin/env bash
# Pause tenant data-plane stacks when the host is over capacity (2 vCPU cannot run 40+ full stacks).
#
# Keeps up to MAX_RUNNING_TENANT_STACKS stacks running, preferring:
#   1. Projects marked ACTIVE_HEALTHY in saas.projects (when STUDIO_PG_URL is set)
#   2. Otherwise tenants with running compose services
#
# Stopped stacks: `docker compose stop` (data volumes retained; Traefik routes may 502 until resumed).
#
# Usage on VPS:
#   MAX_RUNNING_TENANT_STACKS=12 STUDIO_PG_URL='postgresql://...' bash docker/scripts/cap-idle-tenant-stacks.sh
#   DRY_RUN=1 ...  # print actions only
set -euo pipefail

LOCK_FILE="${LOCK_FILE:-/var/lock/indobase-cap-idle-tenant-stacks.lock}"
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another cap-idle run is already in progress; exiting."
  exit 0
fi

TENANTS_ROOT="${TENANTS_ROOT:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data}"
MAX_RUNNING="${MAX_RUNNING_TENANT_STACKS:-12}"
DRY_RUN="${DRY_RUN:-0}"
STUDIO_PG_URL="${STUDIO_PG_URL:-}"

# One docker ps per run — avoid N subprocesses when many tenants exist.
running_refs() {
  docker ps --format '{{.Names}}' 2>/dev/null \
    | sed -n 's/^indobase-tenant-\([^-]*\)-tenant-.*/\1/p' \
    | sort -u
}

priority_refs_from_db() {
  if [[ -z "$STUDIO_PG_URL" ]]; then
    return 0
  fi
  docker run --rm postgres:15-alpine psql "$STUDIO_PG_URL" -tA -c "
    select ref from saas.projects
    where not coalesce(is_branch, false)
      and status = 'ACTIVE_HEALTHY'
    order by updated_at desc nulls last, created_at desc
  " 2>/dev/null || true
}

stop_tenant_stack() {
  local ref="$1"
  local dir="$TENANTS_ROOT/$ref"
  [[ -f "$dir/docker-compose.yml" ]] || return 0
  echo "STOP $ref"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  (cd "$dir" && docker compose -f docker-compose.yml stop) 2>/dev/null || true
}

mapfile -t running < <(running_refs)
count="${#running[@]}"
echo "running_tenant_stacks=$count max=$MAX_RUNNING"

if [[ "$count" -le "$MAX_RUNNING" ]]; then
  echo "within cap — nothing to pause"
  exit 0
fi

declare -A keep=()
while IFS= read -r ref; do
  [[ -n "$ref" ]] || continue
  keep["$ref"]=1
done < <(priority_refs_from_db)

for ref in "${running[@]}"; do
  if [[ "${#keep[@]}" -ge "$MAX_RUNNING" ]]; then
    break
  fi
  keep["$ref"]=1
done

to_stop=()
for ref in "${running[@]}"; do
  [[ -n "${keep[$ref]:-}" ]] && continue
  to_stop+=("$ref")
done

need_stop=$((count - MAX_RUNNING))
echo "will_pause=${#to_stop[@]} (need ~$need_stop)"

idx=0
for ref in "${to_stop[@]}"; do
  [[ "$idx" -ge "$need_stop" ]] && break
  stop_tenant_stack "$ref"
  idx=$((idx + 1))
done

echo "done paused=$idx"
