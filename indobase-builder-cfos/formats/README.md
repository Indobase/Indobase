# Indobase Builder formats

Indobase-owned format blueprints for Builder Gen 3 (Docs, Sheets, Slides, **Design**).

Upstream CF OS ships a default `format-blueprints/` directory inside the gitignored
clone. We keep our set here and point the runtime build at it with
`FORMAT_BLUEPRINTS_DIR` so the submodule stays pristine.

## Layout

| Files | Role |
|-------|------|
| `workspace-*.gadget` + `workspace-*.json` | Installable formats (archive + sidecar) |
| `src/design/` | Editable Design gadget source |
| `scripts/pack-gadget.mjs` | Pack `src/<name>` → `.gadget` |

## Formats

| blueprintId | Title | Notes |
|-------------|-------|-------|
| `format.document` | Docs | Copied from upstream; Indobase author |
| `format.spreadsheet` | Sheets | Copied from upstream; Indobase author |
| `format.slides` | Slides | Copied from upstream; Indobase author |
| `format.design` | Design | Indobase-authored canvas (logos / social / posters) |

Design v1: size presets (IG post, story, logo, poster), layers (background, text,
rect, ellipse), client-side PNG export. Icon is `appWindow` (runtime `OUTPUT_ICONS`
has no `image` glyph yet).

## Install into a local/VPS runtime

```bash
# from indobase-builder-cfos/
./scripts/install-indobase-formats.sh
```

That sets `FORMAT_BLUEPRINTS_DIR` to this directory, rebuilds
`workshop-backend/src/generated/format-blueprints.ts`, and (optionally) restarts
nothing — restart `pnpm run-local` / `indobase-cfos-runtime` yourself so the
Worker picks up the new bundle. Fresh deployments install formats on the first
`/api` request.

`dev-stack.sh`, `rebrand-cloudflare-os.mjs`, and the VPS provision script call the
same install path.

## Rebuild Design after editing source

```bash
node formats/scripts/pack-gadget.mjs design
./scripts/install-indobase-formats.sh
# bump "revision" in workspace-design.json if an existing deployment already
# installed an older archive
```
