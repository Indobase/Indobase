#!/usr/bin/env bash
# Clone Cloudflare OS next to the bridge for local PoC (not vendored into git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${CLOUDFLARE_OS_DIR:-$ROOT/upstream/cloudflare-os}"

if [[ -d "$DEST/.git" ]]; then
  echo "Already cloned: $DEST"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
echo "Cloning cloudflare/cloudflare-os (shallow) → $DEST"
git clone --depth 1 https://github.com/cloudflare/cloudflare-os.git "$DEST"
# PortableSSD / macOS often injects AppleDouble `._*` files that break CF OS JSON builds.
find "$DEST" -name '._*' -delete 2>/dev/null || true
# Skip AppleDouble archives if the volume recreates them during build.
SCRIPT="$DEST/packages/workshop-backend/scripts/build-format-blueprints.mjs"
if [[ -f "$SCRIPT" ]] && grep -q 'f.endsWith(".gadget")).toSorted()' "$SCRIPT"; then
  python3 - "$SCRIPT" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text()
old = 'let archives = (await readdir(sourceDir)).filter((f) => f.endsWith(".gadget")).toSorted();'
new = 'let archives = (await readdir(sourceDir)).filter((f) => f.endsWith(".gadget") && !f.startsWith("._")).toSorted();'
if old in text:
    p.write_text(text.replace(old, new, 1))
    print("Patched blueprint AppleDouble filter")
PY
fi
echo "Done. Next:"
echo "  cd $DEST && pnpm install && pnpm run-local"
echo "Then set CLOUDFLARE_OS_URL=http://localhost:8787 on the bridge."

