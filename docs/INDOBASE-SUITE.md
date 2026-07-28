# Indobase Workspace (collaboration suite)

**Product:** **Workspace** — collaboration inside Studio  
**Customer host:** `workspace.indobase.in` (prod) · `workspace.indobase.fun` (staging)  
**Upstream:** [Frappe Suite](https://github.com/frappe/suite) (AGPL-3.0), vendored at `indobase-suite/vendor/suite/`  
**Naming dictionary:** [INDOBASE-ECOSYSTEM-NAMING.md](./INDOBASE-ECOSYSTEM-NAMING.md)

Workspace brings Files, Docs, Sheets, Presentations, Meetings, and Calendar into one connected surface per project. It does **not** replace Discuss (team chat) or Design (visual marketing editor).

---

## Architecture choice

| Layer | Location | Role |
|---|---|---|
| **Studio control plane** | `apps/studio` | Mint HS256 handoff JWT (`aud=indobase-suite`), org role gate, project chooser + `/project/{ref}/workspace` launcher |
| **SSO bridge** | `indobase-suite/bridge/` | Verify JWT, session cookie, dev shell, proxy `/s/*` → Frappe Suite when deployed |
| **Frappe data plane** | `indobase-suite/docker/` | Bench + upstream `suite` app + `indobase_suite` custom app (provisioning + rebrand hooks) |
| **Edge** | Traefik on Vyom `.249` | TLS + route `workspace.*` → bridge `:8093` |

We mirror the proven **Discuss** pattern (bridge + Frappe custom app + shared handoff contract) rather than embedding Suite inside Studio Next.js — Frappe needs MariaDB, Redis, bench, and a separate Vite frontend build.

---

## Module mapping (upstream → customer-facing)

| Upstream (internal only) | Customer name | Studio module id | Deep link (bridge) |
|---|---|---|---|
| Drive | **Files** | `files` | `/s/{team}/{project}/files` |
| Writer | **Docs** | `docs` | `/s/{team}/{project}/docs` |
| Sheets | **Sheets** | `sheets` | `/s/{team}/{project}/sheets` |
| Slides | **Presentations** | `presentations` | `/s/{team}/{project}/presentations` |
| Meet | **Meetings** | `meetings` | `/s/{team}/{project}/meetings` |
| Mail | **Mail** → **Email** | `mail` | Email SSO, not Suite Mail |
| Calendar | **Calendar** | `calendar` | `/s/{team}/{project}/calendar` |

Bridge maps Indobase paths to upstream SPA segments when proxying (e.g. `files` → `drive`, `docs` → `writer`).

---

## Org / project scoping contract

Deterministic keys (shared by Studio, bridge, Frappe):

| Indobase entity | Key function | Example |
|---|---|---|
| `saas.organizations.slug` | `suiteTeamKeyForOrgSlug()` → `ib-ws-org-{slug}` | `ib-ws-org-acme` |
| `saas.projects.ref` | `suiteProjectKeyForProjectRef()` → `ib-ws-proj-{ref}` | `ib-ws-proj-abc123` |

**Permissions:** same org membership roles as other ecosystem apps — `owner`, `admin`, `developer`, `viewer` (via `saas.organization_members`).

**Provisioning (production):** Frappe `indobase_suite.api.studio_handoff.exchange` creates/links Suite workspace context on first SSO; follow-up work will add DocTypes/custom fields for team/project membership sync (mirroring Discuss Gameplan provisioning).

---

## SSO contract

| Field | Value |
|---|---|
| Algorithm | HS256 HMAC JWT |
| Audience | `indobase-suite` |
| TTL | 5 minutes (`HANDOFF_TTL_SECONDS`) |
| Secret env | `SUITE_HANDOFF_SECRET` (bridge/Frappe) · minted via `STUDIO_HANDOFF_SECRET` fallback in Studio |
| Launch URL | `https://workspace.indobase.in/sso/launch?project_ref=…&from=studio#token=…` |
| Session | Bridge cookie `indobase_suite_session` (12h) after `/sso/session` POST |
| Studio API | `GET /api/platform/projects/{ref}/suite/launch?module={optional}` |

Optional `module` query on launch API:

- `mail` → redirects to **Indobase Email** handoff (`aud=indobase-email`)
- `files|docs|sheets|presentations|meetings|calendar` → appended as `?module=` on Workspace launch URL

---

## Relationship to Email, Design, Discuss

| Product | Relationship |
|---|---|
| **Discuss** (`discuss.indobase.in`) | Owns async team chat (Gameplan). Workspace does not include chat. |
| **Email** (`email.indobase.in`) | Workspace **Mail** tile SSOs to Email — campaigns/transactional mail already covered. Suite Mail is **not** deployed for Indobase customers. |
| **Design** (`design.indobase.in`) | Canva-class visual editor for posts/brand. **Presentations** default to Workspace Slides for decks; set `NEXT_PUBLIC_WORKSPACE_SLIDES_VIA_DESIGN=true` to open Design instead. No duplicate slide editor in Design for deck-first workflows unless explicitly enabled. |

---

## Local development

### Bridge only (fast path)

```bash
cd indobase-suite/bridge
pnpm install
SUITE_HANDOFF_SECRET="$(openssl rand -hex 32)" pnpm dev
curl -s http://localhost:8093/sso/health | jq
pnpm test
```

Studio (with matching secret):

```bash
export SUITE_HANDOFF_SECRET=…   # same value
export INDOBASE_SUITE_URL=http://localhost:8093
```

Open project → **Workspace** → module tile → SSO redirect.

### Full Frappe stack

```bash
cd indobase-suite/docker/deploy
cp .env.example .env
docker compose up -d
```

First boot ~10–15 min (`bench get-app suite`, site install). Meet requires a separate mediasoup SFU in production (see upstream `suite/meet/sfu-server/README.md`).

---

## Production deploy checklist (Vyom `.249`) — not executed in this task

1. **DNS:** `workspace.indobase.in` / `workspace.indobase.fun` → `.249`
2. **Secrets:** `SUITE_HANDOFF_SECRET` aligned on Studio Swarm + workspace compose (≥32 chars)
3. **Compose:** `indobase-suite/docker/deploy/docker-compose.yml` on `.249`; Traefik labels on `suite-bridge`
4. **Studio env:** `INDOBASE_SUITE_URL=https://workspace.indobase.in`
5. **CI image (optional):** publish `roshanraghavander/indobase-workspace-bridge:<sha>` from `indobase-suite/bridge/Dockerfile`
6. **Smoke:** Studio launch → bridge health → module deep link → Files/Docs shell or upstream UI
7. **Meet SFU:** deploy mediasoup sidecar when Meetings is required in prod
8. **AGPL:** keep `NOTICE.md` + upstream `license.txt` in deploy artifact

---

## Files (this integration)

| Path | Purpose |
|---|---|
| `indobase-suite/` | Bridge, Frappe app stub, Docker, NOTICE |
| `docs/INDOBASE-SUITE.md` | This document |
| `apps/studio/lib/api/saas/suite-launch*.ts` | Launch + client-safe module metadata |
| `apps/studio/lib/api/saas/product-handoff.ts` | Added `suite` product |
| `apps/studio/pages/api/platform/projects/[ref]/suite/launch.ts` | Launch API |
| `apps/studio/pages/project/[ref]/workspace.tsx` | Workspace module chooser |
| `apps/studio/components/.../WorkspaceLauncher.tsx` | UI |
| `apps/studio/components/.../useSuiteLaunch.ts` | Client hook |
| `apps/studio/components/.../ProjectExperienceChooser.tsx` | Workspace tile + rail |

---

## Rebrand rules

- Customer chrome: **Workspace**, module names (**Files**, **Docs**, …)
- Never show: Frappe, Suite, Drive, Writer, Slides, Meet, Mail (upstream), or upstream Calendar product chrome
- AGPL attribution in repo only (`NOTICE.md`, LICENSE)
