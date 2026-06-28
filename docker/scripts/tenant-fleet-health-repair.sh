#!/usr/bin/env bash
# Fleet-wide tenant stack health repair — run on the VPS via cron (every 5–10 min).
#
# Usage:
#   DATA_PLANE_PROVISIONER_TOKEN=... bash docker/scripts/tenant-fleet-health-repair.sh
#
# Optional:
#   PROVISIONER_URL=http://127.0.0.1:8787
#   PROVISIONER_CONTAINER=indobase-data-plane-provisioner
#   REPAIR_FAILED_PROBES=1   # call /repair-stack for each tenant that still fails probe
set -euo pipefail

PROVISIONER_URL="${PROVISIONER_URL:-}"
PROVISIONER_CONTAINER="${PROVISIONER_CONTAINER:-indobase-data-plane-provisioner}"
TOKEN="${DATA_PLANE_PROVISIONER_TOKEN:-${PROVISIONER_TOKEN:-}}"
REPAIR_FAILED_PROBES="${REPAIR_FAILED_PROBES:-1}"

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

provisioner_post() {
  local path="$1"
  local body="${2:-{}}"
  if [[ -n "$PROVISIONER_URL" ]]; then
    curl -sS -m 600 -X POST "${PROVISIONER_URL%/}${path}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d "$body"
    return
  fi
  if docker ps --format '{{.Names}}' | grep -qx "$PROVISIONER_CONTAINER"; then
    docker exec "$PROVISIONER_CONTAINER" wget -qO- \
      --timeout=600 \
      --post-data="$body" \
      --header="Authorization: Bearer ${TOKEN}" \
      --header='Content-Type: application/json' \
      "http://127.0.0.1:8787${path}" 2>/dev/null
    return
  fi
  echo '{"ok":false,"message":"provisioner unreachable"}' >&2
  return 1
}

echo "=== Tenant fleet repair $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
provisioner_post '/repair-fleet' '{"reason":"cron_fleet_repair"}' | python3 -m json.tool 2>/dev/null || true

echo "=== Public API probe ==="
DOMAIN="${SAAS_PUBLIC_DOMAIN:-indobase.in}"
VPS_IP="${VPS_IP:-187.77.30.165}"
TENANTS_ROOT="${TENANTS_ROOT:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data}"
FORCE_RESOLVE="${FORCE_TENANT_PROBE_RESOLVE:-1}"
fail=0
declare -a FAILED_REFS=()

probe_https() {
  local url="$1"
  local host="$2"
  if [[ "$FORCE_RESOLVE" == "1" && -n "$host" ]]; then
    curl -sS -m 8 --resolve "${host}:443:${VPS_IP}" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo err
  else
    curl -sS -m 8 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo err
  fi
}

# ref -> public API base (when production uses a custom domain proxy)
declare -A TENANT_PUBLIC_ALIASES=(
  [adralproject-uspulzkzew]="https://adral.ai"
)

probe_tenant() {
  local ref="$1"
  local host="${ref}.${DOMAIN}"
  local rest auth
  rest=$(probe_https "https://${host}/rest/v1/" "$host")
  auth=$(probe_https "https://${host}/auth/v1/health" "$host")
  if [[ "$rest" =~ ^(502|503|000|err)$ || "$auth" =~ ^(502|503|000|err)$ ]]; then
    echo "FAIL $ref rest=$rest auth=$auth (tenant host)"
    FAILED_REFS+=("$ref")
    fail=$((fail + 1))
    return 1
  fi
  echo "OK   $ref rest=$rest auth=$auth"
  return 0
}

for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  probe_tenant "$ref" || true

  alias_url="${TENANT_PUBLIC_ALIASES[$ref]:-}"
  if [[ -n "$alias_url" ]]; then
    alias_host="${alias_url#https://}"
    alias_host="${alias_host%%/*}"
    arest=$(probe_https "${alias_url%/}/rest/v1/" "$alias_host")
    aauth=$(probe_https "${alias_url%/}/auth/v1/health" "$alias_host")
    if [[ "$arest" =~ ^(502|503|000|err)$ || "$aauth" =~ ^(502|503|000|err)$ ]]; then
      echo "FAIL $ref alias rest=$arest auth=$aauth (${alias_url})"
      fail=$((fail + 1))
    else
      echo "OK   $ref alias rest=$arest auth=$aauth (${alias_url})"
    fi
  fi
done

if [[ "$REPAIR_FAILED_PROBES" == "1" && "${#FAILED_REFS[@]}" -gt 0 ]]; then
  echo "=== Per-tenant repair-stack (${#FAILED_REFS[@]} failures) ==="
  for ref in "${FAILED_REFS[@]}"; do
    echo "REPAIR $ref"
    provisioner_post '/repair-stack' "{\"project_ref\":\"${ref}\",\"reason\":\"cron_probe_failure\"}" \
      | python3 -m json.tool 2>/dev/null || true
    sleep 2
    probe_tenant "$ref" || true
  done
fi

echo "probe_failures=$fail"
exit 0
