# Indobase Workspace

Collaboration workspace for Indobase organizations and projects — **Files**, **Docs**, **Sheets**,
**Presentations**, **Meetings**, and **Calendar**, with Studio SSO. Document editing uses an AGPL
document engine behind an Indobase-branded bridge; customer UI never names upstream products. See
[docs/INDOBASE-ECOSYSTEM-NAMING.md](../docs/INDOBASE-ECOSYSTEM-NAMING.md) and [NOTICE.md](./NOTICE.md).

| Host (prod) | Host (staging) |
|---|---|
| `workspace.indobase.in` (+ `suite.indobase.in` redirect alias) | `workspace.indobase.fun` |
| `meet.indobase.in` (Meetings) | `meet.indobase.fun` |
| `calendar.indobase.in` (Calendar) | `calendar.indobase.fun` |

## Layout

| Path | Purpose |
|---|---|
| `bridge/` | Node SSO bridge, file store API, Workspace shell, editor JWT + DocumentServer proxy, Meetings→Meet / Calendar→Calendar SSO launch APIs |
| `bridge/templates/` | Blank docx / xlsx / pptx seeds |
| `bridge/public/brand/` | Indobase mark / wordmark / favicon |
| `docker/deploy/` | Compose + Traefik for Vyom `.249` (Workspace; Meet/Calendar preferred under `indobase-meet/` / `indobase-calendar/`) |

## Local dev (bridge only)

```bash
cd bridge
pnpm install
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm test
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
# open http://localhost:8093/sso/health
```

Without `DOCUMENT_SERVER_URL`, the shell and file API work; opening `/editor/:id` shows
“Editor unavailable”. Without Meet/Calendar handoff secrets + public URLs, those modules show
an operator configuration message.

Studio mints `aud=indobase-suite` JWTs; bridge verifies and sets `indobase_suite_session`.

```http
GET /api/platform/projects/{ref}/suite/launch?module=docs
GET /api/platform/projects/{ref}/suite/launch?module=calendar
```

## Full stack (DocumentServer + bridge)

```bash
cd docker/deploy
cp .env.example .env   # set SUITE_HANDOFF_SECRET + DOCUMENT_JWT_SECRET (≥32 chars)
docker compose up -d
```

Optional companion stacks (prefer dedicated product trees):

```bash
# Meet — prefer ../../indobase-meet/docker/deploy
docker compose -f docker-compose.meetings.yml up -d   # legacy
# Calendar — prefer ../../indobase-calendar/docker/deploy
docker compose -f docker-compose.calendar.yml up -d   # legacy engine-only
```

First DocumentServer boot may take 1–2 minutes (`/healthcheck`). Traefik serves `workspace.*` →
bridge; bridge proxies editor assets under `/ds`. Meet and Calendar use dedicated hosts + SSO bridges.

See [docs/INDOBASE-SUITE.md](../docs/INDOBASE-SUITE.md).

## Module routing

| Customer name | Internal id | Behavior |
|---|---|---|
| Files | `files` | File list / open editor |
| Docs | `docs` | Create/open documents |
| Sheets | `sheets` | Create/open spreadsheets |
| Presentations | `presentations` | Create/open slide decks (or Design handoff from Studio) |
| Meetings | `meetings` | SSO-launch **Indobase Meet** (`MEET_PUBLIC_URL` + `MEET_HANDOFF_SECRET`) |
| Mail | `mail` | Opens **Email** (SSO) |
| Calendar | `calendar` | SSO-launch **Indobase Calendar** (`CALENDAR_PUBLIC_URL` + `CALENDAR_HANDOFF_SECRET`) |
