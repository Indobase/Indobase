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

**Honesty:** Indobase Design is a **Canva-class graphic editor** for Marketing
(templates, brand kit, AI layout draft, data merge, layers, export) — **not**
full Canva product parity (no Magic Studio photo suite, stock library,
multiplayer, print fulfillment, PPTX, or website builder).

## Architecture

```
Studio (Open Design)
  └─ GET /api/platform/projects/[ref]/design/launch
       → URL https://design.indobase.in/sso/launch#token=<HS256 JWT aud=indobase-design>
            └─ design-app (indobase-design-v2)
                 1. /sso/launch page posts fragment token to /sso/session
                    → verifies HMAC (DESIGN_HANDOFF_SECRET) → signed session cookie
                 2. SPA (Preact + Fabric.js) ⇄ /api/* ⇄ Postgres
                 3. AI draft → Design proxies to Studio
                    POST /api/platform/projects/[ref]/design/generate
                    (OpenRouter + design_ai_used quota)
```

- Handoff is verified **directly** in our Hono backend (no OIDC shim).
- Without a verified Studio handoff cookie, unauthenticated visitors redirect to
  Studio sign-in.
- Org roles allowed to open Design (same as Email/Social/Payments):
  owner, admin, developer, viewer.
- Designs are multi-tenant: ownership is `(gotrue_id, project_ref)` from the
  verified session, never from request input.
- Built-in templates are authored in-repo as Fabric JSON (India-first set,
  categorized: social / story / ads / print / presentation / brand).

## Features (shipped)

- Editor: text, shapes, **image uploads** (`POST /api/uploads` → data-URL),
  multi-page, undo/redo, debounced autosave, broad canvas size presets
- **Layers** panel (z-order, visibility, lock) — Apache-2.0 Davronov attribution
- Export: **PNG / JPG / SVG / PDF** (browser-side)
- Studio SSO with role gating
- **~20 built-in templates** with category filters
- **Brand kit** — org/project colors, fonts, logo URL; save + apply to canvas
- **AI drafting** — prompt → Fabric JSON via Studio OpenRouter
  (`designAiLimit` plan entitlement / `design_ai_used`)
- **Business-data merge** — `{{placeholders}}` in text; JSON or CSV paste

### How to use

| Feature | Where |
|--------|--------|
| Brand kit | Editor left rail → **Brand** → save colors/fonts/logo → **Apply to canvas** |
| AI draft | Editor left rail → **AI** → describe the layout → **Generate draft** |
| Data merge | Start from a template with `{{product_name}}` etc. → **Data** → paste JSON/CSV → **Merge** |
| Templates | Home gallery (category chips) or editor **Templates** rail |
| Export | Toolbar → **Export** → PNG / JPG / SVG / PDF |

### Data merge format

```json
{ "product_name": "Paneer Tikka", "price": "₹220", "business_name": "Your Business" }
```

Or CSV (header + first row):

```csv
product_name,price,business_name
Paneer Tikka,₹220,Your Business
```

Text objects containing `{{field}}` are replaced; missing keys are left as-is.

## Branding

Customer-facing UI/title/meta use **Indobase Design** only. Engineering
attribution lives in `NOTICE.md` / licence files — not in the served SPA.

## Deploy (Vyom .249)

Build on the VPS (do not `pnpm install` at monorepo root on exFAT). Pin the
image tag to the git SHA:

```bash
SHA=$(git rev-parse HEAD)

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .env --exclude '**/._*' \
  indobase-design-v2/ root@103.190.92.249:/opt/indobase-design-v2/

ssh root@103.190.92.249
cd /opt/indobase-design-v2/docker/deploy
# .env: DESIGN_HANDOFF_SECRET (= Studio DESIGN_HANDOFF_SECRET), DB_PASSWORD,
#       STUDIO_URL=https://studio.indobase.in, DESIGN_VERSION=$SHA
# Optional: STUDIO_INTERNAL_URL=http://<studio-swarm-service>:8080 for AI proxy
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
# OPEN_ROUTER_API_KEY already used by Video — Design AI reuses it on Studio
```

## Smoke

```bash
curl -sS https://design.indobase.in/sso/health   # ok + version SHA
curl -sSI https://design.indobase.in/ | head -5  # 302 → Studio sign-in when logged out
# Full flow: Studio → Marketing → Open Design → template → Brand → AI → Data merge
#            → Export JPG/PNG/SVG/PDF → save/reload → Uploads image
```

## Remaining gaps (intentionally not Canva parity)

- No Magic Studio / generative fill / photo suite
- No stock photo / element marketplace
- No multiplayer / comments
- No print fulfillment or PPTX export
- No video/audio timeline inside Design (use Indobase Video)
- No website builder (Builder / Studio elsewhere)
- Magic resize, group/align/snap, Social publish handoff — nice-to-haves next

## Rollback

1. Restore previous SHA-tagged `indobase-design-v2:<sha>` image and recreate.
2. Prefer fixing forward on `indobase-design-v2` unless a critical outage requires
   an older tag.
