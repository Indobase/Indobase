#!/usr/bin/env bash
# Wire up Logflare + Vector log ingestion, Kong usage metering, pg_stat_statements,
# and Studio cron for storage/database usage snapshots on the platform VPS.
#
# Usage (on platform VPS as root):
#   bash docker/scripts/vyom/configure-observability-platform.sh
#
# Optional:
#   DOCKER_DIR=/opt/indobase/docker
#   STUDIO_ENV=/opt/indobase/studio-swarm.env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${DOCKER_DIR:-/opt/indobase/docker}"
STUDIO_ENV="${STUDIO_ENV:-/opt/indobase/studio-swarm.env}"
ENV_FILE="$DOCKER_DIR/.env"
COMPOSE=(docker compose \
  -f "$DOCKER_DIR/docker-compose.yml" \
  -f "$DOCKER_DIR/docker-compose.dokploy.yml" \
  -f "$DOCKER_DIR/docker-compose.platform-override.yml" \
  -f "$DOCKER_DIR/docker-compose.platform-vps.yml")

if [[ -f "$DOCKER_DIR/docker-compose.smtp-relay.yml" ]]; then
  COMPOSE+=(-f "$DOCKER_DIR/docker-compose.smtp-relay.yml")
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

get_env() {
  grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true
}

set_env_kv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >>"$file"
  fi
}

is_placeholder_token() {
  [[ "$1" == *your-super-secret* || -z "$1" ]]
}

echo "=== Indobase observability configure $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

LOGFLARE_PUBLIC="$(get_env LOGFLARE_PUBLIC_ACCESS_TOKEN "$ENV_FILE")"
LOGFLARE_PRIVATE="$(get_env LOGFLARE_PRIVATE_ACCESS_TOKEN "$ENV_FILE")"

if is_placeholder_token "$LOGFLARE_PUBLIC" || is_placeholder_token "$LOGFLARE_PRIVATE"; then
  if [[ -f "$STUDIO_ENV" ]]; then
    STUDIO_PUBLIC="$(get_env LOGFLARE_PUBLIC_ACCESS_TOKEN "$STUDIO_ENV")"
    STUDIO_PRIVATE="$(get_env LOGFLARE_PRIVATE_ACCESS_TOKEN "$STUDIO_ENV")"
    if [[ -n "$STUDIO_PUBLIC" && -n "$STUDIO_PRIVATE" ]]; then
      echo "Syncing Logflare tokens from $STUDIO_ENV into compose .env"
      set_env_kv LOGFLARE_PUBLIC_ACCESS_TOKEN "$STUDIO_PUBLIC" "$ENV_FILE"
      set_env_kv LOGFLARE_PRIVATE_ACCESS_TOKEN "$STUDIO_PRIVATE" "$ENV_FILE"
      LOGFLARE_PUBLIC="$STUDIO_PUBLIC"
      LOGFLARE_PRIVATE="$STUDIO_PRIVATE"
    fi
  fi
fi

if is_placeholder_token "$LOGFLARE_PUBLIC" || is_placeholder_token "$LOGFLARE_PRIVATE"; then
  echo "Generating new Logflare tokens…"
  mapfile -t keys < <(bash "$DOCKER_DIR/utils/generate-keys.sh" | grep -E '^LOGFLARE_(PUBLIC|PRIVATE)_ACCESS_TOKEN=')
  for line in "${keys[@]}"; do
    key="${line%%=*}"
    val="${line#*=}"
    set_env_kv "$key" "$val" "$ENV_FILE"
    if [[ "$key" == LOGFLARE_PUBLIC_ACCESS_TOKEN ]]; then LOGFLARE_PUBLIC="$val"; fi
    if [[ "$key" == LOGFLARE_PRIVATE_ACCESS_TOKEN ]]; then LOGFLARE_PRIVATE="$val"; fi
  done
fi

set_env_kv LOGFLARE_URL "http://indobase-analytics:4000" "$ENV_FILE"

echo "Applying saas usage metering SQL (idempotent)…"
docker exec -i indobase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  <"$DOCKER_DIR/volumes/db/saas-usage-metering.sql" >/dev/null

echo "Enabling pg_stat_statements on platform postgres…"
docker exec indobase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "create extension if not exists pg_stat_statements with schema extensions;" >/dev/null 2>&1 \
  || docker exec indobase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "create extension if not exists pg_stat_statements;" >/dev/null

echo "Recreating analytics + vector + kong (log format)…"
"${COMPOSE[@]}" up -d analytics vector kong

echo "Waiting for analytics health…"
for _ in $(seq 1 30); do
  if docker exec indobase-analytics curl -fsS http://localhost:4000/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ -x /usr/local/bin/indobase-studio-attach-compose-network.sh ]]; then
  /usr/local/bin/indobase-studio-attach-compose-network.sh || true
elif [[ -f "$SCRIPT_DIR/../indobase-studio-attach-compose-network.sh" ]]; then
  bash "$SCRIPT_DIR/../indobase-studio-attach-compose-network.sh" || true
fi

if [[ -f "$SCRIPT_DIR/../sync-logflare-env-to-studio.sh" ]]; then
  DOCKER_DIR="$DOCKER_DIR" bash "$SCRIPT_DIR/../sync-logflare-env-to-studio.sh"
fi

CRON_SECRET="$(get_env INDOBASE_CRON_SECRET "$ENV_FILE")"
if [[ -z "$CRON_SECRET" ]]; then
  CRON_SECRET="$(get_env DATA_PLANE_PROVISIONER_TOKEN "$ENV_FILE")"
fi

if [[ -n "$CRON_SECRET" ]]; then
  CRON_LINE="17 * * * * root STUDIO_URL=https://studio.indobase.in INDOBASE_CRON_SECRET=${CRON_SECRET} DOCKER_ENV_FILE=${ENV_FILE} ${DOCKER_DIR}/scripts/usage-collect-fleet-cron-vps.sh >> /var/log/indobase-usage-collect.log 2>&1"
  CRON_FILE="/etc/cron.d/indobase-usage-collect"
  if ! grep -q indobase-usage-collect "$CRON_FILE" 2>/dev/null; then
    echo "$CRON_LINE" >"$CRON_FILE"
    chmod 644 "$CRON_FILE"
    echo "Installed hourly usage-collect cron at $CRON_FILE"
  fi
fi

echo "Generating sample Kong traffic for log pipeline smoke test…"
curl -fsS -o /dev/null https://api.indobase.in/auth/v1/health || true
curl -fsS -o /dev/null https://api.indobase.in/rest/v1/ || true
sleep 5

EVENT_COUNT="$(docker exec indobase-db psql -U postgres -d postgres -tA -c \
  'select count(*)::text from saas.usage_events where occurred_at > now() - interval '\''15 minutes'\''' 2>/dev/null || echo 0)"
ANALYTICS_HEALTH="$(docker exec indobase-analytics curl -fsS http://localhost:4000/health 2>/dev/null || echo fail)"
VECTOR_RUNNING="$(docker ps --filter name=indobase-vector --filter status=running -q | wc -l | tr -d ' ')"

echo "{\"analytics_health\":\"${ANALYTICS_HEALTH}\",\"vector_running\":${VECTOR_RUNNING},\"recent_usage_events\":${EVENT_COUNT}}"

echo "Verify Studio logs: curl -sS https://studio.indobase.in/api/health | jq '.checks.logflare'"
