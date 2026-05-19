# Platform admin, metering, and production readiness

Studio ships a **Platform admin** UI (`/platform-admin/*`), but several behaviors depend on **ops configuration** and the **data plane**, not only on application code.

## 1. Who can open Platform admin?

Access is gated server-side by `isPlatformOperator` (`apps/studio/lib/api/saas/platform-operator.ts`).

Set **at least one** of these on the **Studio** service environment (Dokploy, Swarm, or `docker-compose`), then restart Studio:

| Variable | Purpose |
|----------|---------|
| `PLATFORM_OPERATOR_EMAILS` | Comma- or whitespace-separated primary emails (matched case-insensitively to the signed-in user). |
| `PLATFORM_OPERATOR_GOTRUE_IDS` | Comma- or whitespace-separated GoTrue user UUIDs. |

If both are empty, every platform-admin API returns **Forbidden** and the nav entry will not help.

**Verify:** sign in as an allowlisted user, open `/platform-admin/overview`, and confirm the page loads without a permission error.

## 2. Metering cards and `saas.usage_events`

Usage summaries in Platform admin read from **`saas.usage_events`**. The UI can show **“no events yet”** or empty charts when:

- The table was never created on the control-plane database, or
- **Vector** is not running, not receiving Kong access logs, or the **Postgres sink** is misconfigured.

### Schema

Apply the migration on the **same Postgres** Studio uses for `saas.*` (see `docker/volumes/db/saas-usage-metering.sql`). Fresh Docker Compose mounts this file during DB init; existing servers may need a manual `psql -f` run once.

Studio also bootstraps a compatible table from `ensureSaasTables` in `apps/studio/lib/api/saas/platform.ts`, but production should still treat `saas-usage-metering.sql` as the source of truth for indexes and `saas.usage_daily`.

### Vector / Kong path

In `docker/volumes/logs/vector.yml`:

1. **`kong_logs`** (and related transforms) carry `metadata.request.host`, method, path, status, bytes, timings.
2. Transform **`usage_events`** maps those fields into rows that match `saas.usage_events` columns.
3. Sink **`postgres_usage_events`** writes to `saas.usage_events` using **`USAGE_METERING_DB_URL`** (must reach the control-plane DB; often the same DSN Studio uses for SaaS queries).

`project_ref` is derived from the **first subdomain** of the request host when it is not a reserved name (`api`, `studio`, `kong`, etc.). If traffic never hits Kong with tenant-style hosts, events will not attribute to a project.

**Verify:**

```sql
select count(*) from saas.usage_events;
select max(occurred_at) from saas.usage_events;
```

After real API traffic through Kong, counts should grow and Platform admin usage widgets should populate.

## 3. Deletes: control-plane vs infrastructure teardown

### Projects and organizations (platform operator)

When **`PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN`** is unset or not the string `false`, **deleting a project** or **deleting an organization** (which removes its projects first) runs a **best-effort full teardown** for the Indobase “Option A” layout:

1. **`POST /teardown`** on the **data-plane provisioner** (same service as provisioning): runs `docker compose … down -v` for the tenant compose file (when present), removes `tenant-<ref>.yml` from Traefik’s dynamic dir, and best-effort `docker volume rm` for the Edge Functions seed volume. Requires `DATA_PLANE_PROVISIONER_URL` and `DATA_PLANE_PROVISIONER_TOKEN` on Studio.

2. **Dedicated tenant Postgres**: if the project row has a stored connection string (encrypted or legacy plaintext), Studio drops the **`tenantdb_*` / `tenant_*`** database and role using **`POSTGRES_HOST`**, **`POSTGRES_PORT`**, **`POSTGRES_PASSWORD`**, and the same admin user rules as provisioning (`resolveTenantProvisionAdminUser`).

Set **`PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN=false`** on Studio to **only** delete `saas.*` rows (legacy behavior) if you must recover from a broken host or missing env.

### Still not automatic

Even with teardown enabled, **external** resources are not guaranteed to be removed:

- Cloud object storage buckets (S3, etc.) if you added them outside this stack  
- DNS records or TLS certs outside Traefik’s dynamic file  
- Backups, log archives, or off-cluster databases  

**User delete** in Platform admin remains control-plane + GoTrue focused; it does not walk every org’s Docker stack.

The delete confirmation modal still reminds operators that **full** cleanup may require runbooks beyond Studio.

## 4. Product limits (intentional)

Not implemented in this surface (non-exhaustive):

- **Impersonation** (would need a dedicated, audited token path)  
- **Server-side “export all audit rows”** at unbounded scale (UI supports filtered lists, paging, and CSV for the **current page** only)  
- Full billing provider operations (consoles remain source of truth; Studio exposes selected fields and lifecycle flags)

## 5. Quality gate before calling production “ready”

A code merge is not a substitute for an environment check. After deploy, run at least one **happy path** on **staging** (or production with a test org):

1. Allowlisted operator can load `/platform-admin/overview`.  
2. Open one organization detail; billing PATCH and suspend/unsuspend behave as expected.  
3. Confirm `saas.usage_events` receives rows under real Kong traffic (or load a single known request and recheck SQL).  
4. Optional: tenant org under **`platform_suspended`** shows the red banner and cannot create a project or invite members (API should reject with a clear error).

Document any gaps in your internal runbook rather than assuming the UI implies full infra teardown or complete billing control.
