# Tenant data plane — SQL migrations after GoTrue / Storage

## GoTrue additive migration (`20260409_gotrue_v2_schema.sql`)

The file at `docker/volumes/db/migrations/20260409_gotrue_v2_schema.sql` **expects `auth.users` and related tables to already exist**. GoTrue creates the base `auth` schema on first startup when `GOTRUE_DB_DATABASE_URL` points at `supabase_auth_admin` on a fresh database.

**Order of operations**

1. Ensure `bootstrapTenantDataPlaneSchemas` (or project create) has run so `auth` schema exists and is owned by `supabase_auth_admin`.
2. Start **tenant-auth** (GoTrue) once so embedded migrations create `auth.users`, `auth.refresh_tokens`, etc.
3. If you hit missing-column errors on an older GoTrue DB, run the SQL file **as a superuser/admin connected to the tenant database**, e.g.:

```bash
docker exec -i indobase-db psql -U postgres -d tenantdb_<ref> -f /path/to/20260409_gotrue_v2_schema.sql
```

4. Re-own tables to `supabase_auth_admin` if needed (the migration file ends with `ALTER TABLE ... OWNER TO supabase_auth_admin` for new tables).

## Storage / Realtime

- **Storage-api** and **Realtime** ship their own migrations on container start; the Studio bootstrap only creates empty `storage` and `_realtime` schemas with correct owners and grants.

## TLS / Traefik

Per-tenant routers use `entryPoints: [web, websecure]`. You must terminate TLS at Traefik (or another edge) for `https://<ref>.<SAAS_PUBLIC_DOMAIN>` to match the `https` URLs emitted in compose for GoTrue and Edge Functions.

## Split passwords for aux roles

Set `SAAS_DATA_PLANE_AUX_ROLE_PASSWORD` on Studio to a strong secret shared by `authenticator`, `supabase_admin`, `supabase_auth_admin`, and `supabase_storage_admin` after bootstrap. Compose and Realtime use this value when building connection strings. The **tenant login role** password in `connection_string_enc` is unchanged unless you rotate it separately.

## Rotating `SAAS_DATA_PLANE_AUX_ROLE_PASSWORD` in production

1. Generate a new strong secret (e.g. `openssl rand -base64 48`) and set `SAAS_DATA_PLANE_AUX_ROLE_PASSWORD` in the Studio environment (and redeploy/restart Studio if needed).
2. For each dedicated-DB project, open **Project → Settings → Infrastructure** and run **Repair DB bootstrap** once. That reapplies `ALTER ROLE … PASSWORD` for the auxiliary roles to match the new env value (same password for all four roles).
3. Run **Write compose & apply** so regenerated `docker-compose.yml` picks up the new URLs for PostgREST, GoTrue, Storage, and Realtime.
4. Optionally rotate the **tenant** DB role password separately in Postgres and update `connection_string_enc` in `saas.projects`; that path is independent of the aux password.

## TLS checklist (`ref.<domain>`)

- [ ] DNS: wildcard or per-record `*.your-public-domain` (or each `ref.your-public-domain`) points to the Traefik (or edge) load balancer.
- [ ] Traefik: certificates resolver configured for that host pattern; `websecure` entrypoint enabled.
- [ ] Studio: `SAAS_PUBLIC_DOMAIN` matches the public hostname used in certificates (no port).
- [ ] Smoke test: `https://<ref>.<domain>/auth/v1/health` (or signup flow) over TLS without browser mixed-content warnings.

## Optional: Supavisor in generated tenant compose (`SAAS_TENANT_EMBED_SUPAVISOR`)

When `SAAS_TENANT_EMBED_SUPAVISOR=true`, Studio reserves **`data_plane_port_base + 6`** on localhost for **Supavisor** (transaction pool on **6543** inside the container, published to that host port). The generated compose adds a **`configs`** block with an inline `pooler.exs` (tenant id = project `ref`, upstream = tenant Postgres, manager user `authenticator` with password from `TENANT_POOLER_AUX_DB_PASSWORD` / `SAAS_DATA_PLANE_AUX_ROLE_PASSWORD`).

1. Run **Repair DB bootstrap** on the tenant so `pgbouncer.get_auth` is installed when the bootstrap role can read `pg_authid` (best-effort; skipped if privileges are insufficient).
2. **Write compose & apply** (or write files only), then start the stack on the host so `tenant-pooler` runs migrations and registers the tenant in Supavisor metadata (metadata DB URL is `ecto://…` for `supabase_admin` on the same tenant database).
3. **Traefik TCP**: the generated HTTP routers do not expose Postgres; for clients using `postgres.<ref>@<ref>.<domain>:6543` you must add a TCP route from the edge to `127.0.0.1:<data_plane_port_base+6>`, or use `SAAS_TENANT_POOLER_HOST` to point Connect UI at an external pooler instead.
