# Indobase Design

Template-first design editor for the Indobase Marketing suite — the Canva-class replacement for the
Penpot-based `indobase-design/`.

## Why this replaced Penpot

Penpot is a **Figma**-class tool (vector precision, components, prototyping, dev handoff) aimed at
**designers**. The Marketing suite's user is a business owner making a festival-sale post. Three
things made Penpot the wrong engine for that job:

| | Penpot fork (old) | This |
|---|---|---|
| Target user | designers | marketers / SMB owners |
| Design format | **binary `.penpot`** (zip of schema-validated JSON) | **Fabric.js JSON** |
| Templates | could only point at *someone else's* hosted files — not authorable | **authored in-repo as data we own** |
| AI drafting | not feasible (can't generate a valid binary) | feasible — an LLM can emit Fabric JSON |
| Business-data merge | not feasible | feasible — merge products/prices into template JSON |
| Containers | 6 (frontend, backend, exporter, valkey, postgres, OIDC shim) | **2** (app, postgres) |
| Studio SSO | needed a separate OIDC shim (Penpot's backend trusts only OIDC) | verified directly in our backend |

The format is the real point. Penpot's binary files structurally blocked the two features that would
make Indobase Design *differentiated* rather than a worse Canva — AI drafting and business-data
merge. Both are why this engine was chosen.

## Architecture

```
Studio ──"Open Design"──> GET /sso/launch#token=<HS256 JWT aud=indobase-design>
                            page POSTs token to /sso/session
                            → verify HMAC (DESIGN_HANDOFF_SECRET) → signed session cookie
                            → SPA (Preact + Fabric.js)  ⇄  /api/*  ⇄  Postgres
```

- `src/client/` — editor, derived from MIT [clawnify/open-design](https://github.com/clawnify/open-design) (see [NOTICE.md](./NOTICE.md)).
- `src/server/` — **original**: Hono + Postgres + Studio SSO. Upstream's Cloudflare/D1 server and its
  unlicensed `@clawnify/*` dependencies were deliberately not used.
- `src/server/templates.ts` — the built-in template library, as Fabric JSON.

**Studio needs no changes.** This consumes the `aud=indobase-design` handoff Studio already mints in
`apps/studio/lib/api/saas/design-launch.ts`. Swapping engines is a URL + deploy change.

## Multi-tenancy

Upstream is single-user (every row global). Here every design belongs to `(gotrue_id, project_ref)`
taken from the **verified session, never from request input**, and ownership lives in the `WHERE`
clause of every query — so a not-found and a not-yours are indistinguishable. Page mutations join
through `designs` so a page can only be touched by its owner. Viewers are read-only
(`requireEditor` on all mutating verbs).

## Run locally

```bash
pnpm install
export DESIGN_HANDOFF_SECRET=$(openssl rand -hex 32)   # must match Studio's
export DESIGN_DATABASE_URL=postgresql://design:design@localhost:5432/design
pnpm dev            # vite on :5173, api on :8080
pnpm test           # auth + template suites
pnpm typecheck
```

Schema and the built-in templates apply automatically at boot (idempotent).

## Deploy

**Staging (live for testing):** `studio-design.indobase.fun` on Vyom `.249`, compose project
`indobase-design-v2`. Penpot stays on `design.indobase.in` / `.fun` — do not clobber that stack.

```bash
cd docker/deploy
cp .env.example .env      # DESIGN_HANDOFF_SECRET (= Studio staging handoff), DB_PASSWORD
docker compose up -d --build
```

Staging Studio (`studio.indobase.fun`) sets `INDOBASE_DESIGN_URL=https://studio-design.indobase.fun`.
See [`docs/INDOBASE-DESIGN-V2.md`](../docs/INDOBASE-DESIGN-V2.md).

## Status

**Working and verified:** editor (text, shapes, images, multi-page, undo/redo, autosave, PNG export),
Studio SSO with role gating, multi-tenant storage, 8 built-in India-first templates, healthcheck.

Verified by: `tsc --noEmit` clean · 17 auth/tenant-isolation tests · 8 template-integrity tests ·
production `vite build`. **Not yet verified against a live Postgres or a real Studio handoff** — no
database was reachable in the build environment, so the first deploy is where the DB paths and the
end-to-end SSO round-trip get their real test.

## Canva parity — what's still missing

Honest list, roughly by value:

1. **Layers panel** — Fabric supports z-order; the UI doesn't expose it. (Apache-2.0
   [Davronov/canva-clone](https://github.com/Davronov-Alimardon/canva-clone) has one that can be
   adapted with attribution.)
2. **Export formats** — PNG only today; needs JPG/SVG/PDF.
3. **Brand kit** — logo/colours/fonts applied across the suite.
4. **More templates** — 8 is a starter set. The India-first angle (festivals, WhatsApp, GST-style
   invoices, Indic-language type) is where this beats Canva rather than trailing it.
5. **AI drafting** — "describe your post" → template + copy + image. Now possible because templates
   are JSON.
6. **Business-data merge** — auto-fill a sale poster from real products/prices. Needs the shared
   business schema.
7. **Magic resize** — one design → every social format.

Items 5 and 6 are the differentiators; 1–3 are table stakes.

## Migration from the Penpot fork

`indobase-design/` (Penpot) is still deployed and untouched. Run both in parallel, then cut over:

1. Deploy this stack on a staging host, verify the Studio handoff end-to-end.
2. Point `design.indobase.in` at `design-app`.
3. Keep Penpot reachable on a subdomain for anyone with in-flight work — Penpot files **cannot** be
   imported here (binary → JSON is not a supported conversion), so existing designs do not migrate.
   Users must re-create or export to PNG/SVG from Penpot first.
4. Once traffic is off it, retire `indobase-design/`.

Step 3 is the reason this was not a hard swap.
