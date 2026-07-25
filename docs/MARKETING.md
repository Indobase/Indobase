# Indobase Marketing — hub launcher + Email + Social

Status: **Email** and **Social** live paths (Studio SSO). Design / Video remain
Coming soon.

**Indobase Marketing** is a first-party **hub**, not one combined frankenstein app.
From the project chooser, customers open Marketing and pick a tool:

| Tile | Engine | License | Status |
|---|---|---|---|
| Email marketing | [Notifuse](https://github.com/Notifuse/notifuse) fork → `indobase-email/` | AGPL-3.0 | **Live** — Studio SSO |
| Social media posting | [Postiz](https://github.com/gitroomhq/postiz-app) fork → `indobase-social/` | AGPL-3.0 | **Live** — Studio SSO |
| Visual designer | [Penpot](https://github.com/penpot/penpot) fork | MPL-2.0 | Later |
| Video editor | [OpenCut](https://github.com/OpenCut-app/OpenCut) fork | MIT | Later |

Brand surfaces always say **Indobase Marketing** / **Indobase Email** /
**Indobase Social** — never upstream product names in customer-facing UI.

---

## Studio surface

| Piece | Location |
|---|---|
| Chooser tile | `ProjectExperienceChooser` → `/project/[ref]/marketing` |
| Hub page | `/project/[ref]/marketing` — Email + Social **Open**; others Coming soon |
| Email launch | `GET /api/platform/projects/[ref]/email/launch` |
| Social launch | `GET /api/platform/projects/[ref]/social/launch` |
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

Org roles (same as Payments): **owner, admin, developer, viewer**.

---

## Hosts

| Env | Email | Social | Studio | Control plane |
|---|---|---|---|---|
| Staging | `email.indobase.fun` | `social.indobase.fun` | `studio.indobase.fun` | Hostinger / Vyom |
| Production | `email.indobase.in` | `social.indobase.in` | `studio.indobase.in` | Vyom `103.190.92.249` |

DNS: A records for email/social hosts → deploy host (`.249` for prod Social —
not the `*.indobase.in` tenant wildcard on `.248`).

---

## Auth model

- Operators use Studio sign-up / sign-in only.
- Public magic-code / password UI on Email and Social hosts redirect to Studio.
- Email env: `STUDIO_HANDOFF_ONLY=true`, `STUDIO_HANDOFF_SECRET` (≥32 chars).
- Social env: same + `SOCIAL_HANDOFF_SECRET` alias.
- Studio: `EMAIL_HANDOFF_SECRET` / `SOCIAL_HANDOFF_SECRET` (or shared
  `STUDIO_HANDOFF_SECRET`) + `INDOBASE_EMAIL_URL` / `INDOBASE_SOCIAL_URL`.

---

## Deploy

### Email

Compose: `indobase-email/docker/deploy/docker-compose.yml`  
**Sending / SES / DNS:** see [INDOBASE-EMAIL.md](./INDOBASE-EMAIL.md).

### Social

Compose: `indobase-social/docker/deploy/docker-compose.yml`  
Details: [INDOBASE-SOCIAL.md](./INDOBASE-SOCIAL.md).

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
EMAIL_HANDOFF_SECRET=<same-as-email-STUDIO_HANDOFF_SECRET>
SOCIAL_HANDOFF_SECRET=<same-as-social-STUDIO_HANDOFF_SECRET>
```

---

## License / compliance

- **AGPL (Notifuse / Postiz):** source in `indobase-email/` and `indobase-social/`;
  see each `NOTICE.md` + license file. Corresponding Source for network use is
  the monorepo path under `https://github.com/Indobase/Indobase/tree/main/…`.
- Do not mix AGPL into proprietary Studio/Builder bundles without a deliberate
  boundary (same approach as `indobase-payments/`).
- India DPDP applies to audience/contact and social account data.

---

## Out of scope (this ship)

- Penpot / OpenCut forks
- Razorpay / Payments changes
