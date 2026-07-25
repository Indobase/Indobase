# Indobase Marketing — hub launcher + Email + Social + Design + Video

Status: **Email**, **Social**, and **Design** live (Studio SSO). **Indobase
Video** is Coming soon (honest — see below).

**Indobase Marketing** is a first-party **hub**, not one combined frankenstein app.
From the project chooser, customers open Marketing and pick a tool:

| Tile | Product | License | Status |
|---|---|---|---|
| Email marketing | **Indobase Email** (`indobase-email/`) | AGPL-3.0 | **Live** — Studio SSO |
| Social media posting | **Indobase Social** (`indobase-social/`) | AGPL-3.0 | **Live** — Studio SSO |
| Visual designer | **Indobase Design** (`indobase-design/`) | MPL-2.0 | **Live** — Studio SSO |
| Video editor | **Indobase Video** (`indobase-video/` planned) | MIT (planned) | Coming soon |

Brand surfaces always say **Indobase Marketing** / **Indobase Email** /
**Indobase Social** / **Indobase Design** / **Indobase Video** — never upstream
product names in customer-facing UI. Engine attribution stays in `NOTICE.md`
and engineering docs only.

### Why Indobase Video is still Coming soon

The candidate open-source video editor is being rewritten from the ground up
(Rust core, plugin-first); the rewrite is scaffold-level and not
production-ready. The previous classic codebase is archived and unmaintained
upstream. We will not ship a broken or dead-end editor as GA — the tile stays
Coming soon with Indobase branding until the rewrite stabilizes, then it gets
the same fork + rebrand + Studio SSO treatment (`indobase-video/`,
`video.indobase.fun` / `video.indobase.in`, `VIDEO_HANDOFF_SECRET`).

---

## Studio surface

| Piece | Location |
|---|---|
| Chooser tile | `ProjectExperienceChooser` → `/project/[ref]/marketing` |
| Hub page | `/project/[ref]/marketing` — Email + Social + Design **Open**; Video Coming soon |
| Email launch | `GET /api/platform/projects/[ref]/email/launch` |
| Social launch | `GET /api/platform/projects/[ref]/social/launch` |
| Design launch | `GET /api/platform/projects/[ref]/design/launch` |
| Video launch | `GET /api/platform/projects/[ref]/video/launch` (when shipped) |
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
4. The `design-sso` shim verifies the token, then drives the design engine's
   OIDC flow (shim is the OIDC provider) — user is created/logged in, lands on
   the Design dashboard. Details: [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md).

Org roles (same as Payments): **owner, admin, developer, viewer**.

---

## Hosts

| Env | Email | Social | Design | Video | Studio | Control plane |
|---|---|---|---|---|---|---|
| Staging | `email.indobase.fun` | `social.indobase.fun` | `design.indobase.fun` | — (Coming soon) | `studio.indobase.fun` | Hostinger / Vyom |
| Production | `email.indobase.in` | `social.indobase.in` | `design.indobase.in` | — (Coming soon) | `studio.indobase.in` | Vyom `103.190.92.249` |

DNS: A records for email/social/design hosts → deploy host (`.249` — not the
`*.indobase.in` tenant wildcard on `.248`). Design's canonical public URI is
`design.indobase.in`; the `.fun` host serves the same stack.

---

## Auth model

- Operators use Studio sign-up / sign-in only.
- Public magic-code / password UI on Email and Social hosts redirect to Studio.
- Design: password login + registration disabled; the only entry is the
  Studio-driven OIDC flow through the `design-sso` shim.
- Email env: `STUDIO_HANDOFF_ONLY=true`, `STUDIO_HANDOFF_SECRET` (≥32 chars).
- Social env: same + `SOCIAL_HANDOFF_SECRET` alias.
- Design env: `DESIGN_HANDOFF_SECRET` (shim) — reuse the shared handoff secret.
- Studio: `EMAIL_HANDOFF_SECRET` / `SOCIAL_HANDOFF_SECRET` /
  `DESIGN_HANDOFF_SECRET` (or shared `STUDIO_HANDOFF_SECRET`) +
  `INDOBASE_EMAIL_URL` / `INDOBASE_SOCIAL_URL` / `INDOBASE_DESIGN_URL`.

---

## Deploy

### Email

Compose: `indobase-email/docker/deploy/docker-compose.yml`  
**Sending / SES / DNS:** see [INDOBASE-EMAIL.md](./INDOBASE-EMAIL.md).

### Social

Compose: `indobase-social/docker/deploy/docker-compose.yml`  
Details: [INDOBASE-SOCIAL.md](./INDOBASE-SOCIAL.md).

### Design

Compose: `indobase-design/docker/deploy/docker-compose.yml` (upstream engine
images version-pinned; frontend branding wrapper + `design-sso` shim built on
the VPS with `docker compose build`). Traefik file provider (container DNS):
`indobase-design/docker/deploy/traefik/indobase-design.yml` →
`/etc/dokploy/traefik/dynamic/`.  
Details: [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md).

CI builds `roshanraghavander/indobase-email:<git-sha>` and
`roshanraghavander/indobase-social:<git-sha>` on push to `staging` / `main`.

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
EMAIL_HANDOFF_SECRET=<same-as-email-STUDIO_HANDOFF_SECRET>
SOCIAL_HANDOFF_SECRET=<same-as-social-STUDIO_HANDOFF_SECRET>
DESIGN_HANDOFF_SECRET=<same-as-design-.env-DESIGN_HANDOFF_SECRET>
```

---

## License / compliance

- **AGPL (Email / Social engines):** source in `indobase-email/` and
  `indobase-social/`; see each `NOTICE.md` + license file. Corresponding Source
  for network use is the monorepo path under
  `https://github.com/Indobase/Indobase/tree/main/…`.
- **MPL-2.0 (Design engine):** we deploy unmodified upstream images with a
  branding overlay + an original SSO shim — see `indobase-design/NOTICE.md`.
  File-level copyleft only applies if we ever modify MPL-covered source files.
- Do not mix AGPL into proprietary Studio/Builder bundles without a deliberate
  boundary (same approach as `indobase-payments/`).
- India DPDP applies to audience/contact and social account data.

---

## Out of scope (this ship)

- Indobase Video / `indobase-video/` (Coming soon — see
  [INDOBASE-VIDEO.md](./INDOBASE-VIDEO.md))
- Razorpay / Payments changes
