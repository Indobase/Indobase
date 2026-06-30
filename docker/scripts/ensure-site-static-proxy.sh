#!/usr/bin/env sh
set -eu

PORT="${SITE_STATIC_PROXY_PORT:-8790}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "site-static-proxy already listening on :${PORT}"
  exit 0
fi

if [ "${SITE_STATIC_PROXY_ENABLED:-}" != "true" ]; then
  echo "SITE_STATIC_PROXY_ENABLED is not true; skipping proxy ensure"
  exit 0
fi

echo "site-static-proxy is not listening on :${PORT}"
echo "Restart data-plane-provisioner with SITE_STATIC_PROXY_ENABLED=true"
exit 1
