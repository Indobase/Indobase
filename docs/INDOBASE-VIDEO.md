# Indobase Video — Coming soon

**Product name:** Indobase Video (part of **Indobase Marketing**).  
**Hosts (when shipped):** `video.indobase.fun` · `video.indobase.in` on Vyom `.249`.  
**Status:** Coming soon — do **not** point DNS or Traefik at these hosts until a
real editor is deployed.

## Why not live yet

The open-source editor we intend to build on is mid-rewrite (new core, not GA).
The previous classic tree is archived upstream. Shipping either as Indobase Video
would put a broken or dead-end app behind Marketing → Open Video. The Marketing
hub tile stays **Coming soon** with Indobase branding until we can meet the same
bar as Email / Social / Design:

1. Indobase-only UI (logos, favicons, splash, titles — zero upstream product name)
2. Studio SSO handoff (`VIDEO_HANDOFF_SECRET`, `/api/platform/projects/[ref]/video/launch`)
3. Kill public password signup → Studio sign-in
4. Traefik on `.249` with container DNS
5. Docs + Marketing hub **Open Video**

## Planned integration (mirror Email / Social / Design)

| Piece | Planned value |
|---|---|
| Source tree | `indobase-video/` (+ `NOTICE.md` for MIT attribution) |
| Launch API | `GET /api/platform/projects/[ref]/video/launch` |
| Handoff JWT | `aud=indobase-video`, HMAC `VIDEO_HANDOFF_SECRET` |
| Studio env | `INDOBASE_VIDEO_URL`, `VIDEO_HANDOFF_SECRET` |
| Open path | Marketing hub → **Open Video** |

Until then: no `video.*` hosts, no launch API, no half-shipped GA.
