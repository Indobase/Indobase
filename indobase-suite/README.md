# Indobase Workspace

Collaboration workspace for Indobase organizations and projects — **Files**, **Docs**, **Sheets**,
and **Presentations**, with Studio SSO. Document editing uses an AGPL document engine behind an
Indobase-branded bridge; customer UI never names upstream products. See
[docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md).

| Host (prod) | Host (staging) |
|---|---|
| `workspace.indobase.in` (+ `suite.indobase.in` redirect alias) | `workspace.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node SSO bridge, file store API, Workspace shell, editor JWT + DocumentServer proxy |
| `bridge/templates/` | Blank docx / xlsx / pptx seeds |
| `bridge/public/brand/` | Indobase mark / wordmark / favicon |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` |

## Local dev (bridge only)

```bash
cd bridge
pnpm install
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
# open http://localhost:8093/sso/health
```

Without `DOCUMENT_SERVER_URL`, the shell and file API work; opening `/editor/:id` shows
“Editor unavailable”.

Studio mints `aud=indobase-suite` JWTs; bridge verifies and sets `indobase_suite_session`.

```http
GET /api/platform/projects/{ref}/suite/launch?module=docs
```

## Full stack (DocumentServer + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set SUITE_HANDOFF_SECRET + DOCUMENT_JWT_SECRET (≥32 chars)
docker compose up -d
```

First DocumentServer boot may take 1–2 minutes (`/healthcheck`). Traefik serves `workspace.*` →
bridge; bridge proxies editor assets under `/ds`.

See [docs/INDOBASE-SUITE.md](../docs/INDOBASE-SUITE.md).

## Module routing

| Customer name | Internal id | Behavior |
|---|---|---|
| Files | `files` | File list / open editor |
| Docs | `docs` | Create/open documents |
| Sheets | `sheets` | Create/open spreadsheets |
| Presentations | `presentations` | Create/open slide decks (or Design handoff from Studio) |
| Meetings | `meetings` | Stub (not in MVP) |
| Mail | `mail` | Opens **Email** (SSO) |
| Calendar | `calendar` | Stub (not in MVP) |
