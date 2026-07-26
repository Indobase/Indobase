# Indobase Design

Template-first design editor for the Indobase Marketing suite (Canva-class).
Source of truth for production: this directory (`indobase-design-v2/`).

## Why Fabric.js (not a Figma-class fork)

The Marketing suite's user is a business owner making a festival-sale post, not a
product designer. A binary design format blocked AI drafting and business-data
merge. This engine uses **Fabric.js JSON** we own and author as templates.

| | This |
|---|---|
| Target user | marketers / SMB owners |
| Design format | **Fabric.js JSON** |
| Templates | authored in-repo as data we own |
| AI drafting | feasible — an LLM can emit Fabric JSON |
| Business-data merge | feasible — merge products/prices into template JSON |
| Containers | **2** (app, postgres) |
| Studio SSO | verified directly in our Hono backend |

There is **no** `.penpot` import. Old Penpot projects do not migrate.

## Architecture

```
Studio ──"Open Design"──> GET /sso/launch#token=<HS256 JWT aud=indobase-design>
                            page POSTs token to /sso/session
                            → verify HMAC (DESIGN_HANDOFF_SECRET) → signed session cookie
                            → SPA (Preact + Fabric.js)  ⇄  /api/*  ⇄  Postgres
```

- `src/client/` — editor, derived from MIT [clawnify/open-design](https://github.com/clawnify/open-design) (see [NOTICE.md](./NOTICE.md)).
- `src/server/` — **original**: Hono + Postgres + Studio SSO.
- Layers panel z-order UX: Apache-2.0 [Davronov/canva-clone](https://github.com/Davronov-Alimardon/canva-clone) attribution in `NOTICE.md` / `LICENSE.davronov`.
- `src/server/templates.ts` — built-in template library as Fabric JSON.

**Studio needs no launch-path changes.** This consumes the `aud=indobase-design`
handoff Studio already mints in `apps/studio/lib/api/saas/design-launch.ts`.

## Multi-tenancy

Every design belongs to `(gotrue_id, project_ref)` from the **verified session,
never from request input**. Viewers are read-only (`requireEditor` on mutating
verbs).

## Run locally

```bash
# Inside indobase-design-v2/ only (avoid root pnpm on exFAT SSD)
pnpm install
export DESIGN_HANDOFF_SECRET=$(openssl rand -hex 32)   # must match Studio's
export DESIGN_DATABASE_URL=postgresql://design:design@localhost:5432/design
pnpm dev            # vite on :5173, api on :8080
pnpm test
pnpm typecheck
```

Schema and built-in templates apply automatically at boot (idempotent).

## Deploy

**Production:** `design.indobase.in` (+ `.fun`, alias `studio-design.indobase.fun`)
on Vyom `.249`. See [`docs/INDOBASE-DESIGN.md`](../docs/INDOBASE-DESIGN.md).

```bash
cd docker/deploy
cp .env.example .env      # DESIGN_HANDOFF_SECRET (= Studio), DB_PASSWORD, DESIGN_VERSION=<sha>
docker compose up -d --build
bash ../scripts/refresh-traefik-route.sh   # container DNS file provider
```

Studio sets `INDOBASE_DESIGN_URL=https://design.indobase.in` (staging: `.fun`).

## Status

**Working:** editor (text, shapes, images, multi-page, undo/redo, autosave,
PNG/JPG/SVG/PDF export, layers panel), Studio SSO with role gating, multi-tenant
storage, 8 built-in India-first templates, healthcheck.

## Canva parity — backlog

1. **Brand kit** — logo/colours/fonts across the suite.
2. **More templates** — India-first (festivals, WhatsApp, GST-style invoices).
3. **AI drafting** — "describe your post" → template + copy + image.
4. **Business-data merge** — fill posters from real products/prices.
5. **Magic resize** — one design → every social format.
