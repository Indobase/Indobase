# Audit rebrand — Supabase → Indobase

Phase A removes `@supabase/*` from application source. Client SDKs are published on npm under **`@indobaseinc/*`** (no workspace forks for shipped apps).

## Published npm packages (use these in apps)

| Package | Version (catalog) |
|---------|-------------------|
| `@indobaseinc/indobase-js` | 1.0.8 |
| `@indobaseinc/js` | 1.0.8 (convenience wrapper) |
| `@indobaseinc/auth-js` | 1.0.8 |
| `@indobaseinc/postgrest-js` | 1.0.8 |
| `@indobaseinc/realtime-js` | 1.0.8 |
| `@indobaseinc/storage-js` | 1.0.8 |
| `@indobaseinc/functions-js` | 1.0.8 |
| `@indobaseinc/ssr` | 0.12.0 |
| `@indobaseinc/auth-ui-shared` | 1.0.1 |
| `@indobaseinc/auth-ui-react` | 1.0.1 |
| `@indobaseinc/auth-ui-svelte` | 1.0.1 |
| `@indobaseinc/pg-meta` | 0.93.1 |
| `@indobaseinc/postgres-meta` | 0.64.6 |
| `@indobaseinc/shared-types` | 0.1.84 |
| `@indobaseinc/mcp-utils` | 0.3.2 |
| `@indobaseinc/mcp-server` | 0.6.3 |
| `@indobaseinc/sql-to-rest` | 0.1.6 |

```bash
pnpm install   # resolves catalog: entries from pnpm-workspace.yaml
```

```ts
import { createClient } from '@indobaseinc/indobase-js'
```

Local directories under `packages/indobase-*` (js, auth-js, ssr, auth-ui, …) are **excluded from the pnpm workspace** — upstream fork source only; do not `workspace:*` them in apps.

**Auth helpers:** do not publish `@indobaseinc/auth-helpers-*` — migrate examples to `@indobaseinc/ssr` instead (deprecated upstream).

## Check

```bash
./scripts/audit-no-supabase.sh
```

## Workspace packages (still local until published)

| Package | Path |
|---------|------|
| `@indobaseinc/build-icons` / `@indobaseinc/generator` | `packages/build-icons`, `packages/generator` |

Publish script: `./scripts/publish-indobase-workspace-packages.sh` (add `--dry-run` to preview tarballs).

## Still allowlisted (intentional)

- `pnpm-lock.yaml`
- `examples/`, `apps/docs/content/guides/` (bulk doc pass or exclude from audit bundle)
- `docker/CHANGELOG.md`, `docker/versions.md`
- Legacy fork sources in `packages/indobase-*/` (not linked in workspace)

## Phase C (post-audit)

- Docker images: `supabase/*` → `indobase/*` on your registry
- Env vars: `SUPABASE_*` → `INDOBASE_*` with compat shim
- DB roles / `_supabase` schema (migration with new postgres image)
