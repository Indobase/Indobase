#!/usr/bin/env bash
# Fail if supabase/@supabase appears outside allowed vendor-shim packages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST=(
  'pnpm-lock.yaml'
  'docker/'
  'apps/docs/'
  'apps/studio/scripts/deno-types.ts'
  'examples/'
)

is_allowlisted() {
  local path="$1"
  for allowed in "${ALLOWLIST[@]}"; do
    [[ "$path" == *"$allowed"* ]] && return 0
  done
  return 1
}

FAIL=0
MATCHES=0

while IFS= read -r line; do
  file="${line%%:*}"
  if is_allowlisted "$file"; then
    continue
  fi
  echo "$line"
  FAIL=1
  MATCHES=$((MATCHES + 1))
done < <(
  grep -RIn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' --include='*.md' --include='*.mdx' --include='*.yml' --include='*.yaml' --include='*.sh' --include='*.sql' \
    -E 'supabase|@supabase' apps packages blocks docker e2e docs 2>/dev/null \
    | grep -v node_modules | grep -v '/.next/' | grep -v tsbuildinfo | grep -v '\.map:' || true
)

if [[ "$FAIL" -eq 1 ]]; then
  echo ""
  echo "audit-no-supabase: found $MATCHES violation(s) outside allowlist."
  exit 1
fi

echo "audit-no-supabase: OK (no violations outside allowlist)"
