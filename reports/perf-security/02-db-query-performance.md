# 02) Database Query Performance

Generated: 2026-05-06  
Scope: control-plane DB (`saas.*`) and tenant DBs (Option A)

## Goal
Validate DB performance characteristics:
- query latency and throughput (typical CRUD + metadata reads)
- connection pooling behavior
- index effectiveness
- slow query identification

## What exists in this codebase
### Control-plane DB access
- RLS-scoped control-plane queries via `actorId` → `set_config('app.uid', ...)`
  - `apps/studio/lib/api/saas/query.ts`
  - `apps/studio/lib/api/saas/platform.ts`

### Tenant DB provisioning
- Creates `tenantdb_<ref>` and login role `tenant_<ref>` (MVP)
  - `apps/studio/lib/api/saas/provision-tenant-db.ts`
- Stores DSN encrypted-at-rest in `saas.projects.connection_string_enc`
  - `apps/studio/lib/api/saas/platform.ts`

### Major gap: tenant DB bootstrap
New tenant DBs are created empty. There is no in-repo step to apply baseline schemas/roles/extensions
required by REST/auth/storage/realtime. This affects DB perf because many “real queries” don’t exist yet.

## Recommended methodology
1) **Control-plane benchmarks** (saas tables)
   - list orgs, list projects, get project detail
2) **Tenant DB benchmarks**
   - after you implement bootstrap/migrations, run:
     - simple SELECT/INSERT latency
     - index-heavy queries
     - RLS policy overhead (if enabled)

## How to run (VPS)
### A) Query latency sampling with `pg_stat_statements`
Enable `pg_stat_statements` in the Postgres that hosts control-plane DB and tenant DBs.
Then capture:
- top queries by total time
- mean time
- p95 approximations via histogram tooling (if available)

### B) Synthetic benchmark (pgbench)
Run against a target DB:

```bash
pgbench -h <host> -p 5432 -U <user> -d <db> -c 20 -j 4 -T 300
```

### C) Studio query hotspots
Measure latency around:
- `/api/platform/projects`
- `/api/platform/projects/<ref>`
- `/api/platform/organizations/*`

## What to capture in the report
- DB host type (single Postgres vs per-tenant)
- Connection limits / pooler config (supavisor, if used)
- `pg_stat_statements` top N queries
- recommended indexes (based on slow queries)

## Findings (current state)
- Control-plane query isolation is improved (RLS actor id is wired broadly).
- Tenant DB provisioning exists, but without bootstrap most DB performance claims are not yet meaningful.

