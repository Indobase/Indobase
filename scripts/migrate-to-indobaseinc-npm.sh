#!/usr/bin/env bash
# Point monorepo consumers at published @indobaseinc/* npm packages (not workspace forks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXCLUDE_DIRS=(
  'packages/indobase-js'
  'packages/indobase-auth-js'
  'packages/indobase-functions-js'
  'packages/indobase-postgrest-js'
  'packages/indobase-realtime-js'
  'packages/indobase-storage-js'
  'packages/indobase-ssr'
  'node_modules'
  '.next'
  'dist'
)

should_skip() {
  local f="$1"
  for d in "${EXCLUDE_DIRS[@]}"; do
    [[ "$f" == *"/$d/"* || "$f" == "$d/"* ]] && return 0
  done
  return 1
}

echo "Replacing indobase-js imports with @indobaseinc/indobase-js..."
while IFS= read -r -d '' f; do
  should_skip "$f" && continue
  if grep -q "indobase-js" "$f" 2>/dev/null; then
    sed -i '' \
      -e "s/from 'indobase-js'/from '@indobaseinc\/indobase-js'/g" \
      -e 's/from "indobase-js"/from "@indobaseinc\/indobase-js"/g' \
      -e "s/import('indobase-js')/import('@indobaseinc\/indobase-js')/g" \
      "$f" || true
  fi
done < <(find apps packages blocks e2e -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 2>/dev/null)

echo "Updating package.json dependency keys..."
while IFS= read -r -d '' f; do
  should_skip "$f" && continue
  [[ "$f" == */package.json ]] || continue
  if grep -q '"indobase-js"' "$f" 2>/dev/null; then
    # Replace dependency key indobase-js -> @indobaseinc/indobase-js with catalog version
    perl -i -pe '
      s/"indobase-js":\s*"workspace:\*"/"@indobaseinc\/indobase-js": "catalog:"/g;
      s/"indobase-js":\s*"\^[^"]*"/"@indobaseinc\/indobase-js": "^1.0.8"/g;
      s/"indobase-js":\s*"latest"/"@indobaseinc\/indobase-js": "^1.0.8"/g;
      s/"indobase-js":\s*"2\.[^"]*"/"@indobaseinc\/indobase-js": "^1.0.8"/g;
    ' "$f"
  fi
  perl -i -pe '
    s/"@indobaseinc\/auth-js":\s*"workspace:\*"/"@indobaseinc\/auth-js": "catalog:"/g;
    s/"@indobaseinc\/functions-js":\s*"workspace:\*"/"@indobaseinc\/functions-js": "catalog:"/g;
    s/"@indobaseinc\/postgrest-js":\s*"workspace:\*"/"@indobaseinc\/postgrest-js": "catalog:"/g;
    s/"@indobaseinc\/realtime-js":\s*"workspace:\*"/"@indobaseinc\/realtime-js": "catalog:"/g;
    s/"@indobaseinc\/storage-js":\s*"workspace:\*"/"@indobaseinc\/storage-js": "catalog:"/g;
    s/"@indobaseinc\/ssr":\s*"workspace:\*"/"@indobaseinc\/ssr": "catalog:"/g;
  ' "$f"
done < <(find . -name package.json -not -path '*/node_modules/*' -print0)

echo "Done."
