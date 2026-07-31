# Third-party attribution

Indobase Calendar runs self-hosted scheduling via the official community Docker image
(`calcom/cal.diy`, MIT). Upstream project: https://github.com/calcom/cal.diy — this repository
does **not** vendor that monorepo; see `docker/deploy/docker-compose.yml`. Keep MIT attribution
when distributing the wrapper.

Customer-facing product name is **Indobase Calendar** / **Calendar**. Do **not** expose
“Cal.com”, “cal.diy”, “Cal”, “Calendly”, or “Powered by Cal” in user-visible UI, routes,
OAuth client display names, swagger, emails, or extension manifests. Keep this NOTICE (and
upstream LICENSE references) in the repo.

## Branding controls we set

- Bridge session SSO only — engine auth/register/password/signup routes redirect to Studio.
- `NEXT_PUBLIC_WEBAPP_URL` / Traefik host = `calendar.indobase.in` / `.fun`.
- Bridge HTML proxy (text/html): title, favicons → `/brand/*`, CSS/JS scrub of residual engine chrome strings.
- Product path aliases: `/events`, `/team`, `/settings` (rewritten to engine routes).
- Brand color token ≈ `#3B8FD6` on bridge-owned chrome.

## Honest Community Edition limits

Compiled engine JS may still contain residual upstream string literals. Phase 1 covers chrome we
control (document title, favicon, loading splash, bridge-owned pages, auth redirects). A full
design-system React rewrite is out of Phase 1.
