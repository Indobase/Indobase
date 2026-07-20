#!/usr/bin/env bash
# Host capacity valve: pause tenant data-plane stacks when more are running than the host can hold.
#
# This is the HARD valve, not the idle policy. The graceful path is the plan-aware idle sweep in
# apps/studio (plan-lifecycle.ts), which sleeps a project once it passes its plan's idleSleepDays.
# This script exists for the case where too many stacks are awake RIGHT NOW regardless of policy,
# and something must be stopped to keep the box alive.
#
# Eviction order (cheapest customer first):
#   1. Lowest plan tier goes first — free, then basic, pro, studio, enterprise/platform
#   2. Within a tier, least recently active goes first
#   3. Projects pinned `keep_warm` are evicted LAST (a pin is a strong hint, not a guarantee —
#      if pinned stacks alone exceed the cap, some still have to stop, and we log loudly)
#
# Without STUDIO_PG_URL there is no plan data, so it degrades to "stop the extras arbitrarily".
# Set STUDIO_PG_URL in production or paying customers will be evicted alongside free ones.
#
# Stopped stacks: `docker compose stop` (data volumes retained; routes may 502 until resumed).
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

# Refs ordered WORST-to-KEEP first (i.e. evict from the top of this list).
#
# Ranking mirrors plan-entitlements.ts: free(0) < basic(1) < pro(2) < studio/team(3) <
# enterprise(4) < platform(5). We sort ascending by rank so the cheapest tier is evicted first,
# and ascending by last activity so the most dormant project within a tier goes before an
# actively-used one. `keep_warm` sorts pinned projects to the very end.
eviction_order_from_db() {
  if [[ -z "$STUDIO_PG_URL" ]]; then
    return 0
  fi
  docker run --rm postgres:15-alpine psql "$STUDIO_PG_URL" -tA -c "
    select p.ref
    from saas.projects p
    join saas.organizations o on o.id = p.organization_id
    where not coalesce(p.is_branch, false)
    order by
      coalesce(p.keep_warm, false) asc,
      case lower(coalesce(o.plan, 'free'))
        when 'platform' then 5
        when 'enterprise' then 4
        when 'studio' then 3
        when 'team' then 3
        when 'pro' then 2
        when 'basic' then 1
        else 0
      end asc,
      greatest(
        coalesce(p.updated_at, p.inserted_at),
        coalesce(
          (select max(d.updated_at) from saas.project_deployments d where d.project_ref = p.ref),
          p.inserted_at
        )
      ) asc nulls first
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

need_stop=$((count - MAX_RUNNING))

# Set membership test for "is this ref currently running".
declare -A is_running=()
for ref in "${running[@]}"; do
  is_running["$ref"]=1
done

#
# Build the eviction list: DB order first (worst candidates first), restricted to refs that are
# actually running. Anything running but absent from the DB (orphan stack, deleted project) is
# appended first — an orphan is the best possible thing to stop.
#
to_stop=()
declare -A queued=()

while IFS= read -r ref; do
  [[ -n "$ref" ]] || continue
  [[ -n "${is_running[$ref]:-}" ]] || continue
  [[ -n "${queued[$ref]:-}" ]] && continue
  queued["$ref"]=1
  to_stop+=("$ref")
done < <(eviction_order_from_db)

if [[ "${#to_stop[@]}" -eq 0 && -z "$STUDIO_PG_URL" ]]; then
  echo "WARNING: STUDIO_PG_URL unset — no plan data, evicting arbitrarily. Paying tenants may be stopped."
fi

# Orphans (running but not in the DB result) go to the FRONT — safest to stop.
orphans=()
for ref in "${running[@]}"; do
  [[ -n "${queued[$ref]:-}" ]] && continue
  orphans+=("$ref")
  queued["$ref"]=1
done
if [[ "${#orphans[@]}" -gt 0 ]]; then
  echo "orphan_stacks=${#orphans[@]} (not in saas.projects — stopping these first)"
  to_stop=("${orphans[@]}" "${to_stop[@]}")
fi

echo "eviction_candidates=${#to_stop[@]} need_stop=$need_stop"

idx=0
for ref in "${to_stop[@]}"; do
  [[ "$idx" -ge "$need_stop" ]] && break
  stop_tenant_stack "$ref"
  idx=$((idx + 1))
done

if [[ "$idx" -lt "$need_stop" ]]; then
  echo "WARNING: wanted to pause $need_stop but only $idx had a compose file; host is still over capacity."
fi

echo "done paused=$idx"
