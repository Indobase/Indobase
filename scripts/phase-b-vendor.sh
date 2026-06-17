#!/usr/bin/env bash
# Phase B: vendor upstream npm packages into packages/indobase-* with @indobase scope.
# Run from repo root after `pnpm install`.
set -euo pipefail

export LC_ALL=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules/.pnpm ]]; then
  echo "Run pnpm install first." >&2
  exit 1
fi

find_nm() {
  local pkg="$1"
  find node_modules/.pnpm -type d \
    -path "*/@supabase+${pkg}@*/node_modules/@supabase/${pkg}" 2>/dev/null | head -1
}

rename_supabase_scope() {
  local dir="$1"
  find "$dir" -type f \( \
    -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o \
    -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o -name '*.cts' -o \
    -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o \
    -name '*.json' -o -name '*.md' -o -name 'README*' \
  \) ! -path '*/node_modules/*' -print0 2>/dev/null | while IFS= read -r -d '' file; do
    sed -i '' \
      -e 's|@supabase/mcp-server-supabase|@indobaseinc/mcp-server|g' \
      -e 's|@supabase/functions-js|@indobaseinc/functions-js|g' \
      -e 's|@supabase/storage-js|@indobaseinc/storage-js|g' \
      -e 's|@supabase/postgrest-js|@indobaseinc/postgrest-js|g' \
      -e 's|@supabase/realtime-js|@indobaseinc/realtime-js|g' \
      -e 's|@supabase/postgres-meta|@indobaseinc/postgres-meta|g' \
      -e 's|@supabase/shared-types|@indobaseinc/shared-types|g' \
      -e 's|@supabase/sql-to-rest|@indobaseinc/sql-to-rest|g' \
      -e 's|@supabase/mcp-utils|@indobaseinc/mcp-utils|g' \
      -e 's|@supabase/auth-js|@indobaseinc/auth-js|g' \
      -e 's|@supabase/ssr|@indobaseinc/ssr|g' \
      -e 's|@supabase/supabase-js|indobase-js|g' \
      -e 's|jsr:@supabase/functions-js|jsr:@indobaseinc/functions-js|g' \
      "$file" 2>/dev/null || true
  done
}

vendor_package() {
  local upstream="$1"
  local target_rel="$2"
  local new_name="$3"

  local src
  src="$(find_nm "$upstream")"
  if [[ -z "$src" || ! -d "$src" ]]; then
    echo "SKIP: @supabase/${upstream} not found in node_modules" >&2
    return 1
  fi

  local target="${ROOT}/${target_rel}"
  mkdir -p "$target"

  echo "Vendoring @supabase/${upstream} -> ${new_name} (${target_rel})"

  rm -rf "${target}/dist" "${target}/src" "${target}/out"
  for item in dist src out LICENSE README.md; do
    [[ -e "${src}/${item}" ]] && cp -R "${src}/${item}" "${target}/"
  done

  # Base package.json from upstream, then rebrand.
  node -e "
    const fs = require('fs');
    const path = require('path');
    const src = JSON.parse(fs.readFileSync('${src}/package.json', 'utf8'));
    const out = {
      name: '${new_name}',
      version: src.version || '0.0.0',
      description: (src.description || '').replace(/Supabase/g, 'Indobase'),
      license: src.license || 'MIT',
      author: 'Indobase',
      type: src.type,
      sideEffects: src.sideEffects,
      main: src.main,
      module: src.module,
      types: src.types,
      exports: src.exports,
      files: src.files,
      dependencies: src.dependencies || {},
      peerDependencies: src.peerDependencies,
      bin: src.bin,
    };
    Object.keys(out).forEach(k => out[k] === undefined && delete out[k]);
    fs.writeFileSync('${target}/package.json', JSON.stringify(out, null, 2) + '\n');
  "

  rename_supabase_scope "$target"

  # Strip upstream @supabase/* deps — workspace wiring happens in root package.json edits.
  node -e "
    const fs = require('fs');
    const p = '${target}/package.json';
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const map = {
      '@supabase/auth-js': '@indobaseinc/auth-js',
      '@supabase/postgrest-js': '@indobaseinc/postgrest-js',
      '@supabase/realtime-js': '@indobaseinc/realtime-js',
      '@supabase/storage-js': '@indobaseinc/storage-js',
      '@supabase/functions-js': '@indobaseinc/functions-js',
      '@supabase/supabase-js': 'indobase-js',
      '@supabase/ssr': '@indobaseinc/ssr',
    };
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      if (!pkg[field]) continue;
      for (const [k, v] of Object.entries(pkg[field])) {
        if (map[k]) {
          pkg[field][map[k]] = 'workspace:*';
          delete pkg[field][k];
        }
      }
      if (Object.keys(pkg[field]).length === 0) delete pkg[field];
    }
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  "

  # Remove thin shim entrypoints from Phase A.
  rm -f "${target}/index.ts" "${target}/platform.ts" "${target}/platform/api.ts"
  rm -rf "${target}/out/constants.ts" "${target}/out/events.ts" "${target}/out/notifications.ts" 2>/dev/null || true
}

# Client stack
vendor_package "auth-js" "packages/indobase-auth-js" "@indobaseinc/auth-js"
vendor_package "postgrest-js" "packages/indobase-postgrest-js" "@indobaseinc/postgrest-js"
vendor_package "realtime-js" "packages/indobase-realtime-js" "@indobaseinc/realtime-js"
vendor_package "functions-js" "packages/indobase-functions-js" "@indobaseinc/functions-js"
vendor_package "storage-js" "packages/indobase-storage-js" "@indobaseinc/storage-js"
vendor_package "supabase-js" "packages/indobase-js" "indobase-js"

# Tooling / SSR / types
vendor_package "ssr" "packages/indobase-ssr" "@indobaseinc/ssr"
vendor_package "sql-to-rest" "packages/indobase-sql-to-rest" "@indobaseinc/sql-to-rest"
vendor_package "shared-types" "packages/indobase-shared-types" "@indobaseinc/shared-types"
vendor_package "postgres-meta" "packages/indobase-postgres-meta" "@indobaseinc/postgres-meta"
vendor_package "mcp-utils" "packages/indobase-mcp-utils" "@indobaseinc/mcp-utils"
vendor_package "mcp-server-supabase" "packages/indobase-mcp-server" "@indobaseinc/mcp-server"

# indobase-js workspace deps
node -e "
const fs = require('fs');
const p = 'packages/indobase-js/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.dependencies = {
  '@indobaseinc/auth-js': 'workspace:*',
  '@indobaseinc/functions-js': 'workspace:*',
  '@indobaseinc/postgrest-js': 'workspace:*',
  '@indobaseinc/realtime-js': 'workspace:*',
  '@indobaseinc/storage-js': 'workspace:*',
};
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"

# Restore Indobase MCP aliases on top of vendored server.
cat > packages/indobase-mcp-server/indobase-entry.ts <<'EOF'
export {
  createSupabaseMcpServer as createIndobaseMcpServer,
  type SupabasePlatform as IndobasePlatform,
} from './dist/index.js'
EOF

echo "Phase B vendoring complete. Run: pnpm install && ./scripts/audit-no-supabase.sh"
