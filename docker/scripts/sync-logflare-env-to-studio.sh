#!/usr/bin/env bash
# Copy Logflare tokens from the Compose .env to the Studio Swarm service so logs/analytics work.
#
# Usage (on VPS):
#   bash docker/scripts/sync-logflare-env-to-studio.sh
#
# Optional:
#   DOCKER_DIR=/etc/dokploy/compose/indobase-backend-bmqhan/code/docker
#   STUDIO_FILTER=indobase-studio
#   LOGFLARE_URL=http://indobase-analytics:4000
set -euo pipefail

DOCKER_DIR="${DOCKER_DIR:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"
ENV_FILE="$DOCKER_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

get_env() {
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true
}

LOGFLARE_PUBLIC="$(get_env LOGFLARE_PUBLIC_ACCESS_TOKEN)"
LOGFLARE_PRIVATE="$(get_env LOGFLARE_PRIVATE_ACCESS_TOKEN)"
PG_META_CRYPTO="$(get_env CRYPTO_KEY)"
if [[ -z "$PG_META_CRYPTO" ]]; then
  PG_META_CRYPTO="$(get_env PG_META_CRYPTO_KEY)"
fi
RAW_LOGFLARE_URL="${LOGFLARE_URL:-$(get_env LOGFLARE_URL)}"
# Self-hosted Indobase: always use the analytics container, never Logflare Cloud ingestion URLs.
if [[ -z "$RAW_LOGFLARE_URL" || "$RAW_LOGFLARE_URL" == *logflare.app* || "$RAW_LOGFLARE_URL" == *source=* ]]; then
  LOGFLARE_URL="http://indobase-analytics:4000"
  if [[ -n "$RAW_LOGFLARE_URL" && "$RAW_LOGFLARE_URL" != "$LOGFLARE_URL" ]]; then
    echo "Note: ignoring cloud LOGFLARE_URL in .env; using $LOGFLARE_URL for self-hosted analytics."
  fi
else
  LOGFLARE_URL="$RAW_LOGFLARE_URL"
fi

if [[ -z "$LOGFLARE_PUBLIC" || -z "$LOGFLARE_PRIVATE" ]]; then
  echo "LOGFLARE_PUBLIC_ACCESS_TOKEN and LOGFLARE_PRIVATE_ACCESS_TOKEN must be set in $ENV_FILE" >&2
  echo "Generate with: bash docker/utils/generate-keys.sh" >&2
  exit 1
fi

STUDIO_SVC="$(docker service ls --format '{{.Name}}' | grep -E "${STUDIO_FILTER}" | head -1 || true)"
if [[ -z "$STUDIO_SVC" ]]; then
  echo "No Swarm service matching ${STUDIO_FILTER}" >&2
  exit 1
fi

echo "Updating $STUDIO_SVC Logflare env (LOGFLARE_URL=$LOGFLARE_URL)…"
UPDATE_ARGS=(
  --env-rm LOGFLARE_URL --env-rm LOGFLARE_PUBLIC_ACCESS_TOKEN --env-rm LOGFLARE_PRIVATE_ACCESS_TOKEN
  --env-rm NEXT_PUBLIC_ENABLE_LOGS --env-rm NEXT_ANALYTICS_BACKEND_PROVIDER
  --env-add "LOGFLARE_URL=${LOGFLARE_URL}"
  --env-add "LOGFLARE_PUBLIC_ACCESS_TOKEN=${LOGFLARE_PUBLIC}"
  --env-add "LOGFLARE_PRIVATE_ACCESS_TOKEN=${LOGFLARE_PRIVATE}"
  --env-add "NEXT_PUBLIC_ENABLE_LOGS=true"
  --env-add "NEXT_ANALYTICS_BACKEND_PROVIDER=postgres"
  --env-add "NEXT_PUBLIC_INDOBASE_SAAS=true"
)
if [[ -n "$PG_META_CRYPTO" ]]; then
  UPDATE_ARGS+=(--env-rm PG_META_CRYPTO_KEY --env-add "PG_META_CRYPTO_KEY=${PG_META_CRYPTO}")
fi
docker service update "${UPDATE_ARGS[@]}" "$STUDIO_SVC" >/dev/null

ATTACH_SCRIPT="${INDOBASE_STUDIO_ATTACH_SCRIPT:-/usr/local/bin/indobase-studio-attach-compose-network.sh}"
if [[ -x "$ATTACH_SCRIPT" ]]; then
  echo "Re-attaching Studio tasks to compose network (required after Swarm env updates)…"
  "$ATTACH_SCRIPT" || true
fi

echo "Done. Verify: curl -sS https://studio.indobase.in/api/health | jq '.checks.logflare'"
