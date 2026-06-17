#!/usr/bin/env bash
# Phase A: replace @supabase/* imports with @indobaseinc/* in monorepo source.
set -euo pipefail

export LC_ALL=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DIRS=(
  apps/studio
  apps/docs
  apps/ui-library
  apps/design-system
  apps/learn
  packages
  blocks
  e2e/studio
)

for dir in "${DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  find "$dir" \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.json' -o -name '*.md' -o -name '*.mdx' \) \
    -not -path '*/node_modules/*' -not -path '*/.next/*' | while read -r file; do
    case "$file" in
      packages/indobase-*/*)
        continue
        ;;
    esac
    sed -i '' \
      -e 's/@supabase\/mcp-server-supabase\/platform\/api/@indobase\/mcp-server\/platform\/api/g' \
      -e 's/@supabase\/mcp-server-supabase\/platform/@indobase\/mcp-server\/platform/g' \
      -e 's/@supabase\/mcp-server-supabase/@indobase\/mcp-server/g' \
      -e 's/@supabase\/mcp-server/@indobase\/mcp-server/g' \
      -e 's/@supabase\/shared-types/@indobase\/shared-types/g' \
      -e 's/@supabase\/postgres-meta/@indobase\/postgres-meta/g' \
      -e 's/@supabase\/postgrest-js/@indobase\/postgrest-js/g' \
      -e 's/@supabase\/realtime-js/@indobase\/realtime-js/g' \
      -e 's/@supabase\/sql-to-rest/@indobase\/sql-to-rest/g' \
      -e 's/@supabase\/mcp-utils/@indobase\/mcp-utils/g' \
      -e 's/@supabase\/auth-js/@indobase\/auth-js/g' \
      -e 's/@supabase\/build-icons/@indobase\/build-icons/g' \
      -e 's/@supabase\/vue-blocks/@indobase\/vue-blocks/g' \
      -e 's/@supabase\/generator/@indobase\/generator/g' \
      -e 's/@supabase\/pg-meta/@indobase\/pg-meta/g' \
      -e 's/@supabase\/ssr/@indobase\/ssr/g' \
      -e 's/from '\''@supabase\/supabase-js'\''/from '\''indobase-js'\''/g' \
      -e 's/from "@supabase\/supabase-js"/from "indobase-js"/g' \
      -e 's/import '\''@supabase\/supabase-js'\''/import '\''indobase-js'\''/g' \
      -e 's/import "@supabase\/supabase-js"/import "indobase-js"/g' \
      -e 's/eslint-config-supabase/eslint-config-indobase/g' \
      -e 's/createSupabaseApiPlatform/createIndobaseApiPlatform/g' \
      -e 's/createSupabaseMcpServer/createIndobaseMcpServer/g' \
      -e 's/createSupabaseMCPClient/createIndobaseMCPClient/g' \
      -e 's/SupabasePlatform/IndobasePlatform/g' \
      -e 's|\.\./supabase-mcp|../indobase-mcp|g' \
      -e 's|jsr:@supabase/functions-js|jsr:@indobaseinc/functions-js|g' \
      "$file" 2>/dev/null || true
  done
done

echo "Codemod complete. Run: pnpm install && ./scripts/audit-no-supabase.sh"
