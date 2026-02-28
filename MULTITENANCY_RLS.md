# Shared-Table (RLS) Multitenancy

All users share **one large cluster**. Row Level Security (RLS) separates each tenant’s data in shared tables.

## Model

- **One database**, one set of tables (e.g. `devices`, `organizations`, app tables).
- Every tenant-scoped table has a **`tenant_id`** column (e.g. `uuid`).
- **RLS policies** restrict `SELECT` / `INSERT` / `UPDATE` / `DELETE` to rows where `tenant_id` equals the **current tenant**.
- Current tenant is determined per request from:
  1. **JWT custom claim** `tenant_id` (recommended for app clients), or  
  2. **Session variable** `app.tenant_id` (e.g. set by a backend or Edge Function using the service role).

## Template migration

Use the template that adds the helper and an example tenant-scoped table:

- **Path:** [`templates/shared_table_rls/`](templates/shared_table_rls/)
- **Migration:** `001_shared_table_rls_multitenancy.sql`

Copy that migration into your **project’s** `supabase/migrations/` (with a new timestamp if needed) and run it against your **project database**. It provides:

- `public.current_tenant_id()` – returns the current tenant UUID from JWT or `app.tenant_id`.
- `public.set_tenant_id(uuid)` – sets `app.tenant_id` for the current transaction (e.g. from a backend).
- Example table `public.devices` with `tenant_id` and RLS policies.

For more tenant-scoped tables, add a `tenant_id` column and the same RLS pattern:  
`using (tenant_id = public.current_tenant_id())` and `with check (tenant_id = public.current_tenant_id())`.

## Setting the tenant in the JWT (Indobase Auth / GoTrue)

So that RLS sees the right tenant for each request:

1. **Store tenant on the user**  
   When a user is assigned to a tenant (e.g. organization), store it in `auth.users.app_metadata`, e.g.  
   `{ "tenant_id": "uuid-of-org-or-tenant" }`.

2. **Include it in the JWT**  
   GoTrue can map `app_metadata` (or custom logic) into the JWT. Ensure the JWT payload includes a top-level claim **`tenant_id`** (UUID string).  
   - If your JWT uses a different claim name, either change the template’s `current_tenant_id()` to read that claim, or add a hook that copies it to `tenant_id` in the token.

3. **Per-request override (optional)**  
   Backend code using the **service role** can call `select set_tenant_id('...')` at the start of a request so that RLS still applies with the desired tenant (e.g. for server-side APIs that act on behalf of a tenant).

## Summary

| Aspect | Approach |
|--------|----------|
| **Cluster** | Single shared cluster |
| **Tables** | Shared; each tenant-scoped table has `tenant_id` |
| **Separation** | RLS by `tenant_id` from JWT or `app.tenant_id` |
| **Tenant in JWT** | Set via `app_metadata` / custom claims so JWT has `tenant_id` |

This gives you **Shared-Table (RLS)** multitenancy: one cluster, one schema, with tenant isolation enforced in the database.
