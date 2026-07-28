# Indobase Discuss

Async team discussions for Indobase organizations and projects — **Discuss** (team chat): spaces, threads, and pages. Upstream engine is AGPL; customer UI is Indobase-branded only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md).

| Host (prod) | Host (staging) |
|---|---|
| `discuss.indobase.in` | `discuss.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node SSO bridge + dev shell (mirrors Design `/sso/launch`) |
| `frappe-app/indobase_discuss/` | Frappe custom app: Studio handoff, org/project → Space provisioning, rebrand hooks |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` |
| `vendor/gameplan/` | Upstream Gameplan (submodule — run `git submodule update --init`) |

## Local dev (bridge only)

```bash
cd bridge
pnpm install
DISCUSS_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
# open http://localhost:8092/sso/health
```

Studio mints `aud=indobase-discuss` JWTs; bridge verifies and sets `indobase_discuss_session`.

## Full stack (Gameplan + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set secrets
docker compose up -d
```

First boot runs Frappe bench init (~5–10 min). Traefik serves `discuss.*` → bridge; bridge proxies `/g/*` to Gameplan when configured.

See [docs/INDOBASE-DISCUSS.md](../docs/INDOBASE-DISCUSS.md).
