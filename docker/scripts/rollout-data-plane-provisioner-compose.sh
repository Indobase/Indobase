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

docker compose "${COMPOSE_FILES[@]}" pull data-plane-provisioner
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps --force-recreate data-plane-provisioner

echo "Provisioner status:"
docker compose "${COMPOSE_FILES[@]}" ps data-plane-provisioner

if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:${DATA_PLANE_PROVISIONER_PORT:-8787}/health" || true
  echo
fi

echo "Done. Studio should use DATA_PLANE_PROVISIONER_URL pointing at the compose service (http://data-plane-provisioner:8787 or indobase-data-plane-provisioner:8787)."
