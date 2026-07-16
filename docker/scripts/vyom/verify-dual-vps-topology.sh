#!/usr/bin/env bash
# Verify Vyom dual-VPS DNS and service health.
set -euo pipefail

CONTROL_PLANE_IP="${CONTROL_PLANE_VPS_IP:-103.190.92.249}"
DATA_PLANE_IP="${DATA_PLANE_VPS_IP:-103.190.92.248}"
ZONE="${ZONE:-indobase.in}"

dig_a() {
  dig +short "$1" A 2>/dev/null | head -1 || true
}

fail=0

check_dns() {
  local host="$1"
  local expected="$2"
  local ip
  ip=$(dig_a "$host")
  if [[ "$ip" == "$expected" ]]; then
    echo "OK  $host -> $ip"
  else
    echo "FAIL $host -> ${ip:-NXDOMAIN} (expected $expected)"
    fail=1
  fi
}

echo "=== DNS (${ZONE}) ==="
check_dns "studio.${ZONE}" "$CONTROL_PLANE_IP"
check_dns "api.${ZONE}" "$CONTROL_PLANE_IP"
check_dns "builder.${ZONE}" "$CONTROL_PLANE_IP"
check_dns "test-tenant.${ZONE}" "$DATA_PLANE_IP"

echo ""
echo "=== HTTP ==="
if curl -fsS "https://studio.${ZONE}/api/health/live" >/dev/null 2>&1; then
  echo "OK  studio health"
else
  echo "WARN studio health check failed (DNS may still be propagating)"
fi

if curl -fsS "https://builder.${ZONE}/" -o /dev/null 2>&1; then
  echo "OK  builder"
else
  echo "WARN builder check failed"
fi

echo ""
echo "=== Provisioner (.248) ==="
if curl -fsS "http://${DATA_PLANE_IP}:8787/health" >/dev/null 2>&1; then
  echo "OK  provisioner :8787"
else
  echo "FAIL provisioner not reachable at ${DATA_PLANE_IP}:8787"
  fail=1
fi

exit "$fail"
