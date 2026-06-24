#!/usr/bin/env bash
# Attach Dokploy Traefik to the Indobase Compose network so api.indobase.in → indobase-kong:8000 resolves.
#
# Symptom: 502 on api.indobase.in/auth/v1 and /rest/v1/ while Kong is healthy on the compose network.
#
# Install on the VPS (as root):
#   cp docker/scripts/indobase-traefik-attach-compose-network.sh /usr/local/bin/
#   chmod +x /usr/local/bin/indobase-traefik-attach-compose-network.sh
#   cp docker/systemd/indobase-traefik-network.service /etc/systemd/system/
#   cp docker/systemd/indobase-traefik-network.timer /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now indobase-traefik-network.timer

set -euo pipefail

COMPOSE_NETWORK="${INDOBASE_COMPOSE_NETWORK:-indobase-backend-bmqhan_default}"
KONG_NETWORK="${INDOBASE_KONG_NETWORK:-indobase_default}"
TRAEFIK_CONTAINER="${INDOBASE_TRAEFIK_CONTAINER:-dokploy-traefik}"
KONG_CONTAINER="${INDOBASE_KONG_CONTAINER:-indobase-kong}"

connect_container_to_network() {
  local container="$1"
  local network="$2"
  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    return 0
  fi
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    return 0
  fi
  local nets
  nets="$(docker inspect "$container" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  if echo "$nets" | grep -qw "$network"; then
    echo "$container already on $network"
  else
    docker network connect "$network" "$container"
    echo "connected $container to $network"
  fi
}

if ! docker network inspect "$COMPOSE_NETWORK" >/dev/null 2>&1; then
  echo "compose network $COMPOSE_NETWORK not found" >&2
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$TRAEFIK_CONTAINER"; then
  echo "traefik container $TRAEFIK_CONTAINER not running" >&2
  exit 0
fi

connect_container_to_network "$TRAEFIK_CONTAINER" "$COMPOSE_NETWORK"
# Kong is often on indobase_default (compose `name: indobase`) while Traefik uses Dokploy's network.
connect_container_to_network "$TRAEFIK_CONTAINER" "$KONG_NETWORK"
connect_container_to_network "$KONG_CONTAINER" "$COMPOSE_NETWORK"

networks="$(docker inspect "$TRAEFIK_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
if echo "$networks" | grep -qw "$COMPOSE_NETWORK"; then
  :
elif echo "$networks" | grep -qw "$KONG_NETWORK"; then
  :
else
  echo "traefik not on $COMPOSE_NETWORK or $KONG_NETWORK" >&2
  exit 0
fi

if docker exec "$TRAEFIK_CONTAINER" wget -qO- --timeout=3 http://indobase-kong:8000/ 2>/dev/null \
  || docker exec "$TRAEFIK_CONTAINER" wget -qO- --timeout=3 http://indobase-kong:8000/ 2>/dev/null; then
  echo "kong reachable from traefik via indobase-kong:8000"
else
  # Kong may return 404 on / — probe auth health with a dummy apikey if needed.
  if docker exec "$TRAEFIK_CONTAINER" wget -qO- --timeout=3 http://indobase-kong:8000/auth/v1/health 2>/dev/null \
    | grep -q '"GoTrue"'; then
    echo "kong auth health reachable from traefik"
  else
    echo "WARN: traefik cannot reach indobase-kong:8000 (check dynamic route + network)" >&2
  fi
fi
