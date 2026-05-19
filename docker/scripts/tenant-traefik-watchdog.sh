#!/usr/bin/env bash
# Re-apply canonical per-tenant Traefik routing (stripPrefix + live docker ports).
# Install via install-tenant-traefik-watchdog.sh (systemd timer, every 5 minutes).
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/etc/dokploy/compose/indobase-backend-bmqhan/code}"
TRAEFIK_DYNAMIC_DIR="${TRAEFIK_DYNAMIC_DIR:-/etc/dokploy/traefik/dynamic}"
SCRIPT="$REPO_ROOT/docker/scripts/fix-tenant-traefik-from-docker.cjs"

if [[ ! -f "$SCRIPT" ]]; then
  echo "missing $SCRIPT" >&2
  exit 1
fi

exec node "$SCRIPT" "$TRAEFIK_DYNAMIC_DIR"
