# Hostinger staging (indobase.fun)

Staging Studio + Builder on Hostinger Dokploy VPS; shared prod API/data plane on Vyom.

**Git:** commit Studio/Builder work on branch **`staging`**. Promote to **`main`** / Vyom only after `*.indobase.fun` smoke is OK.

| Host | Role |
|------|------|
| `srv1085730.hstgr.cloud` (`72.61.242.251`) | Staging VPS (Dokploy + Traefik) |
| `https://studio.indobase.fun` | Staging Studio |
| `https://builder.indobase.fun` | Staging Builder |
| `https://api.indobase.in` | **Production** Kong (unchanged) |
| `*.indobase.in` tenants | **Production** on `.248` (unchanged) |

Do **not** use `srv1375857` / `187.77.30.165` for this staging pair.

## Swarm services

| Service | Image port | Memory cap |
|---------|------------|------------|
| `indobase-studio-staging` | 8080 | 1100m |
| `indobase-builder-staging` | 5173 | 1100m |

Traefik file routes:

- `/etc/dokploy/traefik/dynamic/studio-indobase-fun.yml`
- `/etc/dokploy/traefik/dynamic/builder-indobase-fun.yml`

Runtime env:

- `/opt/indobase-staging/env/studio.env`
- `/opt/indobase-staging/env/builder.env`
- `/opt/indobase-staging/env/handoff.secret` (shared `BUILDER_HANDOFF_SECRET`)

A 2 GB `/swapfile` is expected on this 4 GB box (Dokploy already uses ~1.5 GB).

## DNS

A records (TTL 300):

- `studio.indobase.fun` → `72.61.242.251`
- `builder.indobase.fun` → `72.61.242.251`

## Deploy / update

Push to **`staging`** builds Hub images (same workflow as `main`). Both tags must exist for the SHA (Studio `ind-repo` + Builder `indobase-builder`).

```bash
git checkout staging
git push origin staging
# wait for CI, then:
IMAGE_TAG=<sha-with-both-images> ./docker/scripts/deploy-staging-hostinger.sh
```

The deploy script **upserts** env keys (does not wipe `OPEN_ROUTER_API_KEY`). It keeps:

- Studio: `SITE_URL` / `NEXT_PUBLIC_SITE_URL` = `https://studio.indobase.fun`, `BUILDER_APP_URL` = Builder `.fun`
- Builder: `STUDIO_INTERNAL_URL` = Swarm DNS `http://indobase-studio-staging:8080`; `INDOBASE_STUDIO_URL` = public `https://studio.indobase.fun`

## After first boot

1. **Builder LLM keys** — set `OPEN_ROUTER_API_KEY` in `/opt/indobase-staging/env/builder.env`, then recreate the Builder service (or re-run deploy).
2. **Prod CORS / GoTrue redirects** (requires Vyom `.249` SSH):

```bash
./docker/scripts/staging-allowlist-indobase-fun.sh
```

3. **Studio Postgres/meta** — UFW on `.249` must allow `72.61.242.251` → `5433` / `8081`. Prefer `POSTGRES_HOST=db` + `STUDIO_PG_META_URL=http://103.190.92.249:8081` so meta resolves (avoid hairpin to public `:5433`).

## Staging URL behavior (same CI image as prod)

CI still bakes `NEXT_PUBLIC_SITE_URL=https://studio.indobase.in`. Staging works without a separate image because:

- Studio injects runtime `siteUrl` / `builderAppUrl` via `_document` + `/api/platform/runtime-public-env` (reads container `SITE_URL` / `BUILDER_APP_URL`).
- Builder **Connect via Studio** maps `builder.*` → `studio.*` (so `.fun` → `.fun`) when no handoff `studio_url` is stored.
- CSP allowlists `studio.indobase.fun` and `builder.indobase.fun`.

## Smoke

```bash
curl -sS https://studio.indobase.fun/api/health
curl -sS https://builder.indobase.fun/api/health/ready
curl -sS https://builder.indobase.fun/api/health/live
curl -sS https://studio.indobase.fun/api/platform/runtime-public-env
# Expect siteUrl / builderAppUrl pointing at *.indobase.fun
```

Manual: sign in on Studio `.fun` → open Builder; or on Builder click **Connect via Studio** → should land on `studio.indobase.fun`, not `.in`.

## Promote to production

After staging is OK: merge `staging` → `main`, push `main`, deploy to Vyom per `.cursor/rules/indobase-prod-redeploy.mdc`.

## Limits

- Studio + Builder only — no Postgres/Kong clone on this box.
- Login against prod API requires the CORS/redirect allowlist above.
