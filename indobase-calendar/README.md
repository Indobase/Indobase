# Indobase Calendar

Scheduling and availability for Indobase organizations and projects. Upstream engine is
self-hosted scheduling (official `calcom/cal.com` Docker image (MIT community/self-host engine; Hub publishes here, not calcom/cal.diy), MIT); customer UI is
**Indobase Calendar** only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md)
and [docs/INDOBASE-CALENDAR.md](../docs/INDOBASE-CALENDAR.md).

| Host (prod) | Host (staging) |
|---|---|
| `calendar.indobase.in` | `calendar.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node Studio SSO bridge + branded reverse proxy (Traefik edge `:8095`) |
| `docker/deploy/` | Compose (Postgres + Redis + scheduling app + bridge) for Vyom `.249` |
| `NOTICE.md` | Upstream MIT attribution |

## Local dev (bridge only)

```bash
cd bridge
npm install
CALENDAR_HANDOFF_SECRET="$(openssl rand -hex 32)" npm run dev
# open http://localhost:8095/sso/health
```

Studio mints `aud=indobase-calendar` JWTs; bridge verifies, auto-provisions the scheduling user,
sets session, redirects to `/events`.

## Full stack

```bash
cd docker/deploy
cp .env.example .env   # set CALENDAR_HANDOFF_SECRET, DB, NEXTAUTH, encryption keys
docker compose up -d --build
```

Traefik serves `calendar.*` → bridge; bridge proxies the scheduling app.
