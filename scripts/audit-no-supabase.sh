#!/usr/bin/env bash
# Fail if supabase/@supabase appears outside allowed vendor-shim packages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST=(
  'pnpm-lock.yaml'
  'docker/'
  'apps/docs/'
  'apps/ui-library/'
  'apps/design-system/'
  'apps/learn/'
  'apps/studio/'
  'apps/studio/components/interfaces/ProjectAPIDocs/'
  'apps/studio/components/interfaces/Connect/'
  'apps/studio/components/interfaces/ConnectSheet/'
  'apps/studio/components/interfaces/Docs/'
  'apps/studio/components/interfaces/SQLEditor/'
  'examples/'
  'e2e/'
  'docs/'
  'packages/indobase-'
  'packages/api-types/'
  'packages/common/'
  'packages/config/'
  'packages/generator/'
  'packages/ai-commands/'
  'packages/ui-patterns/'
  'packages/shared-data/'
  'apps/www/'
  'reports/'
  'supabase/migrations/'
  'supabase/functions/'
  'blocks/'
)

is_allowlisted() {
  local path="$1"
  for allowed in "${ALLOWLIST[@]}"; do
    [[ "$path" == *"$allowed"* ]] && return 0
  done
  return 1
}

is_intentional_reference() {
  local line="$1"
  [[ "$line" == *'audit-no-supabase'* ]] && return 0
  [[ "$line" == *'AUDIT_REBRAND'* ]] && return 0
  [[ "$line" == *'supabase_admin'* ]] && return 0
  [[ "$line" == *'supabase_auth_admin'* ]] && return 0
  [[ "$line" == *'supabase_storage_admin'* ]] && return 0
  [[ "$line" == *'supabase_realtime_admin'* ]] && return 0
  [[ "$line" == *'image: supabase/'* ]] && return 0
  [[ "$line" == *'PROVISIONER_PG_ADMIN_USER'* ]] && return 0
  # Anti-leak detector must list vendor tokens to strip them from capability copy.
  [[ "$line" == *'FORBIDDEN_PROVIDER_PATTERN'* ]] && return 0
  return 1
}

FAIL=0
MATCHES=0

while IFS= read -r line; do
  file="${line%%:*}"
  if is_allowlisted "$file"; then
    continue
  fi
  if is_intentional_reference "$line"; then
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
