# Indobase Analytics

This product is based on [Rybbit](https://github.com/rybbit-io/rybbit) (AGPL-3.0).

## Upstream

- Repository: https://github.com/rybbit-io/rybbit
- Vendored SHA: see `UPSTREAM_SHA.txt`
- License: AGPL-3.0 — full text in `LICENSE.md`

## Indobase modifications

- Product naming and branding: **Indobase Analytics** (UI logos, titles, theme)
- Studio SSO handoff: `/sso/launch`, `/sso/session`, `/sso/health` (`server/src/api/sso/studioHandoff.ts`)
- `DISABLE_SIGNUP=true` + login/signup redirect to Studio
- Deploy: Traefik TLS + nginx edge (no public Caddy) under `docker/deploy/`
- Project ↔ site mapping via site tag `ib-project:{project_ref}` and default domain `{ref}.indobase.in`

## Corresponding source

Modified source for this AGPL product ships in this directory (`indobase-analytics/`) of the Indobase monorepo. Contact: https://indobase.in
