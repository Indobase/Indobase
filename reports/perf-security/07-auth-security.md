# 07) Authentication & Security Testing

Generated: 2026-05-06

## Goal
Validate auth/security properties:
- correct tenant isolation (no cross-project access)
- RLS correctness for control-plane (`saas.*`)
- secrets hygiene (no plaintext tenant DSNs/keys)
- gateway attribution integrity (`x-project-ref`)

## What exists in this codebase
### Control-plane isolation
- `actorId` is applied to many control-plane queries via:
  - `apps/studio/lib/api/self-hosted/query.ts` (sets `app.uid`)
  - `apps/studio/lib/api/self-hosted/platform.ts`
- `saas.*` schema includes RLS migration:
  - `supabase/migrations/20260421101500_saas_tenant_isolation.sql`

### Secrets hygiene
- Tenant DB DSN encrypted-at-rest (`connection_string_enc`)
- Per-project keys encrypted-at-rest (`anon_key_enc`, `service_key_enc`)
  - migrations: `supabase/migrations/20260424094500...`, `20260424095500...`

### Gateway attribution
- Kong derives `x-project-ref` from hostname label:
  - `docker/volumes/api/kong.yml`

## Key gaps (Supabase Cloud parity)
- Gateway does **not validate** that `x-project-ref` exists in `saas.projects` (it’s best-effort).
- Tenant DB bootstrap is missing; full auth/storage policies per tenant are not guaranteed yet.
- Audit log persistence for self-hosted control-plane is largely missing/stubbed.

## Recommended tests (manual + automated)
### A) Tenant isolation tests (must-have)
1) Create two projects: A and B
2) Ensure tenant stacks are provisioned for both
3) With A’s anon key, attempt to access B’s endpoints:
   - `https://B.indobase.in/rest/v1/...`
4) Expected: **403/401**, never 200

### B) Control-plane RLS regression
Attempt to fetch projects/orgs not belonging to the actor.
Expected: 0 rows / 403 depending on endpoint.

### C) Secrets leakage scan
Search in logs for:
- raw Postgres DSNs
- anon/service keys
Ensure only encrypted values are stored in `saas.projects.*_enc`.

## Evidence to capture
- Request/response traces for cross-tenant attempts
- DB query logs for RLS rejections
- Kong access logs with `.metadata.project_ref`

