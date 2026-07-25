# Indobase Social

Status: **Live path** (Studio SSO + `indobase-social/` Postiz fork).

## Open from Studio

1. Sign in to Studio (`studio.indobase.fun` or `studio.indobase.in`).
2. Open a project → **Marketing**.
3. On **Social media posting**, click **Open Social**.
4. Studio mints a short-lived JWT (`aud=indobase-social`) and opens
   `https://social.<domain>/auth/launch#token=…`.
5. Indobase Social verifies the JWT, creates/finds the user + org
   (`org name` = `ib:<project_ref>`), and sets the session cookie.

Org roles (same as Email): **owner, admin, developer, viewer**.

## Hosts

| Env | Social host | Studio | Control plane |
|---|---|---|---|
| Staging | `social.indobase.fun` | `studio.indobase.fun` | Hostinger / Vyom |
| Production | `social.indobase.in` | `studio.indobase.in` | Vyom `103.190.92.249` |

DNS: A records for `social.indobase.fun` / `social.indobase.in` → `.249`
(explicit — do not rely on the `*.indobase.in` tenant wildcard on `.248`).

## Auth

- Operators use Studio sign-up / sign-in only.
- Public email/password UI redirects to Studio when `STUDIO_HANDOFF_ONLY=true`.
- Env on Social: `STUDIO_HANDOFF_SECRET` (≥32 chars), `STUDIO_HANDOFF_ONLY=true`.
- Env on Studio: `SOCIAL_HANDOFF_SECRET` (or shared `STUDIO_HANDOFF_SECRET` /
  `EMAIL_HANDOFF_SECRET`) + `INDOBASE_SOCIAL_URL` /
  `NEXT_PUBLIC_INDOBASE_SOCIAL_URL`.

## Deploy

Compose: `indobase-social/docker/deploy/docker-compose.yml`

CI builds `roshanraghavander/indobase-social:<git-sha>` on push to `staging` /
`main`.

```bash
cd /opt/indobase-social
cp docker/deploy/.env.example docker/deploy/.env
# edit secrets; set INDOBASE_SOCIAL_IMAGE=roshanraghavander/indobase-social:$SHA
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env pull
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env up -d
```

Smoke:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://social.indobase.fun/auth/login
# expect redirect to Studio when STUDIO_HANDOFF_ONLY=true
# Splash / title must say Indobase Social (not Postiz)
```

## License

AGPL-3.0 (Postiz fork). See `indobase-social/NOTICE.md` + `LICENSE`.
Corresponding Source: `https://github.com/Indobase/Indobase/tree/main/indobase-social`.

Upstream fork base: `indobase-social/UPSTREAM_SHA.txt`.

## Social channel OAuth

Platform API keys (X, LinkedIn, etc.) are optional env vars on the Social
compose service — configure when connecting channels. Not required for SSO
smoke.
