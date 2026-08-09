# Indobase Marketing — hub launcher + Email + Social + Design + Video

Status: **Email**, **Social**, **Design**, and **Video** live (Studio SSO).

**Indobase Marketing** is a first-party **hub**, not one combined frankenstein app.
From the project chooser, customers open Marketing and pick a tool:

| Tile | Product | License | Status |
|---|---|---|---|
| Email marketing | **Indobase Email** (`indobase-email/`) | AGPL-3.0 | **Live** — Studio SSO |
| Social media posting | **Indobase Social** (`indobase-social/`) | AGPL-3.0 | **Live** — Studio SSO |
| Visual designer | **Indobase Design** (`indobase-design-v2/`) | MIT + Apache-2.0 (NOTICE) | **Live** — Studio SSO |
| Video editor | **Indobase Video** (`indobase-video/`) | MIT (NOTICE) | **Live** — Studio SSO |

Brand surfaces always say **Indobase Marketing** / **Indobase Email** /
**Indobase Social** / **Indobase Design** / **Indobase Video** — never upstream
product names in customer-facing UI. Engine attribution stays in `NOTICE.md`
and engineering docs only.

### Indobase Video upstream choice

OpenCut **rewrite** (`OpenCut-app/OpenCut`) is still scaffold-level. OpenCut
**classic** is MIT and runnable but archived, and a full fork pulls Postgres /
Redis / better-auth / marketing-site deps that fight Studio-SSO-only and
balloon on this workspace’s exFAT volume. **P0** is a purpose-built Indobase
editor (multi-track timeline, AI draft + TTS via Studio APIs, cloud-persisted
projects, quota-gated AI, MP4/WebM export) inspired by classic OpenCut — see
[INDOBASE-VIDEO.md](./INDOBASE-VIDEO.md).

---

## Studio surface

| Piece | Location |
|---|---|
| Chooser tile | `ProjectExperienceChooser` → `/project/[ref]/marketing` |
| Hub page | `/project/[ref]/marketing` — Email + Social + Design + Video **Open** |
| Email launch | `GET /api/platform/projects/[ref]/email/launch` |
| Social launch | `GET /api/platform/projects/[ref]/social/launch` |
| Design launch | `GET /api/platform/projects/[ref]/design/launch` |
| Video launch | `GET /api/platform/projects/[ref]/video/launch` |
| Video projects | `GET/PUT /api/platform/projects/[ref]/video/projects` |
| Video AI | `POST …/video/generate`, `POST …/video/tts`, `GET …/video/quota` |
| Layout | Ungated like Payments (no Backend Studio sidebar / plan gate) |

### How to open Email

1. Sign in to Studio (`studio.indobase.fun` or `studio.indobase.in`).
2. Open a project → **Marketing**.
3. On **Email marketing**, click **Open Email** (or Open in new tab).
4. Studio mints a short-lived JWT (`aud=indobase-email`) and redirects to
   `https://email.<domain>/console/launch#token=…`.
5. Indobase Email verifies the JWT, creates/finds the user + workspace
   (`workspace id` = alphanumeric project ref), and sets the console session.

### How to open Social

1. Same Studio project → **Marketing**.
2. On **Social media posting**, click **Open Social**.
3. Studio mints JWT (`aud=indobase-social`) →
   `https://social.<domain>/auth/launch#token=…`.
4. Indobase Social exchanges via `/api/auth/studio-handoff`, maps org
   `ib:<project_ref>`, sets session.

### How to open Design

1. Same Studio project → **Marketing**.
2. On **Visual designer**, click **Open Design**.
3. Studio mints JWT (`aud=indobase-design`) →
   `https://design.<domain>/sso/launch#token=…`.
4. Indobase Design verifies the token (HMAC), sets a session cookie, and opens
   the Canva-class editor (Fabric.js). Details: [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md).
   There is no `.penpot` import — designs are Fabric JSON.

### How to open Video

1. Same Studio project → **Marketing**.
2. On **Video editor**, click **Open Video**.
3. Studio mints JWT (`aud=indobase-video`) →
   `https://video.<domain>/sso/launch?project_ref=…#token=…`.
4. Video verifies the token, sets `ib_video_sso`, opens the editor for that
   project. Editor mints a Video API bearer (`aud=indobase-video-api`) for
   cloud save, AI generate/TTS, and quota against Studio. Details:
   [INDOBASE-VIDEO.md](./INDOBASE-VIDEO.md).

Org roles (same as Payments): **owner, admin, developer, viewer**.

---

## Hosts

| Env | Email | Social | Design | Video | Studio | Control plane |
|---|---|---|---|---|---|---|
| Staging | `email.indobase.fun` | `social.indobase.fun` | `design.indobase.fun` | `video.indobase.fun` | `studio.indobase.fun` | Hostinger / Vyom |
| Production | `email.indobase.in` | `social.indobase.in` | `design.indobase.in` | `video.indobase.in` | `studio.indobase.in` | Vyom `103.190.92.249` |

DNS: A records for email/social/design/video hosts → deploy host (`.249` — not the
`*.indobase.in` tenant wildcard on `.248`). Design's canonical public URI is
`design.indobase.in`; the `.fun` host serves the same stack. Same for Video.

---

## Auth model

- Operators use Studio sign-up / sign-in only.
- Public magic-code / password UI on Email and Social hosts redirect to Studio.
- Design: no public auth — unauthenticated requests redirect to Studio sign-in;
  entry is Studio handoff JWT only.
- Video: no public auth — unauthenticated requests redirect to Studio sign-in.
- Email env: `STUDIO_HANDOFF_ONLY=true`, `STUDIO_HANDOFF_SECRET` (≥32 chars).
- Social env: same + `SOCIAL_HANDOFF_SECRET` alias.
- Design env: `DESIGN_HANDOFF_SECRET` (shim) — reuse the shared handoff secret.
- Video env: `VIDEO_HANDOFF_SECRET` — reuse the shared handoff secret.
- Studio: `EMAIL_HANDOFF_SECRET` / `SOCIAL_HANDOFF_SECRET` /
  `DESIGN_HANDOFF_SECRET` / `VIDEO_HANDOFF_SECRET` (or shared
  `STUDIO_HANDOFF_SECRET`) + `INDOBASE_EMAIL_URL` / `INDOBASE_SOCIAL_URL` /
  `INDOBASE_DESIGN_URL` / `INDOBASE_VIDEO_URL`.

---

## Deploy

### Email

Compose: `indobase-email/docker/deploy/docker-compose.yml`  
**Sending / SES / DNS:** see [INDOBASE-EMAIL.md](./INDOBASE-EMAIL.md).

### Social

Compose: `indobase-social/docker/deploy/docker-compose.yml`  
Details: [INDOBASE-SOCIAL.md](./INDOBASE-SOCIAL.md).

### Design

Compose: `indobase-design-v2/docker/deploy/docker-compose.yml` (app + Postgres;
pin `DESIGN_VERSION=<git-sha>`). Traefik file provider (container DNS):
`indobase-design-v2/docker/deploy/traefik/indobase-design-v2.yml` →
`/etc/dokploy/traefik/dynamic/` (refresh via `refresh-traefik-route.sh`).  
Details: [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md).

### Video

Compose: `indobase-video/docker/deploy/docker-compose.yml`  
CI image: `roshanraghavander/indobase-video:<git-sha>`  
Traefik: `indobase-video/docker/deploy/traefik/indobase-video.yml`  
Details: [INDOBASE-VIDEO.md](./INDOBASE-VIDEO.md).

CI builds `roshanraghavander/indobase-email:<git-sha>`,
`roshanraghavander/indobase-social:<git-sha>`, and
`roshanraghavander/indobase-video:<git-sha>` on push to `staging` / `main`.

```bash
# Social example (after CI for $SHA)
cd /opt/indobase-social
cp docker/deploy/.env.example docker/deploy/.env
# edit secrets; INDOBASE_SOCIAL_IMAGE=roshanraghavander/indobase-social:$SHA
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env pull
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env up -d
```

Studio env:

```bash
INDOBASE_EMAIL_URL=https://email.indobase.fun   # or .in
INDOBASE_SOCIAL_URL=https://social.indobase.fun # or .in
INDOBASE_DESIGN_URL=https://design.indobase.in  # canonical public URI
INDOBASE_VIDEO_URL=https://video.indobase.in
EMAIL_HANDOFF_SECRET=<same-as-email-STUDIO_HANDOFF_SECRET>
SOCIAL_HANDOFF_SECRET=<same-as-social-STUDIO_HANDOFF_SECRET>
DESIGN_HANDOFF_SECRET=<same-as-design-.env-DESIGN_HANDOFF_SECRET>
VIDEO_HANDOFF_SECRET=<same-as-video-.env-VIDEO_HANDOFF_SECRET>
```

---

## License / compliance

- **AGPL (Email / Social engines):** source in `indobase-email/` and
  `indobase-social/`; see each `NOTICE.md` + license file. Corresponding Source
  for network use is the monorepo path under
  `https://github.com/Indobase/Indobase/tree/main/…`.
- **MIT + Apache-2.0 (Design):** Canva-class editor in `indobase-design-v2/` —
  MIT client (clawnify/open-design), Apache-2.0 Davronov layers attribution,
  original Hono/Postgres/SSO server — see `indobase-design-v2/NOTICE.md`.
  The former Penpot fork (`indobase-design/`) has been removed from the monorepo;
  live Design is only `indobase-design-v2/`.
- **MIT (Video):** Indobase Video v1 + OpenCut classic attribution in
  `indobase-video/NOTICE.md` / `LICENSE`.
- Do not mix AGPL into proprietary Studio/Builder bundles without a deliberate
  boundary (ecosystem AGPL products stay in their own trees; Payments is Studio BYOK).
- India DPDP applies to audience/contact and social account data.

---

## Out of scope (this ship)

- Razorpay / Payments changes
- Cloud media library for Video (today: browser IndexedDB only)
