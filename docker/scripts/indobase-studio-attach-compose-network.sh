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
STUDIO_NAME_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio-erpgp1}"

if ! docker network inspect "$COMPOSE_NETWORK" >/dev/null 2>&1; then
  echo "compose network $COMPOSE_NETWORK not found" >&2
  exit 0
fi

connected=0
for id in $(docker ps -q --filter "name=${STUDIO_NAME_FILTER}" --filter 'status=running'); do
  networks="$(docker inspect "$id" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  if echo "$networks" | grep -qw "$COMPOSE_NETWORK"; then
    continue
  fi
  if docker network connect "$COMPOSE_NETWORK" "$id" 2>/dev/null; then
    echo "connected $id to $COMPOSE_NETWORK"
    connected=$((connected + 1))
  fi
done

if [ "$connected" -eq 0 ]; then
  echo "no studio containers needed $COMPOSE_NETWORK"
fi
