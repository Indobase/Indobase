# Indobase Design — Canva-class visual editor + Studio SSO

**Hosts:** `design.indobase.in` (production, canonical) · `design.indobase.fun`
(same stack) · `studio-design.indobase.fun` (legacy staging alias) — Traefik on
Vyom `.249`.  
**Product:** **Indobase Design** (Marketing suite).  
**Source:** `indobase-design-v2/` (Fabric.js + Preact SPA, Hono API, Postgres).  
**Licences:** MIT (editor client from clawnify/open-design) + Apache-2.0
(Davronov layers attribution) — see `indobase-design-v2/NOTICE.md`. UI says
**Indobase Design** only.

> The former Penpot fork (`indobase-design/`) is **decommissioned**. There is
> **no** `.penpot` import path — Fabric.js JSON is the design format.

## Architecture

```
Studio (Open Design)
  └─ GET /api/platform/projects/[ref]/design/launch
       → URL https://design.indobase.in/sso/launch#token=<HS256 JWT aud=indobase-design>
            └─ design-app (indobase-design-v2)
                 1. /sso/launch page posts fragment token to /sso/session
                    → verifies HMAC (DESIGN_HANDOFF_SECRET) → signed session cookie
                 2. SPA (Preact + Fabric.js) ⇄ /api/* ⇄ Postgres
```

- Handoff is verified **directly** in our Hono backend (no OIDC shim).
- Without a verified Studio handoff cookie, unauthenticated visitors redirect to
  Studio sign-in.
- Org roles allowed to open Design (same as Email/Social/Payments):
  owner, admin, developer, viewer.
- Designs are multi-tenant: ownership is `(gotrue_id, project_ref)` from the
  verified session, never from request input.
- Built-in templates are authored in-repo as Fabric JSON (India-first starter set).

## Features (shipped)

- Editor: text, shapes, images, multi-page, undo/redo, autosave
- **Layers** panel (z-order, visibility, lock) — Apache-2.0 Davronov attribution
- Export: **PNG / JPG / SVG / PDF**
- Studio SSO with role gating
- 8 built-in templates

## Branding

Customer-facing UI/title/meta use **Indobase Design** only. Engineering
attribution lives in `NOTICE.md` / licence files — not in the served SPA.

## Deploy (Vyom .249)

Build on the VPS (do not `pnpm install` at monorepo root on exFAT). Pin the
image tag to the git SHA:

```bash
SHA=$(git rev-parse --short=12 HEAD)   # or full SHA

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .env --exclude '**/._*' \
  indobase-design-v2/ root@103.190.92.249:/opt/indobase-design-v2/

ssh root@103.190.92.249
cd /opt/indobase-design-v2/docker/deploy
# .env: DESIGN_HANDOFF_SECRET (= Studio DESIGN_HANDOFF_SECRET), DB_PASSWORD,
#       STUDIO_URL=https://studio.indobase.in, DESIGN_VERSION=$SHA
docker compose --env-file .env build
docker compose --env-file .env up -d
bash ../../docker/scripts/refresh-traefik-route.sh
```

Traefik file provider uses **container DNS**
(`http://indobase-design-v2-design-app-1:8080`) — see
`indobase-design-v2/docker/deploy/traefik/indobase-design-v2.yml` and
`refresh-traefik-route.sh`.

Studio service env (Swarm `indobase-studio-*` on `.249` and Hostinger staging):

```bash
INDOBASE_DESIGN_URL=https://design.indobase.in          # staging: design.indobase.fun
NEXT_PUBLIC_INDOBASE_DESIGN_URL=https://design.indobase.in
DESIGN_HANDOFF_SECRET=<same as design-v2 .env>
```

## Smoke

```bash
curl -sS https://design.indobase.in/sso/health   # {"ok":true,"service":"indobase-design",...}
curl -sSI https://design.indobase.in/ | head -5  # 302 → Studio sign-in when logged out
# On VPS:
BASE=https://design.indobase.in bash /opt/indobase-design-v2/docker/scripts/smoke-staging.sh
# Full flow: Studio → project → Marketing → Open Design → Layers + Export
```

## Notes / gaps

- **No `.penpot` import** — users with old Penpot work must re-create designs
  (or had exported PNG/SVG before decommission).
- Project ↔ Design team 1:1 mapping is not automated (`project_ref` is in the
  handoff for a follow-up).
- Canva-parity backlog (brand kit, more templates, AI drafting, business-data
  merge, magic resize): see `indobase-design-v2/README.md`.

## Rollback

1. Restore Penpot volume tarball from `/var/backups/indobase-design-penpot-*.tgz`
   (if kept) and bring up `/opt/indobase-design` compose.
2. Restore `/etc/dokploy/traefik/dynamic/indobase-design.yml` pointing at Penpot
   frontend + SSO shim; remove or lower-priority the v2 file-provider hosts.
3. Point Studio `INDOBASE_DESIGN_URL` back if it was changed (prod default URL
   stays `https://design.indobase.in` either way — Traefik is the switch).

Prefer fixing forward on `indobase-design-v2` unless a critical outage requires
the backup.
