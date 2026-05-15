#!/usr/bin/env bash
# Patch Dokploy Studio Application env for split deploy:
#   - Backend = Docker Compose (meta, db, kong, …)
#   - Studio  = separate Dokploy Application (cannot resolve indobase-meta)
#
# Requires: DOKPLOY_API_URL, DOKPLOY_API_KEY, DOKPLOY_APPLICATION_ID
# Optional: PG_META_PUBLISH_PORT (default 8081), DOCKER_GATEWAY_IP (default 172.17.0.1)
#           SUPABASE_PUBLIC_URL (default https://api.indobase.in)
#
# Compose must publish meta (see docker-compose.yml PG_META_PUBLISH_PORT).

set -euo pipefail

: "${DOKPLOY_API_URL:?Set DOKPLOY_API_URL}"
: "${DOKPLOY_API_KEY:?Set DOKPLOY_API_KEY}"
: "${DOKPLOY_APPLICATION_ID:?Set DOKPLOY_APPLICATION_ID}"

META_PORT="${PG_META_PUBLISH_PORT:-8081}"
GATEWAY="${DOCKER_GATEWAY_IP:-172.17.0.1}"
META_URL="http://${GATEWAY}:${META_PORT}"
API_PUBLIC="${SUPABASE_PUBLIC_URL:-https://api.indobase.in}"
GOTRUE_PUBLIC="${API_PUBLIC%/}/auth/v1"

base="${DOKPLOY_API_URL%/}"

echo "Fetching Studio application env from Dokploy…"
current="$(curl -fsS -G "$base/api/application.one" \
  -H "accept: application/json" \
  -H "x-api-key: $DOKPLOY_API_KEY" \
  --data-urlencode "applicationId=$DOKPLOY_APPLICATION_ID" \
  | jq -r '.env // ""')"

set_var() {
  local env="$1" key="$2" val="$3"
  local line="${key}=${val}"
  if printf '%s\n' "$env" | grep -q "^${key}="; then
    printf '%s\n' "$env" | sed "s|^${key}=.*|${line}|"
  else
    printf '%s\n%s\n' "$env" "$line"
  fi
}

patched="$current"
patched="$(set_var "$patched" STUDIO_PG_META_URL "$META_URL")"
patched="$(set_var "$patched" SUPABASE_URL "$API_PUBLIC")"
patched="$(set_var "$patched" SUPABASE_PUBLIC_URL "$API_PUBLIC")"
patched="$(set_var "$patched" GOTRUE_URL "$GOTRUE_PUBLIC")"
patched="$(set_var "$patched" KONG_INTERNAL_GOTRUE_URL "$GOTRUE_PUBLIC")"
# POSTGRES_HOST stays db — connection strings are consumed by meta on the Compose network

echo "Saving env (STUDIO_PG_META_URL=$META_URL, SUPABASE_URL=$API_PUBLIC)…"
payload="$(jq -n \
  --arg id "$DOKPLOY_APPLICATION_ID" \
  --arg env "$patched" \
  '{applicationId: $id, env: $env, buildArgs: "", buildSecrets: "", createEnvFile: true}')"

curl -fsS -X POST "$base/api/application.saveEnvironment" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DOKPLOY_API_KEY" \
  -d "$payload" >/dev/null

echo "Redeploying Studio application…"
curl -fsS -X POST "$base/api/application.deploy" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DOKPLOY_API_KEY" \
  -d "{\"applicationId\":\"$DOKPLOY_APPLICATION_ID\"}" >/dev/null

echo "Done. Studio should reach postgres-meta at $META_URL after the container restarts."
