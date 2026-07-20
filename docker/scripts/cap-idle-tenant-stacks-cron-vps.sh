#!/usr/bin/env bash
# Cap idle tenant stacks on the VPS (see cap-idle-tenant-stacks.sh).
#
# Usage:
#   bash docker/scripts/cap-idle-tenant-stacks-cron-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${DOCKER_ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
MAX_RUNNING="${MAX_RUNNING_TENANT_STACKS:-12}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_PASSWORD|POSTGRES_HOST|POSTGRES_PORT|POSTGRES_DB|POSTGRES_USER)=' "$ENV_FILE" | sed 's/^/export /')
  export STUDIO_PG_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-indobase-db}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-postgres}"
else
  # Without this the capacity valve has no plan data and evicts paying tenants alongside free ones.
  echo "WARNING: env file $ENV_FILE not found — STUDIO_PG_URL unset, eviction will not be plan-aware."
fi

echo "=== Cap idle tenant stacks $(date -u +%Y-%m-%dT%H:%M:%SZ) max=${MAX_RUNNING} ==="
MAX_RUNNING_TENANT_STACKS="$MAX_RUNNING" bash "${ROOT}/scripts/cap-idle-tenant-stacks.sh"
