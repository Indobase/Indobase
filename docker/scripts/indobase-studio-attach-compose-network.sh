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

# Optional: verify postgres-meta from the newest Studio task (non-fatal).
studio_id="$(docker ps -q --filter "name=${STUDIO_NAME_FILTER}" --filter 'status=running' | head -1)"
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
