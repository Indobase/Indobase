#!/usr/bin/env bash
# Collect usage metrics for all SaaS projects via Studio cron API.
#
# Usage:
#   bash docker/scripts/usage-collect-fleet-cron-vps.sh
#
# Requires STUDIO_PG_URL or docker/.env Postgres vars to list project refs.
set -euo pipefail

STUDIO_URL="${STUDIO_URL:-https://studio.indobase.in}"
SECRET="${INDOBASE_CRON_SECRET:-${DATA_PLANE_PROVISIONER_TOKEN:-}}"
ENV_FILE="${DOCKER_ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"

if [[ -z "$SECRET" && -f "$ENV_FILE" ]]; then
  SECRET="$(grep -m1 '^INDOBASE_CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
  if [[ -z "$SECRET" ]]; then
    SECRET="$(grep -m1 '^DATA_PLANE_PROVISIONER_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
  fi
fi

if [[ -z "$SECRET" ]]; then
  echo "Set INDOBASE_CRON_SECRET or DATA_PLANE_PROVISIONER_TOKEN" >&2
  exit 1
fi

if [[ -z "${STUDIO_PG_URL:-}" && -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_PASSWORD|POSTGRES_HOST|POSTGRES_PORT|POSTGRES_DB|POSTGRES_USER)=' "$ENV_FILE" | sed 's/^/export /')
  STUDIO_PG_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-indobase-db}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-postgres}"
fi

if [[ -z "${STUDIO_PG_URL:-}" ]]; then
  echo "Set STUDIO_PG_URL or provide docker/.env with Postgres vars" >&2
  exit 1
fi

echo "=== Usage collect fleet $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
mapfile -t refs < <(
  docker exec indobase-db psql -U postgres -d postgres -tA -c "
    select ref from saas.projects
    where coalesce(is_branch, false) = false
      and status = 'ACTIVE_HEALTHY'
    order by ref
  " 2>/dev/null
)

ok=0
fail=0
for ref in "${refs[@]}"; do
  [[ -n "$ref" ]] || continue
  if curl -fsS -G "${STUDIO_URL%/}/api/cron/usage-collect" \
    --data-urlencode "project_ref=${ref}" \
    -H "Authorization: Bearer ${SECRET}" >/dev/null; then
    ok=$((ok + 1))
  else
    echo "FAIL $ref" >&2
    fail=$((fail + 1))
  fi
done

echo "{\"success\":true,\"collected\":${ok},\"failed\":${fail},\"total\":${#refs[@]}}"
