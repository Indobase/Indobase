#!/usr/bin/env bash
# Point the local/VPS CF OS workshop-backend build at Indobase-owned formats
# (Docs / Sheets / Slides / Design) and regenerate format-blueprints.ts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORMATS_DIR="${FORMAT_BLUEPRINTS_DIR:-$ROOT/formats}"
CFOS_DIR="${CLOUDFLARE_OS_DIR:-$ROOT/upstream/cloudflare-os}"
BACKEND="$CFOS_DIR/packages/workshop-backend"
BUILD_SCRIPT="$BACKEND/scripts/build-format-blueprints.mjs"

if [[ ! -d "$FORMATS_DIR" ]]; then
  echo "Formats directory missing: $FORMATS_DIR" >&2
  exit 1
fi
if [[ ! -f "$BUILD_SCRIPT" ]]; then
  echo "Agent runtime not found at $CFOS_DIR (missing build-format-blueprints.mjs)." >&2
  echo "Run: $ROOT/scripts/fetch-cloudflare-os.sh && (cd \"$CFOS_DIR\" && pnpm install)" >&2
  exit 1
fi

# PortableSSD / macOS AppleDouble sidecars break the blueprint build.
find "$FORMATS_DIR" -name '._*' -delete 2>/dev/null || true

# Ensure Design archive exists when source is present.
if [[ -f "$FORMATS_DIR/src/design/server.js" && ! -f "$FORMATS_DIR/workspace-design.gadget" ]]; then
  echo "→ Packing Design format from source…"
  node "$ROOT/formats/scripts/pack-gadget.mjs" design
fi

# Relative path from workshop-backend package root (build script resolves against pkgRoot).
REL_FORMATS="$(python3 - <<PY
import os
print(os.path.relpath("$FORMATS_DIR", "$BACKEND"))
PY
)"

echo "→ Bundling Indobase formats from $FORMATS_DIR"
echo "   FORMAT_BLUEPRINTS_DIR=$REL_FORMATS"
(
  cd "$BACKEND"
  FORMAT_BLUEPRINTS_DIR="$REL_FORMATS" node scripts/build-format-blueprints.mjs
)

# Display author already Indobase in our sidecars; keep a soft rewrite for safety.
GEN="$BACKEND/src/generated/format-blueprints.ts"
if [[ -f "$GEN" ]]; then
  python3 - <<PY
from pathlib import Path
p = Path("$GEN")
text = p.read_text()
text2 = text.replace('"name": "Cloudflare"', '"name": "Indobase"')
text2 = text2.replace('"id": "agent@cloudflare.com"', '"id": "builder@indobase.in"')
if text2 != text:
    p.write_text(text2)
    print("  normalized generated authors → Indobase")
# sanity: Design must be present
if "format.design" not in text2:
    raise SystemExit("format.design missing from generated format-blueprints.ts")
print("  ok: format.design present in generated bundle")
PY
fi

echo "Done. Restart the agent runtime (pnpm run-local / indobase-cfos-runtime) to load formats."
echo "Hint: export FORMAT_BLUEPRINTS_DIR=$REL_FORMATS before future workshop-backend builds."
