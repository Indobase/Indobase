# Indobase Design — Penpot engine + Studio SSO

**Hosts:** `design.indobase.fun` (staging smoke) · `design.indobase.in`
(production, canonical) — both Traefik-routed on Vyom `.249`.
**Engine:** upstream [Penpot](https://github.com/penpot/penpot) images
(MPL-2.0, pinned via `PENPOT_VERSION`), with an Indobase branding overlay.
**Source:** `indobase-design/` (see `NOTICE.md` there for MPL-2.0 details).

## Architecture

```
Studio (Open Design)
  └─ GET /api/platform/projects/[ref]/design/launch
       → 302-able URL https://design.indobase.in/sso/launch#token=<HS256 JWT aud=indobase-design>
            └─ design-sso shim (indobase-design/sso-shim, zero-dep Node)
                 1. /sso/launch page posts fragment token to /sso/session
                    → verifies HMAC (DESIGN_HANDOFF_SECRET) → signed 5-min cookie
                 2. page POSTs /api/auth/oauth/oidc (Penpot backend) → provider redirect
                 3. Penpot → /sso/oidc/authorize (shim validates cookie, mints code)
                 4. Penpot backend ⇄ shim internally: /oidc/token, /oidc/userinfo, /oidc/jwks
                 5. Penpot creates/logs in the user (email from Studio claims), sets session
```

- The shim is the **only** OIDC provider Penpot trusts
  (`PENPOT_OIDC_BASE_URI=http://design-sso:8600`).
- Without a verified Studio handoff cookie, `/sso/oidc/authorize` redirects to
  Studio sign-in. Password login + public registration are disabled:
  `PENPOT_FLAGS: enable-login-with-oidc enable-oidc-registration
  disable-login-with-password disable-registration disable-email-verification`.
- Org roles allowed to open Design (same as Email/Social/Payments):
  owner, admin, developer, viewer.
- Penpot accounts are per-user (keyed by Studio GoTrue id via OIDC `sub`);
  Penpot teams are user-managed and not mapped to Studio projects (unlike
  Email workspaces / Social orgs). `project_ref` rides along in the handoff
  payload for future team mapping.

## Branding

`indobase-design/frontend/Dockerfile` wraps `penpotapp/frontend` and runs
`rebrand.sh` at build time: "Penpot" → "Indobase Design" in built JS/HTML
strings, penpot.app links → indobase.in, Indobase favicons, Indobase mark in
the SVG logo sprite, plus `indobase-design.css` overrides. Upstream MPL-2.0
source files are not modified (see `indobase-design/NOTICE.md`).

## Deploy (Vyom .249)

```bash
# 1. Sync source (sparse checkout, same pattern as indobase-social)
git clone --depth 1 --branch staging --filter=blob:none --sparse \
  https://github.com/Indobase/Indobase.git /tmp/ib-design-src
cd /tmp/ib-design-src && git sparse-checkout set indobase-design
rsync -a --delete --exclude docker/deploy/.env \
  /tmp/ib-design-src/indobase-design/ /opt/indobase-design/

# 2. Configure + start
cd /opt/indobase-design/docker/deploy
cp .env.example .env   # fill DESIGN_HANDOFF_SECRET (= Email STUDIO_HANDOFF_SECRET),
                       # OIDC_CLIENT_SECRET, PENPOT_SECRET_KEY, DB_PASSWORD
docker compose -f docker-compose.yml --env-file .env build
docker compose -f docker-compose.yml --env-file .env up -d
```

Studio service env (Swarm `indobase-studio-*` on `.249`):

```bash
INDOBASE_DESIGN_URL=https://design.indobase.in
DESIGN_HANDOFF_SECRET=<same as design .env DESIGN_HANDOFF_SECRET>
```

## Smoke

```bash
curl -sS https://design.indobase.in/sso/health          # {"ok":true,...}
curl -sSI https://design.indobase.in/ | head -3          # 200, Indobase Design HTML
curl -sS https://design.indobase.in/api/health           # penpot backend (via nginx)
# Full flow: Studio → project → Marketing → Open Design
```

## Notes / gaps

- `PENPOT_PUBLIC_URI` is single-valued → canonical host is
  `design.indobase.in`; `design.indobase.fun` serves the same stack but the
  OIDC callback always lands on `.in`.
- SMTP is not configured (email verification disabled; invites by email will
  not send). Configure `PENPOT_SMTP_*` later if team invites are needed.
- Assets are filesystem-backed in the `design_assets` volume — include it in
  VPS backups.
