# Single-domain deployment (indobase.fun)

Deploy the **marketing site**, **Studio**, and **backend** on one domain: **indobase.fun**.

## URL layout

| Path | App | Notes |
|------|-----|--------|
| `/` | Marketing site (SvelteKit) | Landing, docs, blog |
| `/dashboard` | Studio (Next.js) | Dashboard, projects, DB, Auth, Storage |
| `/api` | Backend / Platform API | Your Supabase/Indobase API (Kong, PostgREST, GoTrue, etc.) |

You need a **reverse proxy** (e.g. Nginx, Caddy, or your host’s routing) that:

- Serves **marketing** for `/` (and optionally `/docs`, `/blog`, etc., or let the marketing app handle all non-/dashboard, non-/api).
- Proxies **/dashboard** and **/dashboard/** to the Studio app (Next.js).
- Proxies **/api** (and e.g. **/auth/v1**, **/rest**, **/realtime**, **/storage/v1**) to your backend.

## Env and build config

### Marketing site (apps/www)

- `PUBLIC_APPWRITE_DASHBOARD` = `https://indobase.fun/dashboard` (Studio URL).
- `PUBLIC_APPWRITE_ENDPOINT` = `https://indobase.fun/api/v1` (backend API, if the site calls it).

No base path: the app is served at the root.

### Studio (apps/studio)

- **`NEXT_PUBLIC_BASE_PATH=/dashboard`** so Studio is built and served under `/dashboard`.
- `NEXT_PUBLIC_SITE_URL` = `https://indobase.fun/dashboard` (Studio’s public URL).
- `NEXT_PUBLIC_DOCS_URL` = `https://indobase.fun/docs`.
- Backend vars (`SUPABASE_URL`, `NEXT_PUBLIC_GOTRUE_URL`, etc.) should point to the same domain, e.g.:
  - `NEXT_PUBLIC_GOTRUE_URL` = `https://indobase.fun/auth/v1`
  - Platform API: `https://indobase.fun/api` (or whatever path your gateway exposes).

Build:

```bash
NEXT_PUBLIC_BASE_PATH=/dashboard NEXT_PUBLIC_SITE_URL=https://indobase.fun/dashboard pnpm build --filter=studio
```

### Backend (Supabase stack)

- In **supabase/config.toml** → `[auth]`:
  - **site_url** = `https://indobase.fun/dashboard` (Studio).
  - **additional_redirect_urls** already include `https://indobase.fun/*` and `https://indobase.fun/*/*` for single-domain.

- Kong (or your gateway) in front of GoTrue/PostgREST/etc. should listen on the same domain and route, e.g.:
  - `https://indobase.fun/auth/v1` → GoTrue
  - `https://indobase.fun/rest` → PostgREST
  - `https://indobase.fun/api` → your platform API (if any)

## Summary

- **One domain:** `https://indobase.fun`.
- **Marketing:** `/` (and the paths it handles).
- **Studio:** `/dashboard` with **NEXT_PUBLIC_BASE_PATH=/dashboard** and **NEXT_PUBLIC_SITE_URL=https://indobase.fun/dashboard**.
- **Backend:** under `/api`, `/auth/v1`, `/rest`, etc., via reverse proxy; auth redirect URLs in config point at `https://indobase.fun/*`.
