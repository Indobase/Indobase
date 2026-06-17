#!/usr/bin/env bash
# Fleet rollout: add tenant-site nginx + Traefik root routing to existing tenant stacks.
#
# Usage (on VPS):
#   DATA_PLANE_PROVISIONER_TOKEN=... bash docker/scripts/ensure-tenant-site-hosting-fleet.sh
#
# Optional:
#   PROVISIONER_URL=http://127.0.0.1:8787
set -euo pipefail

PROVISIONER_URL="${PROVISIONER_URL:-http://127.0.0.1:8787}"
TOKEN="${DATA_PLANE_PROVISIONER_TOKEN:-${PROVISIONER_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  ENV_FILE="${DOCKER_ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
  if [[ -f "$ENV_FILE" ]]; then
    TOKEN="$(grep -m1 '^DATA_PLANE_PROVISIONER_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"
  fi
fi

if [[ -z "$TOKEN" ]]; then
  echo "Set DATA_PLANE_PROVISIONER_TOKEN or PROVISIONER_TOKEN" >&2
  exit 1
fi

echo "=== Ensure tenant-site hosting fleet $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
curl -sS -X POST "${PROVISIONER_URL%/}/ensure-site-fleet" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool 2>/dev/null || true
