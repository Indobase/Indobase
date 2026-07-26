# Indobase Video

**Product:** Indobase Video (Marketing suite)  
**Hosts:** `video.indobase.fun` (staging smoke) · `video.indobase.in` (production) on Vyom `.249`  
**Source:** `indobase-video/`  
**Upstream path:** OpenCut **classic** is MIT and runnable, but a full fork is ~2k files and pulls Postgres/Redis/better-auth/blog tooling that fights our Studio-SSO-only model and this repo’s exFAT workspace. The OpenCut **rewrite** is still scaffold-level. **v1 + P0** ships a purpose-built editor inspired by classic OpenCut — see `NOTICE.md`.

## Features (P0 / InVideo-parity baseline)

| Feature | Status |
|---|---|
| Studio SSO (`/sso/launch`, `VIDEO_HANDOFF_SECRET`) | Yes |
| Import video / audio / image | Yes |
| **Multi-track** timeline (video, overlay, text, audio) | Yes |
| Trim + split | Yes |
| Text / title clips | Yes |
| Preview playback (z-ordered lanes) | Yes |
| Export downloadable video | Yes — **MP4** (H.264/AAC): native MediaRecorder when supported, else WebM → **ffmpeg.wasm**. WebM secondary. |
| **Cloud project persistence** | Yes — `saas.video_projects` via Studio `GET/PUT …/video/projects`; IndexedDB is offline cache |
| **Create with AI** (script → scenes → timeline) | Yes — Studio `POST …/video/generate` (OpenRouter) |
| **TTS narration** | Yes — Studio `POST …/video/tts` (ElevenLabs if configured, else OpenAI TTS; graceful skip if neither) |
| **AI quotas** | Yes — `saas.organizations.video_ai_used` + `videoAiLimit` entitlements; `GET …/video/quota` |

## Architecture

```
Studio (Open Video)
  └─ GET /api/platform/projects/[ref]/video/launch
       → https://video.indobase.in/sso/launch?project_ref=…#token=<HS256 aud=indobase-video>
            └─ POST /sso/session → ib_video_sso cookie (12h)
                 └─ /editor SPA
                      ├─ Bearer aud=indobase-video-api (minted by Video server from SSO)
                      └─ Studio APIs:
                           GET/PUT  …/video/projects
                           POST     …/video/generate
                           POST     …/video/tts
                           GET      …/video/quota
```

Allowed org roles (same as Email/Social/Design): owner, admin, developer, viewer.

## Studio env (Swarm on `.249`)

```bash
INDOBASE_VIDEO_URL=https://video.indobase.in
VIDEO_HANDOFF_SECRET=<same as video .env>
OPEN_ROUTER_API_KEY=<from Builder / OpenRouter>   # preferred; OPENROUTER_API_KEY also accepted
OPENAI_API_KEY=<optional TTS fallback>
ELEVENLABS_API_KEY=<optional preferred TTS>
```

## Deploy (.249)

```bash
# Prefer SHA-pinned Hub image after CI (docker-publish-video.yml):
cd /opt/indobase-video/docker/deploy
IMAGE=roshanraghavander/indobase-video:<sha> docker compose --env-file .env up -d

# Apply control-plane migration (once):
docker exec -i indobase-db psql -U postgres -d postgres < supabase/migrations/20260726120000_saas_video_projects.sql
```

## Smoke

```bash
curl -sS https://video.indobase.fun/sso/health
curl -sS https://video.indobase.in/sso/health
# Studio → Marketing → Open Video → Create with AI → edit multi-track → Export MP4
# Clear site data → reopen → cloud doc restores (media blobs may need re-import)
```

## Limitations / P1

- Media blobs remain browser-local (IndexedDB); cloud stores timeline JSON only.
- No collaborative multiplayer; no server-side render farm (client MP4 kept).
- First MP4 export on Chromium may download ~30 MB ffmpeg.wasm from jsDelivr.
- P1: Storage-backed assets, stock media, captions burn-in, templates, server render optional.
