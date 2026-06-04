#!/usr/bin/env bash
# Copy edge function sources from an external repo into Studio's management folder,
# then sync to the tenant runtime volume (VPS).
#
# Usage (from ind-repo root, Mac with Adral checkout):
#   ADRAL_REPO=/path/to/adral PROJECT_REF=adralproject-uspulzkzew ./docker/scripts/import-edge-functions-from-repo.sh
#
# Prereqs:
#   - Run `npm run supabase:prepare` in the Adral repo first (bundles _shared into function dirs).
#   - SSH to VPS (root@187.77.30.165) with indobase key.
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
SRC_REPO="${ADRAL_REPO:-}"
FUNCS_REL="${FUNCTIONS_SUBDIR:-supabase/functions}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")

if [[ -z "$SRC_REPO" || ! -d "$SRC_REPO/$FUNCS_REL" ]]; then
  echo "Set ADRAL_REPO to the Adral app root (contains $FUNCS_REL/)." >&2
  exit 1
fi

SRC="$SRC_REPO/$FUNCS_REL"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "Staging functions from $SRC …"
for dir in "$SRC"/*/; do
  base="$(basename "$dir")"
  if [[ "$base" == "_shared" ]]; then
    cp -a "$dir" "$STAGING/_shared"
    continue
  fi
  [[ -f "${dir}index.ts" || -f "${dir}index.js" ]] || continue
  cp -a "$dir" "$STAGING/$base"
done

count="$(find "$STAGING" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [[ "$count" -eq 0 ]]; then
  echo "No deployable function folders (need index.ts). Run npm run supabase:prepare in Adral repo." >&2
  exit 1
fi
echo "Packed $count function(s)."

CID="$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" 'docker ps -q -f name=indobase-studio | head -1')"
if [[ -z "$CID" ]]; then
  echo "Studio container not found on VPS." >&2
  exit 1
fi

DEST="/app/edge-functions/${REF}"
echo "Uploading to Studio container $CID:$DEST …"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "docker exec \"$CID\" mkdir -p \"$DEST\""
tar -C "$STAGING" -cf - . | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "docker exec -i \"$CID\" tar -C \"$DEST\" -xf -"

echo "Syncing tenant volume and restarting edge runtime …"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "PROJECT_REF=$REF ADRAL_REPO= /bin/true" 2>/dev/null || true
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "PROJECT_REF=$REF bash -s" <<'REMOTE'
set -euo pipefail
REF="${PROJECT_REF}"
STUDIO_CONTAINER="${STUDIO_CONTAINER:-$(docker ps -q -f name=indobase-studio | head -1)}"
SRC_ROOT="/app/edge-functions"
SRC="${SRC_ROOT}/${REF}"
VOL="indobase-tenant-${REF}_tenant-functions-${REF}"
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"

MP="$(docker volume inspect "$VOL" --format '{{.Mountpoint}}')"
docker exec "$STUDIO_CONTAINER" tar -C "${SRC}" -cf - . 2>/dev/null | tar -C "$MP" -xf -
chmod -R a+rX "$MP" 2>/dev/null || true
if [[ ! -f "${MP}/main/index.ts" ]]; then
  mkdir -p "${MP}/main"
  curl -fsSL "https://raw.githubusercontent.com/Indobase/Indobase/main/docker/volumes/functions/tenant-main/index.ts" -o "${MP}/main/index.ts" || true
fi
cd "$TENANT_DIR" && docker compose up -d tenant-functions
echo "Done: $(find "$MP" -mindepth 1 -maxdepth 1 -type d | wc -l) dirs in runtime volume"
REMOTE

echo "Import complete for $REF."
