#!/usr/bin/env bash
# Publish @indobaseinc workspace packages to npm in dependency order.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

publish_pkg() {
  local dir="$1"
  echo ""
  echo "==> Publishing $(node -p "require('./package.json').name + '@' + require('./package.json').version" -C "$dir")"
  pushd "$dir" >/dev/null
  if [[ "$DRY_RUN" -eq 1 ]]; then
    npm publish --dry-run --access public
  else
    npm publish --access public
  fi
  popd >/dev/null
}

# Leaf packages first, then mcp-server (depends on mcp-utils).
PACKAGES=(
  packages/pg-meta
  packages/indobase-postgres-meta
  packages/indobase-shared-types
  packages/indobase-sql-to-rest
  packages/indobase-mcp-utils
  packages/indobase-mcp-server
)

echo "Building packages that compile from source..."
pnpm --filter @indobaseinc/pg-meta build
pnpm --filter @indobaseinc/shared-types build

for pkg in "${PACKAGES[@]}"; do
  publish_pkg "$ROOT/$pkg"
done

echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry-run complete. Re-run without --dry-run to publish."
else
  echo "All packages published."
fi
