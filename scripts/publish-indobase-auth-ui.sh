#!/usr/bin/env bash
# Publish @indobaseinc/auth-ui-* packages to npm (shared → react → svelte).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTH_UI_ROOT="${ROOT}/packages/indobase-auth-ui"

cd "$AUTH_UI_ROOT"

echo "==> Installing dependencies"
pnpm install

echo "==> Building packages"
pnpm build

PACKAGES=(
  "packages/shared"
  "packages/react"
  "packages/svelte"
)

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

if ! npm whoami >/dev/null 2>&1; then
  echo "WARN: npm not authenticated (npm whoami failed)."
  if [[ "$DRY_RUN" != "1" ]]; then
    echo "Falling back to dry-run. Use: $0 --dry-run or npm login first."
    DRY_RUN=1
  fi
fi

for dir in "${PACKAGES[@]}"; do
  name="$(node -p "require('./${dir}/package.json').name")"
  version="$(node -p "require('./${dir}/package.json').version")"
  echo ""
  echo "==> Publishing ${name}@${version}"
  pushd "$dir" >/dev/null
  if [[ "$DRY_RUN" == "1" ]]; then
    npm publish --dry-run --access public
  else
    npm publish --access public
  fi
  popd >/dev/null
done

echo ""
echo "Done."
