# Single Database Multi‑Tenancy (RLS) – Indobase

This document describes the **single Postgres database + strict RLS** tenancy model.

## Summary
- **One Postgres instance**
- **One shared database**
- Tenant isolation is enforced by **Row Level Security** using a tenant identifier (`project_ref`).
- Every data-plane request must carry tenant context:
  - JWT claim `project_ref` (recommended; your per-project anon/service keys already include it), or
  - request header `x-project-ref` (gateway-injected or client-provided)

## Implemented foundation
- Postgres helper functions + fail-closed hook:
  - `docker/volumes/db/tenant-rls.sql`
  - `app.project_ref()`: resolves tenant context
  - `app.set_project_ref()`: sets `app.project_ref` and **throws** if missing
- PostgREST is wired to run the hook on every request:
  - `docker/docker-compose.yml` → `PGRST_DB_PRE_REQUEST: app.set_project_ref`

## What you must do to complete the model (permanent fix)
To guarantee isolation, **every tenant-owned table** must:
1) include a tenant key column (recommended: `project_ref text not null`)
2) have RLS enabled
3) have policies enforcing `project_ref = app.project_ref()`

Template:

```sql
alter table public.my_table add column project_ref text not null;
create index on public.my_table (project_ref);

alter table public.my_table enable row level security;

create policy tenant_isolation on public.my_table
  for all
  using (project_ref = app.project_ref())
  with check (project_ref = app.project_ref());
```

## Notes / gotchas
- **Fail-closed** means requests without tenant context will error. For Cloud-style usage, always use
  `https://<project-ref>.indobase.in/...` or provide tokens that include `project_ref`.
- This model does **not** automatically isolate:
  - `auth.*` tables (GoTrue)
  - `storage.*` tables (Storage API)
  - `realtime` internals
Unless those schemas are also made tenant-aware (tenant key + RLS) or you run per-tenant stacks.

## Recommended next implementation steps
1) Decide which schemas are tenant-shared vs tenant-isolated.
2) Implement tenant-aware versions of:
   - storage objects/buckets
   - auth users/identities (or keep auth per-tenant via separate stacks)
3) Add automated checks that reject migrations lacking tenant key + RLS policy.

