# How marketing, Studio, and backend are wired

Single-domain setup: **indobase.fun**. See [SINGLE_DOMAIN.md](SINGLE_DOMAIN.md) for deployment and reverse-proxy details.

## URL map

| Path | App | Purpose |
|------|-----|--------|
| `/` | Marketing (apps/www, SvelteKit) | Landing, docs, blog |
| `/dashboard` | Studio (apps/studio, Next.js) | Sign-in, sign-up, projects, DB, Auth, Storage |
| `/dashboard/sign-up` | Studio | Create account (all "Start building" CTAs point here with `?returnTo=/billing/plans`) |
| `/dashboard/sign-in` | Studio | Log in |
| `/api`, `/auth/v1`, `/rest`, … | Backend | Kong, GoTrue, PostgREST, etc. |

## Marketing → Studio

- **apps/www** uses `getAppwriteDashboardUrl(path)` from `$lib/utils/dashboard`.
- Base URL comes from `PUBLIC_APPWRITE_DASHBOARD` or `PUBLIC_INDOBASE_CONSOLE_URL` (default `https://indobase.fun/dashboard`).
- All "Start building" / "Get started" CTAs use `getSignUpUrl()` (sign-up with `returnTo=/billing/plans`) so the flow is: marketing → sign-up → confirm email → sign-in → plan selection → create org → product.

## Studio → backend

- Studio is built with `NEXT_PUBLIC_BASE_PATH=/dashboard`.
- Auth and API URLs point to the same domain (e.g. `https://indobase.fun/auth/v1`, `/api`).
- Auth redirect URLs in backend auth config (e.g. **supabase/config.toml** or your GoTrue config) use `https://indobase.fun/*`.

## Env quick reference

| App | Key | Example |
|-----|-----|--------|
| www | `PUBLIC_APPWRITE_DASHBOARD` | `https://indobase.fun/dashboard` |
| www | `PUBLIC_APPWRITE_ENDPOINT` | `https://indobase.fun/api/v1` |
| studio | `NEXT_PUBLIC_BASE_PATH` | `/dashboard` |
| studio | `NEXT_PUBLIC_SITE_URL` | `https://indobase.fun/dashboard` |
| backend | Auth config `site_url` | `https://indobase.fun/dashboard` |
