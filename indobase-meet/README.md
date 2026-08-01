# Indobase Meet

Video meetings for Indobase organizations and projects. Upstream media engine is self-hosted Jitsi (official Docker images, AGPL); customer UI is **Indobase Meet** only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md) and [docs/INDOBASE-MEET.md](../docs/INDOBASE-MEET.md).

| Host (prod) | Host (staging) |
|---|---|
| `meet.indobase.in` | `meet.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node Studio SSO bridge + branded reverse proxy (Traefik edge `:8094`) |
| `docker/deploy/` | Compose (web/prosody/jicofo/jvb + bridge) for Vyom `.249` |
| `NOTICE.md` | AGPL attribution |

## Local dev (bridge only)

```bash
cd bridge
npm install
MEET_HANDOFF_SECRET="$(openssl rand -hex 32)" npm run dev
# open http://localhost:8094/sso/health
```

Studio mints `aud=indobase-meet` JWTs; bridge verifies, maps org/project → meeting space, sets session, redirects to `/meeting/{id}`.

## Full stack

```bash
cd docker/deploy
cp .env.example .env   # set MEET_HANDOFF_SECRET, JWT_*, XMPP passwords
./gen-meet-passwords.sh >> .env
docker compose up -d --build
```

Traefik serves `meet.*` → bridge; bridge proxies the engine web UI. **UDP 10000** must be open for media.
