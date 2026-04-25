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

## Verify
- Confirm Traefik picked up:
  - `/etc/dokploy/traefik/dynamic/tenant-<ref>.yml`
- Confirm tenant stack is up:
  - `docker ps | grep indobase-tenant-<ref>`
- Confirm routing:
  - `curl -i https://<ref>.indobase.in/rest/v1/` (should hit tenant-rest)

