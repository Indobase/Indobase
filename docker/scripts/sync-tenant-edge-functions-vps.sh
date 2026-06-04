#!/usr/bin/env bash
# Copy Edge Function sources from Studio's management folder into the tenant
# Docker volume, then restart edge-runtime.
#
# Prereqs on VPS:
#   - Studio has EDGE_FUNCTIONS_MANAGEMENT_FOLDER (e.g. /app/edge-functions)
#   - Tenant stack running with volume indobase-tenant-<ref>_tenant-functions-<ref>
#
# Usage (on VPS):
#   PROJECT_REF=adralproject-uspulzkzew ./docker/scripts/sync-tenant-edge-functions-vps.sh
#   ./docker/scripts/sync-tenant-edge-functions-vps.sh adralproject-uspulzkzew
set -euo pipefail

REF="${PROJECT_REF:-${1:-}}"
if [[ -z "$REF" ]]; then
  echo "Usage: PROJECT_REF=<ref> $0" >&2
  exit 1
fi

STUDIO_CONTAINER="${STUDIO_CONTAINER:-$(docker ps -q -f name=indobase-studio | head -1)}"
SRC_ROOT="${EDGE_FUNCTIONS_SRC:-/app/edge-functions}"
SRC="${SRC_ROOT}/${REF}"
VOL="indobase-tenant-${REF}_tenant-functions-${REF}"
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"

if [[ ! -d "$TENANT_DIR" ]]; then
  echo "Tenant dir not found: $TENANT_DIR" >&2
  exit 1
fi
if ! docker volume inspect "$VOL" >/dev/null 2>&1; then
  echo "Functions volume not found: $VOL" >&2
  exit 1
fi

MP="$(docker volume inspect "$VOL" --format '{{.Mountpoint}}')"

if [[ -n "$STUDIO_CONTAINER" ]] && docker exec "$STUDIO_CONTAINER" test -d "${SRC_ROOT}/${REF}" 2>/dev/null; then
  echo "Syncing from Studio container ${STUDIO_CONTAINER}:${SRC} -> ${MP}"
  docker exec "$STUDIO_CONTAINER" tar -C "${SRC_ROOT}/${REF}" -cf - . 2>/dev/null \
    | tar -C "$MP" -xf -
elif [[ -d "$SRC" ]]; then
  echo "Syncing from host ${SRC} -> ${MP}"
  rsync -a --delete "${SRC}/" "${MP}/"
else
  echo "No function sources at Studio path or ${SRC}. Deploy via Studio UI first." >&2
  exit 1
fi

# Ensure main router exists (provisioner stub)
if [[ ! -f "${MP}/main/index.ts" ]]; then
  echo "Seeding main router..."
  stub="$(mktemp)"
  curl -fsSL "https://raw.githubusercontent.com/Indobase/Indobase/main/docker/volumes/functions/tenant-main/index.ts" -o "$stub" 2>/dev/null \
    || cp "${TENANT_DIR}/../docker/volumes/functions/tenant-main/index.ts" "$stub" 2>/dev/null \
    || true
  if [[ -f "$stub" ]]; then
    mkdir -p "${MP}/main"
    cp "$stub" "${MP}/main/index.ts"
    rm -f "$stub"
  fi
fi

chmod -R a+rX "${MP}" 2>/dev/null || true

cd "$TENANT_DIR"
docker compose up -d tenant-functions
echo "Restarted tenant-functions for ${REF}"
