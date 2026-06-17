# Wiring: marketing, Studio, and BaaS API (Indobase SaaS)

This repo ships **Indobase as a SaaS-style product**: the dashboard (Studio) talks to a **control plane** (`/api/platform/*` inside Studio) backed by Postgres + **postgres-meta**, and to your **data plane** (Kong → PostgREST, GoTrue, Realtime, Storage, etc.). Indobase runs as SaaS only—there is no separate hosted platform dashboard mode.

## URL layout (typical)

| Surface | Path / host | Notes |
|--------|----------------|-------|
| Marketing | `/` | Static SPA from `apps/www`, merged into Studio `public/` in the single image |
| Studio | `/dashboard` (or `/` if no base path) | Set `NEXT_PUBLIC_BASE_PATH=/dashboard` when Studio lives under a subpath |
| Control plane API | Same origin `/api/*` | Next.js API routes; not Kong |
| Customer API | `https://api.yourdomain.com` (example: `https://api.indobase.in`) | Kong: `/rest/v1`, `/auth/v1`, `/storage/v1`, etc. |

For one public domain (marketing + Studio + gateway), see **[SINGLE_DOMAIN.md](./SINGLE_DOMAIN.md)**.

## Build-time (`NEXT_PUBLIC_*`)

Set at **build** time for Next.js (Docker `ARG`/`ENV`, or CI build args):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_INDOBASE_SAAS` | Org dashboard, billing, team routes. Defaults **on** unless set to the string `false`. |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the Studio app (e.g. `https://studio.indobase.in` or `https://example.com/dashboard`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Public URL of Kong / API gateway for browser clients. |
| `NEXT_PUBLIC_GOTRUE_URL` | GoTrue base (usually `…/auth/v1`). |
| `NEXT_PUBLIC_BASE_PATH` | e.g. `/dashboard` when Studio is mounted under a path. |
| `NEXT_PUBLIC_DOCS_URL` | Docs link in the UI. |

Studio code gates **managed-product** behavior with **`IS_SAAS`** (from `NEXT_PUBLIC_INDOBASE_SAAS`, default on). Set `NEXT_PUBLIC_INDOBASE_SAAS=false` only for a minimal local dashboard without org/billing routes. `NEXT_PUBLIC_IS_PLATFORM` is legacy-only and ignored by Studio at runtime.

### SaaS env contract (must stay aligned)

Use `docker/.env.example` as the baseline source of truth. For SaaS deploys, keep these values coherent:

- `SITE_URL` and `NEXT_PUBLIC_SITE_URL` must point to the same public Studio origin.
- `SUPABASE_PUBLIC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `API_EXTERNAL_URL` must point to the same public gateway/API origin.
- Internal compose URLs (`http://indobase-kong:8000`, `http://indobase-meta:8080`) are server/container-only and should not be used as public browser URLs.

## Runtime (server / container)

| Variable | Purpose |
|----------|---------|
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_PASSWORD` | Control-plane DB (stores `saas.*` org/project metadata). |
| `STUDIO_PG_META_URL` | Base URL of **postgres-meta** (e.g. `http://meta:8080` on the same Docker network). |
| `PG_META_CRYPTO_KEY` | Must match postgres-meta’s encryption key. |
| `SUPABASE_URL` | Kong (or gateway) URL **reachable from the Studio server** (often internal). |
| `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `AUTH_JWT_SECRET` | Same secrets as your stack. |
| `SUPABASE_PUBLIC_URL` | Public API URL (emails, redirects, CORS-related copy). |

Per-tenant project databases use encrypted connection strings on projects; see **[docker/ENV-FOR-OWN-BACKEND.md](./docker/ENV-FOR-OWN-BACKEND.md)** and **[MULTITENANCY_RLS.md](./MULTITENANCY_RLS.md)** (includes **control-plane `saas.*` RLS**, applied automatically by Studio after base tables exist).

Optional **incident banner**: set `STATUSPAGE_PAGE_ID` and `STATUSPAGE_API_KEY` on Studio for `/api/incident-status`.

## Deploy paths

- **Full stack locally or on a VM:** [docker/README.md](./docker/README.md) and `docker/docker-compose.yml`.
- **Dashboard image only (Dokploy, Railway, etc.):** [docker/DEPLOY-SINGLE-IMAGE.md](./docker/DEPLOY-SINGLE-IMAGE.md).
- **Env reference for the image → your backend:** [docker/ENV-FOR-OWN-BACKEND.md](./docker/ENV-FOR-OWN-BACKEND.md).

## Auth redirects

`site_url` and redirect allow-lists in **GoTrue / `config.toml`** must match the URLs users actually use (Studio sign-in, marketing). See **SINGLE_DOMAIN.md** and your `supabase/config.toml` `[auth]` section.

## Production checklist

See **[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)** (billing, email, Stripe, TLS, backups).
