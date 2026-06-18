#!/usr/bin/env bash
# Roll out data-plane-provisioner via docker compose (Dokploy-managed) instead of ad-hoc docker run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/docker"

COMPOSE_FILES=(-f docker-compose.yml)
if [[ -f docker-compose.dokploy.yml ]]; then
  COMPOSE_FILES+=(-f docker-compose.dokploy.yml)
fi

IMAGE_TAG="${1:-latest}"
export DATA_PLANE_PROVISIONER_IMAGE="roshanraghavander/ind-repo-provisioner:${IMAGE_TAG}"

echo "Using provisioner image: ${DATA_PLANE_PROVISIONER_IMAGE}"

# Legacy ad-hoc `docker run` containers block compose recreate by fixed container_name.
if docker ps -a --format '{{.Names}}' | grep -qx indobase-data-plane-provisioner; then
  if ! docker compose "${COMPOSE_FILES[@]}" ps -q data-plane-provisioner 2>/dev/null | grep -q .; then
    echo "Removing legacy provisioner container (not managed by compose)..."
    docker rm -f indobase-data-plane-provisioner
  fi
fi

docker compose "${COMPOSE_FILES[@]}" pull data-plane-provisioner
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps --force-recreate data-plane-provisioner

echo "Provisioner status:"
docker compose "${COMPOSE_FILES[@]}" ps data-plane-provisioner

if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:${DATA_PLANE_PROVISIONER_PORT:-8787}/health" || true
  echo
fi

echo "Done. Studio should use DATA_PLANE_PROVISIONER_URL pointing at the compose service (http://data-plane-provisioner:8787 or indobase-data-plane-provisioner:8787)."
