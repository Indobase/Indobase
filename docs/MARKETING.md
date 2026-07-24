# Indobase Marketing — hub launcher + Email engine

Status: **Email live path** (Studio SSO + `indobase-email/` Notifuse fork). Other
engines remain Coming soon.

**Indobase Marketing** is a first-party **hub**, not one combined frankenstein app.
From the project chooser, customers open Marketing and pick a tool:

| Tile | Engine | License | Status |
|---|---|---|---|
| Email marketing | [Notifuse](https://github.com/Notifuse/notifuse) fork → `indobase-email/` | AGPL-3.0 | **Live** — Studio SSO |
| Social media posting | [Postiz](https://github.com/gitroomhq/postiz-app) fork | AGPL-3.0 | Coming soon |
| Visual designer | [Penpot](https://github.com/penpot/penpot) fork | MPL-2.0 | Later |
| Video editor | [OpenCut](https://github.com/OpenCut-app/OpenCut) fork | MIT | Later |

Brand surfaces always say **Indobase Marketing** / **Indobase Email** — never
upstream product names in customer-facing UI.

---

## Studio surface

| Piece | Location |
|---|---|
| Chooser tile | `ProjectExperienceChooser` → `/project/[ref]/marketing` |
| Hub page | `/project/[ref]/marketing` — Email **Open**; others Coming soon |
| Launch API | `GET /api/platform/projects/[ref]/email/launch` |
| Layout | Ungated like Payments (no Backend Studio sidebar / plan gate) |

### How to open Email

1. Sign in to Studio (`studio.indobase.fun` or `studio.indobase.in`).
2. Open a project → **Marketing**.
3. On **Email marketing**, click **Open Email** (or Open in new tab).
4. Studio mints a short-lived JWT (`aud=indobase-email`) and redirects to
   `https://email.<domain>/console/launch#token=…`.
5. Indobase Email verifies the JWT, creates/finds the user + workspace
   (`workspace id` = alphanumeric project ref), and sets the console session.

Org roles (same as Payments): **owner, admin, developer, viewer**.

Project ↔ workspace: one Email workspace per Indobase project (`emailWorkspaceIdForProjectRef`).

---

## Hosts

| Env | Email host | Studio | Control plane |
|---|---|---|---|
| Staging | `email.indobase.fun` | `studio.indobase.fun` | Hostinger `72.61.242.251` (or Vyom if DNS points there) |
| Production | `email.indobase.in` | `studio.indobase.in` | Vyom `103.190.92.249` |

DNS: A records for `email.indobase.fun` / `email.indobase.in` → deploy host.

---

## Auth model

- Operators use Studio sign-up / sign-in only.
- Public magic-code / password UI on the Email host redirects to Studio.
- Env on Email: `STUDIO_HANDOFF_ONLY=true`, `STUDIO_HANDOFF_SECRET` (≥32 chars).
- Env on Studio: `EMAIL_HANDOFF_SECRET` (or `STUDIO_HANDOFF_SECRET`) +
  `INDOBASE_EMAIL_URL` / `NEXT_PUBLIC_INDOBASE_EMAIL_URL`.

---

## Deploy

Compose: `indobase-email/docker/deploy/docker-compose.yml`

CI builds `roshanraghavander/indobase-email:<git-sha>` on push to `staging` /
`main` (see `.github/workflows/docker-publish.yml`). Deploy with that SHA — do
not ship a local `:latest` build.

```bash
# On deploy host (after CI finishes for $SHA)
cd /opt/indobase-email   # or clone path
cp docker/deploy/.env.example docker/deploy/.env
# edit secrets + EMAIL_HOST / API_ENDPOINT / STUDIO_PUBLIC_URL
# set INDOBASE_EMAIL_IMAGE=roshanraghavander/indobase-email:$SHA
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env pull
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env up -d
```

Studio env (staging/prod):

```bash
INDOBASE_EMAIL_URL=https://email.indobase.fun   # or .in
EMAIL_HANDOFF_SECRET=<same-as-email-STUDIO_HANDOFF_SECRET>
```

Smoke:

```bash
curl -sS https://email.indobase.fun/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://email.indobase.fun/console/signin
# expect redirect / 200 then SPA → Studio
# Splash / title must say Indobase Email (not upstream product name)
```

---

## License / compliance

- **AGPL (Notifuse):** source in `indobase-email/`; see `NOTICE.md` + `LICENCE.md`.
  Corresponding Source for network use is the monorepo path
  `https://github.com/Indobase/Indobase/tree/main/indobase-email`.
- Do not mix AGPL into proprietary Studio/Builder bundles without a deliberate
  boundary (same approach as `indobase-payments/`).
- India DPDP applies to audience/contact data stored by Email.

Upstream fork base: see `indobase-email/UPSTREAM_SHA.txt`.

---

## Out of scope (this ship)

- Postiz / Penpot / OpenCut forks
- Razorpay / Payments changes
