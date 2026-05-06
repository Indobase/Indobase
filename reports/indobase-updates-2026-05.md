## Indobase – Updates summary

### SaaS groundwork (control plane + provisioning)
- Added SaaS project/organization flows and an Option A (per-project data-plane stack) provisioning pipeline.
- Added runbooks and tightened routing so wildcard tenant traffic can’t bypass per-tenant configs.
- Added encrypted storage for per-project credentials and deterministic per-project data-plane port allocation.

### Deployment reliability (Dokploy + self-hosted)
- Fixed Kong declarative config rendering issues (safe quoting for Lua snippets, removed problematic characters in comments, normalized line endings).
- Fixed Kong upstream routing / Docker DNS issues by using explicit container names.
- Improved Studio/self-hosted service URLs (internal GoTrue URL) to avoid external network calls during auth validation.
- Made default workspace creation idempotent and improved self-hosted stability.

### Single-DB multi-tenancy (RLS foundation)
- Implemented strict, fail-closed tenant context:
  - `app.project_ref()` reads tenant context from JWT/header/GUC
  - `app.set_project_ref()` sets session tenant and throws if missing tenant context
- Added tenantization helper + automation for new tables in the `tenant` schema.
- Wired PostgREST to enforce tenant context via `PGRST_DB_PRE_REQUEST`.

### Storage tenant isolation (shared DB, strict policies)
- Added `project_ref` to `storage.buckets` and `storage.objects`.
- Added insert triggers to ensure rows are tagged with the current tenant.
- Enabled **RLS + FORCE RLS** and applied strict tenant policies using `app.project_ref()`.

### Gateway hardening (tenant APIs)
- Blocked `service_role` from tenant-facing APIs at Kong (tenant APIs allow `anon` only).
- Added `key-auth + acl` gating to Storage and Functions routes.

### Metering (direct, tenant-safe)
- Added latency fields to Kong access logs.
- Updated Vector parsing to extract `project_ref`, bytes sent, and latency.
- Added direct ingestion into Postgres:
  - `saas.usage_events`
  - `saas.usage_daily` rollup view

### Deploy automation (no manual SQL)
- Added a one-shot `db-migrator` service that reapplies idempotent SQL against an existing Postgres volume on every redeploy.

