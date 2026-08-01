# Indobase Discuss

Async team chat for Indobase organizations and projects. Upstream engine is [Gameplan](https://github.com/frappe/gameplan) (AGPL-3.0) on Frappe v16+; customer UI is **Indobase Discuss** only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md) and [docs/INDOBASE-DISCUSS.md](../docs/INDOBASE-DISCUSS.md).

| Host (prod) | Host (staging) |
|---|---|
| `discuss.indobase.in` | `discuss.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node Studio SSO bridge + Gameplan reverse proxy (Traefik edge `:8092`) |
| `frappe-app/indobase_discuss/` | Frappe app: JWT exchange, GP Team/Project provisioning, branding hooks |
| `docker/deploy/` | Compose + Traefik labels for Vyom `.249` |
| `docker/init-gameplan.sh` | First-boot Frappe bench + Gameplan + indobase_discuss |
| `NOTICE.md` | AGPL attribution |

## Local dev (bridge only)

```bash
cd bridge
pnpm install
DISCUSS_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
# open http://localhost:8092/sso/health
```

Studio mints `aud=indobase-discuss` JWTs; bridge verifies, calls Frappe exchange, sets session cookies, and redirects.

## Full stack (Gameplan + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set DISCUSS_HANDOFF_SECRET, MARIADB_ROOT_PASSWORD
docker compose up -d --build
```

First boot initializes the bench (several minutes). Traefik serves `discuss.*` → bridge; bridge proxies Gameplan (including websockets via socket.io).
