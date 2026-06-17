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
TRAEFIK_CONTAINER="${INDOBASE_TRAEFIK_CONTAINER:-dokploy-traefik}"

if ! docker network inspect "$COMPOSE_NETWORK" >/dev/null 2>&1; then
  echo "compose network $COMPOSE_NETWORK not found" >&2
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$TRAEFIK_CONTAINER"; then
  echo "traefik container $TRAEFIK_CONTAINER not running" >&2
  exit 0
fi

networks="$(docker inspect "$TRAEFIK_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
if echo "$networks" | grep -qw "$COMPOSE_NETWORK"; then
  echo "traefik already on $COMPOSE_NETWORK"
else
  docker network connect "$COMPOSE_NETWORK" "$TRAEFIK_CONTAINER"
  echo "connected $TRAEFIK_CONTAINER to $COMPOSE_NETWORK"
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
