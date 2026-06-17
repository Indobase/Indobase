#!/usr/bin/env bash
# Phase B: remove remaining supabase strings from Studio, vendored packages, and shared libs.
set -euo pipefail

export LC_ALL=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

apply_sed() {
  local file="$1"
  sed -i '' \
    -e 's|https://\*.storage\.supabase\.co|https://*.storage.indobase.in|g' \
    -e 's|https://\*.supabase\.co|https://*.indobase.in|g' \
    -e 's|wss://\*.supabase\.co|wss://*.indobase.in|g' \
    -e 's|https://\*.storage\.supabase\.red|https://*.storage.indobase.red|g' \
    -e 's|https://\*.supabase\.red|https://*.indobase.red|g' \
    -e 's|wss://\*.supabase\.red|wss://*.indobase.red|g' \
    -e 's|storage\.supabase\.co|storage.indobase.in|g' \
    -e 's|configcat\.supabase\.green|configcat.indobase.green|g' \
    -e 's|configcat\.supabase\.com|configcat.indobase.in|g' \
    -e 's|frontend-assets\.supabase\.green|frontend-assets.indobase.green|g' \
    -e 's|frontend-assets\.supabase\.com|frontend-assets.indobase.in|g' \
    -e 's|ss\.supabase\.com|ss.indobase.in|g' \
    -e 's|db\.supabase\.co|db.indobase.in|g' \
    -e 's|\.supabase\.co|.indobase.in|g' \
    -e 's|\.supabase\.red|.indobase.red|g' \
    -e 's|https://supabase\.io|https://indobase.in|g' \
    -e 's|https://supabase\.com|https://indobase.in|g' \
    -e 's|http://supabase\.com|https://indobase.in|g' \
    -e 's|@supabase|@indobase|g' \
    -e 's/createProjectSupabaseClient/createProjectIndobaseClient/g' \
    -e 's/project-supabase-client/project-indobase-client/g' \
    -e 's/createSupabaseApiPlatform/createIndobaseApiPlatform/g' \
    -e 's/createSupabaseMcpServer/createIndobaseMcpServer/g' \
    -e 's/createSupabaseMCPClient/createIndobaseMCPClient/g' \
    -e 's/SupabasePlatform/IndobasePlatform/g' \
    -e "s/theme=\"supabase\"/theme=\"indobase\"/g" \
    -e "s/theme='supabase'/theme='indobase'/g" \
    -e "s/defineTheme('supabase'/defineTheme('indobase'/g" \
    -e "s/defineTheme(\"supabase\"/defineTheme(\"indobase\"/g" \
    -e "s/'supabase-light'/'indobase-light'/g" \
    -e "s/'supabase-dark'/'indobase-dark'/g" \
    -e 's/supabase-light/indobase-light/g' \
    -e 's/supabase-dark/indobase-dark/g' \
    -e 's/supabase_studio_tabs/indobase_studio_tabs/g' \
    -e 's/supabase_recent_items/indobase_recent_items/g' \
    -e 's/supabase-chart-hover-sync-enabled/indobase-chart-hover-sync-enabled/g' \
    -e 's/supabase-chart-tooltip-sync-enabled/indobase-chart-tooltip-sync-enabled/g' \
    -e "s/'supabase-dashboard'/'indobase-dashboard'/g" \
    -e 's/supabase-files\.zip/indobase-files.zip/g' \
    -e 's/supabase-upgrade-/indobase-upgrade-/g' \
    -e "s/managed_by: 'supabase'/managed_by: 'indobase'/g" \
    -e "s/managed_by === 'supabase'/managed_by === 'indobase'/g" \
    -e "s/managed_by !== 'supabase'/managed_by !== 'indobase'/g" \
    -e "s/issuer = 'supabase'/issuer = 'indobase'/g" \
    -e "s/issuer: 'supabase'/issuer: 'indobase'/g" \
    -e 's/supabase-postgres-/indobase-postgres-/g' \
    -e 's/supabase-app-instance/indobase-app-instance/g' \
    -e 's/supabase_project_ref/indobase_project_ref/g' \
    -e 's/supabaseConfig/indobaseConfig/g' \
    -e 's/supabaseClient/indobaseClient/g' \
    -e 's/supabase functions download/indobase functions download/g' \
    -e 's/brew upgrade supabase/brew upgrade indobase/g' \
    -e 's/scoop update supabase/scoop update indobase/g' \
    -e 's/npm update supabase/npm update indobase/g' \
    -e 's/npm i supabase@/npm i indobase@/g' \
    -e 's/supabase-ui-preview/indobase-ui-preview/g' \
    -e 's/MANAGED_BY\.SUPABASE/MANAGED_BY.INDOBASE/g' \
    -e "s/SUPABASE: 'supabase'/INDOBASE: 'indobase'/g" \
    -e 's/validateSupabaseUrl/validateProjectUrl/g' \
    -e 's/supabaseUrl/projectUrl/g' \
    -e 's/supabaseKey/apiKey/g' \
    -e 's/SupabaseClient/IndobaseClient/g' \
    -e 's/supabase\.auth\.token/indobase.auth.token/g' \
    -e 's/Copyright Supabase/Copyright Indobase/g' \
    -e 's/eslint-config-supabase/eslint-config-indobase/g' \
    -e 's/supabasePlugin/indobasePlugin/g' \
    -e "s/'supabase\/no-await/'indobase\/no-await/g" \
    -e 's/supabase:/indobase:/g' \
    -e 's/supabase-admin/indobase-admin/g' \
    -e 's|billing-on-supabase|billing-on-indobase|g' \
    -e 's|migrating-within-supabase|migrating-within-indobase|g' \
    -e 's|build-a-supabase-integration|build-an-indobase-integration|g' \
    -e 's|supabase-for-platforms|indobase-for-platforms|g' \
    -e 's|supabase-db-dump|indobase-db-dump|g' \
    -e 's|updating-the-supabase-cli|updating-the-indobase-cli|g' \
    -e 's|jwt-expired-error-in-supabase-dashboard|jwt-expired-error-in-indobase-dashboard|g' \
    -e 's|unable-to-connect-to-your-supabase-project|unable-to-connect-to-your-indobase-project|g' \
    -e 's|badge-made-with-supabase|badge-made-with-indobase|g' \
    -e 's|lib/themes/supabase-2.json|lib/themes/indobase-2.json|g' \
    -e 's|supabase-2.json|indobase-2.json|g' \
    -e 's|/reference/cli/supabase|/reference/cli/indobase|g' \
    -e 's|github.com/orgs/supabase|github.com/orgs/Indobase|g' \
    -e 's|github.com/supabase/|github.com/Indobase/|g' \
    -e 's|from supabase/ui|from indobase/ui|g' \
    -e 's/\bsupabase\b/indobase/g' \
    "$file" 2>/dev/null || true
}

process_tree() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  find "$dir" \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.json' -o -name '*.md' -o -name '*.mdx' -o -name '*.sql' -o -name '*.sh' -o -name '*.yml' -o -name '*.yaml' \) \
    -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/umd/*' | while read -r file; do
    case "$file" in
      apps/studio/scripts/deno-types.ts)
        continue
        ;;
      apps/docs/content/guides/*)
        continue
        ;;
      examples/*)
        continue
        ;;
      docker/CHANGELOG.md|docker/versions.md)
        continue
        ;;
    esac
    apply_sed "$file"
  done
}

# File renames (idempotent)
rename_if_exists() {
  local from="$1" to="$2"
  if [[ -e "$from" && ! -e "$to" ]]; then
    git mv "$from" "$to" 2>/dev/null || mv "$from" "$to"
  fi
}

rename_if_exists apps/studio/lib/project-supabase-client.ts apps/studio/lib/project-indobase-client.ts
rename_if_exists apps/studio/lib/project-supabase-client.test.ts apps/studio/lib/project-indobase-client.test.ts
rename_if_exists apps/studio/lib/api/supabase-admin.ts apps/studio/lib/api/indobase-admin.ts
rename_if_exists packages/indobase-js/src/SupabaseClient.ts packages/indobase-js/src/IndobaseClient.ts
rename_if_exists packages/indobase-js/dist/umd/supabase.js packages/indobase-js/dist/umd/indobase.js
rename_if_exists packages/indobase-storage-js/dist/umd/supabase.js packages/indobase-storage-js/dist/umd/indobase.js

DIRS=(
  apps/studio
  packages/common
  packages/pg-meta
  packages/api-types
  packages/ai-commands
  packages/config
  packages/generator
  packages/indobase-auth-js
  packages/indobase-functions-js
  packages/indobase-js
  packages/indobase-mcp-server
  packages/indobase-mcp-utils
  packages/indobase-postgres-meta
  packages/indobase-postgrest-js
  packages/indobase-realtime-js
  packages/indobase-shared-types
  packages/indobase-sql-to-rest
  packages/indobase-ssr
  packages/indobase-storage-js
  packages/ui-patterns
  packages/eslint-config-supabase
  packages/shared-data
  packages/ui
  blocks
  e2e
)

for dir in "${DIRS[@]}"; do
  echo "Cleaning ${dir}..."
  process_tree "$dir"
done

# CSP variable renames in studio
if [[ -f apps/studio/csp.js ]]; then
  sed -i '' \
    -e 's/SUPABASE_PROJECTS_URL/INDOBASE_PROJECTS_URL/g' \
    -e 's/SUPABASE_PROJECTS_URL_WS/INDOBASE_PROJECTS_URL_WS/g' \
    -e 's/SUPABASE_LOCAL_PROJECTS_URL_WS/INDOBASE_LOCAL_PROJECTS_URL_WS/g' \
    -e 's/SUPABASE_DOCS_PROJECT_URL/INDOBASE_DOCS_PROJECT_URL/g' \
    -e 's/SUPABASE_CONTENT_API_URL/INDOBASE_CONTENT_API_URL/g' \
    -e 's/SUPABASE_STAGING_PROJECTS_URL/INDOBASE_STAGING_PROJECTS_URL/g' \
    -e 's/SUPABASE_STAGING_PROJECTS_URL_WS/INDOBASE_STAGING_PROJECTS_URL_WS/g' \
    -e 's/SUPABASE_COM_URL/INDOBASE_COM_URL/g' \
    -e 's/SUPABASE_ASSETS_URL/INDOBASE_ASSETS_URL/g' \
    apps/studio/csp.js
fi

# Fix indobase-js index import after class rename
if [[ -f packages/indobase-js/src/index.ts ]]; then
  sed -i '' 's/from '\''\.\/SupabaseClient'\''/from '\''.\/IndobaseClient'\''/g' packages/indobase-js/src/index.ts
  sed -i '' 's/from "\.\/SupabaseClient"/from ".\/IndobaseClient"/g' packages/indobase-js/src/index.ts
fi

# Theme JSON files used by docs apps
for theme in apps/learn/lib/themes/supabase-2.json apps/design-system/lib/themes/supabase-2.json apps/ui-library/lib/themes/supabase-2.json; do
  rename_if_exists "$theme" "${theme/supabase-2/indobase-2}"
done
rename_if_exists apps/docs/features/ui/CodeBlock/supabase-2.json apps/docs/features/ui/CodeBlock/indobase-2.json

echo "Phase B cleanup complete. Run: ./scripts/audit-no-supabase.sh"
