# Indobase Workspace (collaboration suite)

**Product:** **Workspace** — collaboration inside Studio  
**Customer host:** `workspace.indobase.in` (prod) · `workspace.indobase.fun` (staging)  
**Upstream editor:** [ONLYOFFICE DocumentServer](https://github.com/ONLYOFFICE/DocumentServer) (AGPL-3.0) via official Docker image — not vendored in-tree. Attribution: `indobase-suite/NOTICE.md`.

Workspace brings Files, Docs, Sheets, and Presentations into one Indobase-branded surface per
project. Meetings and Calendar are deferred stubs in Phase A. It does **not** replace Discuss
(team chat) or Design (visual marketing editor).

## Architecture

| Layer | Location | Role |
|---|---|---|
| **Studio control plane** | `apps/studio` | Mint HS256 handoff JWT (`aud=indobase-suite`), org role gate, project chooser + `/project/{ref}/workspace` launcher |
| **SSO bridge** | `indobase-suite/bridge/` | Verify JWT, session cookie, file store API, Workspace shell, editor config JWT, proxy `/ds` → DocumentServer |
| **Document engine** | `onlyoffice/documentserver` container | Collaborative editing (docs / sheets / slides) |
| **File store** | Docker volume `workspace_files` | Per-project blobs + JSON index on the bridge |
| **Edge** | Traefik on Vyom `.249` | TLS + route `workspace.*` / `suite.*` → bridge `:8093` |

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

## Document editor flow

1. User opens Workspace from Studio → bridge session cookie.
2. Shell lists files under the project; **New Doc/Sheet/Presentation** seeds a blank OOXML file.
3. `/editor/:id` builds DocumentServer config (document URL + callback URL with HMAC access tokens)
   and signs it with `DOCUMENT_JWT_SECRET` (must match DocumentServer `JWT_SECRET`).
4. Browser loads DocsAPI from `{WORKSPACE_PUBLIC_URL}/ds/...` (bridge reverse-proxy).
5. DocumentServer fetches content from `BRIDGE_INTERNAL_URL` and posts saves to the callback.

## Module map

| Customer name | Behavior |
|---|---|
| Files / Docs / Sheets / Presentations | Bridge shell + document editor |
| Mail | Studio → **Email** SSO |
| Meetings / Calendar | Placeholder copy in shell (MVP) |

## Local

```bash
cd indobase-suite/bridge
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm install && pnpm dev
```

## Deploy (Vyom `.249`)

1. **DNS:** `workspace.indobase.in` / `workspace.indobase.fun` → `.249` (keep `suite.indobase.in` alias if used).
2. **Secrets:** Align `SUITE_HANDOFF_SECRET` on Studio Swarm + workspace compose (≥32 chars).
   Set a separate `DOCUMENT_JWT_SECRET` (≥32) shared only by bridge + DocumentServer.
3. **Compose:** `indobase-suite/docker/deploy/` — `cp .env.example .env`, then `docker compose up -d`.
4. **Studio env:** `INDOBASE_SUITE_URL=https://workspace.indobase.in` (unchanged).
5. **Smoke:** `curl -sS https://workspace.indobase.in/sso/health` → `handoffConfigured`, `editorReady`.
6. **Teardown (one-time):** Stop old Frappe/MariaDB/Redis suite stack and remove volumes
   `suite_mariadb_data` / `suite_bench_sites` if present — **no Drive data migration**.

Staging-first (from 2026-07-31): validate on `workspace.indobase.fun` before promoting compose/env to prod hosts.

## Repo map

| Path | Notes |
|---|---|
| `indobase-suite/bridge/` | SSO + files + shell + `/ds` proxy |
| `indobase-suite/docker/deploy/` | DocumentServer + bridge Compose |
| `docs/INDOBASE-SUITE.md` | This document |
| `apps/studio/.../suite/launch*` | Unchanged handoff contract |

## Branding

- Customer chrome: **Workspace**, **Files**, **Docs**, **Sheets**, **Presentations**
- Never show: ONLYOFFICE, DocumentServer, Frappe, Suite, Drive, Writer, Slides, Meet
