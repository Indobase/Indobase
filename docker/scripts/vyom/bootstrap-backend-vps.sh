#!/usr/bin/env bash
# One-time bootstrap for Vyom backend VPS (103.190.92.248).
set -euo pipefail

NETWORK="${TENANT_DOCKER_NETWORK:-indobase-backend-bmqhan_default}"

echo "Creating tenant Docker network: ${NETWORK}"
docker network inspect "${NETWORK}" >/dev/null 2>&1 || docker network create "${NETWORK}"

mkdir -p /var/lib/indobase/tenants /etc/dokploy/traefik/dynamic

echo "Backend VPS bootstrap complete."
echo "Next: deploy provisioner with docker-compose.backend-vps.yml (see docker/docs/VYOM-DUAL-VPS.md)"
