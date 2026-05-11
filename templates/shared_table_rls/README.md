# Shared-Table RLS multitenancy template

Use this in **project** databases (the DB your app connects to), not the docs/website DB.

The **Studio control plane** (`saas` schema on the same Postgres instance Studio uses) gets RLS automatically when Studio runs—see [MULTITENANCY_RLS.md](../../MULTITENANCY_RLS.md) § *Indobase control plane*. This template is for **your application tables** in `public` (or other schemas) that need `tenant_id` isolation.

## What’s in the migration

- **`public.current_tenant_id()`** – returns the current tenant UUID from (in order):
    - top-level `tenant_id` on `request.jwt.claims` JSON,
    - `app_metadata.tenant_id` (typical when set via GoTrue Admin `app_metadata`),
    - `request.jwt.claim.tenant_id` (alternate PostgREST shape),
    - session `app.tenant_id` (set via `set_tenant_id()` or `set_config`).
- **`public.set_tenant_id(uuid)`** – sets `app.tenant_id` for the current transaction.
- **Example table `public.devices`** – `tenant_id` + RLS so each tenant only sees their own rows.

## How to use

1. Copy `001_shared_table_rls_multitenancy.sql` into your project’s `supabase/migrations/` (e.g. under your repo’s `supabase/migrations/`).
2. Rename if needed to follow your migration naming (e.g. `20260226120000_shared_table_rls.sql`).
3. Run migrations (e.g. `supabase db push` or your CI).
4. Ensure the JWT used by the app includes a **`tenant_id`** claim (see [MULTITENANCY_RLS.md](../../MULTITENANCY_RLS.md)).

## Adding more tenant-scoped tables

For each new table:

1. Add a `tenant_id uuid not null` column (and optionally a FK to your tenants table).
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
3. Add policies using `tenant_id = public.current_tenant_id()` for `SELECT`, `INSERT`, `UPDATE`, `DELETE` as needed.

Example:

```sql
create table public.my_table (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  -- ...
);
alter table public.my_table enable row level security;
create policy "tenant_all" on public.my_table for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
```
