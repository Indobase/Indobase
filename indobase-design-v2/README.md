# Indobase Design

Template-first design editor for the Indobase Marketing suite (Canva-class,
**not** full Canva parity). Source of truth: this directory (`indobase-design-v2/`).

## Why Fabric.js

Marketing users need festival posts and ads, not a Figma fork. Fabric.js JSON
is authorable, AI-generable, and data-mergeable.

| | This |
|---|---|
| Target user | marketers / SMB owners |
| Design format | **Fabric.js JSON** |
| Templates | ~20 in-repo, categorized |
| AI drafting | Studio OpenRouter → Fabric JSON |
| Business-data merge | `{{placeholders}}` + JSON/CSV |
| Brand kit | colors, fonts, logo apply |
| Containers | **2** (app, postgres) |
| Studio SSO | verified in Hono backend |

There is **no** `.penpot` import.

## Architecture

```
Studio ──"Open Design"──> /sso/launch#token=… → session cookie
SPA ⇄ /api/* ⇄ Postgres
AI draft ⇄ Studio /api/platform/projects/[ref]/design/generate
```

See [`docs/INDOBASE-DESIGN.md`](../docs/INDOBASE-DESIGN.md) for deploy, smoke,
how-to (brand / AI / merge), and honest remaining gaps.

## Run locally

```bash
# Inside indobase-design-v2/ only (avoid root pnpm on exFAT SSD)
pnpm install
export DESIGN_HANDOFF_SECRET=$(openssl rand -hex 32)
export DESIGN_DATABASE_URL=postgresql://design:design@localhost:5432/design
pnpm dev
pnpm test
```

## Status (shipped)

Editor (text, shapes, **uploads**, multi-page, undo/redo, autosave, canvas
presets), layers, PNG/JPG/SVG/PDF export, Studio SSO, brand kit, AI draft,
data merge, categorized templates.

**Out of scope:** Magic Studio, stock library, multiplayer, print fulfillment,
PPTX, video-in-Design, website builder.
