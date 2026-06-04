#!/usr/bin/env bash
# Quick tenant data-plane health check (REST + Auth must not be 502/503).
# Usage:
#   TENANT_HOST=adralproject-uspulzkzew.indobase.in ./docker/scripts/tenant-api-health-check.sh
#   ./docker/scripts/tenant-api-health-check.sh adralproject-uspulzkzew.indobase.in
set -euo pipefail

HOST="${TENANT_HOST:-${1:-}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: TENANT_HOST=<ref>.indobase.in $0" >&2
  echo "   or: $0 <ref>.indobase.in" >&2
  exit 1
fi
BASE="https://${HOST}"

fail=0
check() {
  local name="$1" url="$2" expect_re="$3"
  local code body
  code=$(curl -sS -m 15 -o /tmp/tenant-health-body.txt -w '%{http_code}' "$url" || echo "000")
  body=$(head -c 200 /tmp/tenant-health-body.txt 2>/dev/null || true)
  if [[ "$code" =~ $expect_re ]]; then
    echo "OK   $name  HTTP $code  $url"
  else
    echo "FAIL $name  HTTP $code  $url"
    echo "     body: $body"
    fail=1
  fi
}

# REST: OpenAPI root or 401 without apikey is fine; 502/503 means gateway/upstream down.
check "REST"    "$BASE/rest/v1/"           '^(200|401|404)$'
# Auth: GoTrue health JSON
check "Auth"    "$BASE/auth/v1/health"     '^(200)$'
# Optional extras (non-blocking for exit unless STRICT=1)
check "Storage" "$BASE/storage/v1/bucket"  '^(200|400|401)$' || true
check "Functions" "$BASE/functions/v1/"    '^(200|400|404)$' || true

if [[ "${STRICT:-}" == "1" && $fail -ne 0 ]]; then
  exit 1
fi
exit $fail
