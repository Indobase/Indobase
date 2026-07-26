# Indobase Video

Browser video editor for the Indobase Marketing suite.

- **Hosts:** `video.indobase.fun` · `video.indobase.in`
- **SSO:** Studio handoff JWT (`aud=indobase-video`) → `/sso/launch`
- **Docs:** [`docs/INDOBASE-VIDEO.md`](../docs/INDOBASE-VIDEO.md)

## Layout

| Path | Role |
|---|---|
| `web/` | Vite + React editor SPA |
| `server/server.mjs` | Zero-dep Node SSO + static host |
| `docker/deploy/` | Compose + Traefik on Vyom `.249` |
| `NOTICE.md` / `LICENSE` | MIT attribution (OpenCut classic inspiration) |

## Local (optional)

Do **not** `npm install` on the portable exFAT volume. Prefer Docker:

```bash
cd indobase-video
docker build -t indobase-video:local .
docker run --rm -p 8780:8780 \
  -e VIDEO_HANDOFF_SECRET=dev-secret-at-least-32-characters-long \
  -e PUBLIC_ORIGIN=http://localhost:8780 \
  -e STUDIO_PUBLIC_URL=http://localhost:8082 \
  indobase-video:local
```

## Rebrand

Shipped UI strings / titles / manifest say **Indobase Video** only. Scan:

```bash
rg -i 'opencut|capcut' indobase-video/web --glob '!NOTICE.md' --glob '!LICENSE'
```
