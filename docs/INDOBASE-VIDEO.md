# Indobase Video

**Product:** Indobase Video (Marketing suite)  
**Hosts:** `video.indobase.fun` (staging smoke) · `video.indobase.in` (production) on Vyom `.249`  
**Source:** `indobase-video/`  
**Upstream path:** OpenCut **classic** is MIT and runnable, but a full fork is ~2k files and pulls Postgres/Redis/better-auth/blog tooling that fights our Studio-SSO-only model and this repo’s exFAT workspace. The OpenCut **rewrite** is still scaffold-level. **v1 ships a purpose-built editor** inspired by classic OpenCut (timeline, import, trim/split, text, preview, browser export) — see `NOTICE.md`.

## Features (v1)

| Feature | Status |
|---|---|
| Studio SSO (`/sso/launch`, `VIDEO_HANDOFF_SECRET`) | Yes |
| Import video / audio / image | Yes |
| Timeline + trim + split | Yes |
| Text / title clips | Yes |
| Preview playback | Yes |
| Export downloadable video | Yes — **WebM** via Canvas + MediaRecorder (VP8/VP9). MP4/FFmpeg WASM not required for v1. |
| Autosave / restore | Yes — **IndexedDB** keyed by `project_ref` + Studio user `sub` (browser-local, project-scoped) |

## Architecture

```
Studio (Open Video)
  └─ GET /api/platform/projects/[ref]/video/launch
       → https://video.indobase.in/sso/launch?project_ref=…#token=<HS256 aud=indobase-video>
            └─ POST /sso/session → ib_video_sso cookie (12h)
                 └─ /editor SPA (Vite) — unauthenticated → Studio sign-in
```

Allowed org roles (same as Email/Social/Design): owner, admin, developer, viewer.

## Deploy (.249)

```bash
git clone --depth 1 --branch staging --filter=blob:none --sparse \
  https://github.com/Indobase/Indobase.git /tmp/ib-video-src
cd /tmp/ib-video-src && git sparse-checkout set indobase-video
rsync -a --delete --exclude docker/deploy/.env \
  /tmp/ib-video-src/indobase-video/ /opt/indobase-video/

cd /opt/indobase-video/docker/deploy
cp .env.example .env   # VIDEO_HANDOFF_SECRET = Studio STUDIO_HANDOFF_SECRET
# Prefer SHA-pinned Hub image after CI:
# IMAGE=roshanraghavander/indobase-video:<sha> docker compose --env-file .env up -d
docker compose --env-file .env up -d --build

cp ../deploy/traefik/indobase-video.yml /etc/dokploy/traefik/dynamic/indobase-video.yml
# or: cp traefik/indobase-video.yml …
```

Studio Swarm env:

```bash
INDOBASE_VIDEO_URL=https://video.indobase.in
VIDEO_HANDOFF_SECRET=<same as video .env>
```

## Smoke

```bash
curl -sS https://video.indobase.fun/sso/health
curl -sS https://video.indobase.in/sso/health
# Studio → project → Marketing → Open Video → import → trim/text → Play → Export WebM
```

## Limitations

- Export is **WebM** (browser MediaRecorder), not MP4. Fine for product clips; convert externally if a client requires H.264.
- Project media lives in the browser IndexedDB for that Studio user + project — not a multi-device cloud library yet.
- No collaborative multiplayer editing.
