#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-http://localhost:8082}"

echo "Running Studio production smoke checks against: ${BASE_URL}"

echo
echo "1) Checking /api/health"
health_status="$(curl -sS -o /tmp/studio-health.json -w "%{http_code}" "${BASE_URL%/}/api/health")"
if [[ "${health_status}" != "200" ]]; then
  echo "Health check failed: HTTP ${health_status}"
  echo "Response:"
  cat /tmp/studio-health.json
  exit 1
fi
echo "Health check OK (HTTP 200)"

echo
echo "2) Checking Studio root"
root_status="$(curl -sS -o /tmp/studio-root.html -w "%{http_code}" "${BASE_URL%/}/")"
if [[ "${root_status}" != "200" && "${root_status}" != "302" && "${root_status}" != "307" ]]; then
  echo "Studio root check failed: HTTP ${root_status}"
  exit 1
fi
echo "Studio root check OK (HTTP ${root_status})"

echo
echo "Smoke checks passed."
