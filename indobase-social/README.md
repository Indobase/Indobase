# Indobase Social

**Indobase Social** schedules and publishes social media posts across many channels.
Fork of [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0) for
**Indobase Marketing → Social media posting**.

- **Brand:** Indobase Social only (no Postiz/Gitroom product naming in shipped UI)
- **Auth:** Studio SSO only (`/auth/launch` + `GET /auth/studio-handoff`)
- **License:** keep `LICENSE` + `NOTICE.md`; source at
  `https://github.com/Indobase/Indobase/tree/main/indobase-social`
- **Upstream SHA:** see `UPSTREAM_SHA.txt`

## Deploy

Compose: `docker/deploy/docker-compose.yml`

```bash
# After CI publishes roshanraghavander/indobase-social:<sha>
cd /opt/indobase-social
cp docker/deploy/.env.example docker/deploy/.env
# set secrets + SOCIAL_HOST / FRONTEND_URL / STUDIO_HANDOFF_SECRET
# set INDOBASE_SOCIAL_IMAGE=roshanraghavander/indobase-social:$SHA
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env pull
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env up -d
```

Hosts: `social.indobase.fun` (staging) · `social.indobase.in` (prod) on Vyom `.249`.

## Open from Studio

Marketing hub → **Social media posting** → Open (SSO handoff).

See `docs/MARKETING.md` and `docs/INDOBASE-SOCIAL.md`.
