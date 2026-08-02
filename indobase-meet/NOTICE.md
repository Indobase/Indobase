# Third-party attribution

Indobase Meet runs self-hosted video conferencing via official Jitsi Docker images
(`jitsi/web`, `jitsi/prosody`, `jitsi/jicofo`, `jitsi/jvb`). This repository does **not**
vendor those trees; see `docker/deploy/docker-compose.yml`. Upstream projects are AGPL-licensed;
source is available from the Jitsi community and image vendors’ compliance channels.

Customer-facing product name is **Indobase Meet** / **Meet**. Do **not** expose “Jitsi”,
“Jitsi Meet”, “8x8”, or “Powered by Jitsi” in user-visible UI, routes, OAuth client display
names, or email footers. Keep this NOTICE (and upstream LICENSE references) in the repo.

## Branding controls we set

- Bridge session SSO only — engine auth/register/password routes redirect to Studio.
- `PUBLIC_URL` / Traefik host = `meet.indobase.in` / `.fun`.
- Interface config: `APP_NAME` / `NATIVE_APP_NAME` = Indobase Meet; watermarks and “Powered by” off.
- Bridge HTML proxy (text/html): title, favicons → `/brand/*`, CSS/JS scrub of residual engine chrome strings.
- Meeting deep links: `/meeting/{meeting-id}` (never engine-branded paths in product chrome).

## Honest Community Edition limits

Compiled engine JS may still contain residual upstream string literals. Phase 1 covers chrome we
control (document title, favicon, loading splash, interfaceConfig, bridge-owned pages). A full
webapp fork is out of Phase 1.
