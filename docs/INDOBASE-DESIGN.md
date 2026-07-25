# Indobase Design — visual designer + Studio SSO

**Hosts:** `design.indobase.fun` (staging smoke) · `design.indobase.in`
(production, canonical) — both Traefik-routed on Vyom `.249`.  
**Product:** **Indobase Design** (Marketing suite). Engine images are upstream
MPL-2.0 (see `indobase-design/NOTICE.md` — attribution only; UI says Indobase).  
**Source:** `indobase-design/`.

## Architecture

```
Studio (Open Design)
  └─ GET /api/platform/projects/[ref]/design/launch
       → URL https://design.indobase.in/sso/launch#token=<HS256 JWT aud=indobase-design>
            └─ design-sso shim (indobase-design/sso-shim, zero-dep Node)
                 1. /sso/launch page posts fragment token to /sso/session
                    → verifies HMAC (DESIGN_HANDOFF_SECRET) → signed 5-min cookie
                 2. page POSTs /api/auth/oidc?provider=oidc → {redirectUri}
                 3. Browser → /sso/oidc/authorize (shim validates cookie, mints code)
                 4. Design backend ⇄ shim internally: /oidc/token, /oidc/userinfo, /oidc/jwks
                 5. Engine creates/logs in the user (email from Studio claims), sets session
```

- The shim is the **only** OIDC provider the design backend trusts
  (`PENPOT_OIDC_BASE_URI=http://design-sso:8600` — env var name is upstream).
- Without a verified Studio handoff cookie, `/sso/oidc/authorize` redirects to
  Studio sign-in. Password login + public registration are disabled.
- Org roles allowed to open Design (same as Email/Social/Payments):
  owner, admin, developer, viewer.
- Accounts are per-user (keyed by Studio GoTrue id via OIDC `sub`). Teams are
  user-managed inside Design; `project_ref` rides in the handoff payload for
  future 1:1 team mapping (Email/Social already map workspace/org today).

## Branding

`indobase-design/frontend/Dockerfile` wraps the upstream frontend and runs
`rebrand.sh` at build time: product name → **Indobase Design**, upstream links →
indobase.in, Indobase favicons / link-preview, Indobase mark in the SVG logo
sprite, theme-color `#161616`, `application-name` / apple title, plus
`indobase-design.css` (gold primary actions). Upstream MPL-2.0 source files are
not modified (see `indobase-design/NOTICE.md`).

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

# 3. Traefik file provider (container DNS — preferred over stale IPs)
cp ../traefik/indobase-design.yml /etc/dokploy/traefik/dynamic/indobase-design.yml
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
# Full flow: Studio → project → Marketing → Open Design
```

## Notes / gaps

- Public URI is single-valued → canonical host is `design.indobase.in`;
  `design.indobase.fun` serves the same stack but OIDC callbacks land on `.in`.
- SMTP is not configured (email verification disabled; invites by email will
  not send). Configure SMTP later if team invites are needed.
- Assets are filesystem-backed in the `design_assets` volume — include it in
  VPS backups.
- Project ↔ Design team 1:1 mapping is not yet automated (handoff carries
  `project_ref` for a follow-up).
