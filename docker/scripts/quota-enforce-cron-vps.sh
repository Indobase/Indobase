#!/usr/bin/env bash
# Hourly quota enforcement — calls Studio cron API on the VPS.
#
# Usage:
#   bash docker/scripts/quota-enforce-cron-vps.sh
#
# Reads INDOBASE_CRON_SECRET or DATA_PLANE_PROVISIONER_TOKEN from docker/.env when unset.
set -euo pipefail

STUDIO_URL="${STUDIO_URL:-https://studio.indobase.in}"
SECRET="${INDOBASE_CRON_SECRET:-${DATA_PLANE_PROVISIONER_TOKEN:-}}"

if [[ -z "$SECRET" ]]; then
  ENV_FILE="${DOCKER_ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
  if [[ -f "$ENV_FILE" ]]; then
    SECRET="$(grep -m1 '^INDOBASE_CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
    if [[ -z "$SECRET" ]]; then
      SECRET="$(grep -m1 '^DATA_PLANE_PROVISIONER_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
    fi
  fi
fi

if [[ -z "$SECRET" ]]; then
  echo "Set INDOBASE_CRON_SECRET or DATA_PLANE_PROVISIONER_TOKEN" >&2
  exit 1
fi

echo "=== Quota enforce $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
curl -sS -X POST "${STUDIO_URL%/}/api/cron/quota-enforce" \
  -H "Authorization: Bearer ${SECRET}" \
  -H 'Content-Type: application/json' | python3 -m json.tool 2>/dev/null || true
