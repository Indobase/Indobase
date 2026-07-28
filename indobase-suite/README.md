# Indobase Workspace

Collaboration workspace for Indobase organizations and projects — **Workspace**: Files, Docs, Sheets, Presentations, Meetings, and Calendar. Upstream engine is AGPL; customer UI is Indobase-branded only. See [docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md).

| Host (prod) | Host (staging) |
|---|---|
| `workspace.indobase.in` | `workspace.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node SSO bridge + dev shell (mirrors Discuss `/sso/launch`) |
| `frappe-app/indobase_suite/` | Frappe custom app: Studio handoff, org/project → workspace provisioning, rebrand hooks |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` |
| `vendor/suite/` | Upstream Frappe Suite (submodule — run `git submodule update --init`) |

## Local dev (bridge only)

```bash
cd bridge
pnpm install
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
# open http://localhost:8093/sso/health
```

Studio mints `aud=indobase-suite` JWTs; bridge verifies and sets `indobase_suite_session`.

Optional module deep-link from Studio:

```http
GET /api/platform/projects/{ref}/suite/launch?module=docs
```

## Full stack (Frappe Suite + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set secrets
docker compose up -d
```

First boot runs Frappe bench init (~10–15 min). Traefik serves `workspace.*` → bridge; bridge proxies `/s/*` to Suite when configured.

See [docs/INDOBASE-SUITE.md](../docs/INDOBASE-SUITE.md).

## Module routing

| Customer name | Internal id | Route |
|---|---|---|
| Files | `files` | Workspace → Files |
| Docs | `docs` | Workspace → Docs |
| Sheets | `sheets` | Workspace → Sheets |
| Presentations | `presentations` | Workspace → Presentations (or Design handoff) |
| Meetings | `meetings` | Workspace → Meetings |
| Mail | `mail` | Opens **Email** (SSO) |
| Calendar | `calendar` | Workspace → Calendar |
