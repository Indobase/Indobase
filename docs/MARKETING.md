# Indobase Marketing — hub launcher + Email + Social + Design

Status: **Email**, **Social**, and **Design** live paths (Studio SSO). Video
remains Coming soon (upstream engine rewrite — see below).

**Indobase Marketing** is a first-party **hub**, not one combined frankenstein app.
From the project chooser, customers open Marketing and pick a tool:

| Tile | Engine | License | Status |
|---|---|---|---|
| Email marketing | [Notifuse](https://github.com/Notifuse/notifuse) fork → `indobase-email/` | AGPL-3.0 | **Live** — Studio SSO |
| Social media posting | [Postiz](https://github.com/gitroomhq/postiz-app) fork → `indobase-social/` | AGPL-3.0 | **Live** — Studio SSO |
| Visual designer | [Penpot](https://github.com/penpot/penpot) engine → `indobase-design/` | MPL-2.0 | **Live** — Studio SSO |
| Video editor | [OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | Coming soon — upstream rewrite |

Brand surfaces always say **Indobase Marketing** / **Indobase Email** /
**Indobase Social** / **Indobase Design** — never upstream product names in
customer-facing UI.

### Why Video is still Coming soon

OpenCut is being rewritten from the ground up (Rust core, plugin-first); the
rewrite is scaffold-level and explicitly not production-ready. The previous
codebase (`opencut-app/opencut-classic`) is **archived and unmaintained**
upstream. We will not ship a broken or dead-end editor as GA — the tile stays
Coming soon with honest copy until the rewrite stabilizes, then it gets the
same fork + rebrand + Studio SSO treatment (`indobase-video/`,
`video.indobase.fun` / `video.indobase.in`).

---

## Studio surface

| Piece | Location |
|---|---|
| Chooser tile | `ProjectExperienceChooser` → `/project/[ref]/marketing` |
| Hub page | `/project/[ref]/marketing` — Email + Social + Design **Open**; Video Coming soon |
| Email launch | `GET /api/platform/projects/[ref]/email/launch` |
| Social launch | `GET /api/platform/projects/[ref]/social/launch` |
| Design launch | `GET /api/platform/projects/[ref]/design/launch` |
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
4. The `design-sso` shim verifies the token, then drives Penpot's OIDC flow
   (shim is the OIDC provider) — user is created/logged in, lands on the
   Design dashboard. Details: [INDOBASE-DESIGN.md](./INDOBASE-DESIGN.md).

Org roles (same as Payments): **owner, admin, developer, viewer**.

---

## Hosts

| Env | Email | Social | Design | Studio | Control plane |
|---|---|---|---|---|---|
| Staging | `email.indobase.fun` | `social.indobase.fun` | `design.indobase.fun` | `studio.indobase.fun` | Hostinger / Vyom |
| Production | `email.indobase.in` | `social.indobase.in` | `design.indobase.in` | `studio.indobase.in` | Vyom `103.190.92.249` |

DNS: A records for email/social/design hosts → deploy host (`.249` — not the
`*.indobase.in` tenant wildcard on `.248`). Design's canonical
`PENPOT_PUBLIC_URI` is `design.indobase.in`; the `.fun` host serves the same
stack.

---

## Auth model

- Operators use Studio sign-up / sign-in only.
- Public magic-code / password UI on Email and Social hosts redirect to Studio.
- Design: password login + registration disabled via `PENPOT_FLAGS`; the only
  entry is the Studio-driven OIDC flow through the `design-sso` shim.
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

Compose: `indobase-design/docker/deploy/docker-compose.yml` (upstream Penpot
images, `PENPOT_VERSION`-pinned; frontend branding wrapper + `design-sso` shim
built on the VPS with `docker compose build` — no CI image needed).  
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
INDOBASE_DESIGN_URL=https://design.indobase.in  # canonical (PENPOT_PUBLIC_URI)
EMAIL_HANDOFF_SECRET=<same-as-email-STUDIO_HANDOFF_SECRET>
SOCIAL_HANDOFF_SECRET=<same-as-social-STUDIO_HANDOFF_SECRET>
DESIGN_HANDOFF_SECRET=<same-as-design-.env-DESIGN_HANDOFF_SECRET>
```

---

## License / compliance

- **AGPL (Notifuse / Postiz):** source in `indobase-email/` and `indobase-social/`;
  see each `NOTICE.md` + license file. Corresponding Source for network use is
  the monorepo path under `https://github.com/Indobase/Indobase/tree/main/…`.
- **MPL-2.0 (Penpot):** we deploy unmodified upstream images with a branding
  overlay + an original SSO shim (no Penpot code) — see
  `indobase-design/NOTICE.md`. File-level copyleft only applies if we ever
  modify MPL-covered source files.
- Do not mix AGPL into proprietary Studio/Builder bundles without a deliberate
  boundary (same approach as `indobase-payments/`).
- India DPDP applies to audience/contact and social account data.

---

## Out of scope (this ship)

- OpenCut / `indobase-video/` (upstream rewrite in progress; classic is
  archived — tile stays Coming soon)
- Razorpay / Payments changes
