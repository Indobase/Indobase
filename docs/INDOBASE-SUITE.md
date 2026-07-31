# Indobase Workspace (collaboration suite)

**Product:** **Workspace** — collaboration inside Studio  
**Customer host:** `workspace.indobase.in` (prod) · `workspace.indobase.fun` (staging)  
**Upstream editor:** [ONLYOFFICE DocumentServer](https://github.com/ONLYOFFICE/DocumentServer) (AGPL-3.0) via official Docker image — not vendored in-tree. Attribution: `indobase-suite/NOTICE.md`.

Workspace brings Files, Docs, Sheets, Presentations, **Meetings** (→ **Indobase Meet**), and **Calendar** into one
Indobase-branded surface per project. It does **not** replace Discuss (team chat), Meet (video), or Design
(visual marketing editor).

## Architecture

| Layer | Location | Role |
|---|---|---|
| **Studio control plane** | `apps/studio` | Mint HS256 handoff JWT (`aud=indobase-suite`), org role gate, project chooser + `/project/{ref}/workspace` launcher |
| **SSO bridge** | `indobase-suite/bridge/` | Verify JWT, session cookie, file store API, Workspace shell, editor config JWT, proxy `/ds` → DocumentServer, Meetings→Meet / Calendar→Calendar SSO launch |
| **Document engine** | `onlyoffice/documentserver` container | Collaborative editing (docs / sheets / slides) |
| **Meet** | `indobase-meet/` | First-class video on `meet.indobase.in` / `.fun` (Studio `aud=indobase-meet`) |
| **Calendar** | `indobase-calendar/` | First-class scheduling on `calendar.indobase.in` / `.fun` (Studio `aud=indobase-calendar`) |
| **File store** | Docker volume `workspace_files` | Per-project blobs + JSON index on the bridge |
| **Edge** | Traefik on Vyom `.249` | TLS + route `workspace.*` / `suite.*` → bridge `:8093`; `meet.*` / `calendar.*` → their stacks |

## Studio SSO contract (unchanged)

| Field | Value |
|---|---|
| Audience | `indobase-suite` |
| Secret env | `SUITE_HANDOFF_SECRET` (bridge) · minted via `STUDIO_HANDOFF_SECRET` fallback in Studio |
| Launch URL | `https://workspace.indobase.in/sso/launch?project_ref=…&from=studio#token=…` |
| Session | Bridge cookie `indobase_suite_session` (12h) after `/sso/session` POST |
| Studio API | `GET /api/platform/projects/{ref}/suite/launch?module={optional}` |

Module query: `files|docs|sheets|presentations|meetings|calendar` → Workspace deep link;
`mail` → Email SSO from Studio.

Org/project keys remain `ib-ws-org-{slug}` / `ib-ws-proj-{ref}` for deep links and storage prefixes.
Calendar public booking usernames use `ib-cal-{projectRef}` (see bridge `calendar.ts`).

## Document editor flow

1. User opens Workspace from Studio → bridge session cookie.
2. Shell lists files under the project; **New Doc/Sheet/Presentation** seeds a blank OOXML file.
3. `/editor/:id` builds DocumentServer config (document URL + callback URL with HMAC access tokens)
   and signs it with `DOCUMENT_JWT_SECRET` (must match DocumentServer `JWT_SECRET`).
4. Browser loads DocsAPI from `{WORKSPACE_PUBLIC_URL}/ds/...` (bridge reverse-proxy).
5. DocumentServer fetches content from `BRIDGE_INTERNAL_URL` and posts saves to the callback.

## Meetings flow (SSO → Indobase Meet)

1. Studio → Workspace SSO → rail **Meetings** (`/s/…/meetings`).
2. Bridge `GET /api/meetings/config` (session-gated) returns Meet SSO `launchUrl` + invite path
   (`/meeting/{ib-meet-proj-{ref}}`).
3. Shell opens Indobase Meet (`aud=indobase-meet`) — never a raw engine iframe in Workspace.

Prefer deploying Meet from `indobase-meet/docker/deploy/`. Legacy `docker-compose.meetings.yml` is
superseded. Prefer Calendar from `indobase-calendar/docker/deploy/`; legacy
`docker-compose.calendar.yml` is a migration pointer only.

## Calendar flow (SSO → Indobase Calendar)

1. Studio → Workspace SSO (`indobase_suite_session` via `SUITE_HANDOFF_SECRET`).
2. User opens rail **Calendar** → `/s/{org}/{project}/calendar` (entry stays on `workspace.*`).
3. Bridge `GET /api/calendar/config` (session-gated) returns Calendar SSO `launchUrl` when
   `CALENDAR_PUBLIC_URL` + `CALENDAR_HANDOFF_SECRET` are set (`aud=indobase-calendar`).
4. Shell opens Indobase Calendar (`/sso/launch` → `/events`) — never a raw engine iframe or
   password wizard. Copy booking link uses `calendar.*/{ib-cal-{ref}}`.

**Hosting choice:** dedicated subdomain (not a path under `workspace.*`) — same pattern as Meet.
Traefik edge is the Calendar SSO bridge (`:8095`); Workspace remains a product entry launcher.

## Module map

| Customer name | Behavior |
|---|---|
| Files / Docs / Sheets / Presentations | Bridge shell + document editor |
| Mail | Studio → **Email** SSO |
| Meetings | SSO-launch **Indobase Meet** (`meet.*`) |
| Calendar | SSO-launch **Indobase Calendar** (`calendar.*`) |

## Local

```bash
cd indobase-suite/bridge
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm install && pnpm test && pnpm dev
```

## Deploy (Vyom `.249`)

1. **DNS:** `workspace.indobase.in` / `workspace.indobase.fun` → `.249` (keep `suite.indobase.in` alias if used).
   Also `calendar.indobase.in` / `.fun` (and `meet.*` for Meetings) → `.249`.
2. **Secrets:** Align `SUITE_HANDOFF_SECRET` on Studio Swarm + workspace compose (≥32 chars).
   Set a separate `DOCUMENT_JWT_SECRET` (≥32) shared only by bridge + DocumentServer.
3. **Compose:**
   - `indobase-suite/docker/deploy/` → `docker compose up -d` (DocumentServer + bridge)
   - `indobase-meet/docker/deploy/` → Meet stack (preferred)
   - `indobase-calendar/docker/deploy/` → Calendar stack (preferred)
4. **Bridge env:** `CALENDAR_PUBLIC_URL` + `CALENDAR_HANDOFF_SECRET` (same secret as Calendar/Studio);
   `MEET_PUBLIC_URL` + `MEET_HANDOFF_SECRET` for Meetings.
5. **Studio env:** `INDOBASE_SUITE_URL`, `CALENDAR_HANDOFF_SECRET` (or `STUDIO_HANDOFF_SECRET`),
   `MEET_HANDOFF_SECRET` as needed.
6. **Smoke:** `curl -sS https://workspace.indobase.in/sso/health` → `handoffConfigured`, `editorReady`,
   `calendarReady`, `meetingsReady`; `curl -sS https://calendar.indobase.in/sso/health`.
7. **Calendar:** Studio SSO auto-provisions users — no password wizard for operators/end users.
8. **Teardown (one-time):** Stop old Frappe/MariaDB/Redis suite stack and remove volumes
   `suite_mariadb_data` / `suite_bench_sites` if present — **no Drive data migration**.

Staging-first (from 2026-07-31): validate on `workspace.indobase.fun` / `calendar.indobase.fun`
before promoting compose/env to prod hosts.

## Gaps (Calendar)

| Gap | Notes |
|---|---|
| Email invites / SMTP | Configure mail on the Calendar stack; not wired to Indobase Email yet |
| Google / Outlook sync | Optional OAuth apps on the Calendar host; credentials stay out of Studio |
| Multi-tenant isolation | Single Calendar instance today; project scoping is username/`ib-cal-*` convention only — not hard RLS across Indobase orgs |
| Meet auto-attach | **Shipped (Phase 2)** — Calendar links stable Meet rooms + SSO open; Workspace Meetings still launches Meet |
| Full design-system rewrite | Engine SPA chrome residual strings — later |

## Repo map

| Path | Notes |
|---|---|
| `indobase-suite/bridge/` | SSO + files + shell + `/ds` proxy + Meet/Calendar launch config |
| `indobase-suite/docker/deploy/` | DocumentServer + bridge Compose |
| `indobase-meet/` | First-class Meet product |
| `indobase-calendar/` | First-class Calendar product |
| `indobase-suite/docker/deploy/docker-compose.calendar.yml` | Legacy engine-only (migration pointer) |
| `docs/INDOBASE-SUITE.md` | This document |
| `docs/INDOBASE-CALENDAR.md` | Calendar product |
| `apps/studio/.../calendar/launch*` | Calendar handoff |
| `apps/studio/.../suite/launch*` | Workspace handoff contract |

## Branding

- Customer chrome: **Workspace**, **Files**, **Docs**, **Sheets**, **Presentations**, **Meetings**, **Calendar**
- Never show: ONLYOFFICE, DocumentServer, Frappe, Suite, Drive, Writer, Slides, Jitsi, Cal.com, cal.diy, Cal
- `/ds/welcome` and `/welcome` are blocked (Traefik priority 300 → bridge Indobase page).
  DocumentServer Community Edition cannot fully white-label About/logo — see `NOTICE.md`.
