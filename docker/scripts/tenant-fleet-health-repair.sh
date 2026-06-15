#!/usr/bin/env bash
# Fleet-wide tenant stack health repair — run on the VPS via cron (every 5–10 min).
#
# Usage:
#   DATA_PLANE_PROVISIONER_TOKEN=... bash docker/scripts/tenant-fleet-health-repair.sh
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

echo "=== Tenant fleet repair $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
curl -sS -X POST "${PROVISIONER_URL%/}/repair-fleet" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"cron_fleet_repair"}' | python3 -m json.tool 2>/dev/null || true

echo "=== Public API probe ==="
DOMAIN="${SAAS_PUBLIC_DOMAIN:-indobase.in}"
TENANTS_ROOT="${TENANTS_ROOT:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data}"
fail=0
for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  rest=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' "https://${ref}.${DOMAIN}/rest/v1/" 2>/dev/null || echo err)
  auth=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' "https://${ref}.${DOMAIN}/auth/v1/health" 2>/dev/null || echo err)
  if [[ "$rest" =~ ^(502|503|000|err)$ || "$auth" =~ ^(502|503|000|err)$ ]]; then
    echo "FAIL $ref rest=$rest auth=$auth"
    fail=$((fail + 1))
  fi
done
echo "probe_failures=$fail"
exit 0
