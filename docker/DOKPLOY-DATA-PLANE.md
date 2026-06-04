# Dokploy (Hostinger VPS): per-project data-plane isolation (Option A)

## What changes with Option A
- `api.indobase.in` continues to route to **Kong** (shared/control-plane style).
- `<project-ref>.indobase.in` routes to a **per-project isolated stack** (REST/Auth/Storage/Realtime/Functions) via Traefik dynamic configs written at:
  - `/etc/dokploy/traefik/dynamic/tenant-<project-ref>.yml`

## Required DNS/TLS
- Wildcard DNS: `*.indobase.in` -> VPS IP
- Wildcard TLS in Traefik/Dokploy for `*.indobase.in`
- Dedicated records pointing to the same VPS:
  - `api.indobase.in`
  - `studio.indobase.in`

## Traefik dynamic config
1) Copy the Kong router file to the VPS (control-plane only):

- `docker/traefik/indobase-backend-kong.yml` -> `/etc/dokploy/traefik/dynamic/indobase-backend-kong.yml`

2) Ensure this file **only** routes:
- `Host(api.indobase.in)` -> Kong

It must **not** include `HostRegexp({project}.yourdomain.com)` or it will steal tenant traffic.

## Provisioner service (writes tenant configs + starts stacks)
The repo’s `docker/docker-compose.yml` includes a `data-plane-provisioner` service that needs:
- bind mount to `/etc/dokploy/traefik/dynamic` (host)
- bind mount to a tenants output dir (host)
- mount `/var/run/docker.sock` (host)

### Environment variables (on the VPS)
Set these in the Dokploy environment for the stack (or in your compose env):
- `DATA_PLANE_PROVISIONER_TOKEN`: strong random secret
- `TRAEFIK_DYNAMIC_DIR=/etc/dokploy/traefik/dynamic`
- `DATA_PLANE_TENANTS_DIR=/var/lib/indobase/tenants` (recommended host path)
- `PUBLIC_DOMAIN=indobase.in`

## Trigger provisioning from Studio
Call (authenticated):
- `POST /api/platform/projects/<ref>/provision-data-plane`

Body:
```json
{ "public_domain": "indobase.in", "apply": true }
```

## Teardown (platform admin delete)

The **data-plane provisioner** also exposes **`POST /teardown`** (same `Authorization: Bearer` token as `/provision`). Studio calls this when a **platform operator** deletes a project or organization from Platform admin (unless `PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN=false` on Studio).

It runs `docker compose down -v` for the tenant’s `docker-compose.yml` when that file exists, deletes `tenant-<ref>.yml` from the Traefik dynamic directory, and best-effort removes the functions seed volume.

Dedicated tenant databases are dropped separately by Studio using `POSTGRES_*` (see `docker/PLATFORM-ADMIN-OPS.md`).

## Per-tenant health check

```bash
TENANT_HOST=<project-ref>.indobase.in ./docker/scripts/tenant-api-health-check.sh
```

REST and Auth must return HTTP 200 (or REST 401 without API key). See `docker/docs/ADRAL-TENANT-RUNBOOK.md` for the Adral project example.

## Fleet repair (all customers)

When many tenants show **REST 502** but **Auth 200**, compose files usually still have the legacy aux password (`kVfP0FQo2cGGlqAX`) while Postgres roles use `SAAS_DATA_PLANE_AUX_ROLE_PASSWORD` (`Indobase100` on production).

On the VPS (run inside `tmux` — takes several minutes):

```bash
export POSTGRES_PASSWORD=Indobase100
export PG_ADMIN_PASSWORD=Indobase100
export SAAS_DATA_PLANE_AUX_ROLE_PASSWORD=Indobase100
bash docker/scripts/repair-tenant-stacks-on-vps.sh
```

The script syncs compose passwords, DB roles, imgproxy aliases, edge `main` router, Traefik upstreams, and prints a per-tenant REST/Auth probe summary (`probe_failures=0` when healthy).

## Tenant routing repair (all customers)

Per-project URLs must strip `/rest/v1`, `/auth/v1`, etc. before hitting PostgREST/GoTrue (same as Kong `strip_path`). After upgrading Studio or the provisioner, repair every **running** tenant stack on the VPS:

```bash
# On the VPS (paths may vary)
node /path/to/repo/docker/scripts/fix-tenant-traefik-from-docker.cjs /etc/dokploy/traefik/dynamic
node /path/to/repo/docker/scripts/verify-tenant-routing.cjs indobase.in
```

Or call the provisioner (same token as `/provision`):

```bash
curl -sS -X POST "http://127.0.0.1:8787/repair-traefik" \
  -H "Authorization: Bearer $DATA_PLANE_PROVISIONER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

New provisions via `/provision` normalize Traefik automatically after `docker compose up`.

## Verify
- Confirm Traefik picked up:
  - `/etc/dokploy/traefik/dynamic/tenant-<ref>.yml`
- Confirm tenant stack is up:
  - `docker ps | grep indobase-tenant-<ref>`
- Confirm routing:
  - `curl -i https://<ref>.indobase.in/rest/v1/` (should hit tenant-rest)

