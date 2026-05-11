# Shared-Table (RLS) Multitenancy

All users share **one large cluster**. Row Level Security (RLS) separates each tenant’s data in shared tables.

## Indobase control plane (`saas` schema)

Studio bootstraps **`saas.*`** tables from code, then applies **membership-based RLS** in one shot (same rules as `supabase/migrations/20260421101500_saas_tenant_isolation.sql` plus `docker/volumes/db/saas-features.sql` for `audit_logs`, `custom_domains`, `third_party_auth_integrations`):

- Helper **`saas.current_user_id()`** reads **`app.uid`** (set by every `executeQuery` server call from the signed-in user’s GoTrue id) or PostgREST’s **`request.jwt.claim.sub`** when present.
- **`saas.is_member_of_project` / `saas.is_member_of_org`** back RLS on feature tables.
- First successful API hit after deploy runs this DDL **once** (skipped if `saas.current_user_id` already exists).

For **FORCE ROW LEVEL SECURITY** (RLS even for table owners), see comments at the end of that migration; enable only after you confirm all Studio paths set `app.uid` correctly.

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

**This repo’s main DB** also ships a **helpers-only** migration (no example table):  
[`supabase/migrations/20260512120000_public_app_multitenancy_helpers.sql`](supabase/migrations/20260512120000_public_app_multitenancy_helpers.sql). Use that when you already have app tables and only need `current_tenant_id` / `set_tenant_id`.

Copy the template (or the helpers migration) into your **project’s** `supabase/migrations/` (with a new timestamp if needed) and run it against your **project database**. The full template provides:

- `public.current_tenant_id()` – tenant UUID from JWT: top-level `tenant_id`, then `app_metadata.tenant_id`, then `request.jwt.claim.tenant_id`, then `app.tenant_id`.
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
   Ensure the access token seen by PostgREST includes a **`tenant_id`** claim (UUID string). Common approaches:

   - **Admin API (no hook):** After you know the user’s tenant, call GoTrue Admin **`updateUserById`** (or equivalent) with `app_metadata: { ..., tenant_id: "<uuid>" }`, then have the client **`refreshSession()`** so the next JWT carries the update. `current_tenant_id()` reads **`app_metadata.tenant_id`** (and top-level `tenant_id` if you add it via a hook) from `request.jwt.claims`.
   - **Custom Access Token hook:** Point Auth at an Edge Function (or HTTP endpoint) that adds `tenant_id` to the JWT claims from your org-membership table. Configure this in the Supabase / Indobase Auth dashboard or your hosted GoTrue settings; see upstream Supabase docs for *Custom Access Token Hook*.
   - **Different claim name:** Change `public.current_tenant_id()` in your migration to read your claim, or copy the value into `tenant_id` inside the hook.

3. **Per-request override (optional)**  
   Backend code using the **service role** can run `select public.set_tenant_id('<uuid>'::uuid)` (or `set_config('app.tenant_id', '<uuid>', true)`) at the start of a transaction so RLS evaluates with that tenant (e.g. server-side jobs acting for one tenant). Only grant `execute` on `set_tenant_id` to roles you trust.

### Indobase Studio (SaaS console)

Studio keeps the signed-in user’s JWT aligned with the **selected organization**:

- **`POST /api/platform/profile/sync-tenant-claim`** (authenticated) with body `{ "organizationSlug": "<slug>" }` verifies membership, then sets GoTrue **`app_metadata.tenant_id`** and **`app_metadata.saas_organization_id`** via the service role.
- **`tenant_id`** is a **stable UUID** derived from the integer `saas.organizations.id` (uuid v5; namespace constant in `apps/studio/lib/saas-organization-tenant-uuid.ts`). Use the same derivation in SQL or app code if you need to match rows to the console org without storing the integer on the JWT.
- **`TenantJwtClaimSync`** in the Studio app calls that endpoint when the selected org changes, then **`refreshSession()`** so the next access token includes the updated `app_metadata`.

## Summary

| Aspect | Approach |
|--------|----------|
| **Cluster** | Single shared cluster |
| **Tables** | Shared; each tenant-scoped table has `tenant_id` |
| **Separation** | RLS by `tenant_id` from JWT or `app.tenant_id` |
| **Tenant in JWT** | Set via `app_metadata` / custom claims so JWT has `tenant_id` |

This gives you **Shared-Table (RLS)** multitenancy: one cluster, one schema, with tenant isolation enforced in the database.
