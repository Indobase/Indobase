# Indobase CRM

Leads, deals, opportunities, and sales pipelines for Indobase organizations — **CRM**.

Upstream engine is [Twenty](https://github.com/twentyhq/twenty) (AGPL-3.0); customer-facing branding is Indobase CRM only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md) and [NOTICE.md](./NOTICE.md).

| Host (prod) | Host (staging) |
|---|---|
| `crm.indobase.in` | `crm.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node Studio SSO bridge + branded reverse proxy + **org → workspace map** |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` (Twenty + Postgres + Redis + bridge) |

## Multi-tenant SSO

1. Studio mints `aud=indobase-crm` JWT (`CRM_HANDOFF_SECRET`) with `organization_slug` + `project_ref`.
2. Bridge `/sso/launch` → `/sso/session` verifies the token.
3. Bridge ensures a **Twenty workspace for that organization** (create on first open, or join via stored invite hash), then redirects to `/verify?loginToken=…`.
4. Project ref becomes soft scope (`ib_pipeline` query) — not hard RLS.
5. Engine login/sign-up URLs are blocked; cold visits show an Indobase welcome page.

Workspace mappings persist on the bridge volume (`CRM_WORKSPACE_MAP_PATH`). Do not rely on a single global `TWENTY_WORKSPACE_INVITE_HASH` for production multi-tenant (optional legacy claim only when the map is empty).

## Local / deploy

```bash
cd docker/deploy
cp .env.example .env   # set PG password, TWENTY_APP_SECRET, TWENTY_ENCRYPTION_KEY, CRM_HANDOFF_SECRET
# TWENTY_ENCRYPTION_KEY=$(openssl rand -base64 32)
docker compose up -d --build
# First boot: entrypoint runs DB init + upgrade + cron before :3000 listens (~5–10m).
curl -sS https://crm.indobase.in/sso/health
```

See [docs/INDOBASE-CRM.md](../docs/INDOBASE-CRM.md).
