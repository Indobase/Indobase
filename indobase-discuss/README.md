# Indobase Discuss

Async team chat for Indobase organizations and projects. Upstream engine is [Mattermost](https://github.com/mattermost/mattermost) (AGPL-3.0); customer UI is **Indobase Discuss** only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md) and [docs/INDOBASE-DISCUSS.md](../docs/INDOBASE-DISCUSS.md).

| Host (prod) | Host (staging) |
|---|---|
| `discuss.indobase.in` | `discuss.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node Studio SSO bridge + Mattermost reverse proxy (Traefik edge `:8092`) |
| `docker/deploy/` | Compose + Traefik labels for Vyom `.249` |
| `docker/bootstrap-mattermost.sh` | First-boot admin PAT for the bridge |
| `NOTICE.md` | AGPL attribution |

## Local dev (bridge only)

```bash
cd bridge
pnpm install
DISCUSS_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
# open http://localhost:8092/sso/health
```

Studio mints `aud=indobase-discuss` JWTs; bridge verifies, provisions team/channel, sets session cookies, and redirects.

## Full stack (Mattermost + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set DISCUSS_HANDOFF_SECRET, POSTGRES_PASSWORD, MATTERMOST_ADMIN_PASSWORD
docker compose up -d --build
```

Traefik serves `discuss.*` → bridge; bridge proxies the Mattermost app (including websockets).
