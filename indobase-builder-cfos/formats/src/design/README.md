# Indobase Design (format.design)

In-Builder canvas for logos, social posts, posters, and other graphics.

## Files

- `server.js` — Durable Object document store (`getDesign` / layer ops / undo)
- `client.js` — Canvas UI: presets, layers, inspector, PNG export
- Packaged as `../../workspace-design.gadget` + sidecar JSON

## Presets

| Id | Size |
|----|------|
| `ig-post` | 1080×1080 |
| `story` | 1080×1920 |
| `logo` | 512×512 |
| `poster` | 1080×1350 |

## Rebuild the archive

From `indobase-builder-cfos`:

```bash
node formats/scripts/pack-gadget.mjs design
```

Then rebuild the runtime bundle with `FORMAT_BLUEPRINTS_DIR` pointing at `formats/`
(see `formats/README.md` and `scripts/install-indobase-formats.sh`).
