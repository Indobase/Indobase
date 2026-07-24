# Indobase Email

Indobase-branded fork of [Notifuse](https://github.com/Notifuse/notifuse) for
**Indobase Marketing → Email marketing**.

- **License:** AGPL-3.0 — see `LICENCE.md` and `NOTICE.md`
- **Auth:** Studio SSO only (`/console/launch` + `GET /api/studio.handoff`)
- **Hosts:** `email.indobase.fun` (staging) / `email.indobase.in` (production)

## Quick start (local)

```bash
cp env.example .env
# set SECRET_KEY, STUDIO_HANDOFF_SECRET (>=32), API_ENDPOINT, ROOT_EMAIL
docker compose -f docker/deploy/docker-compose.yml up -d --build
```

Open Studio Marketing hub → **Email marketing** → Open (SSO handoff).

## Deploy

See `docker/deploy/` and monorepo `docs/MARKETING.md`.
