# Indobase Design — Canva-class → Design-core parity

**Hosts:** `design.indobase.in` (prod) · `design.indobase.fun` · Traefik on Vyom `.249`  
**Source:** `indobase-design-v2/` (Fabric.js + Preact, Hono, Postgres)  
**Licences:** MIT (editor client) + Apache-2.0 (Davronov layers) — see `NOTICE.md`.

## Honest framing

Indobase Design targets **Canva Design-category parity** (graphic editor), not the
entire Canva platform. Video / Social / Email / Websites are **suite handoffs**
to Indobase Video, Social, Email, and Builder.

| Layer | Status |
|-------|--------|
| Phase 1 — Design-core | Shipped (this doc) |
| Phase 2 — Suite handoffs | Shipped (guidance + Marketing hub) |
| Phase 3+ — Magic Studio depth, collab RT, print, enterprise Brand Hub | Backlog |

## Canva-parity matrix (Design-core)

| Capability | Status | Notes |
|------------|--------|-------|
| Templates (volume + categories + search) | **Yes** | ~2500+ seeded (procedural catalog + decks + colorways); Canva-like home + rail |
| Canvas size presets (social/print) | **Yes** | IG/FB/LI/TikTok/YT/WA/A4/Letter/card/poster |
| Brand kit | **Yes** | Persist + apply colors/fonts/logo |
| AI draft | **Yes** | Studio OpenRouter + `design_ai_used` quota |
| Data merge `{{fields}}` | **Yes** | JSON/CSV paste |
| Bulk create / autofill | **Yes** | CSV/JSON → design variants |
| Uploads + recent assets | **Yes** | `POST/GET /api/uploads` |
| Layers / lock / z-order | **Yes** | |
| Undo/redo + autosave | **Yes** | |
| Group / ungroup / align / distribute | **Yes** | Tools rail |
| Smart guides / snap | **Partial** | Center + edge snap while moving |
| Effects (shadow, opacity) | **Yes** | Blur-as-filter via image filters |
| Photo crop | **Partial** | Scale/flip/filters; dedicated crop UI later |
| Photo filters | **Yes** | Brightness/contrast/saturation |
| Background remove | **No** | Phase 3 — no RemBG key |
| Drawing (pen) | **Yes** | Fabric PencilBrush |
| Elements / icons / frames | **Yes** | Built-in SVG paths |
| Stock library | **Yes** | [Openverse](https://api.openverse.org/v1/) commercial CC search + import |
| QR codes | **Yes** | |
| Charts (bar/pie) | **Yes** | Basic |
| Magic resize | **Yes** | |
| Pages + duplicate | **Yes** | |
| Version history | **Yes** | Snapshots restore |
| Folders | **Yes** | |
| Share link | **Yes** | View token (project-scoped) |
| Comments | **Yes** | Simple threads |
| Real-time multiplayer | **No** | Phase 3 |
| Export PNG/JPG/SVG/PDF | **Yes** | + transparent PNG |
| GIF export | **No** | Documented gap |
| PPTX / print fulfillment | **No** | Phase 3 |
| Magic Studio / AI photo suite | **No** | Phase 3 |
| Video / Social / Email inside Design | **Ecosystem** | Suite handoffs |
| Websites | **Ecosystem** | Builder |

**Design-core coverage estimate:** ~**75–85%** of Canva’s *graphic design* surface
(not full Canva). Overall Canva platform still ~**partial** via Indobase suite.

## How to use (Phase 1)

| Feature | Where |
|---------|--------|
| Tools (arrange, draw, QR, charts, magic resize, bulk, versions, share, comments) | Left rail → **Tools** |
| Brand kit | **Brand** |
| AI draft | **AI** |
| Data merge | **Data** |
| Templates | Home “Create” (categories, search, size presets, featured rows) or editor **Templates** |
| Export | Toolbar → PNG / transparent PNG / JPG / SVG / PDF |

### Data merge / bulk CSV

```csv
product_name,price
Paneer Tikka,₹220
Masala Chai,₹80
```

## Phase 2 — Suite handoffs

From Design **Tools → Suite handoffs**: open Studio Marketing, export asset first,
then use **Open Video** / **Open Social** / Email from the hub. Design does **not**
re-implement those products.

## Phase 3+ backlog

- RemBG / Magic Studio photo depth, GIF
- Real-time multiplayer + presence
- Print fulfillment, PPTX (SlidesCarnival Canva/PPTX packs remain external: [free Canva templates](https://www.slidescarnival.com/category/free-templates/canva-templates))
- Enterprise Brand Hub enforcement / SCIM
- Classroom / live presentations
- Canva-scale template marketplace

### Template library (~2500+)

| Source | Role |
|--------|------|
| `templates.ts` | Hand-authored India-first seeds |
| `templates-deck.ts` | SlidesCarnival-category presentation decks (original Fabric, not Canva imports) |
| `templates-extra.ts` | Colorway variants + blank size starters |
| `templates-catalog.ts` | Procedural layouts × themes × palettes across Canva-like categories (~21 layouts, 18 palettes) |

Seed upserts on boot (`seed.ts`, batched). Categories include presentations, social, Instagram, stories, YouTube, LinkedIn, ads, marketing, posters, flyers, logos, business cards, docs/resumes, education, brand.

### Stock + presentation sources

| Source | Role |
|--------|------|
| [Openverse API](https://api.openverse.org/v1/) | In-editor Photos stock search (`license_type=commercial`). Optional `OPENVERSE_CLIENT_ID` / `OPENVERSE_CLIENT_SECRET` for higher rate limits. |
| [SlidesCarnival free Canva templates](https://www.slidescarnival.com/category/free-templates/canva-templates) | Category inspiration for native Fabric deck templates (pitch, SWOT, roadmap, education, portfolio…). Canva-format files are not imported; link out for PPTX/Canva downloads. |

## Deploy

```bash
SHA=$(git rev-parse HEAD)
rsync -az --delete --exclude node_modules --exclude dist --exclude .env --exclude '**/._*' \
  indobase-design-v2/ root@103.190.92.249:/opt/indobase-design-v2/
ssh root@103.190.92.249
cd /opt/indobase-design-v2/docker/deploy
# DESIGN_VERSION=$SHA in .env; optional STUDIO_INTERNAL_URL for AI
docker compose --env-file .env build && docker compose --env-file .env up -d
bash ../../docker/scripts/refresh-traefik-route.sh
```

Studio needs `OPEN_ROUTER_API_KEY` + `DESIGN_HANDOFF_SECRET` (already used by Video/Design SSO).
Promote Studio image when Design AI quota APIs change.

## Smoke

1. Studio → Marketing → Open Design  
2. Template → Brand apply → AI draft → Data merge → Bulk create  
3. Tools: group/align, draw, QR, chart, magic resize, snapshot, share, comment  
4. Upload image → recent assets → Export transparent PNG + PDF  
5. Save / reload  

```bash
curl -sS https://design.indobase.in/sso/health
```
