#!/usr/bin/env bash
# Attach running Dokploy Studio swarm tasks to the Indobase Compose network so
# STUDIO_PG_META_URL=http://indobase-meta:8080 resolves (split deploy).
#
# Install on the VPS (as root):
#   cp docker/scripts/indobase-studio-attach-compose-network.sh /usr/local/bin/
#   chmod +x /usr/local/bin/indobase-studio-attach-compose-network.sh
#   cp docker/systemd/indobase-studio-network.service /etc/systemd/system/
#   cp docker/systemd/indobase-studio-network.timer /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now indobase-studio-network.timer

set -euo pipefail

COMPOSE_NETWORK="${INDOBASE_COMPOSE_NETWORK:-indobase-backend-bmqhan_default}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"
STUDIO_SERVICE="${INDOBASE_STUDIO_SWARM_SERVICE:-}"
SYNC_MCP_TRAEFIK="${INDOBASE_SYNC_MCP_TRAEFIK:-true}"

discover_studio_service() {
  if [[ -n "$STUDIO_SERVICE" ]]; then
    if docker service inspect "$STUDIO_SERVICE" >/dev/null 2>&1; then
      printf '%s' "$STUDIO_SERVICE"
      return 0
    fi
    echo "WARN: INDOBASE_STUDIO_SWARM_SERVICE=$STUDIO_SERVICE not found; discovering…" >&2
  fi

  local svc
  svc="$(docker service ls --format '{{.Name}}' | grep -E "${STUDIO_FILTER}" | head -1 || true)"
  if [[ -n "$svc" ]]; then
    printf '%s' "$svc"
    return 0
  fi

  return 1
}

discover_studio_task_ids() {
  local service="$1"
  local ids=""

  if [[ -n "$service" ]]; then
    ids="$(docker ps -q \
      --filter "label=com.docker.swarm.service.name=${service}" \
      --filter 'status=running' 2>/dev/null || true)"
  fi

  if [[ -z "$ids" ]]; then
    ids="$(docker ps -q --filter "name=${STUDIO_FILTER}" --filter 'status=running' 2>/dev/null || true)"
  fi

  printf '%s\n' $ids
}

sync_mcp_traefik_backend() {
  local service="$1"
  local traefik_file="${INDOBASE_MCP_TRAEFIK_FILE:-/etc/dokploy/traefik/dynamic/mcp-indobase.yml}"
  local desired="http://${service}:8080"

  [[ "$SYNC_MCP_TRAEFIK" == "true" ]] || return 0
  [[ -f "$traefik_file" ]] || return 0
  if grep -q "url: ${desired}" "$traefik_file" 2>/dev/null; then
    return 0
  fi

  if sed -E -i "s|url: http://indobase-studio[^[:space:]]*:8080|url: ${desired}|g" "$traefik_file"; then
    echo "synced MCP Traefik backend to ${desired} in ${traefik_file}"
  fi
}

if ! docker network inspect "$COMPOSE_NETWORK" >/dev/null 2>&1; then
  echo "compose network $COMPOSE_NETWORK not found" >&2
  exit 0
fi

STUDIO_SVC="$(discover_studio_service || true)"
if [[ -z "$STUDIO_SVC" ]]; then
  echo "no Studio swarm service matching ${STUDIO_FILTER}" >&2
  exit 0
fi

echo "Studio swarm service: ${STUDIO_SVC}"
sync_mcp_traefik_backend "$STUDIO_SVC"

connected=0
while read -r id; do
  [[ -z "$id" ]] && continue
  networks="$(docker inspect "$id" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  if echo "$networks" | grep -qw "$COMPOSE_NETWORK"; then
    continue
  fi
  if docker network connect "$COMPOSE_NETWORK" "$id" 2>/dev/null; then
    echo "connected $id to $COMPOSE_NETWORK"
    connected=$((connected + 1))
  fi
done < <(discover_studio_task_ids "$STUDIO_SVC")

if [ "$connected" -eq 0 ]; then
  echo "no studio containers needed $COMPOSE_NETWORK"
fi

# Optional: verify postgres-meta from the newest Studio task (non-fatal).
studio_id="$(discover_studio_task_ids "$STUDIO_SVC" | head -1)"
if [ -n "$studio_id" ]; then
  if docker exec "$studio_id" wget -qO- --timeout=3 http://indobase-meta:8080/health >/dev/null 2>&1 \
    || docker exec "$studio_id" curl -fsS -m 3 http://indobase-meta:8080/health >/dev/null 2>&1; then
    echo "postgres-meta reachable from studio via indobase-meta:8080"
  else
    meta_port="${PG_META_PUBLISH_PORT:-8081}"
    if docker exec "$studio_id" wget -qO- --timeout=3 "http://172.17.0.1:${meta_port}/health" >/dev/null 2>&1 \
      || docker exec "$studio_id" curl -fsS -m 3 "http://172.17.0.1:${meta_port}/health" >/dev/null 2>&1; then
      echo "postgres-meta reachable from studio via 172.17.0.1:${meta_port}"
    else
      echo "WARN: studio cannot reach postgres-meta (check STUDIO_PG_META_URL)" >&2
    fi
  fi
fi
