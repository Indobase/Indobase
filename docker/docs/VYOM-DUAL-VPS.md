# Vyom dual-VPS topology (Option B)

Production Indobase runs on **two Vyom Cloud VPS** hosts — not Hostinger.

| Role | Host | RAM | vCPU | DNS |
|------|------|-----|------|-----|
| **Control plane** | `103.190.92.249` | 16 GB | 4 | `studio`, `api`, `builder`, `status`, `mail` |
| **Tenant data plane** | `103.190.92.248` | 16 GB | 4 | `*` (wildcard → `<ref>.indobase.in`) |

## What runs where

### `.249` — platform (Studio + Builder)

- Docker Swarm: `indobase-studio-*`, `indobase-builder`, `indobase-website`
- Compose stack: Postgres (`indobase-db`), Kong (internal), GoTrue, meta, analytics, functions
- **No** per-tenant stacks
- Studio env: `DATA_PLANE_PROVISIONER_URL=http://103.190.92.248:8787`

Compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.dokploy.yml \
  -f docker-compose.platform-override.yml -f docker-compose.platform-vps.yml up -d
```

### `.248` — backend (tenants only)

- `data-plane-provisioner` (port 8787, reachable from `.249`)
- Dokploy Traefik + wildcard TLS for `*.indobase.in`
- Per-tenant compose under `/var/lib/indobase/tenants/<ref>/`
- Traefik dynamic configs under `/etc/dokploy/traefik/dynamic/`

Compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.backend-vps.yml up -d data-plane-provisioner
```

Provisioner connects to platform Postgres via `PROVISIONER_PG_HOST=103.190.92.249`.

## DNS (Hostinger hPanel → indobase.in)

Update A records in [hPanel DNS](https://hpanel.hostinger.com/):

| Name | Type | Value | Purpose |
|------|------|-------|---------|
| `studio` | A | `103.190.92.249` | Studio UI |
| `api` | A | `103.190.92.249` | Control-plane Kong |
| `builder` | A | `103.190.92.249` | Builder |
| `status` | A | `103.190.92.249` | Health redirect |
| `mail` | A | `103.190.92.249` | Inbucket (optional) |
| `*` | A | `103.190.92.248` | Tenant project hosts |

Verify:

```bash
bash docker/scripts/vyom/verify-dual-vps-topology.sh
```

## Deploy / redeploy

- **Studio + Builder:** Swarm on `.249` — see `.cursor/rules/indobase-prod-redeploy.mdc`
- **Provisioner:** roll out on `.248` via `bash docker/scripts/rollout-data-plane-provisioner-compose.sh <sha>`
- **Fleet repair cron:** install on `.248` only (`VPS_IP=103.190.92.248`)

## Decommission Hostinger (`.165`)

After DNS propagates and tenants are on `.248`:

1. Scale Swarm `indobase-studio-*` and `indobase-builder` on `.165` to 0
2. Stop tenant stacks on `.165`
3. Remove fleet-repair cron on `.165`

Do **not** use `187.77.30.165` for new Indobase deployments.
