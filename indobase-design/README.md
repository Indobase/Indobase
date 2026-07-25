# Indobase Design

Visual designer for the Indobase Marketing suite (landing pages, creatives,
brand assets). Customer-facing product name: **Indobase Design**.

Engine images are upstream MPL-2.0 (see `NOTICE.md`). Branding overlay + Studio
SSO live in this tree — see `docs/INDOBASE-DESIGN.md` and `docs/MARKETING.md`.

## Quick deploy

```bash
cd docker/deploy
cp .env.example .env   # fill secrets
docker compose --env-file .env build
docker compose --env-file .env up -d
# optional Traefik file provider:
# cp traefik/indobase-design.yml /etc/dokploy/traefik/dynamic/
```

Hosts: `design.indobase.fun` · `design.indobase.in`
