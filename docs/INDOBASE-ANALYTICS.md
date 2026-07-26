# Indobase Analytics

**Product:** Indobase Analytics  
**Hosts:** `analytics.indobase.fun` (staging) · `analytics.indobase.in` (production) on Vyom `.249`  
**Source:** `indobase-analytics/` (AGPL-3.0 fork of [Rybbit](https://github.com/rybbit-io/rybbit))  
**Upstream SHA:** see `indobase-analytics/UPSTREAM_SHA.txt`  
**NOTICE:** `indobase-analytics/NOTICE.md`

## Features

| Feature | Status |
|---|---|
| Studio SSO (`/sso/launch`, `ANALYTICS_HANDOFF_SECRET`, `aud=indobase-analytics`) | Yes |
| Kill public signup (`DISABLE_SIGNUP=true` → Studio) | Yes |
| Project ↔ site mapping (`ib-project:{ref}`, create-on-first-launch) | Yes |
| Chooser tile + `/project/[ref]/analytics` hub | Yes |
| Tracking snippet docs in hub | Yes |
| Session replay / funnels / goals | Upstream Rybbit (configure per site) |

## Architecture

```
Studio (Open Analytics)
  └─ GET /api/platform/projects/[ref]/analytics/launch
       → https://analytics.indobase.in/sso/launch?project_ref=…#token=<HS256 aud=indobase-analytics>
            └─ POST /sso/session → Better Auth session + org/site upsert
                 └─ redirect /{siteId}
```

Allowed org roles: owner, admin, developer, viewer.

### Project ↔ site

On first SSO launch, Analytics creates (or reuses) a site with:

- **domain:** `{project_ref}.indobase.in` (override suffix via `ANALYTICS_SITE_DOMAIN_SUFFIX`)
- **tag:** `ib-project:{project_ref}`

## Studio env (Swarm)

```bash
INDOBASE_ANALYTICS_URL=https://analytics.indobase.in   # or .fun on staging Studio
ANALYTICS_HANDOFF_SECRET=<same as analytics .env ANALYTICS_HANDOFF_SECRET>
```

## Deploy (.249)

```bash
# Sync tree to /opt/indobase-analytics (or pull after CI)
cd /opt/indobase-analytics/docker/deploy
cp .env.example .env   # fill ANALYTICS_HANDOFF_SECRET, BETTER_AUTH_SECRET, DB passwords
docker compose --env-file .env up -d --build

# Traefik file provider (container DNS):
cp traefik/indobase-analytics.yml /etc/dokploy/traefik/dynamic/indobase-analytics.yml
```

Prefer SHA-pinned Hub images after CI (`docker-publish-analytics.yml`):

```bash
BACKEND_IMAGE=roshanraghavander/indobase-analytics-backend:<sha> \
CLIENT_IMAGE=roshanraghavander/indobase-analytics-client:<sha> \
  docker compose --env-file .env up -d
```

## Tracking snippet

```html
<script
  src="https://analytics.indobase.in/api/script.js"
  data-site-id="SITE_ID"
  defer
></script>
```

Use `analytics.indobase.fun` on staging. `SITE_ID` is the numeric id in the dashboard URL after first Open Analytics.

## Smoke

```bash
curl -sS https://analytics.indobase.fun/sso/health
curl -sS https://analytics.indobase.in/sso/health
# Studio → project chooser → Analytics → Open Analytics (SSO, no password signup)
```

## AGPL

Indobase Analytics is AGPL-3.0. Corresponding source is published in this monorepo under `indobase-analytics/`. See `NOTICE.md` and `LICENSE.md`.

## Gaps / P1

- Session replay and advanced site flags are not auto-enabled on create (toggle in Analytics UI).
- Hub snippet shows placeholder `SITE_ID` until first launch returns the real id (extend SSO response → Studio if you want it persisted in saas).
- Large upstream docs/marketing tree is vendored for AGPL completeness; runtime deploy uses `server` + `client` images only.
